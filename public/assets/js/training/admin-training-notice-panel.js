/*
 * SMART LEAP FILE GUIDE
 * Training workspace script for a dm in t ra in in g n ot ic e p an el.
 * Controls one static training page used by admin, PDO, or applicant training flows.
 */
TrainingUI.mountPage({
  async init(ui) {
    const sessionId = Number(ui.queryValue('sessionId', '0'));
    const banner = document.getElementById('notice-banner');
    const modal = document.getElementById('notice-preview-modal');
    ui.bindModalClose(modal);
    const detail = await ui.apiGet('api/training/show', { id: sessionId });
    if (!detail.ok) return ui.renderBanner(banner, detail.message || 'Unable to load notice panel.', 'destructive');
    const program = detail.program || {};
    const invitees = program.invitees || [];
    const groupOptions = [0, 1, 2, 3];

    function selectedGroupNumber() {
      return Number(document.getElementById('notice_group_target')?.value || '0');
    }

    function filteredInvitees() {
      const groupNumber = selectedGroupNumber();
      if (!groupNumber) return invitees;
      return invitees.filter((row) => Number(row.batchGroupNumber || row.group_number || 0) === groupNumber);
    }

    function targetLabel() {
      const groupNumber = selectedGroupNumber();
      return groupNumber ? `Group ${groupNumber}` : 'Assigned Participants';
    }

    function groupLabel(groupNumber) {
      if (!groupNumber) return 'All Assigned Participants';
      return `Group ${groupNumber}`;
    }

    function updateActionCopy() {
      const label = targetLabel();
      const sendButton = document.getElementById('send-notice');
      const previewSendButton = document.getElementById('send-preview-notice');
      if (sendButton) sendButton.textContent = label === 'Assigned Participants' ? 'Send Notice to Assigned Participants' : `Send Notice to ${label}`;
      if (previewSendButton) previewSendButton.textContent = label === 'Assigned Participants' ? 'Send Notice to Assigned Participants' : `Send Notice to ${label}`;
    }

    document.getElementById('notice-session-context').innerHTML = [
      ['Session Title', program.programName || '--'],
      ['Assigned Participants Count', invitees.length],
      ['Notice Summary', `${invitees.filter((row) => row.lastNoticeSentAt || row.notifiedAt).length} sent`],
      ['Session Date', ui.formatDate(program.date)],
      ['Venue', program.venue || '--'],
    ].map(([label, value]) => `<div><dt>${ui.escapeHtml(label)}</dt><dd>${ui.escapeHtml(value)}</dd></div>`).join('');
    document.getElementById('notice-compose-form').innerHTML = `
      <div class="field"><label for="notice_subject">Notice Subject</label><input id="notice_subject" value="SMART LEAP Training Notice: ${ui.escapeHtml(program.programName || 'Training Session')}"></div>
      <div class="field"><label for="notice_message">Notice Message</label><textarea id="notice_message">You have been scheduled for this SMART LEAP training session.</textarea></div>
      <div class="field"><label for="notice_group_target">Notice Target</label><select id="notice_group_target">${groupOptions.map((value) => `<option value="${value}">${groupLabel(value)}</option>`).join('')}</select></div>
      <div class="field"><label>Session Title</label><input readonly value="${ui.escapeHtml(program.programName || '--')}"></div>
      <div class="field"><label>Seminar Focus</label><input readonly value="${ui.escapeHtml((program.seminarFormCodes || []).join(', ') || '--')}"></div>
      <div class="field"><label>Schedule</label><input readonly value="${ui.escapeHtml(`${ui.formatDate(program.date)} ${program.startTime || ''} - ${program.endTime || ''}`)}"></div>
      <div class="field"><label>Venue</label><input readonly value="${ui.escapeHtml(program.venue || '--')}"></div>
      <div class="field"><label>What to Bring</label><input readonly value="${ui.escapeHtml(program.whatToBring || '--')}"></div>
      <div class="field"><label>Instructions</label><textarea readonly>${ui.escapeHtml(program.instructions || '--')}</textarea></div>
      <label><input type="checkbox" id="send_in_system" checked> Send in-system</label>
      <label><input type="checkbox" id="send_email" checked> Send email</label>
      <div class="table-row-actions"><button class="btn-secondary" type="button" id="preview-notice">Preview Notice</button><button class="btn" type="button" id="send-notice">Send Notice to Assigned Participants</button></div>`;
    function renderSummaryAndTable() {
      const scopedInvitees = filteredInvitees();
      const inSystemSent = scopedInvitees.filter((row) => row.notifiedAt || row.lastNoticeSentAt).length;
      const emailSent = inSystemSent;
      const notSent = scopedInvitees.length - inSystemSent;
      document.getElementById('notice-summary-cards').innerHTML = [
        [targetLabel(), scopedInvitees.length],
        ['In-System Sent', inSystemSent],
        ['Email Sent', emailSent],
        ['Email Failed', 0],
        ['Not Sent', notSent],
      ].map(([label, value]) => `<article class="stat-card"><p class="stat-card__label">${ui.escapeHtml(label)}</p><p class="stat-card__value">${ui.escapeHtml(value)}</p></article>`).join('');
      document.getElementById('notice-delivery-body').innerHTML = scopedInvitees.map((row) => `<tr><td>${ui.escapeHtml(row.user?.name || '--')}</td><td>${ui.escapeHtml(row.batchGroupNumber ? `Group ${row.batchGroupNumber}` : '--')}</td><td>${ui.statusChip(row.notifiedAt || row.lastNoticeSentAt ? 'In-System Sent' : 'Not Sent', row.notifiedAt || row.lastNoticeSentAt ? 'notice-system' : 'blocked')}</td><td>${ui.statusChip(row.notifiedAt || row.lastNoticeSentAt ? 'Email Sent' : 'Not Sent', row.notifiedAt || row.lastNoticeSentAt ? 'notice-email' : 'blocked')}</td><td>${ui.escapeHtml(ui.formatDateTime(row.lastNoticeSentAt || row.notifiedAt || ''))}</td><td>${ui.escapeHtml('--')}</td><td><button class="btn-ghost" data-invitee-id="${row.id}" type="button">Resend</button></td></tr>`).join('') || '<tr><td colspan="7" class="empty-state">No assigned participants were found for the selected group.</td></tr>';
      updateActionCopy();
    }
    document.getElementById('notice_group_target').addEventListener('change', renderSummaryAndTable);
    async function sendNoticeBatch() {
      const scopedInvitees = filteredInvitees();
      if (!invitees.length) return ui.renderBanner(banner, 'No assigned participants are available. Notices can only be sent after participant assignment.', 'warning');
      if (!scopedInvitees.length) return ui.renderBanner(banner, 'No assigned participants were found for the selected group.', 'warning');
      if (!document.getElementById('send_in_system').checked && !document.getElementById('send_email').checked) return ui.renderBanner(banner, 'Select at least one notice delivery method before sending.', 'warning');
      const groupNumber = selectedGroupNumber();
      const response = await ui.apiPost('api/training/notices', { programId: sessionId, inviteeIds: [], groupNumber: groupNumber || null });
      if (!response.ok) return ui.renderBanner(banner, ui.firstError(response.errors) || response.message || 'Unable to send notices.', 'destructive');
      ui.renderBanner(banner, `${targetLabel()} notices processed. ${response.sentCount || 0} sent or logged.`, 'success');
      window.location.reload();
    }
    document.getElementById('preview-notice').addEventListener('click', () => {
      document.getElementById('notice-preview-body').innerHTML = `<p>Hello participant,</p><p>${ui.escapeHtml(document.getElementById('notice_message').value)}</p><p><strong>Target:</strong> ${ui.escapeHtml(targetLabel())}</p>`;
      ui.openModal(modal);
    });
    document.getElementById('send-notice').addEventListener('click', sendNoticeBatch);
    document.getElementById('send-preview-notice').addEventListener('click', sendNoticeBatch);
    document.addEventListener('click', async (event) => {
      const row = event.target.closest('[data-invitee-id]');
      if (!row) return;
      const response = await ui.apiPost('api/training/notices', { programId: sessionId, inviteeIds: [Number(row.dataset.inviteeId)] });
      if (!response.ok) return ui.renderBanner(banner, ui.firstError(response.errors) || response.message || 'Unable to resend notice.', 'destructive');
      window.location.reload();
    });
    renderSummaryAndTable();
  },
});
