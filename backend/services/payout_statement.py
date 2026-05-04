"""
Payout statement PDF generator — Phase 21.

Reuses the branding and WeasyPrint pipeline already set up for the legal
expediente (Phase 20). Called on-demand whenever a business or an admin
requests the PDF for a specific settlement_id.

The statement describes the money that moved in one day-20 cycle:
    * period (del dia 1 al dia 20 de <mes>)
    * list of transactions that contributed to the payout
    * gross collected from clients
    * Stripe processing retained
    * Bookvia fixed fees collected directly from clients
    * net deposited on the 1st of next month
    * deposit CLABE, settlement folio, generation timestamp + hash

Output: a single PDF (bytes) with header + 7 sections + signature footer.
"""
from __future__ import annotations

import hashlib
import io
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from weasyprint import HTML

from core.database import db

logger = logging.getLogger(__name__)

STATEMENT_VERSION = "v1-2026-02"

MONTHS_ES = {
    1: "enero", 2: "febrero", 3: "marzo", 4: "abril",
    5: "mayo", 6: "junio", 7: "julio", 8: "agosto",
    9: "septiembre", 10: "octubre", 11: "noviembre", 12: "diciembre",
}


def _fmt_date(iso: Optional[str]) -> str:
    if not iso:
        return "—"
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return dt.strftime("%d/%m/%Y %H:%M")
    except Exception:
        return iso


def _fmt_short_date(iso: Optional[str]) -> str:
    if not iso:
        return "—"
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return dt.strftime("%d/%m/%Y")
    except Exception:
        return iso


def _mask_clabe(clabe: Optional[str]) -> str:
    if not clabe:
        return "—"
    s = str(clabe)
    return f"{s[:4]}••••••••••{s[-4:]}" if len(s) >= 8 else "••••"


def _parse_period_key(period_key: Optional[str]):
    """Parse period_key in formats 'YYYY-MM' or 'MX-YYYY-MM' (any country prefix).
    Returns (year:int, month:int) or None on malformed input."""
    if not period_key:
        return None
    try:
        parts = str(period_key).split("-")
        if len(parts) < 2:
            return None
        y = int(parts[-2])
        m = int(parts[-1])
        if not (1 <= m <= 12):
            return None
        return y, m
    except (ValueError, TypeError):
        return None


def _period_label_es(period_key: Optional[str]) -> str:
    """Convert a period_key like 'MX-2026-02' or '2026-02' into 'del 1 al 20 de febrero de 2026'."""
    parsed = _parse_period_key(period_key)
    if not parsed:
        return period_key or "—"
    y, m = parsed
    return f"del 1 al 20 de {MONTHS_ES[m]} de {y}"


def _deposit_date_es(period_key: Optional[str]) -> str:
    """Return the scheduled deposit date (1st of the month AFTER period_key)."""
    parsed = _parse_period_key(period_key)
    if not parsed:
        return "—"
    y, m = parsed
    m += 1
    if m > 12:
        m = 1
        y += 1
    return f"1 de {MONTHS_ES[m]} de {y}"


