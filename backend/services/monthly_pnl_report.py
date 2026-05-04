"""
Fase 12d: Monthly executive P&L report.

Sends to every admin email a digest of:
  * Last calendar month P&L (from services.reconciliation.compute_platform_pnl)
  * Reconciliation issues detected in that month
  * Top-5 refunds in MXN
  * Day-20 settlement counts (paid / pending)

Triggered manually via POST /api/admin/platform/pnl-report/send, and
automatically by `monthly_pnl_report_scheduler` on day-1 of each month.
"""
from __future__ import annotations

import logging
from calendar import monthrange
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from core.database import db
from services.email import email_html, send_email
from services.reconciliation import compute_platform_pnl

logger = logging.getLogger(__name__)

_MONTHS_ES = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
]


def _prev_month_window(now: Optional[datetime] = None) -> Tuple[datetime, datetime, str]:
    """Return (start_utc, end_utc, label_es) for the previous calendar month."""
    ref = now or datetime.now(timezone.utc)
    year = ref.year if ref.month > 1 else ref.year - 1
    month = ref.month - 1 if ref.month > 1 else 12
    start = datetime(year, month, 1, tzinfo=timezone.utc)
    last_day = monthrange(year, month)[1]
    end = datetime(year, month, last_day, 23, 59, 59, tzinfo=timezone.utc)
    label = f"{_MONTHS_ES[month - 1].capitalize()} {year}"
    return start, end, label


async def _list_admin_emails() -> List[str]:
    cursor = db.users.find(
        {"role": "admin", "active": {"$ne": False}, "account_deleted": {"$ne": True}},
        {"_id": 0, "email": 1},
    )
    return [d["email"] for d in await cursor.to_list(50) if d.get("email")]


def _fmt_mxn(amount) -> str:
    try:
        return f"${float(amount):,.2f}"
    except (TypeError, ValueError):
        return "$0.00"


async def build_monthly_report(now: Optional[datetime] = None) -> Dict[str, Any]:
    """Gather every data-point that goes into the email. Pure compute so
    it can also be surfaced in the admin UI for preview."""
    start, end, label = _prev_month_window(now)
    start_iso, end_iso = start.isoformat(), end.isoformat()

    pnl = await compute_platform_pnl(start=start, end=end)

    issues = await db.reconciliation_issues.find(
        {"date": {"$gte": start_iso, "$lt": end_iso}},
        {"_id": 0},
    ).sort("detected_at", -1).to_list(1000)

    refunds = await db.refund_events.find(
        {"created_at": {"$gte": start_iso, "$lt": end_iso}},
        {"_id": 0},
    ).sort("amount_mxn", -1).limit(5).to_list(5)

    settlement_query = {
        "created_at": {"$gte": start_iso, "$lt": end_iso},
    }
    settlements_paid = await db.settlements.count_documents({**settlement_query, "status": "paid"})
    settlements_pending = await db.settlements.count_documents({**settlement_query, "status": {"$ne": "paid"}})

    return {
        "period_label": label,
        "period_start": start_iso,
        "period_end": end_iso,
        "pnl": pnl,
        "reconciliation_issues_count": len(issues),
        "reconciliation_issues": issues[:10],  # top 10 for the email
        "top_refunds": refunds,
        "settlements_paid": settlements_paid,
        "settlements_pending": settlements_pending,
    }


