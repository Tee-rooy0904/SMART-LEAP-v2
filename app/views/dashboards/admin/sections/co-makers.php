<section id="co-makers-section" class="admin-section" data-role-section hidden>
    <div class="admin-beneficiaries-shell">
        <div class="metric-grid metric-grid--compact admin-beneficiaries-snapshots" id="adminCoMakerSnapshots"></div>

        <div class="filters-row admin-beneficiaries-filters">
            <label class="filter-group filter-group--search">
                <span class="filter-label">Search</span>
                <div class="filter-search">
                    <i class="fas fa-search"></i>
                    <input type="search" id="adminCoMakerSearch" placeholder="Co-maker, primary beneficiary, barangay">
                </div>
            </label>
            <label class="filter-group">
                <span class="filter-label">Status</span>
                <select class="filter-select" id="adminCoMakerStatusFilter">
                    <option value="">All statuses</option>
                    <option value="pending_review">Pending Review</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                </select>
            </label>
            <label class="filter-group">
                <span class="filter-label">Assigned PDO</span>
                <select class="filter-select" id="adminCoMakerPdoFilter">
                    <option value="">All PDOs</option>
                </select>
            </label>
            <div class="filter-group filter-group--actions admin-beneficiaries-filter-actions">
                <span class="filter-label">Actions</span>
                <button type="button" class="app-btn-outline" id="adminCoMakerClearFilters">Clear</button>
            </div>
        </div>

        <div class="table-card admin-beneficiaries-table-card admin-co-makers-table-card">
            <div class="admin-beneficiaries-table-head">
                <h3>Authority-scoped co-maker registrations</h3>
                <span class="admin-inline-pill" id="adminCoMakerCount">0 records</span>
            </div>
            <div class="admin-co-maker-roster-wrap">
                <div class="admin-co-maker-roster" aria-label="Authority-scoped co-maker registrations">
                    <div class="admin-co-maker-roster__head">
                        <span>Co-maker</span>
                        <span>Primary Beneficiary</span>
                        <span>Relationship</span>
                        <span>Status</span>
                        <span>Assigned PDO</span>
                        <span>Submitted</span>
                        <span>Actions</span>
                    </div>
                    <div class="admin-co-maker-roster__body" id="adminCoMakerTableBody">
                        <div class="admin-co-maker-roster__empty">No co-maker registrations yet.</div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</section>
