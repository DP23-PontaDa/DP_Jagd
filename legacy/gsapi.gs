function doGet(e) {
  var params = (e && e.parameter) ? e.parameter : {};

  if (String(params.bridge || "") === "1") {
    return buildBridgeHtml_(params);
  }

  return jsonResponse_({
    ok: true,
    app: "DP_Jagd V2 API",
    time: new Date().toISOString()
  });
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

function gsBridgeDispatch(request) {
  request = request || {};
  var action = String(request.action || "").trim();

  if (!action) {
    throw new Error("Action fehlt.");
  }

  return dispatchAction_(action, request);
}

function dispatchAction_(action, body) {
  switch (action) {
    case "auth.login":
      return authLogin_(body);
    case "auth.session":
      return authSession_(body);
    case "auth.logout":
      return authLogout_(body);

    case "personen.getInitialData":
      return { ok: true, data: persGetInitialData() };
    case "personen.savePerson":
      return { ok: true, data: persSavePerson(body.payload || body) };
    case "personen.deletePerson":
      return { ok: true, data: persDeletePerson(body.idName || (body.payload && body.payload.idName)) };

    default:
      throw new Error("Unbekannte Aktion: " + action);
  }
}

function buildBridgeHtml_(params) {
  var allowedOrigin = String(params.origin || "").trim();

  var html = [
    "<!doctype html>",
    "<html lang=\"de\">",
    "<head>",
    "<meta charset=\"utf-8\">",
    "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">",
    "<title>DP_Jagd Bridge</title>",
    "<style>html,body{margin:0;padding:0;background:transparent;overflow:hidden;}</style>",
    "</head>",
    "<body>",
    "<script>",
    "(function(){",
    "var allowedOrigin = " + JSON.stringify(allowedOrigin) + ";",
    "function send(msg, target){",
    "  try {",
    "    parent.postMessage(msg, target || allowedOrigin || '*');",
    "  } catch (err) {}",
    "}",
    "window.addEventListener('message', function(event){",
    "  if (allowedOrigin && event.origin !== allowedOrigin) return;",
    "  var data = event.data || {};",
    "  if (!data || data.type !== 'dpjagd-request') return;",
    "  var request = data.request || {};",
    "  google.script.run",
    "    .withSuccessHandler(function(result){",
    "      send({type:'dpjagd-response', id:data.id, ok:true, result:result}, event.origin);",
    "    })",
    "    .withFailureHandler(function(error){",
    "      send({type:'dpjagd-response', id:data.id, ok:false, error:(error && error.message) ? error.message : String(error)}, event.origin);",
    "    })",
    "    .gsBridgeDispatch(request);",
    "});",
    "send({type:'dpjagd-bridge-ready'}, allowedOrigin || '*');",
    "})();",
    "</script>",
    "</body>",
    "</html>"
  ].join("");

  return HtmlService
    .createHtmlOutput(html)
    .setTitle("DP_Jagd Bridge")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
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
