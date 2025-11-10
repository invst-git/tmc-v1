import os
from typing import Any, Dict, List, Optional

from vendor_db import get_vendor_by_id_detailed
from invoice_db import get_invoice_by_id
from po_db import get_po_by_id

LLM_PROVIDER = os.getenv("LLM_PROVIDER", "claude").lower()

_claude_client = None

def _get_claude_client():
    global _claude_client
    if _claude_client is not None:
        return _claude_client
    try:
        from anthropic import Anthropic
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            return None
        _claude_client = Anthropic(api_key=api_key)
        return _claude_client
    except Exception:
        return None

def _build_system_prompt(vendor: Dict[str, Any]) -> str:
    name = vendor.get("name") or "the vendor"
    vid = vendor.get("id") or ""
    return (
        f"You are an assistant for vendor '{name}' (id={vid}).\n"
        "Only answer using data from this vendor. If the user asks about other vendors or external data, politely refuse and ask them to stay within this vendor.\n"
        "If specific invoices or POs are tagged, limit your answer strictly to those.\n\n"
        "Output style guidelines:\n"
        "- Prefer concise, structured answers.\n"
        "- When listing invoice items or PO lines, render a Markdown table with columns: #, Description, Qty, Unit, Unit Price, Line Total.\n"
        "- Bold any particularly relevant or matched lines when the question focuses on them.\n"
        "- Use short headings and bullets when appropriate.\n"
    )

def _summarize_invoice(inv: Dict[str, Any]) -> Dict[str, Any]:
    raw_lines = inv.get("lines") or []
    # Limit and normalize fields to keep context concise
    lines = []
    for ln in raw_lines[:200]:
        lines.append({
            "line_number": ln.get("line_number"),
            "sku": ln.get("sku"),
            "description": (ln.get("description") or "")[:200],
            "quantity": ln.get("quantity"),
            "unit_of_measure": ln.get("unit_of_measure"),
            "unit_price": ln.get("unit_price"),
            "line_total": ln.get("line_total"),
            "tax_rate": ln.get("tax_rate"),
            "tax_code": ln.get("tax_code"),
            "po_number": ln.get("po_number"),
            "po_line_number": ln.get("po_line_number"),
        })
    return {
        "id": inv.get("id"),
        "invoiceNumber": inv.get("invoiceNumber"),
        "date": inv.get("date"),
        "amount": inv.get("amount"),
        "currency": inv.get("currency"),
        "status": inv.get("status"),
        "poNumber": inv.get("poNumber"),
        "lines": lines,
        "invoice_lines": lines,
    }

def _summarize_po(po: Dict[str, Any]) -> Dict[str, Any]:
    raw_lines = po.get("lines") or []
    lines = []
    for ln in raw_lines[:200]:
        lines.append({
            "line_number": ln.get("line_number"),
            "sku": ln.get("sku"),
            "description": (ln.get("description") or "")[:200],
            "quantity": ln.get("quantity"),
            "unit_of_measure": ln.get("unit_of_measure"),
            "unit_price": ln.get("unit_price"),
            "line_total": ln.get("line_total"),
            "tax_rate": ln.get("tax_rate"),
            "tax_code": ln.get("tax_code"),
        })
    return {
        "id": po.get("id"),
        "poNumber": po.get("poNumber"),
        "totalAmount": po.get("totalAmount"),
        "currency": po.get("currency"),
        "status": po.get("status"),
        "lines": lines,
        "po_lines": lines,
    }

