<?php
declare(strict_types=1);

return [
    'max_bytes' => (int) ($_ENV['UPLOAD_MAX_BYTES'] ?? 5 * 1024 * 1024),
    'allowed_extensions' => ['jpg', 'jpeg', 'png', 'webp', 'pdf', 'heic', 'heif'],
    'allowed_mime_types' => [
        'image/jpeg',
        'image/png',
        'image/webp',
        'application/pdf',
        'image/heic',
        'image/heif',
        'image/heic-sequence',
        'image/heif-sequence',
    ],
    'paths' => [
        'initial_requirements' => public_path('uploads/initial-requirements'),
        'repayments' => public_path('uploads/repayments'),
        'post_approval' => public_path('uploads/post-approval'),
        'temp' => public_path('uploads/temp'),
    ],
];
