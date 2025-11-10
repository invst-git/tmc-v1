# The Matching Company - Automate Enterprise Invoice Processing


## Features

- **Dashboard Overview**: View key metrics including invoices processed, total amounts, and time saved
- **Interactive Charts**: Visualize invoice processing trends over the last 30 days
- **Recent Invoices**: Browse and filter recent invoices with status indicators
- **Invoice Details**: View detailed information for any invoice in a modal dialog
- **Real-time Data**: Connects to Flask backend API for live invoice data

## Tech Stack

- **React** 18.2 - UI framework
- **React Router** - Client-side routing
- **Tailwind CSS** - Utility-first styling
- **shadcn/ui** - UI component library
- **Lucide React** - Icon library
- **CRACO** - Custom React App Configuration

## Project Structure

```
frontend/
├── public/
│   └── index.html           # HTML template
├── src/
│   ├── components/
│   │   ├── ui/
│   │   │   └── dialog.jsx   # Dialog component (shadcn)
│   │   ├── InvoiceDetailModal.jsx
│   │   ├── LineChart.jsx
│   │   └── Sidebar.jsx
│   ├── lib/
│   │   └── utils.js         # Utility functions
│   ├── pages/
│   │   └── Dashboard.jsx    # Main dashboard page
│   ├── services/
│   │   └── api.js           # API service layer
│   ├── App.css
│   ├── App.js               # Main app component
│   ├── index.css            # Global styles + Tailwind
│   └── index.js             # Entry point
├── components.json          # shadcn/ui config
├── craco.config.js          # CRACO config (@ alias)
├── jsconfig.json            # JS path config
├── package.json
├── postcss.config.js        # PostCSS config
└── tailwind.config.js       # Tailwind config
```

## Setup Instructions

### Prerequisites

- Node.js 16+ and npm
- Flask backend running on `http://localhost:5000`

### Installation

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm start
   ```

4. Open your browser to [http://localhost:3000](http://localhost:3000)

### Build for Production

```bash
npm run build
```

This creates an optimized production build in the `build/` directory.

## API Integration

The frontend connects to the Flask backend via the following API endpoints:

- `GET /api/dashboard/stats` - Dashboard statistics
- `GET /api/dashboard/graph-data` - 30-day graph data
- `GET /api/invoices/recent?limit=10` - Recent invoices list
- `GET /api/invoices/:id` - Invoice details by ID

The API base URL is configured via the `proxy` field in `package.json` (defaults to `http://localhost:5000`).

## Invoice Status Types

- **Matched** (`matched_auto`) - Invoice automatically matched to a PO
- **Unmatched** (`unmatched`) - No matching PO found
- **Mismatch** (`vendor_mismatch`) - Vendor information doesn't match
- **Needs Review** (`needs_review`) - Manual review required

## Development

### Available Scripts

- `npm start` - Start development server
- `npm run build` - Build for production
- `npm test` - Run tests
- `npm run eject` - Eject from Create React App (one-way operation)

### Adding New Components

This project uses shadcn/ui components. To add a new component:

```bash
npx shadcn-ui@latest add [component-name]
```

### Path Aliases

The `@` alias is configured to point to the `src/` directory:

```javascript
import Component from '@/components/Component';
```

## Troubleshooting

### Backend Connection Issues

If you see "Failed to fetch" errors, ensure:
1. The Flask backend is running on port 5000
2. CORS is properly configured (if needed)
3. The proxy setting in `package.json` is correct

### Build Errors

If you encounter build errors:
1. Delete `node_modules/` and run `npm install` again
2. Clear the cache: `npm cache clean --force`
3. Check Node.js version compatibility

## License

Nitish Dandu
=====================================================

This project automates invoice intake, OCR and field extraction, database persistence, PO matching, exception handling, and payment preparation. It consists of a Flask backend, a React frontend, and a PostgreSQL database. Email intake via IMAP fetches invoices, Landing AI performs OCR and structured extraction, and invoices are stored and matched against purchase orders. Stripe is integrated for payment flows.

Landing AI OCR: The Centerpiece
--------------------------------

Landing AI is the core of this application. Good extraction is the difference between a fragile prototype and something a finance or operations team can actually trust. With Landing AI’s consistent extraction and schema‑driven output, the rest of the system becomes straightforward: cleaner inputs yield fewer exceptions, more confident matches, and faster approvals.

- Why it matters
  - Invoices are messy and inconsistent. Without reliable OCR, every step downstream—vendor association, PO matching, exception resolution—turns into manual clean‑up.
  - Landing AI closes that gap by producing structured fields that map cleanly into our schema, so persistence and matching remain simple.

- How it’s used here
  - The backend calls Landing AI ADE to parse and then extract:
    - Parse creates a markdown‑backed representation and a `.parse.json` file.
    - Extract uses a Pydantic schema (InvoiceExtract) to produce a clean `.fields.json` with header and line items.
  - Those extracted fields flow directly into the database insert step. We avoid brittle, ad‑hoc mappings and keep data fidelity high.

