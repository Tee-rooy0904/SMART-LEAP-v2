/*
 * SMART LEAP FILE GUIDE
 * Training workspace script for a pp li ca nt t ra in in g n ot ic es.
 * Controls one static training page used by admin, PDO, or applicant training flows.
 */
TrainingUI.mountPage({
  async init(ui) {
    const response = await ui.apiGet('applicant-dashboard/state');
    if (!response.ok) return;
    const training = response.state?.training || {};
    const session = training.nextSession?.program || null;
    const invitees = training.invitees || [];
    document.getElementById('applicant-notice-schedule').innerHTML = [
      ['Session Title', session?.programName || '--'],
      ['Date', ui.formatDate(session?.date || '')],
      ['Time', `${session?.startTime || '--'} - ${session?.endTime || '--'}`],
      ['Venue', session?.venue || '--'],
      ['What to Bring', session?.whatToBring || '--'],
      ['Instructions', session?.instructions || '--'],
    ].map(([label, value]) => `<div><dt>${ui.escapeHtml(label)}</dt><dd>${ui.escapeHtml(value)}</dd></div>`).join('');
    const latestInvitee = invitees[0] || {};
    document.getElementById('applicant-latest-notice').innerHTML = [
      ['Notice Subject', session ? `SMART LEAP Training Notice: ${session.programName}` : 'No notice yet'],
      ['Sent Via', latestInvitee.lastNoticeSentAt || latestInvitee.notifiedAt ? 'In-System and Email' : 'Not Sent'],
      ['Sent At', ui.formatDateTime(latestInvitee.lastNoticeSentAt || latestInvitee.notifiedAt || '')],
      ['Message Body', session ? `You have been scheduled for ${session.programName}.` : 'No training notice has been sent for your training session yet.'],
    ].map(([label, value]) => `<div><dt>${ui.escapeHtml(label)}</dt><dd>${ui.escapeHtml(value)}</dd></div>`).join('');
    document.getElementById('applicant-notice-history').innerHTML = invitees.map((invitee) => `<tr><td>${ui.escapeHtml(session ? `SMART LEAP Training Notice: ${session.programName}` : 'No notice')}</td><td>${ui.statusChip(invitee.lastNoticeSentAt || invitee.notifiedAt ? 'In-System Sent' : 'Not Sent', invitee.lastNoticeSentAt || invitee.notifiedAt ? 'notice-system' : 'blocked')}</td><td>${ui.statusChip(invitee.lastNoticeSentAt || invitee.notifiedAt ? 'Email Sent' : 'Not Sent', invitee.lastNoticeSentAt || invitee.notifiedAt ? 'notice-email' : 'blocked')}</td><td>${ui.escapeHtml(ui.formatDateTime(invitee.lastNoticeSentAt || invitee.notifiedAt || ''))}</td></tr>`).join('') || '<tr><td colspan="4">No notice has been sent for your training session yet.</td></tr>';
  },
});
