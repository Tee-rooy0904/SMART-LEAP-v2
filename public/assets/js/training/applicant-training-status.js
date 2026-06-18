/*
 * SMART LEAP FILE GUIDE
 * Training workspace script for a pp li ca nt t ra in in g s ta tu s.
 * Controls one static training page used by admin, PDO, or applicant training flows.
 */
TrainingUI.mountPage({
  async init(ui) {
    const response = await ui.apiGet('applicant-dashboard/state');
    if (!response.ok) return;
    const training = response.state?.training || {};
    const session = training.nextSession?.program || null;
    document.getElementById('applicant-training-status-list').innerHTML = [
      ['Eligibility Status', training.eligible ? 'Training Eligible' : 'Not Yet Eligible'],
      ['Assigned Session', session?.programName || 'Not Yet Scheduled'],
      ['Training Year', session?.date?.slice(0, 4) || '--'],
      ['Group Number', training.invitees?.[0]?.batchGroupNumber ? `Group ${training.invitees[0].batchGroupNumber}` : '--'],
      ['Seminar Focus', (training.openedFormCodes || []).join(', ') || '--'],
      ['Session Status', training.currentStatus || '--'],
    ].map(([label, value]) => `<div><dt>${ui.escapeHtml(label)}</dt><dd>${ui.escapeHtml(value)}</dd></div>`).join('');
    document.getElementById('applicant-assignment-details').innerHTML = [
      ['Session Title', session?.programName || '--'],
      ['Date', ui.formatDate(session?.date || '')],
      ['Time', `${session?.startTime || '--'} - ${session?.endTime || '--'}`],
      ['Venue', session?.venue || '--'],
      ['What to Bring', session?.whatToBring || '--'],
      ['Instructions', session?.instructions || '--'],
    ].map(([label, value]) => `<div><dt>${ui.escapeHtml(label)}</dt><dd>${ui.escapeHtml(value)}</dd></div>`).join('');
    document.getElementById('applicant-forms-access').innerHTML = [
      ['Forms Availability', (training.openedFormCodes || []).length ? 'Forms Open' : 'Forms Closed'],
      ['Opened Form Set Count', (training.openedFormCodes || []).length],
      ['Submission Summary', `${response.state?.postApproval?.summary?.submitted || 0} submitted`],
    ].map(([label, value]) => `<div><dt>${ui.escapeHtml(label)}</dt><dd>${ui.escapeHtml(value)}</dd></div>`).join('');
    document.getElementById('applicant-attendance-status').innerHTML = [
      ['Attendance Status', training.invitees?.[0]?.status || 'Not Marked'],
      ['Completion Status', training.invitees?.some((row) => row.status === 'Completed') ? 'Completed' : 'Incomplete'],
      ['Form Completion Status', `${response.state?.postApproval?.summary?.verified || 0} verified / ${response.state?.postApproval?.summary?.total || 0}`],
    ].map(([label, value]) => `<div><dt>${ui.escapeHtml(label)}</dt><dd>${ui.escapeHtml(value)}</dd></div>`).join('');
    ui.renderBanner(document.getElementById('applicant-training-banner'), response.state?.nextStep?.description || '', training.eligible ? 'success' : 'warning');
    document.querySelector('.btn')?.addEventListener('click', () => { window.location.href = ui.routeUrl('applicant/training/forms'); });
  },
});
