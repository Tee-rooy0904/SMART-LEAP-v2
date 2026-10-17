<?php
declare(strict_types=1);

namespace App\Services;

class RateLimiterService
{
    private string $storageDir;

    public function __construct()
    {
        $this->storageDir = storage_path('rate_limits');
        if (!is_dir($this->storageDir)) {
            mkdir($this->storageDir, 0775, true);
        }
    }

    public function tooManyAttempts(string $key, int $maxAttempts, int $decaySeconds = 900): bool
    {
        return $this->attempts($key, $decaySeconds) >= $maxAttempts;
    }

    public function hit(string $key, int $decaySeconds = 900): int
    {
        $now = time();
        $filePath = $this->filePath($key);
        $attempts = $this->getValidAttempts($filePath, $decaySeconds, $now);
        $attempts[] = $now;

        @file_put_contents($filePath, json_encode($attempts), LOCK_EX);

        return count($attempts);
    }

    public function attempts(string $key, int $decaySeconds = 900): int
    {
        $now = time();
        $filePath = $this->filePath($key);
        $attempts = $this->getValidAttempts($filePath, $decaySeconds, $now);

        return count($attempts);
    }

    public function availableIn(string $key, int $decaySeconds = 900): int
    {
        $now = time();
        $filePath = $this->filePath($key);
        $attempts = $this->getValidAttempts($filePath, $decaySeconds, $now);
        if ($attempts === []) {
            return 0;
        }

        $oldest = min($attempts);
        $diff = ($oldest + $decaySeconds) - $now;

        return max(1, $diff);
    }

    public function clear(string $key): void
    {
        $filePath = $this->filePath($key);
        if (is_file($filePath)) {
            @unlink($filePath);
        }
    }

    private function filePath(string $key): string
    {
        return $this->storageDir . DIRECTORY_SEPARATOR . 'rl_' . sha1($key) . '.json';
    }

    /**
     * @return int[]
     */
    private function getValidAttempts(string $filePath, int $decaySeconds, int $now): array
    {
        if (!is_file($filePath)) {
            return [];
        }

        $raw = @file_get_contents($filePath);
        if ($raw === false || $raw === '') {
            return [];
        }

        $data = json_decode($raw, true);
        if (!is_array($data)) {
            return [];
        }

        $cutoff = $now - $decaySeconds;
        $valid = array_values(array_filter($data, static fn ($ts): bool => is_int($ts) && $ts > $cutoff));

        if (count($valid) !== count($data)) {
            if ($valid === []) {
                @unlink($filePath);
            } else {
                @file_put_contents($filePath, json_encode($valid), LOCK_EX);
            }
        }

        return $valid;
    }
}

