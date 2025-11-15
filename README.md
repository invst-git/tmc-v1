# The Matching Company
# TMC-v1: Enterprise Invoice Processing System

An automated accounts payable system that processes invoices from email attachments, extracts structured data, matches against purchase orders, and manages vendor payments.

## Overview

TMC-v1 transforms the traditional invoice processing workflow by automating every step from email intake to payment. The system monitors email accounts for invoice attachments, extracts invoice data with high accuracy, matches invoices to purchase orders, flags exceptions, and processes payments through Stripe integration.

This is a real solution to a real problem. Companies receive hundreds or thousands of invoices every month through email. Each invoice needs to be opened, reviewed, data entered into the system, matched to purchase orders, approved, and paid. This manual process takes days of employee time and introduces errors at every step.

## The Foundation: Landing AI OCR

The entire project stands on the accuracy and reliability of Landing AI's Document Processing Engine. Without Landing AI, this system would not work in production.

### Why Landing AI Makes This Possible

Invoice processing has always been difficult because invoices come in every format imaginable. Different vendors use different templates, different languages, different layouts. Some invoices are cleanly formatted PDFs generated from accounting software. Others are scanned images of handwritten forms or faxed documents that have been photocopied multiple times.

Traditional OCR tools fail on this variety. They might work well on one vendor's invoices but completely miss critical fields on another vendor's format. They struggle with tables, with multi-line addresses, with tax calculations that span multiple rows.

Landing AI handles all of this. The system processes invoices from vendors we have never seen before and extracts the data correctly. It understands that an invoice number might be called "Invoice #" or "Inv No." or "Factura" depending on the vendor. It recognizes line items even when they are formatted as tables, as lists, or as unstructured text blocks.

### How We Use Landing AI

The OCR integration is straightforward but powerful. When an invoice file arrives, we pass it to Landing AI's Document Processing Engine with our schema definition:

def ocr_invoice_to_json(invoice_path: str) -> str | None:
client = LandingAIADE()
parse_response = client.parse(document=path, model="dpt-2-latest")
schema = pydantic_to_json_schema(InvoiceExtract)
extract_response = client.extract(schema=schema, markdown=parse_response.markdown)
return extract_json_path

text

Landing AI returns structured JSON with every field we need. Vendor name, tax ID, invoice number, date, line items with quantities and prices, totals, payment terms, everything. The accuracy is consistently high across different invoice formats.

### The Schema: What We Extract

Our invoice schema defines exactly what we need from every invoice:

- **Vendor information**: name, tax ID, address
- **Invoice metadata**: invoice number, date, due date, PO reference
- **Financial details**: currency, subtotal, tax, shipping, discounts, total
- **Line items**: description, SKU, quantity, unit price, line totals, PO line references
- **Payment information**: bank account, SWIFT code, remittance reference

Landing AI fills all of these fields from the raw invoice document. The system handles complex scenarios like multi-page invoices, invoices with embedded tables, invoices in different currencies, invoices with partial line-item matches to purchase orders.

### Real-World Impact

Here is what Landing AI's accuracy means in practice:

**Time Savings**: A typical company processing 500 invoices per month spends approximately 15 minutes per invoice on manual data entry and verification. That is 125 hours per month, or roughly three full-time employees. With automated extraction, that drops to perhaps 2 minutes per invoice for exception handling, saving over 100 hours monthly.

**Error Reduction**: Manual data entry has an error rate of 1-3% even with careful operators. On 500 invoices with an average of 20 data points each, that means 100-300 errors per month. These errors cause payment delays, vendor relationship issues, and accounting reconciliation problems. Automated extraction reduces errors to near zero.

**Faster Payment Cycles**: Manual processing means invoices sit in queues waiting for data entry. With automated extraction, invoices are processed within minutes of arrival. Vendors get paid faster, early payment discounts can be captured, and cash flow is more predictable.

**Scale Without Headcount**: As companies grow and invoice volume increases, they typically need to hire more AP staff. With automation, the same small team can handle 500 invoices or 5000 invoices without proportional headcount growth.

### Why This Matters

Invoice processing is a solved problem on the extraction side because of Landing AI. The technology works reliably in production. This is not a prototype or a concept demonstration. This is a system that can handle real invoice volume from real vendors tomorrow.

