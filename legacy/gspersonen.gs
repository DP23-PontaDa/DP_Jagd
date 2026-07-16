const PERS_SHEET_NAME = 'Personen';
const PERS_JG_SHEET_NAME = 'Jagdgäste';

const PERS_HEADERS = ['ID_Name', 'Vorname', 'Nachname', 'KJ_Nr', 'Adresse', 'PLZ', 'Ort', 'Name_Kat', 'Aktiv', 'Jagdgastkarte', 'Jäger_Gast'];
const PERS_JG_HEADERS = ['ID_JG_Jahr', 'ID_Name', 'Jahr', 'Aktiv', 'Jäger_Gast', 'Bemerkung'];
const PERS_NAME_KAT_VALUES = ['Mitglied', 'Jagdgast', 'Jagdgastkarten', 'Hegering'];

function persIsJagdKategorie_(nameKat) {
  return nameKat === 'Jagdgast';
}

/**
 * Optional einmal manuell ausführen.
 * Die Web App ruft diese Funktion NICHT beim Laden auf.
 */
function persSetupPersonenSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Keine aktive Tabelle gefunden. Das Script muss mit der Google-Tabelle verbunden sein.');

  const personenSheet = persGetOrCreateSheet_(ss, PERS_SHEET_NAME);
  const jagdSheet = persGetOrCreateSheet_(ss, PERS_JG_SHEET_NAME);

  persWriteHeaderIfNeeded_(personenSheet, PERS_HEADERS);
  persWriteHeaderIfNeeded_(jagdSheet, PERS_JG_HEADERS);

  persApplyValidationToExistingPersonRows_(personenSheet);
  persApplyValidationToExistingJagdgastRows_(jagdSheet);

  return 'Setup abgeschlossen';
}

/**
 * Haupt-Ladefunktion der Web App.
 * Optimiert: liest nur bis zur letzten wirklich befüllten ID-Zeile.
 */
function persGetInitialData() {
  try {
    const data = persReadData_();
    return {
      currentYear: new Date().getFullYear(),
      personen: data.personen,
      jagdgaeste: data.jagdgaeste
    };
  } catch (err) {
    throw new Error('persGetInitialData: ' + persErrorMessage_(err));
  }
}

/** Für Diagnose in Apps Script manuell ausführbar. */
function persDebugPersonen() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) return { ok: false, error: 'Keine aktive Tabelle gefunden.' };

  const personenSheet = ss.getSheetByName(PERS_SHEET_NAME);
  const jagdSheet = ss.getSheetByName(PERS_JG_SHEET_NAME);

  return {
    ok: true,
    spreadsheetName: ss.getName(),
    personenSheetExists: !!personenSheet,
    jagdSheetExists: !!jagdSheet,
    personenMaxRows: personenSheet ? personenSheet.getMaxRows() : 0,
    jagdMaxRows: jagdSheet ? jagdSheet.getMaxRows() : 0,
    personenLastIdRow: personenSheet ? persFindLastUsedRowByColumns_(personenSheet, [1]) : 0,
    jagdLastIdRow: jagdSheet ? persFindLastUsedRowByColumns_(jagdSheet, [1, 2]) : 0,
    counts: {
      personen: persGetInitialData().personen.length,
      jagdgaeste: persGetInitialData().jagdgaeste.length
    }
  };
}

function persGetPersonenData() {
  return persGetInitialData();
}

function persGetPersonen() {
  return persGetInitialData().personen;
}

/** Die neue HTML-Version nutzt keine ID-Generierung. */
function persGenerateIdName() {
  throw new Error('ID-Generierung ist deaktiviert. Bitte ID_Name manuell eingeben.');
}

