<?php
// Simple redirect handler for application form links used in the applicant dashboard.
$code = isset($_GET['code']) ? trim($_GET['code']) : '';
$map = [
    'availment_form' => 'availment_form.php',
    'validation_form' => 'validation_form.php',
    'mungkahing_proyekto' => 'mungkahing_proyekto.php',
];

if ($code && isset($map[$code])) {
    // Redirect to the public file for the example form.
    $target = $map[$code];
    header('Location: ' . $target);
    exit;
}

http_response_code(404);
?><!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Form not found</title>
</head>
<body style="font-family:Arial,Helvetica,sans-serif;padding:24px">
    <h1>Form not found</h1>
    <p>The requested form was not found. If you expected this to open the availment form, try <a href="availment_form.php">the availment form</a>.</p>
</body>
</html>
