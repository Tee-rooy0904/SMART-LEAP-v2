<?php
declare(strict_types=1);

namespace App\Services;

class UploadService
{
    private const MIME_ALIASES = [
        'image/jpg' => 'image/jpeg',
        'image/pjpeg' => 'image/jpeg',
        'image/x-png' => 'image/png',
        'application/x-pdf' => 'application/pdf',
    ];

    private const REQUIREMENT_PATHS = [
        'validId' => 'valid-id',
        'healthCertificate' => 'health-certificate',
        'cedula' => 'cedula',
        'barangayEndorsementLetter' => 'barangay-endorsement-letter',
    ];

    private const POST_APPROVAL_PATHS = [
        'applicant-signature' => 'signatures/applicant',
        'staff-signature' => 'signatures/staff',
        'supporting-upload' => 'supporting',
    ];

    private const STAGE_ONE_PATHS = [
        'profilePhoto' => 'profile-photo',
        'businessPhoto' => 'business-photo',
        'validIdPhoto' => 'valid-id',
        'hardcopyForm' => 'hardcopy-forms',
    ];

    private const CO_MAKER_PATHS = [
        'validId' => 'co-makers/valid-id',
        'relationshipDocument' => 'co-makers/relationship-document',
    ];

    private const REPAYMENT_PATH = 'repayments';

    public function normalizeDocumentFiles(array $fileBag): array
    {
        $normalized = [];
        if (!isset($fileBag['name']) || !is_array($fileBag['name'])) {
            return $normalized;
        }

        foreach ($fileBag['name'] as $key => $name) {
            if ($name === '' || !isset(self::REQUIREMENT_PATHS[$key])) {
                continue;
            }
            $normalized[$key] = [
                'name' => $name,
                'type' => $fileBag['type'][$key] ?? '',
                'tmp_name' => $fileBag['tmp_name'][$key] ?? '',
                'error' => $fileBag['error'][$key] ?? UPLOAD_ERR_NO_FILE,
                'size' => $fileBag['size'][$key] ?? 0,
            ];
        }

        return $normalized;
    }

    public function storeRequirementDocument(string $key, array $file): array
    {
        if (!isset(self::REQUIREMENT_PATHS[$key])) {
            throw new \RuntimeException('Unsupported requirement type.');
        }

        [$extension, $detectedMimeType] = $this->validateFile($file);

        $relativeDir = 'uploads/initial-requirements/' . self::REQUIREMENT_PATHS[$key];
        $absoluteDir = public_path($relativeDir);
        if (!is_dir($absoluteDir)) {
            mkdir($absoluteDir, 0775, true);
        }

        $targetName = $key . '_' . date('YmdHis') . '_' . bin2hex(random_bytes(8)) . '.' . $extension;
        $absolutePath = $absoluteDir . DIRECTORY_SEPARATOR . $targetName;

        if (!move_uploaded_file((string) $file['tmp_name'], $absolutePath)) {
            throw new \RuntimeException('Unable to move uploaded file.');
        }

        return [
            'file_path' => $relativeDir . '/' . $targetName,
            'original_name' => (string) $file['name'],
            'mime_type' => $detectedMimeType,
            'file_size' => (int) ($file['size'] ?? 0),
        ];
    }

    public function storePostApprovalAsset(string $category, array $file): array
    {
        if (!isset(self::POST_APPROVAL_PATHS[$category])) {
            throw new \RuntimeException('Unsupported post-approval upload type.');
        }

        [$extension, $detectedMimeType] = $this->validateFile($file);

        $baseDir = rtrim((string) config('upload.paths.post_approval'), DIRECTORY_SEPARATOR);
        $relativeDir = 'uploads/post-approval/' . self::POST_APPROVAL_PATHS[$category];
        $absoluteDir = $baseDir . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, self::POST_APPROVAL_PATHS[$category]);
        if (!is_dir($absoluteDir)) {
            mkdir($absoluteDir, 0775, true);
        }

        $targetName = $category . '_' . date('YmdHis') . '_' . bin2hex(random_bytes(8)) . '.' . $extension;
        $absolutePath = $absoluteDir . DIRECTORY_SEPARATOR . $targetName;

        if (!move_uploaded_file((string) $file['tmp_name'], $absolutePath)) {
            throw new \RuntimeException('Unable to move uploaded file.');
        }

