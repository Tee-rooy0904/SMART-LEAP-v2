/*
 * SMART LEAP FILE GUIDE
 * Training workspace script for a dm in t ra in in g s es si on f or m.
 * Controls one static training page used by admin, PDO, or applicant training flows.
 */
TrainingUI.mountPage({
  async init(ui) {
    const sessionId = Number(ui.queryValue('sessionId', '0'));
    const modal = document.getElementById('session-confirm-modal');
    ui.bindModalClose(modal);
    const form = document.getElementById('session-form');
    const banner = document.getElementById('session-form-banner');
    const title = document.getElementById('form-page-title');
    const statusText = document.getElementById('session-form-status');
    const summaryTarget = document.getElementById('session-controls-summary');
    const auditTarget = document.getElementById('audit-rail');
    const state = { program: null, statuses: [], seminarForms: [] };

    function fillStatuses(list, selected) {
      const select = document.getElementById('session_status');
      select.innerHTML = list.map((item) => `<option value="${ui.escapeHtml(item)}" ${selected === item ? 'selected' : ''}>${ui.escapeHtml(item)}</option>`).join('');
    }

    function renderFormOptions(selectedCodes = []) {
      const wrapper = document.createElement('fieldset');
      wrapper.className = 'form-grid form-grid--single';
      wrapper.innerHTML = `<legend class="visually-hidden">Seminar form codes</legend>
        <div class="field"><label>Seminar Forms</label><div class="list-clean">${state.seminarForms.map((formOption) => `<label><input type="checkbox" name="seminarFormCodes" value="${ui.escapeHtml(formOption.code)}" ${selectedCodes.includes(formOption.code) ? 'checked' : ''}> ${ui.escapeHtml(formOption.label)}</label>`).join('')}</div></div>`;
      form.querySelector('.panel-card__body').appendChild(wrapper);
    }

    function populate(program) {
      title.textContent = sessionId > 0 ? 'Edit Training Session' : 'Create Training Session';
      ['training_year', 'session_title', 'seminar_focus', 'session_code', 'start_date', 'end_date', 'start_time', 'end_time', 'venue_name', 'venue_address', 'speaker_name', 'speaker_title', 'session_description', 'what_to_bring', 'participant_instructions', 'internal_admin_notes'].forEach((fieldId) => {
        const field = document.getElementById(fieldId);
        if (!field) return;
        const map = {
          training_year: String(program?.date || '').slice(0, 4),
          session_title: program?.programName || '',
          seminar_focus: (program?.seminarFormCodes || []).map((code) => state.seminarForms.find((item) => item.code === code)?.label || code).join(', '),
          session_code: `TR-${program?.id || 'NEW'}`,
          start_date: program?.date || '',
          end_date: program?.date || '',
          start_time: program?.startTime || '',
          end_time: program?.endTime || '',
          venue_name: program?.venue || '',
          venue_address: program?.venue || '',
          speaker_name: program?.speaker || '',
          speaker_title: '',
          session_description: program?.description || '',
          what_to_bring: program?.whatToBring || '',
          participant_instructions: program?.instructions || '',
          internal_admin_notes: '',
        };
        field.value = map[fieldId] || '';
      });
      fillStatuses(state.statuses, program?.status || 'Scheduled');
      summaryTarget.innerHTML = [
        ['Assigned Participants', program?.participantCount || 0],
        ['Forms Open Status', (program?.seminarFormCodes || []).length ? 'Open' : 'Closed'],
        ['Notices Sent Count', program?.notifiedCount || 0],
        ['Attendance Recorded Count', program?.attendedCount || 0],
        ['Completion Count', program?.completedCount || 0],
      ].map(([label, value]) => `<div><dt>${ui.escapeHtml(label)}</dt><dd>${ui.escapeHtml(value)}</dd></div>`).join('');
      auditTarget.innerHTML = [
        ['Created By', program?.createdBy || window.SMARTLEAP_AUTH_USER?.name || '--'],
        ['Created At', ui.formatDateTime(program?.createdAt || '')],
        ['Last Updated By', window.SMARTLEAP_AUTH_USER?.name || '--'],
        ['Last Updated At', ui.formatDateTime(program?.createdAt || '')],
      ].map(([label, value]) => `<div><dt>${ui.escapeHtml(label)}</dt><dd>${ui.escapeHtml(value)}</dd></div>`).join('');
    }

    async function load() {
      const listing = await ui.apiGet('api/training');
      if (!listing.ok) return ui.renderBanner(banner, listing.message || 'Unable to load training settings.', 'destructive');
      state.statuses = listing.data?.statuses || [];
      state.seminarForms = listing.data?.seminarForms || [];
      if (sessionId > 0) {
        const response = await ui.apiGet('api/training/show', { id: sessionId });
        if (!response.ok) return ui.renderBanner(banner, response.message || 'Unable to load session detail.', 'destructive');
        state.program = response.program || null;
      }
      if (!form.querySelector('input[name="seminarFormCodes"]')) renderFormOptions(state.program?.seminarFormCodes || []);
      populate(state.program);
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const saveStatus = document.getElementById('session_status').value;
      if (saveStatus === 'Completed' && state.program && (state.program.completedCount || 0) < (state.program.participantCount || 0)) {
        ui.openModal(modal);
        return;
      }
      const formData = new FormData(form);
      const payload = {
        programId: sessionId > 0 ? sessionId : '',
        programName: formData.get('session_title'),
        description: formData.get('session_description'),
        date: formData.get('start_date'),
        startTime: formData.get('start_time'),
        endTime: formData.get('end_time'),
        venue: formData.get('venue_name'),
        speaker: formData.get('speaker_name'),
        whatToBring: formData.get('what_to_bring'),
        instructions: formData.get('participant_instructions'),
        seminarFormCodes: formData.getAll('seminarFormCodes'),
        trainingMode: 'batch',
        status: saveStatus,
      };
      document.getElementById('save-session').disabled = true;
      const response = await ui.apiPost(sessionId > 0 ? 'api/training/update' : 'api/training', payload);
      document.getElementById('save-session').disabled = false;
      if (!response.ok) {
        ui.renderBanner(banner, ui.firstError(response.errors) || response.message || 'Unable to save the session.', 'destructive');
        return;
      }
      statusText.textContent = 'Session saved.';
      ui.renderBanner(banner, 'Training session saved successfully.', 'success');
      window.setTimeout(() => {
        window.location.href = ui.routeUrl(`admin/training/assignment?sessionId=${response.programId || sessionId}`);
      }, 400);
    });

    document.getElementById('cancel-session').addEventListener('click', () => { window.location.href = ui.routeUrl('admin/training'); });
    document.getElementById('save-draft').addEventListener('click', () => form.requestSubmit());
    await load();
  },
});
