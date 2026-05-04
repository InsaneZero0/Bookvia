"""
Legal file generator for business accounts.

Builds a single-PDF "expediente legal" aggregating:
  * identity + tax info
  * document references (KYC)
  * T&C / privacy / commission-terms acceptance history with hashes
  * KYC verification status
  * operational state
  * a SHA-256 hash of the generated PDF itself
  * a QR code linking to a public verification endpoint

Used by both the business owner (self-download) and admins (CONDUSEF /
support queries). Pure Python → no external services required.
"""
from __future__ import annotations

import base64
import hashlib
import io
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

import qrcode
# WeasyPrint is imported lazily inside generate_business_legal_file() so that
# a missing native library (Pango/Cairo/HarfBuzz) on a freshly provisioned
# Railway/Nixpacks container does NOT crash the whole FastAPI boot — only
# the PDF endpoints will fail until the system libs are available.

from core.database import db

logger = logging.getLogger(__name__)

LEGAL_FILE_VERSION = "v1-2026-02"


# ------------------------------------------------------------------ helpers

def _fmt_date(iso: Optional[str]) -> str:
    if not iso:
        return "—"
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return dt.strftime("%d/%m/%Y %H:%M")
    except Exception:
        return iso


def _mask_clabe(clabe: Optional[str]) -> str:
    if not clabe:
        return "—"
    clabe = str(clabe)
    if len(clabe) < 8:
        return "••••"
    return f"{clabe[:4]}••••••••••{clabe[-4:]}"


def _b64_qr(text: str) -> str:
    buf = io.BytesIO()
    qr = qrcode.QRCode(
        version=None, box_size=6, border=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
    )
    qr.add_data(text)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#1e293b", back_color="#ffffff")
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


# --------------------------------------------------------------- aggregation

async def _aggregate_business_legal_data(business_id: str) -> Optional[Dict[str, Any]]:
    """Pull every piece of data we need into a single dict."""
    business = await db.businesses.find_one({"id": business_id}, {"_id": 0})
    if not business:
        return None

    user = await db.users.find_one(
        {"business_id": business_id},
        {"_id": 0, "full_name": 1, "email": 1, "phone": 1, "created_at": 1,
         "accepted_terms_version": 1, "accepted_terms_at": 1,
         "terms_acceptance_history": 1},
    ) or {}

    # Count audit-relevant stats (cheap aggregates)
    total_bookings = await db.bookings.count_documents({"business_id": business_id})
    total_completed = await db.bookings.count_documents(
        {"business_id": business_id, "status": {"$in": ["completed", "confirmed"]}}
    )
    tx_agg = await db.transactions.aggregate([
        {"$match": {"business_id": business_id, "status": "paid"}},
        {"$group": {"_id": None, "n": {"$sum": 1},
                    "client_paid": {"$sum": "$client_paid"},
                    "business_amount": {"$sum": "$business_amount"},
                    "bookvia_fee": {"$sum": "$bookvia_fee"}}},
    ]).to_list(1)
    tx = tx_agg[0] if tx_agg else {}

    return {
        "business": business,
        "user": user,
        "stats": {
            "total_bookings": total_bookings,
            "total_completed_bookings": total_completed,
            "tx_count": int(tx.get("n") or 0),
            "tx_client_paid_total": round(float(tx.get("client_paid") or 0), 2),
            "tx_business_amount_total": round(float(tx.get("business_amount") or 0), 2),
            "tx_bookvia_fee_total": round(float(tx.get("bookvia_fee") or 0), 2),
        },
    }


# ------------------------------------------------------------------ template

