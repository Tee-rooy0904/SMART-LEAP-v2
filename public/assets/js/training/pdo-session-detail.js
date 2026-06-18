/*
 * SMART LEAP FILE GUIDE
 * Training workspace script for p do s es si on d et ai l.
 * Controls one static training page used by admin, PDO, or applicant training flows.
 */
TrainingUI.mountPage({
  async init(ui) {
    const sessionId = Number(ui.queryValue('sessionId', '0'));
    const detail = await ui.apiGet('api/training/show', { id: sessionId });
    if (!detail.ok) return;
    const program = detail.program || {};
    const invitees = program.invitees || [];
    document.getElementById('pdo-session-context').innerHTML = [
      ['Session Title', program.programName || '--'],
      ['Seminar Focus', (program.seminarFormCodes || []).join(', ') || '--'],
      ['Session Date', ui.formatDate(program.date)],
      ['Session Time', `${program.startTime || '--'} - ${program.endTime || '--'}`],
      ['Venue', program.venue || '--'],
      ['Session Status', program.status || '--'],
      ['What to Bring', program.whatToBring || '--'],
      ['Instructions', program.instructions || '--'],
      ['Speaker Name', program.speaker || '--'],
      ['Speaker Title', '--'],
      ['Form Access Status', (program.seminarFormCodes || []).length ? 'Open' : 'Closed'],
    ].map(([label, value]) => `<div><dt>${ui.escapeHtml(label)}</dt><dd>${ui.escapeHtml(value)}</dd></div>`).join('');
    document.getElementById('pdo-session-participants-body').innerHTML = invitees.map((row) => `<tr><td>${ui.escapeHtml(row.user?.name || '--')}</td><td>${ui.escapeHtml(row.batchGroupNumber ? `Group ${row.batchGroupNumber}` : '--')}</td><td>${ui.statusChip((row.lastNoticeSentAt || row.notifiedAt) ? 'Notice Sent' : 'Not Sent', (row.lastNoticeSentAt || row.notifiedAt) ? 'notice-system' : 'blocked')}</td><td>${ui.statusChip((program.seminarFormCodes || []).length ? 'Forms Open' : 'Forms Closed', (program.seminarFormCodes || []).length ? 'form-open' : 'blocked')}</td><td>${ui.statusChip(row.status || 'Not Marked', row.status === 'Completed' || row.status === 'Attended' ? 'attendance-present' : 'blocked')}</td><td>${ui.statusChip(row.status === 'Completed' ? 'Completed' : 'Incomplete', row.status === 'Completed' ? 'completion-done' : 'blocked')}</td><td><div class="table-row-actions"><button class="btn-ghost" type="button" data-open="operations">Open Operations</button><button class="btn-ghost" type="button">View Participant</button></div></td></tr>`).join('');
    document.getElementById('pdo-operations-summary').innerHTML = [
      ['Assigned Participants', invitees.length],
      ['Forms Available', (program.seminarFormCodes || []).length],
      ['Notices Sent', invitees.filter((row) => row.lastNoticeSentAt || row.notifiedAt).length],
      ['Attendance Marked', invitees.filter((row) => row.status !== 'Scheduled').length],
      ['Completion Count', invitees.filter((row) => row.status === 'Completed').length],
    ].map(([label, value]) => `<article class="stat-card"><p class="stat-card__label">${ui.escapeHtml(label)}</p><p class="stat-card__value">${ui.escapeHtml(value)}</p></article>`).join('');
    document.addEventListener('click', (event) => {
      if (!event.target.closest('[data-open="operations"]')) return;
      window.location.href = ui.routeUrl(`pdo/training/operations?sessionId=${sessionId}`);
    });
  },
});
