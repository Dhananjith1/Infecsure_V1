import json
import urllib.request
import urllib.error
import firebase_admin
from firebase_admin import credentials, auth, firestore

def fix_matron():
    cred = credentials.Certificate("firebase-service-account.json")
    if not firebase_admin._apps:
        firebase_admin.initialize_app(cred)

    db = firestore.client()

    email = "matron@infecsure.com"
    password = "sister@123"

    print("Checking Firebase Auth for:", email)
    try:
        user = auth.get_user_by_email(email)
        print(f"Found in Firebase Auth: UID = {user.uid}, Email = {user.email}")
        auth.update_user(user.uid, password=password)
        print(f"Updated password in Firebase Auth to '{password}' for {email}")
    except auth.UserNotFoundError:
        print(f"User {email} NOT FOUND in Firebase Auth. Creating user...")
        user = auth.create_user(email=email, password=password, display_name="Nursing Sister")
        print(f"Created user in Firebase Auth with UID = {user.uid}")

    # Check and update Firestore users collection
    user_data = {
        "uid": user.uid,
        "email": email,
        "full_name": "Nursing Sister",
        "role": "sister",
        "is_active": True
    }
    db.collection("users").document(user.uid).set(user_data, merge=True)
    print(f"Synced Firestore user document for UID: {user.uid}")

    # Test login via Firebase Identity Toolkit REST API
    with open(".env", "r") as f:
        env_text = f.read()
    
    api_key = ""
    for line in env_text.splitlines():
        if line.startswith("FIREBASE_WEB_API_KEY="):
            api_key = line.split("=", 1)[1].strip()

    if not api_key:
        print("FIREBASE_WEB_API_KEY not found in .env")
        return

    url = f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={api_key}"
    payload = json.dumps({
        "email": email,
        "password": password,
        "returnSecureToken": True
    }).encode("utf-8")

    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode())
            print("\nVerification SUCCESS: Firebase REST API login succeeded!")
            print(f"User UID: {data.get('localId')}")
            print(f"Email: {data.get('email')}")
            print(f"Role in Firestore: {user_data['role']}")
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode()
        print(f"\nVerification FAILED: HTTP {e.code}: {err_msg}")

if __name__ == "__main__":
    fix_matron()