HTML_TEMPLATE = """
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<style>
@page { size: Letter; margin: 28mm 18mm 28mm 18mm;
  @bottom-center { content: "Página " counter(page) " de " counter(pages); font-size: 9px; color: #64748b; }
  @top-right { content: "Bookvia · Expediente legal de negocio"; font-size: 9px; color: #64748b; }
}
body { font-family: Helvetica, Arial, sans-serif; color: #0f172a; font-size: 11px; line-height: 1.45; }
h1 { color: #F05D5E; font-size: 22px; margin: 0 0 4px 0; letter-spacing: -0.5px; }
h2 { color: #F05D5E; font-size: 13px; margin: 18px 0 6px 0; border-bottom: 2px solid #F05D5E; padding-bottom: 3px; letter-spacing: 0.3px; }
h3 { font-size: 11px; margin: 10px 0 4px 0; color: #334155; }
.subtitle { color: #64748b; font-size: 10.5px; margin-bottom: 14px; }
table { width: 100%; border-collapse: collapse; margin: 4px 0 8px 0; }
td { padding: 5px 8px; vertical-align: top; border-bottom: 1px solid #e2e8f0; font-size: 10.5px; }
td.k { color: #64748b; width: 40%; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
td.v { color: #0f172a; font-weight: 500; }
.chip { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 9.5px; font-weight: 600; background: #e2e8f0; color: #0f172a; }
.chip.ok { background: #dcfce7; color: #166534; }
.chip.warn { background: #fef3c7; color: #854d0e; }
.chip.bad { background: #fee2e2; color: #991b1b; }
.chip.red { background: #fee2e2; color: #991b1b; }
.code { font-family: Menlo, Consolas, monospace; font-size: 9px; color: #334155; word-break: break-all; }
.hash-box { background: #f8fafc; border: 1px dashed #94a3b8; padding: 6px 8px; border-radius: 4px; margin: 4px 0 6px 0; }
.signature-box { margin-top: 18px; padding: 10px 12px; background: #f8fafc; border: 1.5px solid #cbd5e1; border-radius: 6px; }
.sig-grid { display: flex; gap: 14px; align-items: flex-start; }
.sig-grid .qr { width: 110px; }
.sig-grid .qr img { width: 100%; }
.sig-grid .meta { flex: 1; font-size: 10px; }
.sig-grid .meta p { margin: 2px 0; }
.note { font-size: 9.5px; color: #64748b; font-style: italic; margin-top: 6px; }
.header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #F05D5E; padding-bottom: 8px; margin-bottom: 12px; }
.header .brand { font-size: 24px; font-weight: 800; letter-spacing: -0.8px; color: #F05D5E; }
.header .brand sup { color: #F05D5E; }
.header .meta-right { text-align: right; font-size: 9px; color: #64748b; }
.history-item { padding: 4px 6px; margin: 2px 0; border-left: 3px solid #cbd5e1; background: #f8fafc; font-size: 9.5px; }
.history-item.commission { border-left-color: #F05D5E; }
.history-item.terms { border-left-color: #2563eb; }
.history-item .h-v { font-weight: 700; }
.warn-box { background: #fffbeb; border: 1px solid #fde68a; border-radius: 4px; padding: 6px 8px; margin: 6px 0; font-size: 10px; color: #78350f; }
</style>
</head>
<body>

<div class="header">
  <div>
    <div class="brand">bookvia<sup>+</sup></div>
    <div class="subtitle">Expediente legal del negocio</div>
  </div>
  <div class="meta-right">
    <p><strong>Fecha de emisión:</strong> {{issued_at}}</p>
    <p><strong>Versión del formato:</strong> {{file_version}}</p>
    <p><strong>Folio interno:</strong> <span class="code">{{file_id}}</span></p>
  </div>
</div>

<h1>{{biz.name}}</h1>
<p class="subtitle">Código público Bookvia: <strong>{{biz.public_code}}</strong> · Slug: {{biz.slug}}</p>

<h2>1. Identidad y datos fiscales</h2>
<table>
  <tr><td class="k">Razón social</td><td class="v">{{biz.legal_name}}</td></tr>
  <tr><td class="k">RFC</td><td class="v">{{biz.rfc}}</td></tr>
  <tr><td class="k">Régimen fiscal</td><td class="v">{{tax_regime_label}}</td></tr>
  <tr><td class="k">Constancia de Situación Fiscal</td><td class="v">{{tax_regime_cert}}</td></tr>
  <tr><td class="k">Dirección</td><td class="v">{{biz.address}}, {{biz.city}}, {{biz.state}}, {{biz.country_code}} {{biz.zip_code}}</td></tr>
  <tr><td class="k">CLABE bancaria</td><td class="v code">{{clabe_masked}}</td></tr>
  <tr><td class="k">Último cambio de CLABE</td><td class="v">{{clabe_changed_at}}</td></tr>
  <tr><td class="k">Teléfono registrado</td><td class="v">{{biz.phone}}</td></tr>
  <tr><td class="k">Email registrado</td><td class="v">{{biz.email}}</td></tr>
</table>

<h2>2. Representante legal / dueño</h2>
<table>
  <tr><td class="k">Nombre</td><td class="v">{{user.full_name}}</td></tr>
  <tr><td class="k">Email de la cuenta</td><td class="v">{{user.email}}</td></tr>
  <tr><td class="k">Fecha de alta de cuenta</td><td class="v">{{user.created_at}}</td></tr>
  <tr><td class="k">Fecha de nacimiento (dueño)</td><td class="v">{{biz.owner_birth_date}}</td></tr>
</table>

<h2>3. Documentos KYC</h2>
<table>
  <tr><td class="k">Identificación oficial (INE/Pasaporte)</td><td class="v">{{has_ine}}</td></tr>
  <tr><td class="k">Comprobante de domicilio</td><td class="v">{{has_proof_address}}</td></tr>
  <tr><td class="k">Comprobante bancario</td><td class="v">{{has_bank_proof}}</td></tr>
  <tr><td class="k">Verificación por Bookvia</td><td class="v">{{kyc_status}}</td></tr>
  <tr><td class="k">Verificado el</td><td class="v">{{biz.documents_verified_at}}</td></tr>
  {{kyc_rejection_row}}
</table>
<p class="note">
  Los archivos originales (INE, comprobante de domicilio y bancario) están almacenados de forma
  cifrada en Bookvia. Si necesitas una copia, escríbenos a <strong>soporte@bookvia.app</strong>.
</p>

<h2>4. Aceptación de Términos y Condiciones y Aviso de Privacidad</h2>
<table>
  <tr><td class="k">Versión vigente aceptada</td><td class="v">{{terms.version}}</td></tr>
  <tr><td class="k">Aceptado el</td><td class="v">{{terms.accepted_at}}</td></tr>
</table>
{{terms_history_html}}

<h2>5. Esquema de comisiones aceptado</h2>
{{commission_section_html}}

<h2>6. Estado operativo</h2>
<table>
  <tr><td class="k">Fecha de alta del negocio</td><td class="v">{{biz.created_at}}</td></tr>
  <tr><td class="k">Estatus</td><td class="v"><span class="chip {{status_class}}">{{biz.status}}</span></td></tr>
  <tr><td class="k">Suscripción Bookvia</td><td class="v">{{subscription_status}}</td></tr>
  <tr><td class="k">¿Cobra anticipos?</td><td class="v">{{requires_deposit_label}}</td></tr>
  <tr><td class="k">Calendario de liquidación</td><td class="v">{{payout_label}}</td></tr>
</table>

<h2>7. Resumen financiero operativo</h2>
<table>
  <tr><td class="k">Reservas totales en la plataforma</td><td class="v">{{stats.total_bookings}}</td></tr>
  <tr><td class="k">Reservas completadas / confirmadas</td><td class="v">{{stats.total_completed_bookings}}</td></tr>
  <tr><td class="k">Transacciones pagadas procesadas</td><td class="v">{{stats.tx_count}}</td></tr>
  <tr><td class="k">Total cobrado a clientes</td><td class="v">{{stats.tx_client_paid_total_fmt}}</td></tr>
  <tr><td class="k">Total recibido neto por el negocio</td><td class="v">{{stats.tx_business_amount_total_fmt}}</td></tr>
  <tr><td class="k">Total de fees Bookvia pagados</td><td class="v">{{stats.tx_bookvia_fee_total_fmt}}</td></tr>
</table>
<p class="note">
  Los importes en esta sección se actualizan al momento de emitir el expediente y reflejan
  únicamente transacciones con estatus "paid" en nuestro sistema. Para conciliación fiscal
  formal, consulta los CFDIs y/o estados de cuenta mensuales del corte día 20.
</p>

<div class="signature-box">
  <div class="sig-grid">
    <div class="qr"><img src="{{qr_data_uri}}" alt="QR"/></div>
    <div class="meta">
      <p><strong>Verificación de autenticidad</strong></p>
      <p>Escanea el código QR o visita <span class="code">{{verify_url}}</span> para confirmar
      que este expediente fue emitido por Bookvia.</p>
      <p><strong>Hash SHA-256 del documento (sin firma):</strong></p>
      <div class="hash-box code">{{content_hash}}</div>
      <p>Emitido para {{biz.legal_name}} · RFC {{biz.rfc}} · {{issued_at}}</p>
    </div>
  </div>
</div>

<p class="note">
  Documento de uso informativo emitido automáticamente. No sustituye a los CFDIs ni a
  obligaciones fiscales independientes del negocio. Bookvia no declara impuestos a nombre
  del negocio. Si necesitas aclaración sobre cualquier dato, escribe a
  <strong>soporte@bookvia.app</strong> o presenta un reporte desde tu panel.
</p>

</body>
</html>
"""


