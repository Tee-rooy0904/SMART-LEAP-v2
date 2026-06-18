/*
 * SMART LEAP FILE GUIDE
 * Training workspace script for a dm in p ar ti ci pa nt a ss ig nm en t.
 * Controls one static training page used by admin, PDO, or applicant training flows.
 */
TrainingUI.mountPage({
  async init(ui) {
    const sessionId = Number(ui.queryValue('sessionId', '0'));
    const highlightApplicantId = Number(ui.queryValue('highlightApplicantId', '0'));
    const state = { activeSessionDetail: null, eligibleApplicantsList: [], assignedParticipantsList: [], capacity: ui.TRAINING_YEARLY_BATCH_CAPACITY || 255, groupSize: ui.TRAINING_BATCH_GROUP_SIZE || 100, pdoGroupAssignments: {}, ui: { dirty: false } };
    const selectedEligible = new Set();
    const selectedAssigned = new Set();
    const banner = document.getElementById('assignment-banner');
    const groupMeta = () => ui.pdoGroupMeta(state.assignedParticipantsList, state.groupSize, state.pdoGroupAssignments);

    function currentPdoBuckets() {
      const map = new Map();
      state.assignedParticipantsList.forEach((row) => {
        const pdoUserId = Number(row.assignedPdoUserId || row.assigned_pdo_user_id || 0);
        const pdoName = String(row.assignedPdoName || row.assigned_pdo_name || '').trim();
        if (pdoUserId <= 0 || !pdoName) return;
        if (!map.has(pdoUserId)) {
          map.set(pdoUserId, { pdoUserId, pdoName, count: 0, existingGroup: 0 });
        }
        const bucket = map.get(pdoUserId);
        bucket.count += 1;
        const rowGroup = Number(row.group_number || row.batchGroupNumber || 0);
        if (!bucket.existingGroup && rowGroup >= 1 && rowGroup <= 3) bucket.existingGroup = rowGroup;
      });
      return [...map.values()].sort((left, right) => String(left.pdoName || '').localeCompare(String(right.pdoName || '')));
    }

    function reconcilePdoGroupAssignments() {
      const buckets = currentPdoBuckets();
      const next = {};
      buckets.forEach((bucket) => {
        const key = String(bucket.pdoUserId);
        const existing = Number(state.pdoGroupAssignments[key] || bucket.existingGroup || 0);
        next[key] = existing >= 1 && existing <= 3 ? existing : 0;
      });
      state.pdoGroupAssignments = next;
    }

    function validate() {
      if (state.assignedParticipantsList.length > state.capacity) return `Assignment exceeds the yearly batch limit of ${state.capacity} participants.`;
      if (state.assignedParticipantsList.some((row) => !String(row.assignedPdoName || row.assigned_pdo_name || '').trim())) {
        return 'All assigned participants must have an assigned PDO before training grouping.';
      }
      const groups = groupMeta();
      if (groups.assignmentError) return groups.assignmentError;
      if (groups.some((group) => group.items.length > state.groupSize)) return `One or more training groups would exceed the maximum of ${state.groupSize} participants.`;
      return '';
    }

    function renderContext() {
      document.getElementById('assignment-session-context').innerHTML = [
        ['Session Title', state.activeSessionDetail?.programName || '--'],
        ['Seminar Focus', (state.activeSessionDetail?.seminarFormCodes || []).join(', ') || '--'],
        ['Training Year', String(state.activeSessionDetail?.date || '').slice(0, 4) || '--'],
        ['Session Status', state.activeSessionDetail?.status || '--'],
        ['Current Assigned Count', state.assignedParticipantsList.length],
        ['Remaining Capacity', Math.max(0, state.capacity - state.assignedParticipantsList.length)],
        ['Grouping Basis', 'PDO-based grouping'],
      ].map(([label, value]) => `<div><dt>${ui.escapeHtml(label)}</dt><dd>${ui.escapeHtml(value)}</dd></div>`).join('');
    }

    function renderSummary() {
      const groups = ui.groupCounts(state.assignedParticipantsList);
      document.getElementById('assignment-summary').innerHTML = [
        ['Eligible Available', state.eligibleApplicantsList.length],
        ['Selected for Assignment', selectedEligible.size],
        ['Assigned Participants', state.assignedParticipantsList.length],
        ['Remaining Capacity', Math.max(0, state.capacity - state.assignedParticipantsList.length)],
        ['Group 1 Count', groups[1]],
        ['Group 2 Count', groups[2]],
        ['Group 3 Count', groups[3]],
      ].map(([label, value]) => `<article class="stat-card"><p class="stat-card__label">${ui.escapeHtml(label)}</p><p class="stat-card__value">${ui.escapeHtml(value)}</p></article>`).join('');
      const pdoGroups = groupMeta();
      document.getElementById('group-distribution').innerHTML = [1, 2, 3].map((group) => {
        const count = groups[group];
        const pdoGroup = pdoGroups.find((item) => item.groupNumber === group);
        const groupSize = state.groupSize;
        const start = ((group - 1) * groupSize) + 1;
        const end = group * groupSize;
        const range = `${start}-${end}`;
        const pdoSummary = (pdoGroup?.pdoNames || []).length
          ? ((pdoGroup.pdoNames.length <= 2) ? pdoGroup.pdoNames.join(', ') : `${pdoGroup.pdoNames.length} PDOs combined`)
          : 'No PDOs assigned';
        return `<article class="stat-card"><p class="stat-card__label">Group ${group}: ${range}</p><p class="stat-card__value">${count}</p><span class="stat-card__helper">${ui.escapeHtml(pdoSummary)}</span><span class="stat-card__helper">Remaining Slots ${groupSize - count}</span></article>`;
      }).join('');
      const buckets = currentPdoBuckets();
      const mappingTarget = document.getElementById('pdo-group-mapping');
      if (mappingTarget) {
        mappingTarget.innerHTML = buckets.length ? buckets.map((bucket) => {
          const selected = Number(state.pdoGroupAssignments[String(bucket.pdoUserId)] || 0);
          return `<label class="field"><span>${ui.escapeHtml(bucket.pdoName)} (${ui.escapeHtml(String(bucket.count))})</span><select data-pdo-group-assignment="${bucket.pdoUserId}"><option value="">Select group</option><option value="1" ${selected === 1 ? 'selected' : ''}>Group 1</option><option value="2" ${selected === 2 ? 'selected' : ''}>Group 2</option><option value="3" ${selected === 3 ? 'selected' : ''}>Group 3</option></select></label>`;
        }).join('') : '<div class="empty-state">No PDOs are in the assigned roster yet.</div>';
      }
      const error = validate();
      ui.renderBanner(banner, error || '', error ? 'destructive' : 'warning');
      document.getElementById('save-assignment').disabled = Boolean(error);
    }

    function renderEligible() {
      document.getElementById('eligible-assignment-toolbar').innerHTML = `
        <div class="field"><label>Search by applicant name</label><input id="eligible-search"></div>
        <div class="field"><label>Search by business name</label><input id="eligible-business"></div>
        <div class="field"><label>Filter by assigned PDO</label><select id="eligible-pdo"><option value="">All</option>${[...new Set(state.eligibleApplicantsList.map((row) => row.assignedPdoName).filter(Boolean))].map((name) => `<option value="${ui.escapeHtml(name)}">${ui.escapeHtml(name)}</option>`).join('')}</select></div>
        <div class="field"><label>Sort</label><select id="eligible-sort"><option value="asc">A-Z</option><option value="desc">Z-A</option></select></div>
        <label><input type="checkbox" id="eligible-selected-only"> Show selected only</label>`;
      const rows = [...state.eligibleApplicantsList].sort((a, b) => String(a.name).localeCompare(String(b.name))).filter((row) => {
        const selectedOnly = document.getElementById('eligible-selected-only')?.checked;
        return !selectedOnly || selectedEligible.has(row.applicantProfileId);
      });
      document.getElementById('eligible-assignment-body').innerHTML = rows.map((row) => `<tr${highlightApplicantId === row.applicantProfileId ? ' class="is-highlighted"' : ''}>
        <td><input type="checkbox" data-eligible-id="${row.applicantProfileId}" ${selectedEligible.has(row.applicantProfileId) ? 'checked' : ''}></td>
        <td>${ui.escapeHtml(row.name)}</td>
        <td>${ui.escapeHtml(row.businessName || '--')}</td>
        <td>${ui.escapeHtml(row.assignedPdoName || '--')}</td>
        <td>${ui.escapeHtml(ui.formatDate(new Date().toISOString()))}</td>
        <td>${ui.statusChip('Eligible', 'eligible')}</td>
        <td><button class="btn-ghost" type="button" data-add-one="${row.applicantProfileId}">Add</button></td>
      </tr>`).join('');
    }

    function renderAssigned() {
      reconcilePdoGroupAssignments();
      state.assignedParticipantsList = ui.deriveAssignment(state.assignedParticipantsList, state.groupSize, state.pdoGroupAssignments);
      document.getElementById('assigned-toolbar').innerHTML = `
        <div class="field"><label>Search assigned name</label><input id="assigned-search"></div>
        <div class="field"><label>Filter by Training Group</label><select id="assigned-group"><option value="">All</option><option value="1">Group 1</option><option value="2">Group 2</option><option value="3">Group 3</option></select></div>
        <div class="field"><label>Sort</label><select id="assigned-sort"><option value="asc">A-Z</option><option value="desc">Z-A</option></select></div>`;
      const mappingTarget = document.getElementById('pdo-group-mapping');
      if (mappingTarget && !mappingTarget.closest('.po-training-work-block')) {
        mappingTarget.innerHTML = '';
      }
      document.getElementById('assigned-body').innerHTML = state.assignedParticipantsList.map((row) => `<tr>
        <td><input type="checkbox" data-assigned-id="${row.applicantProfileId || row.applicant_profile_id}" ${selectedAssigned.has(row.applicantProfileId || row.applicant_profile_id) ? 'checked' : ''}></td>
        <td>${ui.escapeHtml(row.name || row.applicant_full_name)}</td>
        <td>${ui.escapeHtml(row.businessName || row.business_name || '--')}</td>
        <td>${ui.escapeHtml(row.assignedPdoName || row.assigned_pdo_name || '--')}</td>
        <td>${ui.statusChip(`Group ${row.group_number || row.batchGroupNumber}`, 'assigned')}</td>
        <td>${ui.statusChip((row.lastNoticeSentAt || row.notifiedAt) ? 'Notice Sent' : 'Not Sent', (row.lastNoticeSentAt || row.notifiedAt) ? 'notice-system' : 'blocked')}</td>
        <td>${ui.statusChip((state.activeSessionDetail?.seminarFormCodes || []).length ? 'Forms Open' : 'Forms Closed', (state.activeSessionDetail?.seminarFormCodes || []).length ? 'form-open' : 'blocked')}</td>
        <td>${ui.statusChip(row.status || 'Not Marked', row.status === 'Completed' ? 'completion-done' : 'blocked')}</td>
        <td><button class="btn-ghost" type="button" data-remove-one="${row.applicantProfileId || row.applicant_profile_id}">Remove</button></td>
      </tr>`).join('');
      renderSummary();
      renderContext();
    }

    function assign(ids) {
      const chosen = state.eligibleApplicantsList.filter((row) => ids.includes(row.applicantProfileId));
      state.eligibleApplicantsList = state.eligibleApplicantsList.filter((row) => !ids.includes(row.applicantProfileId));
      state.assignedParticipantsList.push(...chosen);
      selectedEligible.clear();
      state.ui.dirty = true;
      renderEligible();
      renderAssigned();
    }

    function unassign(ids) {
      const removed = state.assignedParticipantsList.filter((row) => ids.includes(row.applicantProfileId || row.applicant_profile_id));
      state.assignedParticipantsList = state.assignedParticipantsList.filter((row) => !ids.includes(row.applicantProfileId || row.applicant_profile_id));
      state.eligibleApplicantsList.push(...removed.map((row) => ({ ...row, applicantProfileId: row.applicantProfileId || row.applicant_profile_id })));
      selectedAssigned.clear();
      state.ui.dirty = true;
      renderEligible();
      renderAssigned();
    }

    document.addEventListener('change', (event) => {
      if (event.target.matches('[data-eligible-id]')) {
        const id = Number(event.target.dataset.eligibleId);
        event.target.checked ? selectedEligible.add(id) : selectedEligible.delete(id);
        renderSummary();
      }
      if (event.target.matches('[data-assigned-id]')) {
        const id = Number(event.target.dataset.assignedId);
        event.target.checked ? selectedAssigned.add(id) : selectedAssigned.delete(id);
      }
      if (event.target.matches('[data-pdo-group-assignment]')) {
        const pdoUserId = String(event.target.dataset.pdoGroupAssignment || '');
        const groupNumber = Number(event.target.value || 0);
        if (pdoUserId) {
          state.pdoGroupAssignments[pdoUserId] = groupNumber;
          state.ui.dirty = true;
          renderAssigned();
        }
      }
    });
    document.addEventListener('click', (event) => {
      const add = event.target.closest('[data-add-one]');
      const remove = event.target.closest('[data-remove-one]');
      if (add) assign([Number(add.dataset.addOne)]);
      if (remove) unassign([Number(remove.dataset.removeOne)]);
    });
    document.getElementById('add-selected').addEventListener('click', () => assign([...selectedEligible]));
    document.getElementById('remove-selected').addEventListener('click', () => unassign([...selectedAssigned]));
    document.getElementById('auto-assign').addEventListener('click', renderAssigned);
    document.getElementById('recalculate-groups').addEventListener('click', renderAssigned);
    document.getElementById('save-assignment').addEventListener('click', async () => {
      const error = validate();
      if (error) return ui.renderBanner(banner, error, 'destructive');
      const ids = state.assignedParticipantsList.map((row) => row.applicantProfileId || row.applicant_profile_id);
      const response = await ui.apiPost('api/training/invitees', { programId: sessionId, applicantProfileIds: ids, pdoGroupAssignmentsJson: JSON.stringify(state.pdoGroupAssignments) });
      if (!response.ok) return ui.renderBanner(banner, ui.firstError(response.errors) || response.message || 'Unable to save participant assignment.', 'destructive');
      ui.renderBanner(banner, 'Participant assignment saved successfully.', 'success');
      state.ui.dirty = false;
    });

    const listing = await ui.apiGet('api/training');
    if (!listing.ok) return ui.renderBanner(banner, listing.message || 'Unable to load eligible applicants.', 'destructive');
    const detail = await ui.apiGet('api/training/show', { id: sessionId });
    if (!detail.ok) return ui.renderBanner(banner, detail.message || 'Unable to load the selected session.', 'destructive');
    state.activeSessionDetail = detail.program || null;
    state.capacity = detail.program?.yearlyBatch?.yearlyBatchCapacity || listing.data?.summary?.yearlyBatch?.yearlyBatchCapacity || state.capacity;
    state.groupSize = detail.program?.yearlyBatch?.yearlyGroupSize || listing.data?.summary?.yearlyBatch?.yearlyGroupSize || state.groupSize;
    state.assignedParticipantsList = detail.program?.invitees || [];
    reconcilePdoGroupAssignments();
    const assignedIds = new Set(state.assignedParticipantsList.map((row) => Number(row.applicantProfileId || row.applicant_profile_id)));
    state.eligibleApplicantsList = (listing.data?.eligibleInvitees || []).filter((row) => !assignedIds.has(Number(row.applicantProfileId)));
    renderEligible();
    renderAssigned();
  },
});
