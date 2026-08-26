window.Freigaben = (() => {
  const el = (id) => document.getElementById(id);
  const esc = (wert) => { const div = document.createElement("div"); div.textContent = wert ?? ""; return div.innerHTML; };
  const jahrAnzeigen = (datum) => {
    if (!datum) return "–";
    const treffer = String(datum).match(/(?:^|\D)(\d{4})(?:\D|$)/);
    return treffer ? treffer[1] : datum;
  };
  let daten = []; let basis = null; let jahresdaten = new Map();
  let aktiveAnsicht = "hirsche"; let nachJahrenSortieren = true;

  function matrixJahre() {
    const mitte = Number(el("fgJahr").value) || new Date().getFullYear();
    return Array.from({ length: 7 }, (_, index) => mitte - 1 + index);
  }

  async function init() {
    nachJahrenSortieren = true;
    el("fgSortJahre").classList.add("active");
    el("fgSortJahre").setAttribute("aria-pressed", "true");
    const jahr = new Date().getFullYear();
    for (let wert = jahr - 2; wert <= jahr + 2; wert += 1) el("fgJahr").add(new Option(wert, wert));
    el("fgJahr").value = jahr;
    ["fgJaeger", "fgWildklasse", "fgStatus"].forEach((id) => el(id).addEventListener("change", rendern));
    el("fgJahr").addEventListener("change", laden);
    el("fgTabUebersicht").addEventListener("click", () => ansichtSetzen("uebersicht"));
    el("fgTabHirsche").addEventListener("click", () => ansichtSetzen("hirsche"));
    el("fgSortJahre").addEventListener("click", () => {
      nachJahrenSortieren = !nachJahrenSortieren;
      el("fgSortJahre").classList.toggle("active", nachJahrenSortieren);
      el("fgSortJahre").setAttribute("aria-pressed", String(nachJahrenSortieren));
      rendern();
    });
    ["fgHirschDetailClose", "fgHirschDetailOk"].forEach((id) =>
      el(id).addEventListener("click", hirschDetailSchliessen));
    el("fgHirschDetail").addEventListener("click", (event) => {
      if (event.target === el("fgHirschDetail")) hirschDetailSchliessen();
    });
    ansichtSetzen("hirsche");
    await laden();
  }

  async function laden() {
    try {
      const jahr = Number(el("fgJahr").value);
      const ergebnis = await FreigabenService.ladenMehrjahre(matrixJahre());
      jahresdaten = ergebnis.jahre; basis = ergebnis.basis;
      daten = jahresdaten.get(jahr) || [];
      optionen(); rendern();
    } catch (error) {
      console.error("Freigaben konnten nicht geladen werden:", error);
      AppFeedback.error(error.message || "Freigaben konnten nicht geladen werden.");
    }
  }

  function ansichtSetzen(ansicht) {
    aktiveAnsicht = ansicht;
    const hirsche = ansicht === "hirsche";
    el("fgTabUebersicht").classList.toggle("active", !hirsche);
    el("fgTabHirsche").classList.toggle("active", hirsche);
    el("fgTabUebersicht").setAttribute("aria-selected", String(!hirsche));
    el("fgTabHirsche").setAttribute("aria-selected", String(hirsche));
    el("fgUebersichtPanel").hidden = hirsche;
    el("fgHirschePanel").hidden = !hirsche;
    rendern();
  }

  function auswahlFuellen(id, elemente, label) {
    const select = el(id); const wert = select.value;
    select.innerHTML = id.startsWith("fgForm") ? "" : '<option value="">Alle</option>';
    elemente.forEach((element) => select.add(new Option(label(element), element.id)));
    select.value = wert;
  }
  function optionen() {
    auswahlFuellen("fgJaeger", basis.jaeger, (wert) => `${wert.vorname} ${wert.nachname}`);
    wildklassenAuswahlFuellen();
  }

  function wildklassenAuswahlFuellen() {
    const select = el("fgWildklasse"); const wert = select.value;
    select.innerHTML = '<option value="">Alle</option>';
    let gruppe = null; let optgroup = null;
    WildklassenService.sortiereNachWildgruppeUndWildklasse(basis.klassen).forEach((klasse) => {
      const gruppenId = String(klasse.wildgruppe_id || "");
      if (gruppenId !== gruppe) {
        gruppe = gruppenId; optgroup = document.createElement("optgroup");
        optgroup.label = klasse.wildgruppe_bezeichnung || "Ohne Wildgruppe"; select.append(optgroup);
      }
      optgroup.append(new Option(klasse.bezeichnung, klasse.id));
    });
    select.value = wert;
  }

  function rendern() {
    if (aktiveAnsicht === "hirsche") return hirscheRendern();
    const gefiltert = daten.filter((wert) =>
      (!el("fgJaeger").value || String(wert.jaeger.id) === el("fgJaeger").value) &&
      (!el("fgWildklasse").value || String(wert.wildklasse.id) === el("fgWildklasse").value) &&
      (!el("fgStatus").value || wert.status === el("fgStatus").value));
    if (el("fgJaeger").value) return einzelansichtRendern(gefiltert);
    sammelansichtRendern(gefiltert);
  }

  function datumsJahr(datum) { return datum ? Number(String(datum).slice(0, 4)) : null; }
  function datumKurz(datum) {
    if (!datum) return "–";
    const teile = String(datum).split("-");
    return teile.length === 3 ? `${teile[2]}.${teile[1]}.` : datum;
  }
  function matrixZustand(wert, jahr) {
    const jahresende = `${jahr}-12-31`;
    const ausnahme = wert.ausnahme;
    const sperre = ausnahme?.regel_typ === "SPERRE";
    const sperreAmJahresendeAktiv = sperre &&
      String(wert.individuelle_freigabe_ab || "9999-12-31") > jahresende;
    const kahlwildOffen = Number(wert.kahlwild?.erforderlich || 0) >
      Number(wert.kahlwild?.erlegt || 0) &&
      String(wert.normale_freigabe_ab || "9999-12-31") <= jahresende;
    const sonderImJahr = ausnahme && !sperre &&
      datumsJahr(wert.individuelle_freigabe_ab) === Number(jahr);
    if (sperreAmJahresendeAktiv) return "nicht-frei";
    if (kahlwildOffen) return "kahlwild";
    if (sonderImJahr) return "sonder";
    const wirksameFreigabe = sperre
      ? wert.normale_freigabe_ab
      : wert.endgueltige_freigabe_ab;
    return String(wirksameFreigabe || "9999-12-31") <= jahresende
      ? "frei" : "nicht-frei";
  }
  function matrixGrund(wert, zustand) {
    if (zustand === "kahlwild") {
      return `Kahlwildpflicht nicht erfüllt (${Number(wert.kahlwild?.erlegt || 0)} / ${Number(wert.kahlwild?.erforderlich || 0)} Kahlwild)`;
    }
    return wert.grund || (zustand === "frei" ? "Frei" : "Nicht frei");
  }
  function istSonderregel(wert) {
    return Boolean(wert?.ausnahme && wert.ausnahme.regel_typ !== "SPERRE");
  }
  function istFixesFreigabedatum(regel) {
    const datum = regel?.frei_ab;
    return Boolean(datum && String(datum).slice(5) !== "01-01");
  }
  function matrixPlan(jaegerId, wildklasseId, jahre, zentralesJahr) {
    const werte = new Map(jahre.map((jahr) =>
      [jahr, freigabeFinden(jahr, jaegerId, wildklasseId)]));
    const aktuell = werte.get(zentralesJahr) || null;
    const zukunft = jahre.filter((jahr) => jahr >= zentralesJahr);
    const sonderJahr = zukunft.find((jahr) => istSonderregel(werte.get(jahr)));
    if (sonderJahr != null) {
      const zielWert = werte.get(sonderJahr);
      return {
        werte, zielJahr: sonderJahr, zielZustand: "sonder", zielWert,
        tatsaechlichesFreigabeJahr: datumsJahr(zielWert?.individuelle_freigabe_ab) || sonderJahr,
        fixesFreigabedatum: istFixesFreigabedatum(zielWert?.ausnahme),
        bereitsVorherFrei: false,
      };
    }
    if (!aktuell) return { werte, zielJahr: null, zielZustand: "nicht-frei", zielWert: null };

    const sperre = aktuell.ausnahme?.regel_typ === "SPERRE";
    const normaleFreigabe = String(aktuell.normale_freigabe_ab || "9999-12-31");
    const sperrEnde = String(aktuell.individuelle_freigabe_ab || "0000-01-01");
    const relevanteFreigabe = sperre && normaleFreigabe > sperrEnde
      ? normaleFreigabe
      : String(aktuell.endgueltige_freigabe_ab || "9999-12-31");
    const freigabeJahr = datumsJahr(relevanteFreigabe);
    const bereitsVorherFrei = Boolean(freigabeJahr && freigabeJahr < zentralesJahr);
    const zielJahr = bereitsVorherFrei
      ? zentralesJahr - 1
      : freigabeJahr || null;
    const imZieljahr = werte.get(zielJahr) || aktuell;
    const kahlwildOffen = Number(aktuell.kahlwild?.erforderlich || 0) > Number(aktuell.kahlwild?.erlegt || 0) &&
      normaleFreigabe <= `${zentralesJahr}-12-31`;
    return {
      werte,
      zielJahr,
      zielZustand: kahlwildOffen ? "kahlwild" : "frei",
      zielWert: imZieljahr,
      tatsaechlichesFreigabeJahr: freigabeJahr,
      fixesFreigabedatum: istFixesFreigabedatum(aktuell.ausnahme) ||
        istFixesFreigabedatum(aktuell.initial_regel),
      bereitsVorherFrei,
    };
  }
  function vorjahrAnzeige(wert, jahr) {
    if (!wert) return "";
    const individuell = wert.individuelle_freigabe_ab;
    if (datumsJahr(individuell) === Number(jahr)) return `ab ${datumKurz(individuell)}`;
    if ((wert.letzte_erlegung || wert.initial_regel || wert.ausnahme) &&
        datumsJahr(wert.endgueltige_freigabe_ab) === Number(jahr)) return String(jahr);
    if (datumsJahr(wert.letzte_erlegung) === Number(jahr)) return datumKurz(wert.letzte_erlegung);
    return "";
  }
  function hirschKlasse(name) {
    return basis?.klassen.find((klasse) => norm(klasse.bezeichnung) === norm(name));
  }
  function freigabeFinden(jahr, jaegerId, wildklasseId) {
    return (jahresdaten.get(Number(jahr)) || []).find((wert) =>
      String(wert.jaeger.id) === String(jaegerId) &&
      String(wert.wildklasse.id) === String(wildklasseId));
  }
  function ausgewaehlteJaeger() {
    return (basis?.jaeger || []).filter((jaeger) =>
      !el("fgJaeger").value || String(jaeger.id) === el("fgJaeger").value)
      .sort((a, b) => String(a.nachname || "").localeCompare(String(b.nachname || ""), "de") ||
        String(a.vorname || "").localeCompare(String(b.vorname || ""), "de") ||
        Number(a.personen_nr || a.nr || 0) - Number(b.personen_nr || b.nr || 0));
  }
  function jaegerAlphabetisch(a, b) {
    return String(a.nachname || "").localeCompare(String(b.nachname || ""), "de") ||
      String(a.vorname || "").localeCompare(String(b.vorname || ""), "de") ||
      Number(a.personen_nr || a.nr || 0) - Number(b.personen_nr || b.nr || 0);
  }
  function hirscheRendern() {
    const jahre = matrixJahre();
    const zentralesJahr = Number(el("fgJahr").value);
    el("fgHirschJahr").textContent = `Hirschfreigaben ${zentralesJahr}`;
    const container = el("fgHirschMatrizen"); container.innerHTML = "";
    ["Hirsch A", "Hirsch B"].forEach((name) => {
      const klasse = hirschKlasse(name);
      if (!klasse) return;
      if (el("fgWildklasse").value && String(el("fgWildklasse").value) !== String(klasse.id)) return;
      const section = document.createElement("section"); section.className = "hirsch-matrix-section";
      const titel = document.createElement("h3"); titel.textContent = name;
      const scroll = document.createElement("div"); scroll.className = "hirsch-matrix-scroll";
      const table = document.createElement("table"); table.className = "hirsch-matrix";
      const thead = document.createElement("thead"); const kopf = document.createElement("tr");
      ["Nr.", "Nachname", "Vorname", ...jahre].forEach((wert, index) => {
        const th = document.createElement("th");
        if (index < 3) th.textContent = wert;
        else {
          const jahr = Number(wert);
          const rolle = jahr === zentralesJahr - 1 ? "Vorjahr"
            : jahr === zentralesJahr ? "Aktuell" : "Folgejahr";
          const label = document.createElement("small"); label.textContent = rolle;
          const jahreszahl = document.createElement("strong"); jahreszahl.textContent = jahr;
          th.classList.add("hirsch-jahreskopf"); th.append(label, jahreszahl);
        }
        if (index < 3) th.className = `hirsch-sticky hirsch-sticky-${index + 1}`;
        kopf.append(th);
      });
      thead.append(kopf); const tbody = document.createElement("tbody");
      const jaegerPlaene = ausgewaehlteJaeger().map((jaeger) => ({
        jaeger,
        plan: matrixPlan(jaeger.id, klasse.id, jahre, zentralesJahr),
      }));
      if (nachJahrenSortieren) {
        jaegerPlaene.sort((a, b) =>
          Number(a.plan.tatsaechlichesFreigabeJahr ?? Number.POSITIVE_INFINITY) -
            Number(b.plan.tatsaechlichesFreigabeJahr ?? Number.POSITIVE_INFINITY) ||
          Number(Boolean(a.plan.fixesFreigabedatum)) - Number(Boolean(b.plan.fixesFreigabedatum)) ||
          jaegerAlphabetisch(a.jaeger, b.jaeger));
      }
      jaegerPlaene.forEach(({ jaeger, plan }) => {
        const imFilterjahr = plan.werte.get(zentralesJahr);
        if (el("fgStatus").value && imFilterjahr) {
          const status = plan.zielJahr <= zentralesJahr && ["frei", "sonder"].includes(plan.zielZustand)
            ? "FREI" : "NICHT FREI";
          if (status !== el("fgStatus").value) return;
        }
        const tr = document.createElement("tr");
        [jaeger.personen_nr ?? jaeger.nr ?? "–", jaeger.nachname || "", jaeger.vorname || ""].forEach((wert, index) => {
          const td = document.createElement("td"); td.textContent = wert; td.className = `hirsch-sticky hirsch-sticky-${index + 1}`; tr.append(td);
        });
        jahre.forEach((jahr) => {
          const wert = plan.werte.get(jahr);
          const td = document.createElement("td"); td.className = "hirsch-jahreszelle nicht-frei";
          if (wert) {
            const istVorjahr = jahr === zentralesJahr - 1;
            const istZieljahr = jahr === plan.zielJahr;
            const zustand = istZieljahr ? plan.zielZustand : istVorjahr ? "historisch" : "nicht-frei";
            const grund = istZieljahr && plan.bereitsVorherFrei
              ? (plan.zielZustand === "kahlwild"
                ? `Kahlwildpflicht nicht erfüllt (frei seit ${plan.tatsaechlichesFreigabeJahr})`
                : `Frei seit ${plan.tatsaechlichesFreigabeJahr}`)
              : istVorjahr
              ? (vorjahrAnzeige(wert, jahr) ? matrixGrund(wert, matrixZustand(wert, jahr)) : "Keine relevante Freigabe im Vorjahr")
              : istZieljahr ? matrixGrund(plan.zielWert || wert, zustand) : "Nicht das nächste Freigabejahr";
            td.className = `hirsch-jahreszelle ${zustand}`;
            td.textContent = istZieljahr && plan.bereitsVorherFrei ? `seit ${plan.tatsaechlichesFreigabeJahr}`
              : istVorjahr ? vorjahrAnzeige(wert, jahr)
              : zustand === "sonder" ? `ab ${datumKurz((plan.zielWert || wert).individuelle_freigabe_ab)}`
              : zustand === "nicht-frei" ? "" : String(jahr);
            td.title = grund; td.tabIndex = 0; td.setAttribute("role", "button");
            td.setAttribute("aria-label", `${jaeger.vorname} ${jaeger.nachname}, ${name}, ${jahr}: ${grund}`);
            td.addEventListener("click", () => hirschDetailOeffnen(istZieljahr ? (plan.zielWert || wert) : wert, jahr, name, zustand, grund));
            td.addEventListener("keydown", (event) => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); td.click(); } });
          }
          tr.append(td);
        });
        tbody.append(tr);
      });
      table.append(thead, tbody); scroll.append(table); section.append(titel, scroll); container.append(section);
    });
    if (!container.children.length) container.innerHTML = '<p class="freigabe-empty">Keine Hirschfreigaben für diese Filter.</p>';
  }
  function hirschDetailOeffnen(wert, jahr, name, zustand, grundText = null) {
    el("fgHirschDetailTitel").textContent = `${wert.jaeger.vorname} ${wert.jaeger.nachname} – ${name} – ${jahr}`;
    const ausnahme = wert.ausnahme;
    const details = [
      ["Status", zustand === "historisch" ? "Historische Information" : zustand === "sonder" ? "Sonderfreigabe" : zustand === "kahlwild" ? "Kahlwildpflicht offen" : zustand === "frei" ? "Frei" : "Nicht frei"],
      ["Frei ab", wert.endgueltige_freigabe_ab || "–"],
      ["Normale Freigabe", wert.normale_freigabe_ab || "–"],
      ["Regel", ausnahme ? (AbschussregelnService.REGELTYPEN.find(([typ]) => typ === ausnahme.regel_typ)?.[1] || ausnahme.regel_typ) : wert.initial_regel ? "Initial" : "–"],
      ["Bemerkung", ausnahme?.bemerkung || wert.initial_regel?.bemerkung || "–"],
      ["Grund", grundText || matrixGrund(wert, zustand)],
    ];
    const dl = el("fgHirschDetailInhalt"); dl.innerHTML = "";
    details.forEach(([label, inhalt]) => { const dt = document.createElement("dt"); const dd = document.createElement("dd"); dt.textContent = label; dd.textContent = inhalt; dl.append(dt, dd); });
    const modal = el("fgHirschDetail"); modal.style.display = "block"; modal.setAttribute("aria-hidden", "false"); el("fgHirschDetailOk").focus();
  }
  function hirschDetailSchliessen() { const modal = el("fgHirschDetail"); modal.style.display = "none"; modal.setAttribute("aria-hidden", "true"); }

  function sammelansichtRendern(gefiltert) {
    el("fgEinzelansicht").hidden = true; el("fgSammelansicht").hidden = false;
    const body = el("fgBody"); body.innerHTML = "";
    gefiltert.forEach((wert) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td data-label="Jäger">${esc(`${wert.jaeger.vorname} ${wert.jaeger.nachname}`)}</td>` +
        `<td data-label="Wildklasse">${esc(wert.wildklasse.bezeichnung)}</td>${statusZellen(wert)}`;
      body.append(tr);
    });
    if (!gefiltert.length) body.innerHTML = '<tr><td colspan="6">Keine Freigaben für diese Filter.</td></tr>';
  }

  const norm = (wert) => String(wert || "").trim().toLocaleLowerCase("de");
  function anzeigeKlasse(wert) {
    const gruppe = norm(wert.wildklasse.wildgruppe_bezeichnung);
    const klasse = norm(wert.wildklasse.bezeichnung);
    if (gruppe === "rotwild" && ["kalb männlich", "kalb weiblich"].includes(klasse)) return "Kalb";
    return wert.wildklasse.bezeichnung;
  }
  function ansichtszeilen(gruppe, werte) {
    const gruppiert = new Map();
    werte.forEach((wert) => {
      const name = anzeigeKlasse(wert);
      if (!gruppiert.has(name)) gruppiert.set(name, []);
      gruppiert.get(name).push(wert);
    });
    return [...gruppiert.entries()].map(([name, eintraege]) => {
      if (eintraege.length === 1) return { ...eintraege[0], anzeige_name: name };
      const erlegungen = eintraege.map((wert) => wert.letzte_erlegung).filter(Boolean).sort();
      const freiDaten = eintraege.map((wert) => wert.frei_ab).filter(Boolean).sort();
      const normaleDaten = eintraege.map((wert) => wert.normale_freigabe_ab).filter(Boolean).sort();
      const individuelleDaten = eintraege.map((wert) => wert.individuelle_freigabe_ab).filter(Boolean).sort();
      const letzteErlegung = erlegungen[erlegungen.length - 1] || null;
      const freiAb = freiDaten[freiDaten.length - 1] || null;
      const nichtFrei = eintraege.find((wert) => wert.status === "NICHT FREI");
      const gruende = [...new Set(eintraege.map((wert) => wert.grund).filter(Boolean))];
      return {
        ...eintraege[0], anzeige_name: name, letzte_erlegung: letzteErlegung, frei_ab: freiAb,
        normale_freigabe_ab: normaleDaten[normaleDaten.length - 1] || null,
        individuelle_freigabe_ab: individuelleDaten[0] || null,
        endgueltige_freigabe_ab: freiAb,
        status: nichtFrei ? "NICHT FREI" : "FREI", grund: gruende.join(" / "),
      };
    }).sort((a, b) => WildklassenService.vergleicheNachWildgruppeUndWildklasse(a.wildklasse, b.wildklasse));
  }
  function einzelansichtRendern(gefiltert) {
    el("fgSammelansicht").hidden = true; el("fgEinzelansicht").hidden = false;
    const jaeger = gefiltert[0]?.jaeger || basis.jaeger.find((wert) => String(wert.id) === el("fgJaeger").value);
    el("fgEinzelTitel").textContent = jaeger ? `Freigaben – ${jaeger.vorname} ${jaeger.nachname}` : "Freigaben";
    const container = el("fgWildgruppen"); container.innerHTML = "";
    const gruppen = new Map();
    gefiltert.forEach((wert) => {
      const gruppe = wert.wildklasse.wildgruppe_bezeichnung || "Ohne Wildgruppe";
      if (!gruppen.has(gruppe)) gruppen.set(gruppe, []);
      gruppen.get(gruppe).push(wert);
    });
    [...gruppen.entries()].sort((a, b) =>
      WildklassenService.vergleicheNachWildgruppeUndWildklasse(a[1][0]?.wildklasse, b[1][0]?.wildklasse))
      .forEach(([gruppe, werte]) => {
      const section = document.createElement("section"); section.className = "freigabe-wildgruppe";
      const titel = document.createElement("h3"); titel.textContent = gruppe; section.append(titel);
      const wrap = document.createElement("div"); wrap.className = "table-wrap";
      const table = document.createElement("table"); table.className = "ap-table freigabe-einzeltabelle";
      table.innerHTML = "<thead><tr><th>Wildklasse</th><th>Letzte Erlegung</th><th>Frei ab</th><th>Status</th><th>Grund</th></tr></thead><tbody></tbody>";
      const body = table.querySelector("tbody");
      ansichtszeilen(gruppe, werte).forEach((wert) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td data-label="Wildklasse">${esc(wert.anzeige_name)}</td>${statusZellen(wert)}`;
        body.append(tr);
      });
      wrap.append(table); section.append(wrap); container.append(section);
    });
    if (!gefiltert.length) container.innerHTML = '<p class="freigabe-empty">Keine Freigaben für diese Filter.</p>';
  }
  function statusZellen(wert) {
    return `<td data-label="Letzte Erlegung">${esc(jahrAnzeigen(wert.letzte_erlegung))}</td>` +
      `<td data-label="Frei ab">${esc(jahrAnzeigen(wert.endgueltige_freigabe_ab || wert.frei_ab))}</td>` +
      `<td data-label="Status"><strong class="freigabe-status ${wert.status === "FREI" ? "frei" : "nicht-frei"}">${esc(wert.status)}</strong></td>` +
      `<td data-label="Grund" class="freigabe-grund">${esc(wert.grund)}</td>`;
  }

  return { init };
})();
