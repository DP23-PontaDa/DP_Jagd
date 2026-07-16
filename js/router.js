/* ==========================================
   DP_Jagd V2
   router.js
========================================== */

const Router = {
    currentPage: null,

    routes: {
        login: "pages/login.html",
        dashboard: "pages/dashboard.html",
        personen: "pages/personen.html",
        abschuss: "pages/abschuss.html",
        abschussplan: "pages/abschussplan.html"
    },

    async open(page) {
        const requestedPage = this.routes[page] ? page : "login";
        const authenticated = Auth.isAuthenticated();

        if (requestedPage === "login" && authenticated) {
            return this.open("dashboard");
        }

        if (requestedPage !== "login" && !authenticated) {
            return this.open("login");
        }

        const content = document.getElementById("app-content");

        if (!content) {
            return;
        }

        try {
            const response = await fetch(this.routes[requestedPage], { cache: "no-store" });

            if (!response.ok) {
                throw new Error("Die Seite konnte nicht geladen werden.");
            }

            content.innerHTML = await response.text();
            this.currentPage = requestedPage;
            this.updateMenu(requestedPage);
            this.updateLayout(requestedPage);

            if (requestedPage === "login") {
                this.bindLoginForm();
            } else {
                Auth.updateHeader();
            }

            this.initializePage(requestedPage);
        } catch (error) {
            console.error("Seite konnte nicht geladen werden:", error);
            content.textContent = "Die Seite konnte nicht geladen werden. Bitte laden Sie die Anwendung erneut.";
        }
    },

    bindLoginForm() {
        const form = document.getElementById("loginForm");

        if (form) {
            form.addEventListener("submit", function (event) {
                event.preventDefault();
                Auth.login();
            });
        }
    },

    initializePage(page) {
        if (page === "personen" && window.Personen && typeof window.Personen.init === "function") {
            window.Personen.init();
        }
    },

    updateMenu(page) {
        document.querySelectorAll("#sidebar [data-page]").forEach(function (button) {
            button.classList.toggle("active", button.dataset.page === page);
        });
    },

    updateLayout(page) {
        const sidebar = document.getElementById("sidebar");
        const header = document.querySelector("header");

        const isLogin = page === "login";
        sidebar.hidden = isLogin;
        header.hidden = isLogin;
    }
};

document.addEventListener("click", function (event) {
    const pageButton = event.target.closest("[data-page]");

    if (pageButton) {
        Router.open(pageButton.dataset.page);
        return;
    }

    if (event.target.closest("#logoutButton")) {
        Auth.logout();
    }
});
