import React, { useEffect, useMemo, useState } from 'react';
import Sidebar from '../components/Sidebar';
import { fetchPayableInvoices, fetchVendors, formatCurrency, getStatusLabel, createPaymentIntent, confirmPayment, cancelPayment } from '../services/api';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useElements, useStripe } from '@stripe/react-stripe-js';

const stripePromise = loadStripe(process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY || '');

const PayerForm = ({ onSubmit, disabled }) => {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [line1, setLine1] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postal_code, setPostalCode] = useState('');
  const [country, setCountry] = useState('US');

  const handle = (e) => {
    e.preventDefault();
    onSubmit({ email, name, address: { line1, city, state, postal_code, country } });
  };

  return (
    <form onSubmit={handle} className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input className="border border-gray-300 rounded px-3 py-2 text-sm" placeholder="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
        <input className="border border-gray-300 rounded px-3 py-2 text-sm" placeholder="Name" value={name} onChange={e => setName(e.target.value)} required />
        <input className="border border-gray-300 rounded px-3 py-2 text-sm sm:col-span-2" placeholder="Address line 1" value={line1} onChange={e => setLine1(e.target.value)} />
        <input className="border border-gray-300 rounded px-3 py-2 text-sm" placeholder="City" value={city} onChange={e => setCity(e.target.value)} />
        <input className="border border-gray-300 rounded px-3 py-2 text-sm" placeholder="State" value={state} onChange={e => setState(e.target.value)} />
        <input className="border border-gray-300 rounded px-3 py-2 text-sm" placeholder="Postal Code" value={postal_code} onChange={e => setPostalCode(e.target.value)} />
        <input className="border border-gray-300 rounded px-3 py-2 text-sm" placeholder="Country (US)" value={country} onChange={e => setCountry(e.target.value)} />
      </div>
      <button type="submit" disabled={disabled} className="px-4 py-2 border border-black rounded-lg text-sm font-medium text-black hover:bg-gray-50 disabled:opacity-60">Save payer</button>
    </form>
  );
};

const PayBox = ({ selection, currency, onPaid, onError, customer }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const total = selection.reduce((acc, s) => acc + (s.amount || 0), 0);

  const handlePay = async () => {
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError('');
    try {
      const { clientSecret, paymentIntentId, error: serverError } = await createPaymentIntent({
        invoiceIds: selection.map(s => s.id),
        currency,
        customer,
        saveMethod: false
      });
      if (!clientSecret) throw new Error(serverError || 'No client secret');
      const result = await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card: elements.getElement(CardElement),
          billing_details: customer,
        }
      });
      if (result.error) {
        setError(result.error.message || 'Payment failed');
        if (paymentIntentId) {
          try { await cancelPayment({ paymentIntentId }); } catch (_) {}
        }
        if (onError) onError(result.error.message || 'Payment failed');
      } else if (result.paymentIntent && result.paymentIntent.status === 'succeeded') {
        try {
          await confirmPayment({ paymentIntentId: result.paymentIntent.id });
        } catch (_) {}
        onPaid(result.paymentIntent.id);
      } else {
        setError('Payment not completed.');
        if (paymentIntentId) {
          try { await cancelPayment({ paymentIntentId }); } catch (_) {}
        }
        if (onError) onError('Payment not completed.');
      }
    } catch (e) {
      setError(e.message);
      if (onError) onError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="p-3 border border-gray-200 rounded">
        <CardElement options={{ hidePostalCode: true }} />
      </div>
      {error && <div className="text-sm text-red-600">{error}</div>}
      <button onClick={handlePay} disabled={submitting || !stripe || !elements || total <= 0}
        className="w-full px-4 py-2 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-60">
        {submitting ? 'Processing…' : `Pay ${formatCurrency(total)} (${currency || 'USD'})`}
      </button>
    </div>
  );
};

