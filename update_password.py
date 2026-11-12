"""Safely update a Firebase Auth user's password from a local terminal.

This utility intentionally contains no user IDs, passwords, or credentials.
Keep the Firebase service-account file outside Git and supply it locally.
"""
from __future__ import annotations

import os
from getpass import getpass
from pathlib import Path

import firebase_admin
from firebase_admin import auth, credentials


def main() -> None:
    uid = input("Firebase Auth user UID: ").strip()
    if not uid:
        raise SystemExit("A user UID is required.")

    password = getpass("New password (input hidden): ")
    confirmation = getpass("Confirm new password: ")
    if len(password) < 12:
        raise SystemExit("Use a password with at least 12 characters.")
    if password != confirmation:
        raise SystemExit("The passwords do not match.")

    credential_path = Path(
        os.environ.get("FIREBASE_SERVICE_ACCOUNT_PATH", "firebase-service-account.json")
    )
    if not credential_path.is_file():
        raise SystemExit(
            "Firebase service-account file not found. Set FIREBASE_SERVICE_ACCOUNT_PATH."
        )

    if not firebase_admin._apps:
        firebase_admin.initialize_app(credentials.Certificate(str(credential_path)))

    auth.update_user(uid, password=password)
    print("Firebase Auth password updated successfully.")


if __name__ == "__main__":
    main()
