import os
from typing import Optional, Dict, Any, List
from dotenv import load_dotenv
import psycopg

load_dotenv()

DB_URL=os.getenv("DATABASE_URL")

def get_conn():
    if not DB_URL:
        raise RuntimeError("DATABASE_URL not set")
    return psycopg.connect(DB_URL)

def get_vendors():
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("select id,name from vendors order by name")
            return cur.fetchall()

def get_all_vendors_detailed():
    """Get all vendors with counts of open POs and recent invoices"""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    v.id,
                    v.name,
                    v.tax_id,
                    v.contact_info,
                    COALESCE(po_count.count, 0) as open_pos,
                    COALESCE(invoice_count.count, 0) as invoices_30d,
                    CASE WHEN COALESCE(invoice_count.count, 0) > 0 THEN 'active' ELSE 'inactive' END as status
                FROM vendors v
                LEFT JOIN (
                    SELECT vendor_id, COUNT(*) as count
                    FROM purchase_orders
                    WHERE status IN ('open', 'partially_received')
                    GROUP BY vendor_id
                ) po_count ON v.id = po_count.vendor_id
                LEFT JOIN (
                    SELECT vendor_id, COUNT(*) as count
                    FROM invoices
                    WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
                    GROUP BY vendor_id
                ) invoice_count ON v.id = invoice_count.vendor_id
                ORDER BY v.name
            """)

            rows = cur.fetchall()
            vendors = []
            for row in rows:
                vendors.append({
                    'id': str(row[0]),
                    'name': row[1] or 'Unknown Vendor',
                    'taxId': row[2] or '',
                    'contact': row[3] or '',
                    'openPos': row[4],
                    'invoices30d': row[5],
                    'status': row[6]
                })
            return vendors

def get_vendor_stats():
    """Get summary statistics about vendors"""
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Total vendors
            cur.execute("SELECT COUNT(*) FROM vendors")
            total = cur.fetchone()[0]

            # Active vendors (had invoices in last 30 days)
            cur.execute("""
                SELECT COUNT(DISTINCT vendor_id)
                FROM invoices
                WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
                AND vendor_id IS NOT NULL
            """)
            active = cur.fetchone()[0]

            # Vendors with invoices in last 30 days
            cur.execute("""
                SELECT COUNT(DISTINCT vendor_id)
                FROM invoices
                WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
                AND vendor_id IS NOT NULL
            """)
            with_invoices = cur.fetchone()[0]

            return {
                'totalVendors': total,
                'activeVendors': active,
                'vendorsWithInvoices30d': with_invoices
            }

def get_vendor_by_id_detailed(vendor_id):
    """Get detailed vendor information including stats and recent activity"""
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Get vendor basic info
            cur.execute("""
                SELECT id, name, tax_id, contact_info, address
                FROM vendors
                WHERE id = %s
            """, (vendor_id,))

            vendor_row = cur.fetchone()
            if not vendor_row:
                return None

            # Get open POs count
            cur.execute("""
                SELECT COUNT(*)
                FROM purchase_orders
                WHERE vendor_id = %s
                AND status IN ('open', 'partially_received')
            """, (vendor_id,))
            open_pos = cur.fetchone()[0]

            # Get invoices last 30 days count
            cur.execute("""
                SELECT COUNT(*)
                FROM invoices
                WHERE vendor_id = %s
                AND created_at >= CURRENT_DATE - INTERVAL '30 days'
            """, (vendor_id,))
            invoices_30d = cur.fetchone()[0]

            # Get total amount last 30 days
            cur.execute("""
                SELECT COALESCE(SUM(total_amount), 0)
                FROM invoices
                WHERE vendor_id = %s
                AND created_at >= CURRENT_DATE - INTERVAL '30 days'
            """, (vendor_id,))
            total_amount = float(cur.fetchone()[0])

            # Get recent invoices (summary, last 3)
            cur.execute("""
                SELECT invoice_date, total_amount, status
                FROM invoices
                WHERE vendor_id = %s
                ORDER BY invoice_date DESC NULLS LAST, id DESC
                LIMIT 3
            """, (vendor_id,))
            recent_rows = cur.fetchall()

            recent_invoices = []
            for row in recent_rows:
                recent_invoices.append({
                    'date': row[0].isoformat() if row[0] else '',
                    'amount': float(row[1]) if row[1] else 0.0,
                    'status': row[2] or 'unmatched'
                })

            # Full invoice list for this vendor (with ids)
            cur.execute("""
                SELECT id, invoice_date, total_amount, status, invoice_number, po_number
                FROM invoices
                WHERE vendor_id = %s
                ORDER BY invoice_date DESC NULLS LAST, id DESC
                LIMIT 50
            """, (vendor_id,))
            invoice_rows = cur.fetchall()
            invoices = []
            for row in invoice_rows:
                inv_date = row[1]
                invoices.append({
                    'id': str(row[0]),
                    'date': inv_date.isoformat() if inv_date else '',
                    'amount': float(row[2]) if row[2] else 0.0,
                    'status': row[3] or 'unmatched',
                    'invoiceNumber': row[4] or '',
                    'poNumber': row[5] or ''
                })

            # Purchase orders for this vendor
            cur.execute("""
                SELECT id, po_number, total_amount, currency, status, created_at
                FROM purchase_orders
                WHERE vendor_id = %s
                ORDER BY created_at DESC NULLS LAST, id DESC
                LIMIT 50
            """, (vendor_id,))
            po_rows = cur.fetchall()
            purchase_orders = []
            for row in po_rows:
                purchase_orders.append({
                    'id': str(row[0]),
                    'poNumber': row[1] or '',
                    'totalAmount': float(row[2]) if row[2] else 0.0,
                    'currency': row[3] or 'USD',
                    'status': row[4] or ''
                })

            return {
                'id': str(vendor_row[0]),
                'name': vendor_row[1] or 'Unknown Vendor',
                'taxId': vendor_row[2] or '',
                'contact': vendor_row[3] or '',
                'address': vendor_row[4] or '',
                'phone': '+1 (555) 123-4567',  # Mock for now
                'openPos': open_pos,
                'invoices30d': invoices_30d,
                'totalAmount30d': total_amount,
                'status': 'active' if invoices_30d > 0 else 'inactive',
                'recentInvoices': recent_invoices,
                'invoices': invoices,
                'purchaseOrders': purchase_orders
            }

def create_vendor(name: str, tax_id: Optional[str] = None, contact_info: Optional[str] = None, address: Optional[str] = None) -> Dict[str, Any]:
    if not name or not name.strip():
        raise ValueError("name is required")
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO vendors(name, tax_id, contact_info, address)
                VALUES (%s, %s, %s, %s)
                RETURNING id, name, tax_id, contact_info, address
                """,
                (name.strip(), tax_id, contact_info, address)
            )
            row = cur.fetchone()
            return {
                'id': str(row[0]),
                'name': row[1] or '',
                'taxId': row[2] or '',
                'contact': row[3] or '',
                'address': row[4] or '',
            }

