<?php
declare(strict_types=1);

namespace App\Services;

class PasswordService
{
    public function hash(string $plainText): string
    {
        return password_hash($plainText, PASSWORD_DEFAULT);
    }

    public function verify(string $plainText, string $hash): bool
    {
        return password_verify($plainText, $hash);
    }

    public function validate(string $plainText): ?string
    {
        if (strlen($plainText) < 8) {
            return 'Password must be at least 8 characters long.';
        }

        if (strlen($plainText) > 72) {
            return 'Password cannot exceed 72 characters.';
        }

        return null;
    }
}
