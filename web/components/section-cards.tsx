import { IconBan, IconTrendingDown, IconTrendingUp, IconUserPlus, IconUsers } from "@tabler/icons-react"

import { Badge } from "@/components/ui/badge"
import Squircle from "@/app/admin/lib/Squircle"

export interface SectionCardsData {
  totalUsers: number
  signups30d: number
  signups7d: number
  wowDeltaPct: number | null // null = no prior-week baseline (avoids a divide-by-zero label)
  bannedCount: number
}

// Icon chip + big value + label, top-to-bottom — the same shell used by the .stat-card
// widgets on the user dashboard (dashboard.html). Uses the SAME Squircle component (true
// superellipse clip-path, not a plain CSS border-radius) as every other "widget" card in
// this admin panel (e.g. the Recent Signups panel below, admin/page.tsx) — a plain
// border-radius reads as a harsher, more mechanical corner at this size, which is exactly
// why this looked "rectangly" next to a real squircle despite using the same radius number.
function StatWidget({
  icon, iconBg, iconColor, value, label, danger, action,
}: {
  icon: React.ReactNode
  iconBg: string
  iconColor: string
  value: React.ReactNode
  label: React.ReactNode
  danger?: boolean
  action?: React.ReactNode
}) {
  return (
    <Squircle
      cornerRadius={24}
      className="widget-shadow flex min-h-[176px] flex-col justify-between border border-eph-border bg-eph-surface p-7 transition-transform duration-300 ease-out hover:-translate-y-0.5"
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-[12px]" style={{ background: iconBg }}>
        <span className="[&>svg]:h-[17px] [&>svg]:w-[17px]" style={{ color: iconColor }}>{icon}</span>
      </div>
      <div className="mt-6">
        <div className={`flex items-baseline gap-2 text-[30px] font-semibold leading-none tracking-tight tabular-nums ${danger ? "text-destructive" : "text-eph-text"}`}>
          {value}
          {action}
        </div>
        <div className="mt-3 max-w-[19ch] text-[15px] leading-6 text-eph-muted text-pretty">{label}</div>
      </div>
    </Squircle>
  )
}

/** Real admin KPI widgets, styled to match the user dashboard's .stat-card widgets
 *  (icon chip, big number, label) — fed from actual Clerk-derived data (get_revenue/
 *  list_users via adminFetch), not the shadcn block's hardcoded placeholder numbers. */
export function SectionCards({ data }: { data: SectionCardsData }) {
  const trendUp = (data.wowDeltaPct ?? 0) >= 0
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatWidget
        icon={<IconUsers />}
        iconBg="rgba(6,214,199,0.12)"
        iconColor="#06d6c7"
        value={data.totalUsers.toLocaleString()}
        label="Total Users — all signed-up accounts, live from Clerk"
      />
      <StatWidget
        icon={<IconUserPlus />}
        iconBg="rgba(6,214,199,0.12)"
        iconColor="#06d6c7"
        value={data.signups30d.toLocaleString()}
        label="Signups (30d) — rolling last 30 days"
      />
      <StatWidget
        icon={<IconTrendingUp />}
        iconBg="rgba(52,211,153,0.12)"
        iconColor="#34d399"
        value={data.signups7d.toLocaleString()}
        label={data.wowDeltaPct === null ? "Signups (7d) — no prior week to compare yet" : "Signups (7d) — vs. previous 7 days"}
        action={
          <Badge variant="outline" className="ml-1">
            {trendUp ? <IconTrendingUp /> : <IconTrendingDown />}
            {data.wowDeltaPct === null ? "New" : `${data.wowDeltaPct >= 0 ? "+" : ""}${data.wowDeltaPct.toFixed(0)}%`}
          </Badge>
        }
      />
      <StatWidget
        icon={<IconBan />}
        iconBg="rgba(248,113,113,0.12)"
        iconColor="#f87171"
        value={data.bannedCount.toLocaleString()}
        label="Banned — accounts currently banned"
        danger={data.bannedCount > 0}
      />
    </div>
  )
}