def delete_vendor(vendor_id: str) -> Dict[str, Any]:
    """Delete vendor and related data (invoices, invoice_lines, PO lines, POs, payment links).
    Uses subqueries instead of array parameters to ensure proper deletion.
    Returns a summary of deleted counts.
    """
    summary = {
        'paymentLinksDeleted': 0,
        'invoiceLinesDeleted': 0,
        'invoicesDeleted': 0,
        'poLinesDeleted': 0,
        'purchaseOrdersDeleted': 0,
        'vendorsDeleted': 0,
    }
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Delete payment links tied to this vendor's invoices
            try:
                cur.execute(
                    """
                    DELETE FROM payment_invoices
                    WHERE invoice_id IN (
                        SELECT id FROM invoices WHERE vendor_id = %s
                    )
                    """,
                    (vendor_id,)
                )
                summary['paymentLinksDeleted'] = cur.rowcount or 0
            except Exception:
                # table may not exist yet
                pass

            # Delete invoice lines for this vendor's invoices
            try:
                cur.execute(
                    """
                    DELETE FROM invoice_lines
                    WHERE invoice_id IN (
                        SELECT id FROM invoices WHERE vendor_id = %s
                    )
                    """,
                    (vendor_id,)
                )
                summary['invoiceLinesDeleted'] = cur.rowcount or 0
            except Exception:
                pass

            # Delete invoices for this vendor
            cur.execute("DELETE FROM invoices WHERE vendor_id=%s", (vendor_id,))
            summary['invoicesDeleted'] = cur.rowcount or 0

            # Delete PO lines and POs for this vendor (if tables exist)
            try:
                cur.execute(
                    """
                    DELETE FROM purchase_order_lines
                    WHERE po_id IN (
                        SELECT id FROM purchase_orders WHERE vendor_id = %s
                    )
                    """,
                    (vendor_id,)
                )
                summary['poLinesDeleted'] = cur.rowcount or 0
                cur.execute("DELETE FROM purchase_orders WHERE vendor_id=%s", (vendor_id,))
                summary['purchaseOrdersDeleted'] = cur.rowcount or 0
            except Exception:
                pass

            # Finally delete vendor
            cur.execute("DELETE FROM vendors WHERE id=%s", (vendor_id,))
            summary['vendorsDeleted'] = cur.rowcount or 0

    return summary
