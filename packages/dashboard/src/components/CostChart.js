import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
export function CostChart({ data }) {
    const formatted = data.map(d => ({
        ...d,
        date: new Date(d.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        cost: parseFloat(d.value.toFixed(4)),
    }));
    return (<div className="bg-bg-surface border border-border rounded-lg p-5">
      <h3 className="text-text-primary font-medium mb-4">Daily Cost</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={formatted}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a32"/>
            <XAxis dataKey="date" stroke="#71717a" fontSize={12}/>
            <YAxis stroke="#71717a" fontSize={12} tickFormatter={(v) => `$${v}`}/>
            <Tooltip contentStyle={{ backgroundColor: '#1a1a1e', border: '1px solid #2a2a32', borderRadius: '8px', color: '#e4e4e7' }} formatter={(value) => [`$${value.toFixed(4)}`, 'Cost']}/>
            <Bar dataKey="cost" fill="#6366f1" radius={[4, 4, 0, 0]}/>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>);
}
//# sourceMappingURL=CostChart.js.map