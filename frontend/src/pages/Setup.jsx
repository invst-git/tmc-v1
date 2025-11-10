import React, { useState } from 'react';
import { Mail, Upload, Database, Cpu, ChevronRight } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import { Input } from '../components/ui/input';
import { Toggle } from '../components/ui/toggle';

const Setup = () => {
  const [activeNav, setActiveNav] = useState('setup');

  // Form state (visual only, no persistence)
  const [settings, setSettings] = useState({
    amountToleranceAbs: '1.00',
    amountTolerancePct: '2',
    autoApprove: true,
    handlingTime: '5',
    vendorMismatch: 'block',
    emailLookback: '30',
    maxAttachment: '20',
    schedulerInterval: '300',
    storagePath: 'invoices/'
  });

  // Handler for save button
  const handleSaveSettings = () => {
    console.log('Settings to be saved:', settings);
    alert('Settings saved successfully!\n\nNote: This is a demo - settings are not persisted to the backend yet.');
  };

  // Handler for configure buttons
  const handleConfigure = (connectionId, connectionLabel) => {
    console.log(`Configure clicked for: ${connectionId}`);
    alert(`Configure ${connectionLabel}\n\nConfiguration interface coming soon!`);
  };

  // Connection tiles data
  const connections = [
    {
      id: 'email',
      label: 'Email Inbox (IMAP)',
      description: 'Used to pull invoices from email.',
      status: 'configured',
      icon: Mail
    },
    {
      id: 'upload',
      label: 'Manual Upload',
      description: 'Upload invoices directly from your computer.',
      status: 'enabled',
      icon: Upload
    },
    {
      id: 'database',
      label: 'Postgres (Supabase)',
      description: 'Stores vendors, POs, invoices, and matches.',
      status: 'connected',
      icon: Database
    },
    {
      id: 'ocr',
      label: 'Landing AI ADE (DPT-2)',
      description: 'OCR and field extraction for invoices.',
      status: 'active',
      icon: Cpu
    }
  ];

  const getConnectionStatusStyle = (status) => {
    const activeStatuses = ['configured', 'connected', 'active', 'enabled'];
    if (activeStatuses.includes(status.toLowerCase())) {
      return 'bg-black text-white border-black';
    }
    return 'bg-white text-black border-gray-300';
  };

  const getConnectionStatusLabel = (status) => {
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  return (
    <div className="min-h-screen bg-white">
      <Sidebar activeItem={activeNav} />

      {/* Main Content */}
      <div className="lg:ml-[220px] p-4 sm:p-6 lg:p-8 transition-all">
        {/* Page Header */}
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-semibold text-black mb-2">
            Setup
          </h1>
          <p className="text-sm text-gray-500">
            Configure connections, matching rules, and system settings.
          </p>
        </div>

        {/* Cards Container */}
        <div className="max-w-[1000px] space-y-6">
          {/* Card 1: Intake & Connections */}
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <div className="mb-6">
              <h2 className="text-lg font-medium text-black mb-1">
                Intake & Connections
              </h2>
              <p className="text-sm text-gray-500">
                Manage integrations used for invoice processing.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {connections.map((connection) => {
                const Icon = connection.icon;
                return (
                  <div
                    key={connection.id}
                    className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                          <Icon className="w-5 h-5 text-gray-600" />
                        </div>
                        <div>
                          <h3 className="text-sm font-medium text-black">
                            {connection.label}
                          </h3>
                        </div>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${getConnectionStatusStyle(connection.status)}`}>
                        {getConnectionStatusLabel(connection.status)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mb-3">
                      {connection.description}
                    </p>
                    <button
                      onClick={() => handleConfigure(connection.id, connection.label)}
                      className="text-xs text-gray-600 hover:text-black transition-colors flex items-center gap-1"
                    >
                      Configure
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Card 2: Matching Rules */}
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <div className="mb-6">
              <h2 className="text-lg font-medium text-black mb-1">
                Matching Rules
              </h2>
              <p className="text-sm text-gray-500">
                Control how invoices are matched to purchase orders and when they are auto-approved.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* Amount Tolerance (Absolute) */}
              <div>
                <label className="block text-sm font-medium text-black mb-2">
                  Amount tolerance (absolute)
                </label>
                <Input
                  type="number"
                  value={settings.amountToleranceAbs}
                  onChange={(e) => setSettings({...settings, amountToleranceAbs: e.target.value})}
                  placeholder="1.00"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Maximum difference allowed between invoice total and PO total.
                </p>
              </div>

              {/* Amount Tolerance (%) */}
              <div>
                <label className="block text-sm font-medium text-black mb-2">
                  Amount tolerance (%)
                </label>
                <Input
                  type="number"
                  value={settings.amountTolerancePct}
                  onChange={(e) => setSettings({...settings, amountTolerancePct: e.target.value})}
                  placeholder="2"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Additional percentage tolerance based on invoice total.
                </p>
              </div>

              {/* Auto-approve Toggle */}
              <div className="sm:col-span-2">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="block text-sm font-medium text-black mb-1">
                      Auto-approve matched invoices
                    </label>
                    <p className="text-xs text-gray-500">
                      Applies when match confidence is high.
                    </p>
                  </div>
                  <Toggle
                    checked={settings.autoApprove}
                    onCheckedChange={(checked) => setSettings({...settings, autoApprove: checked})}
                  />
                </div>
              </div>

              {/* Handling Time */}
              <div>
                <label className="block text-sm font-medium text-black mb-2">
                  Average manual handling time per invoice
                </label>
                <div className="relative">
                  <Input
                    type="number"
                    value={settings.handlingTime}
                    onChange={(e) => setSettings({...settings, handlingTime: e.target.value})}
                    placeholder="5"
                    className="pr-20"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">
                    minutes
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Used to estimate Hours Saved on the dashboard.
                </p>
              </div>

              {/* Vendor Mismatch Policy */}
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-black mb-3">
                  Vendor mismatch policy
                </label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="vendorMismatch"
                      value="block"
                      checked={settings.vendorMismatch === 'block'}
                      onChange={(e) => setSettings({...settings, vendorMismatch: e.target.value})}
                      className="w-4 h-4 text-black border-gray-300 focus:ring-2 focus:ring-gray-300"
                    />
                    <span className="text-sm text-black">
                      Always block auto-matching when vendor mismatch detected
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="vendorMismatch"
                      value="warning"
                      checked={settings.vendorMismatch === 'warning'}
                      onChange={(e) => setSettings({...settings, vendorMismatch: e.target.value})}
                      className="w-4 h-4 text-black border-gray-300 focus:ring-2 focus:ring-gray-300"
                    />
                    <span className="text-sm text-black">
                      Allow auto-matching with warning
                    </span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Card 3: System Settings */}
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <div className="mb-6">
              <h2 className="text-lg font-medium text-black mb-1">
                System Settings
              </h2>
              <p className="text-sm text-gray-500">
                Technical defaults for how invoices are pulled and stored.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* Email Lookback Window */}
              <div>
                <label className="block text-sm font-medium text-black mb-2">
                  Email lookback (days)
                </label>
                <Input
                  type="number"
                  value={settings.emailLookback}
                  onChange={(e) => setSettings({...settings, emailLookback: e.target.value})}
                  placeholder="30"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Number of days back to search in the inbox for invoices.
                </p>
              </div>

              {/* Max Attachment Size */}
              <div>
                <label className="block text-sm font-medium text-black mb-2">
                  Max attachment size (MB)
                </label>
                <Input
                  type="number"
                  value={settings.maxAttachment}
                  onChange={(e) => setSettings({...settings, maxAttachment: e.target.value})}
                  placeholder="20"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Attachments larger than this are skipped.
                </p>
              </div>

              {/* Scheduler Interval */}
              <div>
                <label className="block text-sm font-medium text-black mb-2">
                  Auto-check interval (seconds)
                </label>
                <Input
                  type="number"
                  value={settings.schedulerInterval}
                  onChange={(e) => setSettings({...settings, schedulerInterval: e.target.value})}
                  placeholder="300"
                />
                <p className="text-xs text-gray-500 mt-1">
                  How often the email inbox is checked for new invoices.
                </p>
              </div>

              {/* Local Storage Path */}
              <div>
                <label className="block text-sm font-medium text-black mb-2">
                  Local invoice directory
                </label>
                <Input
                  type="text"
                  value={settings.storagePath}
                  onChange={(e) => setSettings({...settings, storagePath: e.target.value})}
                  placeholder="invoices/"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Path where invoice files are stored locally.
                </p>
              </div>
            </div>

            {/* Save Button */}
            <div className="mt-6 pt-6 border-t border-gray-200">
              <button
                onClick={handleSaveSettings}
                className="px-4 py-2.5 bg-black text-white border border-black rounded-lg font-medium hover:bg-gray-800 transition-colors"
              >
                Save settings
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Setup;
