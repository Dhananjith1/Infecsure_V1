"""
InfecSure — Email Service
==========================
Handles dispatch of authorized MoH Notification emails.
Only called after ICNO validation.
"""

from __future__ import annotations

import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


def smtp_is_configured() -> bool:
    return bool(settings.smtp_user and settings.smtp_password)


def send_moh_notification(
    to_email: str,
    subject: str,
    body_html: str,
    cc: Optional[list[str]] = None,
) -> bool:
    """
    Send an MoH notification email via SMTP.
    Returns True on success, False on failure.
    Only executes if SMTP credentials are configured.
    """
    if not smtp_is_configured():
        logger.warning("SMTP credentials not configured. Email not sent.")
        return False

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"InfecSure System <{settings.smtp_user}>"
        msg["To"] = to_email
        if cc:
            msg["Cc"] = ", ".join(cc)

        # Plain text fallback
        plain_text = body_html.replace("<br>", "\n").replace("<p>", "\n").replace("</p>", "")
        msg.attach(MIMEText(plain_text, "plain"))
        msg.attach(MIMEText(body_html, "html"))

        with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
            server.ehlo()
            server.starttls()
            server.login(settings.smtp_user, settings.smtp_password)
            recipients = [to_email] + (cc or [])
            server.sendmail(settings.smtp_user, recipients, msg.as_string())

        logger.info(f"MoH notification sent to {to_email}")
        return True

    except Exception as e:
        logger.error(f"Failed to send email to {to_email}: {e}")
        return False


def build_moh_notification_body(alert_data: dict) -> str:
    """Build HTML email body for an MoH outbreak notification."""
    ward = alert_data.get("ward_id", "Unknown Ward")
    title = alert_data.get("title", "Infection Alert")
    description = alert_data.get("description", "")
    severity = alert_data.get("severity", "").upper()
    icno_notes = alert_data.get("icno_notes", "")

    color = {
        "LOW": "#28a745",
        "MEDIUM": "#ffc107",
        "HIGH": "#fd7e14",
        "CRITICAL": "#dc3545",
    }.get(severity, "#6c757d")

    return f"""
    <html><body style="font-family: Arial, sans-serif; color: #333;">
      <div style="background: {color}; color: white; padding: 16px; border-radius: 8px;">
        <h2 style="margin:0;">⚠️ InfecSure — {title}</h2>
        <p style="margin:4px 0 0;">Severity: <strong>{severity}</strong></p>
      </div>
      <div style="padding: 16px;">
        <p><strong>Ward:</strong> {ward}</p>
        <p><strong>Details:</strong><br>{description}</p>
        {"<p><strong>ICNO Notes:</strong><br>" + icno_notes + "</p>" if icno_notes else ""}
        <hr>
        <p style="font-size:12px; color:#999;">
          This notification was validated by the Infection Control Nursing Officer (ICNO)
          at Divisional Hospital, Thalangama. Sent by InfecSure v1.0.
        </p>
      </div>
    </body></html>
    """


def send_dengue_report_notification(doctor_email: str, report_summary: dict) -> bool:
    """Notify supervising doctor of a validated dengue report."""
    subject = "InfecSure — Validated Dengue Alert Report"
    body = f"""
    <html><body style="font-family: Arial, sans-serif; color: #333;">
      <div style="background: #dc3545; color: white; padding: 16px; border-radius: 8px;">
        <h2 style="margin:0;">🦟 Dengue Alert — ICNO Validated</h2>
      </div>
      <div style="padding: 16px;">
        <p>A dengue-related alert has been validated by the ICNO and requires your attention.</p>
        <p><strong>Ward:</strong> {report_summary.get("ward_id", "N/A")}</p>
        <p><strong>Risk Level:</strong> {report_summary.get("severity", "N/A").upper()}</p>
        <p><strong>Description:</strong><br>{report_summary.get("description", "")}</p>
        <p>Please log in to InfecSure to acknowledge this finding and issue management instructions.</p>
        <hr>
        <p style="font-size:12px; color:#999;">InfecSure v1.0 — Divisional Hospital, Thalangama</p>
      </div>
    </body></html>
    """
    return send_moh_notification(doctor_email, subject, body)
