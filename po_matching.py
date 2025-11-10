from typing import Optional
from db import get_conn

def match_invoice(invoice_id:str,amount_tolerance:float=1.0,percent_tolerance:float=0.02)->Optional[str]:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                select id,po_number,total_amount,currency,vendor_id,status
                from invoices
                where id=%s
                """,
                (invoice_id,)
            )
            row=cur.fetchone()
            if not row:
                return None
            inv_id,inv_po_number,inv_total,inv_currency,inv_vendor_id,inv_status=row
            if inv_status=="vendor_mismatch":
                return None
            if not inv_po_number or inv_total is None:
                return None
            cur.execute(
                """
                select id,total_amount,currency,vendor_id
                from purchase_orders
                where po_number=%s
                  and status in ('open','partially_received')
                """,
                (inv_po_number,)
            )
            candidates=cur.fetchall()
            best_po_id=None
            best_diff=None
            for po_id,po_total,po_currency,po_vendor_id in candidates:
                if po_total is None:
                    continue
                if inv_currency and po_currency and inv_currency!=po_currency:
                    continue
                if inv_vendor_id and po_vendor_id and inv_vendor_id!=po_vendor_id:
                    continue
                diff=abs(float(inv_total)-float(po_total))
                if best_diff is None or diff<best_diff:
                    best_diff=diff
                    best_po_id=po_id
            if best_po_id is None or best_diff is None:
                return None
            if best_diff>amount_tolerance and best_diff>abs(float(inv_total))*percent_tolerance:
                return None
            confidence=max(0.0,1.0-min(1.0,best_diff/max(1.0,abs(float(inv_total)))))
            cur.execute(
                """
                update invoices
                set matched_po_id=%s,status='matched_auto',confidence=%s
                where id=%s
                """,
                (best_po_id,confidence,invoice_id)
            )
            return str(best_po_id)
