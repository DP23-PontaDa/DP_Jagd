const Auth = {

    async login(){

        const benutzer = document.getElementById("loginUser").value.trim();

        const passwort = document.getElementById("loginPassword").value.trim();

        if(benutzer===""){

            document.getElementById("loginError").innerHTML="Benutzer eingeben.";

            return;

        }

        if(passwort===""){

            document.getElementById("loginError").innerHTML="Passwort eingeben.";

            return;

        }

        /*
         Vorerst Dummy Login.
         In Lieferung 4 wird dies durch Apps Script ersetzt.
        */

        localStorage.setItem(CONFIG.SESSION_KEY,benutzer);

        document.getElementById("sidebar").classList.remove("hidden");

        document.getElementById("header").classList.remove("hidden");

        document.getElementById("currentUser").innerHTML=benutzer;

        Router.open("dashboard");

    },

    logout(){

        localStorage.removeItem(CONFIG.SESSION_KEY);

        location.reload();

    }

};
