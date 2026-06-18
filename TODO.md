?# Update Requirements sections from requirement files

**Status: Active**

## Plan Summary
Make Requirements sections dynamic, pulling from `initial_requirement_types` DB table via seeds.sql data. Add Business Plan and forms as per user feedback.

## Steps:
- [ ] 1. Update `database/seeds.sql` to add 'business_plan' to initial_requirement_types.
- [ ] 2. Implement `app/models/InitialRequirementType.php` with `static::all()` method.
- [ ] 3. Update `app/controllers/PortalController.php` to fetch requirements and pass to view.
- [ ] 4. Refactor `app/views/public/requirements.php` to render dynamically from `$requirements`.
- [ ] 5. Update `app/views/public/profile-completion.php` hardcoded doc count to dynamic (via JS/API).
- [ ] 6. Test: seed DB, visit /portal/requirements.
- [ ] 7. Mark complete.

**Progress:** Steps 1-4 complete. Next: profile-completion update & test.
