import React, { useState, useEffect } from 'react';
import { MessageCircle, Search } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import StatsCard from '../components/StatsCard';
import VendorTable from '../components/VendorTable';
import VendorDetailPanel from '../components/VendorDetailPanel';
import InvoiceDetailModal from '../components/InvoiceDetailModal';
import PurchaseOrderDetailModal from '../components/PurchaseOrderDetailModal';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { formatNumber, fetchVendors, fetchVendorStats, fetchVendorById, fetchInvoiceById, fetchPurchaseOrderById, createVendor, deleteVendor } from '../services/api';
import VendorChat from '../components/VendorChat';

const Vendors = () => {
  const [activeNav] = useState('vendors');
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [selectedVendorDetails, setSelectedVendorDetails] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  // State for data from API
  const [vendors, setVendors] = useState([]);
  const [stats, setStats] = useState({ totalVendors: 0, activeVendors: 0, vendorsWithInvoices30d: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [poModalOpen, setPoModalOpen] = useState(false);
  const [selectedPo, setSelectedPo] = useState(null);

  // Add/Delete vendor UI state
  const [addOpen, setAddOpen] = useState(false);
  const [newVendor, setNewVendor] = useState({ name: '', taxId: '', contact: '', address: '' });
  const [chatOpen, setChatOpen] = useState(false);

  // Fetch vendors and stats on mount
  useEffect(() => {
    const loadVendorData = async () => {
      try {
        setLoading(true);
        const [vendorsData, statsData] = await Promise.all([
          fetchVendors(),
          fetchVendorStats()
        ]);

        setVendors(vendorsData);
        setStats(statsData);
        setError(null);
      } catch (err) {
        console.error('Error loading vendor data:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadVendorData();
  }, []);

  const refreshVendors = async () => {
    try {
      const [vendorsData, statsData] = await Promise.all([
        fetchVendors(),
        fetchVendorStats()
      ]);
      setVendors(vendorsData);
      setStats(statsData);
    } catch (err) {
      // no-op
    }
  };

  // Listen for 'open-invoice' events from VendorDetailPanel (to open modal)
  useEffect(() => {
    const handler = async (e) => {
      const id = e.detail?.id;
      if (!id) return;
      try {
        const inv = await fetchInvoiceById(id);
        setSelectedInvoice(inv);
        setInvoiceModalOpen(true);
      } catch (err) {
        console.error('Error opening invoice:', err);
      }
    };
    window.addEventListener('open-invoice', handler);
    return () => window.removeEventListener('open-invoice', handler);
  }, []);

  // Listen for PO open events
  useEffect(() => {
    const handler = async (e) => {
      const id = e.detail?.id;
      if (!id) return;
      try {
        const po = await fetchPurchaseOrderById(id);
        setSelectedPo(po);
        setPoModalOpen(true);
      } catch (err) {
        console.error('Error opening PO:', err);
      }
    };
    window.addEventListener('open-po', handler);
    return () => window.removeEventListener('open-po', handler);
  }, []);

  // Fetch vendor details when selected
  const handleVendorSelect = async (vendor) => {
    setSelectedVendor(vendor);

    try {
      setLoadingDetails(true);
      const details = await fetchVendorById(vendor.id);
      setSelectedVendorDetails(details);
    } catch (err) {
      console.error('Error loading vendor details:', err);
      setSelectedVendorDetails(vendor); // Fallback to basic vendor data
    } finally {
      setLoadingDetails(false);
    }
  };

  // Filter vendors based on search query
  const filteredVendors = vendors.filter((vendor) => {
    const query = searchQuery.toLowerCase();
    return (
      vendor.name?.toLowerCase().includes(query) ||
      vendor.taxId?.toLowerCase().includes(query) ||
      vendor.contact?.toLowerCase().includes(query)
    );
  });

  return (
    <>
    <div className="min-h-screen bg-white">      <Sidebar activeItem={activeNav} />

      {/* Main Content */}
      <div className="lg:ml-[220px] p-4 sm:p-6 lg:p-8 transition-all">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <h1 className="text-2xl sm:text-3xl font-semibold text-black">
            Vendors
          </h1>

          {/* Search and Add Button */}
          <div className="flex items-center gap-3 w-full sm:w-auto">
            {/* Search Input */}
            <div className="relative flex-1 sm:flex-initial">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search vendors..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full sm:w-64 pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
              />
            </div>

            {/* Add Vendor Button */}
            <button
              onClick={() => setAddOpen(true)}
              className="px-4 py-2 border border-black rounded-full text-sm font-medium text-black hover:bg-gray-50 transition-colors whitespace-nowrap"
            >
              Add vendor
            </button>
            <button
              disabled={!selectedVendor}
              onClick={() => setChatOpen(true)}
              className="px-4 py-2 border border-black rounded-full text-sm font-medium text-black hover:bg-gray-50 transition-colors whitespace-nowrap flex items-center gap-2"
            >
              <MessageCircle className="w-4 h-4"/>
              Chat
            </button>
            <button
              disabled={!selectedVendor}
              onClick={async () => {
                if (!selectedVendor) return;
                const ok = window.confirm(`Delete vendor "${selectedVendor.name}" and related records?`);
                if (!ok) return;
                try {
                  await deleteVendor(selectedVendor.id);
                  setSelectedVendor(null);
                  setSelectedVendorDetails(null);
                  await refreshVendors();
                } catch (err) {
                  alert(`Failed to delete vendor: ${err.message}`);
                }
              }}
              className="px-4 py-2 border border-red-600 text-red-700 rounded-full text-sm font-medium hover:bg-red-50 transition-colors whitespace-nowrap disabled:opacity-50"
            >
              Delete vendor
            </button>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-600">Error loading vendor data: {error}</p>
          </div>
        )}

        {/* Stats Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 mb-6">
          <StatsCard
            label="Total Vendors"
            value={formatNumber(stats.totalVendors)}
            subtitle="All time"
          />
          <StatsCard
            label="Active Vendors"
            value={formatNumber(stats.activeVendors)}
            subtitle="Currently active"
          />
          <StatsCard
            label="Vendors With Invoices"
            value={formatNumber(stats.vendorsWithInvoices30d)}
            subtitle="Last 30 days"
          />
        </div>

        {/* Two Column Layout: Table + Detail Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">
          {/* Vendor Table - 60% width */}
          <div className="lg:col-span-2">
            <VendorTable
              vendors={filteredVendors}
              onVendorSelect={handleVendorSelect}
              selectedVendorId={selectedVendor?.id}
              loading={loading}
            />
          </div>

          {/* Vendor Detail Panel - 40% width */}
          <div className="lg:col-span-1">
            <VendorDetailPanel
              vendor={selectedVendorDetails}
              loading={loadingDetails}
            />
          </div>
        </div>
      </div>
    </div>
    <VendorChat vendorId={selectedVendor?.id} open={chatOpen && !!selectedVendor} onClose={() => setChatOpen(false)} />
    {/* Add Vendor Dialog */}
    <Dialog open={addOpen} onOpenChange={setAddOpen}>
      <DialogContent className="bg-white border border-gray-200">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold text-black">Add Vendor</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const payload = { ...newVendor };
              if (!payload.name) { alert('Name is required'); return; }
              await createVendor(payload);
              setAddOpen(false);
              setNewVendor({ name: '', taxId: '', contact: '', address: '' });
              await refreshVendors();
            } catch (err) {
              alert(`Failed to add vendor: ${err.message}`);
            }
          }}
          className="space-y-3"
        >
          <div>
            <label className="block text-sm font-medium text-black mb-1">Name</label>
            <Input value={newVendor.name} onChange={(e) => setNewVendor(v => ({ ...v, name: e.target.value }))} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-black mb-1">Tax ID</label>
            <Input value={newVendor.taxId} onChange={(e) => setNewVendor(v => ({ ...v, taxId: e.target.value }))} />
          </div>
          <div>
            <label className="block text-sm font-medium text-black mb-1">Contact</label>
            <Input value={newVendor.contact} onChange={(e) => setNewVendor(v => ({ ...v, contact: e.target.value }))} />
          </div>
          <div>
            <label className="block text-sm font-medium text-black mb-1">Address</label>
            <Input value={newVendor.address} onChange={(e) => setNewVendor(v => ({ ...v, address: e.target.value }))} />
          </div>
          <div className="pt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setAddOpen(false)} className="px-4 py-2 rounded-lg border border-gray-300 text-sm">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-black text-white rounded-lg text-sm">Save</button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
    <InvoiceDetailModal
      invoice={selectedInvoice}
      open={invoiceModalOpen}
      onClose={() => setInvoiceModalOpen(false)}
    />
    <PurchaseOrderDetailModal
      po={selectedPo}
      open={poModalOpen}
      onClose={() => setPoModalOpen(false)}
    />
    </>
  );
};

export default Vendors;

