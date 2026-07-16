(function (window) {
  "use strict";

  var bridgeIframe = null;
  var bridgeReady = false;
  var bridgeReadyPromise = null;
  var bridgeReadyResolve = null;
  var bridgeReadyReject = null;
  var bridgeReadyTimeout = null;
  var activeApiUrl = "";
  var requestCounter = 0;
  var pendingRequests = {};
  var messageListenerInstalled = false;

  function getConfig() {
    return window.DPJagdConfig;
  }

  function normalizeUrl(value) {
    return String(value || "").trim().replace(/\/+$/, "");
  }

  function buildBridgeUrl(apiUrl) {
    var origin = window.location.origin || "";
    var separator = apiUrl.indexOf("?") === -1 ? "?" : "&";
    return apiUrl + separator + "bridge=1&origin=" + encodeURIComponent(origin);
  }

  function removeBridgeIframe() {
    if (bridgeIframe && bridgeIframe.parentNode) {
      bridgeIframe.parentNode.removeChild(bridgeIframe);
    }
    bridgeIframe = null;
    bridgeReady = false;
  }

  function clearBridgePromise(errorMessage) {
    if (bridgeReadyTimeout) {
      clearTimeout(bridgeReadyTimeout);
      bridgeReadyTimeout = null;
    }

    if (bridgeReadyReject) {
      bridgeReadyReject(new Error(errorMessage || "Bridge konnte nicht gestartet werden."));
    }

    bridgeReadyPromise = null;
    bridgeReadyResolve = null;
    bridgeReadyReject = null;
  }

  function installMessageListener() {
    if (messageListenerInstalled) return;

    window.addEventListener("message", function (event) {
      var data = event.data || {};
      if (!data || typeof data !== "object") return;

      if (bridgeIframe && event.source !== bridgeIframe.contentWindow) {
        return;
      }

      if (data.type === "dpjagd-bridge-ready") {
        bridgeReady = true;

        if (bridgeReadyTimeout) {
          clearTimeout(bridgeReadyTimeout);
          bridgeReadyTimeout = null;
        }

        if (bridgeReadyResolve) {
          bridgeReadyResolve(true);
          bridgeReadyResolve = null;
          bridgeReadyReject = null;
          bridgeReadyPromise = null;
        }

        return;
      }

      if (data.type === "dpjagd-response") {
        var pending = pendingRequests[data.id];
        if (!pending) return;

        delete pendingRequests[data.id];

        if (data.ok) {
          pending.resolve(data.result);
        } else {
          pending.reject(new Error(data.error || "Backend-Fehler."));
        }
      }
    });

    messageListenerInstalled = true;
  }

  function createBridgeIframe(apiUrl) {
    removeBridgeIframe();
    installMessageListener();

    bridgeIframe = document.createElement("iframe");
    bridgeIframe.setAttribute("aria-hidden", "true");
    bridgeIframe.style.position = "absolute";
    bridgeIframe.style.left = "-9999px";
    bridgeIframe.style.top = "-9999px";
    bridgeIframe.style.width = "1px";
    bridgeIframe.style.height = "1px";
    bridgeIframe.style.border = "0";
    bridgeIframe.style.opacity = "0";
    bridgeIframe.src = buildBridgeUrl(apiUrl);

    var host = document.body || document.documentElement;
    host.appendChild(bridgeIframe);
  }

  function ensureBridge() {
    var config = getConfig();
    var apiUrl = normalizeUrl(config.getApiUrl());

    if (!apiUrl) {
      throw new Error("Bitte zuerst die API-URL speichern.");
    }

    if (activeApiUrl !== apiUrl) {
      activeApiUrl = apiUrl;
      bridgeReady = false;
      bridgeReadyPromise = null;
      bridgeReadyResolve = null;
      bridgeReadyReject = null;

      if (bridgeReadyTimeout) {
        clearTimeout(bridgeReadyTimeout);
        bridgeReadyTimeout = null;
      }

      removeBridgeIframe();
    }

    if (bridgeReady) {
      return Promise.resolve(true);
    }

    if (bridgeReadyPromise) {
      return bridgeReadyPromise;
    }

    bridgeReadyPromise = new Promise(function (resolve, reject) {
      bridgeReadyResolve = resolve;
      bridgeReadyReject = reject;
    });

    createBridgeIframe(apiUrl);

    bridgeReadyTimeout = setTimeout(function () {
      clearBridgePromise("Bridge konnte nicht geladen werden. Prüfe die API-URL und die Bereitstellung.");
      removeBridgeIframe();
    }, 20000);

    return bridgeReadyPromise;
  }

  async function request(action, payload, options) {
    options = options || {};
    await ensureBridge();

    return new Promise(function (resolve, reject) {
      var id = "req_" + Date.now() + "_" + (++requestCounter);

      pendingRequests[id] = {
        resolve: resolve,
        reject: reject
      };

      try {
        var message = {
          type: "dpjagd-request",
          id: id,
          request: {
            action: action
          }
        };

        if (payload && typeof payload === "object") {
          Object.keys(payload).forEach(function (key) {
            message.request[key] = payload[key];
          });
        }

        if (options.includeToken !== false) {
          var session = getConfig().getSession();
          if (session && session.token && !message.request.token) {
            message.request.token = session.token;
          }
        }

        bridgeIframe.contentWindow.postMessage(message, "*");
      } catch (err) {
        delete pendingRequests[id];
        reject(err);
      }
    });
  }

  function value(row) {
    var keys = Array.prototype.slice.call(arguments, 1);

    for (var index = 0; index < keys.length; index += 1) {
      var key = keys[index];
      if (Object.prototype.hasOwnProperty.call(row, key) && row[key] != null) {
        return String(row[key]).trim();
      }
    }

    return "";
  }

  function boolean(row) {
    var keys = Array.prototype.slice.call(arguments, 1);

    for (var index = 0; index < keys.length; index += 1) {
      var key = keys[index];
      if (Object.prototype.hasOwnProperty.call(row, key)) {
        return row[key] === true || String(row[key]).toUpperCase() === "TRUE";
      }
    }

    return false;
  }

  function mapPerson(row) {
    return {
      personId: value(row, "id", "personId", "person_id"),
      vorname: value(row, "vorname", "Vorname"),
      nachname: value(row, "nachname", "Nachname"),
      kjNr: value(row, "kj_nr", "kjNr", "KJ_Nr"),
      adresse: value(row, "adresse", "Adresse"),
      plz: value(row, "plz", "PLZ"),
      ort: value(row, "ort", "Ort"),
      nameKat: value(row, "name_kat", "nameKat", "Name_Kat"),
      aktiv: boolean(row, "aktiv", "Aktiv"),
      jagdgastkarte: value(row, "jagdgastkarte", "Jagdgastkarte"),
      personenNr: value(row, "personen_nr", "personenNr", "Personen_Nr", "PersonenNr")
    };
  }

  function mapJagdjahr(row) {
    return {
      idJgJahr: value(row, "id", "idJgJahr", "id_jg_jahr", "ID_JG_Jahr"),
      personId: value(row, "person_id", "personId", "idName", "ID_Name"),
      jahr: value(row, "jahr", "Jahr"),
      aktiv: boolean(row, "aktiv", "Aktiv"),
      jaegerGastId: value(row, "jaeger_gast_id", "jaegerGastId", "jaeger_gast", "jaegerGast", "Jäger_Gast", "Jaeger_Gast"),
      bemerkung: value(row, "bemerkung", "Bemerkung")
    };
  }

  async function loadPersonenInitialData() {
    var results = await Promise.all([
      db.from("personen").select("*"),
      db.from("jagdjahre").select("*")
    ]);

    if (results[0].error) throw results[0].error;
    if (results[1].error) throw results[1].error;

    return {
      currentYear: new Date().getFullYear(),
      personen: (results[0].data || []).map(mapPerson),
      jagdgaeste: (results[1].data || []).map(mapJagdjahr)
    };
  }

  function coerceInteger(value) {
    var text = String(value == null ? "" : value).trim();
    if (!text) return null;

    var parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function personPayload(person) {
    var payload = {
      vorname: String(person.vorname || "").trim(),
      nachname: String(person.nachname || "").trim(),
      kj_nr: coerceInteger(person.kjNr),
      adresse: String(person.adresse || "").trim(),
      plz: String(person.plz || "").trim(),
      ort: String(person.ort || "").trim(),
      name_kat: String(person.nameKat || "").trim(),
      aktiv: person.aktiv === true,
      jagdgastkarte: String(person.jagdgastkarte || "").trim()
    };

    var personenNr = coerceInteger(person.personenNr);
    if (personenNr != null) {
      payload.personen_nr = personenNr;
    }

    var personId = String(person.personId || "").trim();
    if (personId) {
      payload.id = personId;
    }

    return payload;
  }

  function jagdjahrPayloads(personId, rows) {
    return (rows || []).map(function (row) {
      var payload = {
        jahr: coerceInteger(row.jahr),
        aktiv: row.aktiv === true,
        bemerkung: String(row.bemerkung || "").trim()
      };

      if (personId) {
        payload.person_id = personId;
      }

      var jaegerGastId = String(row.jaegerGastId || "").trim();
      payload.jaeger_gast_id = jaegerGastId || null;

      return payload;
    });
  }

  // TODO: Centralize relation cleanup once more modules need the same lifecycle handling.
  async function replaceJagdjahre(personId, rows) {
    if (!personId) return;

    var deleteResult = await db.from("jagdjahre").delete().eq("person_id", personId);
    if (deleteResult.error) throw deleteResult.error;

    var payloads = jagdjahrPayloads(personId, rows);
    if (payloads.length === 0) return;

    var insertResult = await db.from("jagdjahre").insert(payloads);
    if (insertResult.error) throw insertResult.error;
  }

  async function savePerson(payload) {
    var person = personPayload(payload.person || {});
    var originalPersonId = String(payload.originalPersonId || "").trim();
    var isEdit = payload.mode === "edit";
    var jagdjahre = payload.jagdgaeste || [];
    var personResult;

    if (isEdit && originalPersonId) {
      personResult = await db.from("personen").update(person).eq("id", originalPersonId).select("id").single();
    } else {
      personResult = await db.from("personen").insert(person).select("id").single();
    }

    if (personResult.error) throw personResult.error;

    var savedPersonId = personResult.data && personResult.data.id ? String(personResult.data.id) : originalPersonId;

    if (person.name_kat === "Jagdgast" || person.name_kat === "Jagdgastkarten") {
      await replaceJagdjahre(savedPersonId, jagdjahre);
    } else {
      await replaceJagdjahre(savedPersonId, []);
    }

    return loadPersonenInitialData();
  }

  async function deletePerson(personId) {
    var normalizedPersonId = String(personId || "").trim();
    if (!normalizedPersonId) return loadPersonenInitialData();

    var clearJagdjahrReferences = await db
      .from("jagdjahre")
      .update({ jaeger_gast_id: null })
      .eq("jaeger_gast_id", normalizedPersonId);
    if (clearJagdjahrReferences.error) throw clearJagdjahrReferences.error;

    var deleteJagdjahreResult = await db.from("jagdjahre").delete().eq("person_id", normalizedPersonId);
    if (deleteJagdjahreResult.error) throw deleteJagdjahreResult.error;

    var deleteResult = await db.from("personen").delete().eq("id", normalizedPersonId);
    if (deleteResult.error) throw deleteResult.error;

    return loadPersonenInitialData();
  }

  window.DPJagdApi = {
    loadPersonenInitialData: loadPersonenInitialData,
    savePerson: savePerson,
    deletePerson: deletePerson
  };
})(window);
