<section id="validation-section" class="admin-section" data-role-section hidden>
    <div class="validation-shell">
        <section class="section-header admin-layout-header validation-header">
            <div class="validation-header__copy">
                <!-- This pill marks the workspace as the public Stage 1 intake queue. -->
                <span class="admin-inline-pill">Stage 1 Intake</span>
                <span class="admin-inline-pill admin-inline-pill--primary" id="validationActiveBatchPill">Batch 3</span>
            </div>
            <div class="validation-header__actions">
                <select id="validationCohortFilter" class="filter-select" style="min-width: 140px; height: 38px; border-radius: 6px; font-size: 13px;">
                    <option value="">Active Batch</option>
                </select>
                <!-- Manage and switch active intake batch -->
                <button type="button" class="app-btn-outline" id="batchSwitchButton">
                    <i class="fas fa-layer-group"></i> Manage Batch <span class="admin-inline-pill" id="batchSwitchButtonBadge" style="margin-left: 6px;">Batch 3</span>
                </button>
                <!-- Manual refresh for the Stage 1 registrant queues and counters. -->
                <button type="button" class="app-btn-outline" id="validationRefreshButton">Refresh</button>
            </div>
        </section>

        <!-- KPI cards summarize how many Stage 1 registrants are pending, selected, or deferred. -->
        <div class="metric-grid metric-grid--compact validation-metrics">
            <article class="metric-card metric-card--soft">
                <div class="metric-card__body">
                    <span class="metric-card__label">Pending Validation</span>
                    <strong class="metric-card__value" id="validationPendingCount">0</strong>
                </div>
            </article>
            <article class="metric-card metric-card--soft">
                <div class="metric-card__body">
                    <span class="metric-card__label" id="validationSelectedBatchLabel">Selected for Batch 3</span>
                    <strong class="metric-card__value" id="validationApprovedCount">0</strong>
                    <span class="metric-card__meta" id="validationEmailFailureMeta">0 failed notices</span>
                </div>
            </article>
            <article class="metric-card metric-card--soft">
                <div class="metric-card__body">
                    <span class="metric-card__label" id="validationSavedBatchLabel">Saved for Batch 4</span>
                    <strong class="metric-card__value" id="validationDeferredCount">0</strong>
                </div>
            </article>
        </div>

        <!-- JS shows this notice area for validation errors, success messages, or queue warnings. -->
        <div class="notice info validation-notice" id="validationNotice" hidden></div>

        <!-- Tabs split Stage 1 registrants into pending review, accepted for the active batch, and deferred for the next batch. -->
        <div class="validation-tabs" role="tablist" aria-label="Validation queues">
            <button type="button" class="validation-tab is-active" id="validationTabPending" data-validation-tab="pending" role="tab" aria-selected="true">Pending <span id="validationTabPendingCount">0</span></button>
            <button type="button" class="validation-tab" id="validationTabDup" data-validation-tab="possibleDuplicates" role="tab" aria-selected="false">Possible Duplicates <span id="validationTabDupCount">0</span></button>
            <button type="button" class="validation-tab" id="validationTabMarked" data-validation-tab="markedDuplicates" role="tab" aria-selected="false">Marked Duplicates <span id="validationTabMarkedCount">0</span></button>
            <button type="button" class="validation-tab" id="validationTabSelected" data-validation-tab="selected" role="tab" aria-selected="false">Selected <span id="validationTabSelectedCount">0</span></button>
            <button type="button" class="validation-tab" id="validationTabSaved" data-validation-tab="saved" role="tab" aria-selected="false">Saved <span id="validationTabSavedCount">0</span></button>
        </div>

        <div class="validation-grid">
            <!-- Pending rows — excludes marked duplicates -->
            <section class="table-card validation-table-card" data-validation-panel="pending">
                <div class="validation-table-card__head">
                    <h3>Pending</h3>
                    <span class="admin-inline-pill" id="validationPendingBadge">0 pending</span>
                </div>
                <div class="table-wrapper">
                    <table class="data-table validation-table">
                        <thead>
                            <tr>
                                <th>Registrant</th>
                                <th>Complete Address</th>
                                <th>Contact</th>
                                <th>Email</th>
                                <th>Submitted</th>
                                <th class="actions">Action</th>
                            </tr>
                        </thead>
                        <tbody id="validationPendingTableBody">
                            <tr><td colspan="6">No pending Stage 1 registrations yet.</td></tr>
                        </tbody>
                    </table>
                </div>
            </section>

            <!-- Possible duplicates panel -->
            <section class="table-card validation-table-card" data-validation-panel="possibleDuplicates" hidden>
                <div class="validation-table-card__head">
                    <h3>Possible Duplicates</h3>
                    <span class="admin-inline-pill admin-inline-pill--warning" id="validationDupBadge">0 possible duplicates</span>
                </div>
                <div class="table-wrapper">
                    <table class="data-table validation-table">
                        <thead>
                            <tr>
                                <th>Registrant</th>
                                <th>Complete Address</th>
                                <th>Contact</th>
                                <th>Email</th>
                                <th>Submitted</th>
                                <th class="actions">Action</th>
                            </tr>
                        </thead>
                        <tbody id="validationDupTableBody">
                            <tr><td colspan="6">No possible duplicates detected.</td></tr>
                        </tbody>
                    </table>
                </div>
            </section>

            <!-- Marked duplicates panel -->
            <section class="table-card validation-table-card" data-validation-panel="markedDuplicates" hidden>
                <div class="validation-table-card__head">
                    <h3>Marked Duplicates</h3>
                    <span class="admin-inline-pill" id="validationMarkedBadge">0 marked</span>
                </div>
                <div class="table-wrapper">
                    <table class="data-table validation-table">
                        <thead>
                            <tr>
                                <th>Registrant</th>
                                <th>Complete Address</th>
                                <th>Contact</th>
                                <th>Email</th>
                                <th>Submitted</th>
                                <th class="actions">Action</th>
                            </tr>
                        </thead>
                        <tbody id="validationMarkedTableBody">
                            <tr><td colspan="6">No marked duplicates yet.</td></tr>
                        </tbody>
                    </table>
                </div>
            </section>

            <section class="table-card validation-table-card" data-validation-panel="selected" hidden>
                <div class="validation-table-card__head">
                    <h3>Selected</h3>
                    <div class="validation-table-card__badges">
                        <span class="admin-inline-pill" id="validationSelectedBadge">0 selected</span>
                        <span class="admin-inline-pill admin-inline-pill--warning" id="validationSelectedEmailBadge" hidden>0 need resend</span>
                    </div>
                </div>
                <div class="table-wrapper">
                    <table class="data-table validation-table">
                        <thead>
                            <tr>
                                <th>Registrant</th>
                                <th>Complete Address</th>
                                <th>Contact</th>
                                <th>Email</th>
                                <th>Validated</th>
                                <th>Approval Email</th>
                                <th class="actions">Action</th>
                            </tr>
                        </thead>
                        <tbody id="validationApprovedTableBody">
                            <tr><td colspan="7">No selected Stage 1 registrants yet.</td></tr>
                        </tbody>
                    </table>
                </div>
            </section>

            <section class="table-card validation-table-card" data-validation-panel="saved" hidden>
                <div class="validation-table-card__head">
                    <h3>Saved for Next Batch</h3>
                    <span class="admin-inline-pill" id="validationDeferredBadge">0 saved</span>
                </div>
                <div class="table-wrapper">
                    <table class="data-table validation-table">
                        <thead>
                            <tr>
                                <th>Registrant</th>
                                <th>Complete Address</th>
                                <th>Contact</th>
                                <th>Email</th>
                                <th>Validated</th>
                                <th class="actions">Action</th>
                            </tr>
                        </thead>
                        <tbody id="validationDeferredTableBody">
                            <tr><td colspan="6">No deferred Stage 1 registrants yet.</td></tr>
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    </div>

    <!-- Modal for Managing and Switching Intake Batches -->
    <div class="modal-overlay admin-batch-modal" id="batchSwitchModal" hidden>
        <div class="modal-card admin-batch-modal__card" role="dialog" aria-modal="true" aria-labelledby="batchModalTitle">
            <div class="modal-header">
                <div class="po-modal-title-block">
                    <span class="po-modal-eyebrow"><i class="fas fa-layer-group mr-1"></i> Intake Cohort</span>
                    <h3 class="modal-title" id="batchModalTitle">Manage Intake Batch</h3>
                </div>
                <button class="modal-close" type="button" data-batch-modal-close aria-label="Close">&times;</button>
            </div>
            <div class="modal-body admin-batch-modal__body">
                <div class="notice info" id="batchModalFeedback" hidden></div>

                <div class="batch-status-banner">
                    <div class="batch-status-banner__item">
                        <span class="batch-status-banner__label">Current Active Cohort</span>
                        <strong class="batch-status-banner__value" id="batchModalActiveName">Batch 3</strong>
                    </div>
                    <div class="batch-status-banner__item">
                        <span class="batch-status-banner__label">Waitlisted Applicants</span>
                        <strong class="batch-status-banner__value" id="batchModalWaitlistCount">0 applicants</strong>
                    </div>
                </div>

                <div class="batch-field-group">
                    <label for="batchModalTargetSelect" class="batch-field-label">
                        Select Active Intake Batch:
                    </label>
                    <select id="batchModalTargetSelect" class="batch-select">
                        <!-- Populated dynamically via JS -->
                    </select>
                </div>

                <div class="batch-explanation-box" id="batchModalExplanation">
                    <i class="fas fa-info-circle"></i>
                    <span id="batchModalExplanationText">Batch 3 is currently active. Public Stage 1 registrations and intake processes are assigned to Batch 3.</span>
                </div>
            </div>
            <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 10px;">
                <button type="button" class="app-btn-outline" data-batch-modal-close>Cancel</button>
                <button type="button" class="btn btn-primary" id="confirmSwitchBatchBtn">
                    <i class="fas fa-check mr-1"></i> <span id="batchModalBtnText">Keep Batch 3</span>
                </button>
            </div>
        </div>
    </div>
</section>
