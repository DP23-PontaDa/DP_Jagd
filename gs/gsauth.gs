// gsauth.gs
var DPJAGD_AUTH_SHEET_NAME = "Benutzer";
var DPJAGD_SESSION_TTL_HOURS = 12;

function authLogin_(body) {
  var login = normalizeLogin_(body.username || body.login || "");
  var password = String(body.password || "");

  if (!login) throw new Error("Benutzername fehlt.");
  if (!password) throw new Error("Passwort fehlt.");

  var sheet = ensureBenutzerSheet_();
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) {
    bootstrapUsersIfConfigured_();
    data = sheet.getDataRange().getValues();
  }

  var row = findUserRow_(data, login);
  if (!row) throw new Error("Benutzer nicht gefunden.");

  var header = data[0];
  var record = row.record;

  if (String(record[headerIndex_(header, "Aktiv")] || "").toUpperCase() === "FALSE") {
    throw new Error("Benutzer ist deaktiviert.");
  }

  var salt = String(record[headerIndex_(header, "Salt")] || "");
  var storedHash = String(record[headerIndex_(header, "PasswortHash")] || "");

  if (!salt || !storedHash) {
    throw new Error("Passwort ist nicht konfiguriert.");
  }

  var calcHash = hashPassword_(password, salt);
  if (!safeEquals_(calcHash, storedHash)) {
    throw new Error("Anmeldedaten sind ungültig.");
  }

  var now = new Date();
  var expiresAt = new Date(now.getTime() + DPJAGD_SESSION_TTL_HOURS * 60 * 60 * 1000);
  var token = createSessionToken_();

  updateUserSession_(sheet, row.rowNumber, {
    sessionToken: token,
    sessionExpiresAt: expiresAt,
    lastLoginAt: now,
    updatedAt: now
  });

  return {
    ok: true,
    user: userFromRecord_(record, header),
    session: {
      token: token,
      expiresAt: expiresAt.toISOString()
    }
  };
}

function authSession_(body) {
  var token = String(body.token || "").trim();
  if (!token) throw new Error("Token fehlt.");

  var match = findUserBySessionToken_(token);
  if (!match) throw new Error("Session ungültig.");

  var now = new Date();
  if (match.expiresAt.getTime() <= now.getTime()) {
    clearSessionForRow_(match.sheet, match.rowNumber);
    throw new Error("Session abgelaufen.");
  }

  return {
    ok: true,
    user: userFromRecord_(match.record, match.header),
    session: {
      token: token,
      expiresAt: match.expiresAt.toISOString()
    }
  };
}

function authLogout_(body) {
  var token = String(body.token || "").trim();
  if (!token) {
    return { ok: true };
  }

  var match = findUserBySessionToken_(token);
  if (match) {
    clearSessionForRow_(match.sheet, match.rowNumber);
  }

  return { ok: true };
}

function ensureBenutzerSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(DPJAGD_AUTH_SHEET_NAME) || ss.insertSheet(DPJAGD_AUTH_SHEET_NAME);

  var headers = [
    "Aktiv",
    "Benutzername",
    "Email",
    "Name",
    "Rolle",
    "PasswortHash",
    "Salt",
    "SessionToken",
    "SessionExpiresAt",
    "LastLoginAt",
    "LastLogoutAt",
    "CreatedAt",
    "UpdatedAt"
  ];

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  } else {
    var existing = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    if (existing.join("|") !== headers.join("|")) {
      var range = sheet.getRange(1, 1, 1, headers.length);
      range.setValues([headers]);
    }
  }

  return sheet;
}

function bootstrapUsersIfConfigured_() {
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty("DPJAGD_BOOTSTRAP_USERS_JSON");
  if (!raw) return;

  var list;
  try {
    list = JSON.parse(raw);
  } catch (err) {
    throw new Error("DPJAGD_BOOTSTRAP_USERS_JSON ist ungültig.");
  }

  if (!list || !list.length) return;

  var sheet = ensureBenutzerSheet_();
  var data = sheet.getDataRange().getValues();
  if (data.length > 1) return;

  var now = new Date();
  var rows = list.map(function (u) {
    var login = normalizeLogin_(u.username || u.login || u.email || "");
    var salt = String(u.salt || createSalt_());
    var password = String(u.password || "");
    var hash = String(u.passwordHash || (password ? hashPassword_(password, salt) : ""));
    if (!login) throw new Error("Bootstrap-Benutzer benötigt username/login/email.");
    if (!hash) throw new Error("Bootstrap-Benutzer benötigt password oder passwordHash.");

    return [
      true,
      login,
      String(u.email || login),
      String(u.name || login),
      String(u.role || "Benutzer"),
      hash,
      salt,
      "",
      "",
      "",
      "",
      now,
      now
    ];
  });

  sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
}

