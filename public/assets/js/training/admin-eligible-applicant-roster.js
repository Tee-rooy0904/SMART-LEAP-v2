/*
 * SMART LEAP FILE GUIDE
 * Training workspace script for a dm in e li gi bl e a pp li ca nt r os te r.
 * Controls one static training page used by admin, PDO, or applicant training flows.
 */
TrainingUI.mountPage({
  async init(ui) {
    const state = { rows: [] };
    const summaryTarget = document.getElementById('eligible-summary');
    const rosterBody = document.getElementById('eligible-roster-body');
    const empty = document.getElementById('eligible-empty');
    const toolbar = document.getElementById('eligible-toolbar');

    function uploadReadiness(row) {
      return row.requirements?.every((item) => item.exists) ? 'All Required Uploads Present' : 'Missing Uploads';
    }
    function reviewStatus(row) {
      return row.requirements?.every((item) => item.reviewedByAssignedPdo) ? 'Reviewed by Assigned PDO' : 'Pending Assigned PDO Review';
    }
    function verificationStatus(row) {
      return row.requirements?.every((item) => item.isStatusApproved) ? 'Verified' : 'Not Fully Verified';
    }

    function renderSummary() {
      summaryTarget.innerHTML = [
        ['Latest Application Eligible', state.rows.length],
        ['Blocked by Missing PDO', 0],
        ['Blocked by Missing Uploads', 0],
        ['Blocked by Unreviewed Uploads', 0],
        ['Blocked by Not Verified Uploads', 0],
      ].map(([label, value]) => `<article class="stat-card"><p class="stat-card__label">${ui.escapeHtml(label)}</p><p class="stat-card__value">${ui.escapeHtml(value)}</p></article>`).join('');
    }

    function renderToolbar() {
      const pdoNames = [...new Set(state.rows.map((row) => row.assignedPdoName).filter(Boolean))];
      toolbar.innerHTML = `
        <div class="field"><label>Search by applicant name</label><input id="filter-applicant"></div>
        <div class="field"><label>Search by business name</label><input id="filter-business"></div>
        <div class="field"><label>Filter by eligibility status</label><select id="filter-status"><option value="">All</option><option value="Eligible">Eligible</option></select></div>
        <div class="field"><label>Filter by assigned PDO</label><select id="filter-pdo"><option value="">All</option>${pdoNames.map((name) => `<option value="${ui.escapeHtml(name)}">${ui.escapeHtml(name)}</option>`).join('')}</select></div>
        <div class="field"><label>Filter by upload readiness</label><select id="filter-readiness"><option value="">All</option><option value="All Required Uploads Present">All Required Uploads Present</option></select></div>
        <div class="field"><label>Sort</label><select id="filter-sort"><option value="asc">Alphabetical A-Z</option><option value="desc">Alphabetical Z-A</option></select></div>
        <button class="btn-ghost" id="reset-filters" type="button">Reset filters</button>`;

      const rerender = () => renderRows();
      toolbar.querySelectorAll('input,select').forEach((node) => node.addEventListener('input', rerender));
      document.getElementById('reset-filters').addEventListener('click', () => {
        toolbar.querySelectorAll('input').forEach((input) => { input.value = ''; });
        toolbar.querySelectorAll('select').forEach((select) => { select.selectedIndex = 0; });
        renderRows();
      });
    }

    function filteredRows() {
      const applicant = String(document.getElementById('filter-applicant')?.value || '').toLowerCase();
      const business = String(document.getElementById('filter-business')?.value || '').toLowerCase();
      const status = document.getElementById('filter-status')?.value || '';
      const pdo = document.getElementById('filter-pdo')?.value || '';
      const readiness = document.getElementById('filter-readiness')?.value || '';
      const sort = document.getElementById('filter-sort')?.value || 'asc';
      const rows = state.rows.filter((row) => {
        if (applicant && !String(row.name || '').toLowerCase().includes(applicant)) return false;
        if (business && !String(row.businessName || '').toLowerCase().includes(business)) return false;
        if (status && row.eligibilityStatus !== status) return false;
        if (pdo && row.assignedPdoName !== pdo) return false;
        if (readiness && uploadReadiness(row) !== readiness) return false;
        return true;
      });
      rows.sort((left, right) => sort === 'desc' ? String(right.name).localeCompare(String(left.name)) : String(left.name).localeCompare(String(right.name)));
      return rows;
    }

    function renderRows() {
      const rows = filteredRows();
      rosterBody.innerHTML = rows.map((row) => `<tr>
        <td>${ui.escapeHtml(row.name)}</td>
        <td>${ui.escapeHtml(row.businessName || '--')}</td>
        <td>${ui.escapeHtml(row.applicationId || '--')}</td>
        <td>${ui.escapeHtml(row.assignedPdoName || '--')}</td>
        <td>${ui.escapeHtml(uploadReadiness(row))}</td>
        <td>${ui.escapeHtml(reviewStatus(row))}</td>
        <td>${ui.statusChip(verificationStatus(row), verificationStatus(row) === 'Verified' ? 'eligible' : 'blocked')}</td>
        <td>${ui.statusChip('Eligible', 'eligible')}</td>
        <td>${ui.escapeHtml(ui.formatDate(new Date().toISOString()))}</td>
        <td><div class="table-row-actions"><button class="btn-ghost" type="button">View Applicant</button><button class="btn-secondary" data-add-id="${row.applicantProfileId}" type="button">Add to Assignment</button></div></td>
      </tr>`).join('');
      empty.hidden = rows.length > 0;
    }

    const response = await ui.apiGet('api/training');
    if (!response.ok) return;
    state.rows = (response.data?.eligibleInvitees || []).map((row) => ({ ...row, eligibilityStatus: 'Eligible' }));
    renderSummary();
    renderToolbar();
    renderRows();
    document.addEventListener('click', (event) => {
      const add = event.target.closest('[data-add-id]');
      if (!add) return;
      window.location.href = ui.routeUrl(`admin/training/assignment?highlightApplicantId=${add.dataset.addId}`);
    });
  },
});
