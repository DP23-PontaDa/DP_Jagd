let persAllPersons = [];
let persAllJagdRows = [];
let persCurrentYear = new Date().getFullYear();
let persActiveKat = 'Mitglied';
let persEditMode = 'add';
let persInitDone = false;
let persLoadTimer = null;

function persInit() {
  if (persInitDone) return;
  persInitDone = true;
  persRenderTableHead();
  persUpdatePageTitle();
  persLoadData();
}

async function persLoadData() {
  persShowProcessing('Daten werden geladen...');
  persHideLoadError();
  persStartLoadTimer();

  try {
    if (!window.DPJagdApi || typeof window.DPJagdApi.loadPersonenInitialData !== 'function') {
      throw new Error('Die Supabase-API ist für Personen nicht verfügbar.');
    }

    const data = await window.DPJagdApi.loadPersonenInitialData();
    persStopLoadTimer();
    persApplyData(data);
  } catch (error) {
    persStopLoadTimer();
    persShowLoadError(error);
  } finally {
    persHideProcessing();
  }
}

function persApplyData(data) {
  persCurrentYear = data && data.currentYear ? Number(data.currentYear) : new Date().getFullYear();
  persAllPersons = data && Array.isArray(data.personen) ? data.personen : [];
  persAllJagdRows = data && Array.isArray(data.jagdgaeste) ? data.jagdgaeste : [];
  persUpdatePageTitle();
  persRenderTable();
}

function persSwitchTab(kat) {
  persActiveKat = kat;
  document.querySelectorAll('.pers-tab-btn').forEach(function(btn) {
    btn.classList.toggle('active', btn.getAttribute('data-kat') === kat);
  });
  persUpdatePageTitle();
  persClearSearch(false);
  persRenderTable();
}

function persUpdatePageTitle() {
  const title = document.getElementById('persPageTitle');
  if (!title) return;
  title.textContent = persTabTitle(persActiveKat);
}

function persTabTitle(kat) {
  if (kat === 'Mitglied') return 'Mitglieder';
  if (kat === 'Jagdgast') return 'Jagdgäste';
  if (kat === 'Jagdgastkarten') return 'Jagdgastkarten';
  if (kat === 'Hegering') return 'Hegering';
  return kat || 'Personen';
}

function persIsJagdKategorie(kat) {
  return kat === 'Jagdgast';
}

function persNeedsJaegerGastColumn(kat) {
  return kat === 'Jagdgast' || kat === 'Jagdgastkarten';
}

function persCompareByIdNumber(a, b) {
  const aNum = persPersonenNrValue(a);
  const bNum = persPersonenNrValue(b);

  if (aNum !== bNum) return aNum - bNum;
  return String((a && a.personenNr) || '').localeCompare(String((b && b.personenNr) || ''), 'de', { numeric: true, sensitivity: 'base' });
}

function persComparePersons(a, b) {
  const activeDiff = Number(b.aktiv === true) - Number(a.aktiv === true);
  if (activeDiff !== 0) return activeDiff;

  if (persActiveKat === 'Mitglied' || persActiveKat === 'Hegering') {
    return persCompareByIdNumber(a, b);
  }

  if (persActiveKat === 'Jagdgast') {
    const aYear = persLastActiveJagdYear(a.personId);
    const bYear = persLastActiveJagdYear(b.personId);
    const aYearNum = Number(aYear);
    const bYearNum = Number(bYear);

    if (aYearNum !== bYearNum) return bYearNum - aYearNum;

    const aName = String(a.nachname || '').toLowerCase();
    const bName = String(b.nachname || '').toLowerCase();
    if (aName !== bName) return aName.localeCompare(bName, 'de', { sensitivity: 'base' });

    const aVorname = String(a.vorname || '').toLowerCase();
    const bVorname = String(b.vorname || '').toLowerCase();
    if (aVorname !== bVorname) return aVorname.localeCompare(bVorname, 'de', { sensitivity: 'base' });

    return persCompareByIdNumber(a, b);
  }

  if (persActiveKat === 'Jagdgastkarten') {
    const aParts = persParseJagdgastkarteId(a && (a.jagdgastkarte || a.personenNr));
    const bParts = persParseJagdgastkarteId(b && (b.jagdgastkarte || b.personenNr));

    if (aParts.year !== bParts.year) return bParts.year - aParts.year;
    if (aParts.num !== bParts.num) return aParts.num - bParts.num;

    return persCompareByIdNumber(a, b);
  }

  return persCompareByIdNumber(a, b);
}

