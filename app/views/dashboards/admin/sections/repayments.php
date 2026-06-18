<section id="repayments-section" class="admin-section" data-role-section hidden>
    <div class="admin-repayments-page">
        <!-- Top summary cards show how many approved beneficiaries and repayment states exist right now. -->
        <section class="admin-repayments-summary-strip" aria-label="Repayment management summary">
            <article class="metric-card metric-card--soft">
                <span class="metric-card__label">Approved Beneficiaries</span>
                <strong class="metric-card__value" id="adminRepaymentApprovedCount">0</strong>
            </article>
            <article class="metric-card metric-card--soft">
                <span class="metric-card__label">With Pending Review</span>
                <strong class="metric-card__value" id="adminRepaymentPendingBeneficiaryCount">0</strong>
            </article>
            <article class="metric-card metric-card--soft">
                <span class="metric-card__label">Partial Verified</span>
                <strong class="metric-card__value" id="adminRepaymentPartialCount">0</strong>
            </article>
            <article class="metric-card metric-card--soft">
                <span class="metric-card__label">Fully Verified</span>
                <strong class="metric-card__value" id="adminRepaymentFullCount">0</strong>
            </article>
        </section>

        <section class="admin-repayments-filters-card">
            <header class="admin-repayments-block-head">
                <div>
                    <!-- This header groups the search and dropdown controls that limit the repayment roster below. -->
                    <h3>Beneficiary Filters</h3>
                </div>
            </header>
            <!-- These filters drive the shared repayment roster and limit which beneficiary records appear below. -->
            <div class="admin-repayments-filters-grid">
                <label class="filter-group admin-repayments-filter admin-repayments-filter--search">
                    <span class="filter-label">Search beneficiary</span>
                    <input type="search" class="filter-select" id="adminRepaymentSearch" placeholder="Search beneficiary, business, or OR number">
                </label>
                <label class="filter-group admin-repayments-filter">
                    <span class="filter-label">Barangay</span>
                    <select class="filter-select" id="adminRepaymentBarangayFilter">
                        <option value="">All barangays</option>
                    </select>
                </label>
                <label class="filter-group admin-repayments-filter">
                    <span class="filter-label">Assigned PDO</span>
                    <select class="filter-select" id="adminRepaymentPdoFilter">
                        <option value="">All PDOs</option>
                    </select>
                </label>
                <label class="filter-group admin-repayments-filter">
                    <span class="filter-label">Repayment State</span>
                    <select class="filter-select" id="adminRepaymentStateFilter">
                        <option value="">All repayment states</option>
                        <option value="no_upload_yet">No Upload Yet</option>
                        <option value="under_review">Under Review</option>
                        <option value="needs_correction">Needs Correction</option>
                        <option value="rejected">Rejected</option>
                        <option value="partial_paid">Partial Paid</option>
                        <option value="fully_paid">Fully Paid</option>
                    </select>
                </label>
                <label class="filter-group admin-repayments-filter">
                    <span class="filter-label">From date</span>
                    <input type="date" class="filter-select" id="adminRepaymentFromDate">
                </label>
                <label class="filter-group admin-repayments-filter">
                    <span class="filter-label">To date</span>
                    <input type="date" class="filter-select" id="adminRepaymentToDate">
                </label>
            </div>
        </section>

        <section class="admin-repayments-roster-card">
            <header class="admin-repayments-block-head">
                <div>
                    <!-- This roster lists each beneficiary account with repayment standing and an Open Repayments action. -->
                    <span class="admin-section-label">Beneficiaries</span>
                    <h3>Beneficiary Roster</h3>
                </div>
                <span class="chip" id="adminRepaymentRosterCount">0 beneficiaries</span>
            </header>
            <div class="table-wrapper admin-repayments-table-wrapper">
                <!-- The shared repayment workspace binds row actions in this table to the modal below. -->
                <table class="data-table admin-repayments-table">
                    <thead>
                        <tr>
                            <th>Beneficiary</th>
                            <th>Gender</th>
                            <th>Age Group</th>
                            <th>Service Type</th>
                            <th>Barangay</th>
                            <th>Assigned PDO</th>
                            <th>Repayment</th>
                            <th>Verified Amount</th>
                            <th>Months Passed</th>
                            <th>Months Paid</th>
                            <th>Repayment Rate</th>
                            <th class="actions" style="text-align: center;">Action</th>
                        </tr>
                    </thead>
                    <tbody id="adminRepaymentRosterBody">
                        <tr>
                            <td colspan="12">No approved beneficiaries with repayment records available yet.</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </section>
    </div>

    <!-- Shared repayment review modal used to inspect proof, history, and apply verification decisions. -->
    <div class="admin-repayment-modal" id="adminRepaymentModal" aria-hidden="true">
        <div class="admin-repayment-modal__backdrop" data-repayment-modal-close></div>
        <div class="admin-repayment-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="adminRepaymentModalTitle">
            <header class="admin-repayment-modal__header">
                <div class="admin-repayment-modal__header-copy">
                    <!-- Modal title area updates when a specific beneficiary or upload record is selected. -->
                    <span class="admin-section-label">Repayment Review</span>
                    <h3 id="adminRepaymentModalTitle">Beneficiary repayment review</h3>
                    <p id="adminRepaymentModalSubtitle">Select a beneficiary repayment record.</p>
                </div>
                <div class="admin-repayment-modal__header-actions">
                    <span class="admin-inline-pill admin-inline-pill--slate" id="adminRepaymentModalStatus">No Upload Yet</span>
                    <button type="button" class="admin-repayment-modal__close" id="adminRepaymentModalClose" aria-label="Close repayment review modal">&times;</button>
                </div>
            </header>

            <div class="admin-repayment-modal__body">
                <!-- Summary cards reflect the selected beneficiary's overall repayment account, not just one upload. -->
                <section class="admin-repayment-modal__summary">
                    <article class="admin-repayment-modal__metric">
                        <span>Outstanding Balance</span>
                        <strong id="adminRepaymentSummaryOutstanding">PHP 0.00</strong>
                    </article>
                    <article class="admin-repayment-modal__metric">
                        <span>Verified Amount</span>
                        <strong id="adminRepaymentSummaryVerified">PHP 0.00</strong>
                    </article>
                    <article class="admin-repayment-modal__metric">
                        <span>Repayment Compliance</span>
                        <strong id="adminRepaymentSummaryProgress">0 / 0 months</strong>
                    </article>
                    <article class="admin-repayment-modal__metric">
                        <span>Current Repayment Standing</span>
                        <strong id="adminRepaymentSummaryStanding">No Upload Yet</strong>
                    </article>
                </section>

                <section class="admin-repayment-modal__top">
                    <article class="admin-repayment-panel admin-repayment-panel--proof">
                        <header class="admin-repayment-panel__header">
                            <div>
                                <!-- Proof preview panel shows the uploaded OR or receipt file currently under review. -->
                                <span class="admin-section-label">Uploaded OR / Proof</span>
                                <h4>Proof / Receipt Preview</h4>
                            </div>
                        </header>
                        <div class="admin-repayment-proof-meta">
                            <strong id="adminRepaymentProofName">No proof uploaded</strong>
                            <span id="adminRepaymentProofType">--</span>
                            <small id="adminRepaymentProofDate">--</small>
                        </div>
                        <div class="admin-repayment-proof-preview" id="adminRepaymentProofPreview">
                            <div class="admin-repayment-proof-empty">No proof preview available.</div>
                        </div>
                        <div class="admin-repayment-proof-actions">
                            <!-- File actions let staff open, download, or enlarge the selected uploaded proof. -->
                            <button type="button" class="app-btn-outline" id="adminRepaymentOpenProof">Open file</button>
                            <button type="button" class="app-btn-outline" id="adminRepaymentDownloadProof">Download file</button>
                            <button type="button" class="app-btn-outline" id="adminRepaymentFullscreenProof">Fullscreen</button>
                        </div>
                    </article>

                    <div class="admin-repayment-modal__details">
                        <article class="admin-repayment-panel">
                            <header class="admin-repayment-panel__header">
                                <div>
                                    <!-- Beneficiary summary ties the active upload back to its account owner and PDO assignment. -->
                                    <span class="admin-section-label">Beneficiary Summary</span>
                                    <h4 id="adminRepaymentBeneficiaryName">Beneficiary</h4>
                                </div>
                            </header>
                            <div class="admin-repayment-detail-grid">
                                <div><span>Business</span><strong id="adminRepaymentBusiness">--</strong></div>
                                <div><span>Barangay</span><strong id="adminRepaymentBarangay">--</strong></div>
                                <div><span>Assigned PDO</span><strong id="adminRepaymentAssignedPdo">--</strong></div>
                                <div><span>Submission date</span><strong id="adminRepaymentSubmittedAt">--</strong></div>
                            </div>
                        </article>

                        <article class="admin-repayment-panel">
                            <header class="admin-repayment-panel__header">
                                <div>
                                    <!-- OR details summarize the currently selected upload record and its metadata. -->
                                    <span class="admin-section-label">OR Details</span>
                                    <h4>Submission Details</h4>
                                </div>
                            </header>
                            <div class="admin-repayment-detail-grid">
                                <div><span>OR number</span><strong id="adminRepaymentOrNumber">--</strong></div>
                                <div><span>Payment date</span><strong id="adminRepaymentPaymentDate">--</strong></div>
                                <div><span>Submitted by</span><strong id="adminRepaymentSubmittedBy">--</strong></div>
                                <div><span>Submission type</span><strong id="adminRepaymentSubmissionType">--</strong></div>
                                <div><span>Coverage month(s)</span><strong id="adminRepaymentCoverage">--</strong></div>
                                <div><span>Amount</span><strong id="adminRepaymentAmount">PHP 0.00</strong></div>
                                <div><span>Uploaded status</span><strong id="adminRepaymentUploadStatus">--</strong></div>
                                <div><span>Hard copy submitted to office</span><strong id="adminRepaymentHardCopyStatus">Not tracked</strong></div>
                            </div>
                            <div class="admin-repayment-warning is-hidden" id="adminRepaymentDuplicateWarning"></div>
                        </article>
                    </div>
                </section>

                <!-- History lists each covered month and lets staff reopen individual proof rows from the same review session. -->
                <section class="admin-repayment-panel">
                    <header class="admin-repayment-panel__header">
                        <div>
                            <!-- History table makes month-by-month repayment progress and prior review outcomes visible. -->
                            <span class="admin-section-label">Repayment History</span>
                            <h4>Repayment History</h4>
                        </div>
                    </header>
                    <div class="table-wrapper admin-repayment-history-wrapper">
                        <table class="data-table admin-repayment-history-table">
                            <colgroup>
                                <col>
                                <col>
                                <col>
                                <col>
                                <col>
                                <col>
                                <col>
                                <col>
                                <col>
                                <col>
                            </colgroup>
                            <thead>
                                <tr>
                                    <th>Coverage Month</th>
                                    <th>Expected Amount</th>
                                    <th>Submitted Amount</th>
                                    <th>OR Number</th>
                                    <th>Proof</th>
                                    <th>Submission Status</th>
                                    <th>Verification Result</th>
                                    <th>Reviewer</th>
                                    <th>Remarks</th>
                                    <th>Date Reviewed</th>
                                </tr>
                            </thead>
                            <tbody id="adminRepaymentHistoryBody">
                                <tr>
                                    <td colspan="10">No repayment history recorded yet.</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </section>

                <!-- Decision tools apply partial verification, full verification, correction, or rejection to the active upload. -->
                <section class="admin-repayment-panel admin-repayment-panel--decision">
                    <header class="admin-repayment-panel__header">
                        <div>
                            <!-- Review decision block records remarks and the office hard-copy state before final action. -->
                            <span class="admin-section-label">Review Decision</span>
                            <h4>Decision Actions</h4>
                        </div>
                    </header>
                    <div class="admin-repayment-decision-grid">
                        <label class="filter-group admin-repayment-remarks-group">
                            <span class="filter-label">Remarks</span>
                            <textarea class="filter-select admin-repayment-remarks" id="adminRepaymentRemarks" rows="5" placeholder="Record review findings, correction notes, or rejection basis."></textarea>
                        </label>
                        <div class="admin-repayment-decision-actions">
                            <p class="admin-repayment-decision-note" id="adminRepaymentDecisionNote">Open a beneficiary repayment record to review proof and apply a decision.</p>
                            <label class="filter-group admin-repayment-office-status-group" for="adminRepaymentHardCopyInput">
                                <span class="filter-label">Hard copy office status</span>
                                <select class="filter-select" id="adminRepaymentHardCopyInput">
                                    <option value="not_submitted">Not Submitted</option>
                                    <option value="submitted_to_office">Submitted to Office</option>
                                    <option value="confirmed_by_office">Confirmed by Office</option>
                                </select>
                            </label>
                            <div class="admin-repayment-decision-buttons">
                                <button type="button" class="app-btn-outline" id="adminRepaymentVerifyPartial">Verify Partial</button>
                                <button type="button" class="app-btn-primary" id="adminRepaymentVerifyFull">Verify Fully</button>
                                <button type="button" class="app-btn-outline" id="adminRepaymentNeedsCorrection">Needs Correction</button>
                                <button type="button" class="app-btn-danger" id="adminRepaymentReject">Reject</button>
                            </div>
                        </div>
                    </div>
                </section>
            </div>

            <footer class="admin-repayment-modal__footer">
                <button type="button" class="app-btn-outline" id="adminRepaymentClose">Close</button>
            </footer>
        </div>
    </div>
</section>