The accuracy of Landing AI's extraction is what makes the entire automated workflow possible. Purchase order matching depends on correctly extracted PO numbers and totals. Payment processing depends on correctly extracted bank details and amounts. Exception handling depends on having reliable data to flag mismatches. Every downstream feature in this system depends on the quality of the OCR layer.

Landing AI has made enterprise invoice processing automatable. That is the foundation this project builds on.

## Gallery
### Dashboard Overview
<img width="1917" height="967" alt="Image" src="https://github.com/user-attachments/assets/379dd774-3ce8-4e3d-94b6-1b4cbf567c95" />

### Vendors
<img width="1917" height="970" alt="Image" src="https://github.com/user-attachments/assets/2c99ad29-c991-4c5c-ba7b-22b844de1838" />

### Invoice - As a PDF
<img width="718" height="858" alt="Image" src="https://github.com/user-attachments/assets/eb06e223-2007-40ab-8ce9-7bd2149f6c01" />

### Invoice - Post OCR (Shoutout to LandingAI's DPT2)
<img width="1914" height="967" alt="Image" src="https://github.com/user-attachments/assets/a64c30df-fe82-4a6a-816f-5a24182979ff" />

### Chat Interface (Vendor Specific - Invoice & PO tagged)
<img width="1919" height="971" alt="Image" src="https://github.com/user-attachments/assets/dd9fb1df-bb45-4cc0-94b4-8aa16b389f50" />

### Exception Invoices (Flagged when there is no matching PO - likely fraud)
<img width="1919" height="971" alt="Image" src="https://github.com/user-attachments/assets/9492062b-67a6-44dc-afe7-55dd61c77803" />

### Payments (Once automatched - approved for payment)
<img width="1919" height="967" alt="Image" src="https://github.com/user-attachments/assets/4203a443-a6ee-4526-997b-e4609278763a" />

## Architecture

### Backend (Python/Flask)

The backend handles all the processing logic:

- **Email monitoring**: IMAP client that checks configured email accounts on a schedule
- **Document storage**: Local file storage with organized vendor directories
- **OCR processing**: Landing AI integration for invoice data extraction
- **Database operations**: PostgreSQL for all structured data (invoices, POs, vendors, payments)
- **PO matching**: Automated matching logic with tolerance thresholds
- **Payment processing**: Stripe integration for vendor payments
- **Chat/AI assistance**: Claude integration for vendor-scoped queries about invoices and POs

### Frontend (React)

The web interface provides:

- **Dashboard**: Overview stats, graphs, recent invoices
- **Invoice management**: View, search, and manage all invoices
- **Exception handling**: Review and resolve unmatched invoices
- **Vendor management**: Vendor profiles with invoice history
- **Payment interface**: Select invoices and process batch payments
- **Chat interface**: AI assistant for querying invoice and PO data

### Database Schema

- **invoices**: All invoice records with extracted fields
- **purchase_orders**: PO records for matching
- **vendors**: Vendor master data
- **payments**: Payment transaction history
- **chats/messages**: Vendor-scoped conversation history

## Features

### Automated Email Intake

The system monitors email accounts and automatically downloads invoice attachments from configured vendor addresses. It identifies invoice files by content type and filename patterns, stores them in organized directories, and queues them for processing.

### Intelligent Document Processing

Landing AI OCR extracts all relevant data from invoice PDFs and images. The system handles invoices in multiple formats, currencies, and languages. Line items are extracted with full detail including quantities, prices, and SKU references.

### Purchase Order Matching

Invoices are automatically matched to open purchase orders based on PO number, vendor, currency, and amount. The matching algorithm uses configurable tolerance thresholds to handle expected variations in shipping charges or partial deliveries.

### Exception Management

Unmatched invoices, vendor mismatches, and invoices requiring manual review are flagged with specific status codes. The frontend provides tools to review exceptions, view source documents, and manually resolve issues.

### Integrated Payments

The payment module integrates with Stripe to process vendor payments. Users can select multiple invoices, review totals by currency, and initiate payment with customer billing details. Payment status updates flow back to invoice records.

### Vendor Chat Assistant

Each vendor has a chat interface powered by Claude. The AI assistant can answer questions about specific invoices, PO status, payment history, and vendor statistics. The chat uses @ mentions to reference specific invoices or POs, providing context-aware responses.

## Installation

### Prerequisites

- Python 3.10+
- Node.js 16+
- PostgreSQL database
- Landing AI API key
- Stripe account (for payments)
- Claude API key (for chat features)

