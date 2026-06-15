from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer
from pydantic import BaseModel
import joblib
import os
import numpy as np

router = APIRouter(prefix="/ai-engine", tags=["Outbreak Prediction"])

# Swagger UI එකට මේක Secure Endpoint එකක් කියලා අඳුරගන්න මේක දානවා
security = HTTPBearer()

# අලුත් රෝහල් ව්‍යුහය (නිල අංශ 6 පමණි)
ALLOWED_WARDS = [
    "etu", 
    "male_ward", 
    "female_ward", 
    "opd", 
    "family_medical_clinic", 
    "psychiatrist_clinic"
]

# Train කරපු Model එක Load කිරීම
MODEL_PATH = "ml_models/rf_outbreak_model.pkl"
try:
    rf_model = joblib.load(MODEL_PATH)
except Exception as e:
    print(f"Warning: Model file not found at {MODEL_PATH}. Error: {e}")
    rf_model = None

class WardPredictionRequest(BaseModel):
    hand_hygiene_score: float
    ppe_score: float
    waste_segregation_score: float
    environmental_score: float
    recent_lab_count: int
    anomaly_count: int
    max_virulence: float
    days_since_last_audit: int

# dependencies=[Depends(security)] දැම්මම Swagger එකේ අර ඉබි යතුරු (Padlock) අයිකන් එක වැටෙනවා
@router.post("/{ward_id}/predict", dependencies=[Depends(security)])
async def predict_ward_risk(ward_id: str, data: WardPredictionRequest):
    if ward_id not in ALLOWED_WARDS:
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid ward_id. Allowed wards are: {', '.join(ALLOWED_WARDS)}"
        )

    if rf_model is None:
        raise HTTPException(
            status_code=500, 
            detail="ML Model is not trained or loaded. Please run train_ai.py first."
        )

    features = np.array([[
        data.hand_hygiene_score,
        data.ppe_score,
        data.waste_segregation_score,
        data.environmental_score,
        data.recent_lab_count,
        data.anomaly_count,
        data.max_virulence,
        data.days_since_last_audit
    ]])

    probabilities = rf_model.predict_proba(features)[0]
    risk_score = float(probabilities[1])

    return {
        "ward_id": ward_id,
        "risk_score": risk_score,
        "risk_level": "High" if risk_score > 0.7 else "Medium" if risk_score > 0.4 else "Low",
        "message": "Outbreak prediction calculated successfully using Random Forest Model."
    }