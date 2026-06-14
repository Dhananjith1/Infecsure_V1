import sys
import os
import random
from datetime import datetime, timedelta
import firebase_admin
from firebase_admin import firestore

print("==================================================")
print("🚀 InfecSure DIRECT FIRESTORE SEEDER ENGINE (1000+ ROWS)")
print("==================================================")

# ── 1. Firestore initialization ──────────────────────────────────────────────
import os
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.config import db
print("✅ Direct Database Connection Established!")

def rand_date(days_back=180):
    d = datetime.utcnow() - timedelta(days=random.randint(0, days_back))
    return d.strftime("%Y-%m-%d %H:%M:%S")

def progress(label, count, total):
    bar = "█" * int((count / total) * 20)
    print(f"\r  {label} [{bar:<20}] {count}/{total}", end="", flush=True)

# ── 2. Create Wards ──────────────────────────────────────────────────────────
WARD_DEFS = [
    {"name": "Male Medical Ward",    "ward_type": "general",   "floor": "1", "bed_count": 30},
    {"name": "Male Surgical Ward",   "ward_type": "surgical",  "floor": "1", "bed_count": 25},
    {"name": "Male Isolated Ward",   "ward_type": "icu",       "floor": "1", "bed_count": 10},
    {"name": "Female Medical Ward",  "ward_type": "general",   "floor": "2", "bed_count": 30},
    {"name": "Female Surgical Ward", "ward_type": "surgical",  "floor": "2", "bed_count": 25},
    {"name": "Female Isolated Ward", "ward_type": "icu",       "floor": "2", "bed_count": 10},
]
ward_ids = []
for wd in WARD_DEFS:
    ref = db.collection("wards").document()
    wd["ward_id"] = ref.id
    ref.set(wd)
    ward_ids.append(ref.id)

# ── 3. Pathogens ─────────────────────────────────────────────────────────────
pathogens = [
    {"pathogen_id": "p_mrsa", "name": "MRSA", "risk_level": "critical"},
    {"pathogen_id": "p_kleb", "name": "Klebsiella pneumoniae", "risk_level": "high"},
    {"pathogen_id": "p_vre", "name": "VRE", "risk_level": "high"},
    {"pathogen_id": "p_psae", "name": "Pseudomonas aeruginosa", "risk_level": "moderate"}
]
for p in pathogens:
    db.collection("pathogens").document(p["pathogen_id"]).set(p)

# ── 4. Ingest 300 Audits (Batch) ─────────────────────────────────────────────
print("\n⏳ Ingesting 300 Audits into Firestore...")
audit_batch = db.batch()
for i in range(300):
    ref = db.collection("audits").document()
    audit_batch.set(ref, {
        "audit_id": ref.id,
        "ward_id": random.choice(ward_ids),
        "hand_hygiene_score": random.randint(60, 100),
        "ppe_score": random.randint(60, 100),
        "environmental_score": random.randint(60, 100),
        "overall_compliance_score": random.randint(60, 100),
        "created_at": rand_date(),
        "remarks": "Routine compliance audit"
    })
    if (i + 1) % 100 == 0 or i == 299:
        audit_batch.commit()
        audit_batch = db.batch()
    progress("Audits Progress", i+1, 300)

# ── 5. Ingest 600 Lab Results (Batch) ────────────────────────────────────────
print("\n\n⏳ Ingesting 600 Lab Results into Firestore...")
lab_batch = db.batch()
for i in range(600):
    ref = db.collection("lab_results").document()
    p = random.choice(pathogens)
    lab_batch.set(ref, {
        "lab_result_id": ref.id,
        "ward_id": random.choice(ward_ids),
        "patient_id": f"pat_{1000 + i}",
        "pathogen_id": p["pathogen_id"],
        "pathogen_name": p["name"],
        "colony_count": random.randint(100, 15000),
        "result_date": rand_date(),
        "created_at": rand_date()
    })
    if (i + 1) % 100 == 0 or i == 599:
        lab_batch.commit()
        lab_batch = db.batch()
    progress("Lab Results Progress", i+1, 600)

print("\n\n==================================================")
print("🎉 SUCCESS! 1000+ RECORDS DIRECTLY INJECTED INTO FIRESTORE!")
print("==================================================")