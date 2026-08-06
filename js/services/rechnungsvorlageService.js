const RechnungsvorlageService = (() => {
  const db = window.db || window.supabase;

  async function getVorlage() {
    const { data, error } = await db.from("rechnungsvorlagen").select("*").eq("id", 1).single();
    if (error) throw error;
    return data;
  }

  async function saveVorlage(daten) {
    const { data, error } = await db.from("rechnungsvorlagen")
      .update(daten).eq("id", 1).select().single();
    if (error) throw error;
    return data;
  }

  async function getAktiveExcelVorlage() {
    const { data, error } = await db.from("rechnung_excel_vorlagen")
      .select("id, dateiname, storage_path, mime_type, dateigroesse, tabellenblatt, erstellt_am")
      .eq("aktiv", true).maybeSingle();
    if (error) throw error;
    return data;
  }

  async function downloadStorageDatei(path) {
    const { data, error } = await db.storage.from("rechnungsvorlagen").download(path);
    if (error) throw error;
    return data;
  }

  async function uploadExcelVorlage(datei) {
    const endung = datei.name.toLowerCase().endsWith(".xlsm") ? "xlsm" : "xlsx";
    const path = `excel/${new Date().toISOString().slice(0, 10)}-${crypto.randomUUID()}.${endung}`;
    const { error: uploadError } = await db.storage.from("rechnungsvorlagen")
      .upload(path, datei, { contentType: datei.type || "application/octet-stream", upsert: false });
    if (uploadError) throw uploadError;
    const { data, error } = await db.rpc("aktiviere_rechnung_excel_vorlage", {
      p_dateiname: datei.name,
      p_storage_path: path,
      p_mime_type: datei.type || "application/octet-stream",
      p_dateigroesse: datei.size,
    });
    if (error) {
      await db.storage.from("rechnungsvorlagen").remove([path]);
      throw error;
    }
    return data;
  }

  async function uploadLogo(datei) {
    const endung = (datei.name.split(".").pop() || "png").toLowerCase();
    const path = `logos/rechnung-${crypto.randomUUID()}.${endung}`;
    const { error } = await db.storage.from("rechnungsvorlagen")
      .upload(path, datei, { contentType: datei.type, upsert: false });
    if (error) throw error;
    return path;
  }

  return {
    getVorlage, saveVorlage, getAktiveExcelVorlage,
    downloadStorageDatei, uploadExcelVorlage, uploadLogo,
  };
})();
