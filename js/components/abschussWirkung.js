window.AbschussWirkung = (() => {
  function normalisieren(wert) {
    return String(wert || "").trim().toLocaleLowerCase("de");
  }

  function istHirschWildklasse(wildklasse) {
    const code = normalisieren(wildklasse?.code || wildklasse?.data?.code);
    const bezeichnung = normalisieren(
      wildklasse?.bezeichnung || wildklasse?.label || wildklasse?.data?.bezeichnung,
    );
    return code.startsWith("hirsch_") || bezeichnung.startsWith("hirsch ");
  }

  function istFreigabewirksamerHirschabschuss(abschuss) {
    return Boolean(abschuss) &&
      abschuss.fallwild !== true &&
      abschuss.sonderabschuss !== true;
  }

  return { istHirschWildklasse, istFreigabewirksamerHirschabschuss };
})();
