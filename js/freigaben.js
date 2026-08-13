window.Freigaben = (() => {
  const el = (id) => document.getElementById(id);
  const esc = (wert) => { const div = document.createElement("div"); div.textContent = wert ?? ""; return div.innerHTML; };
  let daten = []; let basis = null;

  async function init() {
    const jahr = new Date().getFullYear();
    for (let wert = jahr - 2; wert <= jahr + 2; wert += 1) el("fgJahr").add(new Option(wert, wert));
    el("fgJahr").value = jahr;
    ["fgJaeger", "fgWildklasse", "fgStatus"].forEach((id) => el(id).addEventListener("change", rendern));
    el("fgJahr").addEventListener("change", laden);
    await laden();
  }

  async function laden() {
    try {
      const ergebnis = await FreigabenService.laden(Number(el("fgJahr").value));
      daten = ergebnis.freigaben; basis = ergebnis.basis; optionen(); rendern();
    } catch (error) {
      console.error("Freigaben konnten nicht geladen werden:", error);
      AppFeedback.error(error.message || "Freigaben konnten nicht geladen werden.");
    }
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
    const gefiltert = daten.filter((wert) =>
      (!el("fgJaeger").value || String(wert.jaeger.id) === el("fgJaeger").value) &&
      (!el("fgWildklasse").value || String(wert.wildklasse.id) === el("fgWildklasse").value) &&
      (!el("fgStatus").value || wert.status === el("fgStatus").value));
    if (el("fgJaeger").value) return einzelansichtRendern(gefiltert);
    sammelansichtRendern(gefiltert);
  }

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
    return `<td data-label="Letzte Erlegung">${esc(wert.letzte_erlegung || "–")}</td>` +
      `<td data-label="Frei ab">${esc(wert.endgueltige_freigabe_ab || wert.frei_ab || "–")}</td>` +
      `<td data-label="Status"><strong class="freigabe-status ${wert.status === "FREI" ? "frei" : "nicht-frei"}">${esc(wert.status)}</strong></td>` +
      `<td data-label="Grund" class="freigabe-grund">${esc(wert.grund)}</td>`;
  }

  return { init };
})();
