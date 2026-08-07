window.Benutzerverwaltung = (() => {
  const el = (id) => document.getElementById(id);
  let daten = { profile: [], rollen: [], module: [], rechte: [] };
  let aktuellerBenutzer = null;

  function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = value ?? "";
    return div.innerHTML;
  }

  async function init() {
    el("bvTabBenutzer").addEventListener("click", () => tabOeffnen("benutzer"));
    el("bvTabRechte").addEventListener("click", () => tabOeffnen("rechte"));
    el("bvBenutzerBody").addEventListener("click", benutzerAktion);
    el("bvBenutzerNeu").addEventListener("click", benutzerNeu);
    el("bvBenutzerSpeichern").addEventListener("click", benutzerSpeichern);
    el("bvRechteSpeichern").addEventListener("click", rechteSpeichern);
    el("bvBenutzerAbbrechen").addEventListener("click", modalSchliessen);
    el("bvBenutzerSchliessen").addEventListener("click", modalSchliessen);
    el("bvBenutzerModal").addEventListener("click", (event) => {
      if (event.target === el("bvBenutzerModal")) modalSchliessen();
    });
    await laden();
  }

  async function laden() {
    try {
      daten = await BenutzerverwaltungService.laden();
      renderBenutzer();
      renderRechte();
    } catch (error) {
      console.error("Benutzerverwaltung:", error);
      AppFeedback.error(error.message || "Benutzerverwaltung konnte nicht geladen werden.");
    }
  }

  function tabOeffnen(tab) {
    const benutzer = tab === "benutzer";
    el("bvBenutzerPanel").hidden = !benutzer;
    el("bvRechtePanel").hidden = benutzer;
    el("bvTabBenutzer").classList.toggle("active", benutzer);
    el("bvTabRechte").classList.toggle("active", !benutzer);
  }

  function renderBenutzer() {
    const body = el("bvBenutzerBody");
    body.innerHTML = "";
    daten.profile.forEach((profil) => {
      const row = document.createElement("tr");
      row.innerHTML = `<td>${escapeHtml(profil.benutzername)}</td>` +
        `<td>${escapeHtml(profil.rolle?.name || "")}</td><td>${profil.aktiv ? "Ja" : "Nein"}</td>` +
        `<td class="action-cell"><button class="action-btn edit-btn" type="button" data-id="${profil.id}" title="Bearbeiten" aria-label="Bearbeiten"></button></td>`;
      body.appendChild(row);
    });
  }

  function benutzerAktion(event) {
    const button = event.target.closest("button[data-id]");
    if (!button) return;
    const profil = daten.profile.find((item) => String(item.id) === button.dataset.id);
    if (!profil) return;
    aktuellerBenutzer = profil;
    el("bvBenutzerModalTitel").textContent = "Benutzer bearbeiten";
    el("bvBenutzername").value = profil.benutzername || "";
    el("bvPasswort").value = "";
    el("bvPasswortHinweis").textContent = "Leer lassen, um das vorhandene Passwort beizubehalten.";
    el("bvRolle").innerHTML = daten.rollen.map((rolle) =>
      `<option value="${rolle.id}">${escapeHtml(rolle.name)}</option>`).join("");
    el("bvRolle").value = profil.rolle_id;
    el("bvAktiv").checked = profil.aktiv === true;
    const istAdmin = profil.rolle?.name === "Admin";
    el("bvRolle").disabled = istAdmin;
    el("bvAktiv").disabled = istAdmin;
    el("bvFehler").hidden = true;
    el("bvBenutzerModal").style.display = "block";
    el("bvBenutzerModal").setAttribute("aria-hidden", "false");
  }

  function benutzerNeu() {
    aktuellerBenutzer = null;
    el("bvBenutzerModalTitel").textContent = "Benutzer hinzufügen";
    el("bvBenutzername").value = "";
    el("bvPasswort").value = "";
    el("bvPasswortHinweis").textContent = "Mindestens 6 Zeichen.";
    el("bvRolle").innerHTML = daten.rollen.map((rolle) =>
      `<option value="${rolle.id}">${escapeHtml(rolle.name)}</option>`).join("");
    const standardRolle = daten.rollen.find((rolle) => rolle.name === "Jäger") || daten.rollen[0];
    el("bvRolle").value = standardRolle?.id || "";
    el("bvRolle").disabled = false;
    el("bvAktiv").checked = true;
    el("bvAktiv").disabled = false;
    el("bvFehler").hidden = true;
    el("bvBenutzerModal").style.display = "block";
    el("bvBenutzerModal").setAttribute("aria-hidden", "false");
  }

  function modalSchliessen() {
    el("bvBenutzerModal").style.display = "none";
    el("bvBenutzerModal").setAttribute("aria-hidden", "true");
    aktuellerBenutzer = null;
  }

  async function benutzerSpeichern() {
    try {
      el("bvBenutzerSpeichern").disabled = true;
      const istNeu = !aktuellerBenutzer;
      const eingabe = {
        benutzername: el("bvBenutzername").value,
        passwort: el("bvPasswort").value,
        rolle_id: el("bvRolle").value,
        aktiv: el("bvAktiv").checked,
      };
      if (!eingabe.benutzername.trim() || !eingabe.rolle_id) {
        throw new Error("Benutzername und Rolle sind erforderlich.");
      }
      if (istNeu && eingabe.passwort.length < 6) {
        throw new Error("Das Passwort muss mindestens 6 Zeichen lang sein.");
      }
      if (!istNeu && eingabe.passwort && eingabe.passwort.length < 6) {
        throw new Error("Das neue Passwort muss mindestens 6 Zeichen lang sein.");
      }
      if (aktuellerBenutzer) {
        await BenutzerverwaltungService.benutzerSpeichern(aktuellerBenutzer.id, eingabe);
      } else {
        await BenutzerverwaltungService.benutzerAnlegen(eingabe);
      }
      modalSchliessen();
      await laden();
      AppFeedback.success(istNeu ? "Benutzer wurde angelegt." : "Benutzer gespeichert.");
    } catch (error) {
      el("bvFehler").textContent = error.message;
      el("bvFehler").hidden = false;
    } finally { el("bvBenutzerSpeichern").disabled = false; }
  }

  function rechtWert(rolle, modul, feld) {
    if (rolle.name === "Admin") return true;
    return daten.rechte.find((recht) =>
      recht.rolle_id === rolle.id && recht.modul_code === modul.code)?.[feld] === true;
  }

  function renderRechte() {
    const darfBearbeiten = BerechtigungService.darf("benutzerverwaltung", "Bearbeiten");
    el("bvRechteKopf").innerHTML = `<tr><th>Bereich</th>${daten.rollen.map((rolle) =>
      `<th>${escapeHtml(rolle.name)}</th>`).join("")}</tr>`;
    el("bvRechteBody").innerHTML = daten.module.map((modul) => `<tr><th>${escapeHtml(modul.bezeichnung)}</th>` +
      daten.rollen.map((rolle) => `<td><div class="rechte-auswahl" data-rolle="${rolle.id}" data-modul="${modul.code}">` +
        ["lesen", "bearbeiten", "loeschen"].map((feld) => {
          const label = feld === "lesen" ? "Lesen" : feld === "bearbeiten" ? "Bearbeiten" : "Löschen";
          return `<label><input type="checkbox" data-recht="${feld}" ${rechtWert(rolle, modul, feld) ? "checked" : ""} ${rolle.name === "Admin" || !darfBearbeiten ? "disabled" : ""}> ${label}</label>`;
        }).join("") + "</div></td>").join("") + "</tr>").join("");
  }

  async function rechteSpeichern() {
    const admin = daten.rollen.find((rolle) => rolle.name === "Admin");
    const rollen = daten.rollen.filter((rolle) => rolle.id !== admin?.id);
    try {
      el("bvRechteSpeichern").disabled = true;
      for (const rolle of rollen) {
        const eintraege = daten.module.map((modul) => {
          const zelle = el("bvRechteBody").querySelector(
            `[data-rolle="${rolle.id}"][data-modul="${modul.code}"]`,
          );
          return {
            modul_code: modul.code,
            lesen: zelle.querySelector('[data-recht="lesen"]').checked,
            bearbeiten: zelle.querySelector('[data-recht="bearbeiten"]').checked,
            loeschen: zelle.querySelector('[data-recht="loeschen"]').checked,
          };
        });
        await BenutzerverwaltungService.rechteSpeichern(rolle.id, eintraege);
      }
      await laden();
      await BerechtigungService.laden();
      AppFeedback.success("Rechte gespeichert.");
    } catch (error) {
      AppFeedback.error(error.message || "Rechte konnten nicht gespeichert werden.");
    } finally { el("bvRechteSpeichern").disabled = false; }
  }

  return { init };
})();
