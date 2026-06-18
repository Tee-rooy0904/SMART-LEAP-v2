<?php /** @var string $baseUrl */ ?>
<?php /** @var array|null $authUser */ ?>
<?php /** @var string $htmlFile */ ?>
<?php
$filePath = base_path('public/training/' . $htmlFile);
if (!is_file($filePath)) {
    abort(404);
}

$contents = (string) file_get_contents($filePath);
$baseHref = htmlspecialchars($baseUrl . '/training/', ENT_QUOTES);
$bootstrapScript = '<base href="' . $baseHref . '">' . PHP_EOL
    . '<script>'
    . 'window.SMARTLEAP_BASE_URL=' . json_encode($baseUrl, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . ';'
    . 'window.SMARTLEAP_AUTH_USER=' . json_encode($authUser ?? null, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . ';'
    . '</script>';

$contents = preg_replace('/<head>/', "<head>\n" . $bootstrapScript, $contents, 1) ?: $contents;
echo $contents;
?>
