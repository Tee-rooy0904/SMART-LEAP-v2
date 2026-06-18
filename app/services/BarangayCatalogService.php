<?php
declare(strict_types=1);

namespace App\Services;

use PDO;

class BarangayCatalogService
{
    private const DISTRICT_CATALOG = [
        [
            'code' => 'district_1',
            'district' => 'District 1',
            'office' => 'Office - Brgy Ambago - Operational',
            'barangays' => ['Ambago', 'Lumbocan', 'Masao', 'Pinamanculan', 'Pagatpatan', 'Babag'],
        ],
        [
            'code' => 'district_2',
            'district' => 'District 2',
            'office' => 'Office - Brgy Libertad',
            'barangays' => ['Bancasi', 'Bonbon', 'Dumalagan', 'Libertad', 'Kinamlutan'],
        ],
        [
            'code' => 'district_3a',
            'district' => 'District 3A',
            'office' => 'Office - Brgy Golden Ribbon - Operational',
            'barangays' => ['Agao', 'Diego Silang', 'Golden Ribbon', 'Lapu-Lapu', 'Leon Kilat', 'Maon', 'New Society Village', 'Humabon', 'Rajah Soliman', 'Sikatuna', 'Datu Silongan', 'Urduja'],
        ],
        [
            'code' => 'district_3b',
            'district' => 'District 3B',
            'office' => 'Office - Brgy Doongan - Operational',
            'barangays' => ['Agusan PequeÃ±o', 'Bading', 'Bayanihan', 'Dagohoy', 'Doongan', 'Fort Poyohon', 'Holy Redeemer', 'Imadejas', 'J.P. Rizal', 'Limaha', 'Obrero', 'Ong Yiu', 'San Ignacio', 'Tandang Sora', 'Villa Kananga'],
        ],
        [
            'code' => 'district_4',
            'district' => 'District 4',
            'office' => 'Office - Brgy San Vicente - Operational',
            'barangays' => ['Amparo', 'San Vicente', 'Bit-os', 'Pangabugan'],
        ],
        [
            'code' => 'district_5',
            'district' => 'District 5',
            'office' => 'Office - Brgy Dulag - Operational',
            'barangays' => ['Dankias', 'Manila de Bugabus', 'MJ Santos (Bugabus)', 'San Mateo', 'Tungao', 'Bitan-Agan', 'Dulag', 'Nong-Nong'],
        ],
        [
            'code' => 'district_6',
            'district' => 'District 6',
            'office' => 'Office - Brgy Mahogany - Operational',
            'barangays' => ['Banza', 'Bobon', 'Mahogany', 'Maug'],
        ],
        [
            'code' => 'district_7',
            'district' => 'District 7',
            'office' => 'Office - Brgy Baan KM3 - Operational',
            'barangays' => ['Ampayon', 'Baan KM 3', 'Tiniwisan'],
        ],
        [
            'code' => 'district_8',
            'district' => 'District 8',
            'office' => 'Office - Brgy Pigdaulan - Operational',
            'barangays' => ['Aupagan', 'Mahay', 'Tagabaca', 'Bilay', 'Camayahan', 'Don Francisco', 'Maibu', 'Pigdaulan', 'Salvacion', 'Lemon'],
        ],
        [
            'code' => 'district_9',
            'district' => 'District 9',
            'office' => 'Office - Brgy Taligaman - Operational',
            'barangays' => ['Basag', 'Bugsukan', 'De Oro', 'Taligaman', 'Antongalon'],
        ],
        [
            'code' => 'district_10',
            'district' => 'District 10',
            'office' => 'Office - Brgy Maguinda - Operational',
            'barangays' => ['Florida', 'Maguinda', 'Mandamo', 'Sumile'],
        ],
        [
            'code' => 'district_11',
            'district' => 'District 11',
            'office' => 'Office - Brgy Sumilihon - Operational',
            'barangays' => ['Los Angeles', 'Sumilihon', 'Sto. NiÃ±o', 'Cabcabon', 'Baobaoan', 'Anticala', 'Taguibo', 'Pianing', 'Baan Riverside', 'Buhangin'],
        ],
    ];

