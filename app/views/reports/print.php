<?php /** @var string $baseUrl */ ?>
<?php /** @var array|null $authUser */ ?>
<?php /** @var array $report */ ?>
<?php /** @var array $filters */ ?>
<?php /** @var bool $autoPrint */ ?>
<?php
$assetBase = rtrim((string) ($baseUrl ?? ''), '/');
$e = static fn(mixed $value): string => htmlspecialchars((string) $value, ENT_QUOTES);
$generatedAt = (string) ($report['generatedAt'] ?? date(DATE_ATOM));
$periodLabel = (string) (($report['filters']['periodLabel'] ?? $filters['period'] ?? '') ?: 'Selected period');
$repaymentMetrics = $report['repaymentAnalytics']['periodMetrics'] ?? ($report['summary']['repaymentPerformance'] ?? []);
$adminReportsCssVersion = @filemtime(base_path('public/assets/css/dashboards/admin-reports.css')) ?: time();
$reportPayload = json_encode($report, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
$distributionColor = static function (mixed $label, int $index = 0): string {
    $palette = ['#2563eb', '#16a34a', '#f97316', '#dc2626', '#7c3aed', '#0891b2', '#eab308', '#be185d', '#475569', '#65a30d'];
    $map = [
        'male' => '#2563eb',
        'female' => '#16a34a',
        'none' => '#2563eb',
        'solo parent' => '#16a34a',
        'other - lgbtq' => '#f97316',
        'other-lgbtq' => '#f97316',
        'livestock' => '#2563eb',
        'buy and sell' => '#16a34a',
        'buy & sell' => '#16a34a',
        'establishment' => '#f97316',
        'food and beverages' => '#dc2626',
        'production' => '#7c3aed',
        'microenterprise' => '#0891b2',
        'micro enterprise' => '#0891b2',
        'paluwagan' => '#eab308',
        'services' => '#eab308',
    ];
    $key = strtolower(trim((string) $label));
    return $map[$key] ?? $palette[$index % count($palette)];
};
$tintColor = static function (string $hex, float $alpha = 0.10): string {
    $value = ltrim(trim($hex), '#');
    if (strlen($value) !== 6) {
        return 'rgba(37, 99, 235, ' . $alpha . ')';
    }
    $red = hexdec(substr($value, 0, 2));
    $green = hexdec(substr($value, 2, 2));
    $blue = hexdec(substr($value, 4, 2));
    return sprintf('rgba(%d, %d, %d, %.2F)', $red, $green, $blue, $alpha);
};
$renderDistributionFallback = static function (array $rows, string $label) use ($e, $distributionColor): string {
    $total = array_reduce($rows, static fn(float $sum, array $row): float => $sum + (float) ($row['count'] ?? 0), 0.0);
    if ($rows === [] || $total <= 0) {
        return '<p class="reports-empty">No data available.</p>';
    }

    $polar = static function (float $cx, float $cy, float $radius, float $angle): array {
        $radians = (($angle - 90) * pi()) / 180;
        return [
            'x' => $cx + ($radius * cos($radians)),
            'y' => $cy + ($radius * sin($radians)),
        ];
    };
    $arcPath = static function (float $cx, float $cy, float $outerRadius, float $innerRadius, float $startAngle, float $endAngle) use ($polar): string {
        $outerStart = $polar($cx, $cy, $outerRadius, $endAngle);
        $outerEnd = $polar($cx, $cy, $outerRadius, $startAngle);
        $innerStart = $polar($cx, $cy, $innerRadius, $startAngle);
        $innerEnd = $polar($cx, $cy, $innerRadius, $endAngle);
        $largeArcFlag = ($endAngle - $startAngle) <= 180 ? '0' : '1';
        return sprintf(
            'M %.2F %.2F A %.2F %.2F 0 %s 0 %.2F %.2F L %.2F %.2F A %.2F %.2F 0 %s 1 %.2F %.2F Z',
            $outerStart['x'],
            $outerStart['y'],
            $outerRadius,
            $outerRadius,
            $largeArcFlag,
            $outerEnd['x'],
            $outerEnd['y'],
            $innerStart['x'],
            $innerStart['y'],
            $innerRadius,
            $innerRadius,
            $largeArcFlag,
            $innerEnd['x'],
            $innerEnd['y']
        );
    };

    $cx = 160.0;
    $cy = 160.0;
    $outerRadius = 122.0;
    $innerRadius = 66.0;
    $labelRadius = $innerRadius + (($outerRadius - $innerRadius) / 2);
    $runningAngle = 0.0;
    $paths = '';
    $labels = '';
    $legend = '';

    foreach ($rows as $index => $row) {
        $count = (float) ($row['count'] ?? 0);
        $percentage = $total > 0 ? ($count / $total) * 100 : 0;
        $sweepAngle = $total > 0 ? ($count / $total) * 360 : 0;
        $startAngle = $runningAngle;
        $drawSweepAngle = min($sweepAngle, 359.99);
        $endAngle = $runningAngle + $drawSweepAngle;
        $runningAngle += $sweepAngle;
        $midAngle = $startAngle + (($endAngle - $startAngle) / 2);
        $point = $polar($cx, $cy, $labelRadius, $midAngle);
        $color = $distributionColor($row['label'] ?? '', $index);
        $percentLabel = number_format($percentage, 1);
        $share = $endAngle - $startAngle;
        $countFont = $share <= 34 ? 13 : 16;
        $percentFont = $share <= 34 ? 10.5 : 12.5;
        $dyOffset = 9;

        $paths .= '<path d="' . $e($arcPath($cx, $cy, $outerRadius, $innerRadius, $startAngle, $endAngle)) . '" fill="' . $e($color) . '"></path>';
        $labels .= '<text class="reports-donut__slice-label" x="' . $e(number_format($point['x'], 2, '.', '')) . '" y="' . $e(number_format($point['y'], 2, '.', '')) . '" fill="#ffffff">'
            . '<tspan class="reports-donut__slice-count" x="' . $e(number_format($point['x'], 2, '.', '')) . '" dy="-' . $dyOffset . '" style="font-size:' . $countFont . 'px;">' . $e((string) (int) $count) . '</tspan>'
            . '<tspan class="reports-donut__slice-percent" x="' . $e(number_format($point['x'], 2, '.', '')) . '" dy="' . ($dyOffset + 12) . '" style="font-size:' . $percentFont . 'px;">' . $e($percentLabel) . '%</tspan>'
            . '</text>';
        $legend .= '<div class="reports-donut__legend-row">'
            . '<span class="reports-donut__legend-swatch" style="--legend-color:' . $e($color) . ';"></span>'
            . '<span class="reports-donut__legend-label">' . $e($row['label'] ?? '') . '</span>'
            . '<strong class="reports-donut__legend-count">' . $e((string) (int) $count) . '</strong>'
            . '<span class="reports-donut__legend-percent">' . $e($percentLabel) . '%</span>'
            . '</div>';
    }

    return '<div class="reports-donut reports-donut--print" role="img" aria-label="' . $e($label) . '">'
        . '<div class="reports-donut__chart-shell"><svg class="reports-donut__svg" viewBox="0 0 320 320" aria-hidden="true">'
        . '<circle class="reports-donut__track" cx="160" cy="160" r="122"></circle>' . $paths . $labels
        . '</svg></div><div class="reports-donut__legend">' . $legend . '</div></div>';
};
$summary = $report['summary'] ?? [];
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SMART LEAP Report Graph Export</title>
    <link rel="stylesheet" href="<?= $e($assetBase) ?>/assets/css/dashboards/admin-reports.css?v=<?= urlencode((string) $adminReportsCssVersion) ?>">
    <style>
        :root {
            --page-width: 216mm;
            --page-height: 330mm;
            --ink: #102347;
        }
        * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }
        html,
        body {
            width: var(--page-width);
            min-height: var(--page-height);
        }
        body {
            margin: 0;
            padding: 0;
            font-family: Arial, Helvetica, sans-serif;
            color: var(--ink);
            background: #ffffff;
        }
        .print-shell {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 0;
        }
        .sheet {
            width: var(--page-width);
            min-height: var(--page-height);
            height: var(--page-height);
            position: relative;
            background: #ffffff;
            overflow: hidden;
            break-after: page;
            page-break-after: always;
        }
        .sheet:last-child {
            break-after: auto;
            page-break-after: auto;
        }
        .standard-header-wrap,
        .standard-footer-wrap {
            position: relative;
            width: 100%;
            overflow: hidden;
        }
        .standard-header,
        .standard-footer {
            display: block;
            width: 100%;
            height: auto;
            margin: 0;
        }
        .standard-header {
            width: calc(100% + 12px);
            margin-left: -12px;
        }
        .standard-footer {
            width: calc(100% + 14px);
            margin-left: -14px;
        }
        .standard-footer-wrap {
            position: absolute;
            left: 0;
            right: 0;
            bottom: 0;
        }
        .report-body {
            padding: 8mm 9mm 36mm;
            min-height: 250mm;
        }
        .report-heading {
            text-align: center;
            margin: 10px 0 12px;
        }
        .report-heading h1 {
            margin: 0 0 4px;
            font-size: 17px;
            font-weight: 900;
            text-transform: uppercase;
            color: #0f172a;
        }
        .report-heading p {
            margin: 0;
            font-size: 12px;
            font-weight: 800;
            text-transform: uppercase;
            color: #102347;
        }
        .report-meta {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 8px;
            margin-bottom: 14px;
        }
        .report-meta article {
            min-height: 52px;
            padding: 8px 10px;
            border: 1px solid rgba(148, 163, 184, 0.3);
            background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 252, 255, 0.96));
        }
        .report-meta span {
            display: block;
            margin-bottom: 3px;
            color: #526b8f;
            font-size: 9px;
            font-weight: 900;
            letter-spacing: 0.08em;
            text-transform: uppercase;
        }
        .report-meta strong {
            color: #102347;
            font-size: 12px;
            font-weight: 800;
        }
        .content-main.report-print-main {
            padding: 0;
            background: transparent;
        }
        #reports-section.report-print-section {
            display: block;
        }
        .content-main #reports-section.report-print-section .charts-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 12px;
        }
        .content-main #reports-section.report-print-section .chart-card {
            border-radius: 0;
            box-shadow: none;
            break-inside: avoid;
            page-break-inside: avoid;
        }
        .content-main #reports-section.report-print-section .chart-card__header {
            margin-bottom: 10px;
        }
        .content-main #reports-section.report-print-section .chart-card__header h4 {
            font-size: 1rem;
        }
        .content-main #reports-section.report-print-section .chart-card--full {
            grid-column: 1 / -1;
        }
        .content-main #reports-section.report-print-section .reports-repayment-status-kpis {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 10px;
            margin-bottom: 12px;
        }
        .content-main #reports-section.report-print-section .reports-repayment-status-kpi {
            min-height: 112px;
            padding: 10px 12px;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            border-radius: 0;
        }
        .content-main #reports-section.report-print-section .reports-repayment-status-kpi strong {
            font-size: 1.15rem;
            line-height: 1.05;
        }
        .content-main #reports-section.report-print-section .reports-repayment-status-kpi small {
            line-height: 1.2;
        }
        .content-main #reports-section.report-print-section .reports-monthly-payment-chart-wrap {
            min-height: 365px;
        }
        .chart-wrap.medium {
            min-height: 255px;
        }
        .report-distribution-grid {
            display: grid;
            grid-template-columns: 1fr;
            gap: 14px;
        }
        .report-print-section .chart-card--distribution {
            min-height: 242px;
            padding: 18px 20px;
            page-break-inside: avoid;
            break-inside: avoid;
        }
        .reports-svg-chart {
            width: 100%;
        }
        .reports-svg-chart svg {
            width: 100%;
            height: auto;
            display: block;
        }
        .reports-svg-chart__legend {
            display: flex;
            gap: 12px;
            flex-wrap: wrap;
            justify-content: center;
            margin-top: 8px;
            color: #102347;
            font-size: 0.74rem;
            font-weight: 700;
        }
        .reports-svg-chart__legend span {
            display: inline-flex;
            align-items: center;
            gap: 6px;
        }
        .reports-svg-chart__legend i {
            width: 10px;
            height: 10px;
            border-radius: 999px;
            display: inline-block;
        }
        .reports-svg-chart__x-title {
            margin-top: 6px;
            text-align: center;
            color: #526b8f;
            font-size: 0.74rem;
            font-weight: 800;
            letter-spacing: 0.08em;
            text-transform: uppercase;
        }
        .reports-empty {
            margin: 0;
            color: #64748b;
            font-size: 0.86rem;
        }
        .report-print-section .reports-pie-chart {
            min-height: 182px;
            display: flex;
            flex-direction: row;
            align-items: center;
            justify-content: center;
            gap: 18px;
            width: fit-content;
            max-width: 100%;
            margin: 0 auto;
            padding: 4px 0;
        }
        .report-print-section .reports-pie-chart__graphic {
            width: 188px;
            height: 188px;
            flex: none;
        }
        .report-print-section .reports-pie-chart__graphic svg {
            width: 100%;
            height: 100%;
            display: block;
        }
        .report-print-section .reports-pie-chart__legend {
            width: auto;
            min-width: 220px;
            max-width: 310px;
            display: grid;
            gap: 7px;
            font-size: 0.84rem;
            padding: 0;
            flex: none;
        }
        .report-print-section .reports-pie-chart__legend .reports-pie-chart__legend-item {
            display: grid;
            grid-template-columns: 12px auto auto auto;
            align-items: center;
            column-gap: 8px;
            text-align: left;
            font-weight: 700;
            width: fit-content;
            max-width: 100%;
            justify-content: start;
            padding: 6px 10px;
            border: 1px solid rgba(148, 163, 184, 0.24);
            border-radius: 999px;
            background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(247, 250, 255, 0.92));
        }
        .report-print-section .reports-pie-chart__legend .reports-pie-chart__swatch {
            width: 12px;
            height: 12px;
            min-width: 12px;
            border-radius: 3px;
            display: inline-block;
            box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.08);
            background: var(--swatch-color);
        }
        .report-print-section .reports-pie-chart__legend .reports-pie-chart__legend-label {
            min-width: 0;
            max-width: 160px;
        }
        .report-print-section .reports-pie-chart__legend .reports-pie-chart__legend-item strong {
            font-weight: 800;
            color: #102347;
            text-align: right;
            min-width: 20px;
        }
        .report-print-section .reports-pie-chart__legend .reports-pie-chart__legend-item small {
            min-width: 42px;
            text-align: right;
            color: #526b8f;
            font-weight: 800;
        }
        .report-print-section .reports-pie-chart__legend .reports-pie-chart__empty {
            margin: 0;
            color: #64748b;
            font-size: 0.82rem;
            font-weight: 700;
        }
        .report-print-section .reports-donut {
            grid-template-columns: minmax(0, 1fr) minmax(170px, 220px);
            gap: 14px;
            min-height: 206px;
        }
        .report-print-section .reports-donut__chart-shell {
            min-height: 206px;
        }
        .report-print-section .reports-donut__svg {
            width: min(100%, 218px);
        }
        .report-print-section .reports-donut__legend {
            gap: 7px;
        }
        .report-print-section .reports-donut__legend-row {
            border-radius: 0;
            padding: 6px 8px;
            grid-template-columns: 14px minmax(0, 1fr) minmax(18px, auto) minmax(44px, auto);
            gap: 7px;
        }
        .report-print-section .reports-donut__legend-label,
        .report-print-section .reports-donut__legend-count,
        .report-print-section .reports-donut__legend-percent {
            font-size: 0.74rem;
        }
        .report-print-section .chart-card--distribution .chart-wrap.medium {
            min-height: 0;
        }
        .report-print-section .chart-card--distribution .chart-card__header {
            margin-bottom: 8px;
        }
        .report-page-subtitle {
            margin: 0 0 10px;
            color: #37537e;
            font-size: 11px;
            font-weight: 800;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            text-align: center;
        }
        @page {
            size: 8.5in 13in portrait;
            margin: 0;
        }
        @media print {
            html,
            body {
                width: 216mm;
                min-height: 330mm;
                height: 330mm;
                margin: 0 !important;
            }
            body {
                background: #ffffff;
                padding: 0;
            }
            .sheet {
                width: 216mm;
                min-height: 330mm;
                height: 330mm;
                box-shadow: none;
            }
            .standard-footer-wrap {
                position: fixed;
                left: 0;
                right: 0;
                bottom: 0;
            }
        }
    </style>
