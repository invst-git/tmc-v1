import React, { useEffect, useMemo, useState } from 'react';
import Sidebar from '../components/Sidebar';
import { fetchExceptionInvoices, fetchVendors, getStatusLabel, formatCurrency } from '../services/api';
import InvoiceDetailModal from '../components/InvoiceDetailModal';

const Exceptions = () => {
  const [activeNav] = useState('exceptions');
  const [vendors, setVendors] = useState([]);
  const [selectedVendorId, setSelectedVendorId] = useState('');
  const [statusFilter, setStatusFilter] = useState(''); // '', 'unmatched', 'vendor_mismatch', 'needs_review'
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const it of items) {
      const key = it.vendorName || 'Unknown Vendor';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(it);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [items]);

  const load = async () => {
    try {
      setLoading(true);
      const [vData, exData] = await Promise.all([
        fetchVendors(),
        fetchExceptionInvoices({ vendorId: selectedVendorId || undefined, status: statusFilter || undefined, limit: 200 })
      ]);
      setVendors(vData);
      setItems(exData);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVendorId, statusFilter]);

  const openInvoice = (inv) => {
    setSelectedInvoice(inv);
    setModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-white">      <Sidebar activeItem={activeNav} />

      <div className="lg:ml-[220px] p-4 sm:p-6 lg:p-8 transition-all">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <h1 className="text-2xl sm:text-3xl font-semibold text-black">Exceptions</h1>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <select
              className="border border-gray-200 rounded-lg text-sm px-3 py-2"
              value={selectedVendorId}
              onChange={(e) => setSelectedVendorId(e.target.value)}
            >
              <option value="">All vendors</option>
              {vendors.map(v => (
                <option key={v.id || v[0]} value={(v.id || v[0])}>{v.name || v[1]}</option>
              ))}
            </select>
            <div className="flex items-center gap-1 bg-gray-100 rounded-full p-1 border border-gray-200">
              {['', 'unmatched', 'vendor_mismatch', 'needs_review'].map(s => (
                <button
                  key={s || 'all'}
                  onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${statusFilter === s ? 'bg-black text-white' : 'bg-transparent text-gray-600 hover:text-black'}`}
                >
                  {s ? getStatusLabel(s) : 'All'}
                </button>
              ))}
            </div>
            <button
              className="px-4 py-2 border border-black rounded-full text-sm font-medium text-black hover:bg-gray-50"
              onClick={load}
            >
              Refresh
            </button>
          </div>
        </div>

        {loading && (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-6">
            <p className="text-sm text-gray-600">Loading exception invoices…</p>
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {grouped.length === 0 && !loading ? (
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <p className="text-sm text-gray-600">No exception invoices found.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {grouped.map(([vendorName, list]) => (
              <div key={vendorName} className="bg-white border border-gray-200 rounded-xl">
                <div className="p-4 sm:p-5 border-b border-gray-200 flex items-center justify-between">
                  <h2 className="text-base sm:text-lg font-medium text-black">{vendorName}</h2>
                  <span className="text-xs text-gray-500">{list.length} invoice(s)</span>
                </div>
                <div className="divide-y divide-gray-100">
                  {list.map(inv => (
                    <div key={inv.id} className="p-3 sm:p-4 flex items-center justify-between">
                      <div className="flex items-center gap-6">
                        <div className="min-w-[60px] text-xs text-gray-500">{inv.displayDate}</div>
                        <div className="text-sm text-black font-medium">{formatCurrency(inv.amount)}</div>
                        <div className="text-xs text-gray-600">{inv.invoiceNumber}</div>
                        <div className="text-xs text-gray-600">{getStatusLabel(inv.status)}</div>
                      </div>
                      <button
                        onClick={() => openInvoice(inv)}
                        className="text-xs border border-black rounded-full px-3 py-1 hover:bg-gray-50"
                      >
                        View
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <InvoiceDetailModal
        invoice={selectedInvoice}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
};

export default Exceptions;


