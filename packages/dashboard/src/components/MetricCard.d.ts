interface MetricCardProps {
    title: string;
    value: string | number;
    subtitle?: string;
    trend?: 'up' | 'down' | 'neutral';
    trendValue?: string;
    icon?: React.ReactNode;
}
export declare function MetricCard({ title, value, subtitle, trend, trendValue, icon }: MetricCardProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=MetricCard.d.ts.map