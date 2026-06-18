<?php
declare(strict_types=1);
session_start();
$userId = isset($_SESSION['user_id']) ? (int)$_SESSION['user_id'] : (int)($_GET['user_id'] ?? 1);
$userName = $_SESSION['full_name'] ?? 'Beneficiary';
$userEmail = $_SESSION['email'] ?? 'beneficiary@email.com';
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SMART LEAP | Online Fill-up</title>
    <link rel="stylesheet" href="styles.css">
    <link rel="stylesheet" href="fillup.css">
</head>
<body>
    <div class="fillup-shell">
        <aside class="fillup-sidebar">
            <div class="fillup-brand">
                <img src="SMARTLEAP.png" alt="SMART LEAP seal">
                <div>
                    <strong>Online Fill-up</strong>
                    <span>Training Tasks</span>
                </div>
            </div>
            <div class="fillup-user">
                <strong><?php echo htmlspecialchars($userName); ?></strong>
                <span><?php echo htmlspecialchars($userEmail); ?></span>
            </div>
            <ol class="step-list" id="stepList">
                <li data-step="1"><span>Step 1</span><small>Project Information</small><em class="step-status">Not started</em></li>
                <li data-step="2"><span>Step 2</span><small>Materials / Capital</small><em class="step-status">Not started</em></li>
                <li data-step="3"><span>Step 3</span><small>Labor / Manpower</small><em class="step-status">Not started</em></li>
                <li data-step="4"><span>Step 4</span><small>Tools & Equipment</small><em class="step-status">Not started</em></li>
                <li data-step="5"><span>Step 5</span><small>Other Expenses</small><em class="step-status">Not started</em></li>
                <li data-step="6"><span>Step 6</span><small>Sales / Income</small><em class="step-status">Not started</em></li>
            </ol>
            <div class="sidebar-note">
                <p>Progress autosaves. You can resume anytime.</p>
            </div>
        </aside>

        <main class="fillup-main">
            <header class="fillup-header">
                <div>
                    <h1>Online Fill-up (Training Tasks)</h1>
                    <p>Answer each step. Save drafts and resume anytime.</p>
                </div>
                <div class="progress-bar">
                    <span id="progressText">Step 1 of 6</span>
                    <div class="progress-track"><div class="progress-fill" id="progressFill"></div></div>
                </div>
            </header>

            <section class="step-panel" id="stepPanel">
                <div class="step-comment" id="stepComment"></div>

                <form class="step-form" data-step="1">
                    <h2>Step 1: Project Information</h2>
                    <div class="form-grid">
                        <label>
                            Participant name
                            <input type="text" name="name" required>
                        </label>
                        <label>
                            Project location
                            <input type="text" name="location" required>
                        </label>
                        <label>
                            Type of business
                            <input type="text" name="business" required>
                        </label>
                        <label>
                            Pantawid / Non-Pantawid
                            <select name="pantawid" required>
                                <option value="">Select</option>
                                <option value="Pantawid">Pantawid</option>
                                <option value="Non-Pantawid">Non-Pantawid</option>
                            </select>
                        </label>
                        <label class="full">
                            Sector
                            <div class="sector-field" data-component="sector">
                                <input type="text" id="sectorSearch" placeholder="Type to search sector (e.g., PWD, Senior Citizen)" autocomplete="off" aria-describedby="sectorHelp sectorError">
                                <input type="hidden" name="sector" id="sectorValue" required>
                                <div class="sector-suggestions" id="sectorSuggestions" role="listbox" aria-label="Sector suggestions"></div>
                                <div class="sector-chips" id="sectorChips" aria-live="polite"></div>
                            </div>  
                            <small class="helper-text" id="sectorHelp">You may select more than one if applicable.</small>
                            <small class="error-text" id="sectorError" aria-live="polite"></small>
                        </label>
                        <label>
                            Sex
                            <select name="sex" required>
                                <option value="">Select</option>
                                <option value="Male">Male</option>
                                <option value="Female">Female</option>
                            </select>
                        </label>
                    </div>
                </form>

                <form class="step-form" data-step="2" hidden>
                    <h2>Step 2: Materials / Capital</h2>
                    <table class="data-table" id="materialsTable">
                        <thead>
                            <tr><th>Material</th><th>Qty</th><th>Unit</th><th>Unit price</th><th>Total</th><th></th></tr>
                        </thead>
                        <tbody></tbody>
                    </table>
                    <div class="table-actions">
                        <button type="button" class="btn-outline" data-action="add-row" data-table="materialsTable">Add row</button>
                        <div class="totals">Grand total: <span id="materialsTotal">0</span></div>
                    </div>
                </form>

                <form class="step-form" data-step="3" hidden>
                    <h2>Step 3: Labor / Manpower</h2>
                    <table class="data-table" id="laborTable">
                        <thead>
                            <tr><th>Worker name</th><th>Position</th><th>Daily wage</th><th></th></tr>
                        </thead>
                        <tbody></tbody>
                    </table>
                    <div class="table-actions">
                        <button type="button" class="btn-outline" data-action="add-row" data-table="laborTable">Add row</button>
                        <div class="totals">Total labor cost: <span id="laborTotal">0</span></div>
                    </div>
                </form>

                <form class="step-form" data-step="4" hidden>
                    <h2>Step 4: Tools & Equipment (Depreciation)</h2>
                    <table class="data-table" id="toolsTable">
                        <thead>
                            <tr><th>Tool</th><th>Qty</th><th>Unit price</th><th>Useful life</th><th>Depreciation</th><th></th></tr>
                        </thead>
                        <tbody></tbody>
                    </table>
                    <div class="table-actions">
                        <button type="button" class="btn-outline" data-action="add-row" data-table="toolsTable">Add row</button>
                        <div class="totals">Total depreciation: <span id="toolsTotal">0</span></div>
                    </div>
                </form>

                <form class="step-form" data-step="5" hidden>
                    <h2>Step 5: Other Expenses</h2>
                    <table class="data-table" id="expensesTable">
                        <thead>
                            <tr><th>Expense type</th><th>Frequency</th><th>Amount</th><th></th></tr>
                        </thead>
                        <tbody></tbody>
                    </table>
                    <div class="table-actions">
                        <button type="button" class="btn-outline" data-action="add-row" data-table="expensesTable">Add row</button>
                        <div class="totals">Total operating expense: <span id="expensesTotal">0</span></div>
                    </div>
                </form>

                <form class="step-form" data-step="6" hidden>
                    <h2>Step 6: Sales / Income + Fund Utilization</h2>
                    <h3>Sales / Income</h3>
                    <table class="data-table" id="salesTable">
                        <thead>
                            <tr><th>Product / Service</th><th>Qty</th><th>Selling price</th><th>Gross sales</th><th></th></tr>
                        </thead>
                        <tbody></tbody>
                    </table>
                    <div class="table-actions">
                        <button type="button" class="btn-outline" data-action="add-row" data-table="salesTable">Add row</button>
                        <div class="totals">Gross sales: <span id="grossSales">0</span> | Gross profit: <span id="grossProfit">0</span> | Net profit: <span id="netProfit">0</span></div>
                    </div>
                    <h3>Fund Utilization Plan</h3>
                    <table class="data-table" id="utilTable">
                        <thead>
                            <tr><th>Item</th><th>Quantity</th><th>Schedule of use</th><th></th></tr>
                        </thead>
                        <tbody></tbody>
                    </table>
                    <div class="table-actions">
                        <button type="button" class="btn-outline" data-action="add-row" data-table="utilTable">Add row</button>
                    </div>
                </form>
            </section>

            <footer class="step-footer">
                <button type="button" class="btn-outline" id="backBtn">Back</button>
                <div class="footer-actions">
                    <button type="button" class="btn-outline" id="saveDraftBtn">Save draft</button>
                    <button type="button" class="btn-primary" id="submitStepBtn">Submit step</button>
                    <button type="button" class="btn-primary" id="nextBtn">Next</button>
                </div>
            </footer>
        </main>
    </div>

    <script>
        const CURRENT_USER_ID = <?php echo (int)$userId; ?>;
        const CURRENT_USER_NAME = <?php echo json_encode($userName); ?>;
        const CURRENT_USER_EMAIL = <?php echo json_encode($userEmail); ?>;
    </script>
    <script src="beneficiary_fillup.js"></script>
</body>
</html>
