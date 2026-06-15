import pandas as pd
import numpy as np
import random
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score
import joblib
import os

print("1. Starting synthetic data generation (for the 6 official wards only)...")

# Generate 1000 data records
data = []

# Confirmed official hospital structure
wards = [
    "etu", 
    "male_ward", 
    "female_ward", 
    "opd", 
    "family_medical_clinic", 
    "psychiatrist_clinic"
]

for i in range(1000):
    ward = random.choice(wards)
    
    # Generate random features (scores and counts)
    hygiene = random.randint(30, 100)
    ppe = random.randint(30, 100)
    waste = random.randint(30, 100)
    env_score = random.randint(30, 100)
    lab_count = random.randint(0, 20)
    anomaly_count = random.randint(0, 5)
    virulence = round(random.uniform(0.1, 1.0), 2)
    days_since_audit = random.randint(1, 30)
    
    # Logic to determine outbreak risk (Labels)
    if (hygiene < 50 or env_score < 50) and (lab_count > 8 or anomaly_count > 2) and virulence > 0.6:
        outbreak = 1
    elif lab_count > 15:
        outbreak = 1
    else:
        outbreak = 0
        
    # Add some noise to make the AI training more realistic
    if random.random() < 0.05:
        outbreak = 1 if outbreak == 0 else 0
        
    data.append([ward, f"2026-06-{random.randint(1,28):02d}", hygiene, ppe, waste, env_score, 
                 lab_count, anomaly_count, virulence, days_since_audit, outbreak])

# Create a DataFrame and save as CSV
columns = ["ward_id", "date", "hand_hygiene_score", "ppe_score", "waste_segregation_score", 
           "environmental_score", "recent_lab_count", "anomaly_count", "max_virulence", 
           "days_since_last_audit", "outbreak_label"]

df = pd.DataFrame(data, columns=columns)
df.to_csv("synthetic_outbreak_data.csv", index=False)
print("✅ synthetic_outbreak_data.csv successfully created!")

# --- Model Training Section ---

print("\n2. Starting Random Forest Model training...")

# Drop ward_id and date as they are not needed for training features
X = df.drop(columns=["ward_id", "date", "outbreak_label"])
y = df["outbreak_label"]

# Split data into Train (80%) and Test (20%) sets
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

# Initialize and train the Random Forest Classifier
model = RandomForestClassifier(n_estimators=100, random_state=42)
model.fit(X_train, y_train)

# Check the accuracy of the AI model
predictions = model.predict(X_test)
accuracy = accuracy_score(y_test, predictions)
print(f"✅ Training complete! Model Accuracy: {accuracy * 100:.2f}%\n")

from sklearn.metrics import classification_report
print("\n--- Detailed Classification Report ---")
print(classification_report(y_test, predictions))

# Save the trained model as a file
os.makedirs("ml_models", exist_ok=True)
joblib.dump(model, "ml_models/rf_outbreak_model.pkl")
print("✅ Model saved as 'ml_models/rf_outbreak_model.pkl'. Ready for backend integration!")