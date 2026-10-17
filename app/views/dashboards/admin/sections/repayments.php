<section id="repayments-section" class="admin-section" data-role-section hidden>
    <div class="admin-repayments-page">
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
                    <div class="applications-search-box">
                        <i class="fas fa-search applications-search-box__icon"></i>
                        <input type="search" class="filter-select applications-search-box__input" id="adminRepaymentSearch" placeholder="Search beneficiary, business, or OR number">
                        <button type="button" id="adminRepaymentSearchClear" class="applications-search-box__clear" title="Clear search" style="display:none;">✕</button>
                    </div>
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
                        <option value="needs_correction">Return for Update</option>
                        <option value="rejected">Marked Invalid</option>
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
                    <button type="button" class="admin-repayment-modal__close" id="adminRepaymentModalClose" data-repayment-modal-close aria-label="Close repayment review modal">&times;</button>
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

                <!-- History is the primary repayment checking surface; staff opens a row action for proof and decision details. -->
                <section class="admin-repayment-panel">
                    <header class="admin-repayment-panel__header">
                        <div>
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
                                    <th>Submission Status</th>
                                    <th>Verification Result</th>
                                    <th>Reviewer</th>
                                    <th>Remarks</th>
                                    <th>Date Reviewed</th>
                                    <th>Action</th>
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

                <div class="admin-repayment-record-modal" id="adminRepaymentRecordModal" aria-hidden="true">
                    <div class="admin-repayment-record-modal__backdrop" data-repayment-record-close></div>
                    <div class="admin-repayment-record-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="adminRepaymentBeneficiaryName">
                        <header class="admin-repayment-record-modal__header">
                            <div>
                                <span class="admin-section-label">Repayment Review</span>
                                <h4 id="adminRepaymentBeneficiaryName">Beneficiary</h4>
                            </div>
                            <button type="button" class="admin-repayment-modal__close" id="adminRepaymentRecordClose" data-repayment-record-close aria-label="Close repayment record review">&times;</button>
                        </header>
                        <div class="admin-repayment-record-modal__body">
                            <section class="admin-repayment-modal__top" id="adminRepaymentReviewDetail">
                                <article class="admin-repayment-panel admin-repayment-panel--proof">
                                    <header class="admin-repayment-panel__header">
                                        <div>
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
                                        <button type="button" class="app-btn-outline" id="adminRepaymentOpenProof">Open file</button>
                                        <button type="button" class="app-btn-outline" id="adminRepaymentDownloadProof">Download file</button>
                                        <button type="button" class="app-btn-outline" id="adminRepaymentFullscreenProof">Fullscreen</button>
                                    </div>
                                </article>

                                <div class="admin-repayment-modal__details">
                                    <article class="admin-repayment-panel">
                                        <header class="admin-repayment-panel__header">
                                            <div>
                                                <span class="admin-section-label">Beneficiary Summary</span>
                                                <h4>Account Details</h4>
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
                                        </div>
                                        <div class="admin-repayment-warning is-hidden" id="adminRepaymentDuplicateWarning"></div>
                                    </article>
                                </div>
                            </section>

                            <section class="admin-repayment-panel admin-repayment-panel--decision">
                                <header class="admin-repayment-panel__header">
                                    <div>
                                        <span class="admin-section-label">Review Decision</span>
                                        <h4>Decision Actions</h4>
                                    </div>
                                </header>
                                <div class="admin-repayment-decision-grid" id="adminRepaymentDecisionGrid">
                                    <label class="filter-group admin-repayment-remarks-group" id="adminRepaymentRemarksGroup">
                                        <span class="filter-label">Remarks</span>
                                        <textarea class="filter-select admin-repayment-remarks" id="adminRepaymentRemarks" rows="5" placeholder="Record review findings, return notes, or why the receipt is invalid."></textarea>
                                    </label>
                                    <div class="admin-repayment-decision-actions">
                                        <p class="admin-repayment-decision-note" id="adminRepaymentDecisionNote">Open a beneficiary repayment record to review proof and apply a decision.</p>
                                        <p class="admin-repayment-decision-guide" id="adminRepaymentDecisionGuide">Use <strong>Return for Update</strong> for fixable issues. Use <strong>Marked Invalid</strong> when the receipt itself should not be accepted, such as a duplicate OR, wrong month, or unreadable proof.</p>
                                        <div class="admin-repayment-decision-cards" id="adminRepaymentDecisionCards">
                                            <button type="button" class="repayment-decision-card" data-decision="approved">
                                                <span class="repayment-decision-card__icon">&check;</span>
                                                <span class="repayment-decision-card__label">Approve</span>
                                                <span class="repayment-decision-card__desc">Verify the repayment record</span>
                                            </button>
                                            <button type="button" class="repayment-decision-card" data-decision="approved_with_confirmed">
                                                <span class="repayment-decision-card__icon">&check; &#x1F4CB;</span>
                                                <span class="repayment-decision-card__label">Approve &amp; Confirm Receipt</span>
                                                <span class="repayment-decision-card__desc">Verify + confirm physical OR received</span>
                                            </button>
                                            <button type="button" class="repayment-decision-card" data-decision="needs_correction">
                                                <span class="repayment-decision-card__icon">&equals;</span>
                                                <span class="repayment-decision-card__label">Return for Update</span>
                                                <span class="repayment-decision-card__desc">Fixable issue; beneficiary can submit a corrected receipt</span>
                                            </button>
                                            <button type="button" class="repayment-decision-card" data-decision="rejected">
                                                <span class="repayment-decision-card__icon">&times;</span>
                                                <span class="repayment-decision-card__label">Mark Invalid</span>
                                                <span class="repayment-decision-card__desc">Receipt cannot be accepted as valid proof (remarks required)</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </section>
                            <section class="admin-repayment-panel">
                                <header class="admin-repayment-panel__header">
                                    <div>
                                        <span class="admin-section-label">Physical OR</span>
                                        <h4>Office Receipt Status</h4>
                                    </div>
                                </header>
                                <div class="admin-repayment-hardcopy-summary">
                                    <span class="admin-repayment-hardcopy-label">Current status</span>
                                    <strong class="admin-repayment-hardcopy-current" id="adminRepaymentHardCopyStatus">Not tracked</strong>
                                    <p class="admin-repayment-hardcopy-note">For confirmed physical ORs, use <strong>Approve &amp; Confirm Receipt</strong> in the decision actions above.</p>
                                </div>
                            </section>
                        </div>
                    </div>
                </div>
            </div>

            <footer class="admin-repayment-modal__footer">
                <button type="button" class="app-btn-outline" id="adminRepaymentClose">Close</button>
            </footer>
        </div>
    </div>
</section>
