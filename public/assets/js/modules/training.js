(function () {
  const { qs, setHTML } = window.App.dom;
  const { formatDate } = window.App.format;

  const baseUrl = (window.SMARTLEAP_BASE_URL || '').replace(/\/+$/, '');
  const routeUrl = (path) => `${baseUrl}/${String(path || '').replace(/^\/+/, '')}`;

  const state = {
    data: { programs: [], rounds: [], summary: {}, statuses: [], seminarForms: [] },
    view: 'overview',
    activeRoundNumber: 0,
    activeGroupNumber: 0,
    activeProgram: null,
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
      <div class="po-section-shell">
        <section id="admin-training-overview-view"></section>
        <section id="admin-training-workspace-view" hidden></section>
        <div id="admin-training-notice" class="notice" hidden></div>
      </div>
    `);
  }

  async function load() {
    state.loading.list = true;
    render();
    const response = await apiGet('api/training');
    state.loading.list = false;
    if (!response.ok) {
      showNotice(response.message || 'Unable to load the training workflow.', 'danger');
      render();
      return;
    }

    state.data = response.data || state.data;
    syncActiveProgramFromListing();
    render();
  }

  function syncActiveProgramFromListing() {
    if (!state.activeProgram) return;
    const activeProgramId = Number(state.activeProgram.id || 0);
    if (activeProgramId <= 0) {
      const draftRound = resolveRound(state.activeRoundNumber);
      if (!draftRound) {
        state.view = 'overview';
        state.activeProgram = null;
      }
      return;
    }

    const refreshed = (state.data.programs || []).find((program) => Number(program.id) === activeProgramId);
    if (!refreshed) {
      state.view = 'overview';
      state.activeProgram = null;
      return;
    }

    state.activeProgram = { ...state.activeProgram, ...refreshed };
  }

  async function loadProgram(programId, roundNumber, groupNumber) {
    state.loading.detail = true;
    render();
    const response = await apiGet('api/training/show', { id: programId });
    state.loading.detail = false;
    if (!response.ok) {
      showNotice(response.message || 'Unable to load this training group slot.', 'danger');
      render();
      return;
    }

    state.activeRoundNumber = Number(roundNumber || response.program?.roundNumber || 1);
    state.activeGroupNumber = Number(groupNumber || response.program?.targetGroupNumber || 1);
    state.activeProgram = response.program || null;
    state.view = 'workspace';
    clearNotice();
    render();
  }

  function resolveRound(roundNumber) {
    return (state.data.rounds || []).find((round) => Number(round.roundNumber) === Number(roundNumber)) || null;
  }

  function resolveRoundSlot(roundNumber, groupNumber) {
    const round = resolveRound(roundNumber);
    if (!round) return null;
    return (round.slots || []).find((slot) => Number(slot.groupNumber) === Number(groupNumber)) || null;
  }

  function slotProgram(slot) {
    return slot?.program || null;
  }

  function draftInviteesForGroup(groupNumber) {
    const yearlyBatch = state.data.summary?.yearlyBatch || {};
    const groupRosters = yearlyBatch.groupRosters || {};
    const rows = groupRosters[`group${groupNumber}`] || [];
    return rows.map((row, index) => ({
      id: `draft-${groupNumber}-${index + 1}`,
      applicantProfileId: Number(row.applicantProfileId || 0),
      batchGroupNumber: Number(groupNumber),
      remarks: '',
      status: 'Scheduled',
      inviteStatus: 'Scheduled',
      businessName: row.businessName || '--',
      user: { name: row.fullName || '--' },
    }));
  }

  function buildDraftProgram(roundNumber, groupNumber) {
    const round = resolveRound(roundNumber);
    const baseProgram = (round?.slots || [])
      .map((slot) => slotProgram(slot))
      .find((program) => program) || null;

    return {
      id: null,
      roundNumber,
      targetGroupNumber: groupNumber,
      programName: baseProgram?.programName || '',
      title: baseProgram?.programName || '',
      description: baseProgram?.description || '',
      date: baseProgram?.date || '',
      startTime: baseProgram?.startTime || '',
      endTime: baseProgram?.endTime || '',
      venue: baseProgram?.venue || '',
      speaker: baseProgram?.speaker || '',
      whatToBring: baseProgram?.whatToBring || '',
      instructions: baseProgram?.instructions || '',
      seminarFormCodes: Array.isArray(baseProgram?.seminarFormCodes) ? [...baseProgram.seminarFormCodes] : [],
      status: 'Scheduled',
      storedStatus: 'Scheduled',
      isLocked: false,
      noticeSentCount: 0,
      participantCount: draftInviteesForGroup(groupNumber).length,
      invitees: draftInviteesForGroup(groupNumber),
      yearlyBatch: state.data.summary?.yearlyBatch || {},
    };
  }

  function openRoundSlot(roundNumber, groupNumber) {
    const slot = resolveRoundSlot(roundNumber, groupNumber);
    const program = slotProgram(slot);
    state.activeRoundNumber = Number(roundNumber);
    state.activeGroupNumber = Number(groupNumber);
    state.view = 'workspace';

    if (program?.id) {
      return loadProgram(program.id, roundNumber, groupNumber);
    }

    state.activeProgram = buildDraftProgram(Number(roundNumber), Number(groupNumber));
    clearNotice();
    render();
    return null;
  }

  function openFirstAvailableSlot() {
    const round = (state.data.rounds || []).find((entry) => Array.isArray(entry.availableGroups) && entry.availableGroups.length);
    if (!round) {
      showNotice('All three yearly training sessions and all group notices are already prepared.', 'info');
      return;
    }
    openRoundSlot(round.roundNumber, round.availableGroups[0]);
  }

  function render() {
    renderOverview();
    renderWorkspace();
  }

  function renderOverview() {
    const root = qs('#admin-training-overview-view');
    if (!root) return;

    const rounds = state.data.rounds || [];
    const yearlyBatch = state.data.summary?.yearlyBatch || {};
    const nextRound = rounds.find((round) => (round.availableGroups || []).length) || null;
    const roundsStarted = rounds.filter((round) => (round.slots || []).some((slot) => slot.program)).length;
    const loadingCopy = state.loading.list ? '<div class="po-empty">Loading training rounds...</div>' : '';

    setHTML(root, `
      <section class="admin-section-tools admin-training-tools">
        <div class="po-training-page-head__actions">
          <button type="button" class="app-btn-primary" id="training-focus-create" ${(nextRound ? '' : 'disabled')}>Prepare Next Group Schedule</button>
        </div>
      </section>
      <section class="admin-training-summary metric-grid">
        ${buildSummaryCard('Eligible for Training', (state.data.eligibleInvitees || []).length, 'Ready List')}
        ${buildSummaryCard('Session Rounds Started', roundsStarted, 'Yearly Flow')}
        ${buildSummaryCard('Current Unlocked Round', nextRound ? `Session ${nextRound.roundNumber}` : 'Complete', 'Scheduler')}
        ${buildSummaryCard('Group 1 Count', `${yearlyBatch.yearlyGroup1Count || 0}/${yearlyBatch.yearlyGroupSize || 85}`, 'Capacity Grouping')}
        ${buildSummaryCard('Group 2 Count', `${yearlyBatch.yearlyGroup2Count || 0}/${yearlyBatch.yearlyGroupSize || 85}`, 'Capacity Grouping')}
        ${buildSummaryCard('Group 3 Count', `${yearlyBatch.yearlyGroup3Count || 0}/${yearlyBatch.yearlyGroupSize || 85}`, 'Capacity Grouping')}
      </section>
      <section class="po-training-program-list">
        <div class="po-training-work-block__header">
          <div>
            <span class="po-panel-label">Round Workflow</span>
            <h4>Yearly Training Sessions</h4>
          </div>
          <span class="po-summary-chip">${rounds.filter((round) => round.isComplete).length}/${rounds.length || 3} rounds complete</span>
        </div>
        ${loadingCopy || buildRoundBoard(rounds)}
      </section>
    `);
  }

  function buildRoundBoard(rounds) {
    if (!rounds.length) {
      return '<div class="po-empty">Training rounds are not available right now.</div>';
    }

    return `<div class="training-round-board">${rounds.map((round) => buildRoundCard(round)).join('')}</div>`;
  }

  function buildRoundCard(round) {
    const slots = round.slots || [];
    const status = round.isComplete ? 'Completed' : (round.isUnlocked ? 'Active' : 'Locked');
    return `
      <article class="training-round-card ${round.isUnlocked ? '' : 'is-disabled'}">
        <div class="training-round-card__header">
          <div>
            <span class="po-panel-label">Yearly Session</span>
            <h4>${escapeHtml(round.label || `Session ${round.roundNumber}`)}</h4>
          </div>
          <span class="po-status-chip ${round.isComplete ? 'is-success' : (round.isUnlocked ? 'is-warning' : 'is-muted')}">${escapeHtml(status)}</span>
        </div>
        <p class="training-round-card__copy">
          ${round.isComplete
            ? 'All three groups are already notified for this yearly session.'
            : (round.isUnlocked
              ? 'Prepare one group schedule, notify that group, then continue with the remaining groups.'
              : `Finish Session ${round.roundNumber - 1} first to unlock this round.`)}
        </p>
        <div class="training-round-card__groups">
          ${slots.map((slot) => buildGroupButton(round, slot)).join('')}
        </div>
      </article>
    `;
  }

  function buildGroupButton(round, slot) {
    const program = slotProgram(slot);
    const slotState = slot.state || 'available';
    const slotLabel = slotState === 'locked'
      ? 'Notified'
      : (slotState === 'draft' ? 'Draft' : (slot.disabled ? 'Disabled' : 'Available'));
    const isActive = Number(state.activeRoundNumber) === Number(round.roundNumber)
      && Number(state.activeGroupNumber) === Number(slot.groupNumber)
      && state.view === 'workspace';

    return `
      <button
        type="button"
        class="training-group-slot training-group-slot--${escapeHtml(slotState)} ${isActive ? 'is-active' : ''}"
        data-training-round-slot="${round.roundNumber}:${slot.groupNumber}"
        ${slot.disabled && !program ? 'disabled' : ''}
      >
        <strong>${escapeHtml(slot.label || `Group ${slot.groupNumber}`)}</strong>
        <span>${escapeHtml(slotLabel)}</span>
      </button>
    `;
  }

  function renderWorkspace() {
    const root = qs('#admin-training-workspace-view');
    if (!root) return;

    root.hidden = state.view !== 'workspace' || !state.activeProgram;
    if (state.view !== 'workspace' || !state.activeProgram) {
      setHTML(root, '');
      return;
    }

    const program = state.activeProgram;
    const round = resolveRound(state.activeRoundNumber);
    const invitees = Array.isArray(program.invitees) ? program.invitees : [];
    const isLocked = Boolean(program.isLocked);
    const allRoundGroupsDone = Boolean(round?.isComplete);
    const groupSize = Number(program.yearlyBatch?.yearlyGroupSize || state.data.summary?.yearlyBatch?.yearlyGroupSize || 85);
    const groupIsFull = invitees.length === groupSize;

    setHTML(root, `
      <section class="po-training-session-shell training-workspace-shell">
        <div class="po-training-session-shell__topbar">
          <button type="button" class="app-btn-ghost" data-training-action="back-overview">Back</button>
          <div class="po-training-session-shell__meta">
            <span class="po-panel-label">Round Workspace</span>
            <strong>${escapeHtml(`Session ${program.roundNumber} | Group ${program.targetGroupNumber}`)}</strong>
          </div>
          <button type="button" class="app-btn-outline" data-training-action="refresh-overview">Refresh</button>
        </div>
        <section class="po-training-session-hero training-workspace-hero">
          <div class="po-training-session-hero__identity">
            <span class="po-panel-label">Selected Group Slot</span>
            <h3>${escapeHtml(program.programName || `Session ${program.roundNumber}`)}</h3>
            <div class="po-training-session-context__meta">
              <span>${escapeHtml(`Session ${program.roundNumber}`)}</span>
              <span>${escapeHtml(`Group ${program.targetGroupNumber}`)}</span>
              <span>${escapeHtml(`${invitees.length}/${groupSize} participants`)}</span>
              <span>${escapeHtml(program.date ? formatDate(program.date) : 'No date yet')}</span>
            </div>
          </div>
          <span class="po-status-chip po-status-chip--header ${isLocked ? 'is-success' : 'is-warning'}">${escapeHtml(isLocked ? 'Notified / Locked' : 'Draft / Editable')}</span>
        </section>
        <section class="training-workspace-group-strip">
          ${(round?.slots || []).map((slot) => buildGroupButton(round, slot)).join('')}
        </section>
        ${isLocked
          ? `<div class="po-training-validation-banner">This group slot is locked because notices were already sent. Use the remaining available groups in this round, or move to the next round once all three groups are notified.</div>`
          : `<div class="po-training-validation-banner">Save the group schedule first. Notice sending unlocks only when this capacity group has exactly ${groupSize} participants.</div>`}
        <form id="training-round-form" class="po-training-session-form">
          <input type="hidden" name="programId" value="${escapeHtml(String(program.id || ''))}">
          <input type="hidden" name="roundNumber" value="${escapeHtml(String(program.roundNumber || 1))}">
          <input type="hidden" name="targetGroupNumber" value="${escapeHtml(String(program.targetGroupNumber || 1))}">
          <section class="po-training-workspace po-training-workspace--setup">
            <div class="po-training-work-block__header"><div><span class="po-panel-label">Session Details</span><h4>Shared Round Information</h4></div></div>
            <div class="po-training-setup">
              <label class="po-training-field po-training-setup__identity">
                <span>Program Name</span>
                <input class="section-filter" type="text" name="programName" value="${escapeHtml(program.programName || '')}" placeholder="Program Name" ${isLocked ? 'disabled' : ''}>
              </label>
              <div class="po-training-setup__grid">
                ${field('Date', 'date', normalizeDate(program.date || program.startsAt), 'date', isLocked)}
                ${field('Venue / Place', 'venue', program.venue || '', 'text', isLocked)}
                ${field('Start Time', 'startTime', normalizeTime(program.startTime || program.startsAt), 'time', isLocked)}
                ${field('Speaker / Facilitator', 'speaker', program.speaker || '', 'text', isLocked)}
                ${field('End Time', 'endTime', normalizeTime(program.endTime || program.endsAt), 'time', isLocked)}
              </div>
              <div class="po-training-essentials">
                ${textareaField('What to Bring', 'whatToBring', program.whatToBring || '', 3, isLocked)}
                ${textareaField('Instructions / Reminders', 'instructions', program.instructions || '', 3, isLocked)}
              </div>
            </div>
          </section>
          <section class="po-training-workspace">
            <header class="po-training-workspace__header"><div><span class="po-panel-label">Training Forms</span><h4>Forms to Cover</h4></div></header>
            <div class="po-training-form-list">
              ${(state.data.seminarForms || []).map((form) => {
                const checked = (program.seminarFormCodes || []).includes(form.code) ? 'checked' : '';
                return `<label class="po-training-assignment__item ${isLocked ? 'is-blocked' : 'is-eligible'}"><input type="checkbox" name="seminarFormCodes[]" value="${escapeHtml(form.code)}" ${checked} ${isLocked ? 'disabled' : ''}><span class="po-training-assignment__copy"><strong>${escapeHtml(form.label)}</strong></span></label>`;
              }).join('')}
            </div>
          </section>
          <div class="po-training-session-actions">
            <button type="submit" class="action-button po-case-action" ${isLocked || state.loading.save ? 'disabled' : ''}>${state.loading.save ? 'Saving...' : 'Save Group Schedule'}</button>
          </div>
        </form>
        <section class="po-training-workspace">
          <header class="po-training-workspace__header"><div><span class="po-panel-label">Notice Flow</span><h4>Notify This Group</h4></div></header>
          <div class="po-training-summary-rail">
            ${miniMetric('Group', `Group ${program.targetGroupNumber}`)}
            ${miniMetric('Participants', `${invitees.length}/${groupSize}`)}
            ${miniMetric('Notice Status', isLocked ? 'Locked' : (groupIsFull ? 'Ready' : `Waiting for ${groupSize}`))}
            ${miniMetric('Round Complete', allRoundGroupsDone ? 'Yes' : 'No')}
          </div>
          <div class="po-training-announcement__preview training-notice-preview">
            <div class="po-training-preview-grid">
              <div><span>Date</span><strong>${escapeHtml(program.date ? formatDate(program.date) : '--')}</strong></div>
              <div><span>Time</span><strong>${escapeHtml(`${normalizeTime(program.startTime || program.startsAt) || '--'} - ${normalizeTime(program.endTime || program.endsAt) || '--'}`)}</strong></div>
              <div><span>Venue</span><strong>${escapeHtml(program.venue || '--')}</strong></div>
              <div><span>Speaker</span><strong>${escapeHtml(program.speaker || '--')}</strong></div>
            </div>
          </div>
          <div class="po-training-row-actions">
            <button type="button" class="action-button po-case-action" data-training-notify-group ${(!program.id || isLocked || !groupIsFull || state.loading.notices) ? 'disabled' : ''}>${state.loading.notices ? 'Sending...' : `Notify Group ${program.targetGroupNumber}`}</button>
          </div>
          <div class="table-card po-training-work-block">
            <div class="table-wrapper">
              <table class="data-table">
                <thead><tr><th>Participant</th><th>Business</th><th>Group</th><th>Workflow</th><th>Last Notice</th></tr></thead>
                <tbody>
                  ${invitees.length ? invitees.map((invitee) => `
                    <tr>
                      <td>${escapeHtml(invitee.user?.name || invitee.fullName || '--')}</td>
                      <td>${escapeHtml(invitee.businessName || '--')}</td>
                      <td>${escapeHtml(`Group ${invitee.batchGroupNumber || program.targetGroupNumber || '--'}`)}</td>
                      <td><span class="po-status-chip ${isInviteeNotified(invitee) ? 'is-success' : 'is-warning'}">${escapeHtml(isInviteeNotified(invitee) ? 'Notified' : 'Scheduled')}</span></td>
                      <td>${escapeHtml(formatDateTime(invitee.lastNoticeSentAt || invitee.notifiedAt || ''))}</td>
                    </tr>
                  `).join('') : '<tr><td colspan="5">No participants are currently assigned to this group slot.</td></tr>'}
                </tbody>
              </table>
            </div>
          </div>
        </section>
        <section class="po-training-workspace">
          <header class="po-training-workspace__header"><div><span class="po-panel-label">Attendance Snapshot</span><h4>Group Attendance</h4></div></header>
          <div class="po-training-summary-rail">
            ${miniMetric('Present', invitees.filter((invitee) => deriveAttendanceStatus(invitee) === 'Present').length)}
            ${miniMetric('Absent', invitees.filter((invitee) => deriveAttendanceStatus(invitee) === 'Absent').length)}
            ${miniMetric('Excused', invitees.filter((invitee) => deriveAttendanceStatus(invitee) === 'Excused').length)}
          </div>
          <div class="table-card po-training-work-block">
            <div class="table-wrapper">
              <table class="data-table po-training-attendance-table">
                <thead><tr><th>Participant</th><th>Attendance</th><th>Remarks</th></tr></thead>
                <tbody>
                  ${invitees.length ? invitees.map((invitee) => `
                    <tr>
                      <td>${escapeHtml(invitee.user?.name || invitee.fullName || '--')}</td>
                      <td><span class="po-status-chip ${attendanceClass(deriveAttendanceStatus(invitee))}">${escapeHtml(deriveAttendanceStatus(invitee))}</span></td>
                      <td>${escapeHtml(invitee.remarks || '--')}</td>
                    </tr>
                  `).join('') : '<tr><td colspan="3">Attendance will appear here after PDO/Admin records it for this group slot.</td></tr>'}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </section>
    `);
  }

  function buildSummaryCard(label, value, eyebrow) {
    return `
      <article class="metric-card metric-card--soft admin-training-summary-card">
        <span class="metric-card__label">${escapeHtml(eyebrow)}</span>
        <div class="metric-card__body">
          <strong class="metric-card__value">${escapeHtml(String(value))}</strong>
        </div>
      </article>
    `;
  }

  function field(label, name, value, type = 'text', disabled = false) {
    return `<label class="po-training-field"><span>${escapeHtml(label)}</span><input class="section-filter" type="${type}" name="${escapeHtml(name)}" value="${escapeHtml(value)}" ${disabled ? 'disabled' : ''}></label>`;
  }

  function textareaField(label, name, value, rows, disabled = false) {
    return `<label class="po-training-field po-training-field--stacked"><span>${escapeHtml(label)}</span><textarea class="po-inline-remarks po-training-compact-textarea" name="${escapeHtml(name)}" rows="${rows}" ${disabled ? 'disabled' : ''}>${escapeHtml(value)}</textarea></label>`;
  }

  function miniMetric(label, value) {
    return `<article class="po-summary-card"><span class="po-summary-card__label">${escapeHtml(label)}</span><strong class="po-summary-card__value">${escapeHtml(String(value))}</strong></article>`;
  }

  function deriveAttendanceStatus(invitee) {
    const value = String(invitee?.status || invitee?.inviteStatus || '').toLowerCase();
    if (value === 'attended' || value === 'present') return 'Present';
    if (value === 'missed' || value === 'absent') return 'Absent';
    if (value === 'excused') return 'Excused';
    return 'Not Marked';
  }

  function attendanceClass(status) {
    if (status === 'Present') return 'is-success';
    if (status === 'Excused') return 'is-warning';
    if (status === 'Absent') return 'is-danger';
    return 'is-muted';
  }

  function normalizeDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString().slice(0, 10);
  }

  function normalizeTime(value) {
    if (!value) return '';
    const raw = String(value);
    if (raw.includes('T') || raw.includes(' ')) return raw.slice(11, 16);
    return raw.slice(0, 5);
  }

  function formatDateTime(value) {
    if (!value) return '--';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('en-PH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  }

  function isInviteeNotified(invitee) {
    return Boolean(invitee?.lastNoticeSentAt || invitee?.notifiedAt);
  }

  function bind() {
    const root = section();
    if (!root || root.dataset.trainingBound === 'true') return;
    root.dataset.trainingBound = 'true';

    root.addEventListener('click', async (event) => {
      const create = event.target.closest('#training-focus-create');
      if (create) return openFirstAvailableSlot();

      const refresh = event.target.closest('[data-training-action="refresh-overview"]');
      if (refresh) return load();

      const back = event.target.closest('[data-training-action="back-overview"]');
      if (back) {
        state.view = 'overview';
        state.activeProgram = null;
        clearNotice();
        return render();
      }

      const slotButton = event.target.closest('[data-training-round-slot]');
      if (slotButton) {
        const [roundNumber, groupNumber] = String(slotButton.dataset.trainingRoundSlot || '').split(':').map(Number);
        if (roundNumber > 0 && groupNumber > 0) {
          return openRoundSlot(roundNumber, groupNumber);
        }
      }

      const notify = event.target.closest('[data-training-notify-group]');
      if (notify && state.activeProgram) {
        return sendGroupNotice();
      }
    });

    root.addEventListener('submit', (event) => {
      const form = event.target.closest('#training-round-form');
      if (!form) return;
      event.preventDefault();
      saveProgram(form);
    });
  }

  async function saveProgram(form) {
    if (!(form instanceof HTMLFormElement) || !state.activeProgram) return;
    const formData = new FormData(form);
    const payload = {
      programId: formData.get('programId') || '',
      roundNumber: formData.get('roundNumber') || state.activeProgram.roundNumber || 1,
      targetGroupNumber: formData.get('targetGroupNumber') || state.activeProgram.targetGroupNumber || 1,
      programName: formData.get('programName') || '',
      description: state.activeProgram.description || '',
      date: formData.get('date') || '',
      startTime: formData.get('startTime') || '',
      endTime: formData.get('endTime') || '',
      venue: formData.get('venue') || '',
      speaker: formData.get('speaker') || '',
      whatToBring: formData.get('whatToBring') || '',
      instructions: formData.get('instructions') || '',
      trainingMode: 'batch',
      status: state.activeProgram.storedStatus || state.activeProgram.status || 'Scheduled',
      seminarFormCodes: formData.getAll('seminarFormCodes[]'),
    };

    state.loading.save = true;
    render();
    const response = await apiPost(state.activeProgram.id ? 'api/training/update' : 'api/training', payload);
    state.loading.save = false;
    if (!response.ok) {
      render();
      return showNotice(firstError(response.errors) || response.message || 'Unable to save this group schedule.', 'danger');
    }

    clearNotice();
    const savedProgramId = Number(response.programId || state.activeProgram.id || 0);
    await load();
    if (savedProgramId > 0) {
      await loadProgram(savedProgramId, Number(payload.roundNumber), Number(payload.targetGroupNumber));
    }
  }

  async function sendGroupNotice() {
    if (!state.activeProgram?.id) {
      return showNotice('Save this group schedule first before sending notices.', 'warning');
    }

    state.loading.notices = true;
    render();
    const response = await apiPost('api/training/notices', {
      programId: state.activeProgram.id,
      inviteeIds: [],
      groupNumber: state.activeProgram.targetGroupNumber || state.activeGroupNumber || 0,
    });
    state.loading.notices = false;
    if (!response.ok) {
      render();
      return showNotice(firstError(response.errors) || response.message || 'Unable to notify this group.', 'danger');
    }

    clearNotice();
    const currentRoundNumber = Number(state.activeProgram.roundNumber || state.activeRoundNumber || 1);
    await load();
    const currentRound = resolveRound(currentRoundNumber);
    if (currentRound && Array.isArray(currentRound.availableGroups) && currentRound.availableGroups.length) {
      return openRoundSlot(currentRoundNumber, currentRound.availableGroups[0]);
    }

    const nextRound = resolveRound(currentRoundNumber + 1);
    if (nextRound && Array.isArray(nextRound.availableGroups) && nextRound.availableGroups.length) {
      return openRoundSlot(nextRound.roundNumber, nextRound.availableGroups[0]);
    }

    state.view = 'overview';
    state.activeProgram = null;
    render();
    return null;
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
