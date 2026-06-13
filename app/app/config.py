"""
InfecSure — Configuration & Firebase Initialization
=====================================================
Loads environment variables and bootstraps the Firebase Admin SDK
(Firestore + Auth) as application-level singletons.
"""

from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, firestore, auth as firebase_auth
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application-wide settings loaded from .env"""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # JWT
    jwt_secret_key: str = "infecsure-production-secret-key-2026"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7

    # Firebase
    firebase_service_account_path: str = "firebase-service-account.json"
    firebase_project_id: str = "infecsure-5d901"

    # Email
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""

    # App
    app_env: str = "development"
    cors_origins: list[str] = ["http://localhost:3000", "https://infecsure.web.app"]


@lru_cache()
def get_settings() -> Settings:
    return Settings()


# ─── Firebase Admin Singleton ────────────────────────────────────────────────

_firebase_app: firebase_admin.App | None = None


def _initialize_firebase() -> firebase_admin.App:
    """Initialize Firebase Admin SDK exactly once."""
    global _firebase_app
    if _firebase_app is not None:
        return _firebase_app

    settings = get_settings()
    sa_path = Path(settings.firebase_service_account_path)

    if sa_path.exists():
        cred = credentials.Certificate(str(sa_path))
    else:
        # Fall back to environment variable (for Render deployment)
        sa_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON")
        if not sa_json:
            raise RuntimeError(
                "Firebase service account not found. "
                "Set FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_SERVICE_ACCOUNT_JSON."
            )
        cred = credentials.Certificate(json.loads(sa_json))

    _firebase_app = firebase_admin.initialize_app(
        cred,
        {"projectId": settings.firebase_project_id},
    )
    return _firebase_app


# Initialize at import time
_initialize_firebase()

# ─── Clients exposed to the rest of the app ──────────────────────────────────

db: firestore.client = firestore.client()
auth_client = firebase_auth
