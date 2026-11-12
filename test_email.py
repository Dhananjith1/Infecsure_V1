"""Check SMTP authentication without sending an email or printing credentials."""
from __future__ import annotations

import os
import smtplib

from dotenv import load_dotenv


def main() -> None:
    load_dotenv()

    host = os.getenv("SMTP_HOST", "smtp.gmail.com")
    port_value = os.getenv("SMTP_PORT", "587")
    username = os.getenv("SMTP_USER", "").strip()
    password = os.getenv("SMTP_PASSWORD", "")

    if not username or not password:
        raise SystemExit("Set SMTP_USER and SMTP_PASSWORD in your local environment first.")

    try:
        port = int(port_value)
    except ValueError as exc:
        raise SystemExit("SMTP_PORT must be a valid integer.") from exc

    try:
        with smtplib.SMTP(host, port, timeout=15) as server:
            server.starttls()
            server.login(username, password)
        print("SMTP authentication succeeded. No email was sent.")
    except (OSError, smtplib.SMTPException) as exc:
        print(f"SMTP authentication failed ({type(exc).__name__}). Check your local SMTP settings.")
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