const Payments = () => {
  const [activeNav] = useState('payments');
  const [vendors, setVendors] = useState([]);
  const [selectedVendorId, setSelectedVendorId] = useState('');
  const [currency, setCurrency] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState({});
  const [customer, setCustomer] = useState(null);
  const [paid, setPaid] = useState(false);
  const [payError, setPayError] = useState('');

  const grouped = useMemo(() => {
    const map = new Map();
    for (const it of items) {
      const key = it.vendorId || 'unknown';
      const name = it.vendorName || 'Unknown Vendor';
      if (!map.has(key)) map.set(key, { vendorId: key, vendorName: name, list: [] });
      map.get(key).list.push(it);
    }
    return Array.from(map.values()).sort((a, b) => a.vendorName.localeCompare(b.vendorName));
  }, [items]);

  const selectionArray = useMemo(() => items.filter(i => selected[i.id]), [items, selected]);
  const selectionCurrency = useMemo(() => {
    const set = new Set(selectionArray.map(i => i.currency).filter(Boolean));
    return set.size === 1 ? selectionArray[0]?.currency : '';
  }, [selectionArray]);

  const load = async () => {
    try {
      setLoading(true);
      const [vData, invData] = await Promise.all([
        fetchVendors(),
        fetchPayableInvoices({ vendorId: selectedVendorId || undefined, currency: currency || undefined, limit: 200 })
      ]);
      setVendors(vData);
      setItems(invData);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [selectedVendorId, currency]);

  const toggle = (id) => setSelected(s => ({ ...s, [id]: !s[id] }));
  const selectAllForVendor = (vendorId, check) => {
    const updates = {};
    for (const i of items) if ((i.vendorId || 'unknown') === vendorId) updates[i.id] = check;
    setSelected(s => ({ ...s, ...updates }));
  };

  const onSubmitPayer = (c) => setCustomer(c);

  return (
    <div className="min-h-screen bg-white">
      {/* BrandBar removed */}
      <Sidebar activeItem={activeNav} />

      <div className="lg:ml-[220px] p-4 sm:p-6 lg:p-8 transition-all">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <h1 className="text-2xl sm:text-3xl font-semibold text-black">Payments</h1>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <select className="border border-gray-200 rounded-lg text-sm px-3 py-2" value={selectedVendorId} onChange={e => setSelectedVendorId(e.target.value)}>
              <option value="">All vendors</option>
              {vendors.map(v => (
                <option key={v.id || v[0]} value={(v.id || v[0])}>{v.name || v[1]}</option>
              ))}
            </select>
            <input className="border border-gray-200 rounded-lg text-sm px-3 py-2 w-36" placeholder="Currency (e.g., USD)" value={currency} onChange={e => setCurrency(e.target.value)} />
            <button className="px-4 py-2 border border-black rounded-full text-sm font-medium text-black hover:bg-gray-50" onClick={load}>Refresh</button>
          </div>
        </div>

        {loading && (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-6">
            <p className="text-sm text-gray-600">Loading payable invoices…</p>
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Invoices list (2/3) */}
          <div className="lg:col-span-2 space-y-4">
            {grouped.map(group => (
              <div key={group.vendorId} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="p-3 sm:p-4 flex items-center justify-between border-b border-gray-200">
                  <div className="font-medium text-black text-sm">{group.vendorName}</div>
                  <div className="flex items-center gap-2 text-xs">
                    <label className="flex items-center gap-1">
                      <input type="checkbox" onChange={e => selectAllForVendor(group.vendorId, e.target.checked)} />
                      <span>Select all</span>
                    </label>
                  </div>
                </div>
                <div className="divide-y divide-gray-100">
                  {group.list.map(inv => (
                    <div key={inv.id} className="p-3 sm:p-4 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <input type="checkbox" checked={!!selected[inv.id]} onChange={() => toggle(inv.id)} />
                        <div className="w-16 text-xs text-gray-500">{inv.displayDate}</div>
                        <div className="text-sm text-black font-medium">{formatCurrency(inv.amount)}</div>
                        <div className="text-xs text-gray-600">{inv.invoiceNumber}</div>
                        <div className="text-xs text-gray-600">{getStatusLabel(inv.status)}</div>
                      </div>
                      <div className="text-xs text-gray-500">{inv.currency}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Summary + Payment (1/3) */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6 space-y-4">
            <div>
              <h2 className="text-base font-medium text-black mb-2">Summary</h2>
              <div className="text-sm text-gray-600">Selected invoices: {selectionArray.length}</div>
              <div className="text-sm text-gray-600">Currency: {selectionCurrency || '-'}</div>
              <div className="text-sm font-semibold text-black mt-1">
                Total: {formatCurrency(selectionArray.reduce((acc, s) => acc + (s.amount || 0), 0))}
              </div>
              {selectionArray.length > 0 && selectionArray.some(s => s.currency !== selectionCurrency) && (
                <div className="text-xs text-red-600 mt-2">Mixed currency selection is not allowed.</div>
              )}
            </div>

            <div>
              <h2 className="text-base font-medium text-black mb-2">Payer</h2>
              <PayerForm onSubmit={onSubmitPayer} />
            </div>

            <div>
              <h2 className="text-base font-medium text-black mb-2">Payment Method</h2>
              {!process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY && (
                <div className="text-xs text-red-600 mb-2">Missing REACT_APP_STRIPE_PUBLISHABLE_KEY in environment.</div>
              )}
              <Elements stripe={stripePromise}>
                <PayBox selection={selectionArray} currency={selectionCurrency || currency || 'USD'} onPaid={() => { setPaid(true); setSelected({}); load(); }} onError={setPayError} customer={customer || {}} />
              </Elements>
            </div>

            {paid && (
              <div className="p-3 bg-green-50 border border-green-200 rounded text-sm text-green-700">Payment succeeded. Invoices have been marked as paid.</div>
            )}
            {payError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">{payError}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Payments;
