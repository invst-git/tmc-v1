import React from 'react';

const VendorTable = ({ vendors = [], onVendorSelect, selectedVendorId, loading = false }) => {
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

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base sm:text-lg font-medium text-black">
          Vendor list
        </h2>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>Sort by: Name</span>
          <span>▾</span>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-3 px-2 text-xs text-gray-500 uppercase tracking-wider font-medium">
                Vendor
              </th>
              <th className="text-left py-3 px-2 text-xs text-gray-500 uppercase tracking-wider font-medium">
                Tax ID
              </th>
              <th className="text-left py-3 px-2 text-xs text-gray-500 uppercase tracking-wider font-medium">
                Contact
              </th>
              <th className="text-left py-3 px-2 text-xs text-gray-500 uppercase tracking-wider font-medium">
                POs
              </th>
              <th className="text-left py-3 px-2 text-xs text-gray-500 uppercase tracking-wider font-medium">
                Invoices (30d)
              </th>
              <th className="text-left py-3 px-2 text-xs text-gray-500 uppercase tracking-wider font-medium">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="6" className="py-8 text-center text-sm text-gray-500">
                  Loading vendors...
                </td>
              </tr>
            ) : vendors.length === 0 ? (
              <tr>
                <td colSpan="6" className="py-8 text-center text-sm text-gray-500">
                  No vendors found
                </td>
              </tr>
            ) : (
              vendors.map((vendor, index) => (
                <tr
                  key={vendor.id}
                  onClick={() => onVendorSelect && onVendorSelect(vendor)}
                  className={`
                    cursor-pointer hover:bg-gray-50 transition-colors
                    ${index !== vendors.length - 1 ? 'border-b border-gray-100' : ''}
                    ${selectedVendorId === vendor.id ? 'bg-gray-50' : ''}
                  `}
                >
                  <td className="py-3 px-2">
                    <span className="text-sm font-medium text-black">
                      {vendor.name}
                    </span>
                  </td>
                  <td className="py-3 px-2">
                    <span className="text-sm text-gray-600">
                      {vendor.taxId}
                    </span>
                  </td>
                  <td className="py-3 px-2">
                    <span className="text-sm text-gray-600">
                      {vendor.contact}
                    </span>
                  </td>
                  <td className="py-3 px-2">
                    <span className="text-sm text-black font-medium">
                      {vendor.openPos}
                    </span>
                  </td>
                  <td className="py-3 px-2">
                    <span className="text-sm text-black font-medium">
                      {vendor.invoices30d}
                    </span>
                  </td>
                  <td className="py-3 px-2">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium border ${getStatusStyle(vendor.status)}`}>
                      {getStatusLabel(vendor.status)}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default VendorTable;
