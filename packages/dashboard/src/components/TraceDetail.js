import { useState, useEffect } from 'react';
import * as api from '../api';
export function TraceDetail({ traceId, onClose }) {
    const [spans, setSpans] = useState([]);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        api.getTraceGroup(traceId).then((data) => {
            setSpans(data);
            setLoading(false);
        });
    }, [traceId]);
    if (loading)
        return <div className="text-text-muted p-8 text-center">Loading trace...</div>;
    return (<div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-bg-surface border border-border rounded-xl max-w-3xl w-full max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-border sticky top-0 bg-bg-surface">
          <div>
            <h2 className="text-text-primary font-semibold">Trace Detail</h2>
            <span className="text-text-muted text-xs font-mono">{traceId}</span>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary transition-colors text-xl">&times;</button>
        </div>
        <div className="p-5 space-y-3">
          {spans.map((span, i) => (<div key={span.id} className="border border-border/50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${span.status === 'success' ? 'bg-success' : 'bg-error'}`}/>
                  <span className="text-text-primary text-sm font-medium">Span {i + 1}</span>
                  <span className="text-text-muted text-xs font-mono">{span.span_id}</span>
                </div>
                <span className="text-text-secondary text-sm">{Math.round(span.duration)}ms</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-text-muted">Model:</span> <span className="text-text-primary">{span.model}</span></div>
                <div><span className="text-text-muted">Provider:</span> <span className="text-text-primary">{span.provider}</span></div>
                <div><span className="text-text-muted">Endpoint:</span> <span className="text-text-primary">{span.endpoint}</span></div>
                <div><span className="text-text-muted">Status:</span> <span className={span.status === 'success' ? 'text-success' : 'text-error'}>{span.status} {span.status_code || ''}</span></div>
                <div><span className="text-text-muted">Tokens:</span> <span className="text-text-primary">{span.tokens_input} in / {span.tokens_output} out</span></div>
                <div><span className="text-text-muted">Cost:</span> <span className="text-accent">${span.cost_total.toFixed(4)}</span></div>
              </div>
              {span.error_message && (<div className="mt-2 p-2 bg-error/10 border border-error/20 rounded text-xs text-error">
                  {span.error_type}: {span.error_message}
                </div>)}
              {span.response_body && (<div className="mt-2">
                  <span className="text-text-muted text-xs">Response:</span>
                  <pre className="mt-1 p-2 bg-bg-primary rounded text-xs text-text-secondary overflow-x-auto max-h-32">
                    {span.response_body}
                  </pre>
                </div>)}
            </div>))}
        </div>
      </div>
    </div>);
}
//# sourceMappingURL=TraceDetail.js.map