    private const LEGACY_NAME_MAP = [
        'Ag-ao' => 'Agao',
        'Agao Pob.' => 'Agao',
        'Agusan PequeÃƒÂ±o' => 'Agusan PequeÃ±o',
        'Agusan PequeÃƒÆ’Ã‚Â±o' => 'Agusan PequeÃ±o',
        'Agusan Pequeno' => 'Agusan PequeÃ±o',
        'Bading Pob.' => 'Bading',
        'Bayanihan Pob.' => 'Bayanihan',
        'Buhangin Pob.' => 'Buhangin',
        'Baan Riverside Pob.' => 'Baan Riverside',
        'Imadejas Pob.' => 'Imadejas',
        'Diego Silang Pob.' => 'Diego Silang',
        'Golden Ribbon Pob.' => 'Golden Ribbon',
        'Dagohoy Pob.' => 'Dagohoy',
        'Holy Redeemer Pob.' => 'Holy Redeemer',
        'Humabon Pob.' => 'Humabon',
        'Lapu-lapu Pob.' => 'Lapu-Lapu',
        'Leon Kilat Pob.' => 'Leon Kilat',
        'Limaha Pob.' => 'Limaha',
        'Mahogany Pob.' => 'Mahogany',
        'Maon Pob.' => 'Maon',
        'Port Poyohon Pob.' => 'Fort Poyohon',
        'New Society Village Pob.' => 'New Society Village',
        'Ong Yiu Pob.' => 'Ong Yiu',
        'Rajah Soliman Pob.' => 'Rajah Soliman',
        'San Ignacio Pob.' => 'San Ignacio',
        'Sikatuna Pob.' => 'Sikatuna',
        'Silongan Pob.' => 'Datu Silongan',
        'Tandang Sora Pob.' => 'Tandang Sora',
        'Urduja Pob.' => 'Urduja',
        'Obrero Pob.' => 'Obrero',
        'Santo NiÃƒÂ±o' => 'Sto. NiÃ±o',
        'Santo NiÃƒÆ’Ã‚Â±o' => 'Sto. NiÃ±o',
        'Santo NiÃ±o' => 'Sto. NiÃ±o',
        'Santo Nino' => 'Sto. NiÃ±o',
        'Bugabus' => 'MJ Santos (Bugabus)',
        'Bitan-agan' => 'Bitan-Agan',
        'Nong-nong' => 'Nong-Nong',
        'Bading Poblacion' => 'Bading',
        'Jose Rizal Pob.' => 'J.P. Rizal',
    ];

    public function ensureSeeded(): void
    {
        $canonical = $this->flatCanonicalRows();
        $insert = db()->prepare(
            'INSERT INTO barangays (name, district) VALUES (:name, :district)
             ON DUPLICATE KEY UPDATE district = VALUES(district), name = VALUES(name)'
        );

        foreach ($canonical as $row) {
            $insert->execute([
                'name' => $row['name'],
                'district' => $row['district'],
            ]);
        }

        $this->normalizeLegacyRows($canonical);
    }

    public function all(): array
    {
        $this->ensureSeeded();
        $names = array_map(static fn (array $row): string => $row['name'], $this->flatCanonicalRows());
        if ($names === []) {
            return [];
        }

        $placeholders = implode(',', array_fill(0, count($names), '?'));
        $statement = db()->prepare(
            "SELECT id, name, district
             FROM barangays
             WHERE name IN ($placeholders)"
        );
        foreach ($names as $index => $name) {
            $statement->bindValue($index + 1, $name);
        }
        $statement->execute();
        $rows = $statement->fetchAll(PDO::FETCH_ASSOC) ?: [];

        $rowsByName = [];
        foreach ($rows as $row) {
            $rowsByName[(string) $row['name']] = [
                'id' => (int) $row['id'],
                'name' => (string) $row['name'],
                'district' => (string) ($row['district'] ?? ''),
            ];
        }

        $ordered = [];
        foreach ($this->flatCanonicalRows() as $entry) {
            if (isset($rowsByName[$entry['name']])) {
                $ordered[] = $rowsByName[$entry['name']];
            }
        }

        return $ordered;
    }

    public function districtOptions(): array
    {
        $barangaysByName = [];
        foreach ($this->all() as $row) {
            $barangaysByName[$row['name']] = $row;
        }

        $options = [];
        foreach (self::DISTRICT_CATALOG as $district) {
            $barangays = [];
            foreach ($district['barangays'] as $barangayName) {
                if (!isset($barangaysByName[$barangayName])) {
                    continue;
                }
                $barangays[] = [
                    'id' => $barangaysByName[$barangayName]['id'],
                    'name' => $barangaysByName[$barangayName]['name'],
                ];
            }

            $options[] = [
                'code' => $district['code'],
                'district' => $district['district'],
                'office' => $district['office'],
                'barangays' => $barangays,
            ];
        }

        return $options;
    }

    public function districtForBarangayName(string $barangayName): ?string
    {
        $normalized = $this->normalizeName($barangayName);
        foreach ($this->flatCanonicalRows() as $row) {
            if ($this->normalizeName($row['name']) === $normalized) {
                return $row['district'];
            }
        }

        return null;
    }

    private function flatCanonicalRows(): array
    {
        $rows = [];
        foreach (self::DISTRICT_CATALOG as $district) {
            foreach ($district['barangays'] as $barangay) {
                $rows[] = [
                    'name' => $barangay,
                    'district' => $district['district'],
                    'districtCode' => $district['code'],
                    'office' => $district['office'],
                ];
            }
        }

        return $rows;
    }

