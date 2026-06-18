/*
 * SMART LEAP FILE GUIDE
 * Training workspace script for p do n ot ic e a tt en da nc e w or ks pa ce.
 * Controls one static training page used by admin, PDO, or applicant training flows.
 */
TrainingUI.mountPage({
  async init(ui) {
    const sessionId = Number(ui.queryValue('sessionId', '0'));
    const detail = await ui.apiGet('api/training/show', { id: sessionId });
    if (!detail.ok) return;
    const invitees = detail.program?.invitees || [];
    document.getElementById('pdo-notice-body').innerHTML = invitees.map((row) => `<tr><td>${ui.escapeHtml(row.user?.name || '--')}</td><td>${ui.escapeHtml(row.batchGroupNumber ? `Group ${row.batchGroupNumber}` : '--')}</td><td>${ui.statusChip((row.lastNoticeSentAt || row.notifiedAt) ? 'In-System Sent' : 'Not Sent', (row.lastNoticeSentAt || row.notifiedAt) ? 'notice-system' : 'blocked')}</td><td>${ui.statusChip((row.lastNoticeSentAt || row.notifiedAt) ? 'Email Sent' : 'Not Sent', (row.lastNoticeSentAt || row.notifiedAt) ? 'notice-email' : 'blocked')}</td><td>${ui.escapeHtml(ui.formatDateTime(row.lastNoticeSentAt || row.notifiedAt || ''))}</td><td><button class="btn-ghost" type="button" data-notify-id="${row.id}">Resend</button></td></tr>`).join('');
    const displayStatus = (status) => status === 'Attended' || status === 'Completed' ? 'Present' : (status === 'Missed' ? 'Absent' : (status || 'Not Marked'));
    const completionStatus = (row) => row.completedByAttendance || row.completionStatus === 'Completed' ? 'Completed' : 'Incomplete';
    document.getElementById('pdo-attendance-body').innerHTML = invitees.map((row) => `<tr><td>${ui.escapeHtml(row.user?.name || '--')}</td><td>${ui.escapeHtml(row.batchGroupNumber ? `Group ${row.batchGroupNumber}` : '--')}</td><td>${ui.statusChip(displayStatus(row.status), row.status === 'Completed' || row.status === 'Attended' ? 'attendance-present' : 'blocked')}</td><td>${ui.escapeHtml(ui.formatDateTime(row.checkedInAt || ''))}</td><td>${ui.escapeHtml(row.remarks || '--')}</td><td><div class="table-row-actions"><button class="btn-ghost" type="button" data-status="Attended" data-invitee-id="${row.id}">Mark Present</button><button class="btn-ghost" type="button" data-status="Missed" data-invitee-id="${row.id}">Mark Absent</button><button class="btn-ghost" type="button" data-status="Excused" data-invitee-id="${row.id}">Mark Excused</button></div></td></tr>`).join('');
    document.getElementById('pdo-completion-body').innerHTML = invitees.map((row) => `<tr><td>${ui.escapeHtml(row.user?.name || '--')}</td><td>${ui.statusChip(displayStatus(row.status), row.status === 'Completed' || row.status === 'Attended' ? 'attendance-present' : 'blocked')}</td><td>${ui.escapeHtml((detail.program?.seminarFormCodes || []).length ? `0 / ${detail.program.seminarFormCodes.length} submitted` : '--')}</td><td>${ui.statusChip(completionStatus(row), completionStatus(row) === 'Completed' ? 'completion-done' : 'blocked')}</td><td>${ui.escapeHtml(row.presentSessionCount ? `${row.presentSessionCount} / 3 present sessions` : '--')}</td></tr>`).join('');
    document.addEventListener('click', async (event) => {
      const notify = event.target.closest('[data-notify-id]');
      if (notify) {
        const response = await ui.apiPost('api/training/notices', { programId: sessionId, inviteeIds: [Number(notify.dataset.notifyId)] });
        if (response.ok) window.location.reload();
      }
      const attendance = event.target.closest('[data-invitee-id]');
      if (!attendance) return;
      if (!['Attended', 'Missed', 'Excused'].includes(String(attendance.dataset.status || ''))) return;
      const formData = new FormData();
      formData.append('trainingInviteeId', attendance.dataset.inviteeId);
      formData.append('status', attendance.dataset.status);
      formData.append('remarks', '');
      const response = await ui.apiFormPost('api/training/attendance', formData);
      if (response.ok) window.location.reload();
    });
  },
});
