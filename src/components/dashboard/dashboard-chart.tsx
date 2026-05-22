import { EmptyState } from "@/components/ui/empty-state";
import { TrendingUp } from "lucide-react";

export type DashboardChartPoint = {
  label: string;
  value: number;
};

function buildPath(points: { x: number; y: number }[]) {
  if (points.length === 0) return "";

  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
}

export function DashboardChart({
  points,
  emptyMessage = "Growth data will appear as leads and review requests are created.",
}: {
  points: DashboardChartPoint[];
  emptyMessage?: string;
}) {
  const total = points.reduce((sum, point) => sum + point.value, 0);

  if (points.length === 0 || total === 0) {
    return (
      <EmptyState
        icon={TrendingUp}
        title="No growth signal yet"
        description={emptyMessage}
        className="min-h-72"
      />
    );
  }

  const width = 720;
  const height = 260;
  const paddingX = 30;
  const paddingTop = 26;
  const paddingBottom = 44;
  const chartWidth = width - paddingX * 2;
  const chartHeight = height - paddingTop - paddingBottom;
  const maxValue = Math.max(...points.map((point) => point.value), 1);

  const coords = points.map((point, index) => {
    const x =
      points.length === 1
        ? width / 2
        : paddingX + (index / (points.length - 1)) * chartWidth;
    const y = paddingTop + (1 - point.value / maxValue) * chartHeight;
    return { x, y };
  });

  const linePath = buildPath(coords);
  const areaPath = `${linePath} L ${coords[coords.length - 1].x} ${
    height - paddingBottom
  } L ${coords[0].x} ${height - paddingBottom} Z`;
  const first = points[0];
  const middle = points[Math.floor(points.length / 2)];
  const last = points[points.length - 1];

  return (
    <div className="relative min-h-72">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-72 w-full overflow-visible text-foreground"
        role="img"
        aria-label="Growth over time"
      >
        <defs>
          <linearGradient id="dashboard-growth-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.14" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {[0, 0.5, 1].map((line) => {
          const y = paddingTop + line * chartHeight;
          return (
            <line
              key={line}
              x1={paddingX}
              x2={width - paddingX}
              y1={y}
              y2={y}
              stroke="currentColor"
              strokeOpacity="0.08"
            />
          );
        })}

        <path d={areaPath} fill="url(#dashboard-growth-area)" />
        <path
          d={linePath}
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3"
        />

        {coords.map((coord, index) => (
          <circle
            key={`${points[index].label}-${index}`}
            cx={coord.x}
            cy={coord.y}
            r={points[index].value === maxValue ? 4.5 : 3.2}
            fill="currentColor"
            opacity={points[index].value === 0 ? 0.3 : 1}
          />
        ))}

        <text
          x={paddingX}
          y={height - 14}
          className="fill-muted-foreground text-[10px] tracking-[0.08em]"
        >
          {first.label}
        </text>
        <text
          x={width / 2}
          y={height - 14}
          textAnchor="middle"
          className="fill-muted-foreground text-[10px] tracking-[0.08em]"
        >
          {middle.label}
        </text>
        <text
          x={width - paddingX}
          y={height - 14}
          textAnchor="end"
          className="fill-muted-foreground text-[10px] tracking-[0.08em]"
        >
          {last.label}
        </text>
      </svg>
    </div>
  );
}
