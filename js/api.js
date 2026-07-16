// js/api.js
(function (window) {
  "use strict";

  function getConfig() {
    return window.DPJagdConfig;
  }

  async function request(action, payload, options) {
    options = options || {};
    var config = getConfig();
    var apiUrl = config.getApiUrl();

    if (!apiUrl) {
      throw new Error("Bitte zuerst die API-URL speichern.");
    }

    var body = {
      action: action
    };

    if (payload && typeof payload === "object") {
      Object.keys(payload).forEach(function (key) {
        body[key] = payload[key];
      });
    }

    var session = config.getSession();
    if (options.includeToken !== false && session && session.token && !body.token) {
      body.token = session.token;
    }

    var response = await fetch(apiUrl, {
      method: "POST",
      mode: "cors",
      cache: "no-store",
      credentials: "omit",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    var text = await response.text();
    var json;
    try {
      json = JSON.parse(text);
    } catch (err) {
      throw new Error("Unerwartete API-Antwort.");
    }

    if (!response.ok) {
      throw new Error(json && json.error ? json.error : "API-Aufruf fehlgeschlagen.");
    }

    if (!json || json.ok !== true) {
      throw new Error((json && json.error) || "API-Aufruf fehlgeschlagen.");
    }

    return json;
  }

  window.DPJagdApi = {
    request: request
  };
})(window);
