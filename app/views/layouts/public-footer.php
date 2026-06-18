<?php
declare(strict_types=1);

/** @var string $baseUrl */
$publicFooterVariant = isset($publicFooterVariant) ? (string) $publicFooterVariant : 'default';
?>
<footer class="site-footer" aria-label="Footer">
    <?php if ($publicFooterVariant === 'flow'): ?>
        <div class="container footer-grid footer-grid--flow">
            <div class="footer-brand footer-brand--flow">
                <strong>SMART LEAP</strong>
                <p>City Social Welfare and Development Department (CSWDD)</p>
            </div>
            <div class="footer-column footer-column--flow">
                <strong>Contact</strong>
                <a href="mailto:cswdd@butuan.gov.ph">cswdd@butuan.gov.ph</a>
                <a href="tel:+639562241679">0956 224 1679</a>
                <span>J Rosales Avenue, Butuan City, Philippines, 8600</span>
            </div>
            <div class="footer-column footer-column--flow">
                <strong>Privacy and Notice</strong>
                <p>Portal records and personal information are handled under RA 10173, or the Data Privacy Act of 2012.</p>
            </div>
        </div>
    <?php else: ?>
        <div class="container footer-grid">
            <div class="footer-brand">
                <strong>SMART LEAP</strong>
                <p>City Government of Butuan</p>
                <p>City Social Welfare and Development Department (CSWDD)</p>
            </div>
            <div class="footer-column">
                <strong>Portal Pages</strong>
                <a href="<?= $baseUrl ?>/portal">Home</a>
                <a href="<?= $baseUrl ?>/portal/about-smart-leap">About SMART LEAP</a>
                <a href="<?= $baseUrl ?>/portal/requirements">Requirements</a>
                <a href="<?= $baseUrl ?>/portal/how-to-apply">How to Apply</a>
                <a href="<?= $baseUrl ?>/portal/beneficiary-guide">Beneficiary Guide</a>
            </div>
            <div class="footer-column">
                <strong>Contact</strong>
                <a href="mailto:cswdd@butuan.gov.ph">cswdd@butuan.gov.ph</a>
                <a href="tel:+639562241679">0956 224 1679</a>
                <span>J Rosales Avenue, Butuan City, Philippines, 8600</span>
                <span>Office hours: Mon-Fri, 8:00 AM-5:00 PM</span>
            </div>
            <div class="footer-column">
                <strong>Privacy and Notice</strong>
                <p>Portal records and personal information are handled under RA 10173, or the Data Privacy Act of 2012.</p>
            </div>
        </div>
    <?php endif; ?>
</footer>
