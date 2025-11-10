import os,threading,datetime,uuid
from flask import Flask,render_template_string,redirect,url_for,request,jsonify
from dotenv import load_dotenv
from apscheduler.schedulers.background import BackgroundScheduler
from email_client import fetch_and_process_invoices
from storage_local import upload_invoice as save_invoice_file
from ocr_landingai import ocr_invoice_to_json
from invoice_db import save_invoice_to_db,get_dashboard_stats,get_graph_data,get_recent_invoices,get_invoice_by_id,get_exception_invoices,get_payable_invoices
from payments import create_payment_intent_for_invoices, mark_payment_failed_or_canceled, confirm_payment_intent
import stripe
from po_matching import match_invoice
from vendor_db import get_vendors,get_all_vendors_detailed,get_vendor_stats,get_vendor_by_id_detailed,create_vendor,delete_vendor
from chat_db import create_chat as db_create_chat, list_messages as db_list_messages, add_message as db_add_message, get_chat_vendor, list_chats_for_vendor as db_list_chats
from chat_llm import generate_vendor_response, generate_chat_title
from db import get_conn
from flask import Response, stream_with_context
from po_db import get_po_by_id as get_po_detail

load_dotenv()

CHECK_INTERVAL_SECONDS=int(os.getenv("CHECK_INTERVAL_SECONDS","30"))

app=Flask(__name__)
app.secret_key=os.getenv("FLASK_SECRET_KEY","change-me")

last_run_at=None
last_run_result=""
is_running=False
lock=threading.Lock()

INDEX_TEMPLATE="""
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Invoice Processor</title>
<style>
body{font-family:Arial,sans-serif;margin:40px}
nav a{margin-right:15px;text-decoration:none;color:#0366d6}
nav a:hover{text-decoration:underline}
.status{margin-bottom:20px}
pre{background:#f4f4f4;padding:10px;border-radius:4px;white-space:pre-wrap}
button{padding:10px 16px;font-size:14px;cursor:pointer}
button[disabled]{opacity:.5;cursor:not-allowed}
</style>
</head>
<body>
<nav>
<a href="{{ url_for('index') }}">Email intake</a>
<a href="{{ url_for('upload_page') }}">Upload invoice</a>
</nav>
<h1>Email Invoice Downloader</h1>
<div class="status">
<p><strong>Auto check interval:</strong> every {{ interval }} seconds.</p>
<p><strong>Job status:</strong> {% if is_running %}Running...{% else %}Idle{% endif %}</p>
<p><strong>Last run at:</strong> {% if last_run_at %}{{ last_run_at }}{% else %}Never{% endif %}</p>
</div>
<form method="post" action="{{ url_for('run_now') }}">
<button type="submit" {% if is_running %}disabled{% endif %}>Run Invoice Check Now</button>
</form>
<h2>Last Run Log</h2>
<pre>{{ last_run_result }}</pre>
</body>
</html>
"""

UPLOAD_TEMPLATE="""
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Upload Invoice</title>
<style>
body{font-family:Arial,sans-serif;margin:40px}
nav a{margin-right:15px;text-decoration:none;color:#0366d6}
nav a:hover{text-decoration:underline}
form{margin-bottom:20px}
label{display:block;margin-top:10px}
select,input[type=file]{margin-top:4px}
pre{background:#f4f4f4;padding:10px;border-radius:4px;white-space:pre-wrap}
button{padding:10px 16px;font-size:14px;cursor:pointer}
button[disabled]{opacity:.5;cursor:not-allowed}
.error{color:#b00020}
</style>
</head>
<body>
<nav>
<a href="{{ url_for('index') }}">Email intake</a>
<a href="{{ url_for('upload_page') }}">Upload invoice</a>
</nav>
<h1>Upload Invoice</h1>
{% if error %}
<p class="error">{{ error }}</p>
{% endif %}
<form method="post" enctype="multipart/form-data">
<label>Vendor
<select name="vendor_id" required>
<option value="">Select vendor</option>
{% for v in vendors %}
<option value="{{ v[0] }}" {% if selected_vendor_id==v[0] %}selected{% endif %}>{{ v[1] }}</option>
{% endfor %}
</select>
</label>
<label>Invoice file
<input type="file" name="file" required>
</label>
<button type="submit" id="uploadBtn">Upload and process</button>
</form>
<h2>Upload Log</h2>
<pre>{{ logs }}</pre>
<script>
const f=document.querySelector("form");
const b=document.getElementById("uploadBtn");
if(f && b){
  f.addEventListener("submit",function(){
    b.disabled=true;
  });
}
</script>

</body>
</html>
"""

