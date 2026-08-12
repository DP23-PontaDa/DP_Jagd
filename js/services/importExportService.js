/* ==========================================
   DP_Jagd V2
   importExportService.js
========================================== */

const ImportExportService = (() => {
  const db = window.db || window.supabase;

  function normalisieren(value) {
    return String(value ?? "")
      .trim()
      .toLocaleLowerCase("de")
      .replace(/\s+/g, " ");
  }

  function vollname(person) {
    return [person.vorname, person.nachname].filter(Boolean).join(" ").trim();
  }

  function datumDeutsch(value) {
    const teile = String(value || "").split("-");
    return teile.length === 3
      ? `${teile[2]}.${teile[1]}.${teile[0]}`
      : String(value || "");
  }

  function istGueltigesDatum(value) {
    const text = String(value || "");
    const treffer = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!treffer) return false;
    const datum = new Date(Date.UTC(
      Number(treffer[1]),
      Number(treffer[2]) - 1,
      Number(treffer[3]),
    ));
    return datum.getUTCFullYear() === Number(treffer[1]) &&
      datum.getUTCMonth() === Number(treffer[2]) - 1 &&
      datum.getUTCDate() === Number(treffer[3]);
  }

  async function getExportAbschuesse(filter) {
    const { data, error } = await db
      .from("abschuesse")
      .select(`
        id, nr, datum, jaeger_id, wildgruppe_id, wildklasse_id, gewicht,
        preis_pro_kg, gesamtpreis, wildhaendler_id, zahlungseingang,
        zusatzinfo, bemerkung, fallwild, untersuchungsprotokoll_nr,
        jaeger:personen (id, vorname, nachname),
        wildgruppen (id, bezeichnung),
        wildklassen (id, bezeichnung, wildgruppe_id),
        wildhaendler (id, bezeichnung)
      `)
      .order("datum", { ascending: false })
      .order("nr", { ascending: false });

    if (error) throw error;

    const aktuell = filter || {
      search: "",
      jahr: String(new Date().getFullYear()),
      wildgruppeId: "",
      jaegerId: "",
      wildhaendlerId: "",
      fallwild: "false",
    };
    const suche = normalisieren(aktuell.search);

    return (data || []).filter((abschuss) => {
      if (
        aktuell.jahr &&
        String(abschuss.datum || "").slice(0, 4) !== String(aktuell.jahr)
      ) return false;
      if (
        aktuell.wildgruppeId &&
        String(abschuss.wildgruppe_id) !== String(aktuell.wildgruppeId)
      ) return false;
      if (
        aktuell.jaegerId &&
        String(abschuss.jaeger_id) !== String(aktuell.jaegerId)
      ) return false;
      if (
        aktuell.wildhaendlerId &&
        String(abschuss.wildhaendler_id) !== String(aktuell.wildhaendlerId)
      ) return false;
      if (
        aktuell.fallwild &&
        String(abschuss.fallwild === true) !== String(aktuell.fallwild)
      ) return false;
      if (!suche) return true;

      return [
        abschuss.nr,
        abschuss.datum,
        datumDeutsch(abschuss.datum),
        vollname(abschuss.jaeger || {}),
        abschuss.wildgruppen?.bezeichnung,
        abschuss.wildklassen?.bezeichnung,
        abschuss.wildhaendler?.bezeichnung,
        abschuss.zusatzinfo,
        abschuss.bemerkung,
        abschuss.untersuchungsprotokoll_nr,
      ].some((wert) => normalisieren(wert).includes(suche));
    });
  }

  function exportZeilen(abschuesse) {
    return (abschuesse || []).map((abschuss) => ({
      Nr: abschuss.nr,
      Datum: abschuss.datum,
      "Jäger": vollname(abschuss.jaeger || {}),
      Wildgruppe: abschuss.wildgruppen?.bezeichnung || "",
      Wildklasse: abschuss.wildklassen?.bezeichnung || "",
      Gewicht: abschuss.gewicht ?? "",
      "Preis/kg": abschuss.preis_pro_kg ?? "",
      Gesamtpreis: abschuss.gesamtpreis ?? 0,
      "Wildhändler": abschuss.wildhaendler?.bezeichnung || "",
      Zahlungseingang: abschuss.zahlungseingang || "",
      Fallwild: abschuss.fallwild ? "Ja" : "Nein",
      Zusatzinfo: abschuss.zusatzinfo || "",
      Bemerkung: abschuss.bemerkung || "",
      Untersuchungsprotokoll: abschuss.untersuchungsprotokoll_nr || "",
    }));
  }

  async function getImportReferenzen() {
    const [
      wildgruppenResult,
      wildklassenResult,
      jaegerResult,
      wildhaendlerResult,
      abschuesseResult,
    ] = await Promise.all([
      db.from("wildgruppen").select("id, code, bezeichnung, aktiv"),
      db.from("wildklassen")
        .select("id, code, bezeichnung, wildgruppe_id, aktiv"),
      db.from("abschuss_jaeger").select("id, vorname, nachname"),
      db.from("wildhaendler").select("id, code, bezeichnung, aktiv"),
      db.from("abschuesse").select(`
        id, nr, jahr, datum, jaeger_id, wildgruppe_id, wildklasse_id,
        gewicht, preis_pro_kg, wildhaendler_id, zahlungseingang,
        fallwild, zusatzinfo, bemerkung, untersuchungsprotokoll_nr
      `),
    ]);

    const fehler = [
      wildgruppenResult,
      wildklassenResult,
      jaegerResult,
      wildhaendlerResult,
      abschuesseResult,
    ].find((result) => result.error);
    if (fehler) throw fehler.error;

    return {
      wildgruppen: wildgruppenResult.data || [],
      wildklassen: wildklassenResult.data || [],
      jaeger: jaegerResult.data || [],
      wildhaendler: wildhaendlerResult.data || [],
      bestehendeAbschuesse: abschuesseResult.data || [],
    };
  }

  function indexNachName(daten, namenFunktion) {
    const index = new Map();
    daten.forEach((eintrag) => {
      const schluessel = normalisieren(namenFunktion(eintrag));
      if (!schluessel) return;
      if (!index.has(schluessel)) index.set(schluessel, []);
      index.get(schluessel).push(eintrag);
    });
    return index;
  }

  function fehlerHinzufuegen(fehler, zeile, spalte, beschreibung) {
    fehler.push({ zeile, spalte, beschreibung });
  }

  function eindeutigerTreffer(index, wert) {
    const treffer = index.get(normalisieren(wert)) || [];
    return treffer.length === 1 ? treffer[0] : null;
  }

  const ABSCHUSS_FELDNAMEN = {
    nr: "Nr",
    datum: "Datum",
    jaeger_id: "Jäger",
    wildgruppe_id: "Wildgruppe",
    wildklasse_id: "Wildklasse",
    gewicht: "Gewicht",
    preis_pro_kg: "Preis/kg",
    wildhaendler_id: "Wildhändler",
    zahlungseingang: "Zahlungseingang",
    fallwild: "Fallwild",
    zusatzinfo: "Zusatzinfo",
    bemerkung: "Bemerkung",
    untersuchungsprotokoll_nr: "Untersuchungsprotokoll",
  };

  function abschussAenderungen(bestehend, payload) {
    return Object.keys(ABSCHUSS_FELDNAMEN)
      .filter((feld) => !(feld === "nr" && payload.nr === null))
      .map((feld) => ({
        spalte: ABSCHUSS_FELDNAMEN[feld],
        feld,
        alt: bestehend?.[feld] ?? "",
        neu: payload[feld] ?? "",
      }))
      .filter((aenderung) =>
        String(aenderung.alt ?? "") !== String(aenderung.neu ?? ""));
  }

  function validiereImportZeilen(zeilen, referenzen) {
    const fehler = [];
    const warnungen = [];
    const payloads = [];
    const dubletten = [];
    const dateiDubletten = new Map();
    const bestehend = referenzen.bestehendeAbschuesse || [];
    const gruppenIndex = indexNachName(
      referenzen.wildgruppen,
      (eintrag) => eintrag.bezeichnung,
    );
    const jaegerIndex = indexNachName(referenzen.jaeger, vollname);
    const haendlerIndex = indexNachName(
      referenzen.wildhaendler,
      (eintrag) => eintrag.bezeichnung,
    );

    zeilen.forEach((daten, index) => {
      const zeile = index + 2;
      const nrText = String(daten.Nr ?? "").trim();
      const nr = nrText ? Number(daten.Nr) : null;
      const datum = String(daten.Datum || "");
      const jahr = /^\d{4}-\d{2}-\d{2}$/.test(datum)
        ? Number(datum.slice(0, 4))
        : null;
      const fallwildText = normalisieren(daten.Fallwild);
      const fallwild =
        ["ja", "true", "1", "x"].includes(fallwildText)
          ? true
          : ["nein", "false", "0"].includes(fallwildText)
            ? false
            : null;

      if (nr !== null && (!Number.isInteger(nr) || nr <= 0))
        fehlerHinzufuegen(
          fehler, zeile, "Nr",
          "Falls angegeben, ist eine positive ganze Nummer erforderlich.",
        );
      if (!jahr || !istGueltigesDatum(datum))
        fehlerHinzufuegen(fehler, zeile, "Datum", "Gültiges Datum erforderlich.");
      if (fallwild === null)
        fehlerHinzufuegen(fehler, zeile, "Fallwild", "Erlaubt sind Ja oder Nein.");

      const wildgruppe = eindeutigerTreffer(gruppenIndex, daten.Wildgruppe);
      if (!wildgruppe)
        fehlerHinzufuegen(
          fehler, zeile, "Wildgruppe",
          "Wildgruppe fehlt, ist unbekannt oder nicht eindeutig.",
        );
      else if (wildgruppe.aktiv === false)
        warnungen.push({
          zeile,
          spalte: "Wildgruppe",
          beschreibung: "Wildgruppe ist deaktiviert.",
        });

      const wildklasseTreffer = referenzen.wildklassen.filter(
        (eintrag) =>
          wildgruppe &&
          String(eintrag.wildgruppe_id) === String(wildgruppe.id) &&
          normalisieren(eintrag.bezeichnung) === normalisieren(daten.Wildklasse),
      );
      const wildklasse =
        wildklasseTreffer.length === 1 ? wildklasseTreffer[0] : null;
      if (!wildklasse)
        fehlerHinzufuegen(
          fehler, zeile, "Wildklasse",
          "Wildklasse fehlt, ist unbekannt oder gehört nicht eindeutig zur Wildgruppe.",
        );
      else if (wildklasse.aktiv === false)
        warnungen.push({
          zeile,
          spalte: "Wildklasse",
          beschreibung: "Wildklasse ist deaktiviert.",
        });

      const person = eindeutigerTreffer(jaegerIndex, daten["Jäger"]);
      if (!person)
        fehlerHinzufuegen(
          fehler, zeile, "Jäger",
          "Jäger fehlt, ist unbekannt oder nicht eindeutig.",
        );

      const haendlerName = String(daten["Wildhändler"] || "").trim();
      const wildhaendler = haendlerName
        ? eindeutigerTreffer(haendlerIndex, haendlerName)
        : null;
      if (fallwild === false && !wildhaendler)
        fehlerHinzufuegen(
          fehler, zeile, "Wildhändler",
          "Für Nicht-Fallwild ist ein vorhandener Wildhändler erforderlich.",
        );
      if (haendlerName && !wildhaendler)
        fehlerHinzufuegen(
          fehler, zeile, "Wildhändler",
          "Wildhändler ist unbekannt oder nicht eindeutig.",
        );
      else if (wildhaendler?.aktiv === false)
        warnungen.push({
          zeile,
          spalte: "Wildhändler",
          beschreibung: "Wildhändler ist deaktiviert.",
        });

      const gewichtText = String(daten.Gewicht ?? "").trim();
      const gewicht = gewichtText === "" ? null : Number(gewichtText);
      if (
        (fallwild === false && (!Number.isFinite(gewicht) || gewicht <= 0)) ||
        (fallwild === true && gewicht !== null &&
          (!Number.isFinite(gewicht) || gewicht <= 0))
      ) {
        fehlerHinzufuegen(
          fehler, zeile, "Gewicht",
          "Gewicht muss numerisch und größer als 0 sein.",
        );
      }

      const preisText = String(daten["Preis/kg"] ?? "").trim();
      const preis = preisText === "" ? null : Number(preisText);
      if (preis !== null && (!Number.isFinite(preis) || preis < 0))
        fehlerHinzufuegen(
          fehler, zeile, "Preis/kg",
          "Preis muss numerisch und mindestens 0 sein.",
        );

      const zahlungseingang = String(daten.Zahlungseingang || "").trim();
      if (
        zahlungseingang &&
        !istGueltigesDatum(zahlungseingang)
      ) {
        fehlerHinzufuegen(
          fehler, zeile, "Zahlungseingang",
          "Zahlungseingang muss ein gültiges Datum sein.",
        );
      }

      if (jahr && Number.isInteger(nr)) {
        const schluessel = `${jahr}|${nr}`;
        if (dateiDubletten.has(schluessel)) {
          fehlerHinzufuegen(
            fehler, zeile, "Nr",
            `Dubletten mit Zeile ${dateiDubletten.get(schluessel)}.`,
          );
        } else {
          dateiDubletten.set(schluessel, zeile);
        }
      }

      if (
        wildhaendler &&
        normalisieren(wildhaendler.bezeichnung) === "klein wildhändler" &&
        !String(daten.Untersuchungsprotokoll || "").trim()
      ) {
        fehlerHinzufuegen(
          fehler, zeile, "Untersuchungsprotokoll",
          "Untersuchungsprotokoll ist für diesen Wildhändler erforderlich.",
        );
      }

      const payload = {
        nr,
        datum,
        jaeger_id: person?.id || null,
        wildgruppe_id: wildgruppe?.id || null,
        wildklasse_id: wildklasse?.id || null,
        gewicht,
        preis_pro_kg: preis,
        wildhaendler_id: fallwild ? null : wildhaendler?.id || null,
        zahlungseingang: zahlungseingang || null,
        fallwild: fallwild === true,
        zusatzinfo: String(daten.Zusatzinfo || "").trim() || null,
        bemerkung: String(daten.Bemerkung || "").trim() || null,
        untersuchungsprotokoll_nr:
          String(daten.Untersuchungsprotokoll || "").trim() || null,
      };

      const trefferNummer = jahr && Number.isInteger(nr)
        ? bestehend.find((abschuss) =>
          Number(abschuss.jahr) === jahr && Number(abschuss.nr) === nr)
        : null;
      const trefferMerkmale = trefferNummer ? null : bestehend.find((abschuss) =>
        String(abschuss.datum || "") === datum &&
        String(abschuss.jaeger_id || "") === String(payload.jaeger_id || "") &&
        String(abschuss.wildklasse_id || "") ===
          String(payload.wildklasse_id || "") &&
        Number(abschuss.gewicht) === Number(payload.gewicht));
      const treffer = trefferNummer || trefferMerkmale;
      const eintrag = {
        zeile,
        payload,
        bestehend: treffer || null,
        anzeige: {
          name: `Abschuss vom ${datum}`,
          nummer: nr ? `Abschussnummer ${nr} / ${jahr}` : "Ohne Abschussnummer",
        },
      };
      if (treffer) {
        eintrag.aenderungen = abschussAenderungen(treffer, payload);
        eintrag.grund = trefferNummer
          ? "Abschussnummer und Jahr"
          : "Datum, Jäger, Wildklasse und Gewicht";
        dubletten.push(eintrag);
      }
      payloads.push(eintrag);
    });

    return { fehler, warnungen, payloads, dubletten };
  }

  async function importAbschuesse(eintraege) {
    const bericht = {
      neu: 0,
      aktualisiert: 0,
      uebersprungen: 0,
      fehler: [],
      warnungen: [],
    };
    for (const eintrag of eintraege || []) {
      try {
        if (eintrag.entscheidung === "ueberspringen") {
          bericht.uebersprungen += 1;
          continue;
        }
        if (eintrag.entscheidung === "aktualisieren" && eintrag.bestehend) {
          const geaendert = Object.fromEntries(
            (eintrag.aenderungen || []).map((aenderung) => [
              aenderung.feld,
              eintrag.payload[aenderung.feld],
            ]),
          );
          if (!Object.keys(geaendert).length) {
            bericht.uebersprungen += 1;
            continue;
          }
          const result = await db.from("abschuesse")
            .update(geaendert).eq("id", eintrag.bestehend.id);
          if (result.error) throw result.error;
          bericht.aktualisiert += 1;
          continue;
        }

        const payload = { ...eintrag.payload };
        if (
          eintrag.entscheidung === "neu" && eintrag.bestehend &&
          Number(eintrag.bestehend.nr) === Number(payload.nr) &&
          Number(eintrag.bestehend.jahr) ===
            Number(String(payload.datum || "").slice(0, 4))
        ) {
          payload.nr = null;
          bericht.warnungen.push({
            zeile: eintrag.zeile,
            spalte: "Nr",
            beschreibung:
              "Für den neuen Abschuss wird wegen der bereits vergebenen Nummer automatisch eine neue Nummer erzeugt.",
          });
        }
        const result = await db.from("abschuesse").insert(payload);
        if (result.error) throw result.error;
        bericht.neu += 1;
      } catch (error) {
        bericht.fehler.push({
          zeile: eintrag.zeile,
          spalte: "Datenbank",
          beschreibung: error.message || "Abschuss konnte nicht gespeichert werden.",
        });
      }
    }
    return bericht;
  }

  const MITGLIED_FELDER = {
    Mitgliedsnummer: "personen_nr",
    Vorname: "vorname",
    Nachname: "nachname",
    "KJ-Nr": "kj_nr",
    Adresse: "adresse",
    PLZ: "plz",
    Ort: "ort",
    Aktiv: "aktiv",
    Kategorie: "name_kat",
  };

  function kategorieNormalisieren(value) {
    return normalisieren(value)
      .replace(/ä/g, "ae")
      .replace(/ö/g, "oe")
      .replace(/ü/g, "ue")
      .replace(/ß/g, "ss");
  }

  async function getPersonenkategorien() {
    const result = await db
      .from("personen_kategorien")
      .select("code, bezeichnung, reihenfolge")
      .order("reihenfolge", { ascending: true });
    if (result.error) throw result.error;
    return result.data || [];
  }

  function boolWert(value) {
    if (value === true || value === false) return value;
    const text = normalisieren(value);
    if (["ja", "true", "1", "x", "aktiv"].includes(text)) return true;
    if (["nein", "false", "0", "inaktiv"].includes(text)) return false;
    return null;
  }

  function mitgliedExportZeile(person) {
    return {
      Mitgliedsnummer: person.personen_nr ?? "",
      Vorname: person.vorname || "",
      Nachname: person.nachname || "",
      "KJ-Nr": person.kj_nr ?? "",
      Adresse: person.adresse || "",
      PLZ: person.plz || "",
      Ort: person.ort || "",
      Aktiv: person.aktiv === true ? "Ja" : "Nein",
      Kategorie: person.name_kat || "",
    };
  }

  async function getExportMitglieder(filter = {}) {
    const result = await db
      .from("personen")
      .select("*")
      .order("personen_nr", { ascending: true });
    if (result.error) throw result.error;

    const suche = normalisieren(filter.suche);
    return (result.data || []).filter((person) => {
      if (filter.aktiv === true && person.aktiv !== true) return false;
      if (filter.aktiv === false && person.aktiv === true) return false;
      if (
        filter.mitgliedsnummer &&
        !normalisieren(person.personen_nr).includes(
          normalisieren(filter.mitgliedsnummer),
        )
      ) return false;
      if (filter.ort && !normalisieren(person.ort).includes(normalisieren(filter.ort)))
        return false;
      if (!suche) return true;
      return Object.values(mitgliedExportZeile(person)).some((wert) =>
        normalisieren(wert).includes(suche));
    });
  }

  function exportMitgliederZeilen(mitglieder) {
    return (mitglieder || []).map(mitgliedExportZeile);
  }

  async function getMitgliederImportReferenzen() {
    const [personenResult, kategorien] = await Promise.all([
      db.from("personen").select("*"),
      getPersonenkategorien(),
    ]);
    if (personenResult.error) throw personenResult.error;
    return {
      bestehendeMitglieder: personenResult.data || [],
      personenkategorien: kategorien,
    };
  }

  function mitgliedPayload(daten) {
    const payload = {};
    Object.entries(MITGLIED_FELDER).forEach(([spalte, feld]) => {
      let wert = daten[spalte];
      if (feld === "aktiv") {
        const leer = String(wert ?? "").trim() === "";
        wert = leer ? true : boolWert(wert);
      }
      else if (["personen_nr", "kj_nr"].includes(feld)) {
        const nummer = String(wert ?? "").trim();
        wert = nummer ? Number(nummer) : null;
      } else wert = String(wert ?? "").trim() || null;
      payload[feld] = wert;
    });
    return payload;
  }

  function mitgliedAenderungen(bestehend, payload) {
    return Object.entries(MITGLIED_FELDER)
      .map(([spalte, feld]) => ({
        spalte,
        feld,
        alt: bestehend?.[feld] ?? "",
        neu: payload[feld] ?? "",
      }))
      .filter((aenderung) =>
        String(aenderung.alt ?? "") !== String(aenderung.neu ?? ""));
  }

  function validiereMitgliederImportZeilen(zeilen, referenzen) {
    const fehler = [];
    const warnungen = [];
    const payloads = [];
    const dubletten = [];
    const dateiNummern = new Map();
    const dateiPersonen = new Map();
    const bestehende = referenzen.bestehendeMitglieder || [];
    const kategorien = referenzen.personenkategorien || [];

    zeilen.forEach((daten, index) => {
      const zeile = index + 2;
      const payload = mitgliedPayload(daten);
      const kategorie = kategorien.find((eintrag) =>
        [eintrag.code, eintrag.bezeichnung].some((wert) =>
          kategorieNormalisieren(wert) === kategorieNormalisieren(payload.name_kat),
        ));
      if (!payload.name_kat) {
        fehlerHinzufuegen(
          fehler, zeile, "Kategorie", "Kategorie ist erforderlich.",
        );
      } else if (!kategorie) {
        fehlerHinzufuegen(
          fehler, zeile, "Kategorie",
          `Ungültige Personenkategorie: ${payload.name_kat}`,
        );
      } else {
        payload.name_kat = kategorie.code;
      }
      if (!payload.vorname)
        fehlerHinzufuegen(fehler, zeile, "Vorname", "Vorname ist erforderlich.");
      if (!payload.nachname)
        fehlerHinzufuegen(fehler, zeile, "Nachname", "Nachname ist erforderlich.");
      if (payload.aktiv === null)
        fehlerHinzufuegen(
          fehler, zeile, "Aktiv",
          "Falls angegeben, sind Ja oder Nein erlaubt.",
        );
      if (
        payload.personen_nr !== null &&
        (!Number.isInteger(payload.personen_nr) || payload.personen_nr <= 0)
      ) fehlerHinzufuegen(
        fehler, zeile, "Mitgliedsnummer",
        "Falls angegeben, muss die Mitgliedsnummer eine positive ganze Zahl sein.",
      );
      if (
        payload.kj_nr !== null &&
        (!Number.isInteger(payload.kj_nr) || payload.kj_nr <= 0)
      ) fehlerHinzufuegen(
        fehler, zeile, "KJ-Nr",
        "Falls angegeben, muss die KJ-Nr eine positive ganze Zahl sein.",
      );

      const nummerKey = payload.personen_nr === null
        ? ""
        : String(payload.personen_nr);
      const personKey = [payload.vorname, payload.nachname]
        .map(normalisieren).join("|");
      if (nummerKey && dateiNummern.has(nummerKey))
        fehlerHinzufuegen(
          fehler, zeile, "Mitgliedsnummer",
          `Dubletten mit Zeile ${dateiNummern.get(nummerKey)}.`,
        );
      else if (nummerKey) dateiNummern.set(nummerKey, zeile);
      if (dateiPersonen.has(personKey))
        fehlerHinzufuegen(
          fehler, zeile, "Vorname/Nachname",
          `Personendublette mit Zeile ${dateiPersonen.get(personKey)}.`,
        );
      else dateiPersonen.set(personKey, zeile);

      const trefferNummer = nummerKey
        ? bestehende.find((person) => String(person.personen_nr) === nummerKey)
        : null;
      const trefferPerson = bestehende.find((person) =>
        normalisieren(person.vorname) === normalisieren(payload.vorname) &&
        normalisieren(person.nachname) === normalisieren(payload.nachname));
      const treffer = trefferNummer || trefferPerson;
      const eintrag = { zeile, payload, bestehend: treffer || null };
      if (treffer) {
        eintrag.aenderungen = mitgliedAenderungen(treffer, payload);
        eintrag.grund = trefferNummer
          ? "Mitgliedsnummer"
          : "Vorname und Nachname";
        dubletten.push(eintrag);
      }
      payloads.push(eintrag);
    });

    return { fehler, warnungen, payloads, dubletten };
  }

  async function importMitglieder(eintraege) {
    const bericht = {
      neu: 0,
      aktualisiert: 0,
      uebersprungen: 0,
      fehler: [],
      warnungen: [],
    };
    for (const eintrag of eintraege || []) {
      try {
        if (eintrag.entscheidung === "ueberspringen") {
          bericht.uebersprungen += 1;
          continue;
        }
        if (eintrag.entscheidung === "aktualisieren" && eintrag.bestehend) {
          const geaendert = Object.fromEntries(
            (eintrag.aenderungen || []).map((aenderung) => [
              aenderung.feld,
              eintrag.payload[aenderung.feld],
            ]),
          );
          if (!Object.keys(geaendert).length) {
            bericht.uebersprungen += 1;
            continue;
          }
          const result = await db.from("personen")
            .update(geaendert).eq("id", eintrag.bestehend.id);
          if (result.error) throw result.error;
          bericht.aktualisiert += 1;
          continue;
        }

        const payload = { ...eintrag.payload };
        if (
          eintrag.entscheidung === "neu" &&
          eintrag.bestehend &&
          String(eintrag.bestehend.personen_nr || "") ===
            String(payload.personen_nr || "")
        ) {
          payload.personen_nr = null;
          bericht.warnungen.push({
            zeile: eintrag.zeile,
            spalte: "Mitgliedsnummer",
            beschreibung:
              "Beim neuen Mitglied wurde die bereits vergebene Mitgliedsnummer geleert.",
          });
        }
        const result = await db.from("personen").insert(payload);
        if (result.error) throw result.error;
        bericht.neu += 1;
      } catch (error) {
        bericht.fehler.push({
          zeile: eintrag.zeile,
          spalte: "Datenbank",
          beschreibung: error.message || "Mitglied konnte nicht gespeichert werden.",
        });
      }
    }
    return bericht;
  }

  return {
    getExportAbschuesse,
    exportZeilen,
    getImportReferenzen,
    validiereImportZeilen,
    importAbschuesse,
    getExportMitglieder,
    getPersonenkategorien,
    exportMitgliederZeilen,
    getMitgliederImportReferenzen,
    validiereMitgliederImportZeilen,
    importMitglieder,
  };
})();
