/* ==========================================
   DP_Jagd V2
   app.js
========================================== */

document.addEventListener("DOMContentLoaded", init);

async function init() {
    const loading = document.getElementById("loading");
    const app = document.getElementById("app");

    try {
        const loggedIn = await Auth.checkSession();
        app.hidden = false;
        await Router.open(loggedIn ? "dashboard" : "login");
    } catch (error) {
        console.error("Anwendung konnte nicht gestartet werden:", error);
        app.hidden = false;
        await Router.open("login");
    } finally {
        loading.hidden = true;
    }
}