- Impact on exceptions and matches
  - Cleaner header fields (vendor name/tax ID, currency, totals, PO number) reduce “unmatched” and “vendor_mismatch” statuses.
  - Accurate line‑level data (items, qty, unit price) supports better analytics and targeted exception handling.

- Real effect on time savings
  - The project is configured around the idea that faster, reliable extraction leads to meaningful cycle‑time reductions. The dashboard highlights an average of 8.5 days saved per invoice (configurable). The exact number will vary by organization, but this reflects the compound benefit of fewer exceptions and faster approvals.

- Configuration knobs
  - `ADE_MODEL` (default `dpt-2-latest`), `ADE_ENVIRONMENT`, and `VISION_AGENT_API_KEY` control the model and runtime.
  - The extraction schema is defined in the backend and can evolve as your needs do—adding fields to the schema is the right way to capture new data.

- Reliability in real workflows
  - If OCR fails or a file is malformed, the system logs the issue and continues safely. Persistence/matching only proceeds when extraction is available. That straightforward, auditable flow is what makes the app practical for teams.

In short: Landing AI is what makes this project possible. It turns a notoriously messy problem—invoice variability—into a reliable pipeline step that everything else builds on. The outcome is fewer exceptions, more matches, and genuine time saved.

Process Flow
------------

1. Email intake (IMAP)
   - Search messages in a lookback window, filter likely invoices, skip duplicates/oversized attachments.
2. Local storage/Cloud
   - Save attachments under `invoices/YYYY/MM/DD/<sender>/<message-id>/<filename>`.
3. Landing AI OCR & extraction
   - Parse to `.parse.json`; extract using the invoice schema to `.fields.json`.
4. Database persistence
   - Insert invoice header and lines; create or map vendor by name/tax ID; set initial status.
5. PO matching
   - Match by PO number, vendor, currency, and total tolerance; mark as `matched_auto` when confident.
6. Exceptions & dashboards
   - Exceptions view (unmatched, vendor_mismatch, needs_review); dashboard with counts, amounts, and trends.
7. Payments (Stripe)
   - List payable invoices and create/confirm PaymentIntents; update statuses to paid or revert as needed.
8. Vendor & PO views
   - Vendor activity, purchases, and invoices with detail modals.

Running Locally
---------------

Backend (Flask):

- Create a `.env` with IMAP, Landing AI, DB, and Stripe variables.
- Apply database migrations (payments + chat tables are included in migrations/).
- Start the server: `python app.py` (default http://127.0.0.1:5000).

Frontend (React):

- In `frontend/` run `npm install` and `npm start` (defaults to http://localhost:3000).
- CRA proxy points to the backend at `http://localhost:5000`.

Configuration (selected)
------------------------

- Backend `.env`
  - IMAP: `IMAP_HOST`, `IMAP_PORT`, `EMAIL_USERNAME`, `EMAIL_PASSWORD`, `TARGET_SENDERS`
  - App: `CHECK_INTERVAL_SECONDS`, `FLASK_SECRET_KEY`, `PORT`, `LOCAL_INVOICE_DIR`
  - Landing AI: `VISION_AGENT_API_KEY`, `ADE_ENVIRONMENT`, `ADE_MODEL`
  - Database: `DATABASE_URL`
  - Stripe: `STRIPE_SECRET_KEY`
  - Dashboard assumptions: `AVG_DAYS_SAVED_PER_INVOICE` (default 8.5), `EXCEPTION_TIME_SAVED_HOURS_PER_INVOICE`

- Frontend `.env`
  - `REACT_APP_API_URL` (optional; defaults to `/api`)
  - `REACT_APP_STRIPE_PUBLISHABLE_KEY`

API Highlights
--------------

- Dashboard: `/api/dashboard/stats`, `/api/dashboard/graph-data`
- Invoices: `/api/invoices/recent`, `/api/invoices/:id`, `/api/invoices/exceptions`, `/api/invoices/payable`
- Vendors: `/api/vendors`, `/api/vendors/stats`, `/api/vendors/:vendorId`, create/delete vendor
- POs: `/api/purchase-orders/:poId`
- Payments (Stripe): create/confirm/cancel intents
- Chat (vendor‑scoped): start/list chats, list messages, send messages (supports streaming), mentions for `@` typeahead

Security & Privacy
------------------

- Do not commit `.env` files or invoice data (`invoices/` is ignored).
- Use secret management for IMAP, DB, Stripe, and Landing AI keys.
- OCR artifacts (parse and fields JSON) are kept locally for auditability but should not be checked in.

Troubleshooting
---------------

- OCR/extraction missing: verify `VISION_AGENT_API_KEY`, model/env vars, and that the local file exists.
- Matching off: check currency, totals, and vendor identifiers; adjust tolerance if needed.
- Payments: confirm migrations are applied and keys are set; review backend logs for Stripe errors.

Acknowledgements
----------------

This project leans heavily on Landing AI’s OCR and extraction quality. That step is what makes the pipeline dependable and lets the rest of the system remain simple. With fewer exceptions and solid line‑level data, companies can actually save days in invoice processing rather than fighting the same paperwork over and over.