### Backend Setup

Install Python dependencies
pip install -r requirements.txt

Create .env file with required configuration
VISION_AGENT_API_KEY=your_landing_ai_key
IMAP_HOST=your_email_host
EMAIL_USERNAME=your_email
EMAIL_PASSWORD=your_password
DATABASE_URL=postgresql://user:pass@host/db
STRIPE_API_KEY=your_stripe_key
ANTHROPIC_API_KEY=your_claude_key
CHECK_INTERVAL_SECONDS=300

text

### Frontend Setup

cd frontend
npm install
npm start

text

### Database Migration

The system includes Alembic migrations for database schema management. Run migrations with:

alembic upgrade head

text

## Configuration

### Email Settings

Configure IMAP connection details and target sender addresses in `.env`:

IMAP_HOST=imap.gmail.com
IMAP_PORT=993
EMAIL_USERNAME=ap@company.com
EMAIL_PASSWORD=app_password
TARGET_SENDERS=vendor1@example.com,vendor2@example.com

text

### Landing AI Settings

Landing AI configuration uses the DPT-2 model by default:

VISION_AGENT_API_KEY=your_api_key
ADE_MODEL=dpt-2-latest
ADE_ENVIRONMENT=production

text

### Matching Tolerances

Purchase order matching uses configurable thresholds:

amount_tolerance = 1.0 # absolute amount difference allowed
percent_tolerance = 0.02 # 2% variance allowed

text

## API Endpoints

### Invoices

- `GET /api/invoices/recent?limit=10` - Recent invoices
- `GET /api/invoices/<id>` - Invoice detail
- `GET /api/invoices/exceptions` - Exception invoices
- `GET /api/invoices/payable` - Payable invoices

### Vendors

- `GET /api/vendors` - All vendors with stats
- `GET /api/vendors/<id>` - Vendor detail
- `POST /api/vendors` - Create vendor
- `DELETE /api/vendors/<id>` - Delete vendor

### Payments

- `POST /api/payments/create-intent` - Create Stripe payment intent
- `POST /api/payments/confirm` - Confirm payment
- `POST /api/payments/cancel` - Cancel payment

### Chat

- `POST /api/vendors/<id>/chat/start` - Start or resume chat
- `GET /api/vendors/<id>/chat` - List chats for vendor
- `GET /api/vendors/<id>/chat/<chat_id>/messages` - Get messages
- `POST /api/vendors/<id>/chat/<chat_id>/messages` - Send message

## Usage

### Processing Invoices Manually

Use the upload interface to manually process an invoice:

1. Navigate to `/upload`
2. Select the vendor from the dropdown
3. Choose the invoice file
4. Upload and process

The system will extract invoice data with Landing AI, save it to the database, and attempt to match it to an open purchase order.

### Reviewing Exceptions

Exception invoices appear in the dashboard and can be filtered by status:

- `unmatched`: No matching PO found
- `vendor_mismatch`: Invoice vendor does not match PO vendor
- `needs_review`: Manual review required

### Processing Payments

Select invoices for payment in the vendor or payment interface. The system groups invoices by currency and creates a Stripe payment intent. After customer approval and payment completion, invoice status updates to `paid`.

```text
# Project Structure

tmc-v1/
├── app.py                  # Main Flask application
├── ocr_landingai.py        # Landing AI OCR integration
├── invoice_schema.py       # Pydantic schema for invoice extraction
├── invoice_db.py           # Invoice database operations
├── po_matching.py          # Purchase order matching logic
├── email_client.py         # Email intake and processing
├── vendor_db.py            # Vendor management
├── payments.py             # Stripe payment integration
├── chat_db.py              # Chat persistence
├── chat_llm.py             # Claude chat integration
├── frontend/               # React web interface
│   ├── src/
│   │   ├── pages/          # Main application pages
│   │   ├── components/     # Reusable UI components
│   │   └── lib/            # Utilities and API client
│   └── package.json
└── requirements.txt        # Python dependencies
```


## Development

### Running Locally

Start the backend:

python app.py

text

Start the frontend:

cd frontend
npm start

text

The application runs on `http://localhost:3000` with API backend on `http://localhost:5000`.

### Testing

The system includes invoice detector tests and can be tested with sample invoices from various vendors.

## License

MIT License - see LICENSE file for details.

---

Built with Landing AI Document Processing Engine for accurate, reliable invoice data extraction at scale.
