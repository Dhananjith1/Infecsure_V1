import smtplib
import os
from dotenv import load_dotenv

# .env ෆයිල් එක කියවීම
load_dotenv()

SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", 587))
SMTP_USER = os.getenv("SMTP_USER")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")

print(f"ඔයාගේ ඊමේල් එක: {SMTP_USER}")
print("Gmail සර්වර් එකට සම්බන්ධ වීමට උත්සාහ කරයි...")

try:
    server = smtplib.SMTP(SMTP_HOST, SMTP_PORT)
    server.starttls() # ආරක්ෂිත කනෙක්ෂන් එකක් හැදීම
    server.login(SMTP_USER, SMTP_PASSWORD)
    print("✅ Success! Gmail එකට සාර්ථකව ලොග් වුණා. පාස්වර්ඩ් එක හරි!")
    server.quit()
except Exception as e:
    print(f"❌ Error එකක් ආවා: {e}")