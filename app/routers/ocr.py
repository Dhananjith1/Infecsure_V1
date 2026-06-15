"""
InfecSure - OCR Router
"""

from __future__ import annotations

import base64

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status

from app.dependencies import require_role
from app.models.auth import TokenData
from app.models.ocr import FormType, OCRConfirmRequest, OCRScanRequest
from app.models.user import UserRole
from app.services import domain_service, firebase_service as fs, ocr_service

import numpy as np

def clean_data_for_firestore(data):
    if isinstance(data, dict):
        return {str(k): clean_data_for_firestore(v) for k, v in data.items()}
    elif isinstance(data, (list, tuple, set)):
        return [clean_data_for_firestore(i) for i in data]
    elif isinstance(data, np.ndarray):
        return clean_data_for_firestore(data.tolist())
    elif isinstance(data, (np.bool_, bool)):
        return bool(data)
    elif isinstance(data, (np.integer, int)):
        return int(data)
    elif isinstance(data, (np.floating, float)):
        return float(data)
    elif hasattr(data, 'item') and callable(getattr(data, 'item')):
        return data.item()
    return data

router = APIRouter(prefix="/ocr", tags=["OCR Pipeline"])

_ICNO_ONLY = Depends(require_role(UserRole.ICNO))


@router.post("/process", status_code=status.HTTP_201_CREATED, summary="Process OCR document")
@router.post("/scan", status_code=status.HTTP_201_CREATED, summary="Scan and process a document (ICNO only)")
async def scan_document(body: OCRScanRequest, current_user: TokenData = _ICNO_ONLY):
    """Submit a Base64-encoded image for OCR processing."""
    try:
        ocr_output = ocr_service.process_image(body.image_base64, body.form_type.value)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    data = {
        "form_type": body.form_type.value,
        "reference_id": body.reference_id,
        "raw_text": ocr_output["raw_text"],
        "tokens": ocr_output["tokens"],
        "low_confidence_count": ocr_output["low_confidence_count"],
        "extracted_fields": ocr_output["extracted_fields"],
        "created_by_uid": current_user.uid,
    }

    data = clean_data_for_firestore(data)
    scan_id = fs.create_ocr_record(data)
    
    
    final_response = {
        "scan_id": scan_id,
        "form_type": body.form_type.value,
        "raw_text": ocr_output.get("raw_text", ""), 
        "tokens": ocr_output.get("tokens", []),
        "low_confidence_count": ocr_output.get("low_confidence_count", 0),
        "extracted_fields": ocr_output.get("extracted_fields", {}),
        "status": "pending_review",
        "message": f"OCR complete. {ocr_output.get('low_confidence_count', 0)} token(s) flagged for review.",
    }
    
    
    return clean_data_for_firestore(final_response)


@router.post("/upload", status_code=status.HTTP_201_CREATED, summary="Upload image for OCR processing")
async def upload_document(
    file: UploadFile = File(...),
    form_type: FormType = Form(FormType.GENERAL),
    reference_id: str = Form(None),
    current_user: TokenData = _ICNO_ONLY,
):
    """Accept a high-resolution image upload and process it through OCR."""
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image uploads are supported.")
    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Uploaded image is empty.")
    body = OCRScanRequest(
        image_base64=base64.b64encode(image_bytes).decode("ascii"),
        form_type=form_type,
        reference_id=reference_id,
    )
    return await scan_document(body, current_user)


@router.get("/pending", summary="List low-confidence OCR records pending ICNO review")
async def list_low_confidence_ocr(_: TokenData = _ICNO_ONLY):
    records = fs.list_ocr_queue(status="pending_review")
    return [r for r in records if r.get("low_confidence_count", 0) > 0]


@router.get("/queue", summary="List pending OCR records (ICNO only)")
async def list_ocr_queue(_: TokenData = _ICNO_ONLY):
    return fs.list_ocr_queue(status="pending_review")


@router.get("/{scan_id}", summary="Get OCR record (ICNO only)")
async def get_ocr_record(scan_id: str, _: TokenData = _ICNO_ONLY):
    record = fs.get_ocr_record(scan_id)
    if not record:
        raise HTTPException(status_code=404, detail="OCR record not found.")
    return record


@router.post("/confirm", summary="ICNO confirms and commits an OCR record")
async def confirm_ocr(body: OCRConfirmRequest, current_user: TokenData = _ICNO_ONLY):
    record = fs.get_ocr_record(body.scan_id)
    if not record:
        raise HTTPException(status_code=404, detail="OCR record not found.")
    if record.get("status") == "committed":
        raise HTTPException(status_code=400, detail="OCR record already committed.")

    fs.confirm_ocr_record(body.scan_id, body.corrected_fields)

    if body.commit_to_collection:
        try:
            commit_result = domain_service.commit_ocr_to_domain(
                body.commit_to_collection,
                body.corrected_fields,
                committed_by_uid=current_user.uid,
                committed_by_email=current_user.email,
                scan_id=body.scan_id,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

        fs.commit_ocr_record(body.scan_id)
        return {
            "scan_id": body.scan_id,
            "status": "committed",
            **commit_result,
        }

    return {
        "scan_id": body.scan_id,
        "status": "confirmed",
        "message": "OCR record confirmed. Fields saved for review.",
    }
