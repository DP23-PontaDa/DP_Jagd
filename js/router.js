const Router = {

    async open(page){

        const response = await fetch("pages/" + page + ".html");

        const html = await response.text();

        document.getElementById("page").innerHTML = html;

    }

};
