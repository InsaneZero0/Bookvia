"""Fase 12d - tests for the monthly executive P&L report."""
from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest

from services.monthly_pnl_report import (
    _prev_month_window,
    build_monthly_report,
    send_monthly_report,
)


def test_prev_month_window_mid_year():
    ref = datetime(2026, 5, 3, 12, 0, tzinfo=timezone.utc)
    start, end, label = _prev_month_window(ref)
    assert start == datetime(2026, 4, 1, tzinfo=timezone.utc)
    assert end.date().isoformat() == "2026-04-30"
    assert label == "Abril 2026"


def test_prev_month_window_january_wraps_to_december():
    ref = datetime(2026, 1, 15, 12, 0, tzinfo=timezone.utc)
    start, _end, label = _prev_month_window(ref)
    assert start == datetime(2025, 12, 1, tzinfo=timezone.utc)
    assert label == "Diciembre 2025"


@pytest.mark.asyncio
async def test_build_report_returns_expected_keys(monkeypatch):
    """All keys the email renderer / UI preview expect are present."""
    fake_pnl = {
        "period_start": "2026-04-01T00:00:00+00:00",
        "period_end": "2026-04-30T23:59:59+00:00",
        "transaction_count": 3,
        "transactions_with_actual_fee": 2,
        "transactions_margin_negative": 1,
        "client_paid_total": 500.0,
        "bookvia_fee_income": 24.6,
        "stripe_fee_estimated_total": 42.5,
        "stripe_fee_actual_total": 45.0,
        "fee_margin": -2.5,
        "gross_income_bookvia": 22.1,
        "refund_amount_total": 10.0,
        "coverage_pct": 66.7,
    }

    with patch(
        "services.monthly_pnl_report.compute_platform_pnl",
        new=AsyncMock(return_value=fake_pnl),
    ), patch("services.monthly_pnl_report.db") as mock_db:
        mock_db.reconciliation_issues.find.return_value.sort.return_value.to_list = AsyncMock(return_value=[])
        mock_db.refund_events.find.return_value.sort.return_value.limit.return_value.to_list = AsyncMock(return_value=[])
        mock_db.settlements.count_documents = AsyncMock(return_value=0)

        report = await build_monthly_report(now=datetime(2026, 5, 3, tzinfo=timezone.utc))

    assert report["period_label"] == "Abril 2026"
    assert report["pnl"] == fake_pnl
    assert set(report.keys()) >= {
        "period_label", "period_start", "period_end",
        "pnl", "reconciliation_issues_count", "reconciliation_issues",
        "top_refunds", "settlements_paid", "settlements_pending",
    }


@pytest.mark.asyncio
async def test_send_monthly_report_collects_failures(monkeypatch):
    """When send_email raises for one recipient, it ends up in `failed`
    and the other recipients are still delivered."""
    fake_report = {
        "period_label": "Abril 2026", "period_start": "x", "period_end": "y",
        "pnl": {"gross_income_bookvia": 0, "transaction_count": 0,
                "refund_amount_total": 0, "bookvia_fee_income": 0,
                "fee_margin": 0, "client_paid_total": 0,
                "stripe_fee_estimated_total": 0, "stripe_fee_actual_total": 0,
                "coverage_pct": 0, "transactions_margin_negative": 0},
        "reconciliation_issues_count": 0, "reconciliation_issues": [],
        "top_refunds": [], "settlements_paid": 0, "settlements_pending": 0,
    }

    call_count = {"n": 0}

    async def flaky_send(**kwargs):
        call_count["n"] += 1
        if kwargs["to"] == "bad@x.com":
            raise RuntimeError("resend domain not verified")
        return "ok-id"

    with patch(
        "services.monthly_pnl_report.build_monthly_report",
        new=AsyncMock(return_value=fake_report),
    ), patch("services.monthly_pnl_report.send_email", new=flaky_send):
        res = await send_monthly_report(recipients=["good@x.com", "bad@x.com"])

    assert res["sent_to"] == ["good@x.com"]
    assert len(res["failed"]) == 1
    assert res["failed"][0]["to"] == "bad@x.com"
    assert "resend" in res["failed"][0]["error"].lower()
