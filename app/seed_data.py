import requests
from datetime import datetime

BASE_URL = "http://localhost:8000"

print("🔑 Logging in to get access token...")
login_data = {"email": "icno@infecsure.com", "password": "icnoPassword123"}

try:
    login_response = requests.post(f"{BASE_URL}/auth/login", json=login_data)
    login_response.raise_for_status()
    token = login_response.json().get("access_token")
    headers = {"Authorization": f"Bearer {token}"}
    print("✅ Login Successful!")
except Exception as e:
    print(f"❌ Cannot connect to server. Error: {e}")
    exit()

print("\n🚀 Injecting Data...\n" + "="*50)

def sub_post(label, endpoint, payload):
    try:
        res = requests.post(f"{BASE_URL}{endpoint}", json=payload, headers=headers)
        if res.status_code in (200, 201):
            print(f"✅ {label} Table Status {res.status_code}!")
        else:
            print(f"❌ {label} Table Status {res.status_code}! Backend Error Details:")
            print(res.json())
        print("-" * 30)
        return res
    except Exception as e:
        print(f"❌ {label} Failed: {e}")
        return None

# 1. Users
user_res = sub_post("users", "/users/", {
    "email": f"staff_{datetime.now().strftime('%H%M%S')}@infecsure.com",
    "password": "staffPassword123",
    "role": "doctor",
    "full_name": "Dr. Smith"
})
user_id = user_res.json().get("uid") if user_res and user_res.ok else None
print(f">>> user_id: {user_id}")

# 2. Wards
ward_res = sub_post("wards", "/wards/", {
    "name": "ICU Ward",
    "ward_type": "icu",
    "floor": "2",
    "bed_count": 15
})
ward_id = ward_res.json().get("ward_id") if ward_res and ward_res.ok else None
print(f">>> ward_id: {ward_id}")

if not ward_id:
    print("❌ Cannot continue — ward_id is None.")
    exit()

# 3. Pathogens
pathogen_res = sub_post("pathogens", "/pathogens/", {
    "name": "TB",
    "category": "Bacterial",
    "type": "Bacterial",
    "risk_level": "high"
})
pathogen_id = pathogen_res.json().get("pathogen_id") if pathogen_res and pathogen_res.ok else None
print(f">>> pathogen_id: {pathogen_id}")

if not pathogen_id:
    print("❌ Cannot continue — pathogen_id is None.")
    exit()

# 4. Audits
sub_post("audits", "/audits/", {
    "ward_id": ward_id,
    "garbage_removed": True,
    "toilet_hygiene_status": True,
    "lighting_adequate": True,
    "hand_hygiene_score": 85.5,
    "ppe_score": 90.0,
    "waste_segregation_score": 80.0,
    "environmental_score": 88.0,
    "overall_compliance_score": 87.75,
    "icno_notes": "Seed record"
})

# 5. Lab Results — match EXACTLY what LabResultCreate model expects
sub_post("lab-results", "/lab-results/", {
    "ward_id": ward_id,
    "pathogen_id": pathogen_id,
    "pathogen_name": "TB",                          # ✅ required, denormalized
    "specimen_type": "sputum",                      # ✅ lowercase enum
    "result_date": datetime.now().isoformat(),       # ✅ full ISO datetime, not just date
    "colony_count": 10,                             # ✅ needed for ML Z-score
    "resistance_profile": [],                       # ✅ optional but explicit
    "antibiotic_sensitivity": {},                   # ✅ optional but explicit
    "patient_ward_location": "ICU-Bed-1",           # ✅ optional ward/bed ref
    "notes": "Seed record"
})

# 6. Notices
sub_post("notices", "/notices/", {
    "title": "Safety Update",
    "body": "Please ensure full PPE compliance.",
    "target_role": "Doctor"
})

print("=" * 50)
print("🎉 All done!")