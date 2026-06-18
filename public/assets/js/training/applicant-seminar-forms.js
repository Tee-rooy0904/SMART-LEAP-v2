/*
 * SMART LEAP FILE GUIDE
 * Training workspace script for a pp li ca nt s em in ar f or ms.
 * Controls one static training page used by admin, PDO, or applicant training flows.
 */
TrainingUI.mountPage({
  async init(ui) {
    const response = await ui.apiGet('applicant-dashboard/state');
    if (!response.ok) return;
    const training = response.state?.training || {};
    const postApproval = response.state?.postApproval || {};
    const session = training.nextSession?.program || null;
    document.getElementById('applicant-forms-session-context').innerHTML = [
      ['Session Title', session?.programName || '--'],
      ['Seminar Focus', (training.openedFormCodes || []).join(', ') || '--'],
      ['Session Status', training.currentStatus || '--'],
      ['Form Access Status', (training.openedFormCodes || []).length ? 'Open' : 'Closed'],
      ['Access Window', session ? `${ui.formatDate(session.date)} ${session.startTime || ''} - ${session.endTime || ''}` : '--'],
    ].map(([label, value]) => `<div><dt>${ui.escapeHtml(label)}</dt><dd>${ui.escapeHtml(value)}</dd></div>`).join('');
    const banner = document.getElementById('forms-availability-banner');
    if (!training.invitees?.length) ui.renderBanner(banner, 'Seminar forms are not available because you do not yet have a training session assignment.', 'warning');
    else if (!(training.openedFormCodes || []).length) ui.renderBanner(banner, 'Seminar forms have not been opened for your session yet.', 'warning');
    else ui.renderBanner(banner, 'Seminar forms are available during your assigned session.', 'success');
    const tasks = (postApproval.tasks || []).filter((task) => (training.openedFormCodes || []).includes(task.code));
    document.getElementById('applicant-forms-body').innerHTML = tasks.map((task) => `<tr><td>${ui.escapeHtml(task.name || task.label || task.code)}</td><td>${ui.statusChip(task.interactive ? 'Available' : 'Locked', task.interactive ? 'form-open' : 'blocked')}</td><td>${ui.escapeHtml(task.status || '--')}</td><td>${ui.escapeHtml(ui.formatDateTime(task.updatedAt || ''))}</td><td><button class="btn-ghost" type="button">${task.status === 'Submitted' ? 'View Submitted Form' : task.status === 'In Progress' ? 'Continue Form' : 'Start Form'}</button></td></tr>`).join('') || '<tr><td colspan="5">No seminar forms are currently open for this session.</td></tr>';
  },
});
