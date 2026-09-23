window.AbschussAlter = (() => {
  const relevanteCodes = new Set([
    "HIRSCH_I", "HIRSCH_II", "HIRSCH_III", "HIRSCH_A", "HIRSCH_B",
    "REHBOCK_A", "BOCK_A",
  ]);
  const relevanteBezeichnungen = new Set([
    "hirsch i", "hirsch ii", "hirsch iii", "hirsch a", "hirsch b",
    "rehbock a", "bock a",
  ]);

  function relation(value) {
    return Array.isArray(value) ? value[0] : value;
  }

  function codeNormalisieren(value) {
    return String(value || "")
      .trim()
      .toLocaleUpperCase("de")
      .replace(/[\s-]+/g, "_");
  }

  function bezeichnungNormalisieren(value) {
    return String(value || "")
      .trim()
      .toLocaleLowerCase("de")
      .replace(/\s+/g, " ");
  }

  function wildklasse(value) {
    const eintrag = relation(value?.data || value?.wildklassen || value?.wildklasse || value) || {};
    return {
      code: eintrag.code || value?.code || value?.data?.code || "",
      bezeichnung: eintrag.bezeichnung || value?.label || value?.data?.bezeichnung || "",
    };
  }

  function istRelevant(value) {
    const klasse = wildklasse(value);
    return relevanteCodes.has(codeNormalisieren(klasse.code)) ||
      relevanteBezeichnungen.has(bezeichnungNormalisieren(klasse.bezeichnung));
  }

  return { istRelevant };
})();
