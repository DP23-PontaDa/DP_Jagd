const Auth={

login(){

    const benutzer=document.getElementById("username").value;

    const passwort=document.getElementById("password").value;

    if(benutzer==="" || passwort===""){

        document.getElementById("loginMessage").innerHTML="Bitte Benutzer und Passwort eingeben.";

        return;

    }

    document.getElementById("loginMessage").innerHTML="Login wird geprüft...";

}

}
