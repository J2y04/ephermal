import { IconTrendingDown, IconTrendingUp } from "@tabler/icons-react"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export interface SectionCardsData {
  totalUsers: number
  signups30d: number
  signups7d: number
  wowDeltaPct: number | null // null = no prior-week baseline (avoids a divide-by-zero label)
  bannedCount: number
}

/** Real admin KPI cards using shadcn's dashboard-01 block markup, fed from
 *  actual Clerk-derived data (get_revenue/list_users via adminFetch) instead
 *  of the block's own hardcoded placeholder numbers. */
export function SectionCards({ data }: { data: SectionCardsData }) {
  const trendUp = (data.wowDeltaPct ?? 0) >= 0
  return (
    <div className="grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs sm:grid-cols-2 lg:grid-cols-4 lg:px-6 dark:*:data-[slot=card]:bg-card">
      <Card>
        <CardHeader>
          <CardDescription>Total Users</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums sm:text-3xl">
            {data.totalUsers.toLocaleString()}
          </CardTitle>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="text-muted-foreground">All signed-up accounts, live from Clerk</div>
        </CardFooter>
      </Card>
      <Card>
        <CardHeader>
          <CardDescription>Signups (30d)</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums sm:text-3xl">
            {data.signups30d.toLocaleString()}
          </CardTitle>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="text-muted-foreground">Rolling last 30 days</div>
        </CardFooter>
      </Card>
      <Card>
        <CardHeader>
          <CardDescription>Signups (7d)</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums sm:text-3xl">
            {data.signups7d.toLocaleString()}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              {trendUp ? <IconTrendingUp /> : <IconTrendingDown />}
              {data.wowDeltaPct === null ? "New" : `${data.wowDeltaPct >= 0 ? "+" : ""}${data.wowDeltaPct.toFixed(0)}%`}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="text-muted-foreground">
            {data.wowDeltaPct === null ? "No prior week to compare yet" : "vs. previous 7 days"}
          </div>
        </CardFooter>
      </Card>
      <Card>
        <CardHeader>
          <CardDescription>Banned</CardDescription>
          <CardTitle className={`text-2xl font-semibold tabular-nums sm:text-3xl ${data.bannedCount > 0 ? "text-destructive" : ""}`}>
            {data.bannedCount.toLocaleString()}
          </CardTitle>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="text-muted-foreground">Accounts currently banned</div>
        </CardFooter>
      </Card>
    </div>
  )
}