function persSavePerson(payload) {
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(10000)) {
    throw new Error('Die Tabelle ist gerade gesperrt. Bitte in ein paar Sekunden erneut speichern.');
  }

  try {
    if (!payload || !payload.person) throw new Error('Keine Personendaten empfangen.');

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) throw new Error('Keine aktive Tabelle gefunden.');

    const personenSheet = persGetOrCreateSheet_(ss, PERS_SHEET_NAME);
    const jagdSheet = persGetOrCreateSheet_(ss, PERS_JG_SHEET_NAME);
    persWriteHeaderIfNeeded_(personenSheet, PERS_HEADERS);
    persWriteHeaderIfNeeded_(jagdSheet, PERS_JG_HEADERS);

    const mode = payload.mode === 'edit' ? 'edit' : 'add';
    const person = persNormalizePerson_(payload.person);
    const originalIdName = String(payload.originalIdName || person.originalIdName || person.idName || '').trim();

    persValidatePerson_(person);

    const targetRowNum = mode === 'edit' ? persFindRowById_(personenSheet, originalIdName, 1) : 0;
    const rowWithNewId = persFindRowById_(personenSheet, person.idName, 1);

    if (mode === 'add' && rowWithNewId > 0) {
      throw new Error('ID_Name ist bereits vorhanden: ' + person.idName);
    }

    if (mode === 'edit' && targetRowNum === 0) {
      throw new Error('Person nicht gefunden: ' + originalIdName);
    }

    if (mode === 'edit' && person.idName !== originalIdName && rowWithNewId > 0) {
      throw new Error('ID_Name ist bereits vorhanden: ' + person.idName);
    }

    let jagdRows = [];
    if (persIsJagdKategorie_(person.nameKat)) {
      jagdRows = persNormalizeJagdgastRows_(person.idName, payload.jagdgaeste || []);
      person.aktiv = persHasActiveCurrentYear_(jagdRows);
      persValidateJagdgastMemberRefs_(jagdRows, person.idName);
      person.jaegerGast = '';
    } else {
      jagdRows = [];
    }

    if (person.nameKat === 'Jagdgastkarten') {
      persValidateSingleJaegerGastRef_(person.jaegerGast, person.idName);
    } else if (person.nameKat !== 'Jagdgastkarten') {
      person.jaegerGast = '';
    }

    const row = [
      person.idName,
      person.vorname,
      person.nachname,
      person.kjNr,
      person.adresse,
      person.plz,
      person.ort,
      person.nameKat,
      person.aktiv,
      person.jagdgastkarte,
      person.jaegerGast
    ];

    if (mode === 'edit') {
      personenSheet.getRange(targetRowNum, 1, 1, PERS_HEADERS.length).setValues([row]);
      persApplyValidationToPersonRow_(personenSheet, targetRowNum);

      if (originalIdName !== person.idName) {
        persUpdateJaegerGastReferences_(originalIdName, person.idName);
      }
    } else {
      personenSheet.appendRow(row);
      persApplyValidationToPersonRow_(personenSheet, personenSheet.getLastRow());
    }

    if (persIsJagdKategorie_(person.nameKat)) {
      persReplaceJagdgastRowsForPerson_(originalIdName, person.idName, jagdRows);
    } else {
      persDeleteJagdgastRowsForPerson_(originalIdName);
      if (originalIdName !== person.idName) {
        persDeleteJagdgastRowsForPerson_(person.idName);
      }
    }

    return persGetInitialData();
  } catch (err) {
    throw new Error('persSavePerson: ' + persErrorMessage_(err));
  } finally {
    lock.releaseLock();
  }
}

function persSavePersonWithJagdgastJahre(person, jahre, mode) {
  return persSavePerson({
    mode: mode || 'add',
    originalIdName: person && person.originalIdName,
    person: person,
    jagdgaeste: jahre || []
  });
}

function persDeletePerson(idName) {
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(10000)) {
    throw new Error('Die Tabelle ist gerade gesperrt. Bitte in ein paar Sekunden erneut löschen.');
  }

  try {
    idName = String(idName || '').trim();
    if (!idName) throw new Error('ID_Name fehlt.');

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) throw new Error('Keine aktive Tabelle gefunden.');

    const personenSheet = persGetOrCreateSheet_(ss, PERS_SHEET_NAME);
    persWriteHeaderIfNeeded_(personenSheet, PERS_HEADERS);

    const rowNum = persFindRowById_(personenSheet, idName, 1);
    if (rowNum === 0) {
      return { status: 'not_found', data: persGetInitialData() };
    }

    personenSheet.deleteRow(rowNum);
    persDeleteJagdgastRowsForPerson_(idName);
    persClearJaegerGastReferences_(idName);

    return { status: 'success', data: persGetInitialData() };
  } catch (err) {
    throw new Error('persDeletePerson: ' + persErrorMessage_(err));
  } finally {
    lock.releaseLock();
  }
}