def _render_email_html(report: Dict[str, Any]) -> str:
    pnl = report["pnl"]
    label = report["period_label"]

    kpi_row = (
        '<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 24px;">'
        '<tr>'
        f'<td width="50%" style="padding:12px;background:#ecfdf5;border-radius:8px 0 0 8px;border:1px solid #a7f3d0;">'
        f'<p style="margin:0;font-size:11px;color:#065f46;letter-spacing:0.5px;">INGRESO BRUTO</p>'
        f'<p style="margin:4px 0 0;font-size:22px;font-weight:bold;color:#065f46;">{_fmt_mxn(pnl["gross_income_bookvia"])}</p>'
        f'</td>'
        f'<td width="50%" style="padding:12px;background:#eff6ff;border-radius:0 8px 8px 0;border:1px solid #bfdbfe;border-left:none;">'
        f'<p style="margin:0;font-size:11px;color:#1e40af;letter-spacing:0.5px;">TRANSACCIONES</p>'
        f'<p style="margin:4px 0 0;font-size:22px;font-weight:bold;color:#1e40af;">{pnl["transaction_count"]}</p>'
        f'</td>'
        '</tr></table>'
    )

    breakdown_rows = [
        ("Fee fijo $8.20 por reserva", _fmt_mxn(pnl["bookvia_fee_income"])),
        ("Margen fee Stripe (est. vs real)", _fmt_mxn(pnl["fee_margin"])),
        ("Cliente pagó (total)", _fmt_mxn(pnl["client_paid_total"])),
        ("Fee real Stripe", _fmt_mxn(pnl["stripe_fee_actual_total"])),
        ("Reembolsos emitidos", _fmt_mxn(pnl["refund_amount_total"])),
        ("Cobertura fee real", f"{pnl['coverage_pct']}%"),
    ]
    breakdown_html = (
        '<table width="100%" cellpadding="8" cellspacing="0" style="border-collapse:collapse;font-size:14px;color:#334155;">'
        + "".join(
            f'<tr style="border-bottom:1px solid #e2e8f0;">'
            f'<td style="color:#64748b;">{k}</td>'
            f'<td align="right" style="font-weight:bold;">{v}</td>'
            f'</tr>'
            for k, v in breakdown_rows
        )
        + '</table>'
    )

    alerts = []
    if pnl["transactions_margin_negative"] > 0:
        alerts.append(
            f'<p style="margin:0 0 8px;color:#991b1b;font-size:14px;">'
            f'<strong>Margen negativo:</strong> {pnl["transactions_margin_negative"]} transacciones '
            f'donde Stripe cobró más del fee estimado.</p>'
        )
    if report["reconciliation_issues_count"] > 0:
        alerts.append(
            f'<p style="margin:0 0 8px;color:#991b1b;font-size:14px;">'
            f'<strong>Discrepancias Stripe:</strong> {report["reconciliation_issues_count"]} cargos '
            f'en Stripe sin transacción en Bookvia.</p>'
        )
    if report["settlements_pending"] > 0:
        alerts.append(
            f'<p style="margin:0 0 8px;color:#92400e;font-size:14px;">'
            f'<strong>Liquidaciones pendientes:</strong> {report["settlements_pending"]} por pagar '
            f'(y {report["settlements_paid"]} ya pagadas).</p>'
        )
    alerts_html = (
        f'<div style="margin:20px 0;padding:14px;background:#fef2f2;border-left:4px solid #ef4444;border-radius:4px;">'
        f'<p style="margin:0 0 8px;font-weight:bold;color:#991b1b;">Alertas</p>'
        + "".join(alerts)
        + '</div>'
        if alerts else ''
    )

    refunds_html = ""
    if report["top_refunds"]:
        rows = "".join(
            f'<tr style="border-bottom:1px solid #e2e8f0;">'
            f'<td style="padding:6px 8px;font-size:13px;color:#64748b;">{(r.get("reason") or "-")[:40]}</td>'
            f'<td style="padding:6px 8px;font-size:13px;color:#64748b;">{(r.get("actor") or "-")[:20]}</td>'
            f'<td align="right" style="padding:6px 8px;font-size:13px;font-weight:bold;">{_fmt_mxn(r.get("amount_mxn"))}</td>'
            f'</tr>'
            for r in report["top_refunds"]
        )
        refunds_html = (
            f'<h3 style="margin:24px 0 8px;color:#1e293b;font-size:15px;">Top reembolsos</h3>'
            f'<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">'
            f'<thead><tr style="background:#f8fafc;">'
            f'<th align="left" style="padding:6px 8px;font-size:11px;color:#64748b;letter-spacing:0.5px;">RAZÓN</th>'
            f'<th align="left" style="padding:6px 8px;font-size:11px;color:#64748b;letter-spacing:0.5px;">ACTOR</th>'
            f'<th align="right" style="padding:6px 8px;font-size:11px;color:#64748b;letter-spacing:0.5px;">MONTO</th>'
            f'</tr></thead><tbody>{rows}</tbody></table>'
        )

    return (
        f'<p style="color:#334155;font-size:15px;line-height:1.6;">'
        f'Hola admin, aquí tienes el resumen financiero de Bookvia para <strong>{label}</strong>.</p>'
        f'{kpi_row}'
        f'<h3 style="margin:0 0 8px;color:#1e293b;font-size:15px;">Desglose P&amp;L</h3>'
        f'{breakdown_html}'
        f'{alerts_html}'
        f'{refunds_html}'
        f'<table cellpadding="0" cellspacing="0" style="margin:28px 0 8px;">'
        f'<tr><td style="background:#F05D5E;border-radius:8px;padding:12px 24px;">'
        f'<a href="https://bookvia.vercel.app/bv-ctrl" style="color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;">'
        f'Abrir panel admin</a></td></tr></table>'
        f'<p style="color:#94a3b8;font-size:12px;margin-top:24px;">'
        f'Periodo: {report["period_start"][:10]} → {report["period_end"][:10]}. '
        f'Este reporte se genera automáticamente el día 1 de cada mes.</p>'
    )


async def send_monthly_report(
    now: Optional[datetime] = None,
    recipients: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Build the report for the previous month and email it to every admin.

    Returns the report payload + a list of recipients that were emailed
    so the caller (manual trigger in admin UI) can surface the result.
    """
    report = await build_monthly_report(now=now)
    to_list = recipients if recipients else await _list_admin_emails()

    if not to_list:
        logger.warning("Monthly P&L report: no admin emails found - skipping send")
        return {"sent_to": [], "report": report, "note": "no admin emails"}

    subject = f"Bookvia - Reporte P&L {report['period_label']}"
    html = email_html(f"Reporte P&L · {report['period_label']}", _render_email_html(report))
    pnl = report["pnl"]
    text = (
        f"Bookvia - Reporte P&L {report['period_label']}\n"
        f"Ingreso bruto: {_fmt_mxn(pnl['gross_income_bookvia'])}\n"
        f"Transacciones: {pnl['transaction_count']}\n"
        f"Reembolsos: {_fmt_mxn(pnl['refund_amount_total'])}\n"
        f"Discrepancias Stripe: {report['reconciliation_issues_count']}\n"
        f"Ver panel: https://bookvia.vercel.app/bv-ctrl"
    )

    sent_to: List[str] = []
    failed: List[Dict[str, str]] = []
    for to in to_list:
        try:
            await send_email(
                to=to, subject=subject, body=text, html=html,
                template="monthly_pnl_report",
                data={
                    "period": report["period_label"],
                    "gross_income": pnl["gross_income_bookvia"],
                },
            )
            sent_to.append(to)
        except Exception as e:
            logger.error(f"Monthly P&L report failed for {to}: {e}")
            failed.append({"to": to, "error": str(e)[:200]})

    logger.info(f"Monthly P&L report sent to {len(sent_to)} admins for {report['period_label']}")
    return {"sent_to": sent_to, "failed": failed, "report": report}
