import React from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, AlertTriangle, CreditCard } from 'lucide-react';

const Sidebar = ({ activeItem }) => {
  const navigate = useNavigate();

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/' },
    { id: 'vendors', label: 'Vendors', icon: Users, path: '/vendors' },
    { id: 'exceptions', label: 'Exceptions', icon: AlertTriangle, path: '/exceptions' },
    { id: 'payments', label: 'Payments', icon: CreditCard, path: '/payments' }
  ];

  const handleNavigate = (path) => {
    navigate(path);
  };

  return (
    <div className="fixed left-0 top-0 h-screen w-[220px] bg-white border-r border-gray-200 flex flex-col hidden lg:flex z-50">
      {/* Header */}
      <div className="px-6 py-6">
        <h1 className="text-base font-semibold text-black whitespace-nowrap">
          The <span className="font-signature italic">Matching</span> Company
        </h1>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 mt-6">
        <div className="space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeItem === item.id;
            
            return (
              <button
                key={item.id}
                onClick={() => handleNavigate(item.path)}
                className={`
                  w-full flex items-center gap-3 px-4 py-2.5 rounded-full
                  transition-all duration-200 relative
                  ${
                    isActive
                      ? 'bg-[#F2F2F2] text-black'
                      : 'bg-white text-black border border-gray-200 hover:bg-gray-50'
                  }
                `}
              >
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-black rounded-r-full" />
                )}
                <Icon className="w-4 h-4" strokeWidth={2} />
                <span className="text-[14px] font-medium">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Footer */}
      <div className="px-6 py-6">
        <div className="w-10 h-10 rounded-full bg-white border border-gray-300 flex items-center justify-center">
          <span className="text-[13px] font-semibold text-black">Ax</span>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
