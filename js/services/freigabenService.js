const FreigabenService = (() => {
  const db = window.db || window.supabase;
  const check = (result) => { if (result.error) throw result.error; return result.data || []; };
  const norm = (wert) => String(wert || "").trim().toLocaleLowerCase("de");
  function addYears(datum, jahre) { const d = new Date(`${datum}T12:00:00`); d.setFullYear(d.getFullYear() + Number(jahre || 0)); return d.toISOString().slice(0, 10); }
  function heute() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }

  async function planKontext() {
    const p = await db.from("planperioden").select("id,startjahr,endjahr").eq("status", "AKTIV").maybeSingle();
    if (p.error) throw p.error; if (!p.data) return { periode:null, kahlwildIds:new Set(), b1:null };
    const pp = check(await db.from("planperiode_planpositionen").select("id,code,bezeichnung").eq("planperiode_id",p.data.id).eq("aktiv",true));
    const kahl = pp.find((x)=>norm(x.code)==="kahlwild"||norm(x.bezeichnung)==="kahlwild");
    const mappings = kahl ? check(await db.from("planperiode_planposition_wildklasse").select("wildklasse_id").eq("planperiode_id",p.data.id).eq("planperiode_planposition_id",kahl.id)) : [];
    const b1Result = await db.from("wildklassen").select("id").eq("aktiv",true).or("code.eq.HIRSCH_B1,bezeichnung.ilike.Hirsch B1").limit(1).maybeSingle();
    if (b1Result.error) throw b1Result.error; let b1=null;
    if (b1Result.data) {
      const map = await db.from("planperiode_planposition_wildklasse").select("planperiode_planposition_id").eq("planperiode_id",p.data.id).eq("wildklasse_id",b1Result.data.id).limit(1).maybeSingle();
      if (map.error) throw map.error;
      if (map.data) { const [freigaben,statistik]=await Promise.all([AbschussplanService.getInterneFreigaben(p.data.id,map.data.planperiode_planposition_id),AbschussplanService.getHirschB1Statistik(p.data,b1Result.data.id)]); b1={wildklasseId:b1Result.data.id,freigaben,statistik}; }
    }
    return { periode:p.data, kahlwildIds:new Set(mappings.map((x)=>String(x.wildklasse_id))), b1 };
  }

  async function basisdaten(jahr) {
    const [alleJaeger,klassen,regelnResult,abschuesseResult,plan]=await Promise.all([
      AbschussService.getAuswaehlbareAbschussJaeger(), WildklassenService.getAktivePlanWildklassen(),
      db.from("abschussregeln").select("*").eq("aktiv",true).not("jaeger_id","is",null),
      db.from("abschuesse").select("id,datum,jaeger_id,wildklasse_id,fallwild,zusatzinfo,interner_hirsch_b1").eq("fallwild",false).lte("datum",`${jahr}-12-31`).order("datum",{ascending:false}),
      planKontext(),
    ]);
    const aktiveMitglieder=alleJaeger.filter((p)=>norm(p.name_kat)==="mitglied"&&p.aktiv===true)
      .sort((a,b)=>String(a.nachname||"").localeCompare(String(b.nachname||""),"de")||String(a.vorname||"").localeCompare(String(b.vorname||""),"de"));
    return { jaeger:aktiveMitglieder, klassen:WildklassenService.sortiereNachWildgruppeUndWildklasse(klassen), regeln:check(regelnResult), abschuesse:check(abschuesseResult), plan };
  }

  function berechnen(basis,jahr) {
    const heuteIso=heute(); const klasseMap=new Map(basis.klassen.map((k)=>[String(k.id),k])); const ergebnis=[];
    basis.jaeger.forEach((jaeger)=>basis.klassen.forEach((klasse)=>{
      const personAbschuesse=basis.abschuesse.filter((a)=>String(a.jaeger_id)===String(jaeger.id));
      const klassenAbschuesse=personAbschuesse.filter((a)=>String(a.wildklasse_id)===String(klasse.id));
      const letzter=klassenAbschuesse[0]||null;
      const nichtPassend=Boolean(letzter&&norm(letzter.zusatzinfo).includes("nicht passend"));
      const stehzeit=nichtPassend&&Number(klasse.stehzeit_nicht_passend_jahre)>0 ? Number(klasse.stehzeit_nicht_passend_jahre) : Number(klasse.stehzeit_jahre||0);
      let normalAb=letzter?addYears(letzter.datum,stehzeit):`${jahr}-01-01`;
      let grund=letzter
        ? (normalAb>heuteIso ? "Stehzeit noch nicht erfüllt" : nichtPassend ? `Stehzeit nicht passend: ${stehzeit} Jahre` : `Stehzeit ${stehzeit} Jahre`)
        : "Keine frühere Erlegung";
      let kahlwildBlockiert=false;
      const erforderlich=personAbschuesse.filter((a)=>String(a.datum).startsWith(String(jahr))).reduce((sum,a)=>sum+Number(klasseMap.get(String(a.wildklasse_id))?.kahlwildpflicht||0),0);
      const kahlwild=personAbschuesse.filter((a)=>String(a.datum).startsWith(String(jahr))&&basis.plan.kahlwildIds.has(String(a.wildklasse_id))).length;
      if (Number(klasse.kahlwildpflicht)>0 && kahlwild<erforderlich) { kahlwildBlockiert=true; grund=`Kahlwildpflicht nicht erfüllt (${kahlwild} von ${erforderlich})`; }

      const passendeRegeln=basis.regeln.filter((r)=>String(r.jaeger_id)===String(jaeger.id)&&String(r.wildklasse_id)===String(klasse.id)&&(!r.freigabejahr||Number(r.freigabejahr)===Number(jahr)));
      const aktiveSperre=passendeRegeln.filter((r)=>r.regel_typ==="SPERRE"&&r.frei_ab&&r.frei_ab>heuteIso)
        .sort((a,b)=>String(b.frei_ab).localeCompare(String(a.frei_ab)))[0]||null;
      const individuell=aktiveSperre||passendeRegeln.filter((r)=>r.regel_typ!=="SPERRE")
        .sort((a,b)=>({SONDERFREIGABE:4,VORZIEHEN:3,INDIVIDUELLES_FREI_DATUM:2,INDIVIDUELLE_AUSNAHME:1}[b.regel_typ]||0)-({SONDERFREIGABE:4,VORZIEHEN:3,INDIVIDUELLES_FREI_DATUM:2,INDIVIDUELLE_AUSNAHME:1}[a.regel_typ]||0))[0]||null;
      const individuellAb=individuell?.frei_ab||null;
      let finalAb=individuellAb||normalAb;
      let b1Blockiert=false;
      if (individuell) {
        const regelName = individuell.regel_typ === "SPERRE" ? "Sperre"
          : individuell.regel_typ === "VORZIEHEN" ? "Vorgezogen"
          : individuell.regel_typ === "SONDERFREIGABE" ? "Sonderfreigabe"
            : individuell.regel_typ === "INDIVIDUELLES_FREI_DATUM" ? "Individuelles Frei-Datum"
              : "Individuelle Ausnahme";
        grund = individuell.bemerkung ? `${regelName} - ${individuell.bemerkung}` : regelName;
      }

      if (basis.plan.b1&&String(klasse.id)===String(basis.plan.b1.wildklasseId)&&!individuell) {
        const soll=Number(basis.plan.b1.freigaben.find((x)=>Number(x.jahr)===Number(jahr))?.interne_freigabe||0);
        const ist=Number(jahr)===Number(basis.plan.periode?.startjahr)?basis.plan.b1.statistik.internStartjahr:Number(jahr)===Number(basis.plan.periode?.endjahr)?basis.plan.b1.statistik.internEndjahr:0;
        b1Blockiert=soll-ist<=0;
        grund=!b1Blockiert?`Interne B1-Freigabe: ${soll-ist} verfügbar`:"Keine interne B1-Freigabe";
      }

      let frei=finalAb<=heuteIso;
      if (aktiveSperre) frei=false;
      if (kahlwildBlockiert&&individuell?.regel_typ!=="SONDERFREIGABE") frei=false;
      if (b1Blockiert&&!individuell) frei=false;
      ergebnis.push({jaeger,wildklasse:klasse,letzte_erlegung:letzter?.datum||null,relevante_abschuesse:klassenAbschuesse,
        normale_freigabe_ab:normalAb,individuelle_freigabe_ab:individuellAb,endgueltige_freigabe_ab:finalAb,frei_ab:finalAb,
        status:frei?"FREI":"NICHT FREI",grund,stehzeit,nicht_passend:nichtPassend,regel:null,ausnahme:individuell,kahlwild:{erlegt:kahlwild,erforderlich}});
    }));
    return ergebnis.sort((a,b)=>
      WildklassenService.vergleicheNachWildgruppeUndWildklasse(a.wildklasse,b.wildklasse)||
      String(a.jaeger.nachname||"").localeCompare(String(b.jaeger.nachname||""),"de")||
      String(a.jaeger.vorname||"").localeCompare(String(b.jaeger.vorname||""),"de"));
  }
  async function laden(jahr){const basis=await basisdaten(jahr);return{basis,freigaben:berechnen(basis,jahr)};}
  async function freigabeFuer(jaegerId,wildklasseId,jahr){const d=await laden(jahr);return d.freigaben.find((x)=>String(x.jaeger.id)===String(jaegerId)&&String(x.wildklasse.id)===String(wildklasseId))||null;}
  return {laden,freigabeFuer};
})();
