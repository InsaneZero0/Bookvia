"""
Phase I — Business QR code generation.

Generates a branded QR code (coral + Bookvia logo center) pointing to the
business public profile. Tracks scans via a `?ref=qr` query param for
admin analytics.
"""
from io import BytesIO
import os
import qrcode
from qrcode.image.styledpil import StyledPilImage
from qrcode.image.styles.moduledrawers import RoundedModuleDrawer
from qrcode.image.styles.colormasks import SolidFillColorMask
from PIL import Image, ImageDraw, ImageFont

BOOKVIA_CORAL = (240, 93, 94)  # #F05D5E
BOOKVIA_WHITE = (255, 255, 255)
QR_BOX_SIZE = 14
QR_BORDER = 2


def _frontend_url() -> str:
    return (os.environ.get("FRONTEND_URL") or "https://bookvia.app").rstrip("/")


def _build_target_url(slug: str) -> str:
    """The URL the QR encodes, with ref tracking."""
    return f"{_frontend_url()}/{slug}?ref=qr"


def _draw_logo_center(qr_img: Image.Image) -> Image.Image:
    """Overlay a Bookvia mark in the center of the QR. We use a coral
    rounded square with a white "B" since the IMPI-registered SVG isn't
    bundled — visually consistent with the brand."""
    qr_img = qr_img.convert("RGBA")
    w, h = qr_img.size
    logo_size = w // 5  # 20% of QR width — safe for error correction H
    logo = Image.new("RGBA", (logo_size, logo_size), (255, 255, 255, 0))
    draw = ImageDraw.Draw(logo)
    # White rounded square background
    pad = logo_size // 14
    draw.rounded_rectangle(
        [(pad, pad), (logo_size - pad, logo_size - pad)],
        radius=logo_size // 6,
        fill=BOOKVIA_WHITE,
    )
    # Coral inner rounded square
    inner_pad = logo_size // 5
    draw.rounded_rectangle(
        [(inner_pad, inner_pad), (logo_size - inner_pad, logo_size - inner_pad)],
        radius=logo_size // 8,
        fill=BOOKVIA_CORAL,
    )
    # White "B"
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", size=logo_size // 3)
    except Exception:
        font = ImageFont.load_default()
    text = "B"
    try:
        bbox = draw.textbbox((0, 0), text, font=font)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        draw.text(((logo_size - tw) // 2 - bbox[0], (logo_size - th) // 2 - bbox[1] - 2),
                  text, font=font, fill=BOOKVIA_WHITE)
    except Exception:
        pass
    # Paste logo over QR center
    cx, cy = (w - logo_size) // 2, (h - logo_size) // 2
    qr_img.paste(logo, (cx, cy), logo)
    return qr_img


def generate_business_qr_png(slug: str) -> bytes:
    """Return PNG bytes of a branded QR for the given business slug."""
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_H,  # Allows up to 30% damage
        box_size=QR_BOX_SIZE,
        border=QR_BORDER,
    )
    qr.add_data(_build_target_url(slug))
    qr.make(fit=True)
    img = qr.make_image(
        image_factory=StyledPilImage,
        module_drawer=RoundedModuleDrawer(),
        color_mask=SolidFillColorMask(
            front_color=BOOKVIA_CORAL,
            back_color=BOOKVIA_WHITE,
        ),
    )
    pil_img = img.get_image() if hasattr(img, "get_image") else img
    pil_img = _draw_logo_center(pil_img)

    buf = BytesIO()
    pil_img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def generate_business_qr_with_caption(business: dict) -> bytes:
    """Return PNG with QR + business name + public code below — printable card."""
    slug = business.get("slug", "")
    name = business.get("name", "Negocio")
    public_code = business.get("public_code", "")
    qr_png = generate_business_qr_png(slug)
    qr_img = Image.open(BytesIO(qr_png)).convert("RGBA")

    # Build a card: QR on top, text below, white background
    qr_w, qr_h = qr_img.size
    card_w = qr_w
    text_block_h = 220
    card_h = qr_h + text_block_h
    card = Image.new("RGBA", (card_w, card_h), (255, 255, 255, 255))
    card.paste(qr_img, (0, 0), qr_img)

    draw = ImageDraw.Draw(card)
    try:
        font_lg = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", size=64)
        font_md = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", size=42)
        font_sm = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", size=32)
    except Exception:
        font_lg = font_md = font_sm = ImageFont.load_default()

    # Crop name if too long
    display_name = (name[:28] + "…") if len(name) > 30 else name
    y = qr_h + 18
    for line, font, color in [
        ("Reserva en Bookvia", font_md, BOOKVIA_CORAL),
        (display_name, font_lg, (15, 23, 42)),
        (public_code, font_sm, (100, 116, 139)),
    ]:
        bbox = draw.textbbox((0, 0), line, font=font)
        tw = bbox[2] - bbox[0]
        draw.text(((card_w - tw) // 2 - bbox[0], y - bbox[1]), line, font=font, fill=color)
        y += (bbox[3] - bbox[1]) + 14

    buf = BytesIO()
    card.save(buf, format="PNG", optimize=True)
    return buf.getvalue()
