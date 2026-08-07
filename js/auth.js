/* ==========================================
   DP_Jagd V2
   auth.js
========================================== */

const Auth = {
    async login() {
        const form = document.getElementById("loginForm");
        const usernameInput = document.getElementById("username");
        const passwordInput = document.getElementById("password");
        const errorBox = document.getElementById("loginError");
        const loginButton = document.getElementById("loginButton");

        if (!form || !usernameInput || !passwordInput || !errorBox || !loginButton) {
            return;
        }

        const benutzername = usernameInput.value.trim();
        const password = passwordInput.value;

        errorBox.textContent = "";

        if (!benutzername) {
            errorBox.textContent = "Bitte geben Sie Ihren Benutzernamen ein.";
            usernameInput.focus();
            return;
        }

        if (!password) {
            errorBox.textContent = "Bitte geben Sie Ihr Passwort ein.";
            passwordInput.focus();
            return;
        }

        loginButton.disabled = true;
        loginButton.textContent = "Anmeldung läuft...";

        try {
            const login = await db.functions.invoke("benutzer-login", {
                body: { benutzername, passwort: password }
            });
            if (login.error || login.data?.error) {
                throw login.error || new Error(login.data.error);
            }
            const { data, error } = await db.auth.setSession({
                access_token: login.data.access_token,
                refresh_token: login.data.refresh_token
            });

            if (error) {
                throw error;
            }

            if (!data.user) {
                throw new Error("Die Anmeldung konnte nicht abgeschlossen werden.");
            }

            CURRENT_USER = data.user;
            await BerechtigungService.laden();
            await Router.open("dashboard");
        } catch (error) {
            console.error("Login fehlgeschlagen:", error);
            errorBox.textContent = this.getErrorMessage(error);
            passwordInput.value = "";
            passwordInput.focus();
        } finally {
            loginButton.disabled = false;
            loginButton.textContent = "Anmelden";
        }
    },

    async logout() {
        const logoutButton = document.getElementById("logoutButton");

        if (logoutButton) {
            logoutButton.disabled = true;
        }

        try {
            const { error } = await db.auth.signOut();

            if (error) {
                throw error;
            }
        } catch (error) {
            console.error("Logout fehlgeschlagen:", error);
        } finally {
            CURRENT_USER = null;
            BerechtigungService.leeren();
            await Router.open("login");
        }
    },

    async checkSession() {
        try {
            const { data, error } = await db.auth.getSession();

            if (error) {
                throw error;
            }

            CURRENT_USER = data.session ? data.session.user : null;
            if (CURRENT_USER) await BerechtigungService.laden();
            else BerechtigungService.leeren();
            return Boolean(CURRENT_USER);
        } catch (error) {
            console.error("Session-Prüfung fehlgeschlagen:", error);
            CURRENT_USER = null;
            return false;
        }
    },

    isAuthenticated() {
        return Boolean(CURRENT_USER);
    },

    updateHeader() {
        const currentUser = document.getElementById("currentUser");

        if (currentUser) {
            currentUser.textContent = CURRENT_USER
                ? (CURRENT_USER.user_metadata?.benutzername || CURRENT_USER.user_metadata?.name || "Benutzer")
                : "-";
        }
    },

    getErrorMessage(error) {
        const message = error && error.message ? error.message : "Anmeldung fehlgeschlagen.";

        if (message === "Invalid login credentials") {
            return "Benutzername oder Passwort ist nicht korrekt.";
        }

        return "Anmeldung fehlgeschlagen. Bitte versuchen Sie es erneut.";
    }
};
