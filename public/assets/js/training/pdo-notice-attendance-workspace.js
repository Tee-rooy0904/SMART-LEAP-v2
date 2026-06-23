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
    document.getElementById('pdo-notice-body').innerHTML = invitees.map((row) => `<tr><td>${ui.escapeHtml(row.user?.name || '--')}</td><td>${ui.escapeHtml(row.batchGroupNumber ? `Group ${row.batchGroupNumber}` : '--')}</td><td>${ui.statusChip((row.lastNoticeSentAt || row.notifiedAt) ? 'In-System Sent' : 'Not Sent', (row.lastNoticeSentAt || row.notifiedAt) ? 'notice-system' : 'blocked')}</td><td>${ui.statusChip((row.lastNoticeSentAt || row.notifiedAt) ? 'Email Sent' : 'Not Sent', (row.lastNoticeSentAt || row.notifiedAt) ? 'notice-email' : 'blocked')}</td><td>${ui.escapeHtml(ui.formatDateTime(row.lastNoticeSentAt || row.notifiedAt || ''))}</td></tr>`).join('');
    const displayStatus = (status) => status === 'Attended' || status === 'Completed' ? 'Present' : (status === 'Missed' ? 'Absent' : (status || 'Not Marked'));
    const completionStatus = (row) => row.completedByAttendance || row.completionStatus === 'Completed' ? 'Completed' : 'Incomplete';
    const chipStyle = 'cursor:pointer;display:inline-flex;align-items:center;gap:8px;min-height:28px;padding:0 10px;border-radius:999px;border:1px solid currentColor;background:#fff;font-size:0.8125rem;font-weight:700;white-space:nowrap;font-family:inherit';
    document.getElementById('pdo-attendance-body').innerHTML = invitees.map((row) => `<tr><td>${ui.escapeHtml(row.user?.name || '--')}</td><td>${ui.escapeHtml(row.batchGroupNumber ? `Group ${row.batchGroupNumber}` : '--')}</td><td><button type="button" class="attendance-mark-btn" data-invitee-id="${row.id}" data-name="${ui.escapeHtml(row.user?.name || '')}" data-status="${row.status || ''}" style="${chipStyle};color:${row.status === 'Completed' || row.status === 'Attended' ? 'var(--training-attendance-present)' : 'var(--training-blocked)'}">${displayStatus(row.status)}</button></td><td>${ui.escapeHtml(ui.formatDateTime(row.checkedInAt || ''))}</td><td>${ui.escapeHtml(row.remarks || '--')}</td></tr>`).join('');
    document.getElementById('pdo-completion-body').innerHTML = invitees.map((row) => `<tr><td>${ui.escapeHtml(row.user?.name || '--')}</td><td>${ui.statusChip(displayStatus(row.status), row.status === 'Completed' || row.status === 'Attended' ? 'attendance-present' : 'blocked')}</td><td>${ui.escapeHtml((detail.program?.seminarFormCodes || []).length ? `0 / ${detail.program.seminarFormCodes.length} submitted` : '--')}</td><td>${ui.statusChip(completionStatus(row), completionStatus(row) === 'Completed' ? 'completion-done' : 'blocked')}</td></tr>`).join('');

    const modal = document.getElementById('attendance-modal');
    const statusSelect = document.getElementById('attendance-status-select');
    const proofField = document.getElementById('attendance-proof-field');
    const proofInput = document.getElementById('attendance-proof-input');
    const modalName = document.getElementById('attendance-modal-name');
    const cancelBtn = document.getElementById('attendance-modal-cancel');
    const submitBtn = document.getElementById('attendance-modal-submit');
    let selectedInviteeId = null;

    document.addEventListener('click', async (event) => {
      const notify = event.target.closest('[data-notify-id]');
      if (notify) {
        const response = await ui.apiPost('api/training/notices', { programId: sessionId, inviteeIds: [Number(notify.dataset.notifyId)] });
        if (response.ok) window.location.reload();
      }
      const markBtn = event.target.closest('.attendance-mark-btn');
      if (markBtn) {
        selectedInviteeId = Number(markBtn.dataset.inviteeId);
        modalName.textContent = markBtn.dataset.name;
        statusSelect.value = 'Attended';
        proofField.style.display = 'none';
        proofInput.value = '';
        modal.classList.add('is-open');
      }
    });

    statusSelect.addEventListener('change', function () {
      proofField.style.display = this.value === 'Missed' || this.value === 'Excused' ? 'block' : 'none';
      if (this.value !== 'Missed' && this.value !== 'Excused') {
        proofInput.value = '';
      }
    });

    cancelBtn.addEventListener('click', function () {
      modal.classList.remove('is-open');
      selectedInviteeId = null;
      proofInput.value = '';
    });

    submitBtn.addEventListener('click', async function () {
      if (!selectedInviteeId) return;
      const status = statusSelect.value;
      const formData = new FormData();
      formData.append('trainingInviteeId', String(selectedInviteeId));
      formData.append('status', status);
      formData.append('remarks', '');
      if ((status === 'Missed' || status === 'Excused') && proofInput.files.length > 0) {
        formData.append('proofAttachment', proofInput.files[0]);
      }
      const response = await ui.apiFormPost('api/training/attendance', formData);
      modal.classList.remove('is-open');
      if (response.ok) window.location.reload();
    });

    modal.addEventListener('click', function (event) {
      if (event.target === modal) {
        modal.classList.remove('is-open');
        selectedInviteeId = null;
        proofInput.value = '';
      }
    });
  },
});
