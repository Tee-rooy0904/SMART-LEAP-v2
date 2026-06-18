(function () {
  const { qs, on, setHTML } = window.App.dom;
  const { state, textMatch } = window.App.state;
  const { formatCurrency, formatDate } = window.App.format;

  let bound = false;

  const getBeneficiaryRepayments = (beneficiaryId) => {
    return (state.data.repaymentRecords || []).filter((r) => r.beneficiaryId === beneficiaryId);
  };

  const computeRepaymentMetrics = () => {
    const repayments = state.data.repaymentRecords || [];
    
    const totalCollected = repayments
      .filter(r => r.status === 'Verified')
      .reduce((sum, r) => sum + r.amount, 0);
    
    const pendingProofs = repayments.filter(r => r.status === 'Pending').length;
    const verifiedReceipts = repayments.filter(r => r.status === 'Verified').length;
    const overdueAccounts = repayments.filter(r => r.status === 'Overdue').length;
    
    return {
      totalCollected,
      pendingProofs,
      verifiedReceipts,
      overdueAccounts
    };
  };

  const buildSummaryRow = (metrics) => {
    return `
      <div class="reports-kpis">
        <div class="kpi-card">
          <span>Total Collected</span>
          <strong>${formatCurrency(metrics.totalCollected)}</strong>
          <em>Verified payments</em>
        </div>
        <div class="kpi-card">
          <span>Pending Proofs</span>
          <strong>${metrics.pendingProofs}</strong>
          <em>Awaiting verification</em>
        </div>
        <div class="kpi-card">
          <span>Verified Receipts</span>
          <strong>${metrics.verifiedReceipts}</strong>
          <em>Confirmed payments</em>
        </div>
        <div class="kpi-card">
          <span>Overdue Accounts</span>
          <strong>${metrics.overdueAccounts}</strong>
          <em>Past due payments</em>
        </div>
      </div>
    `;
  };

  const buildRosterTable = (beneficiaries) => {
    const rows = beneficiaries.map((b) => {
      const records = getBeneficiaryRepayments(b.id);
      const verified = records.filter((r) => r.status === 'Verified').length;
      const pending = records.filter((r) => r.status === 'Pending').length;
      return `
        <tr>
          <td>${b.name}</td>
          <td>${b.barangay}</td>
          <td>${verified}/${records.length}</td>
          <td>${pending} pending</td>
          <td class="actions"><button class="app-btn-outline" data-repayment-open="${b.id}">Open details</button></td>
        </tr>
      `;
    }).join('');

    return `
      <div class="table-card">
        <div class="table-toolbar">
          <h4>Beneficiary roster</h4>
        </div>
        <div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th>Beneficiary</th>
                <th>Barangay</th>
                <th>Progress</th>
                <th>Pending</th>
                <th class="actions">Action</th>
              </tr>
            </thead>
            <tbody>
              ${rows || '<tr><td colspan="5">No repayment records yet.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;
  };

  const buildDetailPanel = (beneficiary) => {
    if (!beneficiary) return '';

    const records = getBeneficiaryRepayments(beneficiary.id);
    const verified = records.filter((r) => r.status === 'Verified').length;
    const pending = records.filter((r) => r.status === 'Pending').length;
    const overdue = records.filter((r) => r.status === 'Overdue').length;
    const lastPayment = records.length ? records[0] : null;

    const rows = records.map((r) => {
      const actionButtons = r.status === 'Pending'
        ? `<button class="app-btn-outline" data-repayment-verify="${r.id}">Verify</button>
           <button class="app-btn-ghost danger" data-repayment-reject="${r.id}">Reject</button>`
        : '--';
      return `
        <tr>
          <td>${formatDate(r.month)}</td>
          <td>${formatDate(r.date)}</td>
          <td>${formatCurrency(r.amount)}</td>
          <td><span class="badge-theme">${r.status}</span></td>
          <td class="or-cell">${r.orNumber || '--'}</td>
          <td class="actions">${actionButtons}</td>
        </tr>
      `;
    }).join('');

    return `
      <div class="repayments-detail" id="repayment-detail-panel">
        <div class="detail-header">
          <div>
            <h4>${beneficiary.name}</h4>
            <div class="detail-meta">
              <span>${beneficiary.barangay}</span>
              <span>${beneficiary.businessType}</span>
            </div>
          </div>
          <div class="detail-actions">
            <button type="button" class="app-btn-ghost" data-repayment-close>Close</button>
          </div>
        </div>
        <div class="detail-summary-grid">
          <div class="detail-summary-card">
            <h6>Assistance</h6>
            <strong>${formatCurrency(beneficiary.assistanceAmount)}</strong>
            <span>Status: ${beneficiary.status}</span>
          </div>
          <div class="detail-summary-card">
            <h6>Progress</h6>
            <strong>${verified}/${records.length} months</strong>
            <span>${pending} pending</span>
          </div>
          <div class="detail-summary-card">
            <h6>Overdue</h6>
            <strong>${overdue}</strong>
            <span>Last payment: ${lastPayment ? formatDate(lastPayment.date) : '--'}</span>
          </div>
        </div>
        <div class="table-card light">
          <div class="table-toolbar">
            <h4>Payment history</h4>
          </div>
          <div class="table-wrapper">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Payment date</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>OR / Proof</th>
                  <th class="actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${rows || '<tr><td colspan="6">No receipts logged.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  };

  const matchesRepaymentStatus = (beneficiary, status) => {
    if (status === 'All') return true;
    const records = getBeneficiaryRepayments(beneficiary.id);
    return records.some((r) => r.status === status);
  };

  const getFilteredBeneficiaries = () => {
    const filters = state.filters.repayments;
    const beneficiaries = state.data.beneficiaries || [];
    return beneficiaries.filter((b) => {
      const searchMatch = textMatch(b.name, filters.search) || textMatch(b.barangay, filters.search);
      const barangayMatch = filters.barangay === 'All' || b.barangay === filters.barangay;
      const statusMatch = matchesRepaymentStatus(b, filters.status);
      return searchMatch && barangayMatch && statusMatch;
    });
  };

  const renderRepayments = () => {
    const section = qs('#repayments-section');
    if (!section) return;

    const beneficiaries = getFilteredBeneficiaries();
    const detailBeneficiary = beneficiaries.find((b) => b.id === state.repayments.activeDetailId);
    const metrics = computeRepaymentMetrics();

    setHTML(section, `
      <div class="section-header">
        <div>
          <h4>Repayments</h4>
          <p>Track repayment progress and verify receipts.</p>
        </div>
      </div>
      ${buildSummaryRow(metrics)}
      <div class="section-filters">
        <div class="filter-search">
          <i class="fas fa-search"></i>
          <input type="search" id="repayments-search" placeholder="Search by name or barangay" value="${state.filters.repayments.search}">
        </div>
        <label class="filter-group">
          <span class="filter-label">Barangay</span>
          <select id="repayments-barangay">
            <option value="All">All</option>
            ${(state.data.BARANGAYS || []).map((b) => `<option value="${b}">${b}</option>`).join('')}
          </select>
        </label>
        <label class="filter-group">
          <span class="filter-label">Status</span>
          <select id="repayments-status">
            <option value="All">All</option>
            <option value="Pending">Pending</option>
            <option value="Verified">Verified</option>
            <option value="Overdue">Overdue</option>
          </select>
        </label>
      </div>
      <div class="repayments-roster">
        ${beneficiaries.length ? buildRosterTable(beneficiaries) : '<div class="table-card"><p>No repayment roster available.</p></div>'}
      </div>
      ${detailBeneficiary ? buildDetailPanel(detailBeneficiary) : ''}
    `);

    const searchInput = qs('#repayments-search');
    const barangaySelect = qs('#repayments-barangay');
    const statusSelect = qs('#repayments-status');

    if (barangaySelect) barangaySelect.value = state.filters.repayments.barangay;
    if (statusSelect) statusSelect.value = state.filters.repayments.status;

    on(searchInput, 'input', (e) => {
      state.filters.repayments.search = e.target.value;
      renderRepayments();
    });

    on(barangaySelect, 'change', (e) => {
      state.filters.repayments.barangay = e.target.value;
      renderRepayments();
    });

    on(statusSelect, 'change', (e) => {
      state.filters.repayments.status = e.target.value;
      renderRepayments();
    });
  };

  const bindEvents = () => {
    if (bound) return;
    bound = true;

    const section = qs('#repayments-section');
    if (!section) return;

    on(section, 'click', (e) => {
      const openBtn = e.target.closest('[data-repayment-open]');
      if (openBtn) {
        state.repayments.activeDetailId = openBtn.dataset.repaymentOpen;
        renderRepayments();
        return;
      }

      if (e.target.closest('[data-repayment-close]')) {
        state.repayments.activeDetailId = null;
        renderRepayments();
        return;
      }

      const verifyBtn = e.target.closest('[data-repayment-verify]');
      if (verifyBtn) {
        const record = (state.data.repaymentRecords || []).find((r) => r.id === verifyBtn.dataset.repaymentVerify);
        if (record) record.status = 'Verified';
        renderRepayments();
        return;
      }

      const rejectBtn = e.target.closest('[data-repayment-reject]');
      if (rejectBtn) {
        const record = (state.data.repaymentRecords || []).find((r) => r.id === rejectBtn.dataset.repaymentReject);
        if (record) record.status = 'Overdue';
        renderRepayments();
      }
    });
  };

  const init = () => {
    renderRepayments();
    bindEvents();
  };

  window.App.modules = window.App.modules || {};
  window.App.modules.repayments = { init, render: renderRepayments };
})();
