import os,json,datetime
from typing import Any,Dict,Optional
from db import get_conn

def _parse_date(value:Any):
    if not value:
        return None
    if isinstance(value,datetime.date):
        return value
    try:
        return datetime.date.fromisoformat(str(value))
    except Exception:
        return None

def save_invoice_to_db(fields_json_path:str,file_path:str,from_email:Optional[str],message_id:str,vendor_id_override:Optional[str]=None)->Optional[str]:
    with open(fields_json_path,"r",encoding="utf-8") as f:
        data:Dict[str,Any]=json.load(f)
    supplier_name=data.get("supplier_name")
    supplier_tax_id=data.get("supplier_tax_id")
    supplier_address=data.get("supplier_address")
    buyer_name=data.get("buyer_name")
    company_code=data.get("company_code")
    cost_center=data.get("cost_center")
    invoice_number=data.get("invoice_number")
    invoice_date=_parse_date(data.get("invoice_date"))
    due_date=_parse_date(data.get("due_date"))
    currency=data.get("currency")
    payment_terms=data.get("payment_terms")
    subtotal_amount=data.get("subtotal_amount")
    tax_amount=data.get("tax_amount")
    shipping_amount=data.get("shipping_amount")
    discount_amount=data.get("discount_amount")
    total_amount=data.get("total_amount")
    po_number=data.get("po_number")
    bank_account=data.get("bank_account")
    swift_bic=data.get("swift_bic")
    remittance_reference=data.get("remittance_reference")
    invoice_type=data.get("invoice_type")
    lines=data.get("lines") or []
    vendor_id=None
    status="unmatched"
    with get_conn() as conn:
        with conn.cursor() as cur:
            if vendor_id_override:
                vendor_id=vendor_id_override
                cur.execute("select name,tax_id from vendors where id=%s limit 1",(vendor_id_override,))
                vrow=cur.fetchone()
                if vrow:
                    vname,vtax=vrow
                    mismatch=False
                    if supplier_tax_id and vtax and str(supplier_tax_id).strip()!=str(vtax).strip():
                        mismatch=True
                    elif supplier_name and vname and supplier_name.strip().lower()!=vname.strip().lower():
                        mismatch=True
                    if mismatch:
                        status="vendor_mismatch"
            else:
                if supplier_tax_id:
                    cur.execute("select id from vendors where tax_id=%s limit 1",(supplier_tax_id,))
                    row=cur.fetchone()
                    if row:
                        vendor_id=row[0]
                if not vendor_id and supplier_name:
                    cur.execute("select id from vendors where lower(name)=lower(%s) limit 1",(supplier_name,))
                    row=cur.fetchone()
                    if row:
                        vendor_id=row[0]
                if not vendor_id and supplier_name:
                    cur.execute(
                        "insert into vendors(name,tax_id,address,contact_info) values(%s,%s,%s,%s) returning id",
                        (supplier_name,supplier_tax_id,supplier_address,from_email)
                    )
                    vendor_id=cur.fetchone()[0]
            cur.execute(
                """
                insert into invoices(
                  supplier_name,supplier_email,supplier_tax_id,supplier_address,
                  buyer_name,company_code,cost_center,
                  invoice_number,invoice_date,due_date,
                  currency,payment_terms,
                  subtotal_amount,tax_amount,shipping_amount,discount_amount,total_amount,
                  po_number,bank_account,swift_bic,remittance_reference,invoice_type,
                  file_path,fields_json_path,email_message_id,vendor_id,status
                ) values(
                  %s,%s,%s,%s,
                  %s,%s,%s,
                  %s,%s,%s,
                  %s,%s,
                  %s,%s,%s,%s,%s,
                  %s,%s,%s,%s,%s,
                  %s,%s,%s,%s,%s
                )
                returning id
                """,
                (
                  supplier_name,from_email,supplier_tax_id,supplier_address,
                  buyer_name,company_code,cost_center,
                  invoice_number,invoice_date,due_date,
                  currency,payment_terms,
                  subtotal_amount,tax_amount,shipping_amount,discount_amount,total_amount,
                  po_number,bank_account,swift_bic,remittance_reference,invoice_type,
                  file_path,fields_json_path,message_id,vendor_id,status
                )
            )
            invoice_id=cur.fetchone()[0]
            for line in lines:
                line_number=line.get("line_number")
                description=line.get("description")
                sku=line.get("sku")
                quantity=line.get("quantity")
                unit_of_measure=line.get("unit_of_measure")
                unit_price=line.get("unit_price")
                line_total=line.get("line_total")
                tax_rate=line.get("tax_rate")
                tax_code=line.get("tax_code")
                line_po_number=line.get("po_number")
                po_line_number=line.get("po_line_number")
                cur.execute(
                    """
                    insert into invoice_lines(
                      invoice_id,line_number,description,sku,quantity,
                      unit_of_measure,unit_price,line_total,tax_rate,tax_code,
                      po_number,po_line_number
                    ) values(
                      %s,%s,%s,%s,%s,
                      %s,%s,%s,%s,%s,
                      %s,%s
                    )
                    """,
                    (
                      invoice_id,line_number,description,sku,quantity,
                      unit_of_measure,unit_price,line_total,tax_rate,tax_code,
                      line_po_number,po_line_number
                    )
                )
    return str(invoice_id)

