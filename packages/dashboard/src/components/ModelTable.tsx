interface ModelData {
  model: string;
  provider: string;
  calls: number;
  avg_latency: number;
  total_tokens: number;
  total_cost: number;
  error_rate: number;
}

interface ModelTableProps {
  data: ModelData[];
}

export function ModelTable({ data }: ModelTableProps) {
  return (
    <div className="bg-bg-surface border border-border rounded-lg p-5">
      <h3 className="text-text-primary font-medium mb-4">Model Breakdown</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-3 px-2 text-text-secondary font-medium">Model</th>
              <th className="text-left py-3 px-2 text-text-secondary font-medium">Provider</th>
              <th className="text-right py-3 px-2 text-text-secondary font-medium">Calls</th>
              <th className="text-right py-3 px-2 text-text-secondary font-medium">Avg Latency</th>
              <th className="text-right py-3 px-2 text-text-secondary font-medium">Tokens</th>
              <th className="text-right py-3 px-2 text-text-secondary font-medium">Cost</th>
              <th className="text-right py-3 px-2 text-text-secondary font-medium">Error Rate</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={`${row.provider}-${row.model}`} className="border-b border-border/50 hover:bg-bg-hover transition-colors">
                <td className="py-3 px-2 text-text-primary font-mono text-xs">{row.model}</td>
                <td className="py-3 px-2">
                  <span className="px-2 py-0.5 rounded-full text-xs bg-bg-elevated text-text-secondary">
                    {row.provider}
                  </span>
                </td>
                <td className="py-3 px-2 text-right text-text-primary">{row.calls.toLocaleString()}</td>
                <td className="py-3 px-2 text-right text-text-primary">{Math.round(row.avg_latency)}ms</td>
                <td className="py-3 px-2 text-right text-text-primary">{row.total_tokens.toLocaleString()}</td>
                <td className="py-3 px-2 text-right text-accent font-medium">${row.total_cost.toFixed(4)}</td>
                <td className="py-3 px-2 text-right">
                  <span className={row.error_rate > 5 ? 'text-error' : row.error_rate > 1 ? 'text-warning' : 'text-success'}>
                    {row.error_rate.toFixed(1)}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
