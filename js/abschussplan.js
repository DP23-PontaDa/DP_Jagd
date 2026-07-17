/* Abschussplan — Platzhalter-Implementation für Sprint 3.0
   Liefert Seitenstruktur, Platzhalterdaten und berechnende Helferfunktionen.
   Später kann dies an Supabase angebunden werden.
*/

(function () {
    const KJ_PLANS = [
        { id: '2025-2026', start: 2025, end: 2026 },
        { id: '2024-2025', start: 2024, end: 2025 }
    ];

    const CLASSES = ['K0', 'K1', 'K2'];

    // Placeholder Abschuss (tatsächliche Ist-Zahlen), keyed by [group][year]
    const ABSCHUSS = {
        Rotwild: { 2025: 12, 2026: 7 },
        Rehwild: { 2025: 20, 2026: 18 },
        Gamswild: { 2025: 5, 2026: 2 }
    };

    // Placeholder Soll 2 Jahre and Intern plans per group/class
    const PLAN_PLACEHOLDER = {
        Rotwild: { 'K0': 10, 'K1': 6, 'K2': 3 },
        Rehwild: { 'K0': 25, 'K1': 10, 'K2': 5 },
        Gamswild: { 'K0': 6, 'K1': 3, 'K2': 1 }
    };

    // Placeholder intern first year values (editable)
    const INTERN_PLACEHOLDER = {
        Rotwild: { 'K0': 4, 'K1': 2, 'K2': 1 },
        Rehwild: { 'K0': 10, 'K1': 4, 'K2': 2 },
        Gamswild: { 'K0': 2, 'K1': 1, 'K2': 0 }
    };

    function $(sel, ctx=document) { return ctx.querySelector(sel); }
    function $all(sel, ctx=document) { return Array.from(ctx.querySelectorAll(sel)); }

    function computeVorschlag(soll2, internFirst) {
        return (Number(soll2) || 0) - (Number(internFirst) || 0);
    }

    function computeAktuellerSoll(soll2, actualFirst) {
        return (Number(soll2) || 0) - (Number(actualFirst) || 0);
    }

    function renderKJSelect() {
        const sel = document.getElementById('ap-kj-select');
        sel.innerHTML = '';
        KJ_PLANS.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = `${p.start} / ${p.end}`;
            sel.appendChild(opt);
        });
        sel.addEventListener('change', renderAll);
    }

    function currentKJ() {
        const sel = document.getElementById('ap-kj-select');
        return KJ_PLANS.find(p => p.id === sel.value) || KJ_PLANS[0];
    }

    function renderOverview() {
        const tbody = document.getElementById('ap-overview-body');
        tbody.innerHTML = '';
        ['Rotwild','Rehwild','Gamswild'].forEach(group => {
            const p = currentKJ();
            const soll2 = sumPlaceholder(PLAN_PLACEHOLDER[group]);
            const intern = sumPlaceholder(INTERN_PLACEHOLDER[group]);
            const ist = (ABSCHUSS[group] && ABSCHUSS[group][p.start]) || 0;
            const vorschlag = computeVorschlag(soll2, intern);

            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${group}</td><td>${soll2}</td><td>${intern}</td><td>${ist}</td><td>${vorschlag}</td>`;
            tbody.appendChild(tr);
        });
    }

    function sumPlaceholder(obj) {
        return Object.values(obj).reduce((s,v)=>s+Number(v||0),0);
    }

    async function renderSpecies(groupId) {
        const container = document.getElementById(`ap-${groupId.toLowerCase()}`);
        if (!container || !window.AbschussplanWildgruppe) return;
        await AbschussplanWildgruppe.renderGroup(groupId, container.id);
    }

    function getPlaceholderSoll() {
        return 28;
    }

    function getPlaceholderIst(planperiode, species) {
        const status = (planperiode.status || 'Entwurf').trim();
        if (status === 'Entwurf') {
            return 0;
        }
        if (status === 'Aktiv') {
            if (species === 'Rotwild') return 12;
            if (species === 'Rehwild') return 18;
            if (species === 'Gamswild') return 10;
            return 12;
        }
        if (status === 'Archiv') {
            if (species === 'Rotwild') return 31;
            if (species === 'Rehwild') return 28;
            if (species === 'Gamswild') return 27;
            return 28;
        }
        return 0;
    }

    function getNumberColor(ist, soll) {
        if (ist === 0) return '#000000';
        if (ist < soll) return '#e67e22';
        if (ist === soll) return '#27ae60';
        return '#c0392b';
    }

    function formatPlanperiodeValue(planperiode, species) {
        const soll = getPlaceholderSoll(species);
        const ist = getPlaceholderIst(planperiode, species);
        return `${ist} / ${soll}`;
    }

    async function renderPlanperiodenTable() {
        const tbody = document.getElementById('ap-jahre-body');
        const empty = document.getElementById('ap-jahre-empty');
        const error = document.getElementById('ap-jahre-error');

        if (!tbody || !empty || !error) return;
        tbody.innerHTML = '';
        empty.style.display = 'none';
        error.style.display = 'none';

        try {
            const planperioden = await AbschussplanService.getPlanperioden();
            if (!planperioden || planperioden.length === 0) {
                empty.style.display = 'block';
                return;
            }

            planperioden.forEach(period => {
                const zeitraum = `${period.startjahr || ''} / ${period.endjahr || ''}`;
                const status = period.status || 'Entwurf';
                const soll = getPlaceholderSoll();
                const rotIst = getPlaceholderIst(period, 'Rotwild');
                const rehIst = getPlaceholderIst(period, 'Rehwild');
                const gamsIst = getPlaceholderIst(period, 'Gamswild');

                const actions = [];
                actions.push(`<button class="btn btn-outline ap-plan-edit" type="button" data-id="${period.id}">Bearbeiten</button>`);
                if (status !== 'Entwurf') {
                    actions.push(`<button class="btn btn-outline ap-plan-status" type="button" data-id="${period.id}" data-status="Entwurf">Entwurf</button>`);
                }
                if (status !== 'Aktiv') {
                    actions.push(`<button class="btn btn-outline ap-plan-status" type="button" data-id="${period.id}" data-status="Aktiv">Aktiv</button>`);
                }
                if (status !== 'Archiv') {
                    actions.push(`<button class="btn btn-outline ap-plan-status" type="button" data-id="${period.id}" data-status="Archiv">Archiv</button>`);
                }
                actions.push(`<button class="btn btn-outline ap-plan-delete" type="button" data-id="${period.id}">Löschen</button>`);

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${zeitraum}</td>
                    <td>${status}</td>
                    <td style="color:${getNumberColor(rotIst, soll)};">${rotIst} / ${soll}</td>
                    <td style="color:${getNumberColor(rehIst, soll)};">${rehIst} / ${soll}</td>
                    <td style="color:${getNumberColor(gamsIst, soll)};">${gamsIst} / ${soll}</td>
                    <td>${actions.join(' ')}</td>
                `;
                tbody.appendChild(tr);
            });

            tbody.querySelectorAll('.ap-plan-edit').forEach(btn => {
                btn.addEventListener('click', () => {
                    const periodId = btn.dataset.id;
                    openPlanperiodeModal('edit', periodId);
                });
            });

            tbody.querySelectorAll('.ap-plan-status').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const periodId = btn.dataset.id;
                    const status = btn.dataset.status;
                    const result = await AbschussplanService.setPlanperiodeStatus(periodId, status);
                    if (result) {
                        await renderPlanperiodenTable();
                    } else {
                        alert('Status konnte nicht geändert werden.');
                    }
                });
            });

            tbody.querySelectorAll('.ap-plan-delete').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const periodId = btn.dataset.id;
                    const confirmDelete = confirm('Planperiode wirklich löschen?');
                    if (!confirmDelete) return;
                    const deleted = await AbschussplanService.deletePlanperiode(periodId);
                    if (!deleted) {
                        alert('Planperiode kann nicht gelöscht werden, da abhängige Daten existieren oder ein Fehler aufgetreten ist.');
                        return;
                    }
                    await renderPlanperiodenTable();
                });
            });
        } catch (error) {
            console.error('Fehler beim Laden der Planperioden:', error);
            error.style.display = 'block';
        }
    }

    async function openPlanperiodeModal(mode, planperiodeId) {
        const modal = document.getElementById('apPlanperiodeModal');
        const title = document.getElementById('apPlanperiodeModalTitle');
        const nameInput = document.getElementById('apPlanperiodeName');
        const startInput = document.getElementById('apPlanperiodeStartjahr');
        const endInput = document.getElementById('apPlanperiodeEndjahr');
        const statusSelect = document.getElementById('apPlanperiodeStatus');
        const remarkInput = document.getElementById('apPlanperiodeBemerkung');

        if (!modal || !title || !nameInput || !startInput || !endInput || !statusSelect || !remarkInput) return;

        if (mode === 'edit' && planperiodeId) {
            title.textContent = 'Planperiode bearbeiten';
            const planperioden = await AbschussplanService.getPlanperioden();
            const period = (planperioden || []).find(item => String(item.id) === String(planperiodeId));
            if (!period) {
                alert('Planperiode nicht gefunden.');
                return;
            }
            modal.dataset.editId = period.id;
            nameInput.value = period.bezeichnung || '';
            startInput.value = period.startjahr || '';
            endInput.value = period.endjahr || '';
            statusSelect.value = period.status || 'Entwurf';
            remarkInput.value = period.bemerkung || '';
        } else {
            title.textContent = 'Neue Planperiode';
            modal.dataset.editId = '';
            nameInput.value = '';
            startInput.value = '';
            endInput.value = '';
            statusSelect.value = 'Entwurf';
            remarkInput.value = '';
        }

        modal.style.display = 'block';
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
    }

    function closePlanperiodeModal() {
        const modal = document.getElementById('apPlanperiodeModal');
        if (!modal) return;
        modal.style.display = 'none';
        modal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
    }

    async function savePlanperiode() {
        const modal = document.getElementById('apPlanperiodeModal');
        const nameInput = document.getElementById('apPlanperiodeName');
        const startInput = document.getElementById('apPlanperiodeStartjahr');
        const endInput = document.getElementById('apPlanperiodeEndjahr');
        const statusSelect = document.getElementById('apPlanperiodeStatus');
        const remarkInput = document.getElementById('apPlanperiodeBemerkung');

        if (!modal || !nameInput || !startInput || !endInput || !statusSelect || !remarkInput) return;

        const bezeichnung = nameInput.value.trim();
        const startjahr = Number(startInput.value) || 0;
        const endjahr = Number(endInput.value) || 0;
        const status = statusSelect.value;
        const bemerkung = remarkInput.value.trim();

        if (!bezeichnung) {
            alert('Bitte eine Bezeichnung eingeben.');
            return;
        }
        if (!startjahr || !endjahr || startjahr > endjahr) {
            alert('Bitte gültige Jahreszahlen eingeben.');
            return;
        }

        const payload = {
            bezeichnung,
            startjahr,
            endjahr,
            status,
            bemerkung,
            active: status === 'Aktiv'
        };

        const editId = modal.dataset.editId;
        let result = null;

        if (editId) {
            result = await AbschussplanService.updatePlanperiode(editId, payload);
            if (status === 'Aktiv') {
                await AbschussplanService.setPlanperiodeStatus(editId, 'Aktiv');
            }
        } else {
            result = await AbschussplanService.createPlanperiode(payload);
            if (result && status === 'Aktiv' && result.id) {
                await AbschussplanService.setPlanperiodeStatus(result.id, 'Aktiv');
            }
        }

        if (!result) {
            alert('Planperiode konnte nicht gespeichert werden.');
            return;
        }

        closePlanperiodeModal();
        await renderPlanperiodenTable();
    }

    function wirePlanperiodeEvents() {
        const addButton = document.getElementById('ap-add-planperiode');
        const closeButton = document.getElementById('apPlanperiodeClose');
        const cancelButton = document.getElementById('apPlanperiodeCancel');
        const saveButton = document.getElementById('apPlanperiodeSave');
        const modal = document.getElementById('apPlanperiodeModal');

        if (addButton) addButton.addEventListener('click', () => openPlanperiodeModal('new'));
        if (closeButton) closeButton.addEventListener('click', closePlanperiodeModal);
        if (cancelButton) cancelButton.addEventListener('click', closePlanperiodeModal);
        if (saveButton) saveButton.addEventListener('click', savePlanperiode);
        if (modal) {
            modal.addEventListener('click', (event) => {
                if (event.target === modal) {
                    closePlanperiodeModal();
                }
            });
        }
    }

    function wireTabs() {
        $all('.pers-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                activateTab(btn.dataset.target);
            });
        });
    }

    function activateTab(targetId) {
        $all('.ap-pane').forEach(p => p.hidden = true);
        $all('.pers-tab-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.target === targetId));
        const target = document.getElementById(targetId);
        if (target) {
            target.hidden = false;
        }

        const searchGroup = document.querySelector('.search-group');
        if (searchGroup) {
            searchGroup.style.display = targetId === 'ap-rotwild' ? 'none' : '';
        }
    }

    async function renderAll() {
        renderOverview();
        await Promise.all([
            renderSpecies('Rotwild'),
            renderSpecies('Rehwild'),
            renderSpecies('Gamswild')
        ]);
        await renderPlanperiodenTable();
    }

    // initialize when page loaded
    document.addEventListener('DOMContentLoaded', async function () {
        if (!document.getElementById('ap-overview')) return;
        renderKJSelect();
        wireTabs();
        wireKJModal();
        wirePlanperiodeEvents();
        await renderAll();
        activateTab('ap-overview');
    });

    // Export helpers for later use/testing
    window.Abschussplan = {
        computeVorschlag,
        computeAktuellerSoll,
        activateTab,
        renderAll,
        _data: {KJ_PLANS, CLASSES, ABSCHUSS, PLAN_PLACEHOLDER, INTERN_PLACEHOLDER}
    };

})();
