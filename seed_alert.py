import os

if os.environ.get("INFEC_SURE_ALLOW_DEMO_SEEDING", "").lower() != "true":
    raise SystemExit("Refusing to write a demo alert. Set INFEC_SURE_ALLOW_DEMO_SEEDING=true only for a development/demo Firebase project.")
if os.environ.get("APP_ENV", "development").lower() == "production":
    raise SystemExit("Demo seeding is disabled when APP_ENV=production.")

from google.cloud import firestore

# This script writes synthetic test content; never point it at a production project.
db = firestore.Client.from_service_account_json(
    os.environ.get("FIREBASE_SERVICE_ACCOUNT_PATH", "firebase-service-account.json")
)

alert_id = "TEST-ALERT-123"
alert_data = {
    "id": alert_id,
    "ward": "Ward 04 (General)",
    "message": "Synthetic test alert; not a real clinical signal.",
    "risk_score": 85.0,
    "status": "pending",
    "source": "demo_seed_script",
}

db.collection("alerts").document(alert_id).set(alert_data)
print(f"Seeded synthetic demo alert: {alert_id}")
