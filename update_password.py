import firebase_admin
from firebase_admin import credentials, auth

# 1. Firebase Initialize කිරීම
cred = credentials.Certificate("firebase-service-account.json")
# දැනටමත් initialize වෙලා නැත්නම් විතරක් initialize කරන්න
if not firebase_admin._apps:
    firebase_admin.initialize_app(cred)

# 2. ICNO ගේ UID එක සහ අලුත් Password එක
user_uid = "iOFbhqckWxR91foMqHDiofnymRo2"
new_password = "icno@123" # මේක ඔයාට මතක හිටින අලුත් password එකක් දෙන්න

try:
    # 3. Password එක Update කිරීම
    auth.update_user(
        user_uid,
        password=new_password
    )
    print(f"Success! ICNO user ගේ password එක '{new_password}' විදියට වෙනස් කරා.")
except Exception as e:
    print("Error එකක් ආවා:", e)