def run_job(triggered_by="scheduler"):
    global last_run_at,last_run_result,is_running
    with lock:
        if is_running:
            return
        is_running=True
    try:
        last_run_at=datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        logs=fetch_and_process_invoices()
        if isinstance(logs,list):
            last_run_result="\n".join(logs)
        else:
            last_run_result=str(logs)
    except Exception as e:
        last_run_result=f"Unexpected error in job: {e}"
    finally:
        is_running=False

@app.route("/",methods=["GET"])
def index():
    return render_template_string(
        INDEX_TEMPLATE,
        last_run_at=last_run_at,
        last_run_result=last_run_result,
        is_running=is_running,
        interval=CHECK_INTERVAL_SECONDS,
    )

@app.route("/run-now",methods=["POST"])
def run_now():
    if not is_running:
        t=threading.Thread(target=run_job,args=("manual",),daemon=True)
        t.start()
    return redirect(url_for("index"))

@app.route("/upload",methods=["GET","POST"])
def upload_page():
    vendors=get_vendors()
    logs=[]
    error=""
    selected_vendor_id=""
    if request.method=="POST":
        selected_vendor_id=request.form.get("vendor_id") or ""
        file=request.files.get("file")
        if not selected_vendor_id:
            error="Vendor is required"
        elif not file or file.filename=="":
            error="File is required"
        else:
            try:
                message_id="upload-"+uuid.uuid4().hex
                payload=file.read()
                full_path,uploaded=save_invoice_file("upload_vendor_"+selected_vendor_id,message_id,file.filename,payload)
                if uploaded:
                    logs.append(f"Saved upload to {full_path}")
                    json_path=ocr_invoice_to_json(full_path)
                    if json_path:
                        logs.append(f"OCR/parse completed; JSON saved to {json_path}")
                        invoice_id=save_invoice_to_db(json_path,full_path,None,message_id,selected_vendor_id)
                        if invoice_id:
                            logs.append(f"Invoice saved to Supabase with id={invoice_id}")
                            matched_po_id=match_invoice(invoice_id)
                            if matched_po_id:
                                logs.append(f"Invoice {invoice_id} matched to PO {matched_po_id}")
                            else:
                                logs.append(f"Invoice {invoice_id} not matched to any PO")
                        else:
                            logs.append("Failed to save invoice to Supabase")
                    else:
                        logs.append("OCR/parse skipped or failed for uploaded file")
                else:
                    logs.append("Upload treated as duplicate; file already exists")
            except Exception as e:
                logs.append(f"Error processing upload: {e}")
    logs_text="\n".join(logs) if logs else ""
    return render_template_string(
        UPLOAD_TEMPLATE,
        vendors=vendors,
        logs=logs_text,
        error=error,
        selected_vendor_id=selected_vendor_id,
    )

# API Routes for Dashboard Frontend
@app.route("/api/dashboard/stats",methods=["GET"])
def api_dashboard_stats():
    """Get dashboard statistics"""
    try:
        stats = get_dashboard_stats(30)
        return jsonify(stats)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/dashboard/graph-data",methods=["GET"])
def api_graph_data():
    """Get graph data for last 30 days"""
    try:
        data = get_graph_data(30)
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/invoices/recent",methods=["GET"])
def api_recent_invoices():
    """Get recent invoices"""
    try:
        limit = request.args.get("limit", default=10, type=int)
        invoices = get_recent_invoices(limit)
        return jsonify(invoices)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/invoices/<invoice_id>",methods=["GET"])
