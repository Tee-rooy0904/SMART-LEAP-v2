<?php
declare(strict_types=1);

namespace App\Services;

class MailService
{
    public function send(string $to, string $subject, string $html, ?int $userId = null): bool
    {
        $config = config('mail');
        $logLine = sprintf("[%s] TO:%s SUBJECT:%s\n", date('c'), $to, $subject);
        file_put_contents(storage_path('logs/mail.log'), $logLine, FILE_APPEND);

        if (!class_exists(\PHPMailer\PHPMailer\PHPMailer::class) || $config['driver'] === 'log') {
            $this->storeEmailLog($userId, $to, $subject, 'logged', null, null, true);
            return true;
        }

        $lastException = null;

        foreach ($this->candidateMailerConfigs($config) as $variant) {
            try {
                $mailer = $this->buildMailer($variant, $to, $subject, $html);
                $sent = $mailer->send();
                $this->storeEmailLog($userId, $to, $subject, $sent ? 'sent' : 'failed', $mailer->getLastMessageID() ?: null, null, $sent);
                return $sent;
            } catch (\Throwable $exception) {
                $lastException = $exception;
                if ($this->isRetriableMailFailure($exception)) {
                    usleep(350000);
                    continue;
                }
                break;
            }
        }

        if ($lastException instanceof \Throwable) {
            $this->storeEmailLog($userId, $to, $subject, 'failed', null, $lastException->getMessage(), false);
            write_app_log('mail', 'Email delivery failed.', [
                'operation' => 'mail.send',
                'recipient_email' => $to,
                'subject' => $subject,
                'error' => $lastException->getMessage(),
            ]);
        }

        return false;
    }

    private function candidateMailerConfigs(array $config): array
    {
        $variants = [$config];

        if (!$this->isGmailConfig($config)) {
            return $variants;
        }

        $normalizedPassword = preg_replace('/\s+/', '', (string) ($config['password'] ?? ''));
        $originalPassword = (string) ($config['password'] ?? '');

        if ($normalizedPassword !== '' && $normalizedPassword !== $originalPassword) {
            $variants[] = array_merge($config, ['password' => $normalizedPassword]);
        }

        $port = (int) ($config['port'] ?? 587);
        $encryption = strtolower(trim((string) ($config['encryption'] ?? '')));

        if ($port === 587 && ($encryption === '' || $encryption === 'tls' || $encryption === 'starttls')) {
            $sslVariant = array_merge($config, [
                'port' => 465,
                'encryption' => 'ssl',
            ]);
            $variants[] = $sslVariant;

            if ($normalizedPassword !== '' && $normalizedPassword !== $originalPassword) {
                $variants[] = array_merge($sslVariant, ['password' => $normalizedPassword]);
            }
        }

        if ($port === 465 && ($encryption === '' || $encryption === 'ssl' || $encryption === 'smtps')) {
            $tlsVariant = array_merge($config, [
                'port' => 587,
                'encryption' => 'tls',
            ]);
            $variants[] = $tlsVariant;

            if ($normalizedPassword !== '' && $normalizedPassword !== $originalPassword) {
                $variants[] = array_merge($tlsVariant, ['password' => $normalizedPassword]);
            }
        }

        return $this->uniqueMailerConfigs($variants);
    }

    public function sendTrainingNotice(array $user, array $program, array $invitee): bool
    {
        $subject = 'SMART LEAP Training Notice: ' . ($program['programName'] ?? $program['title'] ?? 'Training Session');
        $formattedDate = $this->formatTrainingDate((string) ($program['date'] ?? ''));
        $formattedTimeRange = $this->formatTrainingTimeRange(
            (string) ($program['startTime'] ?? ''),
            (string) ($program['endTime'] ?? '')
        );
        $body = sprintf(
            '<p>Hello %s,</p><p>You have been scheduled for <strong>%s</strong>.</p><p>Venue: %s<br>Date: %s<br>Time: %s</p><p>What to bring: %s</p><p>Instructions: %s</p>',
            htmlspecialchars((string) ($user['name'] ?? 'Applicant'), ENT_QUOTES),
            htmlspecialchars((string) ($program['programName'] ?? $program['title'] ?? 'Training Session'), ENT_QUOTES),
            htmlspecialchars((string) ($program['venue'] ?? 'To be announced'), ENT_QUOTES),
            htmlspecialchars($formattedDate, ENT_QUOTES),
            htmlspecialchars($formattedTimeRange, ENT_QUOTES),
            htmlspecialchars((string) ($program['whatToBring'] ?? 'Bring valid ID and training materials.'), ENT_QUOTES),
            htmlspecialchars((string) ($program['instructions'] ?? ($invitee['remarks'] ?? 'Please arrive 15 minutes early.')), ENT_QUOTES)
        );

        return $this->send((string) ($user['email'] ?? ''), $subject, $body, (int) ($user['id'] ?? 0));
    }