def get_dashboard_stats(days:int=30)->Dict[str,Any]:
    """Get dashboard statistics for the last N days.
    Includes:
      - invoicesProcessed: total invoices created in window
      - amountProcessed: sum(total_amount) in window
      - avgDaysSavedPerInvoice: configured avg days saved per invoice
      - exceptionInvoices: count of invoices in exception statuses in window
      - exceptionTimeSavedHours: derived from exceptionInvoices * configured per-exception savings (hours)
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Calculate date range
            end_date = datetime.date.today()
            start_date = end_date - datetime.timedelta(days=days)

            # Get invoice count
            cur.execute("""
                SELECT COUNT(*)
                FROM invoices
                WHERE created_at >= %s AND created_at < %s
            """, (start_date, end_date))
            count_result = cur.fetchone()
            invoices_processed = count_result[0] if count_result else 0

            # Get total amount
            cur.execute("""
                SELECT COALESCE(SUM(total_amount), 0)
                FROM invoices
                WHERE created_at >= %s AND created_at < %s
            """, (start_date, end_date))
            amount_result = cur.fetchone()
            amount_processed = float(amount_result[0]) if amount_result else 0.0

            # Configurable productivity assumptions
            try:
                avg_days_saved_per_invoice = float(os.getenv("AVG_DAYS_SAVED_PER_INVOICE", "8.5"))
            except Exception:
                avg_days_saved_per_invoice = 8.5

            # Exception invoices in window
            allowed_statuses = ("unmatched", "vendor_mismatch", "needs_review")
            cur.execute(
                """
                SELECT COUNT(*)
                FROM invoices
                WHERE created_at >= %s AND created_at < %s
                  AND status IN (%s,%s,%s)
                """,
                (start_date, end_date, *allowed_statuses)
            )
            ex_row = cur.fetchone()
            exception_invoices = ex_row[0] if ex_row else 0

            # Per-exception savings (hours), configurable
            try:
                per_exception_hours = float(os.getenv("EXCEPTION_TIME_SAVED_HOURS_PER_INVOICE", "1.0"))
            except Exception:
                per_exception_hours = 1.0
            exception_time_saved_hours = round(exception_invoices * per_exception_hours, 2)

            return {
                "invoicesProcessed": invoices_processed,
                "amountProcessed": amount_processed,
                "avgDaysSavedPerInvoice": avg_days_saved_per_invoice,
                "exceptionInvoices": exception_invoices,
                "exceptionTimeSavedHours": exception_time_saved_hours,
            }

def get_graph_data(days:int=30):
    """Get daily metrics for the last N days.
    Returns a list of objects per day with:
      - date, displayDate
      - count: number of invoices created that day
      - amount: total amount for that day (sum of total_amount)
      - autoMatchPercent: percentage of invoices auto-matched that day
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            end_date = datetime.date.today()
            start_date = end_date - datetime.timedelta(days=days-1)

            cur.execute("""
                SELECT
                    DATE(created_at) AS d,
                    COUNT(*) AS c,
                    COALESCE(SUM(total_amount), 0) AS amt,
                    SUM(CASE WHEN status = 'matched_auto' THEN 1 ELSE 0 END) AS matched
                FROM invoices
                WHERE DATE(created_at) >= %s AND DATE(created_at) <= %s
                GROUP BY DATE(created_at)
                ORDER BY DATE(created_at)
            """, (start_date, end_date))

            rows = cur.fetchall()
            by_date = {}
            for d, c, amt, matched in rows:
                c = int(c or 0)
                amt_f = float(amt or 0.0)
                matched_i = int(matched or 0)
                pct = (matched_i / c * 100.0) if c > 0 else 0.0
                by_date[d] = {
                    "count": c,
                    "amount": amt_f,
                    "autoMatchPercent": round(pct, 2),
                }

            # Generate full range with defaults for missing days
            graph_data = []
            current_date = start_date
            while current_date <= end_date:
                vals = by_date.get(current_date, {"count": 0, "amount": 0.0, "autoMatchPercent": 0.0})
                graph_data.append({
                    "date": current_date.isoformat(),
                    "displayDate": current_date.strftime("%b %d"),
                    "count": vals["count"],
                    "amount": vals["amount"],
                    "autoMatchPercent": vals["autoMatchPercent"],
                })
                current_date += datetime.timedelta(days=1)

            return graph_data

