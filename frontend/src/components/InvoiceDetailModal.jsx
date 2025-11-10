import React, { useEffect, useState } from 'react';
import { Calendar, DollarSign, FileText, Package } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { getStatusLabel, formatCurrency, fetchInvoiceById } from '../services/api';

const InvoiceDetailModal = ({ invoice, open, onClose }) => {
  const [details, setDetails] = useState(invoice || null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!invoice || !invoice.id) { setDetails(invoice); return; }
      try {
        setLoading(true);
        const full = await fetchInvoiceById(invoice.id);
        if (active) setDetails({ ...invoice, ...full });
      } catch (e) {
        // fallback to passed invoice data
        if (active) setDetails(invoice);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [invoice]);

  if (!invoice) return null;

  const getStatusStyle = (status) => {
    switch (status) {
      case 'matched_auto':
        return 'bg-gray-800 text-white border-gray-800';
      case 'unmatched':
        return 'bg-white text-black border-gray-300';
      case 'vendor_mismatch':
        return 'bg-gray-100 text-black border-gray-400';
      case 'needs_review':
        return 'bg-gray-200 text-black border-gray-500';
      default:
        return 'bg-white text-black border-gray-300';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl bg-white border border-gray-200">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div>
              <DialogTitle className="text-xl sm:text-2xl font-semibold text-black">
                Invoice Details
              </DialogTitle>
              <p className="text-sm text-gray-500 mt-1">
                {invoice.invoiceNumber}
              </p>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusStyle(invoice.status)}`}>
              {getStatusLabel(invoice.status)}
            </span>
          </div>
        </DialogHeader>

        <div className="mt-6 space-y-6">
          {loading && (
            <div className="p-2 bg-gray-50 border border-gray-200 rounded">
              <p className="text-xs text-gray-600">Loading invoice details…</p>
            </div>
          )}
          {/* Vendor & Amount Section */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex items-center gap-2 mb-2">
                <Package className="w-4 h-4 text-gray-600" />
                <span className="text-xs text-gray-500 uppercase tracking-wide">
                  Vendor
                </span>
              </div>
              <p className="text-base sm:text-lg font-semibold text-black">
                {invoice.vendorName}
              </p>
            </div>

            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-4 h-4 text-gray-600" />
                <span className="text-xs text-gray-500 uppercase tracking-wide">
                  Amount
                </span>
              </div>
              <p className="text-base sm:text-lg font-semibold text-black">
                {formatCurrency(details?.amount ?? invoice.amount)}
              </p>
            </div>
          </div>

          {/* Dates Section */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="w-4 h-4 text-gray-600" />
                <span className="text-xs text-gray-500 uppercase tracking-wide">
                  Invoice Date
                </span>
              </div>
              <p className="text-sm text-black">
                {new Date(details?.date || invoice.date).toLocaleDateString('en-US', { 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                })}
              </p>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="w-4 h-4 text-gray-600" />
                <span className="text-xs text-gray-500 uppercase tracking-wide">
                  Due Date
                </span>
              </div>
              <p className="text-sm text-black">
                {new Date(details?.dueDate || invoice.dueDate).toLocaleDateString('en-US', { 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                })}
              </p>
            </div>
          </div>

          {/* Description */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-4 h-4 text-gray-600" />
              <span className="text-xs text-gray-500 uppercase tracking-wide">
                Description
              </span>
            </div>
            <p className="text-sm text-black">
              {details?.description || invoice.description || ''}
            </p>
          </div>

          {/* PO Number */}
          <div>
            <span className="text-xs text-gray-500 uppercase tracking-wide">
              Purchase Order
            </span>
            <p className="text-sm text-black mt-1">
              {details?.poNumber || invoice.poNumber || 'No PO Number'}
            </p>
          </div>

          {/* Totals */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-3 bg-gray-50 rounded border border-gray-200">
              <p className="text-xs text-gray-500">Currency</p>
              <p className="text-sm text-black mt-1">{details?.currency || 'USD'}</p>
            </div>
            <div className="p-3 bg-gray-50 rounded border border-gray-200">
              <p className="text-xs text-gray-500">Subtotal</p>
              <p className="text-sm text-black mt-1">{formatCurrency(details?.subtotal ?? 0)}</p>
            </div>
            <div className="p-3 bg-gray-50 rounded border border-gray-200">
              <p className="text-xs text-gray-500">Tax</p>
              <p className="text-sm text-black mt-1">{formatCurrency(details?.tax ?? 0)}</p>
            </div>
          </div>

          {/* Line Items */}
          {Array.isArray(details?.lines) && details.lines.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <FileText className="w-4 h-4 text-gray-600" />
                <span className="text-xs text-gray-500 uppercase tracking-wide">
                  Line Items
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border border-gray-200 rounded">
                  <thead>
                    <tr className="bg-gray-50 text-xs text-gray-600">
                      <th className="text-left p-2">#</th>
                      <th className="text-left p-2">Description</th>
                      <th className="text-left p-2">Qty</th>
                      <th className="text-left p-2">Unit</th>
                      <th className="text-left p-2">Unit Price</th>
                      <th className="text-left p-2">Line Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {details.lines.map((ln, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="p-2 text-gray-700">{ln.line_number ?? ''}</td>
                        <td className="p-2 text-gray-900">{ln.description || ''}</td>
                        <td className="p-2 text-gray-700">{ln.quantity ?? ''}</td>
                        <td className="p-2 text-gray-700">{ln.unit_of_measure || ''}</td>
                        <td className="p-2 text-gray-700">{formatCurrency(ln.unit_price ?? 0)}</td>
                        <td className="p-2 text-gray-900 font-medium">{formatCurrency(ln.line_total ?? 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t border-gray-200">
            <button
              className="flex-1 px-4 py-2.5 bg-black text-white rounded-lg font-medium hover:bg-gray-800 transition-colors"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default InvoiceDetailModal;
