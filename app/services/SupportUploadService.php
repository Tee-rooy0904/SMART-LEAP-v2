<?php
declare(strict_types=1);

namespace App\Services;

class SupportUploadService
{
    private const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'pdf'];
    private const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

    public function store(?array $file): ?array
    {
        if ($file === null || (int) ($file['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
            return null;
        }

        $error = (int) ($file['error'] ?? UPLOAD_ERR_NO_FILE);
        if ($error !== UPLOAD_ERR_OK) {
            throw new \RuntimeException($this->messageForUploadError($error));
        }

        $originalName = (string) ($file['name'] ?? '');
        $extension = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
        if ($extension === '' || !in_array($extension, self::ALLOWED_EXTENSIONS, true)) {
            throw new \RuntimeException('Upload a JPG, PNG, WEBP, or PDF file only.');
        }

        $maxBytes = 5 * 1024 * 1024;
        if ((int) ($file['size'] ?? 0) > $maxBytes) {
            throw new \RuntimeException('Attachment exceeds the 5MB upload limit.');
        }

        $tmpName = (string) ($file['tmp_name'] ?? '');
        if ($tmpName === '' || !is_uploaded_file($tmpName)) {
            throw new \RuntimeException('Attachment upload failed.');
        }

        $mimeType = $this->detectMimeType($tmpName, (string) ($file['type'] ?? ''));
        if (!in_array($mimeType, self::ALLOWED_MIME_TYPES, true)) {
            throw new \RuntimeException('Attachment file type is not allowed.');
        }

        $relativeDir = 'uploads/support/' . date('Y') . '/' . date('m');
        $absoluteDir = public_path($relativeDir);
        if (!is_dir($absoluteDir)) {
            mkdir($absoluteDir, 0775, true);
        }

        $storedName = 'support_' . date('YmdHis') . '_' . bin2hex(random_bytes(8)) . '.' . $extension;
        $absolutePath = $absoluteDir . DIRECTORY_SEPARATOR . $storedName;
        if (!move_uploaded_file($tmpName, $absolutePath)) {
            throw new \RuntimeException('Unable to save attachment.');
        }

        return [
            'original_name' => $originalName !== '' ? $originalName : $storedName,
            'stored_name' => $storedName,
            'file_path' => $relativeDir . '/' . $storedName,
            'mime_type' => $mimeType,
            'file_size' => (int) ($file['size'] ?? 0),
        ];
    }

    private function detectMimeType(string $tmpName, string $clientType): string
    {
        $detected = '';
        if (is_file($tmpName)) {
            $finfo = new \finfo(FILEINFO_MIME_TYPE);
            $detected = strtolower((string) ($finfo->file($tmpName) ?: ''));
        }

        $clientType = strtolower(trim($clientType));
        return $detected !== '' ? $detected : $clientType;
    }

    private function messageForUploadError(int $error): string
    {
        return match ($error) {
            UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE => 'Attachment exceeds the upload limit.',
            UPLOAD_ERR_PARTIAL => 'Attachment upload was interrupted. Please try again.',
            default => 'Attachment upload failed.',
        };
    }
}
