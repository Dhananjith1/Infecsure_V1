"""
InfecSure — OCR Service (Google Cloud Vision Integrated)
======================================================
Pipeline:
  1. Receive Base64-encoded image
  2. Attempt Google Cloud Vision API extraction (Fast & Accurate)
  3. Fallback to OpenCV + EasyOCR pipeline if Google Vision fails/unavailable
  4. Structured field extraction for known form types
  5. Return OCRResult with confidence-flagged tokens
"""

from __future__ import annotations

import base64
import gc
import logging
import os
import re
from typing import Any

logger = logging.getLogger(__name__)

CONFIDENCE_THRESHOLD = 0.70  # Below this → flagged for review

# ─── Google Cloud Vision Client Setup ─────────────────────────────────────────

_vision_client = None

def _get_vision_client():
    """Lazy singleton for Google Cloud Vision ImageAnnotatorClient."""
    global _vision_client
    if _vision_client is None:
        try:
            from google.cloud import vision  # noqa: PLC0415

            # Set Service Account Credential Path from Environment or fallback to default file
            creds_path = os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH", "firebase-service-account.json")
            if os.path.exists(creds_path):
                os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = creds_path

            _vision_client = vision.ImageAnnotatorClient()
            logger.info("Google Cloud Vision API client initialized successfully.")
        except Exception as exc:
            logger.warning("Google Cloud Vision API initialized failed/unavailable: %s", exc)
            _vision_client = False  # Sentinel for unavailable
    return _vision_client if _vision_client else None


def _process_with_google_vision(img_bytes: bytes) -> tuple[list[dict[str, Any]], str] | None:
    """Process image using Google Cloud Vision API."""
    client = _get_vision_client()
    if not client:
        return None

    try:
        from google.cloud import vision  # noqa: PLC0415

        image = vision.Image(content=img_bytes)
        # document_text_detection handles dense text & handwriting much better than text_detection
        response = client.document_text_detection(image=image)

        if response.error.message:
            logger.error("Google Vision Error: %s", response.error.message)
            return None

        tokens = []
        raw_text = response.full_text_annotation.text if response.full_text_annotation else ""

        # Processing detailed tokens & confidence
        for page in response.full_text_annotation.pages:
            for block in page.blocks:
                for paragraph in block.paragraphs:
                    for word in paragraph.words:
                        word_text = "".join([symbol.text for symbol in word.symbols])
                        confidence = float(word.confidence) if hasattr(word, "confidence") and word.confidence else 0.90

                        # Calculate Bounding Box
                        vertices = word.bounding_box.vertices
                        x_coords = [v.x for v in vertices if hasattr(v, "x")]
                        y_coords = [v.y for v in vertices if hasattr(v, "y")]

                        if x_coords and y_coords:
                            flat_bbox = [min(x_coords), min(y_coords), max(x_coords), max(y_coords)]
                        else:
                            flat_bbox = [0, 0, 0, 0]

                        tokens.append({
                            "text": word_text,
                            "confidence": round(confidence, 3),
                            "bbox": flat_bbox,
                            "needs_review": confidence < CONFIDENCE_THRESHOLD,
                        })

        return tokens, raw_text

    except Exception as e:
        logger.warning("Google Cloud Vision processing failed, falling back to EasyOCR: %s", e)
        return None


# ─── EasyOCR Legacy Setup ──────────────────────────────────────────────────────

_ocr_reader = None

def _get_ocr_reader():
    """Lazy singleton for EasyOCR reader (heavy init ~5s)."""
    global _ocr_reader
    if _ocr_reader is None:
        try:
            import easyocr  # noqa: PLC0415
            _ocr_reader = easyocr.Reader(["en"], gpu=False, verbose=False)
        except ImportError:
            logging.warning("EasyOCR not available — OCR fallback disabled.")
            _ocr_reader = False
    return _ocr_reader if _ocr_reader else None


# ─── OpenCV Image Preprocessing (Fallback) ────────────────────────────────────

def _decode_image(img_bytes: bytes):
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
    return img


