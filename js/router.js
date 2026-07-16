const Router={

load:function(page){

fetch("pages/"+page+".html")

.then(r=>r.text())

.then(html=>{

document.getElementById("page").innerHTML=html;

});

}

};
