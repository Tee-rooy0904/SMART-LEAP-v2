function renderDashboardActionQueue() {
    const table = document.getElementById('dashboard-queue-table');
    const tabs = document.querySelectorAll('#dashboard-queue-tabs .queue-tab');
    if (!table) return;

    tabs.forEach((btn) => {
        btn.classList.toggle('is-active', btn.dataset.queueTab === dashboardQueueTab);
        btn.addEventListener('click', () => {
            dashboardQueueTab = btn.dataset.queueTab || 'pending';
            renderDashboardActionQueue();
        });
    });

    const roster = getDashboardFilteredRoster();
    const headers = ['Beneficiary', 'Month/Date', 'Amount', 'Status', 'Action'];
    const rows = [];

    if (dashboardQueueTab === 'requirements') {
        roster.forEach((b) => {
            const summary = evaluateRequirements(b.requirements || {});
            summary.missing.forEach((key) => {
                const label = REQUIREMENTS.find((req) => req.key === key)?.label || key;
                rows.push({
                    cols: [
                        escapeHtml(b.name || '--'),
                        escapeHtml(label),
                        '—',
                        '<span class="badge badge--amber">Missing</span>',
                        '<button type="button" class="queue-btn" data-action="review">Review</button>'
                    ]
                });
            });
        });
    } else if (dashboardQueueTab === 'training') {
        const sessions = getUpcomingTrainingSessions();
        sessions.forEach((session) => {
            rows.push({
                cols: [
                    escapeHtml(session.title || session.name || 'Training session'),
                    escapeHtml(session.dateLabel || 'TBD'),
                    '—',
                    '<span class="badge badge--teal">Upcoming</span>',
                    '<button type="button" class="queue-btn" data-action="view">View</button>'
                ]
            });
        });
    } else if (dashboardQueueTab === 'overdue') {
        const overdue = getOverdueRepaymentRows(roster);
        overdue.forEach((row) => rows.push(row));
    } else {
        const pending = getPendingProofRows(roster);
        pending.forEach((row) => rows.push(row));
    }

    const headerRow = headers.map((h) => `<th>${h}</th>`).join('');
    const bodyRows = rows.length
        ? rows.map((row) => `<tr>${row.cols.map((col) => `<td>${col}</td>`).join('')}</tr>`).join('')
        : `<tr><td colspan="5" class="muted">No records found.</td></tr>`;

    table.innerHTML = `
        <div class="queue-table__wrap">
            <table class="queue-table__table">
                <thead><tr>${headerRow}</tr></thead>
                <tbody>${bodyRows}</tbody>
            </table>
        </div>`;
}
