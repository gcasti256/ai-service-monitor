import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface CostChartProps {
  data: Array<{ timestamp: string; value: number; count: number }>;
}

const CHART_COLORS = {
  grid: 'var(--color-chart-grid)',
  axis: 'var(--color-chart-axis)',
  bar: 'var(--color-accent)',
  tooltipBg: 'var(--color-chart-tooltip-bg)',
  tooltipBorder: 'var(--color-chart-tooltip-border)',
  tooltipText: 'var(--color-chart-tooltip-text)',
};

export function CostChart({ data }: CostChartProps) {
  const formatted = data.map(d => ({
    ...d,
    date: new Date(d.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    cost: Math.round(d.value * 10000) / 10000,
  }));

  return (
    <div className="bg-bg-surface border border-border rounded-lg p-5">
      <h3 className="text-text-primary font-medium mb-4">Daily Cost</h3>
      <div className="h-64">
        {formatted.length === 0 ? (
          <div className="h-full flex items-center justify-center text-text-muted text-sm">No cost data</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={formatted}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
              <XAxis dataKey="date" stroke={CHART_COLORS.axis} fontSize={12} />
              <YAxis stroke={CHART_COLORS.axis} fontSize={12} tickFormatter={(v) => `$${v}`} />
              <Tooltip
                contentStyle={{ backgroundColor: CHART_COLORS.tooltipBg, border: `1px solid ${CHART_COLORS.tooltipBorder}`, borderRadius: '8px', color: CHART_COLORS.tooltipText }}
                formatter={(value: number) => [`$${value.toFixed(4)}`, 'Cost']}
              />
              <Bar dataKey="cost" fill={CHART_COLORS.bar} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
