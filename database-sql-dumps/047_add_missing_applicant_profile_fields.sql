ALTER TABLE applicant_profiles
    ADD COLUMN educational_attainment VARCHAR(120) NULL AFTER is_4ps,
    ADD COLUMN sector_other_specify VARCHAR(160) NULL AFTER sector,
    ADD COLUMN livelihood_category VARCHAR(120) NULL AFTER sector_other_specify;