function persDeletePersonAndReturnData(idName) {
  const result = persDeletePerson(idName);
  const data = result.data || persGetInitialData();
  data.status = result.status;
  return data;
}

function persSyncJagdgastAktivAktuellesJahr() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Keine aktive Tabelle gefunden.');

  const personenSheet = persGetOrCreateSheet_(ss, PERS_SHEET_NAME);
  persWriteHeaderIfNeeded_(personenSheet, PERS_HEADERS);

  const data = persReadData_();
  const idToActive = {};
  data.personen.forEach(function(p) {
    if (persIsJagdKategorie_(p.nameKat)) idToActive[p.idName] = p.aktiv;
  });

  const lastRow = persFindLastUsedRowByColumns_(personenSheet, [1]);
  if (lastRow < 2) return 'success';

  const values = personenSheet.getRange(2, 1, lastRow - 1, PERS_HEADERS.length).getValues();
  let changed = false;

  values.forEach(function(row) {
    const idName = String(row[0] || '').trim();
    const nameKat = String(row[7] || '').trim();
    if (persIsJagdKategorie_(nameKat) && Object.prototype.hasOwnProperty.call(idToActive, idName)) {
      if (row[8] !== idToActive[idName]) {
        row[8] = idToActive[idName];
        changed = true;
      }
    }
  });

  if (changed) {
    personenSheet.getRange(2, 1, values.length, PERS_HEADERS.length).setValues(values);
  }

  return 'success';
}

function persReadData_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Keine aktive Tabelle gefunden.');

  const personenSheet = persGetOrCreateSheet_(ss, PERS_SHEET_NAME);
  const jagdSheet = persGetOrCreateSheet_(ss, PERS_JG_SHEET_NAME);
  persWriteHeaderIfNeeded_(personenSheet, PERS_HEADERS);
  persWriteHeaderIfNeeded_(jagdSheet, PERS_JG_HEADERS);

  const personenValues = persReadUsedRows_(personenSheet, PERS_HEADERS.length, [1]);
  const jagdValues = persReadUsedRows_(jagdSheet, PERS_JG_HEADERS.length, [1, 2]);

  const currentYear = new Date().getFullYear();
  const activeJagdgastIds = new Set();

  const jagdgaeste = jagdValues
    .filter(function(row) { return String(row[1] || '').trim() !== ''; })
    .map(function(row) {
      const item = {
        idJgJahr: String(row[0] || '').trim(),
        idName: String(row[1] || '').trim(),
        jahr: row[2] === '' ? '' : Number(row[2]),
        aktiv: row[3] === true || String(row[3]).toUpperCase() === 'TRUE',
        jaegerGast: String(row[4] || '').trim(),
        bemerkung: String(row[5] || '').trim()
      };

      if (Number(item.jahr) === currentYear && item.aktiv === true) {
        activeJagdgastIds.add(item.idName);
      }

      return item;
    });

  const personen = personenValues
    .filter(function(row) { return String(row[0] || '').trim() !== ''; })
    .map(function(row) {
      const idName = String(row[0] || '').trim();
      const nameKat = String(row[7] || '').trim();
      let aktiv = row[8] === true || String(row[8]).toUpperCase() === 'TRUE';

      if (persIsJagdKategorie_(nameKat)) {
        aktiv = activeJagdgastIds.has(idName);
      }

      return {
        idName: idName,
        vorname: String(row[1] || '').trim(),
        nachname: String(row[2] || '').trim(),
        kjNr: String(row[3] || '').trim(),
        adresse: String(row[4] || '').trim(),
        plz: String(row[5] || '').trim(),
        ort: String(row[6] || '').trim(),
        nameKat: nameKat,
        aktiv: aktiv,
        jagdgastkarte: String(row[9] || '').trim(),
        jaegerGast: String(row[10] || '').trim()
      };
    });

  return { personen: personen, jagdgaeste: jagdgaeste };
}

