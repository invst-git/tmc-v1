import os
import re
from datetime import datetime
from dotenv import load_dotenv
load_dotenv()
ROOT_DIR = os.getenv("LOCAL_INVOICE_DIR", "invoices")
def _clean_for_fs(value: str) -> str:
    """Make a safe folder/file name (Windows-safe)."""
    value = value or "unknown"
    return re.sub(r"[^a-zA-Z0-9._-]", "_", value)
def _ensure_dir(path: str):
    os.makedirs(path, exist_ok=True)
def upload_invoice(from_address: str, message_id: str, filename: str, content_bytes: bytes):
    """
    Save the invoice to local disk.

    Directory structure:
    invoices/YYYY/MM/DD/<from_email>/<message_id>/<filename>

    Returns (full_path, uploaded_bool)
    uploaded_bool=False means file already existed (treated as duplicate).
    """
    from_address = (from_address or "unknown").lower()
    safe_from = _clean_for_fs(from_address)
    safe_msgid = _clean_for_fs(message_id or "no-id")
    safe_filename = _clean_for_fs(filename or "attachment")

    now = datetime.now()
    year = now.strftime("%Y")
    month = now.strftime("%m")
    day = now.strftime("%d")

    base_dir = os.path.join(ROOT_DIR, year, month, day, safe_from, safe_msgid)
    _ensure_dir(base_dir)

    full_path = os.path.join(base_dir, safe_filename)

    if os.path.exists(full_path):
        return full_path, False
    with open(full_path, "wb") as f:
        f.write(content_bytes)
    return full_path, True
