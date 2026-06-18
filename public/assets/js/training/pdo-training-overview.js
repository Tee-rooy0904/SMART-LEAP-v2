/*
 * SMART LEAP FILE GUIDE
 * Training workspace script for p do t ra in in g o ve rv ie w.
 * Controls one static training page used by admin, PDO, or applicant training flows.
 */
TrainingUI.mountPage({
  async init(ui) {
    const response = await ui.apiGet('api/training');
    if (!response.ok) return;
    const programs = response.data?.programs || [];
    const summaryTarget = document.getElementById('pdo-summary-cards');
    const body = document.getElementById('pdo-sessions-body');
    const alerts = document.getElementById('pdo-alerts-list');
    summaryTarget.innerHTML = [
      ['My Sessions', programs.length],
      ['My Assigned Participants', programs.reduce((sum, item) => sum + (item.participantCount || 0), 0)],
      ['Notices Pending', programs.reduce((sum, item) => sum + Math.max(0, (item.participantCount || 0) - (item.notifiedCount || 0)), 0)],
      ['Attendance Pending', programs.reduce((sum, item) => sum + Math.max(0, (item.participantCount || 0) - (item.completedCount || 0)), 0)],
    ].map(([label, value]) => `<article class="stat-card"><p class="stat-card__label">${ui.escapeHtml(label)}</p><p class="stat-card__value">${ui.escapeHtml(value)}</p></article>`).join('');
    document.getElementById('pdo-sessions-toolbar').innerHTML = `<div class="field"><label>Search session</label><input id="pdo-session-search"></div><div class="field"><label>Filter by status</label><select id="pdo-status-filter"><option value="">All</option>${(response.data?.statuses || []).map((status) => `<option value="${ui.escapeHtml(status)}">${ui.escapeHtml(status)}</option>`).join('')}</select></div><div class="field"><label>Sort by nearest date</label><select><option>Nearest date</option></select></div>`;
    body.innerHTML = programs.map((row) => `<tr><td>${ui.escapeHtml(row.programName)}</td><td>${ui.escapeHtml((row.seminarFormCodes || []).join(', ') || '--')}</td><td>${ui.statusChip(row.status, 'assigned')}</td><td>${ui.escapeHtml(row.participantCount || 0)}</td><td>${ui.statusChip((row.notifiedCount || 0) > 0 ? 'Notice Sent' : 'Notice Pending', (row.notifiedCount || 0) > 0 ? 'notice-system' : 'blocked')}</td><td>${ui.statusChip((row.completedCount || 0) > 0 ? 'Attendance Started' : 'Attendance Pending', (row.completedCount || 0) > 0 ? 'attendance-present' : 'blocked')}</td><td>${ui.escapeHtml(ui.formatDate(row.date))}</td><td><div class="table-row-actions"><button class="btn-ghost" type="button" data-open="session" data-session-id="${row.id}">Open Session</button><button class="btn-secondary" type="button" data-open="operations" data-session-id="${row.id}">Open Operations</button></div></td></tr>`).join('');
    alerts.innerHTML = `<ul class="list-clean">${programs.flatMap((row) => {
      const items = [];
      if ((row.seminarFormCodes || []).length && (row.notifiedCount || 0) === 0) items.push(`${row.programName} has forms opened and notices pending.`);
      if ((row.participantCount || 0) > 0 && (row.completedCount || 0) < (row.participantCount || 0)) items.push(`${row.programName} is active but attendance is not complete.`);
      return items;
    }).map((item) => `<li>${ui.escapeHtml(item)}</li>`).join('') || '<li>No PDO alerts.</li>'}</ul>`;
    document.addEventListener('click', (event) => {
      const button = event.target.closest('[data-open]');
      if (!button) return;
      window.location.href = ui.routeUrl(`pdo/training/${button.dataset.open}?sessionId=${button.dataset.sessionId}`);
    });
  },
});
