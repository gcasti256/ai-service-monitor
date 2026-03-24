interface ErrorEntry {
    id: string;
    trace_id: string;
    timestamp: string;
    model: string;
    provider: string;
    endpoint: string;
    duration: number;
    error_message: string;
    error_type: string;
    tokens_input: number;
    tokens_output: number;
    cost_total: number;
    request_body: string | null;
}
interface ErrorLogProps {
    errors: ErrorEntry[];
    total: number;
}
export declare function ErrorLog({ errors, total }: ErrorLogProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=ErrorLog.d.ts.map