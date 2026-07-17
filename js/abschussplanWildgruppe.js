/* Abschussplan Wildgruppen-Komponente
   Gemeinsame KJ-Abschussplan-Logik für Rotwild, Rehwild und Gamswild.
   Diese Komponente übernimmt Laden, Anzeigen, Dialogöffnung, Speichern und Löschen.
*/

const AbschussplanWildgruppe = (function () {
    const GROUP_MAP = {
        RW: 'Rotwild',
        RE: 'Rehwild',
        GA: 'Gamswild'
    };

    function $(sel, ctx = document) {
        return ctx.querySelector(sel);
    }

    function $all(sel, ctx = document) {
        return Array.from(ctx.querySelectorAll(sel));
    }

    function resolveWildgruppe(groupCode) {
        if (!groupCode) return '';
        const key = String(groupCode).trim();
        if (GROUP_MAP[key]) {
            return GROUP_MAP[key];
        }
        const mapped = Object.values(GROUP_MAP).find(name => name === key);
        return mapped || key;
    }

    async function getWildgruppeId(groupName) {
        const wildgruppen = await AbschussplanService.getWildgruppen();
        const wildgruppe = (wildgruppen || []).find(item => item.name === groupName || item.bezeichnung === groupName || String(item.id) === String(groupName));
        return wildgruppe ? wildgruppe.id : null;
    }

    async function buildGroupPane(groupCode, containerId) {
        const groupName = resolveWildgruppe(groupCode);
        const container = document.getElementById(containerId);
        if (!container) return;

        const tpl = document.getElementById('ap-species-template');
        if (!tpl) return;

        const node = tpl.content.cloneNode(true);
        const root = node.querySelector('.ap-species');
        root.dataset.group = groupName;
        root.querySelector('.ap-species-title').textContent = groupName;

        const addButton = root.querySelector('.ap-add-kj');
        const editButton = root.querySelector('.ap-edit-kj');
        const deleteButton = root.querySelector('.ap-delete-kj');
        const noDataMessage = root.querySelector('.ap-no-data-message');
        const speciesTable = root.querySelector('.ap-species-table');
        const speciesBody = root.querySelector('.ap-species-body');
        const planperiodeInfo = root.querySelector('.ap-planperiode-info');

        const activePlanperiode = await AbschussplanService.getAktivePlanperiode();
        const plans = activePlanperiode ? await AbschussplanService.getAbschussplaene(activePlanperiode.id) : [];
        const existingPlan = (plans || []).find(p => p.wildgruppe === groupName && p.plan_typ === 'KJ');

        if (activePlanperiode) {
            planperiodeInfo.textContent = `Aktive Planperiode ${activePlanperiode.startjahr} / ${activePlanperiode.endjahr}`;
        } else {
            planperiodeInfo.textContent = 'Aktive Planperiode nicht gefunden.';
        }

        if (groupName !== 'Rotwild') {
            planperiodeInfo.hidden = true;
        }

        addButton.addEventListener('click', () => openKJModal(groupCode));
        editButton.addEventListener('click', () => openKJModal(groupCode));
        deleteButton.addEventListener('click', async () => {
            const deleted = await deleteKJPlanForGroup(groupName);
            if (deleted) {
                await renderGroup(groupCode, containerId);
                alert('KJ-Abschussplan gelöscht.');
            }
        });

        if (!existingPlan) {
            speciesTable.hidden = true;
            noDataMessage.style.display = 'block';
            editButton.hidden = true;
            deleteButton.hidden = true;
            if (groupName === 'Rotwild' && activePlanperiode) {
                noDataMessage.textContent = 'Für die aktive Planperiode wurde noch kein KJ-Abschussplan für Rotwild angelegt.';
            }
        } else {
            noDataMessage.style.display = 'none';
            speciesTable.hidden = false;
            editButton.hidden = false;
            deleteButton.hidden = false;

            const positions = await AbschussplanService.getPositionen(existingPlan.id);
            speciesBody.innerHTML = '';

            if (!positions || positions.length === 0) {
                const tr = document.createElement('tr');
                tr.innerHTML = '<td colspan="2">Keine Positionen im KJ-Abschussplan vorhanden.</td>';
                speciesBody.appendChild(tr);
            } else {
                positions.forEach(position => {
                    const klasse = position.wildklasse_name || position.name || position.wildklasse_id;
                    const soll = position.soll_2_jahre || 0;
                    const tr = document.createElement('tr');
                    tr.innerHTML = `<td>${klasse}</td><td>${soll}</td>`;
                    speciesBody.appendChild(tr);
                });
            }
        }

        container.innerHTML = '';
        container.appendChild(root);
    }

    async function renderGroup(groupCode, containerId) {
        await buildGroupPane(groupCode, containerId);
    }

    async function openKJModal(groupCode) {
        const groupName = resolveWildgruppe(groupCode);
        const modal = document.getElementById('kjPlanModal');
        const modalTitle = document.getElementById('kjModalTitle');
        const planperiodeInput = document.getElementById('kjPlanperiode');
        const wildgruppeInput = document.getElementById('kjWildgruppe');
        const tableContainer = document.getElementById('kjPlanTableContainer');
        const emptyMessage = document.getElementById('kjPlanEmpty');
        const positionsBody = document.getElementById('kjPlanPositionsBody');

        if (!modal || !planperiodeInput || !wildgruppeInput || !tableContainer || !emptyMessage || !positionsBody) return;
        if (modalTitle) {
            modalTitle.textContent = `KJ-Abschussplan ${groupName}`;
        }

        planperiodeInput.value = 'Lade...';
        wildgruppeInput.value = groupName;
        positionsBody.innerHTML = '';
        modal.dataset.planId = '';

        const activePlanperiode = await AbschussplanService.getAktivePlanperiode();
        if (activePlanperiode) {
            planperiodeInput.value = `${activePlanperiode.startjahr} / ${activePlanperiode.endjahr}`;
        } else {
            planperiodeInput.value = 'Keine aktive Planperiode';
        }

        const wildgruppeId = await getWildgruppeId(groupName);
        const wildklassen = wildgruppeId ? await AbschussplanService.getWildklassen(wildgruppeId) : [];
        const plans = activePlanperiode ? await AbschussplanService.getAbschussplaene(activePlanperiode.id) : [];
        const existingPlan = (plans || []).find(p => p.wildgruppe === groupName && p.plan_typ === 'KJ');

        if (!wildgruppeId || !wildklassen || wildklassen.length === 0) {
            emptyMessage.textContent = 'Es wurden keine Klassen gefunden.';
            emptyMessage.style.display = 'block';
            tableContainer.style.display = 'none';
        } else {
            tableContainer.style.display = 'block';
            emptyMessage.style.display = existingPlan ? 'none' : 'block';
            emptyMessage.textContent = existingPlan ? '' : 'Es wurde noch kein KJ-Abschussplan angelegt.';
            positionsBody.innerHTML = '';

            let positions = [];
            if (existingPlan && existingPlan.id) {
                modal.dataset.planId = existingPlan.id;
                positions = await AbschussplanService.getPositionen(existingPlan.id);
            }

            wildklassen.forEach(klasse => {
                const position = positions.find(pos => String(pos.wildklasse_id) === String(klasse.id));
                const sollWert = position ? position.soll_2_jahre : 0;
                const tr = document.createElement('tr');
                tr.innerHTML = `<td>${klasse.name || klasse.klasse || ''}</td><td><input type="number" class="kj-plan-soll" data-klasse-id="${klasse.id}" data-position-id="${position ? position.id : ''}" value="${sollWert}" /></td>`;
                positionsBody.appendChild(tr);
            });

            const firstInput = positionsBody.querySelector('.kj-plan-soll');
            if (firstInput) {
                firstInput.focus();
            }
        }

        modal.style.display = 'block';
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
    }

    function closeKJModal() {
        const modal = document.getElementById('kjPlanModal');
        if (!modal) return;
        modal.style.display = 'none';
        modal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
    }

    async function saveKJPlan() {
        const modal = document.getElementById('kjPlanModal');
        const planperiodeInput = document.getElementById('kjPlanperiode');
        const wildgruppeInput = document.getElementById('kjWildgruppe');
        const positionsBody = document.getElementById('kjPlanPositionsBody');
        if (!modal || !planperiodeInput || !wildgruppeInput || !positionsBody) return;

        const activePlanperiode = await AbschussplanService.getAktivePlanperiode();
        if (!activePlanperiode) {
            alert('Keine aktive Planperiode verfügbar.');
            return;
        }

        const wildgruppe = wildgruppeInput.value;
        const planId = modal.dataset.planId;
        const inputs = Array.from(positionsBody.querySelectorAll('.kj-plan-soll'));
        if (inputs.length === 0) {
            alert('Keine Klassen zum Speichern gefunden.');
            return;
        }

        let plan = null;
        if (planId) {
            plan = await AbschussplanService.getAbschussplan(planId);
        }

        if (!plan) {
            const planPayload = {
                planperiode_id: activePlanperiode.id,
                wildgruppe: wildgruppe,
                plan_typ: 'KJ',
                jahr: null
            };
            plan = await AbschussplanService.createAbschussplan(planPayload);
            if (!plan || !plan.id) {
                alert('Fehler beim Anlegen des KJ-Abschussplans.');
                return;
            }
            modal.dataset.planId = plan.id;
        }

        for (const input of inputs) {
            const klasseId = input.dataset.klasseId;
            const positionId = input.dataset.positionId;
            const sollWert = Number(input.value) || 0;
            const payload = {
                abschussplan_id: plan.id,
                wildklasse_id: klasseId,
                soll_2_jahre: sollWert
            };
            if (positionId) {
                await AbschussplanService.updatePosition(positionId, payload);
            } else {
                const position = await AbschussplanService.createPosition(payload);
                if (position && position.id) {
                    input.dataset.positionId = position.id;
                }
            }
        }

        closeKJModal();
        window.Abschussplan?.renderAll?.();
        alert('KJ-Abschussplan gespeichert.');
    }

    async function deleteKJPlan() {
        const confirmDelete = confirm('KJ-Abschussplan wirklich löschen?');
        if (!confirmDelete) return;

        const activePlanperiode = await AbschussplanService.getAktivePlanperiode();
        if (!activePlanperiode) {
            alert('Keine aktive Planperiode verfügbar.');
            return;
        }

        const wildgruppe = document.getElementById('kjWildgruppe')?.value;
        if (!wildgruppe) return;

        const deleted = await deleteKJPlanForGroup(wildgruppe);
        if (!deleted) {
            return;
        }

        closeKJModal();
        window.Abschussplan?.renderAll?.();
        alert('KJ-Abschussplan gelöscht.');
    }

    function wireKJModal() {
        const closeBtn = document.getElementById('kjModalClose');
        const saveBtn = document.getElementById('kjPlanSave');
        const deleteBtn = document.getElementById('kjPlanDelete');

        if (closeBtn) closeBtn.addEventListener('click', closeKJModal);
        if (saveBtn) saveBtn.addEventListener('click', saveKJPlan);
        if (deleteBtn) deleteBtn.addEventListener('click', deleteKJPlan);

        const modal = document.getElementById('kjPlanModal');
        if (modal) {
            modal.addEventListener('click', (event) => {
                if (event.target === modal) {
                    closeKJModal();
                }
            });
        }
    }

    async function deleteKJPlanForGroup(groupName) {
        const activePlanperiode = await AbschussplanService.getAktivePlanperiode();
        if (!activePlanperiode) {
            alert('Keine aktive Planperiode verfügbar.');
            return false;
        }

        const plans = await AbschussplanService.getAbschussplaene(activePlanperiode.id);
        const plan = (plans || []).find(p => p.wildgruppe === groupName && p.plan_typ === 'KJ');
        if (!plan) {
            alert('Kein KJ-Abschussplan zum Löschen gefunden.');
            return false;
        }

        const positions = await AbschussplanService.getPositionen(plan.id);
        for (const position of positions) {
            await AbschussplanService.deletePosition(position.id);
        }

        await AbschussplanService.deleteAbschussplan(plan.id);
        return true;
    }

    const api = {
        renderGroup,
        openKJModal,
        wireKJModal,
        saveKJPlan,
        deleteKJPlan,
        deleteKJPlanForGroup
    };

    window.AbschussplanWildgruppe = api;
    return api;
})();