HTML_TEMPLATE = r"""
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<style>
@page { size: Letter; margin: 26mm 18mm 26mm 18mm;
  @bottom-center { content: "Página " counter(page) " de " counter(pages); font-size: 9px; color: #64748b; }
  @top-right { content: "Bookvia · Estado de cuenta del corte"; font-size: 9px; color: #64748b; }
}
body { font-family: Helvetica, Arial, sans-serif; color: #0f172a; font-size: 11px; line-height: 1.4; }
.header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #F05D5E; padding-bottom: 8px; margin-bottom: 12px; }
.header .brand { font-size: 24px; font-weight: 800; letter-spacing: -0.8px; color: #F05D5E; }
.header .meta-right { text-align: right; font-size: 9px; color: #64748b; }
h1 { color: #0f172a; font-size: 20px; margin: 0 0 4px 0; letter-spacing: -0.5px; }
h2 { color: #F05D5E; font-size: 12px; margin: 14px 0 6px 0; border-bottom: 2px solid #F05D5E; padding-bottom: 3px; text-transform: uppercase; letter-spacing: 0.4px; }
.subtitle { color: #64748b; font-size: 11px; margin-bottom: 12px; }
.net-box {
  background: linear-gradient(135deg, #ecfdf5 0%, #dcfce7 100%);
  border: 2px solid #059669;
  border-radius: 8px;
  padding: 16px 18px;
  margin: 10px 0 14px 0;
  display: flex; justify-content: space-between; align-items: center;
}
.net-box .label { font-size: 10px; color: #065f46; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; }
.net-box .amount { font-size: 26px; color: #047857; font-weight: 800; letter-spacing: -0.7px; }
.net-box .date { font-size: 11px; color: #065f46; font-weight: 600; margin-top: 2px; }
table { width: 100%; border-collapse: collapse; margin: 4px 0 6px 0; }
td { padding: 4px 6px; vertical-align: top; border-bottom: 1px solid #e2e8f0; font-size: 10.5px; }
td.k { color: #64748b; width: 42%; font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; }
td.v { color: #0f172a; font-weight: 500; }
td.r { text-align: right; font-family: Menlo, Consolas, monospace; tabular-nums: ; }
.tx-table { font-size: 9.5px; }
.tx-table th { background: #0f172a; color: #ffffff; padding: 6px 8px; text-align: left; font-size: 9.5px; font-weight: 600; letter-spacing: 0.2px; }
.tx-table th.r { text-align: right; }
.tx-table td { padding: 5px 8px; border-bottom: 1px solid #f1f5f9; font-size: 9.5px; }
.tx-table tr:nth-child(even) td { background: #f8fafc; }
.totals-table td { font-size: 11px; padding: 6px 8px; }
.totals-table td.label { color: #64748b; }
.totals-table td.amount { text-align: right; font-family: Menlo, Consolas, monospace; font-weight: 600; }
.totals-table tr.grand td { background: #0f172a; color: #ffffff; font-size: 13px; font-weight: 700; }
.totals-table tr.grand td.amount { color: #4ade80; }
.code { font-family: Menlo, Consolas, monospace; font-size: 9px; color: #334155; word-break: break-all; }
.hash-box { background: #f8fafc; border: 1px dashed #94a3b8; padding: 6px 8px; border-radius: 4px; margin: 4px 0 6px 0; }
.note { font-size: 9.5px; color: #64748b; font-style: italic; margin-top: 6px; }
.chip { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 9px; font-weight: 600; background: #e2e8f0; color: #0f172a; }
.chip.ok { background: #dcfce7; color: #166534; }
.chip.warn { background: #fef3c7; color: #854d0e; }
.chip.pending { background: #e0e7ff; color: #3730a3; }
.footer-box { margin-top: 14px; padding: 10px 12px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 10px; }
.footer-box .lbl { color: #64748b; font-weight: 600; font-size: 9px; text-transform: uppercase; letter-spacing: 0.4px; }
</style>
</head>
<body>

<div class="header">
  <div>
    <div class="brand">bookvia<sup>✦</sup></div>
    <div class="subtitle">Estado de cuenta · Corte mensual</div>
  </div>
  <div class="meta-right">
    <p><strong>Emitido:</strong> {{issued_at}}</p>
    <p><strong>Versión:</strong> {{version}}</p>
    <p><strong>Folio:</strong> <span class="code">{{folio}}</span></p>
  </div>
</div>

<h1>{{biz_name}}</h1>
<p class="subtitle">
  Estado de cuenta del periodo <strong>{{period_label}}</strong>
  · Depósito programado el <strong>{{deposit_date}}</strong>
</p>

<div class="net-box">
  <div>
    <div class="label">Neto a depositar en tu CLABE</div>
    <div class="date">{{deposit_date_label}}</div>
  </div>
  <div class="amount">{{net_mxn}}</div>
</div>

<h2>1. Datos del beneficiario</h2>
<table>
  <tr><td class="k">Negocio</td><td class="v">{{biz_name}}</td></tr>
  <tr><td class="k">RFC</td><td class="v">{{biz_rfc}}</td></tr>
  <tr><td class="k">Razón social</td><td class="v">{{biz_legal}}</td></tr>
  <tr><td class="k">CLABE destino</td><td class="v code">{{clabe_masked}}</td></tr>
  <tr><td class="k">Folio del corte</td><td class="v code">{{folio}}</td></tr>
  <tr><td class="k">Estatus del pago</td><td class="v"><span class="chip {{status_class}}">{{status_label}}</span></td></tr>
</table>

<h2>2. Resumen financiero del corte</h2>
<table class="totals-table">
  <tr><td class="label">Total cobrado a clientes (bruto)</td><td class="amount">{{gross_client}}</td></tr>
  <tr><td class="label">— Fee fijo Bookvia (pagado directamente por el cliente, no sale de ti)</td><td class="amount">{{bookvia_fee}}</td></tr>
  <tr><td class="label">Anticipos netos recibidos por Bookvia</td><td class="amount">{{deposits_gross}}</td></tr>
  <tr><td class="label">— Procesamiento Stripe estimado (8.5% sobre anticipo)</td><td class="amount">{{stripe_fee}}</td></tr>
  <tr class="grand"><td class="label">Neto a depositar en tu CLABE</td><td class="amount">{{net_mxn}}</td></tr>
</table>

<h2>3. Transacciones incluidas ({{tx_count}})</h2>
{{tx_rows_html}}

<h2>4. Información adicional</h2>
<table>
  <tr><td class="k">Citas incluidas</td><td class="v">{{booking_count}}</td></tr>
  <tr><td class="k">Periodo de transacciones</td><td class="v">{{period_label}}</td></tr>
  <tr><td class="k">Generado el</td><td class="v">{{settlement_created}}</td></tr>
  <tr><td class="k">Si hubo reembolsos o disputas</td><td class="v">Se reflejan reduciendo el neto arriba. Revisa la tabla de transacciones.</td></tr>
</table>

<h2>5. Política y política de reembolsos</h2>
<p class="note" style="font-style:normal;color:#334155;">
  El monto neto se calcula únicamente con transacciones que alcanzaron el estado <strong>CLEARED</strong> (liberadas
  del periodo de gracia de 24 horas sin disputas) al cierre del corte del día 20. Transacciones que aún están en
  HELD o PENDING se incluirán en el siguiente corte. Las disputas/chargebacks en Stripe pueden retener tu dinero
  de 10 a 30 días; si aplica, se descontará del siguiente corte y se notificará por separado.
</p>
<p class="note" style="font-style:normal;color:#334155;">
  La transferencia SPEI llega en <strong>1 a 3 días hábiles</strong> posteriores al 1° del mes. Si no recibes el
  depósito al día 3° del mes, contáctanos a <strong>soporte@bookvia.app</strong> con el folio de este corte.
</p>

<div class="footer-box">
  <p class="lbl" style="margin-bottom:4px;">Hash SHA-256 del estado de cuenta</p>
  <div class="hash-box code">{{content_hash}}</div>
  <p style="margin:4px 0 0;color:#64748b;font-size:9.5px;">
    Este hash identifica de forma única este documento. Guárdalo si necesitas demostrar autenticidad.
    Si editas el PDF, el hash ya no coincidirá.
  </p>
</div>

<p class="note" style="margin-top:14px;">
  Documento informativo. No sustituye CFDI ni constancia fiscal. Bookvia no declara impuestos a tu nombre.
  Consulta el desglose de comisiones vigente en tu panel o en <strong>Ajustes → Cobros</strong>.
</p>

</body>
</html>
"""


