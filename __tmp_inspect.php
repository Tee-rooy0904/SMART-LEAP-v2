<?php
require 'app/bootstrap.php';
$db = db();
$rows = $db->query("SELECT post_approval_tasks.id, post_approval_task_types.code, post_approval_tasks.status, beneficiary_profiles.applicant_profile_id FROM post_approval_tasks INNER JOIN post_approval_task_types ON post_approval_task_types.id=post_approval_tasks.task_type_id INNER JOIN beneficiary_profiles ON beneficiary_profiles.id=post_approval_tasks.beneficiary_profile_id ORDER BY post_approval_tasks.id")->fetchAll(PDO::FETCH_ASSOC);
var_export($rows);