TAX_REGIME_LABELS = {
    "PF_RESICO": "Persona Física — RESICO",
    "PF_ACT_EMPRESARIAL": "Persona Física — Actividad Empresarial y Profesional",
    "PF_HONORARIOS": "Persona Física — Honorarios / Servicios Profesionales",
    "PF_PLATAFORMAS": "Persona Física — Plataformas Digitales (LISR 113-A)",
    "PM_GENERAL": "Persona Moral — Régimen General",
    "PM_NO_LUCRATIVA": "Persona Moral — No Lucrativa",
    "RIF": "RIF (transitorio)",
    "OTRO": "Otro / No especificado",
}


def _render_commission_section(biz: Dict[str, Any]) -> str:
    history = biz.get("commission_terms_history") or []
    current_version = biz.get("commission_terms_version")
    current_hash = biz.get("commission_terms_hash")
    accepted_at = biz.get("commission_terms_accepted_at")
    requires_deposit = biz.get("requires_deposit")

    if not requires_deposit:
        return (
            '<p class="note">Este negocio está configurado para <strong>no cobrar anticipos</strong>, '
            'por lo que no le aplica el esquema de comisiones de Bookvia sobre anticipos. '
            'Bookvia sigue cobrando únicamente su suscripción mensual.</p>'
        )

    if not accepted_at:
        return (
            '<div class="warn-box">Este negocio cobra anticipos pero <strong>aún no ha aceptado '
            'formalmente el esquema de comisiones vigente</strong>. Debe hacerlo desde su panel en '
            'Ajustes → Cobros.</div>'
        )

    rows = f"""
    <table>
      <tr><td class="k">Versión actualmente aceptada</td><td class="v">{current_version or '—'}</td></tr>
      <tr><td class="k">Aceptado el</td><td class="v">{_fmt_date(accepted_at)}</td></tr>
    </table>
    <h3>Hash legal del documento vigente</h3>
    <div class="hash-box code">{current_hash or '—'}</div>
    """

    if history:
        rows += '<h3>Historial de aceptaciones ({})</h3>'.format(len(history))
        for i, entry in enumerate(reversed(history[-10:])):  # last 10, newest first
            rows += (
                f'<div class="history-item commission">'
                f'<span class="h-v">{entry.get("version", "?")}</span> '
                f'· {_fmt_date(entry.get("accepted_at"))} '
                f'· IP {entry.get("ip") or "—"}'
                f'<br/><span class="code">Hash: {entry.get("hash", "")[:32]}…</span>'
                f'</div>'
            )
    return rows


