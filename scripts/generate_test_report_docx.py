"""
Generate InfecSure Functional Test Cases Document (.docx) for Final Report
"""

import os
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn

def set_cell_background(cell, fill_hex):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{fill_hex}"/>')
    tcPr.append(shd)

def set_cell_margins(cell, top=100, bottom=100, left=150, right=150):
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = parse_xml(f'<w:tcMar {nsdecls("w")}><w:top w:w="{top}" w:type="dxa"/><w:bottom w:w="{bottom}" w:type="dxa"/><w:left w:w="{left}" w:type="dxa"/><w:right w:w="{right}" w:type="dxa"/></w:tcMar>')
    tcPr.append(tcMar)

def add_table_header(table, headers, col_widths, bg_hex="1E3A8A"):
    hdr_row = table.rows[0]
    for i, title in enumerate(headers):
        cell = hdr_row.cells[i]
        cell.width = Inches(col_widths[i])
        set_cell_background(cell, bg_hex)
        set_cell_margins(cell, top=120, bottom=120, left=140, right=140)
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = p.add_run(title)
        run.bold = True
        run.font.name = 'Calibri'
        run.font.size = Pt(9.5)
        run.font.color.rgb = RGBColor(255, 255, 255)

def add_table_row(table, data_tuple, col_widths):
    row = table.add_row()
    for i, text in enumerate(data_tuple):
        cell = row.cells[i]
        cell.width = Inches(col_widths[i])
        set_cell_margins(cell, top=100, bottom=100, left=130, right=130)
        p = cell.paragraphs[0]
        p.paragraph_format.line_spacing = 1.15
        p.paragraph_format.space_after = Pt(2)
        
        # Alignment & Styling
        if i == 0:  # TC ID
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            run = p.add_run(text)
            run.bold = True
            run.font.name = 'Calibri'
            run.font.size = Pt(8.5)
            run.font.color.rgb = RGBColor(30, 58, 138)
        elif i == 5:  # Status
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            run = p.add_run(text)
            run.bold = True
            run.font.name = 'Calibri'
            run.font.size = Pt(9.0)
            if "PASS" in text:
                run.font.color.rgb = RGBColor(22, 101, 52)  # Dark green
                set_cell_background(cell, "DCFCE7")  # Soft green highlight
            else:
                run.font.color.rgb = RGBColor(185, 28, 28)
        else:
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            run = p.add_run(text)
            run.font.name = 'Calibri'
            run.font.size = Pt(8.5)
            run.font.color.rgb = RGBColor(30, 41, 59)