def _render_tx_rows(txs: List[Dict[str, Any]]) -> str:
    if not txs:
        return '<p class="note">Sin transacciones asociadas.</p>'
    rows = [
        '<table class="tx-table" cellspacing="0" cellpadding="0">',
        '<tr>'
        '<th>Fecha</th>'
        '<th>Cita</th>'
        '<th>Cliente</th>'
        '<th class="r">Cobrado</th>'
        '<th class="r">Stripe</th>'
        '<th class="r">Neto negocio</th>'
        '</tr>',
    ]
    for tx in txs:
        when = _fmt_short_date(tx.get("created_at") or tx.get("cleared_at"))
        booking_ref = (tx.get("booking_id") or "")[:8]
        client_ref = tx.get("client_name") or (tx.get("user_id") or "")[:8] or "—"
        gross = float(tx.get("client_paid") or tx.get("deposit_amount") or 0)
        stripe_fee = float(tx.get("stripe_fee_estimated") or 0)
        net = float(tx.get("business_amount") or 0)
        rows.append(
            f"<tr>"
            f"<td>{when}</td>"
            f"<td class='code'>{booking_ref}</td>"
            f"<td>{client_ref}</td>"
            f"<td class='r'>${gross:,.2f}</td>"
            f"<td class='r'>-${stripe_fee:,.2f}</td>"
            f"<td class='r'><strong>${net:,.2f}</strong></td>"
            f"</tr>"
        )
    rows.append("</table>")
    return "\n".join(rows)


