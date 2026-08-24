window.InvoiceStatus = (() => {
  function istWildhaendlerKlein(wildhaendler) {
    const code = String(wildhaendler?.code || "").trim().toLocaleLowerCase("de");
    const bezeichnung = String(wildhaendler?.bezeichnung || "")
      .trim().toLocaleLowerCase("de");
    return code === "klein" || ["klein", "klein wildhändler"].includes(bezeichnung);
  }

  function klasse({ fallwild = false, rechnungMoeglich = true,
    rechnungVorhanden = false, zahlungseingang = false, klein = false } = {}) {
    if (fallwild === true) return "";
    if (!rechnungMoeglich && !klein) return "";
    if (zahlungseingang) return "invoice-status-paid";
    if (klein || rechnungVorhanden) return "invoice-status-unpaid";
    return "invoice-status-open";
  }

  function klasseFuerAbschuss(abschuss) {
    const klein = istWildhaendlerKlein(abschuss?.wildhaendler);
    return klasse({
      fallwild: abschuss?.fallwild === true,
      rechnungMoeglich: abschuss?.wildgruppen?.rechnung_moeglich === true &&
        abschuss?.wildhaendler?.rechnung_moeglich === true,
      rechnungVorhanden: abschuss?.rechnung_vorhanden === true,
      zahlungseingang: Boolean(abschuss?.zahlungseingang),
      klein,
    });
  }

  function klasseFuerRechnung(rechnung) {
    const positionen = rechnung?.positionen || [];
    const bezahlt = positionen.length > 0 && positionen.every((position) =>
      Boolean(position.abschuss?.zahlungseingang));
    return klasse({ rechnungMoeglich: true, rechnungVorhanden: true,
      zahlungseingang: bezahlt });
  }

  return { klasse, klasseFuerAbschuss, klasseFuerRechnung, istWildhaendlerKlein };
})();
