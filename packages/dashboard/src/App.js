import { useState, useCallback } from 'react';
import { usePolling } from './hooks/usePolling';
import * as api from './api';
import { MetricCard } from './components/MetricCard';
import { LatencyChart } from './components/LatencyChart';
import { CostChart } from './components/CostChart';
import { ModelTable } from './components/ModelTable';
import { ErrorLog } from './components/ErrorLog';
import { TraceList } from './components/TraceList';
import { AlertPanel } from './components/AlertPanel';
function App() {
    const [activeTab, setActiveTab] = useState('overview');
    const statsFetcher = useCallback(() => api.getStats(), []);
    const latencyFetcher = useCallback(() => api.getLatencyTimeseries(), []);
    const costFetcher = useCallback(() => api.getCostTimeseries(), []);
    const modelFetcher = useCallback(() => api.getModelBreakdown(), []);
    const errorFetcher = useCallback(() => api.getErrorLog(), []);
    const { data: stats } = usePolling(statsFetcher, 10000);
    const { data: latencyData } = usePolling(latencyFetcher, 30000);
    const { data: costData } = usePolling(costFetcher, 30000);
    const { data: modelData } = usePolling(modelFetcher, 30000);
    const { data: errorData } = usePolling(errorFetcher, 15000);
    const formatNumber = (n) => {
        if (n >= 1_000_000)
            return `${(n / 1_000_000).toFixed(1)}M`;
        if (n >= 1_000)
            return `${(n / 1_000).toFixed(1)}K`;
        return n.toString();
    };
    return (<div className="min-h-screen bg-bg-primary">
      {/* Header */}
      <header className="border-b border-border bg-bg-surface/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
              </svg>
            </div>
            <h1 className="text-lg font-semibold text-text-primary">AI Service Monitor</h1>
          </div>
          <div className="flex items-center gap-1 bg-bg-elevated rounded-lg p-1">
            {['overview', 'traces', 'alerts'].map((tab) => (<button key={tab} onClick={() => setActiveTab(tab)} className={`px-4 py-1.5 rounded-md text-sm transition-colors capitalize ${activeTab === tab
                ? 'bg-accent text-white'
                : 'text-text-secondary hover:text-text-primary'}`}>
                {tab}
              </button>))}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {activeTab === 'overview' && (<>
            {/* Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard title="Total Calls" value={stats ? formatNumber(stats.total_calls) : '\u2014'} subtitle="all time"/>
              <MetricCard title="Avg Latency" value={stats ? `${Math.round(stats.avg_latency)}ms` : '\u2014'} subtitle="across all models"/>
              <MetricCard title="Error Rate" value={stats ? `${stats.error_rate.toFixed(1)}%` : '\u2014'} subtitle="of total calls"/>
              <MetricCard title="Total Cost" value={stats ? `$${stats.total_cost.toFixed(2)}` : '\u2014'} subtitle="estimated"/>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <LatencyChart data={latencyData || []}/>
              <CostChart data={costData || []}/>
            </div>

            {/* Model Breakdown */}
            <ModelTable data={modelData || []}/>

            {/* Error Log */}
            <ErrorLog errors={errorData?.errors || []} total={errorData?.total || 0}/>
          </>)}

        {activeTab === 'traces' && <TraceList />}
        {activeTab === 'alerts' && <AlertPanel />}
      </main>
    </div>);
}
export default App;
//# sourceMappingURL=App.js.map