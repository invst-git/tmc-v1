import React, { useMemo, useCallback } from 'react';

const LineChart = ({ data, view = 'invoices', width = 600, height = 280 }) => {
  const padding = { top: 20, right: 20, bottom: 30, left: 40 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Get label based on view mode
  const getValueLabel = (value) => {
    switch (view) {
      case 'amount':
        return `$${value.toLocaleString()}`;
      case 'automatch':
        return `${value}%`;
      case 'invoices':
      default:
        return value;
    }
  };

  const getTooltipLabel = (value) => {
    switch (view) {
      case 'amount':
        return `$${value.toLocaleString()}`;
      case 'automatch':
        return `${value}% auto-matched`;
      case 'invoices':
      default:
        return `${value} invoices`;
    }
  };

  const selectValue = useCallback((d) => {
    if (view === 'amount') return Number(d.amount ?? 0);
    if (view === 'automatch') return Number(d.autoMatchPercent ?? 0);
    return Number(d.count ?? 0);
  }, [view]);

  const { points, maxValue, minValue, yTicks } = useMemo(() => {
    if (!data || data.length === 0) return { points: '', maxValue: 0, minValue: 0, yTicks: [] };

    const values = data.map(selectValue);
    let max = Math.max(...values);
    let min = Math.min(...values);
    if (view === 'automatch') {
      // Normalize percentage axis to 0–100 for readability
      min = 0;
      max = 100;
    }
    const range = max - min;
    
    // Calculate y-axis ticks
    const tickCount = 5;
    const tickStep = Math.ceil((range || 1) / (tickCount - 1));
    const ticks = [];
    for (let i = 0; i < tickCount; i++) {
      ticks.push(min + (tickStep * i));
    }

    // Generate line path
    const pointsArray = data.map((d, i) => {
      const x = (i / (data.length - 1)) * chartWidth;
      const v = selectValue(d);
      const y = chartHeight - ((v - min) / (max - min || 1)) * chartHeight;
      return `${x},${y}`;
    });

    return {
      points: pointsArray.join(' '),
      maxValue: max,
      minValue: min,
      yTicks: ticks
    };
  }, [data, chartWidth, chartHeight, view, selectValue]);

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        <p>No data available</p>
      </div>
    );
  }

  // Show every 5th date label to avoid overcrowding
  const xLabels = data.filter((_, i) => i % 5 === 0 || i === data.length - 1);

  return (
    <svg width={width} height={height} className="overflow-visible">
      <g transform={`translate(${padding.left}, ${padding.top})`}>
        {/* Grid lines */}
        {yTicks.map((tick, i) => {
          const y = chartHeight - ((tick - minValue) / (maxValue - minValue || 1)) * chartHeight;
          return (
            <g key={i}>
              <line
                x1={0}
                y1={y}
                x2={chartWidth}
                y2={y}
                stroke="#E5E5E5"
                strokeWidth="1"
              />
              <text
                x={-10}
                y={y}
                textAnchor="end"
                dominantBaseline="middle"
                className="text-[11px] fill-gray-500"
              >
                {getValueLabel(tick)}
              </text>
            </g>
          );
        })}

        {/* X-axis */}
        <line
          x1={0}
          y1={chartHeight}
          x2={chartWidth}
          y2={chartHeight}
          stroke="#D1D1D1"
          strokeWidth="1.5"
        />

        {/* Y-axis */}
        <line
          x1={0}
          y1={0}
          x2={0}
          y2={chartHeight}
          stroke="#D1D1D1"
          strokeWidth="1.5"
        />

        {/* Line path */}
        <polyline
          points={points}
          fill="none"
          stroke="#000000"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Data points */}
        {data.map((d, i) => {
          const x = (i / (data.length - 1)) * chartWidth;
          const v = selectValue(d);
          const y = chartHeight - ((v - minValue) / (maxValue - minValue || 1)) * chartHeight;
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r="3"
              fill="#000000"
              className="transition-all hover:r-4"
            >
              <title>{`${d.displayDate}: ${getTooltipLabel(selectValue(d))}`}</title>
            </circle>
          );
        })}

        {/* X-axis labels */}
        {xLabels.map((d, i) => {
          const index = data.indexOf(d);
          const x = (index / (data.length - 1)) * chartWidth;
          return (
            <text
              key={i}
              x={x}
              y={chartHeight + 20}
              textAnchor="middle"
              className="text-[10px] fill-gray-500"
            >
              {d.displayDate}
            </text>
          );
        })}
      </g>
    </svg>
  );
};

export default LineChart;
