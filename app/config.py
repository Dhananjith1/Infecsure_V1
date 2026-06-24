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
    firebase_web_api_key: str = ""

    # Email
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""

    # App
    app_env: str = "development"
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://infecsure.web.app",
    ]


@lru_cache()
def get_settings() -> Settings:
    return Settings()


# ─── Firebase Admin Singleton ────────────────────────────────────────────────

_firebase_app: firebase_admin.App | None = None
_firebase_init_error: Exception | None = None


def _initialize_firebase() -> firebase_admin.App:
    """Initialize Firebase Admin SDK exactly once."""
    global _firebase_app, _firebase_init_error
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
            _firebase_init_error = RuntimeError(
                "Firebase service account not found. "
                "Set FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_SERVICE_ACCOUNT_JSON."
            )
            raise _firebase_init_error
        try:
            cred = credentials.Certificate(json.loads(sa_json))
        except Exception as exc:
            _firebase_init_error = exc
            raise

    try:
        _firebase_app = firebase_admin.initialize_app(
            cred,
            {"projectId": settings.firebase_project_id},
        )
        _firebase_init_error = None
    except Exception as exc:
        _firebase_init_error = exc
        raise
    return _firebase_app


def firebase_credentials_available() -> bool:
    """Return True when Firebase can be initialized with configured credentials."""
    try:
        _initialize_firebase()
        return True
    except Exception:
        return False


def firebase_init_error() -> str | None:
    """Return the last Firebase initialization error for health diagnostics."""
    if _firebase_init_error is None:
        return None
    return str(_firebase_init_error)

# ─── Clients exposed to the rest of the app ──────────────────────────────────

def get_db() -> firestore.Client:
    _initialize_firebase()
    return firestore.client()


class LazyFirestoreClient:
    """Proxy that initializes Firebase only when Firestore is first used."""

    def __getattr__(self, name: str):
        return getattr(get_db(), name)


class LazyFirebaseAuthClient:
    """Proxy that initializes Firebase only when Auth is first used."""

    def __getattr__(self, name: str):
        _initialize_firebase()
        return getattr(firebase_auth, name)


db = LazyFirestoreClient()
auth_client = LazyFirebaseAuthClient()
