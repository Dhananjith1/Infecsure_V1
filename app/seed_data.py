import requests
from faker import Faker
import random

fake = Faker()
BASE_URL = "http://localhost:8000"

# =======================================================
# 1. LOGIN AND OBTAIN JWT ACCESS TOKEN
# =======================================================
print("🔑 Attempting to login to the server...")
login_data = {
    "email": "icno@infecsure.com",
    "password": "icnoPassword123"
}

try:
    login_response = requests.post(f"{BASE_URL}/auth/login", json=login_data)
    login_response.raise_for_status()
    token = login_response.json().get("access_token")
    print("✅ Login successful! Token obtained.")
except Exception as e:
    print(f"❌ Login failed. Please check if the backend server is running: {e}")
    exit()

headers = {
    "Authorization": f"Bearer {token}",
    "Content-Type": "application/json"
}

# =======================================================
# 2. SEED INITIAL WARDS DATA
# =======================================================
print("\n🏢 Creating default wards...")
wards = ["Ward-01 (Male)", "Ward-02 (Female)", "Ward-03 (ICU)", "Ward-04 (Pediatric)", "Ward-05 (Surgical)"]
ward_ids = ["W01", "W02", "W03", "W04", "W05"]

for i in range(5):
    ward_payload = {
        "ward_id": ward_ids[i],
        "name": wards[i],
        "capacity": random.randint(20, 50)
    }
    requests.post(f"{BASE_URL}/wards/", json=ward_payload, headers=headers)

pathogens = ["Dengue Virus", "Influenza A", "Salmonella", "MRSA", "Klebsiella"]
specimens = ["Blood", "Urine", "Nasopharyngeal Swab", "Sputum"]

# =======================================================
# 3. GENERATE AND INJECT 1000 LAB RESULTS (SYNTHETIC)
# =======================================================
print("\n🚀 Injecting 1000 synthetic lab results...")

for i in range(1, 1001):
    dummy_lab_result = {
        "ward_id": random.choice(ward_ids),
        "patient_name": fake.name(),
        "pathogen_name": random.choice(pathogens),
        "specimen_type": random.choice(specimens),
        "status": "Positive",
        "reported_at": fake.date_time_this_year().isoformat()
    }
    
    response = requests.post(f"{BASE_URL}/lab-results/", json=dummy_lab_result, headers=headers)
    
    if i % 100 == 0:
        print(f"📦 Progress: {i}/1000 records successfully sent to Firebase...")

print("\n🎉 Seeding completed successfully! Database is populated.")