(function () {
  const { qs, setHTML } = window.App.dom;
  const { formatDate } = window.App.format;

  const baseUrl = (window.SMARTLEAP_BASE_URL || '').replace(/\/+$/, '');
  const routeUrl = (path) => `${baseUrl}/${String(path || '').replace(/^\/+/, '')}`;
  const GROUP_SIZE = 85;
  const GROUP_NUMBERS = [1, 2, 3];
  const SESSION_NUMBERS = [1, 2, 3];

  const state = {
    data: { programs: [], rounds: [], summary: {}, statuses: [], seminarForms: [], eligibleInvitees: [] },
    filters: { session: '', group: '', status: '', search: '' },
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
    clearNotice();
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

    const allPrograms = Array.isArray(state.data.programs) ? state.data.programs : [];
    const visiblePrograms = filteredPrograms();
    const visibleRows = filteredTrainingRows();
    const yearlyBatch = state.data.summary?.yearlyBatch || {};
    const yearlyAssignedCount = Number(yearlyBatch.yearlyAssignedCount || 0);
    const yearlyCapacity = Number(yearlyBatch.yearlyBatchCapacity || GROUP_SIZE * 3);
    const selectedProgram = selectedFilterProgram();
    const selectedSessionNumber = Number(state.filters.session || 0);
    const selectedGroupNumber = Number(state.filters.group || 0);
    const selectedInvitees = selectedProgram ? inviteesForProgram(selectedProgram) : [];
    const selectedSummary = selectedProgram ? programInviteeSummary(selectedProgram) : null;
    const notifyEnabled = Boolean(selectedProgram?.id && selectedSessionNumber > 0 && selectedGroupNumber > 0 && selectedInvitees.length > 0 && !state.loading.notices);
    const notifyTitle = notifyEnabled
      ? `Send the latest notice to Session ${selectedSessionNumber}, Group ${selectedGroupNumber}.`
      : 'Choose a scheduled session and group with assigned participants to send notices.';

    const overviewCards = [
      buildOverviewCard({
        accent: 'blue',
        eyebrow: 'Training',
        title: 'Eligible Applicants',
        value: String((state.data.eligibleInvitees || []).length),
      }),
      buildOverviewCard({
        accent: 'blue',
        eyebrow: 'Training',
        title: 'Assigned Participants',
        value: String(yearlyAssignedCount),
      }),
      buildOverviewCard({
        accent: 'teal',
        eyebrow: 'Training',
        title: 'Remaining Capacity',
        value: String(Math.max(0, yearlyCapacity - yearlyAssignedCount)),
      }),
      ...groupInsights().map((item) => buildOverviewCard(item)),
    ];

    setHTML(root, `
      <section class="admin-section-tools admin-training-tools training-session-toolbar">
        <div>
          <span class="po-panel-label">Training Pipeline</span>
          <h3>Training Session Manager</h3>
        </div>
        <div class="po-training-page-head__actions">
          <button type="button" class="app-btn-outline" data-training-action="refresh">Refresh</button>
          <button type="button" class="app-btn-primary" id="training-focus-create" data-training-create-session>Create Training Session</button>
        </div>
      </section>

      <section class="admin-training-summary admin-training-summary--expanded">
        ${overviewCards.join('')}
      </section>

      <section class="po-training-workspace training-session-filter-panel">
        <header class="po-training-workspace__header training-session-filter-panel__header">
          <div>
            <span class="po-panel-label">Quick Filters</span>
            <h4>Find the Right Session</h4>
          </div>
          <div class="training-session-filter-panel__actions">
            <button type="button" class="app-btn-outline" data-training-reset-filters>Reset Filters</button>
            <button type="button" class="app-btn-outline" data-training-edit-selected ${selectedProgram?.id ? '' : 'disabled'}>Edit Selected Schedule</button>
            <button type="button" class="action-button po-case-action" data-training-notify-group ${notifyEnabled ? '' : 'disabled'} title="${escapeHtml(notifyTitle)}">${state.loading.notices ? 'Sending...' : `Notify ${selectedSessionNumber && selectedGroupNumber ? `S${selectedSessionNumber} / G${selectedGroupNumber}` : 'Selected Group'}`}</button>
          </div>
        </header>

        <div class="training-session-filters">
          ${selectField('Session', 'session', sessionOptions(), state.filters.session, 'All Sessions')}
          ${selectField('Group', 'group', filterGroupOptions(), state.filters.group, 'All Groups')}
          ${selectField('Session Status', 'status', statusOptions(), state.filters.status, 'All Statuses')}
          <label class="po-training-field">
            <span>Search Participant / Activity</span>
            <input class="section-filter" type="search" data-training-filter="search" value="${escapeHtml(state.filters.search)}" placeholder="Name, business, or activity">
          </label>
        </div>

        <div class="training-session-filter-status">
          <div class="training-session-filter-status__summary">
            <strong id="training-visible-row-count">${escapeHtml(`${visibleRows.length} participant row${visibleRows.length === 1 ? '' : 's'}`)}</strong>
            <span id="training-visible-session-copy">${escapeHtml(selectedProgram ? `${selectedSummary?.participantCount || 0} assigned in the selected session` : `${visiblePrograms.length} session slot${visiblePrograms.length === 1 ? '' : 's'} visible`)}</span>
          </div>
          <div class="training-session-filter-status__chips">
            <span class="summary-chip" id="training-visible-sessions-chip">Visible Sessions: ${escapeHtml(String(visiblePrograms.length))}</span>
            <span class="summary-chip" id="training-notices-chip">Notices Sent: ${escapeHtml(String(selectedProgram ? selectedSummary?.noticeSentCount || 0 : visiblePrograms.reduce((total, program) => total + programInviteeSummary(program).noticeSentCount, 0)))}</span>
          </div>
        </div>
      </section>

      <section class="po-training-workspace training-session-table-panel">
        <header class="po-training-workspace__header">
          <div>
            <span class="po-panel-label">Participant Table</span>
            <h4>Training Attendance Roster</h4>
          </div>
        </header>
        <div class="table-card po-training-work-block">
          <div class="table-wrapper training-session-table-wrap">
            <table class="data-table training-session-table">
              <thead>
                <tr>
                  <th>Session / Group</th>
                  <th>Participant</th>
                  <th>Activity Name</th>
                  <th>Schedule</th>
                  <th>Location</th>
                  <th>Session Status</th>
                  <th>Attendance</th>
                  <th>Forms Assigned</th>
                </tr>
              </thead>
              <tbody id="training-session-table-body">${visibleRows.length ? visibleRows.map(renderTrainingRow).join('') : emptyTrainingRowsMarkup()}</tbody>
            </table>
          </div>
        </div>
      </section>
    `);
  }

  function buildOverviewCard({ accent, eyebrow, title, value }) {
    return `
      <article class="metric-card metric-card--soft admin-training-summary-card admin-training-summary-card--${escapeHtml(accent || 'blue')}">
        <span class="metric-card__label">${escapeHtml(eyebrow)}</span>
        <div class="metric-card__body">
          <strong class="metric-card__value">${escapeHtml(String(value))}</strong>
        </div>
        <p>${escapeHtml(title)}</p>
      </article>
    `;
  }

  function groupInsights() {
    const yearlyBatch = state.data.summary?.yearlyBatch || {};
    const rosters = yearlyBatch.groupRosters || {};
    const programs = Array.isArray(state.data.programs) ? state.data.programs : [];

    return GROUP_NUMBERS.map((groupNumber) => {
      const roster = Array.isArray(rosters[`group${groupNumber}`]) ? rosters[`group${groupNumber}`] : [];
      const scheduled = programs.filter((program) => Number(program.targetGroupNumber || 0) === groupNumber);
      const latest = scheduled
        .slice()
        .sort((left, right) => String(right.startsAt || '').localeCompare(String(left.startsAt || '')))[0];

      return {
        accent: groupNumber === 1 ? 'blue' : groupNumber === 2 ? 'teal' : 'amber',
        eyebrow: 'Training',
        title: `Group ${groupNumber}`,
        value: String(roster.length),
      };
    });
  }

  function filteredPrograms() {
    const session = Number(state.filters.session || 0);
    const group = Number(state.filters.group || 0);
    const status = String(state.filters.status || '').trim().toLowerCase();

    return (state.data.programs || []).filter((program) => {
      if (session > 0 && Number(program.roundNumber || 0) !== session) return false;
      if (group > 0 && Number(program.targetGroupNumber || 0) !== group) return false;
      if (status && String(program.status || '').trim().toLowerCase() !== status) return false;
      return true;
    });
  }

  function filteredTrainingRows() {
    const search = String(state.filters.search || '').trim().toLowerCase();
    const rows = [];

    filteredPrograms().forEach((program) => {
      inviteesForProgram(program).forEach((invitee) => {
        const attendanceKey = attendanceCategory(invitee.status);
        const row = { program, invitee, attendanceCategory: attendanceKey };
        if (search && !matchesSearch(row, search)) return;
        rows.push(row);
      });
    });

    rows.sort((left, right) => {
      const sessionCompare = Number(left.program.roundNumber || 0) - Number(right.program.roundNumber || 0);
      if (sessionCompare !== 0) return sessionCompare;
      const groupCompare = Number(left.program.targetGroupNumber || left.invitee.batchGroupNumber || 0) - Number(right.program.targetGroupNumber || right.invitee.batchGroupNumber || 0);
      if (groupCompare !== 0) return groupCompare;
      return String(left.invitee.user?.name || left.invitee.fullName || '').localeCompare(String(right.invitee.user?.name || right.invitee.fullName || ''));
    });

    return rows;
  }

  function emptyTrainingRowsMarkup() {
    return '<tr><td colspan="8">No training rows match the selected filters.</td></tr>';
  }

  function renderFilteredTrainingResults() {
    const visiblePrograms = filteredPrograms();
    const visibleRows = filteredTrainingRows();
    const selectedProgram = selectedFilterProgram();
    const selectedSummary = selectedProgram ? programInviteeSummary(selectedProgram) : null;

    const rowCount = qs('#training-visible-row-count');
    if (rowCount) {
      rowCount.textContent = `${visibleRows.length} participant row${visibleRows.length === 1 ? '' : 's'}`;
    }

    const sessionCopy = qs('#training-visible-session-copy');
    if (sessionCopy) {
      sessionCopy.textContent = selectedProgram
        ? `${selectedSummary?.participantCount || 0} assigned in the selected session`
        : `${visiblePrograms.length} session slot${visiblePrograms.length === 1 ? '' : 's'} visible`;
    }

    const sessionChip = qs('#training-visible-sessions-chip');
    if (sessionChip) {
      sessionChip.textContent = `Visible Sessions: ${visiblePrograms.length}`;
    }

    const noticesChip = qs('#training-notices-chip');
    if (noticesChip) {
      const noticeCount = selectedProgram
        ? selectedSummary?.noticeSentCount || 0
        : visiblePrograms.reduce((total, program) => total + programInviteeSummary(program).noticeSentCount, 0);
      noticesChip.textContent = `Notices Sent: ${noticeCount}`;
    }

    const tableBody = qs('#training-session-table-body');
    if (tableBody) {
      tableBody.innerHTML = visibleRows.length ? visibleRows.map(renderTrainingRow).join('') : emptyTrainingRowsMarkup();
    }
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

  function matchesSearch(row, search) {
    return [
      row.invitee.user?.name,
      row.invitee.fullName,
      row.invitee.businessName,
      row.program.programName,
      row.program.venue,
      row.program.speaker,
    ].some((value) => String(value || '').toLowerCase().includes(search));
  }

  function programInviteeSummary(program) {
    const invitees = inviteesForProgram(program);
    if (!invitees.length) {
      return {
        participantCount: Number(program?.participantCount || 0),
        noticeSentCount: Number(program?.noticeSentCount || 0),
        attendanceMarkedCount: 0,
      };
    }

    let noticeSentCount = 0;
    let attendanceMarkedCount = 0;
    invitees.forEach((invitee) => {
      if (invitee.lastNoticeSentAt || invitee.notifiedAt || String(invitee.status || '').trim().toLowerCase() === 'notified') {
        noticeSentCount += 1;
      }
      if (attendanceCategory(invitee.status) !== 'pending') {
        attendanceMarkedCount += 1;
      }
    });

    return {
      participantCount: invitees.length,
      noticeSentCount,
      attendanceMarkedCount,
    };
  }

  function renderTrainingRow(row) {
    const program = row.program;
    const invitee = row.invitee;
    const forms = formLabels(program.seminarFormCodes || []);
    const participantName = invitee.user?.name || invitee.fullName || '--';
    const businessName = invitee.businessName || '--';
    const attendanceTone = attendanceToneFor(row.attendanceCategory);
    const attendanceText = attendanceLabel(invitee.status);

    return `
      <tr>
        <td>
          <strong>Session ${escapeHtml(String(program.roundNumber || '--'))}</strong>
          <small>Group ${escapeHtml(String(program.targetGroupNumber || invitee.batchGroupNumber || '--'))}</small>
        </td>
        <td>
          <strong>${escapeHtml(participantName)}</strong>
          <small>${escapeHtml(businessName)}</small>
        </td>
        <td>${escapeHtml(program.programName || '--')}</td>
        <td>
          <strong>${escapeHtml(formatDate(program.startsAt || program.date || ''))}</strong>
          <small>${escapeHtml(formatTimeRange(program.startTime, program.endTime))}</small>
        </td>
        <td>${escapeHtml(program.venue || '--')}</td>
        <td>${renderStatusPill(program.status, sessionStatusTone(program.status))}</td>
        <td>${renderStatusPill(attendanceText, attendanceTone)}</td>
        <td>${forms.length ? forms.map((label) => `<span class="training-form-chip">${escapeHtml(label)}</span>`).join('') : '<span class="training-form-chip training-form-chip--muted">No forms</span>'}</td>
      </tr>
    `;
  }

  function renderStatusPill(label, tone) {
    return `<span class="training-status-pill training-status-pill--${escapeHtml(tone || 'slate')}">${escapeHtml(label || '--')}</span>`;
  }

  function sessionStatusTone(status) {
    const normalized = String(status || '').trim().toLowerCase();
    if (normalized === 'completed') return 'emerald';
    if (normalized === 'attended') return 'teal';
    if (normalized === 'notified') return 'amber';
    return 'blue';
  }

  function attendanceCategory(status) {
    const normalized = String(status || '').trim().toLowerCase();
    if (['completed', 'attended', 'present'].includes(normalized)) return 'present';
    if (['missed', 'absent'].includes(normalized)) return 'absent';
    if (normalized === 'excused') return 'excused';
    return 'pending';
  }

  function attendanceToneFor(status) {
    if (status === 'present') return 'emerald';
    if (status === 'absent') return 'rose';
    if (status === 'excused') return 'amber';
    return 'slate';
  }

  function attendanceLabel(status) {
    const normalized = String(status || '').trim().toLowerCase();
    if (['completed', 'attended', 'present'].includes(normalized)) return 'Present';
    if (['missed', 'absent'].includes(normalized)) return 'Absent';
    if (normalized === 'excused') return 'Excused';
    if (normalized === 'notified') return 'Notified';
    return 'Scheduled';
  }

  function openCreateModal() {
    const defaults = defaultSessionGroup();
    state.modalProgram = buildModalProgram(defaults.session, defaults.group);
    state.modalOpen = true;
    renderModal();
  }

  function openEditModal(programId) {
    const program = (state.data.programs || []).find((item) => Number(item.id || 0) === Number(programId || 0));
    if (!program) return;
    state.modalProgram = {
      ...program,
      seminarFormCodes: Array.isArray(program.seminarFormCodes) ? [...program.seminarFormCodes] : [],
    };
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
              ${selectField('Session Number', 'roundNumber', sessionOptions(), String(program.roundNumber || ''), 'Choose session', false, false, false)}
              ${selectField('Group Number', 'targetGroupNumber', groupOptions(), String(program.targetGroupNumber || ''), 'Choose group', false, false, false)}
              ${field('Activity Name', 'programName', program.programName || '', 'text', false)}
              ${field('Location', 'venue', program.venue || '', 'text', false)}
              ${field('Date', 'date', normalizeDate(program.date || program.startsAt), 'date', false)}
              ${field('Start Time', 'startTime', normalizeTime(program.startTime || program.startsAt), 'time', false)}
              ${field('End Time', 'endTime', normalizeTime(program.endTime || program.endsAt), 'time', false)}
              ${field('Speaker / Facilitator', 'speaker', program.speaker || '', 'text', false)}
            </div>
            ${textareaField('What to Bring', 'whatToBring', program.whatToBring || '', 3, false)}
            ${textareaField('Instructions / Reminders', 'instructions', program.instructions || '', 3, false)}
            <section class="training-session-form-picker">
              <span class="po-panel-label">Forms Assigned</span>
              <div class="training-session-chip-list">
                ${formPickerChips(program, false)}
              </div>
            </section>
          </div>
          <footer class="training-session-modal__footer">
            <button type="button" class="app-btn-outline" data-training-close-modal>Cancel</button>
            <button type="submit" class="app-btn-primary" ${state.loading.save ? 'disabled' : ''}>${state.loading.save ? 'Saving...' : 'Save Session Schedule'}</button>
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
    state.filters.session = String(payload.roundNumber || '');
    state.filters.group = String(payload.targetGroupNumber || '');
    await load();
  }

  async function sendNoticeForProgram(programId) {
    const program = (state.data.programs || []).find((item) => Number(item.id || 0) === Number(programId || 0));
    if (!program?.id) {
      return showNotice('Unable to find the selected training session.', 'warning');
    }
    const participantCount = inviteesForProgram(program).length;
    if (participantCount <= 0) {
      return showNotice('Assign at least one participant before sending notices.', 'warning');
    }

    state.loading.notices = true;
    render();
    const response = await apiPost('api/training/notices', {
      programId: program.id,
      inviteeIds: [],
      groupNumber: program.targetGroupNumber || 0,
    });
    state.loading.notices = false;
    if (!response.ok) {
      render();
      return showNotice(firstError(response.errors) || response.message || 'Unable to notify this group.', 'danger');
    }

    await load();
    showNotice(`Training notices sent for Session ${program.roundNumber || '--'}, Group ${program.targetGroupNumber || '--'}.`, 'success');
  }

  async function sendGroupNotice() {
    const program = selectedFilterProgram();
    if (!program?.id) {
      return showNotice('Select a scheduled session and group before sending notices.', 'warning');
    }
    await sendNoticeForProgram(program.id);
  }

  function resetFilters() {
    state.filters = { session: '', group: '', status: '', search: '' };
    render();
  }

  function defaultSessionGroup() {
    const filteredSession = Number(state.filters.session || 1) || 1;
    const filteredGroup = Number(state.filters.group || 1) || 1;
    const filteredExists = (state.data.programs || []).some((program) => Number(program.roundNumber) === filteredSession && Number(program.targetGroupNumber) === filteredGroup);
    if (!filteredExists) return { session: filteredSession, group: filteredGroup };

    for (const session of SESSION_NUMBERS) {
      for (const group of GROUP_NUMBERS) {
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

  function selectedFilterProgram() {
    const session = Number(state.filters.session || 0);
    const group = Number(state.filters.group || 0);
    if (session <= 0 || group <= 0) return null;
    return filteredPrograms().find((program) => Number(program.roundNumber) === session && Number(program.targetGroupNumber) === group) || null;
  }

  function bind() {
    const root = section();
    if (!root || root.dataset.trainingBound === 'true') return;
    root.dataset.trainingBound = 'true';

    root.addEventListener('input', (event) => {
      const filter = event.target.closest('[data-training-filter]');
      if (!filter || filter.dataset.trainingFilter !== 'search') return;
      state.filters.search = String(filter.value || '');
      renderFilteredTrainingResults();
    });

    root.addEventListener('change', (event) => {
      const filter = event.target.closest('[data-training-filter]');
      if (filter) {
        state.filters[filter.dataset.trainingFilter] = String(filter.value || '');
        if (filter.dataset.trainingFilter === 'session') {
          const groupFilterValues = filterGroupOptions().map((option) => option.value);
          if (state.filters.group && !groupFilterValues.includes(String(state.filters.group))) {
            state.filters.group = '';
          }
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
      if (event.target.closest('[data-training-notify-group]')) return sendGroupNotice();
      if (event.target.closest('[data-training-reset-filters]')) return resetFilters();
      if (event.target.closest('[data-training-edit-selected]')) {
        if (selectedFilterProgram()?.id) openEditModal(selectedFilterProgram().id);
        return;
      }
    });

    root.addEventListener('submit', (event) => {
      const form = event.target.closest('#training-session-modal-form');
      if (!form) return;
      event.preventDefault();
      saveModal(form);
    });
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
    return SESSION_NUMBERS.map((value) => ({ value: String(value), label: `Session ${value}` }));
  }

  function groupOptions() {
    return GROUP_NUMBERS.map((value) => ({ value: String(value), label: `Group ${value}` }));
  }

  function filterGroupOptions() {
    const session = Number(state.filters.session || 0);
    if (session <= 0) {
      return groupOptions();
    }
    const groups = [...new Set((state.data.programs || [])
      .filter((program) => Number(program.roundNumber || 0) === session)
      .map((program) => Number(program.targetGroupNumber || 0))
      .filter((value) => value > 0))]
      .sort((left, right) => left - right);
    return groups.length ? groups.map((value) => ({ value: String(value), label: `Group ${value}` })) : groupOptions();
  }

  function statusOptions() {
    return (state.data.statuses || []).map((value) => ({ value: String(value), label: String(value) }));
  }

  function syncFiltersToCreatedSlots() {
    const sessionValues = sessionOptions().map((option) => option.value);
    if (state.filters.session && !sessionValues.includes(String(state.filters.session))) {
      state.filters.session = '';
    }

    const groupValues = filterGroupOptions().map((option) => option.value);
    if (state.filters.group && !groupValues.includes(String(state.filters.group))) {
      state.filters.group = '';
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
