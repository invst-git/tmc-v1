import os
import hashlib
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv
from db import get_conn
import stripe

load_dotenv()

STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY")

if STRIPE_SECRET_KEY:
    stripe.api_key = STRIPE_SECRET_KEY


def _assert_payment_tables(cur) -> None:
    """Ensure required payment tables exist; raise with guidance if missing."""
    cur.execute("SELECT to_regclass('public.payments'), to_regclass('public.payment_invoices')")
    row = cur.fetchone()
    if not row or row[0] is None or row[1] is None:
        raise RuntimeError(
            "Payments tables not found. Run migration: migrations/2025-11-09_add_payments_tables.sql"
        )


def _minor_units(amount: float, currency: str) -> int:
    # Assumes 2-decimal currencies for now
    return int(round(float(amount) * 100))


def create_payment_intent_for_invoices(
    invoice_ids: List[str],
    customer: Dict[str, Any],
    currency: Optional[str] = None,
    save_method: bool = False,
) -> Dict[str, Any]:
    if not STRIPE_SECRET_KEY:
        raise RuntimeError("STRIPE_SECRET_KEY not configured")
    if not invoice_ids:
        raise ValueError("invoiceIds required")

    email = (customer.get("email") or "").strip()
    name = (customer.get("name") or "").strip()
    address = customer.get("address") or {}

    with get_conn() as conn:
        with conn.cursor() as cur:
            _assert_payment_tables(cur)

            # Lock invoices and validate
            cur.execute(
                """
                SELECT id, total_amount, currency, status, vendor_id
                FROM invoices
                WHERE id = ANY(%s)
                FOR UPDATE
                """,
                (invoice_ids,)
            )
            rows = cur.fetchall()
            if len(rows) != len(invoice_ids):
                raise ValueError("Some invoices not found")

            total = 0.0
            currencies = set()
            allowed_status = {"matched_auto", "ready_for_payment"}
            for rid, amount, curr, status, vendor_id in rows:
                if status in ("paid", "payment_pending"):
                    raise ValueError("One or more invoices are already paid or pending")
                if status not in allowed_status:
                    raise ValueError("One or more invoices are not eligible for payment")
                if amount is None:
                    raise ValueError("Invoice missing total amount")
                total += float(amount)
                if curr:
                    currencies.add(str(curr))

            if currency:
                currencies.add(currency)
            if len(currencies) > 1:
                raise ValueError("Mixed currency selection is not allowed")
            final_currency = (list(currencies)[0] if currencies else (currency or "USD")).lower()

            # Insert payment record
            cur.execute(
                """
                INSERT INTO payments(amount, currency, customer_email, status)
                VALUES (%s, %s, %s, %s)
                RETURNING id
                """,
                (total, final_currency, email or None, "requires_confirmation"),
            )
            payment_id = cur.fetchone()[0]

            # Insert link rows, and set invoices to payment_pending
            for rid, amount, curr, status, vendor_id in rows:
                cur.execute(
                    """
                    INSERT INTO payment_invoices(payment_id, invoice_id, amount_applied, previous_status)
                    VALUES (%s, %s, %s, %s)
                    """,
                    (payment_id, rid, amount, status),
                )
            # Update invoices only if still in allowed statuses
            cur.execute(
                """
                UPDATE invoices
                SET status = 'payment_pending'
                WHERE id = ANY(%s) AND status IN ('matched_auto','ready_for_payment')
                """,
                (invoice_ids,),
            )

            # Prepare PaymentIntent
            idemp_key = hashlib.sha256(("|".join(sorted(invoice_ids)) + "|" + (email or "") + f"|{total:.2f}|{final_currency}").encode()).hexdigest()
            intent = stripe.PaymentIntent.create(
                amount=_minor_units(total, final_currency),
                currency=final_currency,
                metadata={
                    "invoice_ids": ",".join(invoice_ids),
                    "payment_id": str(payment_id),
                    "customer_email": email or "",
                },
                receipt_email=email or None,
                setup_future_usage=("off_session" if save_method else None),
                automatic_payment_methods={"enabled": True},
                idempotency_key=idemp_key,
            )

            # Store intent id
            cur.execute(
                """
                UPDATE payments SET stripe_payment_intent_id=%s WHERE id=%s
                """,
                (intent.id, payment_id),
            )

            return {
                "paymentId": str(payment_id),
                "clientSecret": intent.client_secret,
                "paymentIntentId": intent.id,
                "amount": total,
                "currency": final_currency,
                "invoiceIds": invoice_ids,
            }


def mark_payment_succeeded(payment_intent_id: str) -> None:
    with get_conn() as conn:
        with conn.cursor() as cur:
            _assert_payment_tables(cur)
            cur.execute("SELECT id FROM payments WHERE stripe_payment_intent_id=%s LIMIT 1", (payment_intent_id,))
            row = cur.fetchone()
            if not row:
                return
            payment_id = row[0]
            # Update invoices to paid
            cur.execute("SELECT invoice_id FROM payment_invoices WHERE payment_id=%s", (payment_id,))
            ids = [r[0] for r in cur.fetchall()]
            if ids:
                cur.execute("UPDATE invoices SET status='paid' WHERE id = ANY(%s)", (ids,))
            cur.execute("UPDATE payments SET status='succeeded' WHERE id=%s", (payment_id,))


def mark_payment_failed_or_canceled(payment_intent_id: str) -> None:
    with get_conn() as conn:
        with conn.cursor() as cur:
            _assert_payment_tables(cur)
            cur.execute("SELECT id FROM payments WHERE stripe_payment_intent_id=%s LIMIT 1", (payment_intent_id,))
            row = cur.fetchone()
            if not row:
                return
            payment_id = row[0]
            # Revert invoice statuses
            cur.execute("SELECT invoice_id, previous_status FROM payment_invoices WHERE payment_id=%s", (payment_id,))
            for inv_id, prev in cur.fetchall():
                cur.execute("UPDATE invoices SET status=%s WHERE id=%s", (prev or 'ready_for_payment', inv_id))
            cur.execute("UPDATE payments SET status='failed' WHERE id=%s", (payment_id,))


def confirm_payment_intent(payment_intent_id: str) -> Dict[str, Any]:
    """Verify with Stripe and update DB to mark invoices paid if succeeded.
       Returns a summary dict with status and affected invoice ids.
    """
    if not STRIPE_SECRET_KEY:
        raise RuntimeError("STRIPE_SECRET_KEY not configured")
    # Retrieve from Stripe to verify status
    intent = stripe.PaymentIntent.retrieve(payment_intent_id)
    status = intent.get("status") if isinstance(intent, dict) else getattr(intent, 'status', None)
    meta = intent.get("metadata", {}) if isinstance(intent, dict) else getattr(intent, 'metadata', {})
    invoice_ids = []
    if isinstance(meta, dict) and meta.get("invoice_ids"):
        invoice_ids = [s for s in str(meta.get("invoice_ids")).split(',') if s]

    if status == "succeeded":
        mark_payment_succeeded(payment_intent_id)
        return {"status": "succeeded", "invoiceIds": invoice_ids}
    elif status in ("canceled", "requires_payment_method"):
        # Revert locks if any were set during intent creation
        mark_payment_failed_or_canceled(payment_intent_id)
        return {"status": status, "invoiceIds": invoice_ids}
    else:
        # Pending or requires_action; do nothing
        return {"status": status or "unknown", "invoiceIds": invoice_ids}
