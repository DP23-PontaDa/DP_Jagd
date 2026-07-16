/* ==========================================
   DP_Jagd V2
   auth.js
========================================== */

const Auth = {
    async login() {
        const form = document.getElementById("loginForm");
        const emailInput = document.getElementById("email");
        const passwordInput = document.getElementById("password");
        const errorBox = document.getElementById("loginError");
        const loginButton = document.getElementById("loginButton");

        if (!form || !emailInput || !passwordInput || !errorBox || !loginButton) {
            return;
        }

        const email = emailInput.value.trim();
        const password = passwordInput.value;

        errorBox.textContent = "";

        if (!email) {
            errorBox.textContent = "Bitte geben Sie Ihre E-Mail-Adresse ein.";
            emailInput.focus();
            return;
        }

        if (!emailInput.validity.valid) {
            errorBox.textContent = "Bitte geben Sie eine gültige E-Mail-Adresse ein.";
            emailInput.focus();
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
            const { data, error } = await db.auth.signInWithPassword({ email, password });

            if (error) {
                throw error;
            }

            if (!data.user) {
                throw new Error("Die Anmeldung konnte nicht abgeschlossen werden.");
            }

            CURRENT_USER = data.user;
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
            currentUser.textContent = CURRENT_USER ? CURRENT_USER.email : "-";
        }
    },

    getErrorMessage(error) {
        const message = error && error.message ? error.message : "Anmeldung fehlgeschlagen.";

        if (message === "Invalid login credentials") {
            return "E-Mail-Adresse oder Passwort ist nicht korrekt.";
        }

        if (message === "Email not confirmed") {
            return "Bitte bestätigen Sie zuerst Ihre E-Mail-Adresse.";
        }

        return "Anmeldung fehlgeschlagen. Bitte versuchen Sie es erneut.";
    }
};
