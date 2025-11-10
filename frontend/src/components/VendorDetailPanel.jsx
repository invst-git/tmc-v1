import React from 'react';
import { Mail, Phone, MapPin } from 'lucide-react';
import { formatCurrency } from '../services/api';

const VendorDetailPanel = ({ vendor, loading = false }) => {
  if (!vendor && !loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6 flex items-center justify-center min-h-[400px]">
        <p className="text-sm text-gray-500">
          Select a vendor to see details.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6 flex items-center justify-center min-h-[400px]">
        <p className="text-sm text-gray-500">
          Loading vendor details...
        </p>
      </div>
    );
  }

  const getStatusStyle = (status) => {
    switch (status) {
      case 'active':
        return 'bg-black text-white border-black';
      case 'inactive':
        return 'bg-white text-black border-gray-300';
      default:
        return 'bg-white text-black border-gray-300';
    }
  };

  const getStatusLabel = (status) => {
    return status === 'active' ? 'Active' : 'Inactive';
  };

  // Use vendor data from API
  const details = {
    name: vendor.name || 'Unknown Vendor',
    taxId: vendor.taxId || 'N/A',
    contact: vendor.contact || 'No contact info',
    phone: vendor.phone || 'N/A',
    address: vendor.address || 'No address on file',
    openPos: vendor.openPos || 0,
    invoices30d: vendor.invoices30d || 0,
    totalAmount30d: vendor.totalAmount30d || 0,
    status: vendor.status || 'inactive',
    recentInvoices: vendor.recentInvoices || [],
    invoices: vendor.invoices || [],
    purchaseOrders: vendor.purchaseOrders || []
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-black">
            {details.name}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {details.taxId}
          </p>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusStyle(details.status)}`}>
          {getStatusLabel(details.status)}
        </span>
      </div>

      {/* Basic Info Section */}
      <div className="space-y-4 pb-6 border-b border-gray-200">
        <h3 className="text-xs text-gray-500 uppercase tracking-wider font-medium">
          Basic Info
        </h3>

        <div className="space-y-3">
          <div className="flex items-start gap-2">
            <Mail className="w-4 h-4 text-gray-600 mt-0.5" />
            <div>
              <p className="text-xs text-gray-500">Contact Email</p>
              <p className="text-sm text-black">{details.contact}</p>
            </div>
          </div>

          <div className="flex items-start gap-2">
            <Phone className="w-4 h-4 text-gray-600 mt-0.5" />
            <div>
              <p className="text-xs text-gray-500">Phone</p>
              <p className="text-sm text-black">{details.phone}</p>
            </div>
          </div>

          <div className="flex items-start gap-2">
            <MapPin className="w-4 h-4 text-gray-600 mt-0.5" />
            <div>
              <p className="text-xs text-gray-500">Address</p>
              <p className="text-sm text-black whitespace-pre-line">{details.address}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Section */}
      <div className="space-y-4 py-6 border-b border-gray-200">
        <h3 className="text-xs text-gray-500 uppercase tracking-wider font-medium">
          Stats
        </h3>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Open POs</span>
            <span className="text-sm font-semibold text-black">{details.openPos}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Invoices last 30 days</span>
            <span className="text-sm font-semibold text-black">{details.invoices30d}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Total amount last 30 days</span>
            <span className="text-sm font-semibold text-black">{formatCurrency(details.totalAmount30d)}</span>
          </div>
        </div>
      </div>

      {/* Recent Activity Section */}
      <div className="space-y-4 pt-6">
        <h3 className="text-xs text-gray-500 uppercase tracking-wider font-medium">
          Recent Activity
        </h3>

        <div className="space-y-2">
          {details.invoices.length === 0 ? (
            <p className="text-sm text-gray-500 py-4">No invoices</p>
          ) : (
            details.invoices.map((invoice, index) => (
              <div key={invoice.id || index} className="flex items-center justify-between py-2">
                <div className="flex-1">
                  <p className="text-xs text-gray-500">{invoice.date}</p>
                  <p className="text-sm font-medium text-black mt-0.5">{formatCurrency(invoice.amount)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                    invoice.status === 'matched_auto'
                      ? 'bg-gray-800 text-white border-gray-800'
                      : 'bg-white text-black border-gray-300'
                  }`}>
                    {invoice.status === 'matched_auto' ? 'Matched' : 'Unmatched'}
                  </span>
                  {invoice.id && (
                    <button
                      onClick={() => window.dispatchEvent(new CustomEvent('open-invoice', { detail: { id: invoice.id } }))}
                      className="text-xs border border-black rounded-full px-2 py-0.5 hover:bg-gray-50"
                    >
                      View
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Purchase Orders Section */}
      <div className="space-y-4 pt-6">
        <h3 className="text-xs text-gray-500 uppercase tracking-wider font-medium">
          Purchase Orders
        </h3>
        {details.purchaseOrders.length === 0 ? (
          <p className="text-sm text-gray-500">No purchase orders</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-gray-200 rounded">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-600">
                  <th className="text-left p-2">PO Number</th>
                  <th className="text-left p-2">Total</th>
                  <th className="text-left p-2">Currency</th>
                  <th className="text-left p-2">Status</th>
                  <th className="text-left p-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {details.purchaseOrders.map((po, i) => (
                  <tr key={po.id || i} className="border-t border-gray-100">
                    <td className="p-2">{po.poNumber || po.po_number || ''}</td>
                    <td className="p-2">{formatCurrency(po.totalAmount ?? po.total_amount ?? 0)}</td>
                    <td className="p-2">{po.currency || 'USD'}</td>
                    <td className="p-2">{po.status || ''}</td>
                    <td className="p-2">
                      {po.id && (
                        <button
                          onClick={() => window.dispatchEvent(new CustomEvent('open-po', { detail: { id: po.id } }))}
                          className="text-xs border border-black rounded-full px-2 py-0.5 hover:bg-gray-50"
                        >
                          View
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default VendorDetailPanel;
