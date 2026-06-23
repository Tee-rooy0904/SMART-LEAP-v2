(function () {
  const { qs, setHTML } = window.App.dom;
  const { formatDate } = window.App.format;

  const baseUrl = (window.SMARTLEAP_BASE_URL || '').replace(/\/+$/, '');
  const routeUrl = (path) => `${baseUrl}/${String(path || '').replace(/^\/+/, '')}`;

  const state = {
    data: { programs: [], rounds: [], summary: {}, statuses: [], seminarForms: [], eligibleInvitees: [] },
    filters: { session: '1', group: '1', activity: '', location: '' },
    modalOpen: false,
    modalProgram: null,
    loading: { list: false, detail: false, save: false, notices: false },
  };

  const section = () => qs('#training-section');

  const parseJson = async (response) => {
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return { ok: false, message: response.status === 401 ? 'Your session has expired. Please sign in again.' : 'Unexpected server response.' };
    }
    return response.json();
  };

  const apiGet = async (path, params = {}) => {
    const query = new URLSearchParams(params);
    const url = query.toString() ? `${routeUrl(path)}?${query}` : routeUrl(path);
    try {
      const response = await fetch(url, { headers: { Accept: 'application/json' }, credentials: 'same-origin' });
      return await parseJson(response);
    } catch (error) {
      return { ok: false, message: 'Unable to reach the server right now.' };
    }
  };

  const apiPost = async (path, payload) => {
    const body = new URLSearchParams();
    Object.entries(payload || {}).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach((item) => body.append(`${key}[]`, item));
        return;
      }
      body.append(key, value ?? '');
    });
    try {
      const response = await fetch(routeUrl(path), {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        credentials: 'same-origin',
        body: body.toString(),
      });
      return await parseJson(response);
    } catch (error) {
      return { ok: false, message: 'Unable to reach the server right now.' };
    }
  };

  const apiFormPost = async (path, formData) => {
    try {
      const response = await fetch(routeUrl(path), {
        method: 'POST',
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
        body: formData,
      });
      return await parseJson(response);
    } catch (error) {
      return { ok: false, message: 'Unable to reach the server right now.' };
    }
  };

  const init = () => {
    if (!section()) return;
    renderShell();
    bind();
    load();
  };

  function renderShell() {
    const root = section();
    if (!root) return;
    setHTML(root, `
      <div class="po-section-shell training-session-manager">
        <section id="admin-training-overview-view"></section>
        <div id="admin-training-modal-root"></div>
        <div id="admin-training-notice" class="notice" hidden></div>
      </div>
    `);
  }

  async function load() {
    state.loading.list = true;
    render();
    const response = await apiGet('api/training');
    if (!response.ok) {
      state.loading.list = false;
      showNotice(response.message || 'Unable to load the training workflow.', 'danger');
      render();
      return;
    }

    state.data = response.data || state.data;
    await hydrateProgramDetails();
    syncFiltersToCreatedSlots();
    state.loading.list = false;
    render();
  }

  async function hydrateProgramDetails() {
    const programs = Array.isArray(state.data.programs) ? state.data.programs : [];
    if (!programs.length) return;

    const detailed = await Promise.all(programs.map(async (program) => {
      if (!program?.id) return program;
      const response = await apiGet('api/training/show', { id: program.id });
      return response.ok && response.program ? { ...program, ...response.program } : program;
    }));
    state.data.programs = detailed;
  }

  function render() {
    renderOverview();
    renderModal();
  }

  function renderOverview() {
    const root = qs('#admin-training-overview-view');
    if (!root) return;

    const yearlyBatch = state.data.summary?.yearlyBatch || {};
    const rows = filteredTrainingRows();
    const selectedProgram = selectedFilterProgram();
    const selectedGroupNumber = Number(state.filters.group || 0);
    const selectedSessionNumber = Number(state.filters.session || 0);
    const selectedInvitees = selectedProgram ? inviteesForProgram(selectedProgram) : [];
    // notifyEnabled uses participantCount from the API summary so it works even before
    // hydrateProgramDetails completes. Falls back to the hydrated invitees array length.
    const programParticipantCount = Number(selectedProgram?.participantCount ?? selectedInvitees.length);
    const notifyEnabled = Boolean(selectedProgram?.id && selectedGroupNumber > 0 && selectedSessionNumber > 0 && !selectedProgram.isLocked && programParticipantCount > 0);
    const notifyLabel = selectedGroupNumber > 0 ? `Notify Group ${selectedGroupNumber}` : 'Notify Group';
    const notifyTitle = !selectedProgram
      ? 'Select a scheduled session and group first.'
      : (notifyEnabled ? 'Send the training notice to the participants in this session and group.' : 'Assign at least one participant before sending notices.');

    setHTML(root, `
      <section class="admin-section-tools admin-training-tools training-session-toolbar">
        <div>
          <span class="po-panel-label">Training Pipeline</span>
          <h3>Session and Attendance Manager</h3>
        </div>
        <div class="po-training-page-head__actions">
          <button type="button" class="app-btn-outline" data-training-action="refresh">Refresh</button>
          <button type="button" class="app-btn-primary" data-training-create-session>Create Training Session</button>
        </div>
      </section>
      <section class="admin-training-summary metric-grid">
        ${buildSummaryCard('Eligible for Training', (state.data.eligibleInvitees || []).length, 'Ready List')}
        ${buildSummaryCard('Created Sessions', (state.data.programs || []).length, 'Session Table')}
        ${buildSummaryCard('Group 1 Count', `${yearlyBatch.yearlyGroup1Count || 0}/${yearlyBatch.yearlyGroupSize || 85}`, 'Capacity')}
        ${buildSummaryCard('Group 2 Count', `${yearlyBatch.yearlyGroup2Count || 0}/${yearlyBatch.yearlyGroupSize || 85}`, 'Capacity')}
        ${buildSummaryCard('Group 3 Count', `${yearlyBatch.yearlyGroup3Count || 0}/${yearlyBatch.yearlyGroupSize || 85}`, 'Capacity')}
      </section>
      <section class="po-training-workspace training-session-filter-panel">
        <header class="po-training-workspace__header">
          <div><span class="po-panel-label">Filters</span><h4>Training Session Table</h4></div>
          <button type="button" class="action-button po-case-action" data-training-notify-group ${notifyEnabled && !state.loading.notices ? '' : 'disabled'} title="${escapeHtml(notifyTitle)}">${state.loading.notices ? 'Sending...' : escapeHtml(notifyLabel)}</button>
        </header>
        <div class="training-session-filters">
          ${selectField('Session', 'session', filterSessionOptions(), state.filters.session, '', false, true, false)}
          ${selectField('Group', 'group', filterGroupOptions(), state.filters.group, '', false, true, false)}
          <label class="po-training-field"><span>Activity</span><input class="section-filter" type="search" data-training-filter="activity" value="${escapeHtml(state.filters.activity)}" placeholder="Search activity name"></label>
          <label class="po-training-field"><span>Location</span><input class="section-filter" type="search" data-training-filter="location" value="${escapeHtml(state.filters.location)}" placeholder="Search location"></label>
        </div>
        <div class="po-training-validation-banner">${escapeHtml(notifyTitle)}</div>
        <div class="table-card po-training-work-block">
          <div class="table-wrapper training-session-table-wrap">
            <table class="data-table training-session-table">
              <thead>
                <tr>
                  <th>Participant</th>
                  <th>Session / Group</th>
                  <th>Activity Name</th>
                  <th>Time</th>
                  <th>Location</th>
                  <th>What to Bring</th>
                  <th>Forms Assigned</th>
                </tr>
              </thead>
              <tbody>${rows.length ? rows.map(renderTrainingRow).join('') : '<tr><td colspan="7">No training rows match the selected filters.</td></tr>'}</tbody>
            </table>
          </div>
        </div>
      </section>
    `);
  }

  function renderTrainingRow(row) {
    const program = row.program;
    const invitee = row.invitee;
    const forms = formLabels(program.seminarFormCodes || []);
    return `
      <tr>
        <td><strong>${escapeHtml(invitee.user?.name || invitee.fullName || '--')}</strong><br><small>${escapeHtml(invitee.businessName || '')}</small></td>
        <td>${escapeHtml(`Session ${program.roundNumber || '--'} / Group ${program.targetGroupNumber || invitee.batchGroupNumber || '--'}`)}</td>
        <td>${escapeHtml(program.programName || '--')}</td>
        <td>${escapeHtml(formatTimeRange(program.startTime, program.endTime))}</td>
        <td>${escapeHtml(program.venue || '--')}</td>
        <td>${escapeHtml(program.whatToBring || '--')}</td>
        <td>${forms.length ? forms.map((label) => `<span class="training-form-chip">${escapeHtml(label)}</span>`).join('') : '<span class="po-status-chip is-muted">No forms</span>'}</td>
      </tr>
    `;
  }

  function filteredTrainingRows() {
    const session = Number(state.filters.session || 0);
    const group = Number(state.filters.group || 0);
    const activity = state.filters.activity.toLowerCase();
    const location = state.filters.location.toLowerCase();
    const rows = [];

    (state.data.programs || []).forEach((program) => {
      if (session > 0 && Number(program.roundNumber) !== session) return;
      if (group > 0 && Number(program.targetGroupNumber) !== group) return;
      if (activity && !String(program.programName || '').toLowerCase().includes(activity)) return;
      if (location && !String(program.venue || '').toLowerCase().includes(location)) return;

      inviteesForProgram(program).forEach((invitee) => {
        rows.push({ program, invitee });
      });
    });

    return rows;
  }

  function inviteesForProgram(program) {
    const invitees = Array.isArray(program?.invitees) ? program.invitees : [];
    if (invitees.length) return invitees;

    const groupNumber = Number(program?.targetGroupNumber || 0);
    const groupRosters = state.data.summary?.yearlyBatch?.groupRosters || {};
    return (groupRosters[`group${groupNumber}`] || []).map((row, index) => ({
      id: `draft-${program?.id || groupNumber}-${index}`,
      applicantProfileId: Number(row.applicantProfileId || 0),
      batchGroupNumber: groupNumber,
      status: 'Scheduled',
      inviteStatus: 'Scheduled',
      businessName: row.businessName || '--',
      user: { name: row.fullName || '--' },
    }));
  }

  function selectedFilterProgram() {
    const session = Number(state.filters.session || 0);
    const group = Number(state.filters.group || 0);
    if (session <= 0 || group <= 0) return null;
    return (state.data.programs || []).find((program) => Number(program.roundNumber) === session && Number(program.targetGroupNumber) === group) || null;
  }

  function openCreateModal() {
    const defaults = defaultSessionGroup();
    state.modalProgram = buildModalProgram(defaults.session, defaults.group);
    state.modalOpen = true;
    renderModal();
  }

  function closeModal() {
    state.modalOpen = false;
    state.modalProgram = null;
    renderModal();
  }

  function renderModal() {
    const root = qs('#admin-training-modal-root');
    if (!root) return;
    if (!state.modalOpen || !state.modalProgram) {
      setHTML(root, '');
      return;
    }

    const program = state.modalProgram;
    const isEdit = Number(program.id || 0) > 0;
    const locked = Boolean(program.isLocked);

    setHTML(root, `
      <div class="training-session-modal is-open" role="dialog" aria-modal="true" aria-labelledby="trainingSessionModalTitle">
        <div class="training-session-modal__backdrop" data-training-close-modal></div>
        <form class="training-session-modal__dialog" id="training-session-modal-form">
          <header class="training-session-modal__header modal-header">
            <div class="po-modal-title-block">
              <span class="po-modal-eyebrow">Training Schedule</span>
              <h3 class="modal-title" id="trainingSessionModalTitle">${escapeHtml(isEdit ? 'Edit Training Session' : 'Create Training Session')}</h3>
              <small>${escapeHtml(`Session ${program.roundNumber || '--'} / Group ${program.targetGroupNumber || '--'}`)}</small>
            </div>
            <button type="button" class="training-session-modal__close modal-close" data-training-close-modal aria-label="Close">&times;</button>
          </header>
          <input type="hidden" name="programId" value="${escapeHtml(String(program.id || ''))}">
          <div class="training-session-modal__body">
            <div class="training-session-modal__grid">
              ${selectField('Session Number', 'roundNumber', sessionOptions(), String(program.roundNumber || ''), 'Choose session', locked, false)}
              ${selectField('Group Number', 'targetGroupNumber', groupOptions(), String(program.targetGroupNumber || ''), 'Choose group', locked, false)}
              ${field('Activity Name', 'programName', program.programName || '', 'text', locked)}
              ${field('Location', 'venue', program.venue || '', 'text', locked)}
              ${field('Date', 'date', normalizeDate(program.date || program.startsAt), 'date', locked)}
              ${field('Start Time', 'startTime', normalizeTime(program.startTime || program.startsAt), 'time', locked)}
              ${field('End Time', 'endTime', normalizeTime(program.endTime || program.endsAt), 'time', locked)}
              ${field('Speaker / Facilitator', 'speaker', program.speaker || '', 'text', locked)}
            </div>
            ${textareaField('What to Bring', 'whatToBring', program.whatToBring || '', 3, locked)}
            ${textareaField('Instructions / Reminders', 'instructions', program.instructions || '', 3, locked)}
            <section class="training-session-form-picker">
              <span class="po-panel-label">Forms Assigned</span>
              <div class="training-session-chip-list">
                ${formPickerChips(program, locked)}
              </div>
            </section>
          </div>
          <footer class="training-session-modal__footer">
            <button type="button" class="app-btn-outline" data-training-close-modal>Cancel</button>
            <button type="submit" class="app-btn-primary" ${locked || state.loading.save ? 'disabled' : ''}>${state.loading.save ? 'Saving...' : 'Save Session Schedule'}</button>
          </footer>
        </form>
      </div>
    `);
  }

  function formPickerChips(program, locked) {
    const selected = new Set(program.seminarFormCodes || []);
    const assigned = assignedFormSessions(Number(program.id || 0));
    return (state.data.seminarForms || []).map((form) => {
      const assignedSession = assigned.get(form.code);
      const disabled = locked || (assignedSession && Number(assignedSession) !== Number(program.roundNumber));
      const checked = selected.has(form.code);
      const helper = disabled && assignedSession ? `Assigned to Session ${assignedSession}` : (checked ? 'Selected' : 'Available');
      return `
        <label class="training-form-select-chip ${checked ? 'is-selected' : ''} ${disabled ? 'is-disabled' : ''}">
          <input type="checkbox" name="seminarFormCodes[]" value="${escapeHtml(form.code)}" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}>
          <strong>${escapeHtml(form.label)}</strong>
          <span>${escapeHtml(helper)}</span>
        </label>
      `;
    }).join('');
  }

  function assignedFormSessions(excludeProgramId = 0) {
    const map = new Map();
    (state.data.programs || []).forEach((program) => {
      if (excludeProgramId > 0 && Number(program.id) === excludeProgramId) return;
      (program.seminarFormCodes || []).forEach((code) => {
        if (!map.has(code)) map.set(code, Number(program.roundNumber || 0));
      });
    });
    return map;
  }

  async function saveModal(form) {
    if (!(form instanceof HTMLFormElement)) return;
    const formData = new FormData(form);
    const payload = {
      programId: formData.get('programId') || '',
      roundNumber: formData.get('roundNumber') || '',
      targetGroupNumber: formData.get('targetGroupNumber') || '',
      programName: formData.get('programName') || '',
      description: '',
      date: formData.get('date') || '',
      startTime: formData.get('startTime') || '',
      endTime: formData.get('endTime') || '',
      venue: formData.get('venue') || '',
      speaker: formData.get('speaker') || '',
      whatToBring: formData.get('whatToBring') || '',
      instructions: formData.get('instructions') || '',
      trainingMode: 'batch',
      status: state.modalProgram?.storedStatus || state.modalProgram?.status || 'Scheduled',
      seminarFormCodes: formData.getAll('seminarFormCodes[]'),
    };

    state.loading.save = true;
    renderModal();
    const response = await apiPost(payload.programId ? 'api/training/update' : 'api/training', payload);
    state.loading.save = false;
    if (!response.ok) {
      renderModal();
      return showNotice(firstError(response.errors) || response.message || 'Unable to save this training session.', 'danger');
    }

    closeModal();
    clearNotice();
    state.filters.session = String(payload.roundNumber || state.filters.session || '1');
    state.filters.group = String(payload.targetGroupNumber || state.filters.group || '1');
    await load();
  }

  async function sendGroupNotice() {
    const program = selectedFilterProgram();
    if (!program?.id) {
      return showNotice('Select a scheduled session and group before sending notices.', 'warning');
    }

    state.loading.notices = true;
    render();
    const response = await apiPost('api/training/notices', {
      programId: program.id,
      inviteeIds: [],
      groupNumber: program.targetGroupNumber || state.filters.group || 0,
    });
    state.loading.notices = false;
    if (!response.ok) {
      render();
      return showNotice(firstError(response.errors) || response.message || 'Unable to notify this group.', 'danger');
    }

    clearNotice();
    await load();
  }

  function defaultSessionGroup() {
    const sessions = [1, 2, 3];
    const groups = [1, 2, 3];
    const filteredSession = Number(state.filters.session || 1);
    const filteredGroup = Number(state.filters.group || 1);
    const filteredExists = (state.data.programs || []).some((program) => Number(program.roundNumber) === filteredSession && Number(program.targetGroupNumber) === filteredGroup);
    if (!filteredExists) return { session: filteredSession, group: filteredGroup };

    for (const session of sessions) {
      for (const group of groups) {
        const exists = (state.data.programs || []).some((program) => Number(program.roundNumber) === session && Number(program.targetGroupNumber) === group);
        if (!exists) return { session, group };
      }
    }
    return { session: 1, group: 1 };
  }

  function buildModalProgram(session, group) {
    const sameSessionProgram = (state.data.programs || []).find((program) => Number(program.roundNumber) === Number(session));
    return {
      id: null,
      roundNumber: session,
      targetGroupNumber: group,
      programName: sameSessionProgram?.programName || '',
      venue: '',
      date: '',
      startTime: '',
      endTime: '',
      speaker: sameSessionProgram?.speaker || '',
      whatToBring: sameSessionProgram?.whatToBring || '',
      instructions: sameSessionProgram?.instructions || '',
      seminarFormCodes: Array.isArray(sameSessionProgram?.seminarFormCodes) ? [...sameSessionProgram.seminarFormCodes] : [],
      status: 'Scheduled',
    };
  }

  function bind() {
    const root = section();
    if (!root || root.dataset.trainingBound === 'true') return;
    root.dataset.trainingBound = 'true';

    root.addEventListener('input', (event) => {
      const filter = event.target.closest('[data-training-filter]');
      if (!filter) return;
      state.filters[filter.dataset.trainingFilter] = String(filter.value || '');
      render();
    });

    root.addEventListener('change', (event) => {
      const filter = event.target.closest('[data-training-filter]');
      if (filter) {
        state.filters[filter.dataset.trainingFilter] = String(filter.value || '');
        if (filter.dataset.trainingFilter === 'session') {
          const groups = filterGroupOptions();
          state.filters.group = groups[0]?.value || '';
        }
        render();
        return;
      }

      const modalSession = event.target.closest('select[name="roundNumber"]');
      if (modalSession && state.modalProgram) {
        state.modalProgram.roundNumber = Number(modalSession.value || state.modalProgram.roundNumber || 1);
        if (!Number(state.modalProgram.id || 0)) {
          applySessionTemplateToModalProgram(state.modalProgram.roundNumber);
        }
        renderModal();
        return;
      }

      const modalGroup = event.target.closest('select[name="targetGroupNumber"]');
      if (modalGroup && state.modalProgram) {
        state.modalProgram.targetGroupNumber = Number(modalGroup.value || state.modalProgram.targetGroupNumber || 1);
        renderModal();
      }
    });

    root.addEventListener('click', (event) => {
      if (event.target.closest('[data-training-create-session]')) return openCreateModal();
      if (event.target.closest('[data-training-action="refresh"]')) return load();
      if (event.target.closest('[data-training-close-modal]')) return closeModal();
      const notify = event.target.closest('[data-training-notify-group]');
      if (notify) return sendGroupNotice();
    });

    root.addEventListener('submit', (event) => {
      const form = event.target.closest('#training-session-modal-form');
      if (!form) return;
      event.preventDefault();
      saveModal(form);
    });
  }

  function buildSummaryCard(label, value, eyebrow) {
    return `<article class="metric-card metric-card--soft admin-training-summary-card"><span class="metric-card__label">${escapeHtml(eyebrow)}</span><div class="metric-card__body"><strong class="metric-card__value">${escapeHtml(String(value))}</strong></div><p>${escapeHtml(label)}</p></article>`;
  }

  function selectField(label, name, options, value, placeholder, disabled = false, bindFilter = true, includeBlank = true) {
    const blankOption = includeBlank ? `<option value="">${escapeHtml(placeholder)}</option>` : '';
    return `<label class="po-training-field"><span>${escapeHtml(label)}</span><select class="section-filter" name="${escapeHtml(name)}" ${bindFilter ? `data-training-filter="${escapeHtml(name)}"` : ''} ${disabled ? 'disabled' : ''}>${blankOption}${options.map((option) => `<option value="${escapeHtml(option.value)}" ${String(value) === String(option.value) ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}</select></label>`;
  }

  function field(label, name, value, type = 'text', disabled = false) {
    return `<label class="po-training-field"><span>${escapeHtml(label)}</span><input class="section-filter" type="${type}" name="${escapeHtml(name)}" value="${escapeHtml(value)}" ${disabled ? 'disabled' : ''}></label>`;
  }

  function textareaField(label, name, value, rows, disabled = false) {
    return `<label class="po-training-field po-training-field--stacked"><span>${escapeHtml(label)}</span><textarea class="po-inline-remarks po-training-compact-textarea" name="${escapeHtml(name)}" rows="${rows}" ${disabled ? 'disabled' : ''}>${escapeHtml(value)}</textarea></label>`;
  }

  function sessionOptions() {
    return [1, 2, 3].map((value) => ({ value: String(value), label: `Session ${value}` }));
  }

  function groupOptions() {
    return [1, 2, 3].map((value) => ({ value: String(value), label: `Group ${value}` }));
  }

  function filterSessionOptions() {
    const sessions = [...new Set((state.data.programs || [])
      .map((program) => Number(program.roundNumber || 0))
      .filter((value) => value > 0))]
      .sort((left, right) => left - right);
    return sessions.map((value) => ({ value: String(value), label: `Session ${value}` }));
  }

  function filterGroupOptions() {
    const session = Number(state.filters.session || 0);
    const groups = [...new Set((state.data.programs || [])
      .filter((program) => Number(program.roundNumber || 0) === session)
      .map((program) => Number(program.targetGroupNumber || 0))
      .filter((value) => value > 0))]
      .sort((left, right) => left - right);
    return groups.map((value) => ({ value: String(value), label: `Group ${value}` }));
  }

  function syncFiltersToCreatedSlots() {
    const sessions = filterSessionOptions();
    if (!sessions.length) return;
    if (!sessions.some((option) => option.value === String(state.filters.session))) {
      state.filters.session = sessions[0].value;
    }

    const groups = filterGroupOptions();
    if (groups.length && !groups.some((option) => option.value === String(state.filters.group))) {
      state.filters.group = groups[0].value;
    }
  }

  function applySessionTemplateToModalProgram(session) {
    const sameSessionProgram = (state.data.programs || []).find((program) => Number(program.roundNumber) === Number(session));
    state.modalProgram.programName = sameSessionProgram?.programName || state.modalProgram.programName || '';
    state.modalProgram.speaker = sameSessionProgram?.speaker || state.modalProgram.speaker || '';
    state.modalProgram.whatToBring = sameSessionProgram?.whatToBring || state.modalProgram.whatToBring || '';
    state.modalProgram.instructions = sameSessionProgram?.instructions || state.modalProgram.instructions || '';
    state.modalProgram.seminarFormCodes = Array.isArray(sameSessionProgram?.seminarFormCodes) ? [...sameSessionProgram.seminarFormCodes] : [];
  }

  function formLabels(codes) {
    const forms = new Map((state.data.seminarForms || []).map((form) => [form.code, form.label]));
    return (codes || []).map((code) => forms.get(code) || code);
  }

  function normalizeDate(value) {
    if (!value) return '';
    const raw = String(value);
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
  }

  function normalizeTime(value) {
    if (!value) return '';
    const raw = String(value);
    if (raw.includes('T') || raw.includes(' ')) return raw.slice(11, 16);
    return raw.slice(0, 5);
  }

  function formatTimeRange(start, end) {
    const left = formatTimeLabel(start);
    const right = formatTimeLabel(end);
    if (!left && !right) return '--';
    if (!right) return left;
    if (!left) return right;
    return `${left} - ${right}`;
  }

  function formatTimeLabel(value) {
    const raw = normalizeTime(value);
    if (!raw) return '';
    const parts = raw.split(':');
    if (parts.length !== 2) return raw;
    const hours = Number(parts[0]);
    const minutes = Number(parts[1]);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return raw;
    const suffix = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours % 12 || 12;
    return `${hour12}:${String(minutes).padStart(2, '0')} ${suffix}`;
  }

  function showNotice(message, tone = 'info') {
    const notice = qs('#admin-training-notice');
    if (!notice) return;
    notice.hidden = false;
    notice.className = `notice ${tone}`;
    notice.textContent = message;
  }

  function clearNotice() {
    const notice = qs('#admin-training-notice');
    if (!notice) return;
    notice.hidden = true;
    notice.textContent = '';
  }

  function firstError(errors) {
    if (!errors || typeof errors !== 'object') return '';
    const values = Object.values(errors);
    return values.length ? values[0] : '';
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  window.App.modules = window.App.modules || {};
  window.App.modules.training = { init };
})();
