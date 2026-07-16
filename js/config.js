// js/config.js
(function (window) {
  "use strict";

  var STORAGE = {
    apiUrl: "dp_jagd_api_url",
    session: "dp_jagd_session"
  };

  function readJson(key) {
    try {
      var raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  function writeJson(key, value) {
    window.localStorage.setItem(key, JSON.stringify(value));
  }

  function remove(key) {
    window.localStorage.removeItem(key);
  }

  function normalizeUrl(value) {
    return String(value || "").trim().replace(/\/+$/, "");
  }

  var Config = {
    appName: "DP_Jagd V2",
    storage: STORAGE,
    getApiUrl: function () {
      return normalizeUrl(window.localStorage.getItem(STORAGE.apiUrl));
    },
    setApiUrl: function (value) {
      var url = normalizeUrl(value);
      if (!url) throw new Error("API-URL fehlt.");
      window.localStorage.setItem(STORAGE.apiUrl, url);
      return url;
    },
    clearApiUrl: function () {
      remove(STORAGE.apiUrl);
    },
    getSession: function () {
      return readJson(STORAGE.session);
    },
    setSession: function (session) {
      writeJson(STORAGE.session, session);
      return session;
    },
    clearSession: function () {
      remove(STORAGE.session);
    },
    hasApiUrl: function () {
      return !!this.getApiUrl();
    }
  };

  window.DPJagdConfig = Config;
})(window);