function persReadUsedRows_(sheet, width, keyColumns) {
  const lastRow = persFindLastUsedRowByColumns_(sheet, keyColumns);
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, width).getValues();
}

function persFindLastUsedRowByColumns_(sheet, keyColumns) {
  const maxRows = sheet.getMaxRows();
  if (maxRows < 2) return 1;

  let lastUsed = 1;

  keyColumns.forEach(function(col) {
    const range = sheet.getRange(2, col, maxRows - 1, 1);
    const found = range.createTextFinder('\\S')
      .useRegularExpression(true)
      .findAll();

    found.forEach(function(cell) {
      const row = cell.getRow();
      if (row > lastUsed) lastUsed = row;
    });
  });

  return lastUsed;
}

function persNormalizePerson_(person) {
  return {
    idName: String(person.idName || person.id || '').trim(),
    originalIdName: String(person.originalIdName || '').trim(),
    vorname: String(person.vorname || '').trim(),
    nachname: String(person.nachname || '').trim(),
    kjNr: String(person.kjNr || '').trim(),
    jagdgastkarte: String(person.jagdgastkarte || '').trim(),
    jaegerGast: String(person.jaegerGast || '').trim(),
    adresse: String(person.adresse || '').trim(),
    plz: String(person.plz || '').trim(),
    ort: String(person.ort || '').trim(),
    nameKat: String(person.nameKat || '').trim(),
    aktiv: person.aktiv === true || String(person.aktiv).toUpperCase() === 'TRUE'
  };
}

function persValidatePerson_(person) {
  if (!person.idName) throw new Error('ID_Name fehlt.');
  if (!person.vorname) throw new Error('Vorname fehlt.');
  if (!person.nachname) throw new Error('Nachname fehlt.');
  if (PERS_NAME_KAT_VALUES.indexOf(person.nameKat) === -1) {
    throw new Error('Name_Kat ist ungültig. Erlaubt: Mitglied, Jagdgast, Jagdgastkarten, Hegering.');
  }
}

function persNormalizeJagdgastRows_(idName, rows) {
  const seenYears = new Set();
  const cleaned = [];

  rows.forEach(function(row) {
    const jahr = Number(row.jahr);
    if (!jahr) return;
    if (jahr < 1900 || jahr > 2999) throw new Error('Ungültiges Jahr: ' + row.jahr);
    if (seenYears.has(jahr)) throw new Error('Das Jahr ' + jahr + ' ist beim Jagdgast doppelt erfasst.');
    seenYears.add(jahr);

    cleaned.push({
      idJgJahr: String(row.idJgJahr || '').trim(),
      idName: idName,
      jahr: jahr,
      aktiv: row.aktiv === true || String(row.aktiv).toUpperCase() === 'TRUE',
      jaegerGast: String(row.jaegerGast || '').trim(),
      bemerkung: String(row.bemerkung || '').trim()
    });
  });

  cleaned.sort(function(a, b) { return a.jahr - b.jahr; });
  return cleaned;
}

function persGetActiveMemberIds_() {
  const data = persReadData_();
  const activeMembers = new Set();

  data.personen.forEach(function(p) {
    if (p.nameKat === 'Mitglied' && p.aktiv === true) {
      activeMembers.add(p.idName);
    }
  });

  return activeMembers;
}

function persValidateSingleJaegerGastRef_(jaegerGast, currentPersonId) {
  jaegerGast = String(jaegerGast || '').trim();
  if (!jaegerGast) return;

  const activeMembers = persGetActiveMemberIds_();

  if (!activeMembers.has(jaegerGast)) {
    throw new Error('Jäger_Gast muss ein aktives Mitglied sein. Ungültig: ' + jaegerGast);
  }

  if (jaegerGast === currentPersonId) {
    throw new Error('Jäger_Gast darf nicht dieselbe Person sein.');
  }
}

