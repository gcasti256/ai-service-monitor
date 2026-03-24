export declare const getStats: (params?: Record<string, string>) => Promise<any>;
export declare const getLatencyTimeseries: (params?: Record<string, string>) => Promise<any[]>;
export declare const getModelBreakdown: (params?: Record<string, string>) => Promise<any[]>;
export declare const getCostTimeseries: (params?: Record<string, string>) => Promise<any[]>;
export declare const getErrorLog: (params?: Record<string, string>) => Promise<any>;
export declare const getTraces: (params?: Record<string, string>) => Promise<{
    traces: any[];
    total: number;
}>;
export declare const getTraceById: (id: string) => Promise<any>;
export declare const getTraceGroup: (traceId: string) => Promise<any[]>;
export declare const getAlertRules: () => Promise<any[]>;
export declare const createAlertRule: (rule: any) => Promise<any>;
export declare const updateAlertRule: (id: string, rule: any) => Promise<any>;
export declare const deleteAlertRule: (id: string) => Promise<any>;
export declare const getAlertEvents: (params?: Record<string, string>) => Promise<any[]>;
export declare const getHealth: () => Promise<{
    status: string;
    timestamp: string;
}>;
//# sourceMappingURL=api.d.ts.map