def api_invoice_detail(invoice_id):
    """Get specific invoice details"""
    try:
        invoice = get_invoice_by_id(invoice_id)
        if invoice:
            return jsonify(invoice)
        else:
            return jsonify({"error": "Invoice not found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Vendor API Routes
@app.route("/api/vendors",methods=["GET"])
def api_vendors_list():
    """Get all vendors with detailed information"""
    try:
        vendors = get_all_vendors_detailed()
        return jsonify(vendors)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/vendors/stats",methods=["GET"])
def api_vendor_stats():
    """Get vendor summary statistics"""
    try:
        stats = get_vendor_stats()
        return jsonify(stats)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/vendors/<vendor_id>",methods=["GET"])
def api_vendor_detail(vendor_id):
    """Get detailed vendor information"""
    try:
        vendor = get_vendor_by_id_detailed(vendor_id)
        if vendor:
            return jsonify(vendor)
        else:
            return jsonify({"error": "Vendor not found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/vendors", methods=["POST"])
def api_vendor_create():
    """Create a new vendor."""
    try:
        data = request.get_json(force=True) or {}
        name = (data.get("name") or "").strip()
        tax_id = data.get("taxId") or data.get("tax_id")
        contact = data.get("contact") or data.get("contact_info")
        address = data.get("address")
        if not name:
            return jsonify({"error": "name is required"}), 400
        vendor = create_vendor(name=name, tax_id=tax_id, contact_info=contact, address=address)
        return jsonify(vendor), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route("/api/vendors/<vendor_id>", methods=["DELETE"])
def api_vendor_delete(vendor_id):
    """Delete a vendor and related records."""
    try:
        summary = delete_vendor(vendor_id)
        return jsonify({"deleted": summary})
    except Exception as e:
        return jsonify({"error": str(e)}), 400

# Mentions (typeahead for @)
@app.route("/api/vendors/<vendor_id>/mentions", methods=["GET"])
def api_vendor_mentions(vendor_id):
    try:
        kind = (request.args.get("kind") or "").lower()
        q = (request.args.get("q") or "").strip()
        limit = int(request.args.get("limit", 10))
        with get_conn() as conn:
            with conn.cursor() as cur:
                items = []
                if kind == "pos":
                    cur.execute(
                        """
                        SELECT id, po_number, total_amount, currency
                        FROM purchase_orders
                        WHERE vendor_id=%s AND (%s='' OR po_number ILIKE %s)
                        ORDER BY created_at DESC NULLS LAST, id DESC
                        LIMIT %s
                        """,
                        (vendor_id, q, f"%{q}%", limit)
                    )
                    for row in cur.fetchall():
                        items.append({
                            "id": str(row[0]),
                            "label": row[1] or str(row[0]),
                            "meta": {
                                "amount": float(row[2]) if row[2] else 0.0,
                                "currency": row[3] or "USD",
                            }
                        })
                else:
                    cur.execute(
                        """
                        SELECT id, invoice_number, total_amount, currency, invoice_date
                        FROM invoices
                        WHERE vendor_id=%s AND (%s='' OR invoice_number ILIKE %s)
                        ORDER BY created_at DESC NULLS LAST, id DESC
                        LIMIT %s
                        """,
                        (vendor_id, q, f"%{q}%", limit)
                    )
                    for row in cur.fetchall():
                        items.append({
                            "id": str(row[0]),
                            "label": row[1] or str(row[0]),
                            "meta": {
                                "amount": float(row[2]) if row[2] else 0.0,
                                "currency": row[3] or "USD",
                                "date": row[4].isoformat() if row[4] else None,
                            }
                        })
        return jsonify({"items": items})
    except Exception as e:
        return jsonify({"error": str(e)}), 400

# Chat lifecycle
@app.route("/api/vendors/<vendor_id>/chat/start", methods=["POST"])
def api_chat_start(vendor_id):
    try:
        payload = (request.json or {}) if request.is_json else {}
        title = payload.get("title")
        reuse = payload.get("reuseLatest", True)
        chat_id = None
        if reuse:
            chats = db_list_chats(vendor_id, limit=1)
            if chats:
                chat_id = chats[0]["id"]
        if not chat_id:
            chat_id = db_create_chat(vendor_id, title=title)
        return jsonify({"chatId": chat_id})
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route("/api/vendors/<vendor_id>/chat", methods=["GET"])
def api_chat_list(vendor_id):
    try:
        limit = int(request.args.get("limit", 20))
        items = db_list_chats(vendor_id, limit=limit)
        return jsonify({"chats": items})
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route("/api/vendors/<vendor_id>/chat/<chat_id>/messages", methods=["GET"])
def api_chat_messages_list(vendor_id, chat_id):
    try:
        # enforce vendor scoping
        v = get_chat_vendor(chat_id)
        if v != vendor_id:
            return jsonify({"error": "chat does not belong to vendor"}), 403
        limit = int(request.args.get("limit", 50))
        before = request.args.get("before")
        items = db_list_messages(chat_id, limit=limit, before=before)
        return jsonify({"messages": items})
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route("/api/vendors/<vendor_id>/chat/<chat_id>/messages", methods=["POST"])
def api_chat_send(vendor_id, chat_id):
    try:
        v = get_chat_vendor(chat_id)
        if v != vendor_id:
            return jsonify({"error": "chat does not belong to vendor"}), 403
        data = request.get_json(force=True) or {}
        prompt = data.get("prompt") or ""
        tags = data.get("tags") or {}
        stream = bool(data.get("stream"))
        inv_ids = [i for i in (tags.get("invoices") or []) if i]
        po_ids = [p for p in (tags.get("pos") or []) if p]
        # Always store user message
        db_add_message(chat_id, "user", prompt, tags={"invoices": inv_ids, "pos": po_ids})

        if stream or (request.headers.get('Accept') == 'text/event-stream'):
            # Stream inline (same logic as /stream, but using local prompt/tags)
            def generator():
                full = []
                try:
                    from chat_llm import _get_claude_client, _build_system_prompt, _summarize_invoice as _si, _summarize_po as _sp
                    from vendor_db import get_vendor_by_id_detailed as _get_vendor
                    from invoice_db import get_invoice_by_id as _get_inv
                    from po_db import get_po_by_id as _get_po
                    import json as _json
                    vendor = _get_vendor(vendor_id)
                    system_prompt = _build_system_prompt(vendor or {})
                    client = _get_claude_client()
                    if client is not None:
                        ctx = {"vendor": {"id": vendor_id, "name": (vendor or {}).get("name", "")}, "invoices": [], "pos": []}
                        for _iid in inv_ids or []:
                            try:
                                _inv = _get_inv(_iid)
                                if _inv:
                                    ctx["invoices"].append(_si(_inv))
                            except Exception:
                                pass
                        for _pid in po_ids or []:
                            try:
                                _po = _get_po(_pid)
                                if _po:
                                    ctx["pos"].append(_sp(_po))
                            except Exception:
                                pass
                        user_text = (
                            "Context JSON (use strictly, do not fabricate outside it):\n"
                            + _json.dumps(ctx, ensure_ascii=False)
                            + "\n\nUser Question:\n"
                            + prompt
                        )
                        model = os.getenv("CLAUDE_MODEL", "claude-3-7-sonnet-20250219")
                        with client.messages.stream(
                            model=model,
                            max_tokens=1024,
                            system=system_prompt,
                            messages=[{"role": "user", "content": [{"type": "text", "text": user_text}]}],
                        ) as stream:
                            for event in stream:
                                try:
                                    if getattr(event, "type", "") == "content_block_delta":
                                        delta = getattr(event, "delta", None)
                                        if delta and getattr(delta, "type", "") == "text_delta":
                                            chunk = getattr(delta, "text", "")
                                            if chunk:
                                                full.append(chunk)
                                                yield f"data: {chunk}\n\n"
                                except Exception:
                                    pass
                            # finalize
                            final = stream.get_final_message()
                            final_text_parts = []
                            try:
                                for block in getattr(final, "content", []) or []:
                                    if getattr(block, "type", "") == "text":
                                        final_text_parts.append(getattr(block, "text", ""))
                            except Exception:
                                pass
                            final_text = "".join(final_text_parts)
                            if final_text and (not full or final_text != "".join(full)):
                                extra = final_text[len("".join(full)) :]
                                if extra:
                                    yield f"data: {extra}\n\n"
                            # persist assistant + title
                            try:
                                msg_text = "".join(full) or final_text
                                db_add_message(chat_id, "assistant", msg_text, tags={"invoices": inv_ids, "pos": po_ids})
                                title = generate_chat_title(vendor or {}, prompt, ctx.get("invoices") or [], ctx.get("pos") or [])
                                from chat_db import update_chat_title
                                update_chat_title(chat_id, title)
                            except Exception:
                                pass
                            return
                except Exception:
                    pass

                # Fallback to non-streaming chunking
                text = generate_vendor_response(vendor_id, prompt, invoice_ids=inv_ids or None, po_ids=po_ids or None)
                for i in range(0, len(text), 80):
                    chunk = text[i:i+80]
                    full.append(chunk)
                    yield f"data: {chunk}\n\n"
                try:
                    db_add_message(chat_id, "assistant", "".join(full), tags={"invoices": inv_ids, "pos": po_ids})
                except Exception:
                    pass

            return Response(stream_with_context(generator()), mimetype='text/event-stream')

        # Non-streaming path
        reply = generate_vendor_response(vendor_id, prompt, invoice_ids=inv_ids or None, po_ids=po_ids or None)
        db_add_message(chat_id, "assistant", reply, tags={"invoices": inv_ids, "pos": po_ids})

        # Try to assign a title if missing
        try:
            from vendor_db import get_vendor_by_id_detailed as _get_vendor
            from invoice_db import get_invoice_by_id as _get_inv
            from po_db import get_po_by_id as _get_po
            vendor = _get_vendor(vendor_id) or {}
            invs = []
            pos_list = []
            for _iid in inv_ids:
                try:
                    ii = _get_inv(_iid)
                    if ii: invs.append(ii)
                except Exception:
                    pass
            for _pid in po_ids:
                try:
                    pp = _get_po(_pid)
                    if pp: pos_list.append(pp)
                except Exception:
                    pass
            title = generate_chat_title(vendor, prompt, invs, pos_list)
            from chat_db import update_chat_title
            update_chat_title(chat_id, title)
        except Exception:
            pass

        return jsonify({"reply": reply})
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route("/api/vendors/<vendor_id>/chat/<chat_id>/stream", methods=["POST","GET"])
def api_chat_stream(vendor_id, chat_id):
    """Stream assistant reply token-by-token (SSE-like)."""
    try:
        v = get_chat_vendor(chat_id)
        if v != vendor_id:
            return jsonify({"error": "chat does not belong to vendor"}), 403
        if request.method == "GET":
            prompt = request.args.get("prompt", "")
            inv_ids = request.args.getlist("inv")
            po_ids = request.args.getlist("po")
        else:
            data = request.get_json(force=True) or {}
            prompt = data.get("prompt") or ""
            tags = data.get("tags") or {}
            inv_ids = [i for i in (tags.get("invoices") or []) if i]
            po_ids = [p for p in (tags.get("pos") or []) if p]

        # store user message immediately
        db_add_message(chat_id, "user", prompt, tags={"invoices": inv_ids, "pos": po_ids})

        def generate():
            full = []
            # Try Claude streaming if configured
            try:
                from chat_llm import _get_claude_client, _build_system_prompt, _summarize_invoice as _si, _summarize_po as _sp
                from vendor_db import get_vendor_by_id_detailed as _get_vendor
                from invoice_db import get_invoice_by_id as _get_inv
                from po_db import get_po_by_id as _get_po
                import json as _json
                vendor = _get_vendor(vendor_id)
                if vendor:
                    system_prompt = _build_system_prompt(vendor)
                else:
                    system_prompt = "You are a vendor-scoped assistant."
                client = _get_claude_client()
                if client is not None:
                    # assemble context with tagged entities
                    ctx = {
                        "vendor": {
                            "id": vendor.get("id") if vendor else vendor_id,
                            "name": vendor.get("name") if vendor else "",
                        },
                        "invoices": [],
                        "pos": [],
                    }
                    for _iid in inv_ids or []:
                        try:
                            _inv = _get_inv(_iid)
                            if _inv:
                                ctx["invoices"].append(_si(_inv))
                        except Exception:
                            pass
                    for _pid in po_ids or []:
                        try:
                            _po = _get_po(_pid)
                            if _po:
                                ctx["pos"].append(_sp(_po))
                        except Exception:
                            pass
                    user_text = (
                        "Context JSON (use strictly, do not fabricate outside it):\n"
                        + _json.dumps(ctx, ensure_ascii=False)
                        + "\n\nUser Question:\n"
                        + prompt
                    )
                    model = os.getenv("CLAUDE_MODEL", "claude-3-7-sonnet-20250219")
                    with client.messages.stream(
                        model=model,
                        max_tokens=1024,
                        system=system_prompt,
                        messages=[{"role": "user", "content": [{"type": "text", "text": user_text}]}],
                    ) as stream:
                        for event in stream:
                            try:
                                if getattr(event, "type", "") == "content_block_delta":
                                    delta = getattr(event, "delta", None)
                                    if delta and getattr(delta, "type", "") == "text_delta":
                                        chunk = getattr(delta, "text", "")
                                        if chunk:
                                            full.append(chunk)
                                            yield f"data: {chunk}\n\n"
                            except Exception:
                                pass
                        final = stream.get_final_message()
                        final_text_parts = []
                        try:
                            for block in getattr(final, "content", []) or []:
                                if getattr(block, "type", "") == "text":
                                    final_text_parts.append(getattr(block, "text", ""))
                        except Exception:
                            pass
                        final_text = "".join(final_text_parts)
                        if final_text and (not full or final_text != "".join(full)):
                            # Append any trailing content not streamed
                            extra = final_text[len("".join(full)) :]
                            if extra:
                                yield f"data: {extra}\n\n"
                        # persist assistant message & set title if missing
                        try:
                            msg_text = "".join(full) or final_text
                            db_add_message(chat_id, "assistant", msg_text, tags={"invoices": inv_ids, "pos": po_ids})
                            # title
                            from chat_db import update_chat_title
                            title = generate_chat_title(vendor or {}, prompt, ctx.get("invoices") or [], ctx.get("pos") or [])
                            update_chat_title(chat_id, title)
                        except Exception:
                            pass
                        return
            except Exception:
                pass

            # Fallback: non-streaming generation chunked
            text = generate_vendor_response(vendor_id, prompt, invoice_ids=inv_ids or None, po_ids=po_ids or None)
            for i in range(0, len(text), 80):
                chunk = text[i:i+80]
                full.append(chunk)
                yield f"data: {chunk}\n\n"
            try:
                db_add_message(chat_id, "assistant", "".join(full), tags={"invoices": inv_ids, "pos": po_ids})
            except Exception:
                pass

        headers = {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
        return Response(stream_with_context(generate()), headers=headers)
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route("/api/invoices/exceptions", methods=["GET"])
def api_exception_invoices():
    """Get exception invoices (unmatched, vendor_mismatch, needs_review)"""
    try:
        vendor_id = request.args.get("vendor_id") or request.args.get("vendorId")
        limit = request.args.get("limit", default=100, type=int)
        status = request.args.get("status")
        items = get_exception_invoices(vendor_id=vendor_id, limit=limit, status=status)
        return jsonify(items)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Purchase Order API Route
@app.route("/api/purchase-orders/<po_id>", methods=["GET"])
def api_purchase_order_detail(po_id):
    """Get detailed purchase order information"""
    try:
        po = get_po_detail(po_id)
        if po:
            return jsonify(po)
        else:
            return jsonify({"error": "Purchase order not found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Payable invoices
@app.route("/api/invoices/payable", methods=["GET"])
def api_invoices_payable():
    try:
        vendor_id = request.args.get("vendor_id") or request.args.get("vendorId")
        currency = request.args.get("currency")
        limit = request.args.get("limit", default=200, type=int)
        items = get_payable_invoices(vendor_id=vendor_id, currency=currency, limit=limit)
        return jsonify(items)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Create PaymentIntent
@app.route("/api/payments/create-intent", methods=["POST"])
def api_create_payment_intent():
    try:
        data = request.get_json(force=True)
        invoice_ids = data.get("invoiceIds") or []
        customer = data.get("customer") or {}
        currency = data.get("currency")
        save_method = bool(data.get("saveMethod"))
        result = create_payment_intent_for_invoices(invoice_ids, customer, currency, save_method)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route("/api/payments/confirm", methods=["POST"])
def api_confirm_payment():
    """Client-driven confirmation to finalize payment without webhooks.
       Verifies with Stripe and marks invoices paid if succeeded.
    """
    try:
        data = request.get_json(force=True)
        pi_id = data.get("paymentIntentId")
        if not pi_id:
            return jsonify({"error": "paymentIntentId is required"}), 400
        result = confirm_payment_intent(pi_id)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route("/api/payments/cancel", methods=["POST"])
def api_cancel_payment():
    """Revert invoices to previous status for a failed/canceled payment intent (no webhook)."""
    try:
        data = request.get_json(force=True)
        pi_id = data.get("paymentIntentId")
        if not pi_id:
            return jsonify({"error": "paymentIntentId is required"}), 400
        mark_payment_failed_or_canceled(pi_id)
        return jsonify({"status": "reverted"})
    except Exception as e:
        return jsonify({"error": str(e)}), 400

def start_scheduler():
    scheduler=BackgroundScheduler(daemon=True)
    scheduler.add_job(run_job,"interval",seconds=CHECK_INTERVAL_SECONDS)
    scheduler.start()

if __name__=="__main__":
    start_scheduler()
    app.run(host="127.0.0.1",port=int(os.getenv("PORT","5000")),debug=False)
