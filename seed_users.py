import firebase_admin
from firebase_admin import credentials, firestore

# 1. Initialize Firebase (make sure your json file name matches what you have)
cred = credentials.Certificate("firebase-service-account.json")
firebase_admin.initialize_app(cred)
db = firestore.client()

# 2. Define the exact users and UIDs you provided
users_data = {
    "iOFbhqckWxR91foMqHDiofnymRo2": {
        "uid": "iOFbhqckWxR91foMqHDiofnymRo2",
        "email": "icno@infecsure.com",
        "full_name": "ICNO Officer",
        "role": "icno",
        "is_active": True
    },
    "mMJCyXbla9WN1R9TNiiYD4Krkg52": {
        "uid": "mMJCyXbla9WN1R9TNiiYD4Krkg52",
        "email": "matron@infecsure.com",
        "full_name": "Nursing Sister",
        "role": "sister",
        "is_active": True
    },
    "tDCbLyTBEhOPPBfiRxq8CtoxFdq1": {
        "uid": "tDCbLyTBEhOPPBfiRxq8CtoxFdq1",
        "email": "lab@infecsure.com",
        "full_name": "Lab Technician",
        "role": "lab",
        "is_active": True
    },
    "a21Rznq6e8ZdDvyYfJbrmkIqtQq1": {
        "uid": "a21Rznq6e8ZdDvyYfJbrmkIqtQq1",
        "email": "doctor@infecsure.com",
        "full_name": "Supervising Doctor",
        "role": "doctor",
        "is_active": True
    },
    "cXupavivZie8r7DwdCm9jrdrruv1": {
        "uid": "cXupavivZie8r7DwdCm9jrdrruv1",
        "email": "staff@infecsure.com",
        "full_name": "Hospital Staff",
        "role": "staff",
        "is_active": True
    }
}

# 3. Write them to Firestore
print("Seeding users to Firestore...")
for uid, data in users_data.items():
    db.collection("users").document(uid).set(data)
    print(f"Added user: {data['email']} with role '{data['role']}'")

print("Database seeding complete!")