function renderDashboardRecentActivity() {
    const list = document.getElementById('dashboard-activity-list');
    if (!list) return;

    const roster = getDashboardFilteredRoster();
    const events = [];

    roster.slice(0, 6).forEach((b, index) => {
        events.push({
            icon: 'fas fa-user-check',
            message: `${escapeHtml(b.name || 'Beneficiary')} profile reviewed`,
            time: `${index + 1}h ago`
        });
    });

    roster.flatMap((b) => b.repayments || []).slice(0, 4).forEach((p, index) => {
        events.push({
            icon: 'fas fa-receipt',
            message: `Receipt logged for ${escapeHtml(p.month || p.dueFor || 'repayment')}`,
            time: `${index + 2}h ago`
        });
    });

    list.innerHTML = events.slice(0, 10).map((item) => `
        <li class="activity-item">
            <span class="activity-icon"><i class="${item.icon}"></i></span>
            <div>
                <div>${item.message}</div>
                <div class="activity-time">${item.time}</div>
            </div>
        </li>`).join('') || '<li class="muted">No activity yet.</li>';
}
