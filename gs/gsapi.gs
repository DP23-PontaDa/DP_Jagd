// gsapi.gs
function doGet(e) {
  var payload = {
    ok: true,
    app: "DP_Jagd V2 API",
    time: new Date().toISOString()
  };

  return jsonResponse_(payload);
}

function doPost(e) {
  try {
    var body = parseRequestBody_(e);
    var action = String(body.action || "").trim();

    if (!action) {
      return jsonResponse_({ ok: false, error: "Action fehlt." });
    }

    var result = dispatchAction_(action, body);
    return jsonResponse_(result);
  } catch (err) {
    return jsonResponse_({
      ok: false,
      error: err && err.message ? err.message : String(err)
    });
  }
}

function dispatchAction_(action, body) {
  switch (action) {
    case "auth.login":
      return authLogin_(body);
    case "auth.session":
      return authSession_(body);
    case "auth.logout":
      return authLogout_(body);
    default:
      throw new Error("Unbekannte Aktion: " + action);
  }
}

function parseRequestBody_(e) {
  if (!e) return {};
  if (e.postData && e.postData.contents) {
    try {
      return JSON.parse(e.postData.contents);
    } catch (err) {
      throw new Error("Ungültiger JSON-Body.");
    }
  }

  var obj = {};
  if (e.parameter) {
    Object.keys(e.parameter).forEach(function (key) {
      obj[key] = e.parameter[key];
    });
  }
  return obj;
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
