import { useState } from 'react';
import type { ErrorEntry } from '../api';

interface ErrorLogProps {
  errors: ErrorEntry[];
  total: number;
}

function formatRequestBody(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

export function ErrorLog({ errors, total }: ErrorLogProps) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="bg-bg-surface border border-border rounded-lg p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-text-primary font-medium">Error Log</h3>
        <span className="text-text-muted text-sm">{total} total errors</span>
      </div>
      <div className="space-y-2">
        {errors.length === 0 ? (
          <div className="text-text-muted text-sm py-8 text-center">No errors recorded</div>
        ) : (
          errors.map((err) => (
            <div key={err.id} className="border border-border/50 rounded-lg overflow-hidden">
              <button
                onClick={() => setExpanded(expanded === err.id ? null : err.id)}
                aria-expanded={expanded === err.id}
                className="w-full flex items-center justify-between p-3 hover:bg-bg-hover transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full bg-error flex-shrink-0" />
                  <div>
                    <span className="text-text-primary text-sm">{err.error_type}</span>
                    <span className="text-text-muted text-xs ml-2">{err.model}</span>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs text-text-muted">
                  <span>{Math.round(err.duration)}ms</span>
                  <span>{new Date(err.timestamp).toLocaleString()}</span>
                  <span>{expanded === err.id ? '\u25B2' : '\u25BC'}</span>
                </div>
              </button>
              {expanded === err.id && (
                <div className="border-t border-border/50 p-3 bg-bg-elevated text-sm space-y-2">
                  <div>
                    <span className="text-text-muted">Message: </span>
                    <span className="text-error">{err.error_message}</span>
                  </div>
                  <div>
                    <span className="text-text-muted">Trace: </span>
                    <span className="text-text-secondary font-mono text-xs">{err.trace_id}</span>
                  </div>
                  <div>
                    <span className="text-text-muted">Endpoint: </span>
                    <span className="text-text-secondary">{err.endpoint}</span>
                  </div>
                  <div className="flex gap-4">
                    <span className="text-text-muted">Tokens: {err.tokens_input} in / {err.tokens_output} out</span>
                    <span className="text-text-muted">Cost: ${err.cost_total.toFixed(4)}</span>
                  </div>
                  {err.request_body && (
                    <div>
                      <span className="text-text-muted">Request:</span>
                      <pre className="mt-1 p-2 bg-bg-primary rounded text-xs text-text-secondary overflow-x-auto">
                        {formatRequestBody(err.request_body)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
