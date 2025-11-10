import React from 'react';

const StatsCard = ({ label, value, subtitle, onClick }) => {
  return (
    <div
      className={`bg-white border border-gray-200 rounded-xl p-5 transition-colors ${
        onClick ? 'cursor-pointer hover:bg-gray-50' : ''
      }`}
      onClick={onClick}
    >
      <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">
        {label}
      </p>
      <p className="text-2xl sm:text-3xl font-semibold text-black mb-1">
        {value}
      </p>
      {subtitle && (
        <p className="text-xs text-gray-400">
          {subtitle}
        </p>
      )}
    </div>
  );
};

export default StatsCard;
