"""Import PDF form fields (AcroForm) into a SignDesk template field_layout."""

from __future__ import annotations

from pathlib import Path

from pypdf import PdfReader
from pypdf.generic import IndirectObject, NumberObject


def _as_float(value, default=0.0) -> float:
    try:
        if isinstance(value, IndirectObject):
            value = value.get_object()
        return float(value)
    except Exception:
        return default


def _normalize_rect(rect, page_width: float, page_height: float) -> dict[str, float]:
    # PDF rect: [llx, lly, urx, ury] in points, origin bottom-left
    llx, lly, urx, ury = [_as_float(v) for v in rect[:4]]
    width = max(page_width, 1.0)
    height = max(page_height, 1.0)
    x = max(0.0, min(llx / width, 1.0))
    y = max(0.0, min(lly / height, 1.0))
    w = max(0.01, min((urx - llx) / width, 1.0 - x))
    h = max(0.01, min((ury - lly) / height, 1.0 - y))
    return {"x": x, "y": y, "w": w, "h": h}


def _field_type_from_annot(annot) -> str | None:
    ft = annot.get("/FT")
    if isinstance(ft, IndirectObject):
        ft = ft.get_object()
    ft_name = str(ft) if ft is not None else ""
    if ft_name in ("/Sig",):
        return "signature"
    if ft_name in ("/Btn",):
        ff = annot.get("/Ff")
        flags = int(ff) if isinstance(ff, (int, NumberObject)) else 0
        # Pushbutton bit 16 — skip
        if flags & (1 << 16):
            return None
        return "checkbox"
    if ft_name in ("/Tx",):
        name = str(annot.get("/T") or "").lower()
        if "date" in name:
            return "date"
        if "initial" in name:
            return "initials"
        if "sign" in name:
            return "signature"
        return "text"
    return None


def extract_acroform_layout(pdf_path: str | Path, *, recipient_index: int = 0) -> list[dict]:
    """Extract AcroForm widget annotations into normalized field_layout items.

    Fields without geometry or unsupported types are skipped. When the PDF has
    no form fields, returns an empty list (caller places fields manually).
    """
    reader = PdfReader(str(pdf_path))
    layout: list[dict] = []

    for page_idx, page in enumerate(reader.pages):
        page_number = page_idx + 1
        mediabox = page.mediabox
        page_width = float(mediabox.width)
        page_height = float(mediabox.height)
        annots = page.get("/Annots")
        if not annots:
            continue
        if isinstance(annots, IndirectObject):
            annots = annots.get_object()
        for annot_ref in annots:
            annot = annot_ref.get_object() if isinstance(annot_ref, IndirectObject) else annot_ref
            if str(annot.get("/Subtype")) != "/Widget":
                continue
            field_type = _field_type_from_annot(annot)
            if not field_type:
                continue
            rect = annot.get("/Rect")
            if not rect:
                continue
            coords = _normalize_rect(rect, page_width, page_height)
            label = str(annot.get("/T") or annot.get("/TU") or "")[:255]
            layout.append(
                {
                    "field_type": field_type,
                    "page": page_number,
                    "x": coords["x"],
                    "y": coords["y"],
                    "w": coords["w"],
                    "h": coords["h"],
                    "required": True,
                    "label": label,
                    "recipient_index": recipient_index,
                    "role_key": "",
                    "merge_token": "",
                    "fill_mode": "signer",
                    "prefill_editable": True,
                }
            )
    return layout


def layout_from_import_payload(items: list[dict], page_count: int | None = None) -> list[dict]:
    """Normalize a DocuSign-style / manual JSON field map into field_layout."""
    cleaned = []
    for idx, item in enumerate(items or []):
        if not isinstance(item, dict):
            continue
        field_type = item.get("field_type") or item.get("type") or "text"
        if field_type == "signHere":
            field_type = "signature"
        if field_type == "initialHere":
            field_type = "initials"
        if field_type not in {"signature", "initials", "date", "text", "checkbox"}:
            field_type = "text"
        page = int(item.get("page") or item.get("pageNumber") or 1)
        if page_count is not None and page > page_count:
            continue
        # DocuSign often uses top-left pixels; if coordinate_system=top_left, convert
        x = float(item.get("x") or 0)
        y = float(item.get("y") or 0)
        w = float(item.get("w") or item.get("width") or 0.2)
        h = float(item.get("h") or item.get("height") or 0.04)
        if item.get("coordinate_system") == "top_left" or item.get("origin") == "top_left":
            # Assume already normalized 0-1 if values <= 1; otherwise treat as relative top-left
            if y <= 1 and h <= 1:
                y = max(0.0, 1.0 - y - h)
        cleaned.append(
            {
                "field_type": field_type,
                "page": max(1, page),
                "x": min(max(x, 0.0), 1.0),
                "y": min(max(y, 0.0), 1.0),
                "w": min(max(w, 0.01), 1.0),
                "h": min(max(h, 0.01), 1.0),
                "required": bool(item.get("required", True)),
                "label": str(item.get("label") or item.get("name") or "")[:255],
                "recipient_index": int(item.get("recipient_index") or item.get("recipientId") or 0),
                "role_key": str(item.get("role_key") or item.get("role") or "")[:64],
                "merge_token": str(item.get("merge_token") or item.get("tabLabel") or "")[:128],
                "fill_mode": str(item.get("fill_mode") or "signer")[:20],
                "prefill_editable": bool(item.get("prefill_editable", True)),
            }
        )
    return cleaned
