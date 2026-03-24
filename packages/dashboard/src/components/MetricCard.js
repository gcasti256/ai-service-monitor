export function MetricCard({ title, value, subtitle, trend, trendValue, icon }) {
    const trendColor = trend === 'up' ? 'text-error' : trend === 'down' ? 'text-success' : 'text-text-muted';
    const trendArrow = trend === 'up' ? '\u2191' : trend === 'down' ? '\u2193' : '';
    return (<div className="bg-bg-surface border border-border rounded-lg p-5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-text-secondary text-sm">{title}</span>
        {icon && <span className="text-text-muted">{icon}</span>}
      </div>
      <div className="text-2xl font-semibold text-text-primary">{value}</div>
      <div className="flex items-center gap-2 mt-1">
        {trendValue && (<span className={`text-sm ${trendColor}`}>
            {trendArrow} {trendValue}
          </span>)}
        {subtitle && <span className="text-text-muted text-sm">{subtitle}</span>}
      </div>
    </div>);
}
//# sourceMappingURL=MetricCard.js.map