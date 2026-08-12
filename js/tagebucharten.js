window.Tagebucharten = (() => {
  const el = (id) => document.getElementById(id);
  let arten = [];
  let aktuell = null;

  async function init() {
    el("taSuche").addEventListener("input", rendern);
    el("taNeu").addEventListener("click", neu);
    el("taBody").addEventListener("click", aktion);
    el("taSpeichern").addEventListener("click", speichern);
    el("taAbbrechen").addEventListener("click", schliessen);
    el("taSchliessen").addEventListener("click", schliessen);
    el("taModal").addEventListener("click", (event) => { if (event.target === el("taModal")) schliessen(); });
    await laden();
  }

  async function laden() {
    try { arten = await TagebuchartenService.laden(); rendern(); }
    catch (error) { AppFeedback.error(error.message); }
  }

  function rendern() {
    const suche = el("taSuche").value.trim().toLocaleLowerCase("de");
    el("taBody").innerHTML = "";
    arten.filter((art) => !suche || `${art.nr} ${art.bezeichnung}`.toLocaleLowerCase("de").includes(suche))
      .forEach((art) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td data-label="Nr.">${art.nr}</td><td data-label="Bezeichnung"></td>` +
          `<td data-label="Aktiv">${art.aktiv ? "Ja" : "Nein"}</td><td data-label="Aktionen" class="action-cell">` +
          `<button class="action-btn edit-btn" data-action="edit" data-id="${art.id}" title="Bearbeiten" aria-label="Bearbeiten"></button>` +
          `<button class="action-btn delete-btn" data-action="delete" data-id="${art.id}" title="Löschen" aria-label="Löschen"></button></td>`;
        tr.children[1].textContent = art.bezeichnung;
        el("taBody").appendChild(tr);
      });
    BerechtigungService.aktionsrechteAnwenden("tagebucharten", el("taBody"));
  }

  function neu() {
    aktuell = null;
    el("taModalTitel").textContent = "Tagebuchart anlegen";
    el("taNr").value = arten.reduce((max, art) => Math.max(max, Number(art.nr)), 0) + 1;
    el("taBezeichnung").value = "";
    el("taAktiv").checked = true;
    oeffnen();
  }

  function bearbeiten(art) {
    aktuell = art;
    el("taModalTitel").textContent = "Tagebuchart bearbeiten";
    el("taNr").value = art.nr;
    el("taBezeichnung").value = art.bezeichnung;
    el("taAktiv").checked = art.aktiv;
    oeffnen();
  }

  function oeffnen() { el("taFehler").hidden = true; el("taModal").style.display = "block"; el("taModal").setAttribute("aria-hidden", "false"); }
  function schliessen() { el("taModal").style.display = "none"; el("taModal").setAttribute("aria-hidden", "true"); aktuell = null; }

  async function aktion(event) {
    const button = event.target.closest("button[data-id]");
    if (!button) return;
    const art = arten.find((item) => String(item.id) === button.dataset.id);
    if (!art) return;
    if (button.dataset.action === "edit") return bearbeiten(art);
    if (!confirm(`Tagebuchart „${art.bezeichnung}“ wirklich löschen?`)) return;
    try { await TagebuchartenService.loeschen(art.id); await laden(); AppFeedback.success("Tagebuchart gelöscht."); }
    catch (error) { AppFeedback.error(error.message); }
  }

  async function speichern() {
    const daten = { nr: Number(el("taNr").value), bezeichnung: el("taBezeichnung").value.trim(), aktiv: el("taAktiv").checked };
    if (!Number.isInteger(daten.nr) || daten.nr < 1 || !daten.bezeichnung) {
      el("taFehler").textContent = "Nr. und Bezeichnung sind erforderlich."; el("taFehler").hidden = false; return;
    }
    el("taSpeichern").disabled = true;
    try {
      if (aktuell) await TagebuchartenService.aendern(aktuell.id, daten);
      else await TagebuchartenService.anlegen(daten);
      schliessen(); await laden(); AppFeedback.success("Tagebuchart gespeichert.");
    } catch (error) { el("taFehler").textContent = error.message; el("taFehler").hidden = false; }
    finally { el("taSpeichern").disabled = false; }
  }

  return { init };
})();
