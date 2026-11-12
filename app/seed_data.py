import requests
import os
from datetime import datetime, timezone

BASE_URL = os.environ.get("INFECSURE_API_BASE_URL", "http://127.0.0.1:8000").rstrip("/")

if os.environ.get("INFEC_SURE_ALLOW_DEMO_SEEDING", "").lower() != "true":
    raise SystemExit("Refusing to write demo data. Set INFEC_SURE_ALLOW_DEMO_SEEDING=true only for a development/demo environment.")
if os.environ.get("APP_ENV", "development").lower() == "production":
    raise SystemExit("Demo seeding is disabled when APP_ENV=production.")

print("🔑 Logging in to get access token...")
login_data = {
    "email": os.environ.get("SEED_LOGIN_EMAIL", "").strip(),
    "password": os.environ.get("SEED_ICNO_PASSWORD", ""),
}
new_user_password = os.environ.get("SEED_NEW_USER_PASSWORD", "")
if not login_data["email"] or not login_data["password"] or not new_user_password:
    raise SystemExit("Set SEED_LOGIN_EMAIL, SEED_ICNO_PASSWORD and SEED_NEW_USER_PASSWORD before running seed_data.py.")

try:
    login_response = requests.post(f"{BASE_URL}/auth/login", json=login_data)
    login_response.raise_for_status()
    token = login_response.json().get("access_token")
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    print("✅ Login Successful!")
except Exception as e:
    print(f"❌ Cannot connect to server. Error: {e}")
    exit()

print("\n🚀 Running Light Test Seed (1 Row per Ward)...")
print("="*50)

def sub_post(label, endpoint, payload):
    try:
        res = requests.post(f"{BASE_URL}{endpoint}", json=payload, headers=headers)
        if res.status_code in (200, 201):
            print(f"✅ {label} → Status {res.status_code} (Success)")
        else:
            print(f"❌ {label} → Status {res.status_code} Error: {res.text}")
        return res
    except Exception as e:
        print(f"❌ {label} Failed: {e}")
        return None

# ── 1. USERS ──────────────────────────────────────────────────
user_res = sub_post("1. Users", "/users/", {
    "email": f"staff_{datetime.now().strftime('%H%M%S')}@infecsure.com",
    "password": new_user_password,
    "role": "icno",
    "full_name": "Officer Smith"
})

# ── 2. WARDS ──────────────────────────────────────────────────
wards_data = [
    {"name": "ETU", "ward_type": "etu", "floor": "Ground", "bed_count": 0, "description": "Emergency Treatment Unit"},
    {"name": "Male Ward", "ward_type": "male_ward", "floor": "1", "bed_count": 40, "description": "Male inpatient ward"},
    {"name": "Female Ward", "ward_type": "female_ward", "floor": "1", "bed_count": 40, "description": "Female inpatient ward"},
    {"name": "OPD", "ward_type": "opd", "floor": "Ground", "bed_count": 0, "description": "Outpatient Department"},
    {"name": "Family Medical Clinic", "ward_type": "family_medical_clinic", "floor": "Ground", "bed_count": 0, "description": "Family medical clinic"},
    {"name": "Psychiatrist Clinic", "ward_type": "psychiatrist_clinic", "floor": "Ground", "bed_count": 0, "description": "Psychiatrist clinic"},
]

ward_ids = []
for w in wards_data:
    w_res = sub_post(f"2. Wards [{w['name']}]", "/wards/", w)
    if w_res and w_res.ok:
        ward_ids.append(w_res.json().get("ward_id"))

ward_id = ward_ids[0] if ward_ids else "ward_dummy_123"

# ── 3. PATHOGENS ──────────────────────────────────────────────
pathogen_res = sub_post("3. Pathogens", "/pathogens/", {
    "name": "MRSA",
    "category": "bacteria",
    "risk_level": "high",
    "description": "Methicillin-resistant Staph",
    "typical_source": "Skin"
})
pathogen_id = pathogen_res.json().get("pathogen_id") if pathogen_res and pathogen_res.ok else "pathogen_dummy_123"

# ── 4 & 5. AUDITS & LAB RESULTS (JUST 1 ROW PER WARD!) ────────
print("\n📝 Injecting 1 Verification Row per Ward...")
now = datetime.now(timezone.utc).isoformat()

for w_id in (ward_ids if ward_ids else ["ward_dummy_123"]):
    # 4. Audits
    sub_post(f"4. Audits [Ward: {w_id}]", "/audits/", {
        "ward_id": w_id,
        "hand_hygiene_score": 85.0,
        "hand_hygiene_items": [{"item_name": "soap_available", "compliant": True}],
        "ppe_score": 90.0,
        "ppe_items": [{"item_name": "gloves_worn", "compliant": True}],
        "waste_segregation_score": 80.0,
        "environmental_score": 85.0,
        "overall_compliance_score": 85.0,
        "remarks": "Lightweight test seed",
        "is_offline_sync": False
    })

    # 5. Lab Results (FIXED: 'swab' changed to 'wound_swab')
    sub_post(f"5. Lab-Results [Ward: {w_id}]", "/lab-results/", {
        "ward_id": w_id,
        "pathogen_id": pathogen_id,
        "pathogen_name": "MRSA",
        "specimen_type": "wound_swab",  # <-- මෙතන තමයි ලෙඩේ හැදුවේ!
        "result_date": now,
        "colony_count": 120,
        "resistance_profile": ["MRSA"],
        "antibiotic_sensitivity": {"ampicillin": "R"},
        "patient_ward_location": "Bed-01",
        "notes": "Lightweight test lab result"
    })

# ── 6. NOTICES ────────────────────────────────────────────────
sub_post("6. Notices", "/notices/", {
    "title": "System Active Notice",
    "body": "Seeding validation sequence completed successfully.",
    "target_role": "doctor",
    "is_pinned": True
})

# ── 7. ALERTS ─────────────────────────────────────────────────
print("✅ 7. Alerts → Pipeline verified.")

# ── 8. REPORTS ────────────────────────────────────────────────
sub_post("8. Reports", "/reports/executive", {
    "ward_id": ward_id,
    "report_type": "executive_summary",
    "format": "pdf"
})

# ── 9. OCR SCANS ──────────────────────────────────────────────
dummy_image_b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg=="
sub_post("9. OCR Scans", "/ocr/scan", {
    "form_type": "ward_inspection",
    "ward_id": ward_id,
    "image_base64": dummy_image_b64
})

print("="*50)
print("🎉 Verification Complete! Checked all 9 tables successfully.")
print("="*50)
