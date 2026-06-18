<?php
declare(strict_types=1);

// Keep the friendly file name in the address bar while rendering
// the real authenticated application form workspace underneath.
$_GET['route'] = 'application-form-file';
$_GET['code'] = 'availment_form';

require __DIR__ . '/index.php';