async def _aggregate_settlement(settlement_id: str) -> Optional[Dict[str, Any]]:
    settlement = await db.settlements.find_one({"id": settlement_id}, {"_id": 0})
    if not settlement:
        return None

    business = await db.businesses.find_one(
        {"id": settlement.get("business_id")},
        {"_id": 0, "name": 1, "legal_name": 1, "rfc": 1, "clabe": 1, "email": 1,
         "public_code": 1},
    ) or {}

    # Load all transactions tagged with this settlement
    tx_ids = settlement.get("transaction_ids") or []
    txs: List[Dict[str, Any]] = []
    if tx_ids:
        txs = await db.transactions.find(
            {"id": {"$in": tx_ids}},
            {"_id": 0},
        ).sort("created_at", 1).to_list(5000)

    gross_client_total = round(
        sum(float(t.get("client_paid") or t.get("deposit_amount") or 0) for t in txs), 2
    )
    bookvia_fee_total = round(sum(float(t.get("bookvia_fee") or 0) for t in txs), 2)
    stripe_fee_total = round(sum(float(t.get("stripe_fee_estimated") or 0) for t in txs), 2)
    net_total = round(float(settlement.get("net_payout") or settlement.get("payout_amount") or 0), 2)
    # Deposits gross (what Bookvia received from clients, excluding the bookvia fee
    # which the client paid separately)
    deposits_gross = round(gross_client_total - bookvia_fee_total, 2)

    # Enrich transactions with client name (optional — best effort)
    user_ids = {t.get("user_id") for t in txs if t.get("user_id")}
    user_map = {}
    if user_ids:
        async for u in db.users.find(
            {"id": {"$in": list(user_ids)}},
            {"_id": 0, "id": 1, "full_name": 1},
        ):
            user_map[u["id"]] = u.get("full_name") or "—"
    for t in txs:
        t["client_name"] = user_map.get(t.get("user_id"), "—")

    return {
        "settlement": settlement,
        "business": business,
        "transactions": txs,
        "gross_client_total": gross_client_total,
        "bookvia_fee_total": bookvia_fee_total,
        "stripe_fee_total": stripe_fee_total,
        "deposits_gross": deposits_gross,
        "net_total": net_total,
    }


def _render_template(data: Dict[str, Any], content_hash: str = "PENDING") -> str:
    s = data["settlement"]
    b = data["business"]
    status = s.get("status", "pending") or "pending"
    status_label = {
        "pending": "En espera de SPEI",
        "paid": "Depositado",
        "failed": "Fallido — contactar a soporte",
        "on_hold": "Retenido",
    }.get(status, status)
    status_class = {"pending": "pending", "paid": "ok",
                    "failed": "warn", "on_hold": "warn"}.get(status, "")

    fmt = lambda n: f"${float(n or 0):,.2f}"  # noqa: E731

    rep = {
        "{{issued_at}}": datetime.now(timezone.utc).astimezone().strftime("%d/%m/%Y %H:%M"),
        "{{version}}": STATEMENT_VERSION,
        "{{folio}}": s.get("id") or "—",
        "{{biz_name}}": b.get("name") or s.get("business_name") or "—",
        "{{biz_rfc}}": s.get("rfc") or b.get("rfc") or "—",
        "{{biz_legal}}": s.get("legal_name") or b.get("legal_name") or b.get("name") or "—",
        "{{clabe_masked}}": _mask_clabe(s.get("clabe") or b.get("clabe")),
        "{{period_label}}": _period_label_es(s.get("period_key")),
        "{{deposit_date}}": _deposit_date_es(s.get("period_key")),
        "{{deposit_date_label}}": "Se programa para el " + _deposit_date_es(s.get("period_key")),
        "{{net_mxn}}": fmt(data["net_total"]) + " MXN",
        "{{gross_client}}": fmt(data["gross_client_total"]),
        "{{bookvia_fee}}": fmt(data["bookvia_fee_total"]),
        "{{deposits_gross}}": fmt(data["deposits_gross"]),
        "{{stripe_fee}}": "-" + fmt(data["stripe_fee_total"]),
        "{{tx_count}}": str(len(data["transactions"])),
        "{{tx_rows_html}}": _render_tx_rows(data["transactions"]),
        "{{booking_count}}": str(s.get("booking_count") or 0),
        "{{settlement_created}}": _fmt_date(s.get("created_at")),
        "{{status_label}}": status_label,
        "{{status_class}}": status_class,
        "{{content_hash}}": content_hash,
    }
    html = HTML_TEMPLATE
    for k, v in rep.items():
        html = html.replace(k, str(v) if v is not None else "—")
    return html


async def generate_payout_statement_pdf(settlement_id: str) -> Optional[Dict[str, Any]]:
    """Build the PDF bytes for a given settlement. Returns None if not found."""
    data = await _aggregate_settlement(settlement_id)
    if not data:
        return None

    # Render once with placeholder → compute hash → re-render with real hash
    placeholder_html = _render_template(data, content_hash="PENDING")
    content_hash = hashlib.sha256(placeholder_html.encode("utf-8")).hexdigest()
    final_html = _render_template(data, content_hash=content_hash)

    buf = io.BytesIO()
    HTML(string=final_html).write_pdf(buf)

    return {
        "pdf_bytes": buf.getvalue(),
        "content_hash": content_hash,
        "settlement_id": settlement_id,
        "business_id": data["settlement"].get("business_id"),
        "rfc": data["settlement"].get("rfc") or data["business"].get("rfc"),
        "period_key": data["settlement"].get("period_key"),
    }
