<?php
// Simple Validation Form example for SMART LEAP (user-friendly)
$submitted = false;
$data = [];
if ($_SERVER['REQUEST_METHOD'] ==='POST') {
    $data = array_map(fn($v) => is_string($v) ? trim($v) : $v, $_POST);
    $submitted = true;
}
?>
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>SMART LEAP — Validation Form</title>
    <style>
        body{font-family:Inter,Arial,Helvetica,sans-serif;margin:18px;background:#f7fafc}
        .card{max-width:820px;margin:0 auto;background:#fff;padding:18px;border-radius:10px;box-shadow:0 8px 24px rgba(2,6,23,0.06)}
        label{display:block;margin-top:12px;font-weight:600}
        input, textarea, select{width:100%;padding:10px;border:1px solid #e6edf0;border-radius:8px;margin-top:6px}
        .row{display:flex;gap:12px}
        .col{flex:1}
        .btn{padding:10px 14px;border-radius:8px;border:none;cursor:pointer}
        .btn-primary{background:#0ea5a4;color:#fff}
        .summary{background:#f0f9ff;border:1px solid #bae6fd;padding:12px;border-radius:8px;margin-top:12px}
    </style>
</head>
<body>
    <div class="card">
        <h2>Validation Form</h2>
        <p class="muted">A simplified validation / intake form for SMART LEAP applicants.</p>

        <?php if ($submitted): ?>
            <div class="summary">
                <strong>Submission received (demo).</strong>
                <pre><?php echo htmlspecialchars(json_encode($data, JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE)); ?></pre>
            </div>
            <p><a href="validation_form.php">Fill again</a></p>
            <?php exit; ?>
        <?php endif; ?>

        <form method="post">
            <div class="row">
                <div class="col">
                    <label>Applicant name</label>
                    <input type="text" name="applicant_name">
                </div>
                <div style="width:120px">
                    <label>Age</label>
                    <input type="number" name="age">
                </div>
            </div>

            <label>Primary contact number</label>
            <input type="text" name="contact">

            <label>ID provided</label>
            <select name="id_type">
                <option value="">Select</option>
                <option>Valid ID</option>
                <option>Barangay ID</option>
                <option>Cedula</option>
            </select>

            <label>Notes / observations</label>
            <textarea name="notes" rows="4"></textarea>

            <div style="margin-top:14px">
                <button type="submit" class="btn btn-primary">Submit validation</button>
                <button type="reset" class="btn">Reset</button>
            </div>
        </form>
    </div>
</body>
</html>
