import pandas as pd
import numpy as np
import random
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, classification_report
import joblib
import os
import json

print("1. Starting synthetic data generation (for the 6 official wards only)...")

data = []
wards = ["etu", "male_ward", "female_ward", "opd", "family_medical_clinic", "psychiatrist_clinic"]

for i in range(3000):
    ward = random.choice(wards)
    
    hygiene = int(np.random.beta(8, 2) * 100)
    ppe = int(np.random.beta(8, 2) * 100)
    waste = int(np.random.beta(8, 2) * 100)
    env_score = int(np.random.beta(8, 2) * 100)
    
    lab_count = random.randint(0, 20)
    anomaly_count = random.randint(0, 5)
    
    # Virulence Class changed to exact 1, 2, or 3 as per spec
    virulence = float(random.randint(1, 3)) 
    days_since_audit = random.randint(1, 30)
    
    is_risk = False
    
    # EXACT RULE applied: C_hand < 0.60 AND C_waste < 0.65
    if hygiene < 60 and waste < 65:
        is_risk = True
    elif lab_count > 12 and virulence >= 2.0:
        is_risk = True
    elif anomaly_count >= 2 and env_score < 75:
        is_risk = True
        
    outbreak = 1 if is_risk else 0
    
    # Explicit 0.05 baseline probability seed
    baseline_infection_probability = 0.05  
    if random.random() < baseline_infection_probability:
        outbreak = 1 if outbreak == 0 else 0
        
    data.append([ward, f"2026-06-{random.randint(1,28):02d}", hygiene, ppe, waste, env_score, 
                 lab_count, anomaly_count, virulence, days_since_audit, outbreak])

columns = ["ward_id", "date", "hand_hygiene_score", "ppe_score", "waste_segregation_score", 
           "environmental_score", "recent_lab_count", "anomaly_count", "max_virulence", 
           "days_since_last_audit", "outbreak_label"]

df = pd.DataFrame(data, columns=columns)
df.to_csv("synthetic_outbreak_data.csv", index=False)
print("✅ synthetic_outbreak_data.csv successfully created matching EXACT specs!")

print("\n2. Starting Random Forest Model training...")

X = df.drop(columns=["ward_id", "date", "outbreak_label"])
y = df["outbreak_label"]

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

model = RandomForestClassifier(n_estimators=200, class_weight='balanced', random_state=42)
model.fit(X_train.values, y_train)

predictions = model.predict(X_test.values)

# Calculate LIVE Metrics
acc = accuracy_score(y_test, predictions)
prec = precision_score(y_test, predictions, zero_division=0)
rec = recall_score(y_test, predictions, zero_division=0)
f1 = f1_score(y_test, predictions, zero_division=0)

print(f"✅ Training complete! Model Accuracy: {acc * 100:.2f}%\n")
print(classification_report(y_test, predictions))

os.makedirs("ml_models", exist_ok=True)
joblib.dump(model, "ml_models/rf_outbreak_model.pkl")

# Save live metrics to be read by the API
live_metrics = {
    "accuracy": f"{acc * 100:.2f}%",
    "precision": f"{prec * 100:.2f}%",
    "recall": f"{rec * 100:.2f}%",
    "f1_score": f"{f1 * 100:.2f}%"
}
with open("ml_models/metrics.json", "w") as f:
    json.dump(live_metrics, f)

print("✅ Model & LIVE Metrics saved! Ready for backend integration.")