def _render_terms_history(user: Dict[str, Any]) -> str:
    history = user.get("terms_acceptance_history") or []
    if not history:
        return ""
    html = '<h3>Historial de aceptaciones de T&amp;C ({})</h3>'.format(len(history))
    for entry in reversed(history[-10:]):
        html += (
            f'<div class="history-item terms">'
            f'<span class="h-v">{entry.get("version", "?")}</span> '
            f'· {_fmt_date(entry.get("accepted_at"))} '
            f'· IP {entry.get("ip") or "—"}'
            f'</div>'
        )
    return html


def _render_template(
    data: Dict[str, Any], file_id: str, verify_url: str, content_hash: str,
    qr_data_uri: str,
) -> str:
    biz = data["business"]
    user = data["user"]
    stats = data["stats"]

    kyc_verified = bool(biz.get("documents_verified"))
    kyc_status = '<span class="chip ok">Verificado</span>' if kyc_verified else '<span class="chip warn">Pendiente de verificación</span>'
    rejection = biz.get("documents_rejection_reason")
    kyc_rejection_row = (
        f'<tr><td class="k">Motivo de rechazo previo</td><td class="v">{rejection}</td></tr>'
        if rejection else ""
    )

    status_class = {"active": "ok", "pending": "warn", "suspended": "bad",
                    "rejected": "bad", "paused": "warn"}.get(biz.get("status", ""), "")

    sub_status = biz.get("subscription_status") or "none"
    sub_label = {
        "active": "Activa", "trialing": "Periodo de prueba",
        "past_due": "Pago atrasado", "canceled": "Cancelada",
        "none": "Sin suscripción",
    }.get(sub_status, sub_status)

    requires_deposit_label = "Sí" if biz.get("requires_deposit") else "No"
    payout_label = (
        "Corte día 20 · Depósito día 1° del mes siguiente"
        if biz.get("requires_deposit") else "N/A (negocio sin anticipos)"
    )

    has_ine = "Cargada" if biz.get("ine_url") else "No cargada"
    has_poa = "Cargado" if biz.get("proof_of_address_url") else "No cargado"
    has_bank = "Cargado" if biz.get("bank_proof_url") else "No cargado"

    def fmt_mxn(n): return f"${float(n or 0):,.2f} MXN"

    replacements = {
        "{{issued_at}}": datetime.now(timezone.utc).astimezone().strftime("%d/%m/%Y %H:%M"),
        "{{file_version}}": LEGAL_FILE_VERSION,
        "{{file_id}}": file_id,
        "{{verify_url}}": verify_url,
        "{{qr_data_uri}}": qr_data_uri,
        "{{content_hash}}": content_hash,
        "{{biz.name}}": biz.get("name", "—"),
        "{{biz.public_code}}": biz.get("public_code") or "—",
        "{{biz.slug}}": biz.get("slug", "—"),
        "{{biz.legal_name}}": biz.get("legal_name") or biz.get("name") or "—",
        "{{biz.rfc}}": biz.get("rfc") or "—",
        "{{tax_regime_label}}": TAX_REGIME_LABELS.get(biz.get("tax_regime"), "No especificado"),
        "{{tax_regime_cert}}": "Cargada" if biz.get("tax_regime_certificate_url") else "No cargada",
        "{{biz.address}}": biz.get("address", "—"),
        "{{biz.city}}": biz.get("city", "—"),
        "{{biz.state}}": biz.get("state", "—"),
        "{{biz.country_code}}": biz.get("country_code", "MX"),
        "{{biz.zip_code}}": biz.get("zip_code") or "",
        "{{clabe_masked}}": _mask_clabe(biz.get("clabe")),
        "{{clabe_changed_at}}": _fmt_date(biz.get("clabe_changed_at")) if biz.get("clabe_changed_at") else "—",
        "{{biz.phone}}": biz.get("phone", "—"),
        "{{biz.email}}": biz.get("email", "—"),
        "{{biz.owner_birth_date}}": biz.get("owner_birth_date") or "—",
        "{{biz.created_at}}": _fmt_date(biz.get("created_at")),
        "{{biz.status}}": biz.get("status", "—"),
        "{{biz.documents_verified_at}}": _fmt_date(biz.get("documents_verified_at")),
        "{{status_class}}": status_class,
        "{{subscription_status}}": sub_label,
        "{{requires_deposit_label}}": requires_deposit_label,
        "{{payout_label}}": payout_label,
        "{{has_ine}}": has_ine,
        "{{has_proof_address}}": has_poa,
        "{{has_bank_proof}}": has_bank,
        "{{kyc_status}}": kyc_status,
        "{{kyc_rejection_row}}": kyc_rejection_row,
        "{{user.full_name}}": user.get("full_name") or biz.get("legal_name") or "—",
        "{{user.email}}": user.get("email", "—"),
        "{{user.created_at}}": _fmt_date(user.get("created_at")),
        "{{terms.version}}": user.get("accepted_terms_version") or "—",
        "{{terms.accepted_at}}": _fmt_date(user.get("accepted_terms_at")),
        "{{terms_history_html}}": _render_terms_history(user),
        "{{commission_section_html}}": _render_commission_section(biz),
        "{{stats.total_bookings}}": str(stats["total_bookings"]),
        "{{stats.total_completed_bookings}}": str(stats["total_completed_bookings"]),
        "{{stats.tx_count}}": str(stats["tx_count"]),
        "{{stats.tx_client_paid_total_fmt}}": fmt_mxn(stats["tx_client_paid_total"]),
        "{{stats.tx_business_amount_total_fmt}}": fmt_mxn(stats["tx_business_amount_total"]),
        "{{stats.tx_bookvia_fee_total_fmt}}": fmt_mxn(stats["tx_bookvia_fee_total"]),
    }

    html = HTML_TEMPLATE
    for k, v in replacements.items():
        html = html.replace(k, str(v) if v is not None else "—")
    return html


