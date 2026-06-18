<?php
/**
 * SMART LEAP FILE GUIDE
 * Service layer for C er ti fi ca te Se rv ic e.
 * Contains the business rules, workflow orchestration, and data-shaping logic for this SMART LEAP feature area.
 */

declare(strict_types=1);

namespace App\Services;

class CertificateService
{
    public function stateForDashboard(array $user, ?array $profile, array $training, array $postApproval): array
    {
        $recipientName = trim((string) ($user['name'] ?? 'SMART LEAP Participant'));
        $invitees = array_values(array_filter($training['invitees'] ?? [], static fn ($invitee) => is_array($invitee)));
        $trainingTotal = count($invitees);
        $trainingCompleted = 0;
        $trainingEligible = $trainingTotal > 0;

        foreach ($invitees as $invitee) {
            $status = strtolower((string) ($invitee['status'] ?? ''));
            if (!in_array($status, ['attended', 'completed'], true)) {
                $trainingEligible = false;
                continue;
            }
            $trainingCompleted++;
        }

        $interactiveTasks = array_values(array_filter(
            $postApproval['tasks'] ?? [],
            static fn ($task) => is_array($task)
                && !empty($task['interactive'])
                && (string) ($task['code'] ?? '') !== POST_APPROVAL_TASK_SEMINAR_ATTENDANCE
        ));

        $postApprovalTotal = count($interactiveTasks);
        $postApprovalVerified = 0;
        $postApprovalEligible = $postApprovalTotal > 0;

        foreach ($interactiveTasks as $task) {
            $status = strtolower((string) ($task['status'] ?? ''));
            if ($status !== 'verified') {
                $postApprovalEligible = false;
                continue;
            }
            $postApprovalVerified++;
        }

        $latestInvitee = $this->resolveLatestInvitee($invitees);
        $issueDate = $this->resolveIssueDate($latestInvitee);
        $venue = trim((string) ($latestInvitee['program']['venue'] ?? ''));
        $eligible = $trainingEligible && $postApprovalEligible;

        return [
            'eligible' => $eligible,
            'statusLabel' => $eligible ? 'Ready for download' : 'Locked',
            'note' => $this->buildCertificateNote($trainingEligible, $postApprovalEligible, $trainingTotal, $postApprovalTotal),
            'recipientName' => $recipientName,
            'trainingEligible' => $trainingEligible,
            'trainingTotal' => $trainingTotal,
            'trainingCompleted' => $trainingCompleted,
            'postApprovalEligible' => $postApprovalEligible,
            'postApprovalTotal' => $postApprovalTotal,
            'postApprovalVerified' => $postApprovalVerified,
            'issueDate' => $issueDate?->format('Y-m-d'),
            'issueDateLabel' => $issueDate ? $this->formatIssueDate($issueDate) : '--',
            'venue' => $venue !== '' ? $venue : 'Butuan City',
            'downloadPath' => $eligible ? 'applicant-dashboard/certificate/download' : null,
            'fileName' => $this->buildFileName($recipientName),
        ];
    }