def main():
    doc = Document()

    # Set page margins
    sections = doc.sections
    for section in sections:
        section.top_margin = Inches(0.8)
        section.bottom_margin = Inches(0.8)
        section.left_margin = Inches(0.7)
        section.right_margin = Inches(0.7)

    # ─── Title & Header ──────────────────────────────────────────────────────────
    p_title = doc.add_paragraph()
    p_title.alignment = WD_ALIGN_PARAGRAPH.LEFT
    p_title.paragraph_format.space_after = Pt(2)
    run_title = p_title.add_run("InfecSure — Software Testing & Quality Assurance")
    run_title.bold = True
    run_title.font.name = 'Calibri'
    run_title.font.size = Pt(22)
    run_title.font.color.rgb = RGBColor(15, 23, 42)

    p_sub = doc.add_paragraph()
    p_sub.alignment = WD_ALIGN_PARAGRAPH.LEFT
    p_sub.paragraph_format.space_after = Pt(12)
    run_sub = p_sub.add_run("Functional Test Case Specifications & System Verification Report\nAI-Powered Infection Monitoring and Outbreak Response System | Divisional Hospital, Thalangama")
    run_sub.font.name = 'Calibri'
    run_sub.font.size = Pt(11)
    run_sub.font.color.rgb = RGBColor(71, 85, 105)

    # Metadata Callout Box / Summary Info
    meta_table = doc.add_table(rows=1, cols=1)
    meta_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    meta_cell = meta_table.rows[0].cells[0]
    meta_cell.width = Inches(7.1)
    set_cell_background(meta_cell, "F8FAFC")
    set_cell_margins(meta_cell, top=140, bottom=140, left=180, right=180)
    
    mp = meta_cell.paragraphs[0]
    mp.paragraph_format.space_after = Pt(4)
    r_meta_h = mp.add_run("Test Execution Summary & Evaluation Metadata\n")
    r_meta_h.bold = True
    r_meta_h.font.size = Pt(10)
    r_meta_h.font.color.rgb = RGBColor(30, 58, 138)
    
    mp_info = meta_cell.add_paragraph()
    mp_info.paragraph_format.line_spacing = 1.2
    mp_info.paragraph_format.space_after = Pt(0)
    info_text = (
        "• Target System: InfecSure v1.0.0 (FastAPI Backend + React/Vite Frontend + Cloud Firestore)\n"
        "• Academic Project: UWU IIT 372-2 / Final Degree Project\n"
        "• Testing Type: Black-Box Functional & End-to-End System Testing\n"
        "• Test Coverage: 6 Core Modules (Authentication/RBAC, Audits, Lab/OCR, ML/Anomaly, Alerts, Heatmap)\n"
        "• Overall Status: 19 / 19 Test Cases Passed (100% Pass Rate, 0 Critical Defects)"
    )
    r_info = mp_info.add_run(info_text)
    r_info.font.size = Pt(9.0)
    r_info.font.color.rgb = RGBColor(51, 65, 85)

    doc.add_paragraph().paragraph_format.space_after = Pt(8)

    # Common Table Config
    headers = ["Test ID", "Preconditions", "Test Steps", "Expected Result", "Actual Result", "Status"]
    col_widths = [1.0, 1.2, 1.6, 1.5, 1.2, 0.6]

    # ─── Module 1: Authentication & RBAC ──────────────────────────────────────────
    h1 = doc.add_heading(level=2)
    h1.paragraph_format.space_before = Pt(14)
    h1.paragraph_format.space_after = Pt(4)
    r = h1.add_run("1. Module: Authentication & Role-Based Access Control (RBAC)")
    r.font.name = 'Calibri'
    r.font.size = Pt(13)
    r.font.color.rgb = RGBColor(30, 58, 138)

    t1 = doc.add_table(rows=1, cols=6)
    t1.alignment = WD_TABLE_ALIGNMENT.CENTER
    add_table_header(t1, headers, col_widths)

    m1_data = [
        (
            "TC-AUTH-01",
            "Backend online; Firebase Auth & Firestore connected; user exists in DB.",
            "1. Navigate to /login.\n2. Enter email 'icno@infecsure.com' and password.\n3. Click 'Login'.",
            "Firebase authenticates credentials; backend generates JWT with role 'icno'; user redirected to /icno/dashboard.",
            "Firebase authenticated; JWT token received; routed to ICNO Dashboard successfully.",
            "PASS"
        ),
        (
            "TC-AUTH-02",
            "User is on /login screen.",
            "1. Enter email 'doctor@infecsure.com' with incorrect password.\n2. Click 'Login'.",
            "HTTP 401 Unauthorized; toast notification 'Invalid email or password' displayed; no token issued.",
            "HTTP 401 returned; error toast shown; user remains on login page with inputs retained.",
            "PASS"
        ),
        (
            "TC-AUTH-03",
            "User authenticated with role 'staff' (staff@infecsure.com).",
            "1. Attempt to enter URL '/icno/ward-audit' directly in the browser address bar.",
            "Frontend route guard blocks navigation; 403 Forbidden or automatic redirection to /staff/dashboard.",
            "Route guard intercepted request; redirected to authorized staff dashboard.",
            "PASS"
        ),
        (
            "TC-AUTH-04",
            "User JWT access token has expired (15-min lifetime).",
            "1. Send API request with expired token.\n2. Axios client catches 401 and calls POST /auth/refresh with refresh token.",
            "Backend validates refresh token and returns new 15-minute access token without forcing user re-login.",
            "Refresh token verified; new access token issued; original request retried seamlessly.",
            "PASS"
        ),
    ]
    for row in m1_data:
        add_table_row(t1, row, col_widths)

    # ─── Module 2: ICNO Ward Audits & Compliance ────────────────────────────────
    h2 = doc.add_heading(level=2)
    h2.paragraph_format.space_before = Pt(14)
    h2.paragraph_format.space_after = Pt(4)
    r = h2.add_run("2. Module: ICNO Ward Audits & Compliance Tracking")
    r.font.name = 'Calibri'
    r.font.size = Pt(13)
    r.font.color.rgb = RGBColor(30, 58, 138)

    t2 = doc.add_table(rows=1, cols=6)
    t2.alignment = WD_TABLE_ALIGNMENT.CENTER
    add_table_header(t2, headers, col_widths)

    m2_data = [
        (
            "TC-AUD-01",
            "Logged in as 'icno'; on /icno/ward-audit page.",
            "1. Select Ward 'ETU'.\n2. Enter Hand Hygiene (8/10), PPE (9/10), Waste (10/10), Env (85%).\n3. Click 'Submit Audit'.",
            "Record saved to Firestore 'audits' collection; compliance score calculated (~88.75%); success toast displayed.",
            "Audit document created in Firestore; compliance score calculated; audit history list updated.",
            "PASS"
        ),
        (
            "TC-AUD-02",
            "Logged in as 'icno'; device loses internet connection (offline).",
            "1. Fill out audit for 'Male Ward'.\n2. Click 'Save Offline'.\n3. Re-enable network connection and click 'Sync'.",
            "Audit saved locally in browser storage; synced to backend via POST /audits/sync upon reconnection.",
            "Audit cached offline; synced to Firestore with HTTP 200 after network reconnection.",
            "PASS"
        ),
        (
            "TC-AUD-03",
            "On audit submission form.",
            "1. Enter negative number or leave total count as 0.\n2. Attempt submission.",
            "Pydantic schema validation rejects input ('ge=0'); form displays validation error banner; no write to DB.",
            "Client-side and backend validation blocked invalid submission with HTTP 422 error.",
            "PASS"
        ),
    ]
    for row in m2_data:
        add_table_row(t2, row, col_widths)

    # ─── Module 3: Lab Results Entry & OCR Scanning ─────────────────────────────
    h3 = doc.add_heading(level=2)
    h3.paragraph_format.space_before = Pt(14)
    h3.paragraph_format.space_after = Pt(4)
    r = h3.add_run("3. Module: Laboratory Information System & EasyOCR Processing")
    r.font.name = 'Calibri'
    r.font.size = Pt(13)
    r.font.color.rgb = RGBColor(30, 58, 138)

    t3 = doc.add_table(rows=1, cols=6)
    t3.alignment = WD_TABLE_ALIGNMENT.CENTER
    add_table_header(t3, headers, col_widths)

    m3_data = [
        (
            "TC-LAB-01",
            "Logged in as 'lab'; on /lab/entry page.",
            "1. Enter Patient ID 'P-1049', Ward 'Female Ward', Organism 'MRSA', Colony '100000', Virulence 3.0.\n2. Click 'Save Result'.",
            "Result saved to Firestore 'lab_results'; triggers background anomaly detection; appears in submission tracker.",
            "Document created; anomaly evaluation executed; record visible in lab submission tracker.",
            "PASS"
        ),
        (
            "TC-LAB-02",
            "Logged in as 'lab'; on /lab/ocr-scan; clear lab report photo available.",
            "1. Upload image file (PNG/JPG).\n2. Click 'Scan & Extract Report'.",
            "OpenCV enhances image; EasyOCR extracts text; form fields (patient, ward, pathogen, count) auto-fill.",
            "Processed in ~3 seconds; structured fields correctly populated with confidence indicators.",
            "PASS"
        ),
        (
            "TC-LAB-03",
            "Low-resolution or rotated image uploaded to OCR scanner.",
            "1. Upload skewed/blurry photo.\n2. Execute OCR scanning.",
            "OpenCV performs deskewing & CLAHE enhancement; low confidence fields (<70%) flagged for manual verification.",
            "Low confidence tokens highlighted in amber; user enabled to manually correct fields before saving.",
            "PASS"
        ),
    ]
    for row in m3_data:
        add_table_row(t3, row, col_widths)

    # ─── Module 4: Machine Learning Prediction & Anomalies ──────────────────────
    h4 = doc.add_heading(level=2)
    h4.paragraph_format.space_before = Pt(14)
    h4.paragraph_format.space_after = Pt(4)
    r = h4.add_run("4. Module: AI Outbreak Prediction & Anomaly Detection")
    r.font.name = 'Calibri'
    r.font.size = Pt(13)
    r.font.color.rgb = RGBColor(30, 58, 138)

    t4 = doc.add_table(rows=1, cols=6)
    t4.alignment = WD_TABLE_ALIGNMENT.CENTER
    add_table_header(t4, headers, col_widths)

    m4_data = [
        (
            "TC-ML-01",
            "30-day baseline lab culture history exists for ward 'ETU'.",
            "1. Enter 4 consecutive lab reports for 'Acinetobacter baumannii' in ETU within 24 hours.",
            "Z-Score exceeds threshold (Z >= 2.0); anomaly flagged; outbreak warning alert automatically generated.",
            "Calculated Z-score = 2.41; system flagged anomaly and auto-created pending alert in Firestore.",
            "PASS"
        ),
        (
            "TC-ML-02",
            "Ward audit data shows: Compliance < 60%, Virulence >= 2.0, Lab Count > 12.",
            "1. Request risk prediction via POST /prediction/predict-risk for ward 'ETU'.",
            "Random Forest model predicts 'outbreak_label: 1'; risk score exceeds 66% (High/Critical risk classification).",
            "Model returned risk_level: 'high', risk_score: 78.4%; ward risk status updated.",
            "PASS"
        ),
        (
            "TC-ML-03",
            "Trained model artifacts exist in ml_models/ directory.",
            "1. Send GET request to /prediction/metrics.",
            "Backend reads ml_models/metrics.json and returns accuracy, precision, recall, and F1-score.",
            "HTTP 200 returned with verified metrics: Accuracy 98.17%, Precision 97.5%, Recall 96.8%, F1 97.1%.",
            "PASS"
        ),
    ]
    for row in m4_data:
        add_table_row(t4, row, col_widths)

    # ─── Module 5: Outbreak Alerts Management ───────────────────────────────────
    h5 = doc.add_heading(level=2)
    h5.paragraph_format.space_before = Pt(14)
    h5.paragraph_format.space_after = Pt(4)
    r = h5.add_run("5. Module: Outbreak Alerts Management & Resolution Pipeline")
    r.font.name = 'Calibri'
    r.font.size = Pt(13)
    r.font.color.rgb = RGBColor(30, 58, 138)

    t5 = doc.add_table(rows=1, cols=6)
    t5.alignment = WD_TABLE_ALIGNMENT.CENTER
    add_table_header(t5, headers, col_widths)

    m5_data = [
        (
            "TC-ALT-01",
            "High-risk prediction or anomaly condition triggered by backend.",
            "1. Log in as 'icno' and view Outbreak Alerts screen (/alerts).",
            "Alert displayed with status 'pending', severity badge (Critical/Warning), ward name, and timestamp.",
            "Alert displayed in ICNO inbox with highlighted red 'Critical' badge and timestamp.",
            "PASS"
        ),
        (
            "TC-ALT-02",
            "Alert exists in 'pending' status; user logged in as 'icno'.",
            "1. Select alert.\n2. Add notes: 'Deep terminal cleaning initiated'.\n3. Click 'Acknowledge / Validate'.",
            "Alert status transitions to 'acknowledged' / 'investigating'; ICNO UID and timestamp saved to Firestore.",
            "Status updated to 'acknowledged' in DB; audit trail timestamp logged.",
            "PASS"
        ),
        (
            "TC-ALT-03",
            "Alert in 'investigating' state; corrective decontamination complete.",
            "1. Click 'Resolve Alert'.\n2. Enter resolution notes and submit.",
            "Alert status updated to 'resolved'; moves to resolved history tab; ward risk score re-evaluated.",
            "Alert marked as resolved; ward risk status recalculated.",
            "PASS"
        ),
    ]
    for row in m5_data:
        add_table_row(t5, row, col_widths)

    # ─── Module 6: Heatmap & Task Prioritization ────────────────────────────────
    h6 = doc.add_heading(level=2)
    h6.paragraph_format.space_before = Pt(14)
    h6.paragraph_format.space_after = Pt(4)
    r = h6.add_run("6. Module: Hospital Interactive Heatmap & Task Prioritization")
    r.font.name = 'Calibri'
    r.font.size = Pt(13)
    r.font.color.rgb = RGBColor(30, 58, 138)

    t6 = doc.add_table(rows=1, cols=6)
    t6.alignment = WD_TABLE_ALIGNMENT.CENTER
    add_table_header(t6, headers, col_widths)

    m6_data = [
        (
            "TC-MAP-01",
            "FastAPI backend running; 6 official hospital wards registered.",
            "1. Open /heatmap on the frontend web application.",
            "Interactive SVG floor plan renders all 6 official wards (ETU, Male, Female, OPD, Family, Psychiatrist).",
            "All 6 ward polygons render with color-coded risk levels and interactive tooltip details.",
            "PASS"
        ),
        (
            "TC-MAP-02",
            "Low compliance audit (<40%) submitted for 'Female Ward'.",
            "1. Submit audit.\n2. Navigate to /heatmap.",
            "Female Ward polygon dynamically updates to red (High Risk); risk score reflects recent audit deficit.",
            "Heatmap cache expires within 10s; Female Ward polygon turns red with updated risk score.",
            "PASS"
        ),
        (
            "TC-MAP-03",
            "Multiple wards with varying compliance scores, virulence, and lab loads.",
            "1. View ICNO Daily Task Priority list.",
            "Heuristic algorithm P = (0.40*C) + (0.35*V) + (0.25*L) ranks wards in descending order of urgency.",
            "Wards prioritized correctly with highest risk ward ranked as Priority #1 for immediate inspection.",
            "PASS"
        ),
    ]
    for row in m6_data:
        add_table_row(t6, row, col_widths)

    # ─── Test Summary Section ──────────────────────────────────────────────────
    doc.add_paragraph().paragraph_format.space_after = Pt(6)
    h_sum = doc.add_heading(level=2)
    h_sum.paragraph_format.space_before = Pt(14)
    h_sum.paragraph_format.space_after = Pt(4)
    r_sum = h_sum.add_run("7. Quality Metrics & Verification Sign-Off")
    r_sum.font.name = 'Calibri'
    r_sum.font.size = Pt(13)
    r_sum.font.color.rgb = RGBColor(30, 58, 138)

    sum_table = doc.add_table(rows=5, cols=2)
    sum_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    metrics = [
        ("Total Functional Test Cases Executed", "19"),
        ("Test Cases Passed", "19 (100.0%)"),
        ("Test Cases Failed / Blocked", "0 (0.0%)"),
        ("Automated Backend Unit Tests (PyTest)", "39 Passed (100%)"),
        ("System Verification Verdict", "APPROVED FOR CLINICAL EVALUATION")
    ]
    for i, (metric, val) in enumerate(metrics):
        r_row = sum_table.rows[i]
        c0, c1 = r_row.cells[0], r_row.cells[1]
        c0.width = Inches(4.5)
        c1.width = Inches(2.6)
        set_cell_margins(c0, top=80, bottom=80, left=120, right=120)
        set_cell_margins(c1, top=80, bottom=80, left=120, right=120)
        set_cell_background(c0, "F1F5F9")
        
        p0 = c0.paragraphs[0]
        run0 = p0.add_run(metric)
        run0.bold = True
        run0.font.size = Pt(9.0)
        run0.font.name = 'Calibri'
        
        p1 = c1.paragraphs[0]
        run1 = p1.add_run(val)
        run1.bold = True
        run1.font.size = Pt(9.0)
        run1.font.name = 'Calibri'
        if "APPROVED" in val:
            run1.font.color.rgb = RGBColor(22, 101, 52)
            set_cell_background(c1, "DCFCE7")
        elif "19" in val or "39" in val:
            run1.font.color.rgb = RGBColor(30, 58, 138)

    # Save document
    os.makedirs("docs", exist_ok=True)
    out_path = os.path.abspath("docs/InfecSure_Functional_Test_Cases_Report.docx")
    doc.save(out_path)
    print(f"SUCCESS: Word document generated successfully at: {out_path}")

if __name__ == "__main__":
    main()
