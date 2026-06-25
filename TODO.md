- [ ] Add backend metrics needed for admin donut to reflect applicants+beneficiaries totals and training attendance.
- [ ] Update `DashboardMetricsService` to compute:
  - applicants count (10)
  - beneficiaries count (4)
  - total (14)
  - training attendance counts based on `attendance_records`
- [ ] Update admin dashboard section / JS chart hydration to use new metrics.
- [ ] Add/adjust admin report training attendance data source so it’s not missing.
- [ ] Test by comparing dashboard donut values against actual known dataset (10 applicants, 4 beneficiaries, 14 total) and ensure attendance section shows expected rows.

