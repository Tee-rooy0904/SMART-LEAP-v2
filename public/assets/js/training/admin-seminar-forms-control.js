/*
 * SMART LEAP FILE GUIDE
 * Training workspace script for a dm in s em in ar f or ms c on tr ol.
 * Controls one static training page used by admin, PDO, or applicant training flows.
 */
TrainingUI.mountPage({
  async init(ui) {
    const sessionId = Number(ui.queryValue('sessionId', '0'));
    const banner = document.getElementById('forms-banner');
    const modal = document.getElementById('close-forms-modal');
    ui.bindModalClose(modal);
    const listing = await ui.apiGet('api/training');
    const detail = await ui.apiGet('api/training/show', { id: sessionId });
    if (!listing.ok || !detail.ok) return ui.renderBanner(banner, listing.message || detail.message || 'Unable to load seminar form controls.', 'destructive');
    const seminarForms = listing.data?.seminarForms || [];
    const program = detail.program || {};
    let selectedCodes = [...(program.seminarFormCodes || [])];
    document.getElementById('forms-session-context').innerHTML = [
      ['Session Title', program.programName || '--'],
      ['Seminar Focus', selectedCodes.map((code) => seminarForms.find((item) => item.code === code)?.label || code).join(', ') || '--'],
      ['Assigned Participants Count', program.invitees?.length || 0],
      ['Session Status', program.status || '--'],
      ['Form Access Status', selectedCodes.length ? 'Forms Open' : 'Forms Closed'],
    ].map(([label, value]) => `<div><dt>${ui.escapeHtml(label)}</dt><dd>${ui.escapeHtml(value)}</dd></div>`).join('');
    document.getElementById('form-options-list').innerHTML = seminarForms.map((formOption) => `<article class="panel-card"><div class="panel-card__body"><div class="table-row-actions"><label><input type="checkbox" data-form-code="${ui.escapeHtml(formOption.code)}" ${selectedCodes.includes(formOption.code) ? 'checked' : ''}> Include</label><button class="btn-ghost" type="button">Preview Form</button></div><div class="label-value-list"><div><dt>Form Name</dt><dd>${ui.escapeHtml(formOption.label)}</dd></div><div><dt>Form Code</dt><dd>${ui.escapeHtml(formOption.code)}</dd></div><div><dt>Focus Compatibility</dt><dd>${ui.escapeHtml(formOption.label)}</dd></div><div><dt>Current Open Status</dt><dd>${ui.statusChip(selectedCodes.includes(formOption.code) ? 'Open' : 'Closed', selectedCodes.includes(formOption.code) ? 'form-open' : 'blocked')}</dd></div><div><dt>Last Opened By</dt><dd>${ui.escapeHtml(program.createdBy || '--')}</dd></div><div><dt>Last Opened At</dt><dd>${ui.escapeHtml(ui.formatDateTime(program.createdAt || ''))}</dd></div></div></div></article>`).join('');
    document.getElementById('form-access-controls').innerHTML = `
      <div class="field"><label for="form_access_mode">Form Access Mode</label><select id="form_access_mode"><option value="Closed" ${selectedCodes.length ? '' : 'selected'}>Closed</option><option value="Open for Assigned Participants" ${selectedCodes.length ? 'selected' : ''}>Open for Assigned Participants</option></select></div>
      <div class="field"><label for="forms_open_start_at">Forms Open Start At</label><input id="forms_open_start_at" type="datetime-local" value="${(program.startsAt || '').slice(0, 16)}"></div>
      <div class="field"><label for="forms_open_end_at">Forms Open End At</label><input id="forms_open_end_at" type="datetime-local" value="${(program.endsAt || '').slice(0, 16)}"></div>
      <div class="field"><label for="forms_access_message">Forms Access Message</label><textarea id="forms_access_message">Seminar forms are available while this session is active.</textarea></div>`;
    function renderPreview() {
      const invitees = program.invitees || [];
      document.getElementById('form-visibility-summary').innerHTML = [
        ['Assigned Participants', invitees.length],
        ['Participants With Access', selectedCodes.length ? invitees.length : 0],
        ['Participants Without Access', selectedCodes.length ? 0 : invitees.length],
        ['Form Set Count Opened', selectedCodes.length],
      ].map(([label, value]) => `<article class="stat-card"><p class="stat-card__label">${ui.escapeHtml(label)}</p><p class="stat-card__value">${ui.escapeHtml(value)}</p></article>`).join('');
      document.getElementById('form-visibility-body').innerHTML = invitees.map((row) => `<tr><td>${ui.escapeHtml(row.user?.name || '--')}</td><td>${ui.escapeHtml(row.batchGroupNumber ? `Group ${row.batchGroupNumber}` : '--')}</td><td>${ui.statusChip('Assigned', 'assigned')}</td><td>${ui.statusChip(selectedCodes.length ? 'Forms Open' : 'Forms Closed', selectedCodes.length ? 'form-open' : 'blocked')}</td><td>${ui.escapeHtml(selectedCodes.length ? `0 / ${selectedCodes.length} submitted` : '--')}</td></tr>`).join('');
      const noAssigned = invitees.length === 0;
      ui.renderBanner(banner, noAssigned ? 'Seminar forms cannot be opened because no participants are assigned to this session.' : '', 'warning');
      document.getElementById('open-selected-forms').disabled = noAssigned;
    }
    document.addEventListener('change', (event) => {
      if (!event.target.matches('[data-form-code]')) return;
      const code = event.target.dataset.formCode;
      selectedCodes = event.target.checked ? [...new Set([...selectedCodes, code])] : selectedCodes.filter((item) => item !== code);
      renderPreview();
    });
    async function save() {
      const response = await ui.apiPost('api/training/update', {
        programId: sessionId,
        programName: program.programName,
        description: program.description || '',
        date: program.date,
        startTime: program.startTime,
        endTime: program.endTime,
        venue: program.venue || '',
        speaker: program.speaker || '',
        whatToBring: program.whatToBring || '',
        instructions: program.instructions || '',
        seminarFormCodes: selectedCodes,
        trainingMode: 'batch',
        status: program.storedStatus || program.status,
      });
      if (!response.ok) return ui.renderBanner(banner, ui.firstError(response.errors) || response.message || 'Unable to save seminar form access.', 'destructive');
      ui.renderBanner(banner, 'Seminar form access saved successfully.', 'success');
    }
    document.getElementById('save-form-access').addEventListener('click', save);
    document.getElementById('open-selected-forms').addEventListener('click', save);
    document.getElementById('close-all-forms').addEventListener('click', () => ui.openModal(modal));
    renderPreview();
  },
});