def get_recent_invoices(limit:int=10):
    """Get recent invoices with vendor info"""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    i.id,
                    i.invoice_date,
                    i.supplier_name,
                    i.total_amount,
                    i.status,
                    i.invoice_number,
                    i.po_number,
                    i.due_date,
                    v.name as vendor_name
                FROM invoices i
                LEFT JOIN vendors v ON i.vendor_id = v.id
                ORDER BY i.created_at DESC
                LIMIT %s
            """, (limit,))

            rows = cur.fetchall()
            invoices = []
            for row in rows:
                invoice_date = row[1] if row[1] else datetime.date.today()
                due_date = row[7] if row[7] else invoice_date

                invoices.append({
                    "id": str(row[0]),
                    "date": invoice_date.isoformat(),
                    "displayDate": invoice_date.strftime("%d %b"),
                    "vendorName": row[8] or row[2] or "Unknown Vendor",
                    "amount": float(row[3]) if row[3] else 0.0,
                    "status": row[4] or "unmatched",
                    "invoiceNumber": row[5] or "",
                    "description": "",  # Not stored in current schema
                    "poNumber": row[6],
                    "dueDate": due_date.isoformat()
                })

            return invoices

def get_invoice_by_id(invoice_id:str)->Optional[Dict[str,Any]]:
    """Get detailed invoice information by ID"""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    i.id,
                    i.invoice_date,
                    i.supplier_name,
                    i.total_amount,
                    i.status,
                    i.invoice_number,
                    i.po_number,
                    i.due_date,
                    v.name as vendor_name,
                    i.currency,
                    i.subtotal_amount,
                    i.tax_amount
                FROM invoices i
                LEFT JOIN vendors v ON i.vendor_id = v.id
                WHERE i.id = %s
                LIMIT 1
            """, (invoice_id,))

            row = cur.fetchone()
            if not row:
                return None

            invoice_date = row[1] if row[1] else datetime.date.today()
            due_date = row[7] if row[7] else invoice_date

            # Fetch line items
            cur.execute("""
                SELECT line_number, description, sku, quantity, unit_of_measure,
                       unit_price, line_total, tax_rate, tax_code, po_number, po_line_number
                FROM invoice_lines
                WHERE invoice_id = %s
                ORDER BY COALESCE(line_number, 0), po_line_number NULLS LAST
            """, (invoice_id,))
            line_rows = cur.fetchall()
            lines = []
            for lr in line_rows:
                lines.append({
                    "line_number": lr[0],
                    "description": lr[1],
                    "sku": lr[2],
                    "quantity": float(lr[3]) if lr[3] is not None else None,
                    "unit_of_measure": lr[4],
                    "unit_price": float(lr[5]) if lr[5] is not None else None,
                    "line_total": float(lr[6]) if lr[6] is not None else None,
                    "tax_rate": float(lr[7]) if lr[7] is not None else None,
                    "tax_code": lr[8],
                    "po_number": lr[9],
                    "po_line_number": lr[10],
                })

            return {
                "id": str(row[0]),
                "date": invoice_date.isoformat(),
                "displayDate": invoice_date.strftime("%d %b"),
                "vendorName": row[8] or row[2] or "Unknown Vendor",
                "amount": float(row[3]) if row[3] else 0.0,
                "status": row[4] or "unmatched",
                "invoiceNumber": row[5] or "",
                "description": f"Invoice from {row[8] or row[2] or 'Unknown Vendor'}",
                "poNumber": row[6],
                "dueDate": due_date.isoformat(),
                "currency": row[9] or "USD",
                "subtotal": float(row[10]) if row[10] else 0.0,
                "tax": float(row[11]) if row[11] else 0.0,
                "lines": lines
            }


