import React, { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { formatCurrency, fetchPurchaseOrderById } from '../services/api';

const PurchaseOrderDetailModal = ({ po, open, onClose }) => {
  const [details, setDetails] = useState(po || null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!po || !po.id) { setDetails(po); return; }
      try {
        setLoading(true);
        const full = await fetchPurchaseOrderById(po.id);
        if (active) setDetails({ ...po, ...full });
      } catch (e) {
        if (active) setDetails(po);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [po]);

  if (!po) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl bg-white border border-gray-200">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div>
              <DialogTitle className="text-xl sm:text-2xl font-semibold text-black">
                Purchase Order Details
              </DialogTitle>
              <p className="text-sm text-gray-500 mt-1">
                {details?.poNumber || po.poNumber || ''}
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="mt-6 space-y-6">
          {loading && (
            <div className="p-2 bg-gray-50 border border-gray-200 rounded">
              <p className="text-xs text-gray-600">Loading PO details…</p>
            </div>
          )}

          {/* Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-3 bg-gray-50 rounded border border-gray-200">
              <p className="text-xs text-gray-500">Total Amount</p>
              <p className="text-sm text-black mt-1">{formatCurrency(details?.totalAmount ?? po.totalAmount ?? 0)}</p>
            </div>
            <div className="p-3 bg-gray-50 rounded border border-gray-200">
              <p className="text-xs text-gray-500">Currency</p>
              <p className="text-sm text-black mt-1">{details?.currency || po.currency || 'USD'}</p>
            </div>
            <div className="p-3 bg-gray-50 rounded border border-gray-200">
              <p className="text-xs text-gray-500">Status</p>
              <p className="text-sm text-black mt-1">{details?.status || po.status || ''}</p>
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

export default PurchaseOrderDetailModal;

