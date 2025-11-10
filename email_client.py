import os
import imaplib
import email
import datetime
from email.header import decode_header, make_header
from email.utils import parseaddr
from ocr_landingai import ocr_invoice_to_json
from dotenv import load_dotenv
from invoice_detector import is_invoice_attachment
from storage_local import upload_invoice
from invoice_db import save_invoice_to_db
from po_matching import match_invoice

load_dotenv()

IMAP_HOST = os.getenv("IMAP_HOST")
IMAP_PORT = int(os.getenv("IMAP_PORT", "993"))
EMAIL_USERNAME = os.getenv("EMAIL_USERNAME")
EMAIL_PASSWORD = os.getenv("EMAIL_PASSWORD")

TARGET_SENDERS = [
    s.strip().lower()
    for s in os.getenv("TARGET_SENDERS", "").split(",")
    if s.strip()
]

MAX_ATTACHMENT_SIZE_MB = 20
LOOKBACK_DAYS = 30


def _decode_str(value: str) -> str:
    if not value:
        return ""
    try:
        return str(make_header(decode_header(value)))
    except Exception:
        return value


def _connect_imap():
    if not IMAP_HOST or not EMAIL_USERNAME or not EMAIL_PASSWORD:
        raise RuntimeError("IMAP_HOST, EMAIL_USERNAME, and EMAIL_PASSWORD must be set in .env")
    imap = imaplib.IMAP4_SSL(IMAP_HOST, IMAP_PORT)
    imap.login(EMAIL_USERNAME, EMAIL_PASSWORD)
    return imap


def fetch_and_process_invoices():
    logs = []

    try:
        imap = _connect_imap()
    except Exception as e:
        return [f"IMAP connection failed: {e}"]

    try:
        status, _ = imap.select("INBOX")
        if status != "OK":
            return [f"Failed to select INBOX: {status}"]

        since_date = (datetime.date.today() - datetime.timedelta(days=LOOKBACK_DAYS)).strftime("%d-%b-%Y")
        status, data = imap.search(None, "SINCE", since_date)
        if status != "OK":
            return [f"IMAP search failed: {status} {data}"]

        msg_ids = data[0].split()
        logs.append(f"Found {len(msg_ids)} messages since {since_date} in INBOX.")

        total_attachments = 0
        uploaded_count = 0
        skipped_non_target_sender = 0
        skipped_non_invoice = 0
        skipped_duplicates = 0

        for msg_id in msg_ids:
            msg_id_str = msg_id.decode(errors="ignore")
            try:
                status, msg_data = imap.fetch(msg_id, "(RFC822)")
                if status != "OK":
                    logs.append(f"Failed to fetch message {msg_id_str}: {status}")
                    continue

                raw_email = msg_data[0][1]
                msg = email.message_from_bytes(raw_email)
                message_id = (msg.get("Message-ID") or "").strip()
                subject = _decode_str(msg.get("Subject"))
                from_header = _decode_str(msg.get("From"))
                from_name, from_email = parseaddr(from_header)
                from_email_lower = (from_email or "").lower()

                if TARGET_SENDERS and from_email_lower not in TARGET_SENDERS:
                    skipped_non_target_sender += 1
                    continue

                for part in msg.walk():
                    content_disposition = part.get_content_disposition()
                    filename = part.get_filename()
                    if content_disposition not in ("attachment", "inline") and not filename:
                        continue

                    filename = _decode_str(filename)
                    content_type = part.get_content_type()

                    try:
                        payload = part.get_payload(decode=True)
                    except Exception:
                        payload = None

                    if not payload:
                        continue

                    if len(payload) > MAX_ATTACHMENT_SIZE_MB * 1024 * 1024:
                        logs.append(
                            f"Skipping large attachment (> {MAX_ATTACHMENT_SIZE_MB}MB) "
                            f"{filename} from {from_email_lower}"
                        )
                        continue

                    total_attachments += 1

                    if not is_invoice_attachment(subject, filename, content_type):
                        skipped_non_invoice += 1
                        continue

                    try:
                        full_path, uploaded = upload_invoice(from_email_lower, message_id, filename, payload)
                        if uploaded:
                            uploaded_count += 1
                            logs.append(f"Saved {filename} from {from_email_lower} to {full_path}")
                            try:
                                json_path = ocr_invoice_to_json(full_path)
                                if json_path:
                                    logs.append(f"OCR/parse completed for {filename}; JSON saved to {json_path}")
                                    try:
                                        invoice_id = save_invoice_to_db(json_path, full_path, from_email_lower, message_id)
                                        if invoice_id:
                                            logs.append(f"Invoice saved to Supabase with id={invoice_id}")
                                            try:
                                                matched_po_id = match_invoice(invoice_id)
                                                if matched_po_id:
                                                    logs.append(f"Invoice {invoice_id} matched to PO {matched_po_id}")
                                                else:
                                                    logs.append(f"Invoice {invoice_id} not matched to any PO")
                                            except Exception as e:
                                                logs.append(f"PO matching error for invoice {invoice_id}: {e}")
                                        else:
                                            logs.append("Failed to save invoice to Supabase")
                                    except Exception as e:
                                        logs.append(f"DB persistence error for {filename}: {e}")
                                else:
                                    logs.append(
                                        f"OCR/parse skipped or failed for {filename} (see console for details)."
                                    )
                            except Exception as e:
                                logs.append(f"OCR/parse error for {filename}: {e}")
                        else:
                            skipped_duplicates += 1

                    except Exception as e:
                        logs.append(f"Failed to save {filename} from {from_email_lower}: {e}")

            except Exception as e:
                logs.append(f"Error processing message {msg_id_str}: {e}")

        logs.append(
            f"Summary: uploaded={uploaded_count}, "
            f"total_attachments_seen={total_attachments}, "
            f"skipped_non_target_sender={skipped_non_target_sender}, "
            f"skipped_non_invoice={skipped_non_invoice}, "
            f"skipped_duplicates={skipped_duplicates}"
        )

    finally:
        try:
            imap.close()
        except Exception:
            pass
        try:
            imap.logout()
        except Exception:
            pass

    return logs