def _deskew(gray_image):
    """Correct rotation angle using OpenCV minAreaRect on thresholded contours.

    Computes the dominant text-line angle from the minimum-area bounding
    rectangle of the largest contour cluster, then applies an affine
    rotation to straighten the image.  Angles beyond ±15° are ignored
    (likely not simple skew but a fundamentally rotated photo).
    """
    import cv2  # noqa: PLC0415
    import numpy as np  # noqa: PLC0415

    try:
        # Binary threshold to isolate text regions
        _, binary = cv2.threshold(gray_image, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

        # Find all contour points (external only for speed)
        contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            return gray_image

        # Merge all contour points into one set and compute minAreaRect
        all_points = np.concatenate(contours)
        rect = cv2.minAreaRect(all_points)
        angle = rect[-1]  # rotation angle from minAreaRect

        # minAreaRect returns angles in [-90, 0); normalise to skew offset
        if angle < -45:
            angle = 90 + angle  # landscape → correct direction
        elif angle > 45:
            angle = angle - 90

        # Skip correction for large angles (not simple skew)
        if abs(angle) < 0.5 or abs(angle) > 15:
            return gray_image

        h, w = gray_image.shape[:2]
        center = (w // 2, h // 2)
        rotation_matrix = cv2.getRotationMatrix2D(center, angle, 1.0)
        deskewed = cv2.warpAffine(
            gray_image, rotation_matrix, (w, h),
            flags=cv2.INTER_CUBIC,
            borderMode=cv2.BORDER_REPLICATE,
        )
        logger.info("Deskewed image by %.2f°", angle)
        return deskewed
    except Exception as exc:
        logger.warning("Deskew failed (non-fatal): %s", exc)
        return gray_image


def _preprocess_variants(img_bytes: bytes):
    """Build several OCR images for faint handwriting and camera photos.

    Pipeline: decode → resize → grayscale → deskew → CLAHE → denoise →
    sharpen → adaptive threshold / Otsu threshold.
    """
    try:
        import cv2  # noqa: PLC0415
    except ImportError:
        return [("raw", _decode_image(img_bytes))]

    img = _decode_image(img_bytes)
    if img is None:
        return [("raw", img_bytes)]

    height, width = img.shape[:2]
    scale = 2.0 if max(height, width) < 1800 else 1.35
    enlarged = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
    gray = cv2.cvtColor(enlarged, cv2.COLOR_BGR2GRAY)

    # Deskew the grayscale image before further processing
    gray = _deskew(gray)

    clahe = cv2.createCLAHE(clipLimit=2.2, tileGridSize=(8, 8)).apply(gray)
    denoised = cv2.fastNlMeansDenoising(clahe, None, 12, 7, 21)
    sharpened = cv2.addWeighted(denoised, 1.55, cv2.GaussianBlur(denoised, (0, 0), 3), -0.55, 0)

    adaptive = cv2.adaptiveThreshold(
        sharpened, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 9
    )
    _, otsu = cv2.threshold(sharpened, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    return [
        ("enlarged_color", enlarged),
        ("sharpened_gray", sharpened),
        ("adaptive_threshold", adaptive),
        ("otsu_threshold", otsu),
    ]


# ─── Master Ward Detector ────────────────────────────────────────────────────

def _smart_extract_ward(text_lower: str) -> str | None:
    """Universal Ward Detector for 6 hospital sectors"""
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


# ─── Field Extractors ─────────────────────────────────────────────────────────

def _extract_moh_fields(raw_text: str) -> dict[str, Any]:
    """Extract structured MoH/lab note fields from OCR text."""
    fields: dict[str, Any] = {}
    text_lower = raw_text.lower()

    ward = _smart_extract_ward(text_lower)
    if ward:
        fields["ward_id"] = ward

    next_label = (
        r"(?=\s+(?:name|age|sex|address|disease|ward|word|pathogen|specimen|"
        r"colony\s*count|colony|count|date of onset|onset|date notified|notified)\s*:|\r?\n|$)"
    )
    patterns = {
        "patient_name": r"(?i)\bname\s*:\s*([A-Za-z\s\.]+?)" + next_label,
        "age": r"(?i)\bage\s*:\s*(\d{1,3})",
        "sex": r"(?i)\bsex\s*:\s*(male|female|m|f)",
        "address": r"(?i)\baddress\s*:\s*(.+?)" + next_label,
        "disease": r"(?i)\bdisease\s*:\s*(.+?)" + next_label,
        "date_of_onset": r"(?i)(?:date of onset|onset)\s*:\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})",
        "date_notified": r"(?i)(?:date notified|notified)\s*:\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})",
        "ward_text": r"(?i)\b(?:ward|word|wad)\s*[:\-]?\s*([A-Za-z][A-Za-z _/-]{1,40})" + next_label,
        "pathogen_name": r"(?i)\b(?:pathogen|pathogem|pathogene|organism)\s*[:\-]?\s*([A-Za-z][A-Za-z _/-]{1,40})" + next_label,
        "specimen_type": r"(?i)\b(?:specimen|sp[e3]cimen|sample)\s*[:\-]?\s*([A-Za-z][A-Za-z _/-]{1,30})" + next_label,
        "colony_count": r"(?i)\b(?:colony\s*count|colony|count)\s*[:\-]?\s*(\d{1,7})",
    }

    for field, pattern in patterns.items():
        match = re.search(pattern, raw_text)
        if not match:
            continue
        value = match.group(1).strip(" :-")
        if field == "colony_count":
            fields[field] = int(value)
        elif value:
            fields[field] = value

    if "disease" not in fields:
        if "covid" in text_lower or "cov" in text_lower:
            fields["disease"] = "COVID-19"
        elif "dengue" in text_lower or "denque" in text_lower or "deng" in text_lower:
            fields["disease"] = "Dengue"
    if "pathogen_name" not in fields and ("dengue" in text_lower or "denque" in text_lower or "deng" in text_lower):
        fields["pathogen_name"] = "Dengue"
    if "specimen_type" not in fields and ("blood" in text_lower or "b100d" in text_lower or "blod" in text_lower):
        fields["specimen_type"] = "Blood"
    if "colony_count" not in fields:
        colony_match = re.search(r"(?i)(?:colony|count)\D{0,12}(\d{1,7})", raw_text)
        if colony_match:
            fields["colony_count"] = int(colony_match.group(1))

    return fields


def _extract_audit_fields(raw_text: str) -> dict[str, Any]:
    """Extract the 6 ICNO audit fields expected by the frontend UI cards.

    Target keys: ward_name, hand_hygiene, ppe_compliance,
    waste_garbage_removal, environmental_hygiene, icno_additional_note.
    """
    from datetime import datetime, timezone  # noqa: PLC0415

    fields: dict[str, Any] = {}
    text_lower = raw_text.lower()

    # ── Ward Name ──────────────────────────────────────────────────────────
    ward = _smart_extract_ward(text_lower)
    if ward:
        # Convert snake_case ID to a human-friendly label
        fields["ward_name"] = ward.replace("_", " ").title()
    else:
        ward_match = re.search(
            r"(?i)\b(?:ward|word|wad)\s*[:\-]?\s*([A-Za-z][A-Za-z _/\-]{1,40})",
            raw_text,
        )
        fields["ward_name"] = ward_match.group(1).strip() if ward_match else ""

    # ── Helper: find a score/value next to a label ─────────────────────────
    def _find_score(labels: list[str], fallback: str = "") -> str:
        for label in labels:
            pattern = rf"(?i)\b{label}\s*[:\-]?\s*(\d{{1,3}}%?|yes|no|pass|fail|good|poor|satisfactory|n/?a)"
            m = re.search(pattern, raw_text)
            if m:
                return m.group(1).strip()
        return fallback

    # ── Hand Hygiene ───────────────────────────────────────────────────────
    fields["hand_hygiene"] = _find_score(
        [r"hand\s*hygiene", r"hand\s*wash", r"hh\s*score", r"hh\s*compliance"]
    )

    # ── PPE Compliance ─────────────────────────────────────────────────────
    fields["ppe_compliance"] = _find_score(
        [r"ppe\s*compliance", r"ppe\s*score", "ppe", r"personal\s*protective"]
    )

    # ── Waste / Garbage Removal ────────────────────────────────────────────
    fields["waste_garbage_removal"] = _find_score(
        [
            r"waste\s*/\s*garbage\s*removal",
            r"waste\s*garbage",
            r"waste\s*removal",
            r"garbage\s*removal",
            r"waste\s*segregation",
            r"waste\s*management",
            "waste",
        ]
    )

    # ── Environmental Hygiene ──────────────────────────────────────────────
    fields["environmental_hygiene"] = _find_score(
        [
            r"environmental\s*hygiene",
            r"environmental\s*score",
            r"environment\s*hygiene",
            "environmental",
            r"env\s*hygiene",
        ]
    )

    # ── ICNO Additional Note ───────────────────────────────────────────────
    note_match = re.search(
        r"(?i)(?:note|remark|comment|additional|observation)\s*[:\-]?\s*(.+)",
        raw_text,
    )
    fields["icno_additional_note"] = note_match.group(1).strip() if note_match else ""

    # Keep an audit timestamp for backend reference
    fields["audit_date"] = datetime.now(timezone.utc).isoformat()
    return fields


def _extract_general_fields(raw_text: str) -> dict[str, Any]:
    fields: dict[str, Any] = {}
    text_lower = raw_text.lower()

    ward = _smart_extract_ward(text_lower)
    if ward:
        fields["ward_id"] = ward

    fields["document_type"] = "General/Other"
    fields["raw_text_preview"] = " ".join(raw_text.split())
    return fields


# ─── EasyOCR Helper Functions ─────────────────────────────────────────────────

def _ocr_results_to_payload(results: list[tuple[Any, str, float]]) -> tuple[list[dict[str, Any]], str]:
    results = sorted(
        results,
        key=lambda item: (
            min(point[1] for point in item[0]),
            min(point[0] for point in item[0]),
        ),
    )
    tokens = []
    raw_parts = []
    previous_y = None
    for bbox, text, confidence in results:
        clean_text = str(text).strip()
        if not clean_text:
            continue
        y_min = min(point[1] for point in bbox)
        if previous_y is not None and abs(y_min - previous_y) > 45:
            raw_parts.append("\n")
        previous_y = y_min
        raw_parts.append(clean_text)
        flat_bbox = [
            int(min(pt[0] for pt in bbox)),
            int(min(pt[1] for pt in bbox)),
            int(max(pt[0] for pt in bbox)),
            int(max(pt[1] for pt in bbox)),
        ]
        tokens.append({
            "text": clean_text,
            "confidence": round(float(confidence), 3),
            "bbox": flat_bbox,
            "needs_review": confidence < CONFIDENCE_THRESHOLD,
        })
    raw_text = " ".join(raw_parts).replace("\n ", "\n").replace(" \n", "\n")
    return tokens, raw_text


def _score_ocr_tokens(tokens: list[dict[str, Any]], raw_text: str) -> float:
    letters = sum(1 for char in raw_text if char.isalpha())
    digits = sum(1 for char in raw_text if char.isdigit())
    avg_confidence = sum(float(token["confidence"]) for token in tokens) / max(len(tokens), 1)
    useful_tokens = sum(1 for token in tokens if re.search(r"[A-Za-z]{2,}|\d+", token["text"]))
    label_bonus = sum(10 for label in ("ward", "word", "pathogen", "specimen", "colony", "count") if label in raw_text.lower())
    return letters + (digits * 0.5) + (avg_confidence * 20) + (useful_tokens * 5) + label_bonus


# ─── Main OCR Pipeline ────────────────────────────────────────────────────────

def process_image(image_base64: str, form_type: str = "general") -> dict[str, Any]:
    try:
        if "," in image_base64:
            image_base64 = image_base64.split(",", 1)[1]
        img_bytes = base64.b64decode(image_base64)
    except Exception as e:
        raise ValueError(f"Invalid base64 image data: {e}")

    tokens = []
    raw_text = ""

    # 1. Attempt Google Cloud Vision API
    google_res = _process_with_google_vision(img_bytes)

    if google_res is not None:
        tokens, raw_text = google_res
        logger.info("Successfully processed image using Google Cloud Vision API.")
    else:
        # 2. Fallback to EasyOCR pipeline
        logger.info("Using EasyOCR fallback pipeline...")
        reader = _get_ocr_reader()
        variants = _preprocess_variants(img_bytes)

        if reader is not None:
            best_score = -1.0
            best_variant = ""
            for variant_name, image in variants:
                try:
                    results = reader.readtext(
                        image,
                        detail=1,
                        paragraph=False,
                        decoder="beamsearch",
                        batch_size=1,
                        contrast_ths=0.05,
                        adjust_contrast=0.7,
                        text_threshold=0.3,
                        low_text=0.2,
                        link_threshold=0.2,
                        canvas_size=2560,
                        mag_ratio=2.0,
                        width_ths=1.2,
                        add_margin=0.15,
                    )
                except Exception as exc:
                    logger.warning("OCR variant %s failed: %s", variant_name, exc)
                    continue
                candidate_tokens, candidate_text = _ocr_results_to_payload(results)
                score = _score_ocr_tokens(candidate_tokens, candidate_text)
                if score > best_score:
                    tokens = candidate_tokens
                    raw_text = candidate_text
                    best_score = score
                    best_variant = variant_name
            logger.info("OCR selected variant=%s score=%.2f text=%r", best_variant, best_score, raw_text[:160])
        else:
            raw_text = "[OCR ENGINE UNAVAILABLE]"
            tokens = []

        del variants

    del img_bytes
    gc.collect()

    low_confidence_count = sum(1 for t in tokens if t["needs_review"])

    # 3. Field extraction (Routing based on form_type)
    form_type_lower = form_type.lower()

    if form_type_lower == "moh_notification":
        extracted_fields = _extract_moh_fields(raw_text)
        extracted_fields["document_type"] = "MoH Notification"
    elif form_type_lower == "hand_hygiene_audit":
        extracted_fields = _extract_audit_fields(raw_text)
        extracted_fields["document_type"] = "Hand Hygiene Audit"
    elif form_type_lower == "ward_inspection":
        extracted_fields = _extract_audit_fields(raw_text)
        extracted_fields["document_type"] = "Ward Inspection"
    else:
        extracted_fields = _extract_general_fields(raw_text)
        extracted_fields["document_type"] = "General"

    if "disease_name" not in extracted_fields:
        extracted_fields["disease_name"] = extracted_fields.get("disease") or extracted_fields.get("pathogen_name") or "General Surveillance"

    extracted_fields["raw_text_preview"] = " ".join(raw_text.split())

    return {
        "raw_text": raw_text,
        "tokens": tokens,
        "low_confidence_count": low_confidence_count,
        "extracted_fields": extracted_fields,
    }