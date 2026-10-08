window.AbschussAnrechnung = Object.freeze({
  personId(abschuss) { return abschuss?.anrechnung_person_id || abschuss?.jaeger_id || null; },
  istAbweichend(abschuss) {
    return Boolean(abschuss?.anrechnung_person_id) && String(abschuss.anrechnung_person_id) !== String(abschuss.jaeger_id);
  },
});
