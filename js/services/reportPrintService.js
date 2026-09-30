window.ReportPrintService = (() => {
  function drucken(titel) {
    const vorherigerTitel = document.title;
    const wiederherstellen = () => {
      document.title = vorherigerTitel;
      window.removeEventListener("afterprint", wiederherstellen);
    };

    if (titel) document.title = titel;
    window.addEventListener("afterprint", wiederherstellen, { once: true });
    window.setTimeout(wiederherstellen, 1000);
    window.print();
  }

  return { drucken };
})();
