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
export declare function ModelTable({ data }: ModelTableProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=ModelTable.d.ts.map