import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface LatencyChartProps {
  data: Array<{ timestamp: string; value: number; count: number }>;
}

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
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={formatted}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a32" />
            <XAxis dataKey="time" stroke="#71717a" fontSize={12} />
            <YAxis stroke="#71717a" fontSize={12} tickFormatter={(v) => `${v}ms`} />
            <Tooltip
              contentStyle={{ backgroundColor: '#1a1a1e', border: '1px solid #2a2a32', borderRadius: '8px', color: '#e4e4e7' }}
              formatter={(value: number) => [`${value}ms`, 'Avg Latency']}
            />
            <Line type="monotone" dataKey="latency" stroke="#6366f1" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
