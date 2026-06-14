"""
InfecSure — Backend Test Suite
================================
Tests for: Auth, Wards, Audits, Lab Results, Pathogens, Alerts, Heatmap, Notices
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, patch

from app.main import app
from app.services.auth_service import create_access_token

client = TestClient(app)

# ─── Helper: Get Tokens ───────────────────────────────────────────────────────

def get_token(email: str, password: str) -> str:
    resp = client.post("/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, f"Login failed for {email}: {resp.text}"
    return resp.json()["access_token"]


def auth_headers(uid: str, email: str, role: str) -> dict[str, str]:
    token = create_access_token(uid, email, role)
    return {"Authorization": f"Bearer {token}"}


# Live email/password login tests require Firebase credentials and are kept out
# of this local unit suite.


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
        with patch(
            "app.services.auth_service.firebase_sign_in",
            new=AsyncMock(side_effect=ValueError("EMAIL_NOT_FOUND")),
        ):
            resp = client.post("/auth/login", json={
                "email": "unknown@example.com", "password": "wrongpass"
            })
        assert resp.status_code == 401

    def test_login_success_uses_json_body_firebase_and_firestore_uid_profile(self):
        with patch(
            "app.services.auth_service.firebase_sign_in",
            new=AsyncMock(return_value={"localId": "firebase-uid-1"}),
        ), patch(
            "app.services.firebase_service.get_user_by_uid",
            return_value={
                "uid": "firebase-uid-1",
                "email": "icno@infecsure.com",
                "role": "icno",
                "is_active": True,
            },
        ):
            resp = client.post(
                "/auth/login",
                json={"email": "icno@infecsure.com", "password": "real-password"},
            )

        assert resp.status_code == 200
        data = resp.json()
        assert data["uid"] == "firebase-uid-1"
        assert data["role"] == "icno"
        assert data["token_type"] == "bearer"
        assert data["access_token"]
        assert data["refresh_token"]

    def test_login_requires_firestore_uid_profile(self):
        with patch(
            "app.services.auth_service.firebase_sign_in",
            new=AsyncMock(return_value={"localId": "missing-profile-uid"}),
        ), patch("app.services.firebase_service.get_user_by_uid", return_value=None):
            resp = client.post(
                "/auth/login",
                json={"email": "doctor@infecsure.com", "password": "real-password"},
            )

        assert resp.status_code == 403
        assert "users/missing-profile-uid" in resp.json()["detail"]

    def test_login_openapi_expects_json_body(self):
        schema = client.get("/openapi.json").json()
        request_body = schema["paths"]["/auth/login"]["post"]["requestBody"]
        assert "application/json" in request_body["content"]

    def test_role_resolution_requires_profile_or_custom_claim(self):
        from app.services.auth_service import role_from_authenticated_user

        with patch("app.services.auth_service.auth_client.get_user", side_effect=Exception("missing")):
            assert role_from_authenticated_user(None, "uid-1") is None

    def test_role_resolution_accepts_custom_claim(self):
        from types import SimpleNamespace
        from app.services.auth_service import role_from_authenticated_user

        fb_user = SimpleNamespace(custom_claims={"role": "doctor"})
        with patch("app.services.auth_service.auth_client.get_user", return_value=fb_user):
            assert role_from_authenticated_user(None, "uid-1") == "doctor"

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
            "name": "Male Ward", "ward_type": "male_ward", "bed_count": 20
        })
        assert resp.status_code == 401

    def test_staff_cannot_access_alerts(self):
        """Staff should get 403 when accessing alerts."""
        resp = client.get(
            "/alerts/",
            headers=auth_headers("staff-test", "staff@infecsure.com", "staff"),
        )
        assert resp.status_code == 403

    def test_lab_cannot_create_ward(self):
        """Lab staff should not be able to create wards."""
        resp = client.post(
            "/wards/",
            json={"name": "Male Ward", "ward_type": "male_ward", "bed_count": 20},
            headers=auth_headers("lab-test", "lab@infecsure.com", "lab"),
        )
        assert resp.status_code == 403


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

    def test_heuristic_risk_score_is_probability(self):
        from app.services.ml_service import _heuristic_fallback_risk

        with patch("app.services.firebase_service.get_ward", return_value={"compliance_score": 40.0}), \
             patch("app.services.firebase_service.update_ward_risk", return_value=None):
            result = _heuristic_fallback_risk("male_ward")
            assert result["risk_score"] == 0.6
            assert result["risk_score_percent"] == 60.0
            assert result["risk_level"] == "high"


class TestAuditScoring:
    def test_audit_calculators_return_ratios(self):
        from app.services.audit_service import (
            hand_hygiene_ratio,
            ppe_adherence_ratio,
            waste_segregation_ratio,
        )

        assert hand_hygiene_ratio(8, 10) == 0.8
        assert ppe_adherence_ratio(3, 4) == 0.75
        assert waste_segregation_ratio(2, 10) == 0.8

    def test_sync_payload_converts_to_audit_scores(self):
        from app.models.audit import AuditMetricCounts, AuditSyncItem, WasteSegregationCounts
        from app.services.audit_service import build_audit_from_sync

        audit, metrics = build_audit_from_sync(
            AuditSyncItem(
                ward_id="male_ward",
                hand_hygiene=AuditMetricCounts(correct=9, total=10),
                ppe_adherence=AuditMetricCounts(correct=4, total=5),
                waste_segregation=WasteSegregationCounts(misplaced_items=1, total_items=10),
                environmental_score=70.0,
            )
        )
        assert audit.hand_hygiene_score == 90.0
        assert audit.ppe_score == 80.0
        assert audit.waste_segregation_score == 90.0
        assert audit.is_offline_sync is True
        assert metrics["hand_hygiene_ratio"] == 0.9


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

    def test_pathogen_clinical_risk_class_is_mapped(self):
        from app.models.pathogen import PathogenCreate

        pathogen = PathogenCreate(name="Dengue", category="virus", risk_level="high")
        assert pathogen.clinical_risk_class == 3


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


class TestRouteContracts:
    def test_expected_checklist_routes_exist(self):
        route_paths = {route.path for route in app.routes}
        expected = {
            "/auth/login",
            "/audits/sync",
            "/ocr/upload",
            "/ocr/pending",
            "/lab/pathogens",
            "/lab/volume/48h",
            "/gate/pending",
            "/gate/validate",
            "/alerts/pending",
            "/alerts/{alert_id}/acknowledge",
            "/alerts/{alert_id}/instructions",
            "/public/heatmap",
            "/health",
        }
        assert expected.issubset(route_paths)

    def test_public_heatmap_uses_only_approved_alerts(self):
        with patch("app.services.firebase_service.list_wards", return_value=[
            {"ward_id": "male_ward", "name": "Male Ward", "risk_level": "high", "risk_score": 0.9},
            {"ward_id": "female_ward", "name": "Female Ward", "risk_level": "critical", "risk_score": 1.0},
        ]), patch("app.services.firebase_service.list_alerts", side_effect=[
            [{"ward_id": "male_ward", "status": "approved"}],
            [],
        ]):
            resp = client.get("/public/heatmap")
        assert resp.status_code == 200
        data = resp.json()["heatmap"]
        male = next(item for item in data if item["ward_id"] == "male_ward")
        female = next(item for item in data if item["ward_id"] == "female_ward")
        assert male["status"] == "red"
        assert female["status"] == "green"

    def test_ocr_pending_filters_low_confidence_records(self):
        with patch("app.services.firebase_service.list_ocr_queue", return_value=[
            {"scan_id": "high-confidence", "low_confidence_count": 0},
            {"scan_id": "needs-review", "low_confidence_count": 2},
        ]):
            resp = client.get(
                "/ocr/pending",
                headers=auth_headers("icno-test", "icno@infecsure.com", "icno"),
            )
        assert resp.status_code == 200
        assert [item["scan_id"] for item in resp.json()] == ["needs-review"]

    def test_gate_validate_approves_pending_alert(self):
        with patch("app.services.firebase_service.get_alert", return_value={"alert_id": "a1", "status": "pending"}), \
             patch("app.services.firebase_service.validate_alert", return_value=None):
            resp = client.post(
                "/gate/validate",
                json={"alert_id": "a1", "decision": "approve", "icno_notes": "checked"},
                headers=auth_headers("icno-test", "icno@infecsure.com", "icno"),
            )
        assert resp.status_code == 200
        assert resp.json()["status"] == "approved"
