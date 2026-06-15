"""
InfecSure — OCR Service
========================
Pipeline:
  1. Receive Base64-encoded image
  2. Decode → OpenCV preprocessing (deskew, denoise, threshold)
  3. EasyOCR text extraction with per-word confidence scores
  4. Structured field extraction for known form types
  5. Return OCRResult with confidence-flagged tokens
"""

from __future__ import annotations

import base64
import gc
import logging
import re
from typing import Any

logger = logging.getLogger(__name__)

CONFIDENCE_THRESHOLD = 0.70  # Below this → flagged for review

# Lazy singleton for EasyOCR reader (heavy init ~5s)
_ocr_reader = None

def _get_ocr_reader():
    """Lazy singleton for EasyOCR reader (heavy init ~5s)."""
    global _ocr_reader
    if _ocr_reader is None:
        try:
            import easyocr  # noqa: PLC0415
            _ocr_reader = easyocr.Reader(["en"], gpu=False, verbose=False)
        except ImportError:
            logging.warning("EasyOCR not available — OCR features disabled.")
            _ocr_reader = False  # sentinel: attempted but unavailable
    return _ocr_reader if _ocr_reader else None


# ─── Image Preprocessing ──────────────────────────────────────────────────────

def _preprocess_image(img_bytes: bytes):
    import numpy as np  # noqa: PLC0415
    try:
        import cv2  # noqa: PLC0415
        cv2_available = True
    except ImportError:
        cv2_available = False
        logging.warning("OpenCV not available — image preprocessing disabled.")

    if not cv2_available:
        return np.frombuffer(img_bytes, dtype=np.uint8)

    arr = np.frombuffer(img_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    del arr

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    del img

    denoised = cv2.GaussianBlur(gray, (3, 3), 0)
    del gray

    thresh = cv2.adaptiveThreshold(
        denoised, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        11, 2
    )
    del denoised

    coords = np.column_stack(np.where(thresh < 128))
    if len(coords) > 10:
        angle = cv2.minAreaRect(coords)[-1]
        if angle < -45:
            angle = 90 + angle
        if abs(angle) > 0.5:
            h, w = thresh.shape
            center = (w // 2, h // 2)
            M = cv2.getRotationMatrix2D(center, angle, 1.0)
            thresh = cv2.warpAffine(
                thresh, M, (w, h),
                flags=cv2.INTER_CUBIC,
                borderMode=cv2.BORDER_REPLICATE,
            )
    return thresh


# ─── Master Ward Detector ────────────────────────────────────────────────────

def _smart_extract_ward(text_lower: str) -> str | None:
    """අංශ 6 සඳහා පොදු (Universal) Ward Detector එකක්"""
    if "female" in text_lower or "emale" in text_lower or "fe " in text_lower:
        return "female_ward"
    elif "male" in text_lower or "ma wad" in text_lower or "ma " in text_lower:
        return "male_ward"
    elif "etu" in text_lower or "emergency" in text_lower or "treat" in text_lower:
        return "etu"
    elif "opd" in text_lower or "out" in text_lower or "patient" in text_lower:
        return "opd"
    elif "family" in text_lower or "clinic" in text_lower or "fam" in text_lower:
        return "family_medical_clinic"
    elif "psychiatrist" in text_lower or "psych" in text_lower or "mental" in text_lower:
        return "psychiatrist_clinic"
    return None

# ─── Field Extractors සඳහා ෆෝම් වර්ග ──────────────────────────────────────────

def _extract_moh_fields(raw_text: str) -> dict[str, Any]:
    from datetime import datetime, timezone
    fields: dict[str, Any] = {}
    text_lower = raw_text.lower()

    ward = _smart_extract_ward(text_lower)
    if ward:
        fields["ward_id"] = ward

    if "covid" in text_lower or "cov" in text_lower or "sars" in text_lower:
        fields["pathogen_id"] = "covid_19"
        fields["pathogen_name"] = "COVID-19"
    elif "dengue" in text_lower or "deqque" in text_lower or "den" in text_lower:
        fields["pathogen_id"] = "dengue_virus"
        fields["pathogen_name"] = "Dengue"
    elif "influ" in text_lower or "flu" in text_lower:
        fields["pathogen_id"] = "influenza_a"
        fields["pathogen_name"] = "Influenza"

    if "blood" in text_lower or "blo" in text_lower or "8peeimen" in text_lower:
        fields["specimen_type"] = "blood"
    elif "urine" in text_lower or "uri" in text_lower:
        fields["specimen_type"] = "urine"
    elif "swab" in text_lower or "saliva" in text_lower:
        fields["specimen_type"] = "swab"

    number_match = re.search(r"\b(\d+)\b", text_lower)
    if number_match:
        fields["colony_count"] = int(number_match.group(1))

    fields["result_date"] = datetime.now(timezone.utc).isoformat()
    return fields


def _extract_audit_fields(raw_text: str) -> dict[str, Any]:
    from datetime import datetime, timezone
    fields: dict[str, Any] = {}
    text_lower = raw_text.lower()

    ward = _smart_extract_ward(text_lower)
    if ward:
        fields["ward_id"] = ward

    numbers = re.findall(r"\b(\d+)\b", text_lower)
    if len(numbers) >= 2:
        fields["total_staff"] = int(numbers[0])
        fields["compliant_staff"] = int(numbers[1])
        try:
            fields["calculated_compliance"] = round((int(numbers[1]) / int(numbers[0])) * 100, 1)
        except (ValueError, ZeroDivisionError):
            pass
    elif len(numbers) == 1:
        score = int(numbers[0])
        fields["overall_compliance_score"] = score if score <= 100 else 100

    fields["audit_date"] = datetime.now(timezone.utc).isoformat()
    return fields


def _extract_general_fields(raw_text: str) -> dict[str, Any]:
    fields: dict[str, Any] = {}
    text_lower = raw_text.lower()

    ward = _smart_extract_ward(text_lower)
    if ward:
        fields["ward_id"] = ward
        
    fields["document_type"] = "General/Other"
    fields["raw_text_preview"] = raw_text[:50] + "..." if len(raw_text) > 50 else raw_text
    return fields

# ─── Main OCR Pipeline ────────────────────────────────────────────────────────

def process_image(image_base64: str, form_type: str = "general") -> dict[str, Any]:
    try:
        if "," in image_base64:
            image_base64 = image_base64.split(",", 1)[1]
        img_bytes = base64.b64decode(image_base64)
    except Exception as e:
        raise ValueError(f"Invalid base64 image data: {e}")

    processed = _preprocess_image(img_bytes)

    tokens = []
    raw_text = ""
    reader = _get_ocr_reader()

    if reader is not None:
        results = reader.readtext(processed, detail=1, paragraph=False)
        raw_parts = []
        for (bbox, text, confidence) in results:
            raw_parts.append(text)
            flat_bbox = [
                int(min(pt[0] for pt in bbox)),
                int(min(pt[1] for pt in bbox)),
                int(max(pt[0] for pt in bbox)),
                int(max(pt[1] for pt in bbox)),
            ]
            tokens.append({
                "text": text,
                "confidence": round(float(confidence), 3),
                "bbox": flat_bbox,
                "needs_review": confidence < CONFIDENCE_THRESHOLD,
            })
        raw_text = " ".join(raw_parts)
    else:
        raw_text = "[OCR ENGINE UNAVAILABLE]"
        tokens = []

    del img_bytes, processed
    gc.collect()

    low_confidence_count = sum(1 for t in tokens if t["needs_review"])

    # 4. Field extraction (Routing based on form_type)
    form_type_lower = form_type.lower()
    
    if form_type_lower == "moh_notification":
        extracted_fields = _extract_moh_fields(raw_text)
    elif form_type_lower in ["hand_hygiene_audit", "ward_inspection"]:
        extracted_fields = _extract_audit_fields(raw_text)
    else:
        # form_type එක "general" නම් හෝ වෙන මොකක් හරි නම්
        extracted_fields = _extract_general_fields(raw_text)

    return {
        "raw_text": raw_text,
        "tokens": tokens,
        "low_confidence_count": low_confidence_count,
        "extracted_fields": extracted_fields,
    }