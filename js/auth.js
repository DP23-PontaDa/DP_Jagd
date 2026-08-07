/* ==========================================
   DP_Jagd V2
   auth.js
========================================== */

const Auth = {
    logoutLaeuft: false,

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

    async logout(event) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        if (this.logoutLaeuft) return;
        this.logoutLaeuft = true;

        const logoutButton = document.getElementById("logoutButton");

        if (logoutButton) {
            logoutButton.disabled = true;
            logoutButton.setAttribute("aria-busy", "true");
        }

        CURRENT_USER = null;
        BerechtigungService.leeren();
        const loginNavigation = Router.open("login");

        try {
            const abmelden = db.auth.signOut({ scope: "local" });
            const timeout = new Promise((resolve) => {
                window.setTimeout(() => resolve({ error: new Error("Logout-Zeitüberschreitung") }), 3000);
            });
            const { error } = await Promise.race([abmelden, timeout]);

            if (error) {
                throw error;
            }
        } catch (error) {
            console.error("Logout fehlgeschlagen:", error);
        } finally {
            try {
                await loginNavigation;
            } finally {
                const sidebar = document.getElementById("sidebar");
                const overlay = document.getElementById("sidebarOverlay");
                const toggle = document.getElementById("sidebarToggle");
                sidebar?.classList.remove("open");
                overlay?.classList.remove("open");
                toggle?.setAttribute("aria-expanded", "false");
                if (logoutButton) {
                    logoutButton.disabled = false;
                    logoutButton.removeAttribute("aria-busy");
                }
                this.logoutLaeuft = false;
            }
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
