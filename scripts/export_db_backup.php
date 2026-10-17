<?php
declare(strict_types=1);

require __DIR__ . '/../app/bootstrap.php';

function sql_value(PDO $pdo, mixed $value): string
{
    if ($value === null) {
        return 'NULL';
    }

    if (is_bool($value)) {
        return $value ? '1' : '0';
    }

    if (is_int($value) || is_float($value)) {
        return (string) $value;
    }

    return $pdo->quote((string) $value);
}

function export_table(PDO $pdo, string $table, $handle): int
{
    fwrite($handle, PHP_EOL . '-- --------------------------------------------------------' . PHP_EOL);
    fwrite($handle, '-- Table: `' . $table . '`' . PHP_EOL);
    fwrite($handle, '-- --------------------------------------------------------' . PHP_EOL . PHP_EOL);

    $createStatement = $pdo->query('SHOW CREATE TABLE `' . str_replace('`', '``', $table) . '`');
    $createRow = $createStatement instanceof PDOStatement
        ? $createStatement->fetch(PDO::FETCH_ASSOC)
        : false;

    $createSql = is_array($createRow) ? (string) ($createRow['Create Table'] ?? '') : '';

    fwrite($handle, 'DROP TABLE IF EXISTS `' . $table . '`;' . PHP_EOL);
    fwrite($handle, $createSql . ';' . PHP_EOL . PHP_EOL);

    $rowsStatement = $pdo->query('SELECT * FROM `' . str_replace('`', '``', $table) . '`');
    $rows = $rowsStatement instanceof PDOStatement
        ? ($rowsStatement->fetchAll(PDO::FETCH_ASSOC) ?: [])
        : [];

    if ($rows === []) {
        fwrite($handle, '-- No rows found.' . PHP_EOL . PHP_EOL);
        return 0;
    }

    $columns = array_keys($rows[0]);
    $columnSql = implode(', ', array_map(
        static fn (string $column): string => '`' . str_replace('`', '``', $column) . '`',
        $columns
    ));

    fwrite($handle, 'INSERT INTO `' . $table . '` (' . $columnSql . ') VALUES' . PHP_EOL);

    $total = count($rows);
    foreach ($rows as $index => $row) {
        $values = implode(', ', array_map(
            static fn (mixed $value): string => sql_value($pdo, $value),
            array_values($row)
        ));

        $suffix = $index === ($total - 1) ? ';' : ',';
        fwrite($handle, '  (' . $values . ')' . $suffix . PHP_EOL);
    }

    fwrite($handle, PHP_EOL);
    return $total;
}

$pdo = db();
$database = (string) config('database.database', 'smartleap');
$timestamp = date('Y-m-d_His');
$backupDirectory = base_path('exports/db_backup_' . $timestamp);

if (!is_dir($backupDirectory) && !mkdir($backupDirectory, 0775, true) && !is_dir($backupDirectory)) {
    throw new RuntimeException('Unable to create backup directory: ' . $backupDirectory);
}

$sqlPath = $backupDirectory . '/smartleap-backup-' . $timestamp . '.sql';
$manifestPath = $backupDirectory . '/manifest.json';
$handle = fopen($sqlPath, 'wb');
if ($handle === false) {
    throw new RuntimeException('Unable to open backup file for writing: ' . $sqlPath);
}

fwrite($handle, '-- SMART LEAP database backup' . PHP_EOL);
fwrite($handle, '-- Generated at: ' . date(DATE_ATOM) . PHP_EOL);
fwrite($handle, '-- Database: ' . $database . PHP_EOL . PHP_EOL);
fwrite($handle, 'SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";' . PHP_EOL);
fwrite($handle, 'SET time_zone = "+00:00";' . PHP_EOL);
fwrite($handle, 'SET foreign_key_checks = 0;' . PHP_EOL . PHP_EOL);

$tableStatement = $pdo->query('SHOW TABLES');
$tables = $tableStatement instanceof PDOStatement
    ? ($tableStatement->fetchAll(PDO::FETCH_COLUMN) ?: [])
    : [];

$manifest = [
    'generated_at' => date(DATE_ATOM),
    'database' => $database,
    'table_count' => count($tables),
    'tables' => [],
    'sql_path' => $sqlPath,
];

foreach ($tables as $table) {
    $tableName = (string) $table;
    $rowCount = export_table($pdo, $tableName, $handle);
    $manifest['tables'][] = [
        'name' => $tableName,
        'row_count' => $rowCount,
    ];
}

fwrite($handle, PHP_EOL . 'SET foreign_key_checks = 1;' . PHP_EOL);
fclose($handle);

file_put_contents(
    $manifestPath,
    json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
);

echo 'Backup created:' . PHP_EOL;
echo $sqlPath . PHP_EOL;
echo $manifestPath . PHP_EOL;