    private function normalizeLegacyRows(array $canonicalRows): void
    {
        $canonicalMap = [];
        foreach ($canonicalRows as $row) {
            $canonicalMap[$this->normalizeName($row['name'])] = $row;
        }

        $rows = db()->query('SELECT id, name, district FROM barangays')->fetchAll(PDO::FETCH_ASSOC) ?: [];
        $byNormalized = [];
        foreach ($rows as $row) {
            $byNormalized[$this->normalizeName((string) $row['name'])] = $row;
        }

        foreach (self::LEGACY_NAME_MAP as $legacyName => $canonicalName) {
            $legacyKey = $this->normalizeName($legacyName);
            $canonicalKey = $this->normalizeName($canonicalName);
            $legacyRow = $byNormalized[$legacyKey] ?? null;
            $canonicalRow = $byNormalized[$canonicalKey] ?? null;
            $canonicalInfo = $canonicalMap[$canonicalKey] ?? null;

            if (!is_array($legacyRow) || !is_array($canonicalInfo)) {
                continue;
            }

            if (is_array($canonicalRow) && (int) $canonicalRow['id'] !== (int) $legacyRow['id']) {
                $this->migrateBarangayReferences((int) $legacyRow['id'], (int) $canonicalRow['id']);
                db()->prepare('DELETE FROM barangays WHERE id = :id')->execute(['id' => (int) $legacyRow['id']]);
                continue;
            }

            db()->prepare(
                'UPDATE barangays
                 SET name = :name, district = :district, updated_at = NOW()
                 WHERE id = :id'
            )->execute([
                'name' => $canonicalInfo['name'],
                'district' => $canonicalInfo['district'],
                'id' => (int) $legacyRow['id'],
            ]);
        }

        foreach ($canonicalRows as $row) {
            db()->prepare(
                'UPDATE barangays
                 SET district = :district, updated_at = NOW()
                 WHERE name = :name'
            )->execute([
                'district' => $row['district'],
                'name' => $row['name'],
            ]);
        }

        $this->purgeUnreferencedNonCanonicalRows($canonicalMap);
    }

    private function migrateBarangayReferences(int $fromBarangayId, int $toBarangayId): void
    {
        if ($fromBarangayId <= 0 || $toBarangayId <= 0 || $fromBarangayId === $toBarangayId) {
            return;
        }

        db()->prepare('UPDATE applicant_profiles SET barangay_id = :to_id WHERE barangay_id = :from_id')
            ->execute(['to_id' => $toBarangayId, 'from_id' => $fromBarangayId]);

        db()->prepare(
            'UPDATE staff_barangay_assignments
             SET barangay_id = :to_id, updated_at = NOW()
             WHERE barangay_id = :from_id'
        )->execute(['to_id' => $toBarangayId, 'from_id' => $fromBarangayId]);

        db()->prepare(
            'DELETE s1 FROM staff_barangay_assignments AS s1
             INNER JOIN staff_barangay_assignments AS s2
                ON s1.staff_profile_id = s2.staff_profile_id
               AND s1.barangay_id = s2.barangay_id
               AND COALESCE(s1.ended_at, "9999-12-31") = COALESCE(s2.ended_at, "9999-12-31")
               AND s1.id > s2.id
             WHERE s1.barangay_id = :barangay_id'
        )->execute(['barangay_id' => $toBarangayId]);
    }

    private function purgeUnreferencedNonCanonicalRows(array $canonicalMap): void
    {
        $rows = db()->query('SELECT id, name FROM barangays ORDER BY id ASC')->fetchAll(PDO::FETCH_ASSOC) ?: [];
        foreach ($rows as $row) {
            $barangayId = (int) ($row['id'] ?? 0);
            $name = trim((string) ($row['name'] ?? ''));
            if ($barangayId <= 0) {
                continue;
            }

            if (isset($canonicalMap[$this->normalizeName($name)])) {
                continue;
            }

            if ($this->barangayHasReferences($barangayId)) {
                continue;
            }

            db()->prepare('DELETE FROM barangays WHERE id = :id')->execute(['id' => $barangayId]);
        }
    }

    private function barangayHasReferences(int $barangayId): bool
    {
        $applicantStatement = db()->prepare('SELECT COUNT(*) FROM applicant_profiles WHERE barangay_id = :barangay_id');
        $applicantStatement->execute(['barangay_id' => $barangayId]);
        if ((int) $applicantStatement->fetchColumn() > 0) {
            return true;
        }

        $assignmentStatement = db()->prepare('SELECT COUNT(*) FROM staff_barangay_assignments WHERE barangay_id = :barangay_id');
        $assignmentStatement->execute(['barangay_id' => $barangayId]);

        return (int) $assignmentStatement->fetchColumn() > 0;
    }

    private function normalizeName(string $value): string
    {
        return mb_strtolower(trim(preg_replace('/\s+/', ' ', $value) ?? ''), 'UTF-8');
    }
}