function findUserRow_(data, login) {
  var header = data[0];
  var userIdx = headerIndex_(header, "Benutzername");
  var emailIdx = headerIndex_(header, "Email");

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var rowLogin = normalizeLogin_(row[userIdx]);
    var rowEmail = normalizeLogin_(row[emailIdx]);
    if (rowLogin === login || rowEmail === login) {
      return { rowNumber: i + 1, record: row };
    }
  }

  return null;
}

function findUserBySessionToken_(token) {
  var sheet = ensureBenutzerSheet_();
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return null;

  var header = data[0];
  var tokenIdx = headerIndex_(header, "SessionToken");
  var expiresIdx = headerIndex_(header, "SessionExpiresAt");

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (String(row[tokenIdx] || "") === token) {
      var expiresAt = row[expiresIdx] ? new Date(row[expiresIdx]) : new Date(0);
      return {
        sheet: sheet,
        rowNumber: i + 1,
        record: row,
        header: header,
        expiresAt: expiresAt
      };
    }
  }

  return null;
}

function updateUserSession_(sheet, rowNumber, values) {
  var data = sheet.getDataRange().getValues();
  var header = data[0];
  var updates = [];

  updates.push({ col: headerIndex_(header, "SessionToken") + 1, value: values.sessionToken || "" });
  updates.push({ col: headerIndex_(header, "SessionExpiresAt") + 1, value: values.sessionExpiresAt || "" });
  updates.push({ col: headerIndex_(header, "LastLoginAt") + 1, value: values.lastLoginAt || "" });
  updates.push({ col: headerIndex_(header, "LastLogoutAt") + 1, value: values.lastLogoutAt || "" });
  updates.push({ col: headerIndex_(header, "UpdatedAt") + 1, value: values.updatedAt || "" });

  updates.forEach(function (item) {
    sheet.getRange(rowNumber, item.col).setValue(item.value);
  });
}

function clearSessionForRow_(sheet, rowNumber) {
  var data = sheet.getDataRange().getValues();
  var header = data[0];
  sheet.getRange(rowNumber, headerIndex_(header, "SessionToken") + 1).setValue("");
  sheet.getRange(rowNumber, headerIndex_(header, "SessionExpiresAt") + 1).setValue("");
  sheet.getRange(rowNumber, headerIndex_(header, "LastLogoutAt") + 1).setValue(new Date());
  sheet.getRange(rowNumber, headerIndex_(header, "UpdatedAt") + 1).setValue(new Date());
}

function userFromRecord_(record, header) {
  return {
    active: String(record[headerIndex_(header, "Aktiv")] || "").toUpperCase() !== "FALSE",
    username: String(record[headerIndex_(header, "Benutzername")] || ""),
    email: String(record[headerIndex_(header, "Email")] || ""),
    name: String(record[headerIndex_(header, "Name")] || ""),
    role: String(record[headerIndex_(header, "Rolle")] || "Benutzer")
  };
}

function normalizeLogin_(value) {
  return String(value || "").trim().toLowerCase();
}

function headerIndex_(header, name) {
  for (var i = 0; i < header.length; i++) {
    if (String(header[i]).trim() === name) return i;
  }
  throw new Error("Spalte fehlt: " + name);
}

function createSessionToken_() {
  return Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
}

function createSalt_() {
  return Utilities.getUuid().replace(/-/g, "");
}

function hashPassword_(password, salt) {
  var digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    salt + ":" + password,
    Utilities.Charset.UTF_8
  );
  return bytesToHex_(digest);
}

function bytesToHex_(bytes) {
  var out = [];
  for (var i = 0; i < bytes.length; i++) {
    var byte = bytes[i];
    if (byte < 0) byte += 256;
    var hex = byte.toString(16);
    if (hex.length === 1) hex = "0" + hex;
    out.push(hex);
  }
  return out.join("");
}

function safeEquals_(a, b) {
  a = String(a || "");
  b = String(b || "");
  if (a.length !== b.length) return false;
  var result = 0;
  for (var i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
