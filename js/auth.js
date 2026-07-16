// js/auth.js
(function (window) {
  "use strict";

  var Config = window.DPJagdConfig;
  var Api = window.DPJagdApi;

  function nowIso() {
    return new Date().toISOString();
  }

  function isExpired(session) {
    if (!session || !session.expiresAt) return true;
    return new Date(session.expiresAt).getTime() <= Date.now();
  }

  async function bootstrap() {
    var session = Config.getSession();
    if (!session || !session.token || isExpired(session)) {
      clearSession();
      return { authenticated: false, session: null };
    }

    try {
      var result = await Api.request("auth.session", { token: session.token }, { includeToken: false });
      var nextSession = {
        token: result.session.token,
        expiresAt: result.session.expiresAt,
        user: result.user
      };
      Config.setSession(nextSession);
      return { authenticated: true, session: nextSession };
    } catch (err) {
      clearSession();
      return { authenticated: false, session: null };
    }
  }

  async function login(apiUrl, username, password) {
    Config.setApiUrl(apiUrl);

    var result = await Api.request(
      "auth.login",
      {
        username: username,
        password: password
      },
      { includeToken: false }
    );

    var session = {
      token: result.session.token,
      expiresAt: result.session.expiresAt,
      user: result.user
    };

    Config.setSession(session);
    return session;
  }

  async function logout() {
    var session = Config.getSession();
    if (session && session.token && Config.hasApiUrl()) {
      try {
        await Api.request("auth.logout", { token: session.token }, { includeToken: false });
      } catch (err) {
      }
    }
    clearSession();
  }

  function clearSession() {
    Config.clearSession();
  }

  function getSession() {
    return Config.getSession();
  }

  function hasSession() {
    var session = getSession();
    return !!(session && session.token && !isExpired(session));
  }

  function getUser() {
    var session = getSession();
    return session && session.user ? session.user : null;
  }

  window.DPJagdAuth = {
    bootstrap: bootstrap,
    login: login,
    logout: logout,
    clearSession: clearSession,
    getSession: getSession,
    hasSession: hasSession,
    getUser: getUser,
    nowIso: nowIso
  };
})(window);
