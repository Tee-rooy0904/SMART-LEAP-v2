<section id="dashboard-section" class="admin-section admin-v1-dashboard" data-role-section>
    <div class="admin-live-status" id="adminLiveStatusMessage" hidden></div>

    <section class="admin-v1-kpi-strip admin-v1-kpi-strip--summary">
        <article class="admin-v1-kpi-card admin-v1-kpi-card--applications">
            <div class="admin-v1-kpi-card__eyebrow">Applications</div>
            <div class="admin-v1-kpi-card__body">
                <div class="admin-v1-kpi-card__copy">
                    <strong class="admin-v1-kpi-card__value" id="adminKpiTotalApplications"><?= (int) ($applicationSummary['total'] ?? 0) ?></strong>
                </div>
                <span class="admin-v1-kpi-card__icon" aria-hidden="true"><i class="fas fa-folder-open"></i></span>
            </div>
        </article>
        <article class="admin-v1-kpi-card admin-v1-kpi-card--repayments">
            <div class="admin-v1-kpi-card__eyebrow">Repayments</div>
            <div class="admin-v1-kpi-card__body">
                <div class="admin-v1-kpi-card__copy">
                    <strong class="admin-v1-kpi-card__value" id="adminKpiPendingRepayments"><?= (int) (($repaymentSummary['fullyPaid'] ?? $repaymentSummary['fully_paid'] ?? 0) + ($repaymentSummary['partialPaid'] ?? $repaymentSummary['partial_paid'] ?? 0) + ($repaymentSummary['underReview'] ?? $repaymentSummary['under_review'] ?? 0) + ($repaymentSummary['needsCorrection'] ?? $repaymentSummary['needs_correction'] ?? 0)) ?></strong>
                </div>
                <span class="admin-v1-kpi-card__icon" aria-hidden="true"><i class="fas fa-receipt"></i></span>
            </div>
        </article>
        <article class="admin-v1-kpi-card admin-v1-kpi-card--staff">
            <div class="admin-v1-kpi-card__eyebrow">Staffs</div>
            <div class="admin-v1-kpi-card__body">
                <div class="admin-v1-kpi-card__copy">
                    <strong class="admin-v1-kpi-card__value" id="adminKpiActiveStaff"><?= (int) (($staffSummary['socialWorker'] ?? $staffSummary['socialWorkers'] ?? $staffSummary['social_worker'] ?? 0) + ($staffSummary['pdo'] ?? $staffSummary['projectOfficer'] ?? $staffSummary['project_officer'] ?? 0)) ?></strong>
                    <span class="admin-v1-kpi-card__meta" id="adminKpiActiveStaffMeta">SW <?= (int) ($staffSummary['socialWorker'] ?? $staffSummary['socialWorkers'] ?? $staffSummary['social_worker'] ?? 0) ?> | PDO <?= (int) ($staffSummary['pdo'] ?? $staffSummary['projectOfficer'] ?? $staffSummary['project_officer'] ?? 0) ?></span>
                </div>
                <span class="admin-v1-kpi-card__icon" aria-hidden="true"><i class="fas fa-user-tie"></i></span>
            </div>
        </article>
        <article class="admin-v1-kpi-card admin-v1-kpi-card--beneficiaries">
            <div class="admin-v1-kpi-card__eyebrow">Beneficiaries</div>
            <div class="admin-v1-kpi-card__body">
                <div class="admin-v1-kpi-card__copy">
                    <strong class="admin-v1-kpi-card__value" id="adminKpiActiveBeneficiaries"><?= (int) ($beneficiarySummary['total'] ?? $beneficiarySummary['active'] ?? 0) ?></strong>
                </div>
                <span class="admin-v1-kpi-card__icon" aria-hidden="true"><i class="fas fa-users"></i></span>
            </div>
        </article>
    </section>

    <div class="admin-v1-graph-row admin-v1-graph-row--analytics">
        <section class="admin-v1-panel admin-v1-panel--graph">
            <div class="admin-v1-panel__title-row"><h2>Beneficiaries by Status</h2></div>
            <div class="admin-v1-workflow-chart" id="adminBeneficiaryStatusChart" data-beneficiary-status='<?= htmlspecialchars(json_encode($overview['beneficiaryStatusDistribution'] ?? ['segments' => [], 'total' => 0], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), ENT_QUOTES) ?>'></div>
            <div class="admin-v1-legend admin-v1-legend--workflow" id="adminBeneficiaryStatusLegend"></div>
            <div class="admin-v1-panel__footer" id="adminBeneficiaryStatusFooter">No beneficiary records yet.</div>
        </section>

        <section class="admin-v1-panel admin-v1-panel--graph">
            <div class="admin-v1-panel__title-row"><h2>Repayment Verification Rate</h2></div>
            <div class="admin-v1-repayment-chart" id="adminRepaymentDistributionChart" data-repayment='<?= htmlspecialchars(json_encode($repaymentDistribution, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), ENT_QUOTES) ?>'></div>
            <div class="admin-v1-legend admin-v1-legend--repayment" id="adminRepaymentLegend"></div>
            <div class="admin-v1-panel__footer" id="adminRepaymentFooter">No repayment records yet.</div>
        </section>
    </div>
</section>