function persValidateJagdgastMemberRefs_(jahre, currentPersonId) {
  const activeMembers = persGetActiveMemberIds_();

  jahre.forEach(function(row) {
    if (row.jaegerGast && !activeMembers.has(row.jaegerGast)) {
      throw new Error('Jäger_Gast muss ein aktives Mitglied sein. Ungültig: ' + row.jaegerGast);
    }
    if (row.jaegerGast && row.jaegerGast === currentPersonId) {
      throw new Error('Jäger_Gast darf nicht dieselbe Person wie der Jagdgast sein.');
    }
  });
}

function persHasActiveCurrentYear_(jahre) {
  const currentYear = new Date().getFullYear();
  return jahre.some(function(row) {
    return Number(row.jahr) === currentYear && row.aktiv === true;
  });
}

function persReplaceJagdgastRowsForPerson_(oldIdName, newIdName, newRows) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = persGetOrCreateSheet_(ss, PERS_JG_SHEET_NAME);
  persWriteHeaderIfNeeded_(sheet, PERS_JG_HEADERS);

  oldIdName = String(oldIdName || '').trim();
  newIdName = String(newIdName || '').trim();

  const values = persReadUsedRows_(sheet, PERS_JG_HEADERS.length, [1, 2]);
  const keepRows = [];
  const existingIdByYear = {};
  const usedJgIds = new Set();

  values.forEach(function(row) {
    const rowIdJgJahr = String(row[0] || '').trim();
    const rowIdName = String(row[1] || '').trim();
    const rowYear = Number(row[2]);

    if (rowIdJgJahr) usedJgIds.add(rowIdJgJahr);

    if (rowIdName === oldIdName || rowIdName === newIdName) {
      if (rowYear && rowIdJgJahr) existingIdByYear[rowYear] = rowIdJgJahr;
    } else if (rowIdName) {
      keepRows.push(row);
    }
  });

  const insertRows = newRows.map(function(row) {
    let idJgJahr = row.idJgJahr || existingIdByYear[row.jahr] || '';
    if (!idJgJahr) idJgJahr = persNextJagdgastId_(usedJgIds);
    usedJgIds.add(idJgJahr);
    return [idJgJahr, newIdName, row.jahr, row.aktiv, row.jaegerGast, row.bemerkung];
  });

  persRewriteJagdgastBody_(sheet, keepRows.concat(insertRows));
}

function persDeleteJagdgastRowsForPerson_(idName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = persGetOrCreateSheet_(ss, PERS_JG_SHEET_NAME);
  persWriteHeaderIfNeeded_(sheet, PERS_JG_HEADERS);

  idName = String(idName || '').trim();
  const values = persReadUsedRows_(sheet, PERS_JG_HEADERS.length, [1, 2]);
  const keepRows = values.filter(function(row) {
    return String(row[1] || '').trim() !== idName;
  });

  persRewriteJagdgastBody_(sheet, keepRows);
}

function persRewriteJagdgastBody_(sheet, rows) {
  const lastRow = persFindLastUsedRowByColumns_(sheet, [1, 2]);
  if (lastRow >= 2) {
    sheet.getRange(2, 1, lastRow - 1, PERS_JG_HEADERS.length).clearContent();
  }
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, PERS_JG_HEADERS.length).setValues(rows);
    persApplyValidationToJagdgastRows_(sheet, rows.length);
  }
}

function persUpdateJaegerGastReferences_(oldIdName, newIdName) {
  oldIdName = String(oldIdName || '').trim();
  newIdName = String(newIdName || '').trim();
  if (!oldIdName || !newIdName || oldIdName === newIdName) return;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = persGetOrCreateSheet_(ss, PERS_JG_SHEET_NAME);
  persWriteHeaderIfNeeded_(sheet, PERS_JG_HEADERS);

  const values = persReadUsedRows_(sheet, PERS_JG_HEADERS.length, [1, 2]);
  let changed = false;

  values.forEach(function(row) {
    if (String(row[4] || '').trim() === oldIdName) {
      row[4] = newIdName;
      changed = true;
    }
  });

  if (changed) persRewriteJagdgastBody_(sheet, values);

  persUpdatePersonenJaegerGastReference_(oldIdName, newIdName);
}

