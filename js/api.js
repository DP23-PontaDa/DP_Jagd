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
      clearBridgePromise("Bridge konnte nicht geladen werden. Prüfe die Apps-Script-Web-App-URL und die Bereitstellung.");
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

  window.DPJagdApi = {
    request: request,
    ensureBridge: ensureBridge
  };
})(window);
