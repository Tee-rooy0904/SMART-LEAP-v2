function renderDashboardKpis({ roster, completionRate, clearanceRate, verifiedReq, totalReq, verifiedAmount }) {
    const card = document.getElementById('dashboard-kpis');
    if (!card) return;

    const active = roster.filter((entry) => isActiveBeneficiaryStatus(entry.applicationStatus || entry.status)).length;
    const inactive = Math.max(roster.length - active, 0);

    card.innerHTML = `
        <article class="summary-card">
          <div class="summary-card__header">
            <span class="summary-icon summary-icon--green">
              <i class="fas fa-users" aria-hidden="true"></i>
            </span>
          </div>
          <h4>Total beneficiaries</h4>
          <div class="metric">${numberFormatter.format(roster.length)}</div>
          <p class="meta">${numberFormatter.format(active)} active · ${numberFormatter.format(inactive)} inactive</p>
        </article>
        <article class="summary-card">
          <div class="summary-card__header">
            <span class="summary-icon summary-icon--teal">
              <i class="fas fa-graduation-cap" aria-hidden="true"></i>
            </span>
          </div>
          <h4>Training completion</h4>
          <div class="metric">${completionRate}%</div>
          <p class="meta">Training progress (rolling)</p>
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