def generate_vendor_response(
    vendor_id: str,
    prompt: str,
    invoice_ids: Optional[List[str]] = None,
    po_ids: Optional[List[str]] = None,
) -> str:
    """Generate a response scoped to vendor and optionally to tagged entities.
    Falls back to a deterministic summary when LLM isn't configured.
    """
    vendor = get_vendor_by_id_detailed(vendor_id)
    if not vendor:
        return "Vendor not found."

    context: Dict[str, Any] = {
        "vendor": {
            "id": vendor.get("id"),
            "name": vendor.get("name"),
            "openPos": vendor.get("openPos"),
            "invoices30d": vendor.get("invoices30d"),
            "totalAmount30d": vendor.get("totalAmount30d"),
            "status": vendor.get("status"),
        },
        "invoices": [],
        "pos": [],
    }

    if invoice_ids:
        for iid in invoice_ids:
            try:
                inv = get_invoice_by_id(iid)
                if inv:
                    context["invoices"].append(_summarize_invoice(inv))
            except Exception:
                pass
    if po_ids:
        for pid in po_ids:
            try:
                po = get_po_by_id(pid)
                if po:
                    context["pos"].append(_summarize_po(po))
            except Exception:
                pass

    system_prompt = _build_system_prompt(vendor)

    # If no LLM configured, provide a succinct deterministic answer
    if LLM_PROVIDER == "claude":
        client = _get_claude_client()
        if client is None:
            # Fallback deterministic answer
            parts = [
                f"Vendor: {vendor.get('name')} (id={vendor.get('id')})",
                f"Prompt: {prompt}",
            ]
            if context["invoices"]:
                parts.append(f"Invoices: {context['invoices']}")
            if context["pos"]:
                parts.append(f"POs: {context['pos']}")
            return "\n".join(parts)
        try:
            model = os.getenv("CLAUDE_MODEL", "claude-3-7-sonnet-20250219")
            user_text = (
                "Context JSON (use strictly, do not fabricate outside it):\n"
                + str(context)
                + "\n\nUser Question:\n"
                + prompt
            )
            resp = client.messages.create(
                model=model,
                max_tokens=1024,
                system=system_prompt,
                messages=[{"role": "user", "content": [{"type": "text", "text": user_text}]}],
            )
            # Extract text from response content blocks
            text_parts = []
            try:
                for block in getattr(resp, "content", []) or []:
                    if getattr(block, "type", "") == "text":
                        text_parts.append(getattr(block, "text", ""))
            except Exception:
                pass
            text = "".join(text_parts).strip()
            return text or "(no response)"
        except Exception as e:
            return f"LLM error: {e}"
    else:
        # Gemini branch retained as optional provider
        client = _get_gemini_client()
        if client is None:
            parts = [
                f"Vendor: {vendor.get('name')} (id={vendor.get('id')})",
                f"Prompt: {prompt}",
            ]
            if context["invoices"]:
                parts.append(f"Invoices: {context['invoices']}")
            if context["pos"]:
                parts.append(f"POs: {context['pos']}")
            return "\n".join(parts)

        messages = [
            {"role": "user", "parts": [system_prompt]},
            {"role": "user", "parts": [
                "Context JSON (use strictly):\n",
                str(context),
            ]},
            {"role": "user", "parts": [prompt]},
        ]
        try:
            resp = client.generate_content(messages)
            text = getattr(resp, "text", None)
            if not text:
                try:
                    text = resp.candidates[0].content.parts[0].text
                except Exception:
                    text = ""
            return text or "(no response)"
        except Exception as e:
            return f"LLM error: {e}"

def generate_chat_title(vendor: Dict[str, Any], prompt: str, invoices: List[Dict[str, Any]], pos: List[Dict[str, Any]]) -> str:
    """Generate a short chat title (<= 8 words). Prefer vendor-aware topic; avoid PII.
    Fallback to first few words of the prompt.
    """
    base = (prompt or "").strip()
    if not base:
        base = (vendor.get("name") or "Chat").strip()
    # Fallback simple slice
    fallback = (base[:60] + "…") if len(base) > 60 else base
    client = _get_claude_client() if LLM_PROVIDER == "claude" else None
    if client is None:
        return fallback
    try:
        model = os.getenv("CLAUDE_MODEL", "claude-3-7-sonnet-20250219")
        sys = (
            "Generate a very short, clear chat title (<= 8 words). "
            "No quotes. No trailing punctuation."
        )
        context_bits = []
        if invoices:
            inv_labels = [i.get("invoiceNumber") or i.get("id") for i in invoices[:3]]
            context_bits.append(f"Invoices: {', '.join([str(x) for x in inv_labels if x])}")
        if pos:
            po_labels = [p.get("poNumber") or p.get("id") for p in pos[:3]]
            context_bits.append(f"POs: {', '.join([str(x) for x in po_labels if x])}")
        utext = f"Vendor: {(vendor.get('name') or '')}\nPrompt: {prompt}\n" + ("\n".join(context_bits) if context_bits else "")
        msg = client.messages.create(
            model=model,
            max_tokens=32,
            system=sys,
            messages=[{"role": "user", "content": [{"type": "text", "text": utext}]}],
        )
        parts = []
        for block in getattr(msg, "content", []) or []:
            if getattr(block, "type", "") == "text":
                parts.append(getattr(block, "text", ""))
        title = (" ".join("".join(parts).split())).strip()
        return title or fallback
    except Exception:
        return fallback
