USE smartleap;

ALTER TABLE users
    ADD COLUMN first_name VARCHAR(80) NULL AFTER full_name,
    ADD COLUMN middle_name VARCHAR(80) NULL AFTER first_name,
    ADD COLUMN last_name VARCHAR(80) NULL AFTER middle_name;

UPDATE users
SET
    first_name = TRIM(SUBSTRING_INDEX(full_name, ' ', 1)),
    last_name = TRIM(
        CASE
            WHEN LOCATE(' ', TRIM(full_name)) = 0 THEN ''
            ELSE SUBSTRING_INDEX(TRIM(full_name), ' ', -1)
        END
    ),
    middle_name = TRIM(
        CASE
            WHEN LOCATE(' ', TRIM(full_name)) = 0 THEN ''
            WHEN SUBSTRING_INDEX(TRIM(full_name), ' ', 1) = SUBSTRING_INDEX(TRIM(full_name), ' ', -1) THEN ''
            ELSE TRIM(
                SUBSTRING(
                    TRIM(full_name),
                    LENGTH(SUBSTRING_INDEX(TRIM(full_name), ' ', 1)) + 1,
                    LENGTH(TRIM(full_name))
                        - LENGTH(SUBSTRING_INDEX(TRIM(full_name), ' ', 1))
                        - LENGTH(SUBSTRING_INDEX(TRIM(full_name), ' ', -1))
                        - 1
                )
            )
        END
    )
WHERE first_name IS NULL
   OR middle_name IS NULL
   OR last_name IS NULL;
