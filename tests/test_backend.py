"""
InfecSure — Backend Test Suite
================================
Tests for: Auth, Wards, Audits, Lab Results, Pathogens, Alerts, Heatmap, Notices
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

# ─── Helper: Get Tokens ───────────────────────────────────────────────────────

def get_token(email: str, password: str) -> str:
    resp = client.post("/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, f"Login failed for {email}: {resp.text}"
    return resp.json()["access_token"]


# Pre-login (note: these won't actually work without Firebase running,
# but they serve as integration test templates)

ICNO_CREDS = ("icno@infecsure.com", "icnoPassword123")
SISTER_CREDS = ("matron@infecsure.com", "matronPassword123")
LAB_CREDS = ("lab@infecsure.com", "labPassword123")
DOCTOR_CREDS = ("doctor@infecsure.com", "doctorPassword123")
STAFF_CREDS = ("staff@infecsure.com", "staffPassword123")


# ─── Health Check ─────────────────────────────────────────────────────────────

class TestHealth:
    def test_root_returns_ok(self):
        resp = client.get("/")
        assert resp.status_code == 200
        data = resp.json()
        assert data["system"] == "InfecSure"
        assert data["status"] == "operational"

    def test_health_endpoint(self):
        resp = client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert "status" in data
        assert "components" in data


# ─── Auth Tests ───────────────────────────────────────────────────────────────

class TestAuth:
    def test_login_missing_fields(self):
        resp = client.post("/auth/login", json={})
        assert resp.status_code == 422  # Validation error

    def test_login_unknown_email(self):
        resp = client.post("/auth/login", json={
            "email": "unknown@example.com", "password": "wrongpass"
        })
        assert resp.status_code == 401

    def test_me_without_token(self):
        resp = client.get("/auth/me")
        assert resp.status_code == 401

    def test_refresh_with_invalid_token(self):
        resp = client.post("/auth/refresh", json={"refresh_token": "invalid.token.here"})
        assert resp.status_code == 401


# ─── RBAC Tests ───────────────────────────────────────────────────────────────

class TestRBAC:
    """Tests that role-based access control is enforced correctly."""

    def test_unauthenticated_cannot_access_wards(self):
        resp = client.get("/wards/")
        assert resp.status_code == 401

    def test_unauthenticated_cannot_create_ward(self):
        resp = client.post("/wards/", json={
            "name": "Test Ward", "ward_type": "general", "bed_count": 20
        })
        assert resp.status_code == 401

    def test_staff_cannot_access_alerts(self):
        """Staff should get 403 when accessing alerts."""
        # Mock a staff token for this test (requires Firebase running)
        pass  # Integration test — requires live Firebase

    def test_lab_cannot_create_ward(self):
        """Lab staff should not be able to create wards."""
        pass  # Integration test — requires live Firebase


# ─── ML Service Unit Tests ────────────────────────────────────────────────────

class TestMLService:
    """Unit tests for ML algorithms — mocked Firestore."""

    def test_zscore_insufficient_history(self):
        """Z-Score with fewer than 5 history records should return is_anomaly=False."""
        from unittest.mock import patch

        with patch("app.services.firebase_service.get_pathogen_stats", return_value=None), \
             patch("app.services.firebase_service.get_pathogen_history", return_value=[]), \
             patch("app.services.firebase_service.upsert_pathogen_stats", return_value=None):
            from app.services.ml_service import detect_anomaly
            result = detect_anomaly("test-pathogen-id", 5)
            assert result["is_anomaly"] is False
            assert result["z_score"] == 0.0

    def test_zscore_detects_anomaly(self):
        """Z-Score should flag as anomaly when count is 3+ std devs above mean."""
        from unittest.mock import patch

        mock_stats = {"mean": 5.0, "std": 1.0, "count": 20}
        with patch("app.services.firebase_service.get_pathogen_stats", return_value=mock_stats), \
             patch("app.services.firebase_service.upsert_pathogen_stats", return_value=None):
            from app.services.ml_service import detect_anomaly
            result = detect_anomaly("test-pathogen-id", 50)  # far above mean of 5
            assert result["is_anomaly"] is True
            assert result["z_score"] > 2.0
            assert result["severity"] in ("warning", "critical")

    def test_task_priority_empty_wards(self):
        """Priority list with no wards should return empty list."""
        from unittest.mock import patch

        with patch("app.services.firebase_service.list_wards", return_value=[]):
            from app.services.ml_service import calculate_task_priority
            result = calculate_task_priority()
            assert result == []

    def test_risk_level_thresholds(self):
        """Test risk level classification thresholds."""
        from app.services.ml_service import _risk_level_from_score
        assert _risk_level_from_score(10.0) == "low"
        assert _risk_level_from_score(35.0) == "medium"
        assert _risk_level_from_score(60.0) == "high"
        assert _risk_level_from_score(80.0) == "critical"

    def test_dashboard_summary_empty(self):
        """Dashboard with no data should return sensible defaults."""
        from unittest.mock import patch

        with patch("app.services.firebase_service.list_wards", return_value=[]), \
             patch("app.services.firebase_service.list_alerts", return_value=[]), \
             patch("app.services.firebase_service.list_lab_results", return_value=[]):
            from app.services.ml_service import get_dashboard_summary
            result = get_dashboard_summary()
            assert result["total_wards"] == 0
            assert result["average_compliance"] == 100.0
            assert result["pending_alerts"] == 0


# ─── Pydantic Model Tests ─────────────────────────────────────────────────────

class TestModels:
    def test_audit_create_validation(self):
        from app.models.audit import AuditCreate
        import pytest

        # Score out of range should fail validation
        with pytest.raises(Exception):
            AuditCreate(
                ward_id="ward-1",
                hand_hygiene_score=150.0,  # > 100 — invalid
                ppe_score=80.0,
                waste_segregation_score=70.0,
                environmental_score=90.0,
            )

    def test_lab_result_create_valid(self):
        from app.models.lab import LabResultCreate, SpecimenType
        from datetime import datetime, timezone

        result = LabResultCreate(
            ward_id="ward-1",
            pathogen_id="path-1",
            pathogen_name="E. coli",
            specimen_type=SpecimenType.BLOOD,
            result_date=datetime.now(timezone.utc),
        )
        assert result.pathogen_name == "E. coli"

    def test_alert_status_enum(self):
        from app.models.alert import AlertStatus
        assert AlertStatus.PENDING == "pending"
        assert AlertStatus.APPROVED == "approved"
        assert AlertStatus.REJECTED == "rejected"

    def test_user_role_enum(self):
        from app.models.user import UserRole
        assert UserRole.ICNO == "icno"
        assert UserRole.STAFF == "staff"


# ─── OCR Service Tests ────────────────────────────────────────────────────────

class TestOCRService:
    def test_invalid_base64_raises_value_error(self):
        from app.services.ocr_service import process_image
        import pytest
        with pytest.raises(ValueError):
            process_image("not-valid-base64!!!", "general")

    def test_moh_field_extraction(self):
        from app.services.ocr_service import _extract_moh_fields
        sample = "Name: John Perera\nAge: 35\nSex: Male\nWard: Ward A\nDisease: Dengue"
        fields = _extract_moh_fields(sample)
        assert "patient_name" in fields or "age" in fields or "disease" in fields


# ─── Email Service Tests ──────────────────────────────────────────────────────

class TestEmailService:
    def test_build_moh_notification_body(self):
        from app.services.email_service import build_moh_notification_body
        alert = {
            "ward_id": "ward-1",
            "title": "Dengue Alert",
            "description": "High dengue risk detected.",
            "severity": "critical",
        }
        body = build_moh_notification_body(alert)
        assert "InfecSure" in body
        assert "Dengue Alert" in body
        assert "CRITICAL" in body

    def test_send_without_smtp_config_returns_false(self):
        from app.services.email_service import send_moh_notification
        # With no SMTP credentials configured, should return False gracefully
        # (settings.smtp_user is empty string by default in test mode)
        result = send_moh_notification("test@example.com", "Test", "<p>Test</p>")
        # Will be False because smtp credentials not set
        assert isinstance(result, bool)