</head>
<body>
    <script>
        window.SMARTLEAP_REPORT_DATA = <?= $reportPayload ?: '{}' ?>;
        window.SMARTLEAP_REPORT_AUTOPRINT = <?= !empty($autoPrint) ? 'true' : 'false' ?>;
    </script>
    <main class="print-shell">
        <section class="sheet">
            <div class="standard-header-wrap">
                <img class="standard-header" src="<?= $e($assetBase) ?>/assets/img/report-header-2026.jpg" alt="City Government of Butuan report header">
            </div>

            <div class="report-body">
                <div class="report-heading">
                    <h1>SMART LEAP REPORT GRAPHS</h1>
                    <p>City Social Welfare and Development Department</p>
                </div>

                <section class="report-meta" aria-label="Report metadata">
                    <article>
                        <span>Generated</span>
                        <strong><?= $e(date('M j, Y g:i A', strtotime($generatedAt) ?: time())) ?></strong>
                    </article>
                    <article>
                        <span>Prepared By</span>
                        <strong><?= $e($authUser['name'] ?? 'SMART LEAP') ?></strong>
                    </article>
                    <article>
                        <span>Period</span>
                        <strong><?= $e($periodLabel) ?></strong>
                    </article>
                    <article>
                        <span>ROI</span>
                        <strong><?= $e(number_format((float) ($repaymentMetrics['roiPercent'] ?? 0), 2)) ?>%</strong>
                    </article>
                </section>

                <div class="content-main report-print-main">
                    <section id="reports-section" class="report-print-section">
                        <div class="charts-grid">
                            <div class="chart-card chart-card--full">
                                <div class="chart-card__header">
                                    <div>
                                        <h4>Repayment Performance</h4>
                                    </div>
                                </div>
                                <div class="reports-repayment-status-kpis" id="report-print-kpis"></div>
                                <div class="chart-wrap reports-monthly-payment-chart-wrap" id="reports-performance-bars"></div>
                            </div>
                        </div>
                    </section>
                </div>
            </div>

            <div class="standard-footer-wrap">
                <img class="standard-footer" src="<?= $e($assetBase) ?>/assets/img/report-footer-2026.jpg" alt="City Government of Butuan report footer">
            </div>
        </section>

        <section class="sheet">
            <div class="standard-header-wrap">
                <img class="standard-header" src="<?= $e($assetBase) ?>/assets/img/report-header-2026.jpg" alt="City Government of Butuan report header">
            </div>

            <div class="report-body">
                <div class="report-heading">
                    <h1>SMART LEAP REPORT GRAPHS</h1>
                    <p>City Social Welfare and Development Department</p>
                </div>
                <p class="report-page-subtitle">Distribution Summaries</p>

                <div class="content-main report-print-main">
                    <section class="report-print-section">
                        <div class="report-distribution-grid">
                            <div class="chart-card chart-card--distribution">
                                <div class="chart-card__header">
                                    <h4>Gender Segregation</h4>
                                </div>
                                <div class="chart-wrap medium" id="reports-gender-donut"><?= $renderDistributionFallback($summary['genderDistribution'] ?? [], 'Gender distribution donut chart') ?></div>
                            </div>

                            <div class="chart-card chart-card--distribution">
                                <div class="chart-card__header">
                                    <h4>Service Type Distribution</h4>
                                </div>
                                <div class="chart-wrap medium" id="reports-service-donut"><?= $renderDistributionFallback($summary['serviceTypeDistribution'] ?? [], 'Service type distribution donut chart') ?></div>
                            </div>

                            <div class="chart-card chart-card--distribution">
                                <div class="chart-card__header">
                                    <h4>Sector Distribution</h4>
                                </div>
                                <div class="chart-wrap medium" id="reports-sector-donut"><?= $renderDistributionFallback($summary['sectorDistribution'] ?? [], 'Sector distribution donut chart') ?></div>
                            </div>
                        </div>
                    </section>
                </div>
            </div>

            <div class="standard-footer-wrap">
                <img class="standard-footer" src="<?= $e($assetBase) ?>/assets/img/report-footer-2026.jpg" alt="City Government of Butuan report footer">
            </div>
        </section>
    </main>

    <script>
        (function () {
            const report = window.SMARTLEAP_REPORT_DATA || {};
            const chartPalette = ['#2563eb', '#16a34a', '#f97316', '#dc2626', '#7c3aed', '#0891b2', '#eab308', '#be185d', '#475569', '#65a30d'];
            const qs = (selector, root = document) => root.querySelector(selector);
            const escapeHtml = (value) => String(value ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
            const formatCurrency = (value) => `PHP ${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            const formatPercent = (value) => `${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`;
            const tintColor = (hex, alpha = 0.12) => {
                const value = String(hex || '').replace('#', '').trim();
                if (value.length !== 6) {
                    return `rgba(37, 99, 235, ${alpha})`;
                }
                const red = Number.parseInt(value.slice(0, 2), 16);
                const green = Number.parseInt(value.slice(2, 4), 16);
                const blue = Number.parseInt(value.slice(4, 6), 16);
                if ([red, green, blue].some((channel) => Number.isNaN(channel))) {
                    return `rgba(37, 99, 235, ${alpha})`;
                }
                return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
            };
            const polar = (cx, cy, r, angleDeg) => {
                const radians = (angleDeg - 90) * Math.PI / 180;
                return {
                    x: cx + (Math.cos(radians) * r),
                    y: cy + (Math.sin(radians) * r),
                };
            };
            const donutArcPath = (cx, cy, outerRadius, innerRadius, startAngle, endAngle) => {
                const outerStart = polar(cx, cy, outerRadius, endAngle);
                const outerEnd = polar(cx, cy, outerRadius, startAngle);
                const innerStart = polar(cx, cy, innerRadius, startAngle);
                const innerEnd = polar(cx, cy, innerRadius, endAngle);
                const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
                return [
                    `M ${outerStart.x} ${outerStart.y}`,
                    `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 0 ${outerEnd.x} ${outerEnd.y}`,
                    `L ${innerStart.x} ${innerStart.y}`,
                    `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 1 ${innerEnd.x} ${innerEnd.y}`,
                    'Z',
                ].join(' ');
            };
            const sliceLabelMarkup = (slice, cx, cy, labelRadius, ringThickness) => {
                const midAngle = slice.startAngle + ((slice.endAngle - slice.startAngle) / 2);
                const point = polar(cx, cy, labelRadius, midAngle);
                const share = slice.endAngle - slice.startAngle;
                const countFontSize = share <= 34 ? 13 : 16;
                const percentFontSize = share <= 34 ? 10.5 : 12.5;
                const dyOffset = Math.min(10, Math.max(7, ringThickness * 0.16));
                return `
                    <text class="reports-donut__slice-label" x="${point.x.toFixed(2)}" y="${point.y.toFixed(2)}" fill="#ffffff">
                        <tspan class="reports-donut__slice-count" x="${point.x.toFixed(2)}" dy="-${dyOffset}" style="font-size:${countFontSize}px;">${escapeHtml(String(slice.count))}</tspan>
                        <tspan class="reports-donut__slice-percent" x="${point.x.toFixed(2)}" dy="${dyOffset + 12}" style="font-size:${percentFontSize}px;">${escapeHtml(String(segmentPercent(slice.percentage)))}</tspan>
                    </text>
                `;
            };
            const segmentPercent = (value) => `${Number(value || 0).toFixed(1)}%`;
            const distributionColor = (label, index = 0) => {
                const normalized = String(label || '').trim().toLowerCase();
                const explicitMap = new Map([
                    ['male', '#2563eb'],
                    ['female', '#16a34a'],
                    ['none', '#2563eb'],
                    ['solo parent', '#16a34a'],
                    ['other - lgbtq', '#f97316'],
                    ['other-lgbtq', '#f97316'],
                    ['livestock', '#2563eb'],
                    ['buy and sell', '#16a34a'],
                    ['buy & sell', '#16a34a'],
                    ['establishment', '#f97316'],
                    ['food and beverages', '#dc2626'],
                    ['production', '#7c3aed'],
                    ['microenterprise', '#0891b2'],
                    ['micro enterprise', '#0891b2'],
                    ['paluwagan', '#eab308'],
                    ['services', '#eab308'],
                ]);
                return explicitMap.get(normalized) || chartPalette[index % chartPalette.length];
            };

            const setHtml = (selector, html) => {
                const node = qs(selector);
                if (node) {
                    node.innerHTML = html;
                }
            };

            const renderKpis = (metrics, itemCount) => {
                const cards = [
                    { label: 'Target Amount', value: formatCurrency(metrics.targetAmount || 0), meta: metrics.label || 'Selected period', color: '#2563eb' },
                    { label: 'Actual Collected', value: formatCurrency(metrics.actualCollectedAmount || 0), meta: `${metrics.scopedBeneficiaries || itemCount || 0} scoped beneficiaries`, color: '#16a34a' },
                    { label: 'Gap', value: formatCurrency(metrics.gapAmount || 0), meta: `${metrics.obligationCount || 0} repayment months covered`, color: '#dc2626' },
                    { label: 'ROI', value: formatPercent(metrics.roiPercent || 0), meta: 'Actual / target x 100', color: '#7c3aed' },
                ];
                setHtml('#report-print-kpis', cards.map((card) => `
                    <article class="reports-repayment-status-kpi" style="--kpi-color:${card.color}">
                        <span>${escapeHtml(card.label)}</span>
                        <strong>${escapeHtml(card.value)}</strong>
                        <small>${escapeHtml(card.meta)}</small>
                    </article>
                `).join(''));
            };

            const renderDonut = (root, rows, options = {}) => {
                if (!root) return;
                const total = rows.reduce((sum, row) => sum + Number(row.count || 0), 0);
                if (!rows.length || total <= 0) {
                    root.innerHTML = '<p class="reports-empty">No data available.</p>';
                    return;
                }

                const cx = 160;
                const cy = 160;
                const outerRadius = 122;
                const innerRadius = 66;
                const ringThickness = outerRadius - innerRadius;
                const labelRadius = innerRadius + (ringThickness / 2);
                let runningAngle = 0;
                const segments = rows.map((row, index) => {
                    const count = Number(row.count || 0);
                    const percentage = total > 0 ? (count / total) * 100 : 0;
                    const sweepAngle = total > 0 ? (count / total) * 360 : 0;
                    const startAngle = runningAngle;
                    const drawSweepAngle = Math.min(sweepAngle, 359.99);
                    const endAngle = runningAngle + drawSweepAngle;
                    runningAngle += sweepAngle;
                    const stroke = distributionColor(row.label, index);
                    return {
                        stroke,
                        count,
                        percentage,
                        row,
                        startAngle,
                        endAngle,
                        path: donutArcPath(cx, cy, outerRadius, innerRadius, startAngle, endAngle),
                    };
                });

                root.innerHTML = `
                    <div class="reports-donut reports-donut--print" role="img" aria-label="${escapeHtml(options.label || 'Distribution donut chart')}">
                        <div class="reports-donut__chart-shell">
                            <svg class="reports-donut__svg" viewBox="0 0 320 320" aria-hidden="true">
                                <circle class="reports-donut__track" cx="${cx}" cy="${cy}" r="${outerRadius}"></circle>
                                ${segments.map((segment) => `<path d="${segment.path}" fill="${segment.stroke}"></path>`).join('')}
                                ${segments.map((segment) => sliceLabelMarkup(segment, cx, cy, labelRadius, ringThickness)).join('')}
                            </svg>
                        </div>
                        <div class="reports-donut__legend">
                            ${segments.map((segment) => `
                                <div class="reports-donut__legend-row">
                                    <span class="reports-donut__legend-swatch" style="--legend-color:${segment.stroke};"></span>
                                    <span class="reports-donut__legend-label">${escapeHtml(segment.row.label)}</span>
                                    <strong class="reports-donut__legend-count">${escapeHtml(String(segment.count))}</strong>
                                    <span class="reports-donut__legend-percent">${escapeHtml(segmentPercent(segment.percentage))}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            };
            const renderPaymentChart = (root, rows, period = 'monthly') => {
                if (!root) return;
                if (!rows.length) {
                    root.innerHTML = '<p class="reports-empty">No repayment records yet.</p>';
                    return;
                }

                const niceAxisStep = (rawMax) => {
                    const safeMax = Math.max(Number(rawMax) || 0, 1);
                    const roughStep = safeMax / 5;
                    const magnitude = 10 ** Math.floor(Math.log10(roughStep || 1));
                    const normalized = roughStep / magnitude;
                    let niceNormalized = 1;
                    if (normalized <= 1) niceNormalized = 1;
                    else if (normalized <= 2) niceNormalized = 2;
                    else if (normalized <= 2.5) niceNormalized = 2.5;
                    else if (normalized <= 5) niceNormalized = 5;
                    else niceNormalized = 10;
                    return niceNormalized * magnitude;
                };

                const series = [
                    { key: 'targetAmount', label: 'Target', color: '#2563eb' },
                    { key: 'actualCollectedAmount', label: 'Actual', color: '#16a34a' },
                    { key: 'gapAmount', label: 'Gap', color: '#dc2626' },
                ];
                const rawMax = Math.max(...rows.flatMap((row) => series.map((item) => Number(row[item.key] || 0))), 1);
                const step = niceAxisStep(rawMax);
                const maxValue = Math.max(step, Math.ceil(rawMax / step) * step);
                const formatBarValue = (value) => {
                    const amount = Number(value || 0);
                    if (!Number.isFinite(amount)) return '0';
                    if (Math.abs(amount) >= 1000000) {
                        return `${(amount / 1000000).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}M`;
                    }
                    if (Math.abs(amount) >= 1000) {
                        return `${(amount / 1000).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}K`;
                    }
                    return amount.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
                };
                const xAxisTitle = period === 'quarterly' ? 'Quarters' : period === 'yearly' ? 'Years' : 'Months';
                const shortenLabel = (row) => {
                    const label = String(row.label || row.period || '').toUpperCase();
                    if (period === 'monthly') {
                        return label.split(' ')[0] || label;
                    }
                    return label;
                };
                const ticks = [];
                for (let value = maxValue; value >= 0; value -= step) {
                    ticks.push(value);
                }

                const buildPlot = (plotRows, config) => {
                    const plotLeft = 88;
                    const plotTop = config.top;
                    const plotWidth = 860;
                    const plotHeight = config.height;
                    const groupWidth = plotWidth / Math.max(plotRows.length, 1);
                    const isMonthly = period === 'monthly';
                    const barWidth = isMonthly
                        ? Math.min(24, Math.max(13, (groupWidth - 72) / 3))
                        : Math.min(26, Math.max(11, (groupWidth - 44) / 3));
                    const barGap = isMonthly
                        ? Math.max(22, Math.min(30, (groupWidth - (barWidth * 3)) / 4))
                        : Math.max(14, Math.min(22, (groupWidth - (barWidth * 3)) / 4));

                    const gridLines = ticks.map((value, index) => {
                        const y = plotTop + (plotHeight / Math.max(ticks.length - 1, 1)) * index;
                        return `
                            <line x1="${plotLeft}" y1="${y}" x2="${plotLeft + plotWidth}" y2="${y}" stroke="#d7e2ef" stroke-width="1" />
                            <text x="${plotLeft - 12}" y="${y + 4}" text-anchor="end" font-size="11" font-weight="700" fill="#526b8f">${escapeHtml(Number(value).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}</text>
                        `;
                    }).join('');

                    const groups = plotRows.map((row, rowIndex) => {
                        const groupStart = plotLeft + (groupWidth * rowIndex);
                        const clusterWidth = (barWidth * 3) + (barGap * 2);
                        const clusterOffset = Math.max((groupWidth - clusterWidth) / 2, 0);
                        const bars = series.map((item, seriesIndex) => {
                            const value = Number(row[item.key] || 0);
                            const height = maxValue > 0 ? (value / maxValue) * plotHeight : 0;
                            const x = groupStart + clusterOffset + (seriesIndex * (barWidth + barGap));
                            const y = plotTop + plotHeight - height;
                            const monthStagger = isMonthly ? (rowIndex % 2 === 0 ? -4 : 4) : 0;
                            const labelXOffset = isMonthly
                                ? (seriesIndex === 0 ? -2 : seriesIndex === 1 ? 0 : 2)
                                : 0;
                            const labelLift = isMonthly
                                ? (seriesIndex === 0 ? (32 + monthStagger) : seriesIndex === 1 ? (18 + monthStagger) : (14 + monthStagger))
                                : (seriesIndex === 0 ? 42 : seriesIndex === 1 ? 24 : 42);
                            const labelFontSize = isMonthly ? '8' : (period === 'yearly' ? '8.5' : '9');
                            const showLabel = value > 0;
                            return `
                                <rect x="${x}" y="${y}" width="${barWidth}" height="${Math.max(height, value > 0 ? 2 : 0)}" rx="6" ry="6" fill="${item.color}" />
                                ${showLabel ? `<text x="${x + (barWidth / 2) + labelXOffset}" y="${Math.max(y - labelLift, plotTop + 4)}" text-anchor="middle" font-size="${labelFontSize}" font-weight="800" fill="#102347">${escapeHtml(formatBarValue(value))}</text>` : ''}
                            `;
                        }).join('');

                        return `
                            ${bars}
                            <text x="${groupStart + (groupWidth / 2)}" y="${plotTop + plotHeight + 24}" text-anchor="middle" font-size="11" font-weight="800" fill="#102347">${escapeHtml(shortenLabel(row))}</text>
                        `;
                    }).join('');

                    return { gridLines, groups };
                };

                if (period === 'monthly' && rows.length >= 7) {
                    const firstHalf = rows.slice(0, 6);
                    const secondHalf = rows.slice(6, 12);
                    const topPlot = buildPlot(firstHalf, { top: 28, height: 132 });
                    const bottomPlot = buildPlot(secondHalf, { top: 292, height: 132 });

                    root.innerHTML = `
                        <div class="reports-svg-chart" role="img" aria-label="${escapeHtml(`Repayment performance by ${xAxisTitle.toLowerCase()}`)}">
                            <svg viewBox="0 0 980 500" aria-hidden="true">
                                <text x="22" y="94" transform="rotate(-90 22 94)" text-anchor="middle" font-size="12" font-weight="800" fill="#526b8f">PAYMENTS</text>
                                <text x="22" y="358" transform="rotate(-90 22 358)" text-anchor="middle" font-size="12" font-weight="800" fill="#526b8f">PAYMENTS</text>
                                ${topPlot.gridLines}
                                ${topPlot.groups}
                                ${bottomPlot.gridLines}
                                ${bottomPlot.groups}
                            </svg>
                            <div class="reports-svg-chart__legend">
                                ${series.map((item) => `<span><i style="background:${item.color}"></i>${escapeHtml(item.label)}</span>`).join('')}
                            </div>
                            <div class="reports-svg-chart__x-title">${escapeHtml(xAxisTitle)}</div>
                        </div>
                    `;
                    return;
                }

                const singlePlot = buildPlot(rows, { top: period === 'monthly' ? 24 : 42, height: period === 'monthly' ? 255 : 228 });
                root.innerHTML = `
                    <div class="reports-svg-chart" role="img" aria-label="${escapeHtml(`Repayment performance by ${xAxisTitle.toLowerCase()}`)}">
                        <svg viewBox="0 0 980 360" aria-hidden="true">
                            <text x="22" y="${period === 'monthly' ? '168' : '182'}" transform="rotate(-90 22 ${period === 'monthly' ? '168' : '182'})" text-anchor="middle" font-size="12" font-weight="800" fill="#526b8f">PAYMENTS</text>
                            ${singlePlot.gridLines}
                            ${singlePlot.groups}
                        </svg>
                        <div class="reports-svg-chart__legend">
                            ${series.map((item) => `<span><i style="background:${item.color}"></i>${escapeHtml(item.label)}</span>`).join('')}
                        </div>
                        <div class="reports-svg-chart__x-title">${escapeHtml(xAxisTitle)}</div>
                    </div>
                `;
            };

            const render = () => {
                const items = Array.isArray(report.records) ? report.records : [];
                const summary = report.summary || {};
                const metrics = report.repaymentAnalytics?.periodMetrics || summary.repaymentPerformance || {
                    label: report.filters?.periodLabel || 'Selected period',
                    targetAmount: 0,
                    actualCollectedAmount: 0,
                    gapAmount: 0,
                    roiPercent: 0,
                    scopedBeneficiaries: items.length,
                    obligationCount: 0,
                };
                const period = report.filters?.period || 'monthly';
                const repaymentBreakdown = period === 'monthly'
                    ? (Array.isArray(report.repaymentAnalytics?.monthlyBreakdown) ? report.repaymentAnalytics.monthlyBreakdown : [])
                    : (Array.isArray(report.repaymentAnalytics?.breakdown) ? report.repaymentAnalytics.breakdown : []);
                const genderDistribution = Array.isArray(summary.genderDistribution) ? summary.genderDistribution : [];
                const serviceTypeDistribution = Array.isArray(summary.serviceTypeDistribution) ? summary.serviceTypeDistribution : [];
                const sectorDistribution = Array.isArray(summary.sectorDistribution) ? summary.sectorDistribution : [];

                renderKpis(metrics, items.length);
                renderPaymentChart(qs('#reports-performance-bars'), repaymentBreakdown, period);
                renderDonut(qs('#reports-gender-donut'), genderDistribution, {
                    label: 'Gender distribution donut chart',
                    paletteOffset: 0,
                });
                renderDonut(qs('#reports-service-donut'), serviceTypeDistribution, {
                    label: 'Service type distribution donut chart',
                    paletteOffset: 1,
                });
                renderDonut(qs('#reports-sector-donut'), sectorDistribution, {
                    label: 'Sector distribution donut chart',
                    paletteOffset: 4,
                });

                if (window.SMARTLEAP_REPORT_AUTOPRINT) {
                    window.setTimeout(() => window.print(), 150);
                }
            };

            window.addEventListener('load', render);
        })();
    </script>
</body>
</html>