def get_exception_invoices(vendor_id:Optional[str]=None, limit:int=100, status:Optional[str]=None):
    """Get invoices considered exceptions: unmatched, vendor_mismatch, needs_review.
       Optional filter by vendor_id or a specific status.
    """
    allowed_statuses = ("unmatched", "vendor_mismatch", "needs_review")
    params: list[Any] = []
    where_clauses = ["i.status IS NOT NULL"]
    if status:
        where_clauses.append("i.status = %s")
        params.append(status)
    else:
        where_clauses.append("i.status IN (%s,%s,%s)")
        params.extend(list(allowed_statuses))
    if vendor_id:
        where_clauses.append("i.vendor_id = %s")
        params.append(vendor_id)
    where_sql = " AND ".join(where_clauses)

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(f"""
                SELECT
                    i.id,
                    i.invoice_date,
                    i.supplier_name,
                    i.total_amount,
                    i.status,
                    i.invoice_number,
                    i.po_number,
                    i.due_date,
                    v.name as vendor_name
                FROM invoices i
                LEFT JOIN vendors v ON i.vendor_id = v.id
                WHERE {where_sql}
                ORDER BY i.created_at DESC NULLS LAST, i.invoice_date DESC NULLS LAST, i.id DESC
                LIMIT %s
            """, (*params, limit))

            rows = cur.fetchall()
            invoices = []
            for row in rows:
                invoice_date = row[1] if row[1] else datetime.date.today()
                due_date = row[7] if row[7] else invoice_date
                invoices.append({
                    "id": str(row[0]),
                    "date": invoice_date.isoformat(),
                    "displayDate": invoice_date.strftime("%d %b"),
                    "vendorName": row[8] or row[2] or "Unknown Vendor",
                    "amount": float(row[3]) if row[3] else 0.0,
                    "status": row[4] or "unmatched",
                    "invoiceNumber": row[5] or "",
                    "description": "",
                    "poNumber": row[6],
                    "dueDate": due_date.isoformat(),
                })
            return invoices

def get_payable_invoices(vendor_id:Optional[str]=None, currency:Optional[str]=None, limit:int=200):
    """Return invoices that are eligible for payment: matched or ready_for_payment, not already paid or pending."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            where = ["i.status IN ('matched_auto','ready_for_payment')", "i.status NOT IN ('paid','payment_pending')"]
            params: list[Any] = []
            if vendor_id:
                where.append("i.vendor_id = %s")
                params.append(vendor_id)
            if currency:
                where.append("i.currency = %s")
                params.append(currency)
            where_sql = " AND ".join(where)
            cur.execute(f"""
                SELECT
                    i.id,
                    i.invoice_date,
                    i.supplier_name,
                    i.total_amount,
                    i.status,
                    i.invoice_number,
                    i.po_number,
                    i.due_date,
                    v.name as vendor_name,
                    i.currency,
                    i.vendor_id
                FROM invoices i
                LEFT JOIN vendors v ON i.vendor_id = v.id
                WHERE {where_sql}
                ORDER BY i.created_at DESC NULLS LAST, i.invoice_date DESC NULLS LAST, i.id DESC
                LIMIT %s
            """, (*params, limit))

            rows = cur.fetchall()
            invoices = []
            for row in rows:
                invoice_date = row[1] if row[1] else datetime.date.today()
                due_date = row[7] if row[7] else invoice_date
                invoices.append({
                    "id": str(row[0]),
                    "date": invoice_date.isoformat(),
                    "displayDate": invoice_date.strftime("%d %b"),
                    "vendorName": row[8] or row[2] or "Unknown Vendor",
                    "vendorId": str(row[10]) if row[10] else None,
                    "amount": float(row[3]) if row[3] else 0.0,
                    "status": row[4] or "matched_auto",
                    "invoiceNumber": row[5] or "",
                    "poNumber": row[6],
                    "dueDate": due_date.isoformat(),
                    "currency": row[9] or "USD",
                })
            return invoices
