/*
 * SMART LEAP FILE GUIDE
 * Training workspace script for a dm in t ra in in g o ve rv ie w.
 * Controls one static training page used by admin, PDO, or applicant training flows.
 */
TrainingUI.mountPage({
  async init(ui) {
    const state = { programs: [], summary: {}, statuses: [], seminarForms: [], query: ui.pageQuery() };
    const pageError = document.getElementById('page-error');
    const summaryTarget = document.getElementById('summary-cards');
    const batchStatusTarget = document.getElementById('batch-status-list');
    const sessionsBody = document.getElementById('sessions-table-body');
    const sessionsEmpty = document.getElementById('sessions-empty');
    const alertsList = document.getElementById('alerts-list');
    const activityBody = document.getElementById('activity-table-body');
    const toolbar = document.getElementById('sessions-toolbar');

    function currentFilters() {
      return {
        status: ui.queryValue('status'),
        date: ui.queryValue('date'),
        programName: ui.queryValue('programName'),
      };
    }

    function updateUrl(next) {
      const params = ui.pageQuery();
      Object.entries(next).forEach(([key, value]) => {
        if (value) params.set(key, value);
        else params.delete(key);
      });
      const query = params.toString();
      window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
    }

    function renderToolbar() {
      const filters = currentFilters();
      toolbar.innerHTML = `
        <div class="field"><label for="session-search">Search by session title</label><input id="session-search" value="${ui.escapeHtml(filters.programName)}"></div>
        <div class="field"><label for="year-filter">Filter by year</label><select id="year-filter"><option value="">All</option>${[...new Set(state.programs.map((item) => String(item.date || '').slice(0, 4)).filter(Boolean))].map((year) => `<option value="${year}" ${filters.date.startsWith(year) ? 'selected' : ''}>${year}</option>`).join('')}</select></div>
        <div class="field"><label for="status-filter">Filter by session status</label><select id="status-filter"><option value="">All</option>${state.statuses.map((status) => `<option value="${ui.escapeHtml(status)}" ${filters.status === status ? 'selected' : ''}>${ui.escapeHtml(status)}</option>`).join('')}</select></div>
        <div class="field"><label for="focus-filter">Filter by seminar focus</label><select id="focus-filter"><option value="">All</option>${state.seminarForms.map((form) => `<option value="${ui.escapeHtml(form.label)}">${ui.escapeHtml(form.label)}</option>`).join('')}</select></div>
        <div class="field"><label for="sort-filter">Sort</label><select id="sort-filter"><option value="newest">Newest</option><option value="start">Start Date</option><option value="assigned">Assigned Count</option></select></div>
      `;

      const search = document.getElementById('session-search');
      search.addEventListener('input', ui.debounce(() => {
        updateUrl({ programName: search.value.trim() });
        load();
      }, 200));
      document.getElementById('status-filter').addEventListener('change', (event) => {
        updateUrl({ status: event.target.value });
        load();
      });
      document.getElementById('year-filter').addEventListener('change', (event) => {
        updateUrl({ date: event.target.value ? `${event.target.value}-01-01` : '' });
        load();
      });
    }

    function renderSummary() {
      const yearlyBatch = state.summary.yearlyBatch || {};
      const capacity = yearlyBatch.yearlyBatchCapacity || ui.TRAINING_YEARLY_BATCH_CAPACITY || 255;
      const groupSize = yearlyBatch.yearlyGroupSize || ui.TRAINING_BATCH_GROUP_SIZE || 100;
      const cards = [
        ['Eligible Applicants', state.summary.eligibleApplicants || 0],
        ['Assigned Participants', state.summary.participants || 0],
        ['Remaining Capacity', Math.max(0, capacity - (state.summary.participants || 0))],
        ['Group 1 Count', Math.min(groupSize, state.summary.participants || 0)],
        ['Group 2 Count', Math.max(0, Math.min(groupSize, (state.summary.participants || 0) - groupSize))],
        ['Group 3 Count', Math.max(0, Math.min(groupSize, (state.summary.participants || 0) - (groupSize * 2)))],
      ];
      summaryTarget.innerHTML = cards.map(([label, value]) => `<article class="stat-card"><p class="stat-card__label">${ui.escapeHtml(label)}</p><p class="stat-card__value">${ui.escapeHtml(value)}</p></article>`).join('');
      batchStatusTarget.innerHTML = [
        ['Training Year', new Date().getFullYear()],
        ['Batch Status', state.programs.length ? 'Active Session Loaded' : 'No Session Created'],
        ['Batch Capacity', `${capacity} participants`],
        ['Assigned Count', state.summary.participants || 0],
        ['Remaining Slots', Math.max(0, capacity - (state.summary.participants || 0))],
        ['Grouping Basis', 'Assigned PDO'],
        ['Group Limits', `3 groups x ${groupSize}`],
        ['Session Count', state.programs.length],
      ].map(([label, value]) => `<div><dt>${ui.escapeHtml(label)}</dt><dd>${ui.escapeHtml(value)}</dd></div>`).join('');
    }

    function renderSessions() {
      sessionsBody.innerHTML = state.programs.map((program) => {
        const formStatus = (program.seminarFormCodes || []).length ? 'Forms Open' : 'Forms Closed';
        const noticeStatus = program.notifiedCount > 0 ? 'Notice Sent' : 'Notice Pending';
        return `<tr>
          <td>${ui.escapeHtml(program.programName)}</td>
          <td>${ui.escapeHtml((program.seminarFormCodes || []).map((code) => state.seminarForms.find((item) => item.code === code)?.label || code).join(', ') || '--')}</td>
          <td>${ui.escapeHtml(String(program.date || '').slice(0, 4) || '--')}</td>
          <td>${ui.statusChip(program.status, 'assigned')}</td>
          <td>${ui.escapeHtml(program.participantCount || 0)}</td>
          <td>${ui.statusChip(formStatus, formStatus === 'Forms Open' ? 'form-open' : 'blocked')}</td>
          <td>${ui.statusChip(noticeStatus, noticeStatus === 'Notice Sent' ? 'notice-system' : 'blocked')}</td>
          <td>${ui.escapeHtml(`${program.attendedCount || 0} / ${program.participantCount || 0}`)}</td>
          <td>${ui.escapeHtml(`${program.completedCount || 0} / ${program.participantCount || 0}`)}</td>
          <td>${ui.escapeHtml(ui.formatDate(program.date))}</td>
          <td>${ui.escapeHtml(ui.formatDate(program.date))}</td>
          <td><div class="table-row-actions">
            <button class="btn-ghost" data-route="session" data-session-id="${program.id}" type="button">View</button>
            <button class="btn-ghost" data-route="session" data-session-id="${program.id}" type="button">Edit</button>
            <button class="btn-ghost" data-route="assignment" data-session-id="${program.id}" type="button">Manage Assignment</button>
            <button class="btn-ghost" data-route="forms" data-session-id="${program.id}" type="button">Control Forms</button>
            <button class="btn-ghost" data-route="notices" data-session-id="${program.id}" type="button">Send Notices</button>
            <button class="btn-ghost" data-route="attendance" data-session-id="${program.id}" type="button">Attendance &amp; Completion</button>
          </div></td>
        </tr>`;
      }).join('');
      sessionsEmpty.hidden = state.programs.length > 0;
    }

    function renderAlertsAndActivity() {
      const alerts = [];
      state.programs.forEach((program) => {
        if ((program.participantCount || 0) >= 260) alerts.push(`${program.programName} is nearing full batch capacity.`);
        if ((program.participantCount || 0) > 0 && !(program.seminarFormCodes || []).length) alerts.push(`${program.programName} has assigned participants but forms are not opened.`);
        if ((program.participantCount || 0) > 0 && (program.notifiedCount || 0) === 0) alerts.push(`${program.programName} has assigned participants but notices are not sent.`);
        if ((program.participantCount || 0) > 0 && (program.completedCount || 0) < (program.participantCount || 0) && ['Attended', 'Notified', 'Scheduled'].includes(program.status)) {
          alerts.push(`${program.programName} still has incomplete attendance or completion.`);
        }
      });
      alertsList.innerHTML = alerts.length ? `<ul class="list-clean">${alerts.map((item) => `<li>${ui.escapeHtml(item)}</li>`).join('')}</ul>` : '<div class="empty-state"><h3>No operational alerts.</h3><p>All live training sessions are currently aligned with visible rules.</p></div>';
      const activityRows = state.programs.map((program) => ({
        timestamp: program.createdAt,
        user: program.createdBy || 'CSWDD Staff',
        action: 'Training session available',
        session: program.programName,
        result: program.status,
      }));
      activityBody.innerHTML = activityRows.map((item) => `<tr><td>${ui.escapeHtml(ui.formatDateTime(item.timestamp))}</td><td>${ui.escapeHtml(item.user)}</td><td>${ui.escapeHtml(item.action)}</td><td>${ui.escapeHtml(item.session)}</td><td>${ui.statusChip(item.result, 'assigned')}</td></tr>`).join('') || '<tr><td colspan="5">No recent activity available.</td></tr>';
    }

    async function load() {
      ui.renderBanner(pageError, '', 'destructive');
      const response = await ui.apiGet('api/training', currentFilters());
      if (!response.ok) {
        ui.renderBanner(pageError, response.message || 'Unable to load the training overview.', 'destructive');
        return;
      }
      state.programs = response.data?.programs || [];
      state.summary = { ...(response.data?.summary || {}), eligibleApplicants: (response.data?.eligibleInvitees || []).length };
      state.statuses = response.data?.statuses || [];
      state.seminarForms = response.data?.seminarForms || [];
      renderToolbar();
      renderSummary();
      renderSessions();
      renderAlertsAndActivity();
    }

    document.addEventListener('click', (event) => {
      const route = event.target.closest('[data-route]');
      if (!route) return;
      window.location.href = ui.routeUrl(`admin/training/${route.dataset.route}${route.dataset.route === 'session' ? '' : ''}?sessionId=${route.dataset.sessionId}`);
    });

    document.querySelector('.btn')?.addEventListener('click', () => { window.location.href = ui.routeUrl('admin/training/session'); });
    document.querySelector('.btn-secondary')?.addEventListener('click', () => { window.location.href = ui.routeUrl('admin/training/eligible-applicants'); });

    await load();
  },
});
