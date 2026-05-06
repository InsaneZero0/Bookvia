"""
Fase 12b: Reconciliation of Stripe fees (actual vs estimated) and P&L.

Two capabilities:
  * `compute_platform_pnl(start, end)` aggregates every paid/refunded tx
    in the window and returns the real profit & loss for Bookvia.
  * `reconcile_with_stripe(date)` compares our DB with
    stripe.BalanceTransaction.list to detect missing or extra rows.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import stripe as stripe_lib

from core.database import db

logger = logging.getLogger(__name__)


async def compute_platform_pnl(
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
) -> Dict[str, Any]:
    """Bookvia profit & loss over a period.

    Income:
      * `bookvia_fee` (fixed $8.00 per confirmed booking, IVA included)
      * `fee_margin` = sum(stripe_fee_estimated - stripe_fee_actual)
        when actual is known. Negative means Stripe charged more than we
        retained from the business (we lost margin on that tx).

    Outcome:
      * `refunded_bookvia_fee`  – $8.00 we refunded on cancellations.
      * `stripe_net_loss`       – txs where real fee exceeded our estimate.
    """
    end = end or datetime.now(timezone.utc)
    start = start or (end - timedelta(days=30))

    start_iso, end_iso = start.isoformat(), end.isoformat()
    query = {
        "status": {"$in": ["paid", "refund_partial", "refund_full"]},
        "created_at": {"$gte": start_iso, "$lt": end_iso},
    }
    txs = await db.transactions.find(query, {"_id": 0}).to_list(10000)

    total_bookvia_fee = 0.0
    total_estimated_fee = 0.0
    total_actual_fee = 0.0
    txs_with_actual = 0
    txs_margin_negative = 0
    total_refunded = 0.0
    total_client_paid = 0.0

    for t in txs:
        total_bookvia_fee += float(t.get("bookvia_fee") or 0)
        total_client_paid += float(t.get("client_paid") or 0)
        est = float(t.get("stripe_fee_estimated") or 0)
        act = t.get("stripe_fee_actual")
        total_estimated_fee += est
        if act is not None:
            total_actual_fee += float(act)
            txs_with_actual += 1
            if float(act) > est:
                txs_margin_negative += 1
        total_refunded += float(t.get("refund_amount") or 0)

    fee_margin = round(total_estimated_fee - total_actual_fee, 2)
    gross_income = round(total_bookvia_fee + fee_margin, 2)

    return {
        "period_start": start_iso,
        "period_end": end_iso,
        "transaction_count": len(txs),
        "transactions_with_actual_fee": txs_with_actual,
        "transactions_margin_negative": txs_margin_negative,
        "client_paid_total": round(total_client_paid, 2),
        "bookvia_fee_income": round(total_bookvia_fee, 2),
        "stripe_fee_estimated_total": round(total_estimated_fee, 2),
        "stripe_fee_actual_total": round(total_actual_fee, 2),
        "fee_margin": fee_margin,
        "gross_income_bookvia": gross_income,
        "refund_amount_total": round(total_refunded, 2),
        "coverage_pct": round(100 * txs_with_actual / len(txs), 1) if txs else 0.0,
    }


async def reconcile_with_stripe(target_date: Optional[datetime] = None) -> Dict[str, Any]:
    """Daily reconciliation against Stripe.

    Pulls every BalanceTransaction for the given day and checks that every
    `charge` has a matching Bookvia transaction document. Flags mismatches
    in `db.reconciliation_issues` for admin review.
    """
    target = target_date or (datetime.now(timezone.utc) - timedelta(days=1))
    day_start = datetime(target.year, target.month, target.day, tzinfo=timezone.utc)
    day_end = day_start + timedelta(days=1)
    created_filter = {"gte": int(day_start.timestamp()), "lt": int(day_end.timestamp())}

    issues: List[Dict[str, Any]] = []
    seen_ids: List[str] = []
    matched_count = 0
    missing_count = 0

    try:
        has_more = True
        starting_after: Optional[str] = None
        while has_more:
            kwargs: Dict[str, Any] = {"limit": 100, "created": created_filter}
            if starting_after:
                kwargs["starting_after"] = starting_after
            page = stripe_lib.BalanceTransaction.list(**kwargs)
            for bt in page.auto_paging_iter() if hasattr(page, "auto_paging_iter") else page.data:
                seen_ids.append(bt.id)
                if bt.type != "charge":
                    continue
                source = bt.source
                if isinstance(source, str) and source.startswith("ch_"):
                    charge_id = source
                else:
                    charge_id = getattr(source, "id", None)
                if not charge_id:
                    continue
                tx = await db.transactions.find_one({"stripe_charge_id": charge_id}, {"_id": 0, "id": 1})
                if tx:
                    matched_count += 1
                else:
                    missing_count += 1
                    issues.append({
                        "date": day_start.isoformat(),
                        "issue": "missing_tx_for_charge",
                        "stripe_charge_id": charge_id,
                        "balance_transaction_id": bt.id,
                        "amount": float(bt.amount) / 100.0,
                    })
            has_more = getattr(page, "has_more", False)
            if has_more:
                starting_after = seen_ids[-1] if seen_ids else None
    except Exception as e:
        logger.error(f"Stripe reconciliation failed for {day_start.date()}: {e}")
        return {"ok": False, "error": str(e), "date": day_start.isoformat()}

    if issues:
        for issue in issues:
            issue.setdefault("detected_at", datetime.now(timezone.utc).isoformat())
            await db.reconciliation_issues.update_one(
                {"stripe_charge_id": issue["stripe_charge_id"]},
                {"$set": issue}, upsert=True,
            )

    logger.info(
        f"Stripe reconciliation {day_start.date()}: "
        f"seen={len(seen_ids)} matched={matched_count} missing={missing_count}"
    )
    return {
        "ok": True,
        "date": day_start.isoformat(),
        "stripe_transactions": len(seen_ids),
        "matched": matched_count,
        "missing": missing_count,
        "issues": issues,
    }