        return [
            'file_path' => $relativeDir . '/' . $targetName,
            'original_name' => (string) $file['name'],
            'mime_type' => $detectedMimeType,
            'file_size' => (int) ($file['size'] ?? 0),
            'uploaded_at' => date('Y-m-d H:i:s'),
        ];
    }

    public function storeStageOneAsset(string $category, ?array $file): array
    {
        if ($file === null || !isset(self::STAGE_ONE_PATHS[$category])) {
            throw new \RuntimeException('Unsupported Stage 1 upload type.');
        }

        [$extension, $detectedMimeType] = $this->validateFile($file);
        if ($category === 'businessPhoto' && !str_starts_with($detectedMimeType, 'image/')) {
            throw new \RuntimeException('Business upload must be an image file.');
        }

        $relativeDir = 'uploads/stage-one/' . self::STAGE_ONE_PATHS[$category];
        $absoluteDir = public_path($relativeDir);
        if (!is_dir($absoluteDir)) {
            mkdir($absoluteDir, 0775, true);
        }

        $targetName = $category . '_' . date('YmdHis') . '_' . bin2hex(random_bytes(8)) . '.' . $extension;
        $absolutePath = $absoluteDir . DIRECTORY_SEPARATOR . $targetName;

        if (!move_uploaded_file((string) $file['tmp_name'], $absolutePath)) {
            throw new \RuntimeException('Unable to move uploaded file.');
        }

        return [
            'file_path' => $relativeDir . '/' . $targetName,
            'original_name' => (string) ($file['name'] ?? $targetName),
            'mime_type' => $detectedMimeType,
            'file_size' => (int) ($file['size'] ?? 0),
            'uploaded_at' => date('Y-m-d H:i:s'),
        ];
    }

    public function storeCoMakerAsset(string $category, ?array $file): array
    {
        if ($file === null || !isset(self::CO_MAKER_PATHS[$category])) {
            throw new \RuntimeException('Unsupported co-maker upload type.');
        }

        [$extension, $detectedMimeType] = $this->validateFile($file);

        $relativeDir = 'uploads/' . self::CO_MAKER_PATHS[$category];
        $absoluteDir = public_path($relativeDir);
        if (!is_dir($absoluteDir)) {
            mkdir($absoluteDir, 0775, true);
        }

        $targetName = $category . '_' . date('YmdHis') . '_' . bin2hex(random_bytes(8)) . '.' . $extension;
        $absolutePath = $absoluteDir . DIRECTORY_SEPARATOR . $targetName;

        if (!move_uploaded_file((string) $file['tmp_name'], $absolutePath)) {
            throw new \RuntimeException('Unable to move uploaded file.');
        }

        return [
            'file_path' => $relativeDir . '/' . $targetName,
            'original_name' => (string) ($file['name'] ?? $targetName),
            'mime_type' => $detectedMimeType,
            'file_size' => (int) ($file['size'] ?? 0),
            'uploaded_at' => date('Y-m-d H:i:s'),
        ];
    }

    public function storeRepaymentAssetFromDataUrl(string $originalName, string $dataUrl): array
    {
        $dataUrl = trim($dataUrl);
        if ($dataUrl === '' || !str_starts_with($dataUrl, 'data:') || !str_contains($dataUrl, ';base64,')) {
            throw new \RuntimeException('Repayment proof is invalid.');
        }

        [$meta, $encoded] = explode(',', $dataUrl, 2);
        $mimeType = $this->normalizeMimeType((string) preg_replace('/^data:([^;]+);base64$/', '$1', $meta));
        $allowedMimeTypes = array_map([$this, 'normalizeMimeType'], config('upload.allowed_mime_types', []));
        if ($mimeType === '' || !in_array($mimeType, $allowedMimeTypes, true)) {
            throw new \RuntimeException('Unsupported repayment proof type.');
        }

        $binary = base64_decode($encoded, true);
        if ($binary === false || $binary === '') {
            throw new \RuntimeException('Repayment proof could not be decoded.');
        }

        $maxBytes = (int) config('upload.max_bytes', 0);
        if ($maxBytes > 0 && strlen($binary) > $maxBytes) {
            throw new \RuntimeException('Repayment proof exceeds the upload limit.');
        }

        $extension = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
        if ($extension === '') {
            $extension = match ($mimeType) {
                'image/jpeg' => 'jpg',
                'image/png' => 'png',
                'image/webp' => 'webp',
                'application/pdf' => 'pdf',
                default => '',
            };
        }

        $allowedExtensions = config('upload.allowed_extensions', []);
        if ($extension === '' || !in_array($extension, $allowedExtensions, true)) {
            throw new \RuntimeException('Unsupported repayment proof type.');
        }

        $relativeDir = 'uploads/' . self::REPAYMENT_PATH;
        $absoluteDir = rtrim((string) config('upload.paths.repayments'), DIRECTORY_SEPARATOR);
        if (!is_dir($absoluteDir)) {
            mkdir($absoluteDir, 0775, true);
        }

        $targetName = 'repayment_' . date('YmdHis') . '_' . bin2hex(random_bytes(8)) . '.' . $extension;
        $absolutePath = $absoluteDir . DIRECTORY_SEPARATOR . $targetName;
        if (file_put_contents($absolutePath, $binary) === false) {
            throw new \RuntimeException('Unable to save repayment proof.');
        }

        return [
            'file_path' => $relativeDir . '/' . $targetName,
            'original_name' => $originalName !== '' ? $originalName : $targetName,
            'mime_type' => $mimeType,
            'file_size' => strlen($binary),
            'uploaded_at' => date('Y-m-d H:i:s'),
        ];
    }

    private function validateFile(array $file): array
    {
        $errorCode = (int) ($file['error'] ?? UPLOAD_ERR_NO_FILE);
        if ($errorCode !== UPLOAD_ERR_OK) {
            throw new \RuntimeException($this->messageForUploadError($errorCode));
        }

        $extension = strtolower(pathinfo((string) ($file['name'] ?? ''), PATHINFO_EXTENSION));
        $allowedExtensions = config('upload.allowed_extensions', []);
        if ($extension === '' || !in_array($extension, $allowedExtensions, true)) {
            throw new \RuntimeException('Unsupported file type.');
        }

        $maxBytes = (int) config('upload.max_bytes', 0);
        if ($maxBytes > 0 && (int) ($file['size'] ?? 0) > $maxBytes) {
            throw new \RuntimeException('File exceeds the upload limit.');
        }

        $detectedMimeType = '';
        if (is_string($file['tmp_name'] ?? null) && $file['tmp_name'] !== '' && file_exists((string) $file['tmp_name'])) {
            $finfo = new \finfo(FILEINFO_MIME_TYPE);
            $detectedMimeType = $this->normalizeMimeType((string) ($finfo->file((string) $file['tmp_name']) ?: ''));
        }

        $dangerousMimes = [
            'text/x-php', 'application/x-php', 'text/html', 'application/xhtml+xml',
            'application/javascript', 'text/javascript', 'application/x-executable',
            'application/x-sh', 'text/x-shellscript', 'application/x-bat',
            'application/x-msdownload', 'application/x-dosexec'
        ];
        if (in_array($detectedMimeType, $dangerousMimes, true)) {
            throw new \RuntimeException('Invalid or dangerous file content detected.');
        }

        $allowedMimeTypes = array_map([$this, 'normalizeMimeType'], config('upload.allowed_mime_types', []));

        if ($detectedMimeType !== '' && in_array($detectedMimeType, $allowedMimeTypes, true)) {
            return [$extension, $detectedMimeType];
        }

        if (in_array($extension, ['heic', 'heif'], true) && in_array($detectedMimeType, ['application/octet-stream', 'image/octet-stream', ''], true)) {
            return [$extension, 'image/heic'];
        }

        throw new \RuntimeException('Unsupported file type.');
    }

    private function normalizeMimeType(string $mimeType): string
    {
        $mimeType = strtolower(trim($mimeType));
        if ($mimeType === '') {
            return '';
        }

        return self::MIME_ALIASES[$mimeType] ?? $mimeType;
    }

    private function messageForUploadError(int $errorCode): string
    {
        return match ($errorCode) {
            UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE => 'File exceeds the upload limit.',
            UPLOAD_ERR_PARTIAL => 'Upload was interrupted. Please try again.',
            UPLOAD_ERR_NO_FILE => 'Choose a file to upload.',
            default => 'Document upload failed.',
        };
    }
}