    private function buildMailer(array $config, string $to, string $subject, string $html): \PHPMailer\PHPMailer\PHPMailer
    {
        $host = trim((string) ($config['host'] ?? ''));
        $username = trim((string) ($config['username'] ?? ''));
        $password = trim((string) ($config['password'] ?? ''));
        $fromAddress = trim((string) ($config['from_address'] ?? ''));
        $fromName = trim((string) ($config['from_name'] ?? 'SMART LEAP'));
        $encryption = strtolower(trim((string) ($config['encryption'] ?? '')));

        $mailer = new \PHPMailer\PHPMailer\PHPMailer(true);
        $mailer->isSMTP();
        $mailer->Host = $host;
        $mailer->Port = (int) ($config['port'] ?? 587);
        $mailer->Timeout = 20;
        $mailer->SMTPAuth = $username !== '';
        $mailer->SMTPKeepAlive = false;
        $mailer->SMTPAutoTLS = true;
        $mailer->Username = $username;
        $mailer->Password = $password;
        $mailer->CharSet = 'UTF-8';
        $mailer->Hostname = (string) parse_url((string) config('app.url', 'http://localhost'), PHP_URL_HOST);

        if ($encryption !== '') {
            $mailer->SMTPSecure = match ($encryption) {
                'ssl', 'smtps' => \PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_SMTPS,
                default => \PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_STARTTLS,
            };
        }

        $mailer->setFrom($fromAddress, $fromName);
        $mailer->addAddress(trim($to));
        $mailer->Subject = $subject;
        $mailer->isHTML(true);
        $mailer->Body = $html;

        return $mailer;
    }

    private function isTransientConnectionFailure(\Throwable $exception): bool
    {
        $message = strtolower($exception->getMessage());

        return str_contains($message, 'could not connect to smtp host')
            || str_contains($message, 'failed to connect to server')
            || str_contains($message, 'connection timed out')
            || str_contains($message, 'network is unreachable')
            || str_contains($message, 'connection refused');
    }

    private function isAuthenticationFailure(\Throwable $exception): bool
    {
        $message = strtolower($exception->getMessage());

        return str_contains($message, 'could not authenticate')
            || str_contains($message, 'username and password not accepted')
            || str_contains($message, 'authentication failed');
    }

    private function isRetriableMailFailure(\Throwable $exception): bool
    {
        return $this->isTransientConnectionFailure($exception) || $this->isAuthenticationFailure($exception);
    }

    private function isGmailConfig(array $config): bool
    {
        $host = strtolower(trim((string) ($config['host'] ?? '')));
        $username = strtolower(trim((string) ($config['username'] ?? '')));

        return str_contains($host, 'gmail.com') || str_ends_with($username, '@gmail.com');
    }

    private function uniqueMailerConfigs(array $variants): array
    {
        $unique = [];
        $seen = [];

        foreach ($variants as $variant) {
            $key = implode('|', [
                strtolower(trim((string) ($variant['host'] ?? ''))),
                (string) ((int) ($variant['port'] ?? 0)),
                strtolower(trim((string) ($variant['encryption'] ?? ''))),
                trim((string) ($variant['username'] ?? '')),
                trim((string) ($variant['password'] ?? '')),
            ]);

            if (isset($seen[$key])) {
                continue;
            }

            $seen[$key] = true;
            $unique[] = $variant;
        }

        return $unique;
    }

    private function formatTrainingDate(string $date): string
    {
        $value = trim($date);
        if ($value === '') {
            return '--';
        }

        $timestamp = strtotime($value);
        if ($timestamp === false) {
            return $value;
        }

        return date('F j, Y', $timestamp);
    }

    private function formatTrainingTimeRange(string $startTime, string $endTime): string
    {
        $start = $this->formatTrainingTime($startTime);
        $end = $this->formatTrainingTime($endTime);

        if ($start === '--' && $end === '--') {
            return '--';
        }

        if ($end === '--') {
            return $start;
        }

        if ($start === '--') {
            return $end;
        }

        return $start . ' - ' . $end;
    }

    private function formatTrainingTime(string $time): string
    {
        $value = trim($time);
        if ($value === '') {
            return '--';
        }

        $timestamp = strtotime($value);
        if ($timestamp === false) {
            return $value;
        }

        return date('g:i A', $timestamp);
    }

    private function storeEmailLog(?int $userId, string $recipientEmail, string $subject, string $status, ?string $providerMessageId, ?string $errorMessage, bool $sent): void
    {
        try {
            $statement = db()->prepare(
                'INSERT INTO email_logs (user_id, recipient_email, subject, status, provider_message_id, error_message, sent_at)
                 VALUES (:user_id, :recipient_email, :subject, :status, :provider_message_id, :error_message, :sent_at)'
            );
            $statement->execute([
                'user_id' => $userId,
                'recipient_email' => $recipientEmail,
                'subject' => $subject,
                'status' => $status,
                'provider_message_id' => $providerMessageId,
                'error_message' => $errorMessage,
                'sent_at' => $sent ? date('Y-m-d H:i:s') : null,
            ]);
        } catch (\Throwable $exception) {
            write_app_log('mail', 'Failed to store email log.', [
                'recipient_email' => $recipientEmail,
                'subject' => $subject,
                'error' => $exception->getMessage(),
            ]);
        }
    }
}
