INVOICE_KEYWORDS = [
    "invoice",
    "tax invoice",
    "gst invoice",
    "receipt",
    "bill",
    "billing",
    "statement",
    "payment",
    "order confirmation",
    "order summary",
]
def is_invoice_attachment(subject: str, filename: str, content_type: str) -> bool:
    """
    Decide if an attachment is likely an invoice.

    We check:
    - keywords in subject + filename + content-type
    - common invoice file types (PDF, DOCX, images)
    """

    subject = (subject or "").lower()
    filename = (filename or "").lower()
    content_type = (content_type or "").lower()

    combined = f"{subject} {filename} {content_type}"

    for kw in INVOICE_KEYWORDS:
        if kw in combined:
            return True
    if content_type.startswith("application/pdf") or filename.endswith(".pdf"):
        return True
    if content_type.startswith("image/"):
        return True
    if "wordprocessingml.document" in content_type or filename.endswith((".doc", ".docx")):
        return True

    return False
