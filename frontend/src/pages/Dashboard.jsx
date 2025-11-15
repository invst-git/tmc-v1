import React, { useState, useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import LineChart from '../components/LineChart';
import InvoiceDetailModal from '../components/InvoiceDetailModal';
import {
  fetchDashboardStats,
  fetchGraphData,
  fetchRecentInvoices,
  fetchVendors,
  runNow,
  uploadInvoice,
  formatCurrency,
  formatNumber,
  getStatusLabel
} from '../services/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';

const Dashboard = () => {
  const [activeNav] = useState('dashboard');
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [graphView, setGraphView] = useState('invoices');

  // State for data from API
  const [stats, setStats] = useState({
    invoicesProcessed: 0,
    amountProcessed: 0,
    avgDaysSavedPerInvoice: 0,
    exceptionInvoices: 0,
    exceptionTimeSavedHours: 0,
  });
  const [graphData, setGraphData] = useState([]);
  const [recentInvoices, setRecentInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Run-now (email ingest) progress + logs
  const [runInProgress, setRunInProgress] = useState(false);
  const [runLogs, setRunLogs] = useState('');
  const [showRunLogs, setShowRunLogs] = useState(false);

  // Upload modal and progress
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadInProgress, setUploadInProgress] = useState(false);
  const [uploadLogs, setUploadLogs] = useState('');
  const [vendors, setVendors] = useState([]);
  const [selectedVendorId, setSelectedVendorId] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);

  // Fetch data on component mount
  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        setLoading(true);
        const [statsData, graphDataResponse, invoicesData, vendorsData] = await Promise.all([
          fetchDashboardStats(),
          fetchGraphData(),
          fetchRecentInvoices(8),
          fetchVendors()
        ]);

        setStats(statsData);
        setGraphData(graphDataResponse);
        setRecentInvoices(invoicesData);
        setVendors(vendorsData);
        setError(null);
      } catch (err) {
        console.error('Error loading dashboard data:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadDashboardData();
  }, []);

  const handleInvoiceClick = (invoice) => {
    setSelectedInvoice(invoice);
    setModalOpen(true);
  };

  const refreshData = async () => {
    try {
      const [statsData, graphDataResponse, invoicesData] = await Promise.all([
        fetchDashboardStats(),
        fetchGraphData(),
        fetchRecentInvoices(8)
      ]);
      setStats(statsData);
      setGraphData(graphDataResponse);
      setRecentInvoices(invoicesData);
    } catch (err) {
      console.error('Error refreshing dashboard data:', err);
    }
  };

  const handleRunNow = async () => {
    try {
      setRunInProgress(true);
      setShowRunLogs(true);
      setRunLogs('');
      const logsText = await runNow({ wait: true, onUpdate: setRunLogs });
      setRunLogs(logsText || 'Run completed.');
      await refreshData();
    } catch (err) {
      setRunLogs(`Error: ${err.message}`);
    } finally {
      setRunInProgress(false);
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!selectedVendorId || !selectedFile) return;
    try {
      setUploadInProgress(true);
      setUploadLogs('');
      const logsText = await uploadInvoice(selectedVendorId, selectedFile);
      setUploadLogs(logsText || 'Upload completed.');
      await refreshData();
    } catch (err) {
      setUploadLogs(`Error: ${err.message}`);
    } finally {
      setUploadInProgress(false);
    }
  };

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
    <div className="min-h-screen bg-white">
      <Sidebar activeItem={activeNav} />

      {/* Main Content */}
      <div className="lg:ml-[220px] p-4 sm:p-6 lg:p-8 transition-all">
        {/* Page Header + Actions */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl sm:text-3xl font-semibold text-black">Dashboard</h1>
            <span className="ml-3 text-xs sm:text-sm text-gray-500 hidden sm:inline">Last 30 days</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleRunNow}
              disabled={runInProgress}
              className="px-4 py-2 border border-black rounded-full text-sm font-medium text-black hover:bg-gray-50 disabled:opacity-60"
            >
              {runInProgress ? 'Checking inbox...' : 'Check inbox now'}
            </button>
            <button
              onClick={() => setUploadOpen(true)}
              className="px-4 py-2 border border-black rounded-full text-sm font-medium text-black hover:bg-gray-50"
            >
              Upload invoice
            </button>
          </div>
        </div>

        {/* Loading/Error State */}
        {loading && (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-6">
            <p className="text-sm text-gray-600">Loading dashboard data...</p>
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
            <p className="text-sm text-red-600">Error loading data: {error}</p>
            <p className="text-xs text-gray-600 mt-1">Make sure the Flask backend is running on port 5000.</p>
          </div>
        )}

        {/* Run Logs + Progress */}
        {showRunLogs && (
          <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-black">Inbox check</p>
              {runInProgress && (
                <div className="w-40 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-2 bg-black animate-pulse" style={{ width: '60%' }} />
                </div>
              )}
            </div>
            {runLogs ? (
              <pre className="text-xs text-gray-700 whitespace-pre-wrap">{runLogs}</pre>
            ) : (
              <p className="text-xs text-gray-500">Waiting for logs...</p>
            )}
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 mb-6">
          {/* Invoices Processed */}
          <div 
            className="bg-white border border-gray-200 rounded-xl p-5 cursor-pointer hover:bg-gray-50 transition-colors"
          >
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">
              Invoices Processed
            </p>
            <p className="text-2xl sm:text-3xl font-semibold text-black mb-1">
              {formatNumber(stats.invoicesProcessed)}
            </p>
            <p className="text-xs text-gray-400">
              Last 30 days
            </p>
          </div>

          {/* Amount Processed */}
          <div 
            className="bg-white border border-gray-200 rounded-xl p-5 cursor-pointer hover:bg-gray-50 transition-colors"
          >
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">
              Amount Processed
            </p>
            <p className="text-2xl sm:text-3xl font-semibold text-black mb-1">
              {formatCurrency(stats.amountProcessed)}
            </p>
            <p className="text-xs text-gray-400">
              Last 30 days
            </p>
          </div>

          {/* Avg Days Saved per Invoice */}
          <div 
            className="bg-white border border-gray-200 rounded-xl p-5 cursor-pointer hover:bg-gray-50 transition-colors"
          >
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">
              Avg Days Saved / Invoice
            </p>
            <p className="text-2xl sm:text-3xl font-semibold text-black mb-1">
              {Number(stats.avgDaysSavedPerInvoice ?? 0).toFixed(1)} days
            </p>
            <p className="text-xs text-gray-400">
              Last 30 days
            </p>
          </div>

          {/* Exceptions & Time Saved */}
          <div 
            className="bg-white border border-gray-200 rounded-xl p-5 cursor-pointer hover:bg-gray-50 transition-colors"
          >
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">
              Exception Invoices
            </p>
            <p className="text-2xl sm:text-3xl font-semibold text-black mb-1">
              {formatNumber(stats.exceptionInvoices)}
            </p>
            <p className="text-xs text-gray-400">
              ≈ {Number(stats.exceptionTimeSavedHours ?? 0).toFixed(1)} hrs saved
            </p>
          </div>
        </div>

        {/* Graph and Recent Invoices Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">
          {/* Graph Card - 2/3 width */}
          <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl p-4 sm:p-6">
            {/* Graph Header */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-base sm:text-lg font-medium text-black">
                Past 30 Days
              </h2>
              
              {/* Segmented Control */}
              <div className="flex items-center gap-0 bg-gray-100 rounded-full p-1 border border-gray-200">
                <button
                  onClick={() => setGraphView('invoices')}
                  className={`
                    px-3 sm:px-4 py-1.5 rounded-full text-xs font-medium transition-all
                    ${graphView === 'invoices' 
                      ? 'bg-black text-white' 
                      : 'bg-transparent text-gray-600 hover:text-black'
                    }
                  `}
                >
                  Invoices
                </button>
                <button
                  onClick={() => setGraphView('amount')}
                  className={`
                    px-3 sm:px-4 py-1.5 rounded-full text-xs font-medium transition-all
                    ${graphView === 'amount' 
                      ? 'bg-black text-white' 
                      : 'bg-transparent text-gray-600 hover:text-black'
                    }
                  `}
                >
                  Amount
                </button>
                <button
                  onClick={() => setGraphView('automatch')}
                  className={`
                    px-3 sm:px-4 py-1.5 rounded-full text-xs font-medium transition-all
                    ${graphView === 'automatch' 
                      ? 'bg-black text-white' 
                      : 'bg-transparent text-gray-600 hover:text-black'
                    }
                  `}
                >
                  Auto-match %
                </button>
              </div>
            </div>

            {/* Chart */}
            <div className="w-full overflow-x-auto">
              <div className="min-w-[600px]">
                <LineChart data={graphData} view={graphView} width={720} height={280} />
              </div>
            </div>
          </div>

          {/* Recent Invoices Card - 1/3 width */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6 flex flex-col max-h-[600px]">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base sm:text-lg font-medium text-black">
                Recent Invoices
              </h2>
              <div className="flex gap-2">
                <button className="text-xs text-black font-medium">
                  All
                </button>
                <span className="text-gray-300">|</span>
                <button className="text-xs text-gray-400 font-medium">
                  Exceptions
                </button>
              </div>
            </div>

            {/* Invoice List */}
            <div className="flex-1 overflow-y-auto space-y-0">
              {recentInvoices.map((invoice, index) => (
                <div
                  key={invoice.id}
                  onClick={() => handleInvoiceClick(invoice)}
                  className={`
                    py-3 cursor-pointer hover:bg-gray-50 transition-colors -mx-2 px-2 rounded
                    ${index !== recentInvoices.length - 1 ? 'border-b border-gray-100' : ''}
                  `}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-black truncate">
                        {invoice.vendorName}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {invoice.displayDate}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-black whitespace-nowrap">
                      {formatCurrency(invoice.amount)}
                    </p>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium border ${getStatusStyle(invoice.status)}`}>
                      {getStatusLabel(invoice.status)}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleInvoiceClick(invoice); }}
                      className="text-xs border border-black rounded-full px-2 py-0.5 hover:bg-gray-50"
                    >
                      View
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Invoice Detail Modal */}
      <InvoiceDetailModal 
        invoice={selectedInvoice}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      />

      {/* Upload Modal */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="bg-white border border-gray-200">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-black">Upload Invoice</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpload} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-black mb-1">Vendor</label>
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={selectedVendorId}
                onChange={(e) => setSelectedVendorId(e.target.value)}
                required
              >
                <option value="">Select vendor</option>
                {vendors.map(v => (
                  <option key={v.id || v[0]} value={(v.id || v[0])}>{v.name || v[1]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-black mb-1">Invoice file</label>
              <input
                type="file"
                className="w-full text-sm"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                required
              />
            </div>
            <div className="flex items-center justify-between">
              <button
                type="submit"
                disabled={uploadInProgress}
                className="px-4 py-2 bg-black text-white rounded-lg text-sm hover:bg-gray-800 disabled:opacity-60"
              >
                {uploadInProgress ? 'Uploading…' : 'Upload & process'}
              </button>
              {uploadInProgress && (
                <div className="w-40 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-2 bg-black animate-pulse" style={{ width: '60%' }} />
                </div>
              )}
            </div>
            {uploadLogs && (
              <div className="mt-2">
                <p className="text-xs font-medium text-black mb-1">Logs</p>
                <pre className="text-xs text-gray-700 whitespace-pre-wrap max-h-48 overflow-auto border border-gray-200 rounded p-2">{uploadLogs}</pre>
              </div>
            )}
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Dashboard;
