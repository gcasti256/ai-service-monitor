import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface LatencyChartProps {
  data: Array<{ timestamp: string; value: number; count: number }>;
}

const CHART_COLORS = {
  grid: 'var(--color-chart-grid)',
  axis: 'var(--color-chart-axis)',
  line: 'var(--color-accent)',
  tooltipBg: 'var(--color-chart-tooltip-bg)',
  tooltipBorder: 'var(--color-chart-tooltip-border)',
  tooltipText: 'var(--color-chart-tooltip-text)',
};

export function LatencyChart({ data }: LatencyChartProps) {
  const formatted = data.map(d => ({
    ...d,
    time: new Date(d.timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit' }),
    latency: Math.round(d.value),
  }));

  return (
    <div className="bg-bg-surface border border-border rounded-lg p-5">
      <h3 className="text-text-primary font-medium mb-4">Latency Over Time</h3>
      <div className="h-64">
        {formatted.length === 0 ? (
          <div className="h-full flex items-center justify-center text-text-muted text-sm">No latency data</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={formatted}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
              <XAxis dataKey="time" stroke={CHART_COLORS.axis} fontSize={12} />
              <YAxis stroke={CHART_COLORS.axis} fontSize={12} tickFormatter={(v) => `${v}ms`} />
              <Tooltip
                contentStyle={{ backgroundColor: CHART_COLORS.tooltipBg, border: `1px solid ${CHART_COLORS.tooltipBorder}`, borderRadius: '8px', color: CHART_COLORS.tooltipText }}
                formatter={(value: number) => [`${value}ms`, 'Avg Latency']}
              />
              <Line type="monotone" dataKey="latency" stroke={CHART_COLORS.line} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
