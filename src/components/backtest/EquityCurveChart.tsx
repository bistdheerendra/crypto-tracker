"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { SimulatorResult } from "@/lib/backtest/simulator";

interface EquityCurveChartProps {
  data: SimulatorResult["equityCurve"];
  startingCapital: number;
}

export function EquityCurveChart({ data, startingCapital }: EquityCurveChartProps) {
  const chartData = data.map((point) => ({
    ...point,
    label: new Date(point.date).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    }),
    up: point.equity >= startingCapital,
  }));

  const finalEquity = data[data.length - 1]?.equity ?? startingCapital;
  const strokeColor = finalEquity >= startingCapital ? "#2ee6a8" : "#ff5c72";

  return (
    <div className="h-64 sm:h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <XAxis
            dataKey="label"
            tick={{ fill: "#8b93a7", fontSize: 11 }}
            axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fill: "#8b93a7", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
            width={48}
          />
          <Tooltip
            contentStyle={{
              background: "#0d1224",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: "#8b93a7" }}
            formatter={(value) => [`$${Number(value).toLocaleString()}`, "Equity"]}
          />
          <ReferenceLine
            y={startingCapital}
            stroke="rgba(255,255,255,0.15)"
            strokeDasharray="4 4"
          />
          <Line
            type="monotone"
            dataKey="equity"
            stroke={strokeColor}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: strokeColor }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
