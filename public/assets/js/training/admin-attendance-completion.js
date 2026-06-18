/*
 * SMART LEAP FILE GUIDE
 * Training workspace script for a dm in a tt en da nc e c om pl et io n.
 * Controls one static training page used by admin, PDO, or applicant training flows.
 */
TrainingUI.mountPage({
  async init(ui) {
    const sessionId = Number(ui.queryValue('sessionId', '0'));
    const detail = await ui.apiGet('api/training/show', { id: sessionId });
    const context = document.getElementById('attendance-session-context');
    const summary = document.getElementById('attendance-summary-cards');
    const toolbar = document.getElementById('attendance-toolbar');
    const tableBody = document.getElementById('attendance-table-body');
    const completionForm = document.getElementById('completion-form');
    if (!detail.ok) return;
    const program = detail.program || {};
    const invitees = program.invitees || [];
    context.innerHTML = [
      ['Session Title', program.programName || '--'],
      ['Session Status', program.status || '--'],
      ['Assigned Participants', invitees.length],
      ['Attendance Last Updated', ui.formatDateTime(program.createdAt || '')],
      ['Completion Last Updated', ui.formatDateTime(program.createdAt || '')],
    ].map(([label, value]) => `<div><dt>${ui.escapeHtml(label)}</dt><dd>${ui.escapeHtml(value)}</dd></div>`).join('');
    const rows = invitees.slice().sort((a, b) => String(a.user?.name || '').localeCompare(String(b.user?.name || '')));
    summary.innerHTML = [
      ['Assigned Participants', rows.length],
      ['Attendance Marked', rows.filter((row) => row.status !== 'Scheduled').length],
      ['Present', rows.filter((row) => row.status === 'Attended').length],
      ['Absent', rows.filter((row) => row.status === 'Missed').length],
      ['Late', rows.filter((row) => row.status === 'Notified').length],
      ['Completion Count', rows.filter((row) => row.status === 'Completed').length],
    ].map(([label, value]) => `<article class="stat-card"><p class="stat-card__label">${ui.escapeHtml(label)}</p><p class="stat-card__value">${ui.escapeHtml(value)}</p></article>`).join('');
    toolbar.innerHTML = `<div class="field"><label>Filter by attendance status</label><select id="attendance-filter"><option value="">All</option><option value="Attended">Present</option><option value="Missed">Absent</option><option value="Notified">Late</option></select></div><div class="field"><label>Filter by completion status</label><select id="completion-filter"><option value="">All</option><option value="Completed">Completed</option></select></div><div class="field"><label>Sort</label><select><option>A-Z</option></select></div>`;
    function renderRows() {
      const attendanceFilter = document.getElementById('attendance-filter')?.value || '';
      const completionFilter = document.getElementById('completion-filter')?.value || '';
      tableBody.innerHTML = rows.filter((row) => (!attendanceFilter || row.status === attendanceFilter) && (!completionFilter || row.status === completionFilter)).map((row) => `<tr>
        <td>${ui.escapeHtml(row.user?.name || '--')}</td>
        <td>${ui.escapeHtml(row.batchGroupNumber ? `Group ${row.batchGroupNumber}` : '--')}</td>
        <td>${ui.statusChip('Assigned', 'assigned')}</td>
        <td>${ui.statusChip(row.status === 'Missed' ? 'Absent' : row.status, row.status === 'Completed' || row.status === 'Attended' ? 'attendance-present' : row.status === 'Missed' ? 'attendance-absent' : 'attendance-late')}</td>
        <td>${ui.escapeHtml(ui.formatDateTime(row.checkedInAt || ''))}</td>
        <td>${ui.escapeHtml('--')}</td>
        <td>${ui.escapeHtml(row.remarks || '--')}</td>
        <td>${ui.statusChip(row.status === 'Completed' ? 'Completed' : 'Incomplete', row.status === 'Completed' ? 'completion-done' : 'blocked')}</td>
        <td>${ui.escapeHtml((program.seminarFormCodes || []).length ? `0 / ${program.seminarFormCodes.length} submitted` : '--')}</td>
        <td><div class="table-row-actions"><button class="btn-ghost" type="button" data-status="Attended" data-invitee-id="${row.id}">Mark Present</button><button class="btn-ghost" type="button" data-status="Missed" data-invitee-id="${row.id}">Mark Absent</button><button class="btn-ghost" type="button" data-status="Notified" data-invitee-id="${row.id}">Mark Late</button><button class="btn-ghost" type="button" data-status="Completed" data-invitee-id="${row.id}">Mark Completed</button></div></td>
      </tr>`).join('');
    }
    document.addEventListener('change', (event) => { if (event.target.id === 'attendance-filter' || event.target.id === 'completion-filter') renderRows(); });
    document.addEventListener('click', async (event) => {
      const action = event.target.closest('[data-invitee-id]');
      if (!action) return;
      const formData = new FormData();
      formData.append('trainingInviteeId', action.dataset.inviteeId);
      formData.append('status', action.dataset.status);
      formData.append('remarks', '');
      const response = await ui.apiFormPost('api/training/attendance', formData);
      if (response.ok) window.location.reload();
    });
    completionForm.innerHTML = `<div class="field"><label for="completion_note">Completion Note</label><textarea id="completion_note"></textarea></div><div class="field"><label for="completion_timestamp">Completion Timestamp</label><input id="completion_timestamp" type="datetime-local"></div><div class="field"><label for="completed_by">Completed By</label><input id="completed_by" value="${ui.escapeHtml(window.SMARTLEAP_AUTH_USER?.name || '')}"></div><div class="field"><button class="btn" type="button">Save Completion Status</button></div>`;
    renderRows();
  },
});
