from google.cloud import firestore

# 1. Credentials ෆයිල් එක කෙලින්ම දෙන්න
db = firestore.Client.from_service_account_json("firebase-service-account.json")

# 2. බොරු Alert එකක් Database එකට දැමීම
alert_id = "TEST-ALERT-123"
alert_data = {
    "id": alert_id,
    "ward": "Ward 04 (General)",
    "message": "High risk of Dengue outbreak detected.",
    "risk_score": 85.0,
    "status": "approved"
}

# 3. Firestore එකට Save කිරීම
db.collection("alerts").document(alert_id).set(alert_data)
print(f"Success! {alert_id} කියලා Alert එකක් Database එකට දැම්මා.")