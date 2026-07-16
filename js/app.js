document.addEventListener("DOMContentLoaded", async () => {

    const session = localStorage.getItem(CONFIG.SESSION_KEY);

    if(session){

        document.getElementById("sidebar").classList.remove("hidden");
        document.getElementById("header").classList.remove("hidden");

        document.getElementById("currentUser").innerHTML = session;

        await Router.open("dashboard");

    }else{

        document.getElementById("sidebar").classList.add("hidden");
        document.getElementById("header").classList.add("hidden");

        await Router.open("login");

    }

});