function persParseJagdgastkarteId(value) {
  const text = String(value || '').trim();
  const match = text.match(/^JGK\s*(\d{4})\s*-\s*(\d+)$/i);

  if (match) {
    return {
      year: Number(match[1]),
      num: Number(match[2])
    };
  }

  return {
    year: Number.MIN_SAFE_INTEGER,
    num: Number.MAX_SAFE_INTEGER
  };
}

function persPersonenNrValue(person) {
  if (!person) return Number.MAX_SAFE_INTEGER;

  const rawValue = person.personenNr != null ? person.personenNr : person.personen_nr;
  if (rawValue === null || rawValue === undefined || rawValue === '') return Number.MAX_SAFE_INTEGER;

  const value = String(rawValue).trim();
  const numeric = Number(value.replace(/[^0-9,-]/g, '').replace(',', '.'));

  return Number.isFinite(numeric) ? numeric : Number.MAX_SAFE_INTEGER;
}

function persRenderTable() {
  persUpdatePageTitle();
  persRenderTableHead();

  const tbody = document.getElementById('persTableBody');
  if (!tbody) return;

  const query = document.getElementById('persSearchInput').value.trim().toLowerCase();
  const criteria = document.getElementById('persSearchCriteria').value;

  let persons = persAllPersons.filter(function(person) {
    return person.nameKat === persActiveKat;
  });

  if (query) {
    persons = persons.filter(function(person) {
      if (criteria === 'all') {
        return [person.personenNr, person.vorname, person.nachname, person.kjNr, person.jagdgastkarte, persJaegerGastDisplay(person), person.adresse, person.plz, person.ort]
          .join(' ')
          .toLowerCase()
          .indexOf(query) !== -1;
      }

      if (criteria === 'jaegerGast' || criteria === 'jaegerGastId') {
        return persJaegerGastDisplay(person).toLowerCase().indexOf(query) !== -1;
      }

      return String(person[criteria] || '').toLowerCase().indexOf(query) !== -1;
    });
  }

  persons.sort(persComparePersons);

  tbody.innerHTML = '';

  if (persons.length === 0) {
    document.getElementById('persTableContainer').style.display = 'none';
    document.getElementById('persNoData').style.display = 'block';
    return;
  }

  document.getElementById('persTableContainer').style.display = 'block';
  document.getElementById('persNoData').style.display = 'none';

  persons.forEach(function(person) {
    const row = document.createElement('tr');
    persAddCell(row, person.personenNr || '');
    persAddCell(row, person.vorname);
    persAddCell(row, person.nachname);

    if (persActiveKat === 'Jagdgastkarten') {
      persAddCell(row, person.jagdgastkarte);
    } else {
      persAddCell(row, person.kjNr);
    }

    persAddCell(row, person.adresse);
    persAddCell(row, person.plz);
    persAddCell(row, person.ort);
    persAddStatusCell(row, person.aktiv);

    if (persNeedsJaegerGastColumn(persActiveKat)) {
      persAddCell(row, persJaegerGastDisplay(person));
    }

    if (persIsJagdKategorie(persActiveKat)) {
      persAddCell(row, persLastActiveJagdYear(person.personId));
    }

    const actionCell = document.createElement('td');
    actionCell.className = 'action-cell';

    const editBtn = document.createElement('button');
    editBtn.className = 'action-btn edit-btn';
    editBtn.title = 'Bearbeiten';
    editBtn.setAttribute('aria-label', 'Bearbeiten');
    editBtn.innerHTML = '<span aria-hidden="true">&#9998;</span>';
    editBtn.onclick = function() {
      persOpenEditPersonModal(person.personId);
    };
    actionCell.appendChild(editBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'action-btn delete-btn';
    deleteBtn.title = 'Löschen';
    deleteBtn.setAttribute('aria-label', 'Löschen');
    deleteBtn.innerHTML = '<span aria-hidden="true">&#128465;</span>';
    deleteBtn.onclick = function() {
      persDeletePersonConfirm(person.personId);
    };
    actionCell.appendChild(deleteBtn);

    row.appendChild(actionCell);
    tbody.appendChild(row);
  });
}

function persRenderTableHead() {
  const headers = ['Personen_Nr', 'Vorname', 'Nachname'];
  if (persActiveKat === 'Jagdgastkarten') {
    headers.push('Jagdgastkarte');
  } else {
    headers.push('KJ_Nr');
  }

  headers.push('Adresse', 'PLZ', 'Ort', 'Aktiv');

  if (persNeedsJaegerGastColumn(persActiveKat)) {
    headers.push('Jäger_Gast');
  }

  if (persIsJagdKategorie(persActiveKat)) {
    headers.push('Jagdgast-Jahre');
  }

  headers.push('Aktionen');

  const tr = document.createElement('tr');
  headers.forEach(function(header) {
    const th = document.createElement('th');
    th.textContent = header;
    tr.appendChild(th);
  });

  const thead = document.getElementById('persTableHead');
  if (thead) {
    thead.innerHTML = '';
    thead.appendChild(tr);
  }
}

function persAddCell(row, value) {
  const td = document.createElement('td');
  td.textContent = value == null ? '' : String(value);
  row.appendChild(td);
}

function persAddStatusCell(row, isActive) {
  const td = document.createElement('td');
  td.textContent = isActive ? 'Ja' : 'Nein';
  if (isActive) {
    td.className = 'status-yes';
    td.style.color = '#006400';
    td.style.fontWeight = '700';
  } else {
    td.style.color = '';
    td.style.fontWeight = '';
  }
  row.appendChild(td);
}

function persLastActiveJagdRow(personId) {
  const rows = persAllJagdRows
    .filter(function(row) {
      return row.personId === personId && row.aktiv === true;
    })
    .sort(function(a, b) {
      return Number(b.jahr) - Number(a.jahr);
    });

  return rows.length > 0 ? rows[0] : null;
}

function persLastActiveJagdYear(personId) {
  const row = persLastActiveJagdRow(personId);
  return row ? String(row.jahr || '') : '';
}

function persJaegerGastDisplay(person) {
  if (!person) return '';

  if (person.nameKat === 'Jagdgast') {
    const row = persLastActiveJagdRow(person.personId);
    return row && row.jaegerGastId ? persMemberLabel(row.jaegerGastId) : '';
  }

  if (person.nameKat === 'Jagdgastkarten') {
    return person.jaegerGastId ? persMemberLabel(person.jaegerGastId) : '';
  }

  return '';
}

function persMemberLabel(personId) {
  const id = String(personId || '').trim();
  if (!id) return '';

  const member = persAllPersons.find(function(person) {
    return person.personId === id;
  });

  if (!member) return id;

  return [member.vorname, member.nachname].filter(Boolean).join(' ');
}

function persClearSearch(render) {
  const searchInput = document.getElementById('persSearchInput');
  const searchCriteria = document.getElementById('persSearchCriteria');

  if (searchInput) searchInput.value = '';
  if (searchCriteria) searchCriteria.value = 'all';
  if (render !== false) persRenderTable();
}

function persOpenNewPersonModal() {
  persEditMode = 'add';
  document.getElementById('persModalTitle').textContent = 'Person hinzufügen';
  persClearModal();
  document.getElementById('persNameKat').value = persActiveKat;
  document.getElementById('persAktiv').checked = true;
  persHandleNameKatChange();
  document.getElementById('persPersonModal').style.display = 'block';
  setTimeout(function() {
    const input = document.getElementById('persPersonenNr');
    if (input) input.focus();
  }, 50);
}

// TODO: Extend the edit state handling once additional person-specific panels are introduced.
function persOpenEditPersonModal(personId) {
  const person = persAllPersons.find(function(item) {
    return String(item.personId || '') === String(personId || '');
  });

  if (!person) return;

  persEditMode = 'edit';
  document.getElementById('persModalTitle').textContent = 'Person bearbeiten';
  persClearModal();

  const hiddenOriginalId = document.getElementById('persOriginalPersonId');
  if (hiddenOriginalId) hiddenOriginalId.value = person.personId || '';

  const personenNrInput = document.getElementById('persPersonenNr');
  if (personenNrInput) personenNrInput.value = person.personenNr != null ? person.personenNr : '';

  const vornameInput = document.getElementById('persVorname');
  if (vornameInput) vornameInput.value = person.vorname || '';

  const nachnameInput = document.getElementById('persNachname');
  if (nachnameInput) nachnameInput.value = person.nachname || '';

  const kjNrInput = document.getElementById('persKjNr');
  if (kjNrInput) kjNrInput.value = person.kjNr || '';

  const jagdgastkarteInput = document.getElementById('persJagdgastkarte');
  if (jagdgastkarteInput) jagdgastkarteInput.value = person.jagdgastkarte || '';

  const adresseInput = document.getElementById('persAdresse');
  if (adresseInput) adresseInput.value = person.adresse || '';

  const plzInput = document.getElementById('persPlz');
  if (plzInput) plzInput.value = person.plz || '';

  const ortInput = document.getElementById('persOrt');
  if (ortInput) ortInput.value = person.ort || '';

  const nameKatSelect = document.getElementById('persNameKat');
  if (nameKatSelect) nameKatSelect.value = person.nameKat || 'Mitglied';

  const aktivCheckbox = document.getElementById('persAktiv');
  if (aktivCheckbox) aktivCheckbox.checked = person.aktiv === true;

  persHandleNameKatChange();

  if (person.nameKat === 'Jagdgastkarten') {
    persPopulateJaegerGastSelect(person.jaegerGastId || '');
  }

  if (person.nameKat === 'Jagdgast') {
    const body = document.getElementById('persJagdYearsBody');
    if (body) {
      body.innerHTML = '';
      const rows = persAllJagdRows.filter(function(row) {
        return String(row.personId || '') === String(person.personId || '');
      }).sort(function(a, b) {
        return Number(a.jahr) - Number(b.jahr);
      });

      rows.forEach(function(row) {
        persAddJagdYearRow({
          idJgJahr: row.idJgJahr || '',
          jahr: row.jahr || '',
          aktiv: row.aktiv === true,
          jaegerGastId: row.jaegerGastId || '',
          bemerkung: row.bemerkung || ''
        });
      });

      if (rows.length === 0) {
        persAddJagdYearRow({ jahr: persCurrentYear, aktiv: true, jaegerGastId: '', bemerkung: '' });
      }
    }
  }

  document.getElementById('persPersonModal').style.display = 'block';
}

function persClosePersonModal() {
  const modal = document.getElementById('persPersonModal');
  if (modal) modal.style.display = 'none';
}

function persClearModal() {
  const originalPersonId = document.getElementById('persOriginalPersonId');
  const personenNr = document.getElementById('persPersonenNr');
  const vorname = document.getElementById('persVorname');
  const nachname = document.getElementById('persNachname');
  const kjNr = document.getElementById('persKjNr');
  const jagdgastkarte = document.getElementById('persJagdgastkarte');
  const jaegerGast = document.getElementById('persJaegerGast');
  const adresse = document.getElementById('persAdresse');
  const plz = document.getElementById('persPlz');
  const ort = document.getElementById('persOrt');
  const nameKat = document.getElementById('persNameKat');
  const aktiv = document.getElementById('persAktiv');
  const jagdYearsBody = document.getElementById('persJagdYearsBody');

  if (originalPersonId) originalPersonId.value = '';
  if (personenNr) personenNr.value = '';
  if (vorname) vorname.value = '';
  if (nachname) nachname.value = '';
  if (kjNr) kjNr.value = '';
  if (jagdgastkarte) jagdgastkarte.value = '';
  if (jaegerGast) {
    jaegerGast.innerHTML = '';
    jaegerGast.value = '';
    jaegerGast.setAttribute('data-selected', '');
  }
  if (adresse) adresse.value = '';
  if (plz) plz.value = '';
  if (ort) ort.value = '';
  if (nameKat) nameKat.value = 'Mitglied';
  if (aktiv) {
    aktiv.checked = true;
    aktiv.disabled = false;
  }
  if (jagdYearsBody) jagdYearsBody.innerHTML = '';
}

function persHandleNameKatChange() {
  const nameKat = document.getElementById('persNameKat').value;
  const isJagd = persIsJagdKategorie(nameKat);
  const isJagdgastkarten = nameKat === 'Jagdgastkarten';
  const aktiv = document.getElementById('persAktiv');
  const note = document.getElementById('persAktivNote');
  const aktivText = document.getElementById('persAktivText');
  const kjNrGroup = document.getElementById('persKjNrGroup');
  const jagdgastkarteGroup = document.getElementById('persJagdgastkarteGroup');
  const jaegerGastGroup = document.getElementById('persJaegerGastGroup');
  const jaegerGastSelect = document.getElementById('persJaegerGast');

  if (kjNrGroup) kjNrGroup.style.display = isJagdgastkarten ? 'none' : 'block';
  if (jagdgastkarteGroup) jagdgastkarteGroup.style.display = isJagdgastkarten ? 'block' : 'none';
  if (jaegerGastGroup) jaegerGastGroup.style.display = isJagdgastkarten ? 'block' : 'none';

  if (isJagdgastkarten) {
    const selectedId = jaegerGastSelect ? (jaegerGastSelect.getAttribute('data-selected') || jaegerGastSelect.value || '') : '';
    persPopulateJaegerGastSelect(selectedId);
  } else if (jaegerGastSelect) {
    jaegerGastSelect.innerHTML = '';
    jaegerGastSelect.value = '';
    jaegerGastSelect.setAttribute('data-selected', '');
  }

  const jagdBox = document.getElementById('persJagdBox');
  if (jagdBox) jagdBox.style.display = isJagd ? 'block' : 'none';

  if (isJagd) {
    aktiv.disabled = true;
    aktivText.textContent = 'automatisch';
    note.textContent = 'Wird automatisch über das aktuelle Jahr berechnet.';
    if (document.getElementById('persJagdYearsBody').children.length === 0) {
      persAddJagdYearRow({ jahr: persCurrentYear, aktiv: true, jaegerGastId: '', bemerkung: '' });
    }
    persUpdateJagdAktivPreview();
  } else {
    aktiv.disabled = false;
    aktivText.textContent = 'aktiv';
    note.textContent = '';
  }
}

function persPopulateJaegerGastSelect(selectedId) {
  const select = document.getElementById('persJaegerGast');
  if (!select) return;

  select.innerHTML = persMemberOptions(selectedId || '');
  select.value = selectedId || '';
  select.setAttribute('data-selected', selectedId || '');
}

function persMemberOptions(selectedId) {
  const activeMembers = persAllPersons
    .filter(function(person) {
      return person.nameKat === 'Mitglied' && person.aktiv === true;
    })
    .sort(function(a, b) {
      return (a.nachname + ' ' + a.vorname).localeCompare(b.nachname + ' ' + b.vorname, 'de', { numeric: true, sensitivity: 'base' });
    });

  let html = '<option value="">-- Mitglied auswählen --</option>';
  let selectedFound = false;

  activeMembers.forEach(function(person) {
    const selected = person.personId === selectedId ? ' selected' : '';
    if (selected) selectedFound = true;
    html += '<option value="' + persEscAttr(person.personId) + '"' + selected + '>' + persEsc((person.personenNr || person.personId) + ' - ' + person.vorname + ' ' + person.nachname) + '</option>';
  });

  if (selectedId && !selectedFound) {
    html += '<option value="' + persEscAttr(selectedId) + '" selected>' + persEsc(selectedId + ' - nicht aktiv oder nicht gefunden') + '</option>';
  }

  return html;
}

function persAddJagdYearRow(rowData) {
  const tbody = document.getElementById('persJagdYearsBody');
  if (!tbody) return;

  const tr = document.createElement('tr');
  const row = rowData || { jahr: persCurrentYear, aktiv: true, jaegerGastId: '', bemerkung: '' };

  tr.setAttribute('data-id-jg-jahr', row.idJgJahr || '');
  tr.innerHTML =
    '<td><input type="number" class="form-control pers-jagd-jahr" min="1900" max="2999" value="' + persEscAttr(row.jahr || '') + '" oninput="persUpdateJagdAktivPreview()"></td>' +
    '<td style="text-align:center;"><input type="checkbox" class="pers-jagd-aktiv" ' + (row.aktiv ? 'checked' : '') + ' onchange="persUpdateJagdAktivPreview()"></td>' +
    '<td><select class="form-control pers-jagd-jaeger">' + persMemberOptions(row.jaegerGastId || '') + '</select></td>' +
    '<td><input type="text" class="form-control pers-jagd-bemerkung" value="' + persEscAttr(row.bemerkung || '') + '"></td>' +
    '<td><button class="action-btn delete-btn" type="button" title="Entfernen" aria-label="Entfernen" onclick="this.closest(\'tr\').remove(); persUpdateJagdAktivPreview();"><span aria-hidden="true">&#128465;</span></button></td>';

  tbody.appendChild(tr);
  persUpdateJagdAktivPreview();
}

function persUpdateJagdAktivPreview() {
  const nameKat = document.getElementById('persNameKat').value;
  if (!persIsJagdKategorie(nameKat)) return;

  const rows = persCollectJagdRows(false);
  if (rows === null) return;

  const isActiveCurrentYear = rows.some(function(row) {
    return Number(row.jahr) === Number(persCurrentYear) && row.aktiv === true;
  });

  const aktivCheckbox = document.getElementById('persAktiv');
  if (aktivCheckbox) aktivCheckbox.checked = isActiveCurrentYear;
}

function persCollectJagdRows(showValidation) {
  const rows = [];
  const seen = {};
  const trs = document.querySelectorAll('#persJagdYearsBody tr');

  for (let index = 0; index < trs.length; index += 1) {
    const tr = trs[index];
    const jahr = Number(tr.querySelector('.pers-jagd-jahr').value);
    const aktiv = tr.querySelector('.pers-jagd-aktiv').checked;
    const jaegerGastId = tr.querySelector('.pers-jagd-jaeger').value;
    const bemerkung = tr.querySelector('.pers-jagd-bemerkung').value.trim();
    const idJgJahr = tr.getAttribute('data-id-jg-jahr') || '';

    if (!jahr) continue;

    if (jahr < 1900 || jahr > 2999) {
      if (showValidation) alert('Ungültiges Jahr: ' + jahr);
      return null;
    }

    if (seen[jahr]) {
      if (showValidation) alert('Das Jahr ' + jahr + ' ist doppelt erfasst.');
      return null;
    }
    seen[jahr] = true;

    rows.push({
      idJgJahr: idJgJahr,
      jahr: jahr,
      aktiv: aktiv,
      jaegerGastId: jaegerGastId,
      bemerkung: bemerkung
    });
  }

  return rows;
}

function persGetActiveMemberIds() {
  const activeMembers = new Set();
  persAllPersons.forEach(function(person) {
    if (person.nameKat === 'Mitglied' && person.aktiv === true) {
      activeMembers.add(String(person.personId || '').trim());
    }
  });
  return activeMembers;
}

function persValidateJaegerGastSelection(jaegerGast, currentPersonId, showValidation) {
  const value = String(jaegerGast || '').trim();
  if (!value) return true;

  const activeMembers = persGetActiveMemberIds();
  if (!activeMembers.has(value)) {
    if (showValidation) alert('Jäger_Gast muss ein aktives Mitglied sein. Ungültig: ' + value);
    return false;
  }

  if (value === currentPersonId) {
    if (showValidation) alert('Jäger_Gast darf nicht dieselbe Person sein.');
    return false;
  }

  return true;
}

function persValidateJagdRows(jagdRows, currentPersonId, showValidation) {
  const activeMembers = persGetActiveMemberIds();

  for (let index = 0; index < jagdRows.length; index += 1) {
    const row = jagdRows[index];
    if (row.jaegerGastId && !activeMembers.has(row.jaegerGastId)) {
      if (showValidation) alert('Jäger_Gast muss ein aktives Mitglied sein. Ungültig: ' + row.jaegerGastId);
      return false;
    }

    if (row.jaegerGastId && row.jaegerGastId === currentPersonId) {
      if (showValidation) alert('Jäger_Gast darf nicht dieselbe Person wie der Jagdgast sein.');
      return false;
    }
  }

  return true;
}

function persSavePerson() {
  const person = {
    personId: document.getElementById('persOriginalPersonId').value.trim(),
    originalPersonId: document.getElementById('persOriginalPersonId').value.trim(),
    personenNr: document.getElementById('persPersonenNr').value.trim(),
    vorname: document.getElementById('persVorname').value.trim(),
    nachname: document.getElementById('persNachname').value.trim(),
    kjNr: document.getElementById('persKjNr').value.trim(),
    jagdgastkarte: document.getElementById('persJagdgastkarte').value.trim(),
    jaegerGastId: document.getElementById('persJaegerGast').value.trim(),
    adresse: document.getElementById('persAdresse').value.trim(),
    plz: document.getElementById('persPlz').value.trim(),
    ort: document.getElementById('persOrt').value.trim(),
    nameKat: document.getElementById('persNameKat').value,
    aktiv: document.getElementById('persAktiv').checked
  };

  if (!person.personenNr) {
    alert('Bitte Personen_Nr eingeben.');
    return;
  }
  if (!person.vorname) {
    alert('Bitte Vorname eingeben.');
    return;
  }
  if (!person.nachname) {
    alert('Bitte Nachname eingeben.');
    return;
  }

  const allowedNameKats = ['Mitglied', 'Jagdgast', 'Jagdgastkarten', 'Hegering'];
  if (allowedNameKats.indexOf(person.nameKat) === -1) {
    alert('Name_Kat ist ungültig.');
    return;
  }

  let jagdRows = [];
  if (persIsJagdKategorie(person.nameKat)) {
    jagdRows = persCollectJagdRows(true);
    if (jagdRows === null) return;
    if (!persValidateJagdRows(jagdRows, person.personId, true)) return;
    person.aktiv = jagdRows.some(function(row) {
      return Number(row.jahr) === Number(persCurrentYear) && row.aktiv === true;
    });
    person.jaegerGastId = '';
  } else if (person.nameKat === 'Jagdgastkarten') {
    if (!persValidateJaegerGastSelection(person.jaegerGastId, person.personId, true)) return;
    if (person.jaegerGastId) {
      jagdRows = [{
        jahr: persCurrentYear,
        aktiv: true,
        jaegerGastId: person.jaegerGastId,
        bemerkung: ''
      }];
    }
  } else {
    person.jaegerGastId = '';
  }

  persShowProcessing('Speichern...');

  window.DPJagdApi.savePerson({
    mode: persEditMode,
    originalPersonId: person.originalPersonId,
    person: person,
    jagdgaeste: jagdRows
  })
    .then(function(data) {
      persApplyData(data);
      persClosePersonModal();
    })
    .catch(function(error) {
      persShowError(error);
    })
    .finally(function() {
      persHideProcessing();
    });
}

// TODO: Centralize destructive actions once more data modules need the same cleanup flow.
function persDeletePersonConfirm(personId) {
  const person = persAllPersons.find(function(item) {
    return String(item.personId || '') === String(personId || '');
  });

  if (!person) return;

  const confirmed = window.confirm('Person wirklich löschen?');
  if (!confirmed) return;

  persShowProcessing('Löschen...');

  window.DPJagdApi.deletePerson(person.personId)
    .then(function(data) {
      persApplyData(data);
      persClosePersonModal();
    })
    .catch(function(error) {
      persShowError(error);
    })
    .finally(function() {
      persHideProcessing();
    });
}

function persShowProcessing(text) {
  const processingText = document.getElementById('persProcessingText');
  const overlay = document.getElementById('persProcessingOverlay');
  if (processingText) processingText.textContent = text || 'Verarbeitung...';
  if (overlay) overlay.style.display = 'flex';
}

function persHideProcessing() {
  const overlay = document.getElementById('persProcessingOverlay');
  if (overlay) overlay.style.display = 'none';
}

function persStartLoadTimer() {
  persStopLoadTimer();
  persLoadTimer = setTimeout(function() {
    persHideProcessing();
    persShowLoadError('Die Daten konnten nicht rechtzeitig geladen werden. Bitte versuche es erneut.');
  }, 45000);
}

function persStopLoadTimer() {
  if (persLoadTimer) {
    clearTimeout(persLoadTimer);
    persLoadTimer = null;
  }
}

function persShowLoadError(error) {
  const message = error && error.message ? error.message : String(error || 'Unbekannter Ladefehler');
  const errorText = document.getElementById('persLoadErrorText');
  const errorBox = document.getElementById('persLoadErrorBox');
  const tableContainer = document.getElementById('persTableContainer');
  const noData = document.getElementById('persNoData');

  if (errorText) errorText.textContent = message;
  if (errorBox) errorBox.style.display = 'block';
  if (tableContainer) tableContainer.style.display = 'none';
  if (noData) noData.style.display = 'none';
}

function persHideLoadError() {
  const errorText = document.getElementById('persLoadErrorText');
  const errorBox = document.getElementById('persLoadErrorBox');
  if (errorText) errorText.textContent = '';
  if (errorBox) errorBox.style.display = 'none';
}

function persShowError(error) {
  const message = error && error.message ? error.message : String(error || 'Unbekannter Fehler');
  alert('Fehler: ' + message);
}

function persEsc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function persEscAttr(value) {
  return persEsc(value).replace(/`/g, '&#096;');
}

window.Personen = {
  init: persInit
};
