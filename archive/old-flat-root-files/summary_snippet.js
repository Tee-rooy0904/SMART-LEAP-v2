function renderDashboardSummary() {
    const container = document.getElementById('dashboard-summary');
    if (!container) return;
    const roster = getDashboardFilteredRoster();
    const totalBeneficiaries = roster.length;
    const activeBeneficiaries = roster.filter((entry) => isActiveBeneficiaryStatus(entry.applicationStatus || entry.status)).length;
    const inactiveBeneficiaries = Math.max(totalBeneficiaries - activeBeneficiaries, 0);
    const verifiedPayments = roster.flatMap((b) => (b.repayments || []).filter((payment) => (payment.status || '').toLowerCase() === 'verified'));
    const verifiedAmount = verifiedPayments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);

    let totalReq = 0;
    let verifiedReq = 0;
    roster.forEach((beneficiary) => {
        const summary = calculateRequirementSummary(beneficiary.requirements || {});
        if (!summary) return;
        totalReq += summary.total;
        verifiedReq += summary.verified;
    });
    const clearanceRate = totalReq ? Math.round((verifiedReq / totalReq) * 100) : 0;
    const trainingAttendanceRate = trainingAggregate?.attendanceRate || 0;

    container.innerHTML = `
        <article class="summary-card">
          <div class="summary-card__header">
            <span class="summary-icon summary-icon--teal">
              <i class="fas fa-users" aria-hidden="true"></i>
            </span>
          </div>
          <h4>Total beneficiaries</h4>
          <div class="metric">${numberFormatter.format(totalBeneficiaries)}</div>
          <p class="meta">Active ${numberFormatter.format(activeBeneficiaries)} • Inactive ${numberFormatter.format(inactiveBeneficiaries)}</p>
        </article>
        <article class="summary-card">
          <div class="summary-card__header">
            <span class="summary-icon summary-icon--green">
              <i class="fas fa-graduation-cap" aria-hidden="true"></i>
            </span>
          </div>
          <h4>Training completion</h4>
          <div class="metric">${trainingAttendanceRate}%</div>
          <p class="meta">Current attendance completion rate</p>
        </article>
        <article class="summary-card">
          <div class="summary-card__header">
            <span class="summary-icon summary-icon--amber">
              <i class="fas fa-clipboard-check" aria-hidden="true"></i>
            </span>
          </div>
          <h4>Requirements compliance</h4>
          <div class="metric">${clearanceRate}%</div>
          <p class="meta">${numberFormatter.format(verifiedReq)}/${numberFormatter.format(totalReq)} verified</p>
        </article>
        <article class="summary-card">
          <div class="summary-card__header">
            <span class="summary-icon summary-icon--indigo">
              <i class="fas fa-coins" aria-hidden="true"></i>
            </span>
          </div>
          <h4>Total repayments</h4>
          <div class="metric">${pesoFormatter.format(verifiedAmount || 0)}</div>
          <p class="meta">Verified collections to date</p>
        </article>
    `;
}