function persClearJaegerGastReferences_(idName) {
  idName = String(idName || '').trim();
  if (!idName) return;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = persGetOrCreateSheet_(ss, PERS_JG_SHEET_NAME);
  persWriteHeaderIfNeeded_(sheet, PERS_JG_HEADERS);

  const values = persReadUsedRows_(sheet, PERS_JG_HEADERS.length, [1, 2]);
  let changed = false;

  values.forEach(function(row) {
    if (String(row[4] || '').trim() === idName) {
      row[4] = '';
      changed = true;
    }
  });

  if (changed) persRewriteJagdgastBody_(sheet, values);

  persUpdatePersonenJaegerGastReference_(idName, '');
}

function persUpdatePersonenJaegerGastReference_(oldIdName, newIdName) {
  oldIdName = String(oldIdName || '').trim();
  newIdName = String(newIdName || '').trim();
  if (!oldIdName) return;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = persGetOrCreateSheet_(ss, PERS_SHEET_NAME);
  persWriteHeaderIfNeeded_(sheet, PERS_HEADERS);

  const lastRow = persFindLastUsedRowByColumns_(sheet, [1]);
  if (lastRow < 2) return;

  const values = sheet.getRange(2, 1, lastRow - 1, PERS_HEADERS.length).getValues();
  let changed = false;

  values.forEach(function(row) {
    if (String(row[10] || '').trim() === oldIdName) {
      row[10] = newIdName;
      changed = true;
    }
  });

  if (changed) {
    sheet.getRange(2, 1, values.length, PERS_HEADERS.length).setValues(values);
  }
}

function persNextJagdgastId_(usedIds) {
  for (let i = 1; i <= 99999; i++) {
    const id = 'JG' + String(i).padStart(3, '0');
    if (!usedIds.has(id)) return id;
  }
  throw new Error('Keine freie ID_JG_Jahr gefunden.');
}

function persFindRowById_(sheet, id, colIndex) {
  const target = String(id || '').trim();
  if (!target) return 0;

  const lastRow = persFindLastUsedRowByColumns_(sheet, [colIndex]);
  if (lastRow < 2) return 0;

  const values = sheet.getRange(2, colIndex, lastRow - 1, 1).getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0] || '').trim() === target) {
      return i + 2;
    }
  }

  return 0;
}

function persGetOrCreateSheet_(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function persWriteHeaderIfNeeded_(sheet, headers) {
  const current = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  let needsHeader = false;

  for (let i = 0; i < headers.length; i++) {
    if (String(current[i] || '').trim() !== headers[i]) {
      needsHeader = true;
      break;
    }
  }

  if (needsHeader) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
}

function persApplyValidationToExistingPersonRows_(sheet) {
  const lastRow = Math.max(2, persFindLastUsedRowByColumns_(sheet, [1]) + 20);
  const rowCount = lastRow - 1;
  const nameKatRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(PERS_NAME_KAT_VALUES, true)
    .setAllowInvalid(false)
    .build();

  sheet.getRange(2, 8, rowCount, 1).setDataValidation(nameKatRule);
  sheet.getRange(2, 9, rowCount, 1).insertCheckboxes();
  sheet.autoResizeColumns(1, PERS_HEADERS.length);
}

function persApplyValidationToPersonRow_(sheet, rowNum) {
  const nameKatRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(PERS_NAME_KAT_VALUES, true)
    .setAllowInvalid(false)
    .build();

  sheet.getRange(rowNum, 8).setDataValidation(nameKatRule);
  sheet.getRange(rowNum, 9).insertCheckboxes();
}

function persApplyValidationToExistingJagdgastRows_(sheet) {
  const lastRow = Math.max(2, persFindLastUsedRowByColumns_(sheet, [1, 2]) + 20);
  const rowCount = lastRow - 1;
  sheet.getRange(2, 4, rowCount, 1).insertCheckboxes();
  sheet.autoResizeColumns(1, PERS_JG_HEADERS.length);
}

function persApplyValidationToJagdgastRows_(sheet, bodyRowCount) {
  if (bodyRowCount <= 0) return;
  sheet.getRange(2, 4, bodyRowCount, 1).insertCheckboxes();
}

function persErrorMessage_(err) {
  if (!err) return 'Unbekannter Fehler';
  if (err.message) return err.message;
  return String(err);
}