// API Service for The Matching Company Dashboard
// Connects to Flask backend at http://localhost:5000 (via CRA proxy) or custom base via REACT_APP_API_URL

const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

// Helper function to handle API responses
const handleResponse = async (response) => {
  if (!response.ok) {
    // try to parse JSON error; fallback to text
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const error = await response.json().catch(() => ({ message: 'An error occurred' }));
      throw new Error(error.error || error.message || `HTTP error! status: ${response.status}`);
    }
    const text = await response.text().catch(() => 'An error occurred');
    throw new Error(text || `HTTP error! status: ${response.status}`);
  }
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return response.json();
  return response.text();
};

// Extract <pre>...</pre> content from HTML returned by Flask templates
const extractLogsFromHtml = (html) => {
  if (!html) return '';
  const match = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
  if (!match) return '';
  // Basic HTML entity decoding for common cases
  let text = match[1]
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
  return text.trim();
};

// Fetch dashboard statistics
export const fetchDashboardStats = async () => {
  const response = await fetch(`${API_BASE_URL}/dashboard/stats`);
  return await handleResponse(response);
};

// Fetch graph data for last 30 days
export const fetchGraphData = async () => {
  const response = await fetch(`${API_BASE_URL}/dashboard/graph-data`);
  return await handleResponse(response);
};

// Fetch recent invoices
export const fetchRecentInvoices = async (limit = 10) => {
  const response = await fetch(`${API_BASE_URL}/invoices/recent?limit=${limit}`);
  return await handleResponse(response);
};

// Fetch single invoice by ID (includes extended fields)
export const fetchInvoiceById = async (invoiceId) => {
  const response = await fetch(`${API_BASE_URL}/invoices/${invoiceId}`);
  return await handleResponse(response);
};

// Fetch all vendors
export const fetchVendors = async () => {
  const response = await fetch(`${API_BASE_URL}/vendors`);
  return await handleResponse(response);
};

// Fetch vendor statistics
export const fetchVendorStats = async () => {
  const response = await fetch(`${API_BASE_URL}/vendors/stats`);
  return await handleResponse(response);
};

// Fetch single vendor by ID (now includes purchase orders and invoice list)
export const fetchVendorById = async (vendorId) => {
  const response = await fetch(`${API_BASE_URL}/vendors/${vendorId}`);
  return await handleResponse(response);
};

// Create vendor
export const createVendor = async ({ name, taxId, contact, address }) => {
  const response = await fetch(`${API_BASE_URL}/vendors`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, taxId, contact, address })
  });
  return await handleResponse(response);
};

// Delete vendor and related records
export const deleteVendor = async (vendorId) => {
  const response = await fetch(`${API_BASE_URL}/vendors/${vendorId}`, { method: 'DELETE' });
  return await handleResponse(response);
};

// Mentions typeahead for @
export const fetchVendorMentions = async ({ vendorId, kind = 'invoices', q = '', limit = 10 }) => {
  const params = new URLSearchParams();
  params.set('kind', kind);
  if (q) params.set('q', q);
  params.set('limit', String(limit));
  const response = await fetch(`${API_BASE_URL}/vendors/${vendorId}/mentions?${params.toString()}`);
  return await handleResponse(response);
};

// Chat lifecycle
export const startVendorChat = async ({ vendorId, title, reuseLatest = true }) => {
  const response = await fetch(`${API_BASE_URL}/vendors/${vendorId}/chat/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: title || undefined, reuseLatest })
  });
  return await handleResponse(response);
};

export const getVendorChatMessages = async ({ vendorId, chatId, limit = 50, before }) => {
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  if (before) params.set('before', before);
  const response = await fetch(`${API_BASE_URL}/vendors/${vendorId}/chat/${chatId}/messages?${params.toString()}`);
  return await handleResponse(response);
};

export const sendVendorChatMessage = async ({ vendorId, chatId, prompt, tags }) => {
  const response = await fetch(`${API_BASE_URL}/vendors/${vendorId}/chat/${chatId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, tags })
  });
  return await handleResponse(response);
};

export const listVendorChats = async ({ vendorId, limit = 20 }) => {
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  const response = await fetch(`${API_BASE_URL}/vendors/${vendorId}/chat?${params.toString()}`);
  return await handleResponse(response);
};

// Fetch single purchase order by ID
export const fetchPurchaseOrderById = async (poId) => {
  const response = await fetch(`${API_BASE_URL}/purchase-orders/${poId}`);
  return await handleResponse(response);
};

// Fetch exception invoices with optional filters
export const fetchExceptionInvoices = async ({ vendorId, status, limit = 100 } = {}) => {
  const params = new URLSearchParams();
  if (vendorId) params.set('vendor_id', vendorId);
  if (status) params.set('status', status);
  if (limit) params.set('limit', String(limit));
  const response = await fetch(`${API_BASE_URL}/invoices/exceptions?${params.toString()}`);
  return await handleResponse(response);
};

// Fetch payable invoices (eligible for payment)
export const fetchPayableInvoices = async ({ vendorId, currency, limit = 200 } = {}) => {
  const params = new URLSearchParams();
  if (vendorId) params.set('vendor_id', vendorId);
  if (currency) params.set('currency', currency);
  if (limit) params.set('limit', String(limit));
  const response = await fetch(`${API_BASE_URL}/invoices/payable?${params.toString()}`);
  return await handleResponse(response);
};

// Create a Stripe PaymentIntent for selected invoices
export const createPaymentIntent = async ({ invoiceIds, currency, customer, saveMethod }) => {
  const response = await fetch(`/api/payments/create-intent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ invoiceIds, currency, customer, saveMethod })
  });
  return await handleResponse(response);
};

export const confirmPayment = async ({ paymentIntentId }) => {
  const response = await fetch(`/api/payments/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paymentIntentId })
  });
  return await handleResponse(response);
};

export const cancelPayment = async ({ paymentIntentId }) => {
  const response = await fetch(`/api/payments/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paymentIntentId })
  });
  return await handleResponse(response);
};

// Actions wired to existing Flask HTML endpoints
// Trigger email run; then pull logs from index page
export const runNow = async () => {
  await fetch('/run-now', { method: 'POST' });
  const html = await (await fetch('/')).text();
  return extractLogsFromHtml(html);
};

// Upload invoice via /upload HTML endpoint; returns logs extracted from HTML
export const uploadInvoice = async (vendorId, file) => {
  const form = new FormData();
  form.append('vendor_id', vendorId);
  form.append('file', file);
  const uploadRes = await fetch('/upload', { method: 'POST', body: form });
  const html = await uploadRes.text();
  return extractLogsFromHtml(html);
};

// Utility functions (matching mock.js format)
export const getStatusLabel = (status) => {
  const labels = {
    'matched_auto': 'Matched',
    'unmatched': 'Unmatched',
    'vendor_mismatch': 'Mismatch',
    'needs_review': 'Needs Review'
  };
  return labels[status] || status;
};

export const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  }).format(amount || 0);
};

export const formatNumber = (num) => {
  return new Intl.NumberFormat('en-US').format(num || 0);
};
