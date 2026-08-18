"use client"

import * as React from "react"
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

export interface SignupPoint { date: string; count: number }

const chartConfig = {
  count: {
    label: "Signups",
    color: "var(--primary)",
  },
} satisfies ChartConfig

/** Real signups-over-time chart from get_revenue's signups array (Clerk-derived,
 *  same data source the original Tremor AreaChart used) instead of the shadcn
 *  block's hardcoded desktop/mobile placeholder series. */
export function ChartAreaInteractive({ data }: { data: SignupPoint[] }) {
  return (
    <Card className="widget-shadow rounded-[22px] border-eph-border bg-eph-surface">
      <CardHeader>
        <CardTitle>Signups</CardTitle>
        <CardDescription>Last 30 days, live from Clerk</CardDescription>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        <ChartContainer config={chartConfig} className="aspect-auto h-[250px] w-full">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="fillCount" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-count)" stopOpacity={1.0} />
                <stop offset="95%" stopColor="var(--color-count)" stopOpacity={0.1} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              tickFormatter={(value) => new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  labelFormatter={(value) => new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  indicator="dot"
                />
              }
            />
            <Area dataKey="count" type="natural" fill="url(#fillCount)" stroke="var(--color-count)" />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