    public function generatePdf(array $certificateState): array
    {
        if (!($certificateState['eligible'] ?? false)) {
            throw new \RuntimeException('Certificate is not available yet.');
        }

        $cacheDir = storage_path('cache/certificates');
        if (!is_dir($cacheDir) && !mkdir($cacheDir, 0775, true) && !is_dir($cacheDir)) {
            throw new \RuntimeException('Unable to prepare certificate cache directory.');
        }

        $hash = sha1(json_encode([
            'recipientName' => $certificateState['recipientName'] ?? '',
            'issueDate' => $certificateState['issueDate'] ?? '',
            'venue' => $certificateState['venue'] ?? '',
        ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));

        $baseName = preg_replace('/[^a-z0-9\-]+/i', '-', (string) ($certificateState['fileName'] ?? 'smart-leap-certificate'));
        $baseName = trim((string) $baseName, '-');
        $baseName = $baseName !== '' ? $baseName : 'smart-leap-certificate';

        $jpgPath = $cacheDir . '/' . $baseName . '-' . $hash . '.jpg';
        $pdfPath = $cacheDir . '/' . $baseName . '-' . $hash . '.pdf';

        if (!is_file($jpgPath)) {
            $this->generateCertificateImage($certificateState, $jpgPath);
        }

        if (!is_file($pdfPath)) {
            $pdfBytes = $this->buildPdfFromJpeg($jpgPath);
            file_put_contents($pdfPath, $pdfBytes);
        }

        return [
            'fileName' => $baseName . '.pdf',
            'mimeType' => 'application/pdf',
            'contents' => (string) file_get_contents($pdfPath),
        ];
    }

    private function generateCertificateImage(array $certificateState, string $outputPath): void
    {
        $scriptPath = base_path('scripts/generate-certificate-image.ps1');
        if (!is_file($scriptPath)) {
            throw new \RuntimeException('Certificate generator script was not found.');
        }

        $command = [
            'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe',
            '-NoProfile',
            '-ExecutionPolicy',
            'Bypass',
            '-File',
            $scriptPath,
            '-OutputPath',
            $outputPath,
            '-RecipientName',
            (string) ($certificateState['recipientName'] ?? 'SMART LEAP Participant'),
            '-IssueDateText',
            (string) ($certificateState['issueDateLabel'] ?? '--'),
            '-VenueText',
            (string) ($certificateState['venue'] ?? 'Butuan City'),
            '-AssetsRoot',
            base_path(),
        ];

        $escaped = array_map(static fn (string $part): string => escapeshellarg($part), $command);
        $commandLine = implode(' ', $escaped);

        $descriptors = [
            0 => ['pipe', 'r'],
            1 => ['pipe', 'w'],
            2 => ['pipe', 'w'],
        ];

        $process = proc_open($commandLine, $descriptors, $pipes, base_path());
        if (!is_resource($process)) {
            throw new \RuntimeException('Unable to start certificate generator.');
        }

        fclose($pipes[0]);
        $stdout = stream_get_contents($pipes[1]);
        fclose($pipes[1]);
        $stderr = stream_get_contents($pipes[2]);
        fclose($pipes[2]);

        $exitCode = proc_close($process);
        if ($exitCode !== 0 || !is_file($outputPath)) {
            write_app_log('certificate.generator', 'Certificate image generation failed.', [
                'exitCode' => $exitCode,
                'stdout' => $stdout,
                'stderr' => $stderr,
                'outputPath' => $outputPath,
            ]);
            throw new \RuntimeException('Unable to generate the certificate image.');
        }
    }

    private function buildPdfFromJpeg(string $jpegPath): string
    {
        $bytes = file_get_contents($jpegPath);
        if ($bytes === false) {
            throw new \RuntimeException('Unable to read generated certificate image.');
        }

        $size = @getimagesize($jpegPath);
        if (!is_array($size) || count($size) < 2) {
            throw new \RuntimeException('Unable to inspect generated certificate image.');
        }

        [$pixelWidth, $pixelHeight] = $size;
        $pageWidth = 841.89;
        $pageHeight = 595.28;
        $content = sprintf("q\n%.2F 0 0 %.2F 0 0 cm\n/Im0 Do\nQ\n", $pageWidth, $pageHeight);

        $objects = [];
        $objects[] = "<< /Type /Catalog /Pages 2 0 R >>";
        $objects[] = "<< /Type /Pages /Count 1 /Kids [3 0 R] >>";
        $objects[] = sprintf(
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 %.2F %.2F] /Resources << /ProcSet [/PDF /ImageC] /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>",
            $pageWidth,
            $pageHeight
        );
        $objects[] = sprintf(
            "<< /Type /XObject /Subtype /Image /Width %d /Height %d /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length %d >>\nstream\n%s\nendstream",
            $pixelWidth,
            $pixelHeight,
            strlen($bytes),
            $bytes
        );
        $objects[] = sprintf("<< /Length %d >>\nstream\n%sendstream", strlen($content), $content);

        $pdf = "%PDF-1.4\n";
        $offsets = [0];
        foreach ($objects as $index => $object) {
            $offsets[] = strlen($pdf);
            $pdf .= ($index + 1) . " 0 obj\n" . $object . "\nendobj\n";
        }

        $xrefPosition = strlen($pdf);
        $pdf .= "xref\n0 " . (count($objects) + 1) . "\n";
        $pdf .= "0000000000 65535 f \n";
        for ($i = 1; $i <= count($objects); $i++) {
            $pdf .= sprintf("%010d 00000 n \n", $offsets[$i]);
        }
        $pdf .= "trailer\n<< /Size " . (count($objects) + 1) . " /Root 1 0 R >>\n";
        $pdf .= "startxref\n" . $xrefPosition . "\n%%EOF";

        return $pdf;
    }

