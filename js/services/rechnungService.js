const RechnungService = (() => {
  const db = window.db || window.supabase;
  const rechnungSelect = `
    id, rechnungsjahr, laufnummer, rechnungsnummer, person_id, excel_vorlage_id,
    rechnungsdatum, faellig_am, verwendungszweck, gesamtbetrag,
    vorlage_snapshot, erstellt_am, geaendert_am,
    person:personen (id, personen_nr, vorname, nachname, adresse, plz, ort),
    positionen:rechnungspositionen (
      id, rechnung_id, abschuss_id, position_nr, beschreibung, menge,
      einzelpreis, gesamtpreis, abschuss_nr, abschuss_jahr,
      abschuss_datum, wildgruppe, wildklasse
    )`;

  function serviceFehler(error, fallback) {
    console.error("Rechnungsfehler:", error);
    const result = new Error(error?.message || fallback);
    result.code = error?.code;
    result.details = error?.details;
    result.hint = error?.hint;
    return result;
  }

  function istWildhaendlerKlein(bezeichnung) {
    const wert = String(bezeichnung || "").trim().toLocaleLowerCase("de");
    return ["klein", "klein wildhändler"].includes(wert);
  }

  function istAbschussVerrechenbar(abschuss) {
    return Boolean(abschuss) && abschuss.fallwild !== true &&
      !istWildhaendlerKlein(abschuss.wildhaendler?.bezeichnung);
  }

  function sortierePositionen(rechnung) {
    if (rechnung?.positionen) {
      rechnung.positionen.sort((a, b) => Number(a.position_nr) - Number(b.position_nr));
    }
    return rechnung;
  }

  async function getRechnungen() {
    const { data, error } = await db.from("rechnungen").select(rechnungSelect)
      .order("rechnungsdatum", { ascending: false })
      .order("laufnummer", { ascending: false });
    if (error) throw serviceFehler(error, "Rechnungen konnten nicht geladen werden.");
    return (data || []).map(sortierePositionen);
  }

  async function getRechnung(id) {
    const { data, error } = await db.from("rechnungen").select(rechnungSelect)
      .eq("id", id).single();
    if (error) throw serviceFehler(error, "Die Rechnung konnte nicht geladen werden.");
    return sortierePositionen(data);
  }

  async function getPersonen() {
    const { data, error } = await db.from("personen")
      .select("id, personen_nr, vorname, nachname, adresse, plz, ort, aktiv, name_kat")
      .neq("name_kat", "Hundefuehrer")
      .order("personen_nr", { ascending: true, nullsFirst: false });
    if (error) throw serviceFehler(error, "Personen konnten nicht geladen werden.");
    return data || [];
  }

  async function getVerrechenbareAbschuesse(aktuelleRechnungId = null) {
    const [abschussResult, positionResult] = await Promise.all([
      db.from("abschuesse").select(`
        id, nr, jahr, datum, gewicht, preis_pro_kg, gesamtpreis,
        fallwild, wildhaendler_id, wildhaendler (id, bezeichnung),
        wildgruppen (id, bezeichnung), wildklassen (id, bezeichnung)
      `).eq("fallwild", false).order("datum", { ascending: false })
        .order("nr", { ascending: false }),
      db.from("rechnungspositionen").select("abschuss_id, rechnung_id"),
    ]);
    if (abschussResult.error) {
      throw serviceFehler(abschussResult.error, "Abschüsse konnten nicht geladen werden.");
    }
    if (positionResult.error) {
      throw serviceFehler(positionResult.error, "Verrechnete Abschüsse konnten nicht geprüft werden.");
    }
    const belegt = new Set((positionResult.data || [])
      .filter((item) => item.rechnung_id !== aktuelleRechnungId)
      .map((item) => String(item.abschuss_id)));
    return (abschussResult.data || []).filter((abschuss) =>
      istAbschussVerrechenbar(abschuss) && !belegt.has(String(abschuss.id)));
  }

  async function saveRechnung({ id = null, personId, rechnungsdatum, abschussIds }) {
    if (!Array.isArray(abschussIds) || abschussIds.length < 1 || abschussIds.length > 2) {
      throw new Error("Eine Rechnung muss einen oder zwei Abschüsse enthalten.");
    }
    const { data, error } = await db.rpc("save_rechnung", {
      p_rechnung_id: id,
      p_person_id: personId,
      p_rechnungsdatum: rechnungsdatum,
      p_abschuss_ids: abschussIds,
    });
    if (error) throw serviceFehler(error, "Die Rechnung konnte nicht gespeichert werden.");
    return data;
  }

  async function deleteRechnung(id) {
    const { error } = await db.from("rechnungen").delete().eq("id", id);
    if (error) throw serviceFehler(error, "Die Rechnung konnte nicht gelöscht werden.");
  }

  async function ergaenzeFehlendeVorlagenwerte(rechnung) {
    const { data, error } = await db.from("rechnungsvorlagen").select("*").eq("id", 1).single();
    if (error) throw serviceFehler(error, "Die Rechnungsvorlage konnte nicht geladen werden.");
    const snapshot = { ...(rechnung.vorlage_snapshot || {}) };
    Object.entries(data || {}).forEach(([feld, wert]) => {
      const vorhanden = snapshot[feld];
      const fehlt = vorhanden === null || vorhanden === undefined ||
        (typeof vorhanden === "string" && !vorhanden.trim());
      if (fehlt && wert !== null && wert !== undefined) snapshot[feld] = wert;
    });
    return { ...rechnung, vorlage_snapshot: snapshot };
  }

  function epcPayload(rechnung) {
    const vorlage = rechnung.vorlage_snapshot || {};
    const iban = String(vorlage.iban || "").replace(/\s/g, "").toUpperCase();
    const bic = String(vorlage.bic || "").replace(/\s/g, "").toUpperCase();
    const empfaenger = String(vorlage.vereinsname || vorlage.absender_name || "").trim();
    if (!empfaenger) throw new Error("In der Rechnungsvorlage fehlt der Vereinsname.");
    if (!iban) throw new Error("In der Rechnungsvorlage fehlt die IBAN.");
    return [
      "BCD", "002", "1", "SCT", bic, empfaenger, iban,
      `EUR${Number(rechnung.gesamtbetrag || 0).toFixed(2)}`,
      "", "", rechnung.verwendungszweck || rechnung.rechnungsnummer, "",
    ].join("\n");
  }

  async function ladeRechnungslogo(rechnung) {
    const snapshotPath = rechnung?.vorlage_snapshot?.logo_storage_path;
    const { data: vorlage } = snapshotPath ? { data: null } : await db.from("rechnungsvorlagen")
      .select("logo_storage_path").eq("id", 1).single();
    const logoPath = snapshotPath || vorlage?.logo_storage_path;
    if (logoPath) {
      const { data, error } = await db.storage.from("rechnungsvorlagen")
        .download(logoPath);
      if (error) throw serviceFehler(error, "Das Rechnungslogo konnte nicht geladen werden.");
      return blobAlsDataUrl(data);
    }
    const response = await fetch(new URL("assets/rechnung-logo.png", window.location.href));
    if (!response.ok) throw new Error("Das Rechnungslogo konnte nicht geladen werden.");
    return blobAlsDataUrl(await response.blob());
  }

  function blobAlsDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Das Rechnungslogo konnte nicht eingebettet werden."));
      reader.readAsDataURL(blob);
    });
  }

  async function ladeExcelVorlage(rechnung) {
    if (!rechnung?.excel_vorlage_id) return null;
    const { data: meta, error } = await db.from("rechnung_excel_vorlagen")
      .select("storage_path").eq("id", rechnung.excel_vorlage_id).maybeSingle();
    if (error) throw serviceFehler(error, "Die aktive Excel-Vorlage konnte nicht geladen werden.");
    if (!meta) return null;
    const { data, error: downloadError } = await db.storage.from("rechnungsvorlagen")
      .download(meta.storage_path);
    if (downloadError) throw serviceFehler(downloadError, "Die aktive Excel-Vorlage konnte nicht geladen werden.");
    return data.arrayBuffer();
  }

  async function generatePdf(rechnungOderId, druckFenster = null) {
    let rechnung = typeof rechnungOderId === "string"
      ? await getRechnung(rechnungOderId) : rechnungOderId;
    if (!rechnung || !(rechnung.positionen || []).length) {
      throw new Error("Die Rechnung enthält keine Rechnungspositionen.");
    }
    if (rechnung.positionen.length > 2) {
      throw new Error("Die Excel-Rechnungsvorlage unterstützt höchstens zwei Abschüsse.");
    }
    rechnung = await ergaenzeFehlendeVorlagenwerte(rechnung);
    const erlaubt = new Set((await getVerrechenbareAbschuesse(rechnung.id))
      .map((abschuss) => String(abschuss.id)));
    if (rechnung.positionen.some((position) => !erlaubt.has(String(position.abschuss_id)))) {
      throw new Error("Für Fallwild oder Wildhändler „Klein“ darf keine Rechnung erzeugt werden.");
    }
    if (!window.EpcQr?.toSvg || typeof RechnungPrintService === "undefined") {
      throw new Error("Die Rechnungs-Druckvorlage ist nicht verfügbar.");
    }
    const target = druckFenster || window.open("", "_blank");
    if (!target) throw new Error("Die Druckansicht wurde vom Browser blockiert.");

    const [logoDataUrl, excelVorlage] = await Promise.all([
      ladeRechnungslogo(rechnung), ladeExcelVorlage(rechnung),
    ]);
    const qrSvg = EpcQr.toSvg(epcPayload(rechnung), { title: "ELBA Zahlungs-QR-Code" });
    const printHtml = await RechnungPrintService.render({ rechnung, logoDataUrl, qrSvg, excelVorlage });
    target.document.open();
    target.document.write(printHtml);
    target.document.close();
    target.document.getElementById("invoicePdfButton")
      ?.addEventListener("click", () => target.print());
    target.document.getElementById("invoicePrintButton")
      ?.addEventListener("click", () => target.print());
    target.document.getElementById("invoiceBackButton")
      ?.addEventListener("click", () => {
        if (target.opener && !target.opener.closed) {
          if (target.opener.Router?.currentPage !== "rechnungen") {
            target.opener.Router?.open("rechnungen");
          }
          target.opener.focus();
        }
        target.close();
      });
    const logo = target.document.querySelector(".print-logo");
    if (logo && !logo.complete) {
      await new Promise((resolve) => {
        logo.addEventListener("load", resolve, { once: true });
        logo.addEventListener("error", resolve, { once: true });
      });
    }
    target.focus();
  }

  return {
    getRechnungen, getRechnung, getPersonen, getVerrechenbareAbschuesse,
    saveRechnung, deleteRechnung, generatePdf,
    istAbschussVerrechenbar, istWildhaendlerKlein,
  };
})();
