"""
Audit scoring helpers for manual and offline PWA submissions.
"""

from __future__ import annotations

from app.models.audit import AuditCreate, AuditSyncItem


def ratio(correct: int, total: int) -> float:
    if total <= 0:
        return 0.0
    return max(0.0, min(1.0, correct / total))


def hand_hygiene_ratio(actions: int, opportunities: int) -> float:
    return ratio(actions, opportunities)


def ppe_adherence_ratio(correct_items: int, required_items: int) -> float:
    return ratio(correct_items, required_items)


def waste_segregation_ratio(misplaced_items: int, total_items: int) -> float:
    if total_items <= 0:
        return 1.0
    return max(0.0, min(1.0, 1.0 - (misplaced_items / total_items)))


def percent(value: float) -> float:
    return round(max(0.0, min(1.0, value)) * 100.0, 2)


def build_audit_from_sync(item: AuditSyncItem) -> tuple[AuditCreate, dict]:
    hand_ratio = hand_hygiene_ratio(item.hand_hygiene.correct, item.hand_hygiene.total)
    ppe_ratio = ppe_adherence_ratio(item.ppe_adherence.correct, item.ppe_adherence.total)
    waste_ratio = waste_segregation_ratio(
        item.waste_segregation.misplaced_items,
        item.waste_segregation.total_items,
    )

    audit = AuditCreate(
        ward_id=item.ward_id,
        hand_hygiene_score=percent(hand_ratio),
        hand_hygiene_items=item.hand_hygiene_items,
        ppe_score=percent(ppe_ratio),
        ppe_items=item.ppe_items,
        waste_segregation_score=percent(waste_ratio),
        waste_segregation_items=item.waste_segregation_items,
        environmental_score=item.environmental_score,
        environmental_items=item.environmental_items,
        remarks=item.remarks,
        is_offline_sync=True,
    )

    metrics = {
        "hand_hygiene_ratio": round(hand_ratio, 4),
        "ppe_adherence_ratio": round(ppe_ratio, 4),
        "waste_segregation_ratio": round(waste_ratio, 4),
        "offline_record_id": item.offline_record_id,
        "captured_at": item.captured_at.isoformat() if item.captured_at else None,
    }
    return audit, metrics
