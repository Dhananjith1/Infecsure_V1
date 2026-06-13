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
import logging
import re
from typing import Any

import numpy as np

# OpenCV and EasyOCR wrapped for graceful degradation
try:
    import cv2
    CV2_AVAILABLE = True
except ImportError:
    CV2_AVAILABLE = False
    logging.warning("OpenCV not available — image preprocessing disabled.")

try:
    import easyocr
    _ocr_reader = None  # Lazy init (heavy model load)
    EASYOCR_AVAILABLE = True
except ImportError:
    EASYOCR_AVAILABLE = False
    logging.warning("EasyOCR not available — OCR features disabled.")

logger = logging.getLogger(__name__)

CONFIDENCE_THRESHOLD = 0.70  # Below this → flagged for review


def _get_ocr_reader():
    """Lazy singleton for EasyOCR reader (heavy init ~5s)."""
    global _ocr_reader
    if _ocr_reader is None and EASYOCR_AVAILABLE:
        _ocr_reader = easyocr.Reader(["en"], gpu=False, verbose=False)
    return _ocr_reader


# ─── Image Preprocessing ──────────────────────────────────────────────────────

def _preprocess_image(img_bytes: bytes) -> np.ndarray:
    """
    Apply OpenCV preprocessing to improve OCR accuracy:
    1. Grayscale conversion
    2. Gaussian blur (noise reduction)
    3. Adaptive thresholding (binarization)
    4. Deskew correction
    """
    if not CV2_AVAILABLE:
        # Return raw numpy array without preprocessing
        arr = np.frombuffer(img_bytes, dtype=np.uint8)
        return arr

    # Decode to numpy array
    arr = np.frombuffer(img_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)

    # 1. Grayscale
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # 2. Gaussian denoising
    denoised = cv2.GaussianBlur(gray, (3, 3), 0)

    # 3. Adaptive threshold (better than global for handwritten docs)
    thresh = cv2.adaptiveThreshold(
        denoised, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        11, 2
    )

    # 4. Deskew using moments
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


# ─── Field Extractor: MoH Notification Form ──────────────────────────────────

def _extract_moh_fields(raw_text: str) -> dict[str, Any]:
    """
    Parse known fields from MoH Special Disease Notification Form.
    Uses regex patterns matched to standard Sri Lanka MoH form layout.
    """
    fields: dict[str, Any] = {}

    patterns = {
        "patient_name":    r"(?i)name[:\s]+([A-Za-z\s\.]+)",
        "age":             r"(?i)age[:\s]+(\d{1,3})",
        "sex":             r"(?i)sex[:\s]+(male|female|m|f)",
        "address":         r"(?i)address[:\s]+(.+?)(?:\n|$)",
        "disease":         r"(?i)disease[:\s]+(.+?)(?:\n|$)",
        "date_of_onset":   r"(?i)(?:date of onset|onset)[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})",
        "date_notified":   r"(?i)(?:date notified|notified)[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})",
        "ward":            r"(?i)ward[:\s]+([A-Za-z0-9\s]+?)(?:\n|$)",
        "notifying_officer": r"(?i)(?:officer|notified by)[:\s]+([A-Za-z\s\.]+?)(?:\n|$)",
    }

    for field, pattern in patterns.items():
        match = re.search(pattern, raw_text)
        if match:
            fields[field] = match.group(1).strip()

    return fields


def _extract_audit_fields(raw_text: str) -> dict[str, Any]:
    """Parse key fields from a hand hygiene / ward audit form."""
    fields: dict[str, Any] = {}

    patterns = {
        "ward_name":        r"(?i)ward[:\s]+([A-Za-z0-9\s]+?)(?:\n|$)",
        "date":             r"(?i)date[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})",
        "total_staff":      r"(?i)total staff[:\s]+(\d+)",
        "compliant_staff":  r"(?i)compliant[:\s]+(\d+)",
        "auditor_name":     r"(?i)auditor[:\s]+([A-Za-z\s\.]+?)(?:\n|$)",
    }

    for field, pattern in patterns.items():
        match = re.search(pattern, raw_text)
        if match:
            fields[field] = match.group(1).strip()

    # Calculate compliance if possible
    total = fields.get("total_staff")
    compliant = fields.get("compliant_staff")
    if total and compliant:
        try:
            fields["calculated_compliance"] = round(int(compliant) / int(total) * 100, 1)
        except (ValueError, ZeroDivisionError):
            pass

    return fields


# ─── Main OCR Pipeline ────────────────────────────────────────────────────────

def process_image(image_base64: str, form_type: str = "general") -> dict[str, Any]:
    """
    Full OCR pipeline:
    1. Decode base64 image
    2. Preprocess with OpenCV
    3. Extract text with EasyOCR
    4. Parse confidence tokens
    5. Extract structured fields

    Returns dict matching OCRResult schema.
    """
    # 1. Decode base64
    try:
        # Strip data URI prefix if present (e.g. "data:image/jpeg;base64,...")
        if "," in image_base64:
            image_base64 = image_base64.split(",", 1)[1]
        img_bytes = base64.b64decode(image_base64)
    except Exception as e:
        raise ValueError(f"Invalid base64 image data: {e}")

    # 2. Preprocess
    processed = _preprocess_image(img_bytes)

    # 3. OCR
    tokens = []
    raw_text = ""
    reader = _get_ocr_reader()

    if reader is not None:
        results = reader.readtext(processed, detail=1, paragraph=False)
        raw_parts = []
        for (bbox, text, confidence) in results:
            raw_parts.append(text)
            # Flatten bbox to [x1, y1, x2, y2]
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
        # Fallback: no OCR available
        raw_text = "[OCR ENGINE UNAVAILABLE]"
        tokens = []

    low_confidence_count = sum(1 for t in tokens if t["needs_review"])

    # 4. Field extraction
    form_type_lower = form_type.lower()
    if "moh" in form_type_lower or "notification" in form_type_lower:
        extracted_fields = _extract_moh_fields(raw_text)
    elif "audit" in form_type_lower or "hygiene" in form_type_lower:
        extracted_fields = _extract_audit_fields(raw_text)
    else:
        extracted_fields = {"raw_text": raw_text}

    return {
        "raw_text": raw_text,
        "tokens": tokens,
        "low_confidence_count": low_confidence_count,
        "extracted_fields": extracted_fields,
    }