# ------------------------------------------------------------------ public

async def generate_business_legal_file(
    business_id: str, verify_base_url: str,
) -> Optional[Dict[str, Any]]:
    """Build the PDF + persist a log row. Returns {pdf_bytes, file_id, hash}."""
    data = await _aggregate_business_legal_data(business_id)
    if not data:
        return None

    file_id = hashlib.sha1(
        f"{business_id}-{datetime.now(timezone.utc).isoformat()}".encode()
    ).hexdigest()[:16].upper()

    verify_url = f"{verify_base_url.rstrip('/')}/verificar-expediente/{file_id}"

    # First render with placeholder hash to compute content hash, then re-render
    # with real hash inserted. Hash covers the rendered HTML (pre-PDF stable).
    tmp_html = _render_template(
        data, file_id=file_id, verify_url=verify_url,
        content_hash="PENDING_HASH_PLACEHOLDER", qr_data_uri="",
    )
    content_hash = hashlib.sha256(tmp_html.encode("utf-8")).hexdigest()
    qr_data_uri = f"data:image/png;base64,{_b64_qr(verify_url)}"

    final_html = _render_template(
        data, file_id=file_id, verify_url=verify_url,
        content_hash=content_hash, qr_data_uri=qr_data_uri,
    )

    # Lazy import — see top of file for rationale.
    from weasyprint import HTML
    buf = io.BytesIO()
    HTML(string=final_html).write_pdf(buf)
    pdf_bytes = buf.getvalue()

    # Persist an evidence row so the public /verificar endpoint can attest issuance
    await db.business_legal_files.insert_one({
        "id": file_id,
        "business_id": business_id,
        "rfc": data["business"].get("rfc"),
        "legal_name": data["business"].get("legal_name") or data["business"].get("name"),
        "public_code": data["business"].get("public_code"),
        "content_hash": content_hash,
        "pdf_size_bytes": len(pdf_bytes),
        "issued_at": datetime.now(timezone.utc).isoformat(),
        "file_version": LEGAL_FILE_VERSION,
    })

    return {
        "pdf_bytes": pdf_bytes,
        "file_id": file_id,
        "content_hash": content_hash,
        "verify_url": verify_url,
        "rfc": data["business"].get("rfc"),
        "legal_name": data["business"].get("legal_name") or data["business"].get("name"),
    }
