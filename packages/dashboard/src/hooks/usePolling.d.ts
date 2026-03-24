export declare function usePolling<T>(fetcher: () => Promise<T>, intervalMs?: number): {
    data: T | null;
    loading: boolean;
    error: Error | null;
    refresh: () => Promise<void>;
};
//# sourceMappingURL=usePolling.d.ts.map