    private function resolveLatestInvitee(array $invitees): ?array
    {
        $latest = null;
        $latestTimestamp = 0;

        foreach ($invitees as $invitee) {
            $timestamp = 0;
            foreach ([
                $invitee['program']['endsAt'] ?? null,
                $invitee['checkedInAt'] ?? null,
                $invitee['program']['startsAt'] ?? null,
            ] as $candidate) {
                $value = strtotime((string) $candidate);
                if ($value !== false && $value > $timestamp) {
                    $timestamp = $value;
                }
            }

            if ($timestamp >= $latestTimestamp) {
                $latestTimestamp = $timestamp;
                $latest = $invitee;
            }
        }

        return $latest;
    }

    private function resolveIssueDate(?array $latestInvitee): ?\DateTimeImmutable
    {
        if ($latestInvitee === null) {
            return null;
        }

        foreach ([
            $latestInvitee['program']['endsAt'] ?? null,
            $latestInvitee['checkedInAt'] ?? null,
            $latestInvitee['program']['startsAt'] ?? null,
        ] as $candidate) {
            if (!$candidate) {
                continue;
            }

            try {
                return new \DateTimeImmutable((string) $candidate);
            } catch (\Throwable) {
                continue;
            }
        }

        return null;
    }

    private function buildCertificateNote(bool $trainingEligible, bool $postApprovalEligible, int $trainingTotal, int $postApprovalTotal): string
    {
        if ($trainingTotal === 0) {
            return 'Wait for a completed training record before your certificate can be issued.';
        }

        if (!$trainingEligible) {
            return 'Finish all assigned trainings and attendance requirements first.';
        }

        if ($postApprovalTotal === 0) {
            return 'All required application requirements must be completed before the certificate is released.';
        }

        if (!$postApprovalEligible) {
            return 'All required application requirements must be verified before your certificate becomes available.';
        }

        return 'Your certificate of completion is ready for download.';
    }

    private function formatIssueDate(\DateTimeImmutable $date): string
    {
        $day = (int) $date->format('j');
        return sprintf('%s day of %s %s', $this->ordinal($day), $date->format('F'), $date->format('Y'));
    }

    private function ordinal(int $number): string
    {
        $suffix = 'th';
        if (($number % 100) < 11 || ($number % 100) > 13) {
            $suffix = match ($number % 10) {
                1 => 'st',
                2 => 'nd',
                3 => 'rd',
                default => 'th',
            };
        }

        return $number . $suffix;
    }

    private function buildFileName(string $recipientName): string
    {
        $safeName = trim(preg_replace('/[^a-z0-9]+/i', '-', strtolower($recipientName)) ?? '', '-');
        if ($safeName === '') {
            $safeName = 'participant';
        }

        return 'smart-leap-certificate-' . $safeName;
    }
}
