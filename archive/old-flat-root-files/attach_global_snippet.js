function attachGlobalEvents() {
    document.querySelectorAll('.sidebar-nav .nav-link').forEach(link => {
        link.addEventListener('click', event => {
            event.preventDefault();
            renderSection(link.dataset.section || 'dashboard');
            closeSidebarIfMobile();
        });
    });

    window.refreshDashboard = () => {
        renderSection(currentSection);
        showToast('Dashboard refreshed', 'info');
    };

    window.exportDashboard = () => {
        const roster = getDashboardFilteredRoster();
        const applicants = getDashboardFilteredApplicants();
        const summary = {
            totalBeneficiaries: roster.length,
            active: roster.filter((entry) => isActiveBeneficiaryStatus(entry.applicationStatus || entry.status)).length
        };
        summary.inactive = Math.max(summary.totalBeneficiaries - summary.active, 0);
        summary.totalAssistance = roster.reduce((sum, b) => sum + (Number(b.assistanceAmount) || PROGRAM.assistanceTotal), 0);
        summary.avgAssistance = summary.totalBeneficiaries ? Math.round(summary.totalAssistance / summary.totalBeneficiaries) : 0;
        const verifiedPayments = roster.flatMap((b) => (b.repayments || []).filter((payment) => (payment.status || '').toLowerCase() === 'verified'));
        summary.verifiedRepayments = verifiedPayments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
        summary.completionRate = summary.totalBeneficiaries
            ? Math.round(roster.reduce((sum, b) => sum + computeRepaymentProgress(b).progressPct, 0) / summary.totalBeneficiaries)
            : 0;

        const reqSummary = getRequirementsCompletionSummary(roster);
        const trainingSummary = getTrainingCompletionSummary(roster);

        const payload = {
            summary,
            requirements: reqSummary,
            training: trainingSummary,
            applicants
        };

        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'dashboard_export.json';
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    };

    const bundleRefreshBtn = document.querySelector('[data-bundle-refresh]');
    if (bundleRefreshBtn) {
        const frame = document.getElementById('adminBundleFrame');
        bundleRefreshBtn.addEventListener('click', () => {
            if (!frame) { return; }
            const base = (frame.dataset.src || frame.getAttribute('src') || 'forms.html').split('?')[0];
            frame.dataset.src = base;
            frame.src = `${base}?ts=${Date.now()}`;
            showToast('Application bundle refreshed', 'info');
        });
    }
}
