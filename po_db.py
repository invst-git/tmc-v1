from typing import Optional, Dict, Any, List
from db import get_conn


def get_po_by_id(po_id: str) -> Optional[Dict[str, Any]]:
    """Fetch a purchase order by id with optional line items if available."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, po_number, vendor_id, buyer_company_name, bill_to_address, ship_to_address,
                       shipping_method, shipping_terms, delivery_date_expected, payment_terms, currency,
                       subtotal_amount, tax_amount, shipping_amount, total_amount, status, created_at
                FROM purchase_orders
                WHERE id = %s
                LIMIT 1
                """,
                (po_id,)
            )
            row = cur.fetchone()
            if not row:
                return None

            result: Dict[str, Any] = {
                "id": str(row[0]),
                "poNumber": row[1] or "",
                "vendorId": str(row[2]) if row[2] is not None else None,
                "buyerCompanyName": row[3] or "",
                "billToAddress": row[4] or "",
                "shipToAddress": row[5] or "",
                "shippingMethod": row[6] or "",
                "shippingTerms": row[7] or "",
                "deliveryDateExpected": row[8].isoformat() if row[8] else None,
                "paymentTerms": row[9] or "",
                "currency": row[10] or "USD",
                "subtotalAmount": float(row[11]) if row[11] is not None else 0.0,
                "taxAmount": float(row[12]) if row[12] is not None else 0.0,
                "shippingAmount": float(row[13]) if row[13] is not None else 0.0,
                "totalAmount": float(row[14]) if row[14] is not None else 0.0,
                "status": row[15] or "",
                "createdAt": row[16].isoformat() if row[16] else None,
                "lines": []  # will populate below if table exists
            }

            # Load PO line items per schema: purchase_order_lines.po_id and quantity_ordered
            try:
                cur.execute(
                    """
                    SELECT line_number, sku, description, quantity_ordered, unit_of_measure,
                           unit_price, line_total, tax_rate, tax_code
                    FROM purchase_order_lines
                    WHERE po_id = %s
                    ORDER BY COALESCE(line_number, 0)
                    """,
                    (po_id,)
                )
                rows = cur.fetchall()
                lines: List[Dict[str, Any]] = []
                for lr in rows:
                    lines.append({
                        "line_number": lr[0],
                        "sku": lr[1],
                        "description": lr[2],
                        "quantity": float(lr[3]) if lr[3] is not None else None,
                        "unit_of_measure": lr[4],
                        "unit_price": float(lr[5]) if lr[5] is not None else None,
                        "line_total": float(lr[6]) if lr[6] is not None else None,
                        "tax_rate": float(lr[7]) if lr[7] is not None else None,
                        "tax_code": lr[8],
                    })
                result["lines"] = lines
            except Exception:
                # Table or columns may not exist; ignore silently
                pass

            return result
