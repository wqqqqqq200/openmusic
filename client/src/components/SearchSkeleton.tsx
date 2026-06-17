export default function SearchSkeleton() {
  return (
    <div className="space-y-2 animate-fade-in">
      {Array.from({ length: 7 }, (_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 p-3 rounded-xl"
          style={{ animationDelay: `${i * 60}ms` }}
        >
          <div className="w-12 h-12 rounded-lg skeleton-shimmer flex-shrink-0" />
          <div className="flex-1 space-y-2.5 min-w-0">
            <div
              className="h-3.5 rounded-md skeleton-shimmer"
              style={{ width: `${55 + (i % 3) * 12}%` }}
            />
            <div
              className="h-3 rounded-md skeleton-shimmer"
              style={{ width: `${35 + (i % 2) * 15}%` }}
            />
          </div>
          <div className="w-10 h-5 rounded-full skeleton-shimmer flex-shrink-0" />
        </div>
      ))}
      <p className="text-center text-xs text-netease-muted/60 pt-2 animate-pulse">
        正在搜索...
      </p>
    </div>
  );
}
