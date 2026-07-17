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
        // Setup responsive sidebar toggle for mobile
        const sidebar = document.getElementById("sidebar");
        const toggleBtn = document.getElementById("sidebarToggle");
        const overlay = document.getElementById("sidebarOverlay");

        function isMobile() {
            return window.matchMedia("(max-width: 768px)").matches;
        }

        function openSidebar() {
            if (!sidebar) return;
            sidebar.classList.add("open");
            if (overlay) overlay.classList.add("open");
            if (toggleBtn) toggleBtn.setAttribute("aria-expanded", "true");
        }

        function closeSidebar() {
            if (!sidebar) return;
            sidebar.classList.remove("open");
            if (overlay) overlay.classList.remove("open");
            if (toggleBtn) toggleBtn.setAttribute("aria-expanded", "false");
        }

        if (toggleBtn) {
            toggleBtn.addEventListener("click", function (e) {
                e.stopPropagation();
                if (sidebar.classList.contains("open")) {
                    closeSidebar();
                } else {
                    openSidebar();
                }
            });
        }

        if (overlay) {
            overlay.addEventListener("click", function () {
                closeSidebar();
            });
        }

        // Close sidebar automatically after selecting a menu item on mobile
        document.addEventListener("click", function (event) {
            const pageButton = event.target.closest("[data-page]");

            if (pageButton && isMobile()) {
                // allow Router.open to run; close sidebar afterwards
                setTimeout(closeSidebar, 60);
            }
        });

        // When resizing to desktop, ensure the sidebar is visible and overlay closed
        let lastIsMobile = isMobile();
        window.addEventListener("resize", function () {
            const nowMobile = isMobile();
            if (lastIsMobile && !nowMobile) {
                // switched to desktop
                closeSidebar();
            }
            lastIsMobile = nowMobile;
        });

        // Ensure initial mobile state: sidebar hidden on small screens
        if (isMobile()) {
            closeSidebar();
        }
    } catch (error) {
        console.error("Anwendung konnte nicht gestartet werden:", error);
        app.hidden = false;
        await Router.open("login");
    } finally {
        loading.hidden = true;
    }
}
