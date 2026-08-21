-- Contribution margin inputs.
--
-- Ephermal computed gross margin (price - COGS) and called the result a margin.
-- That is not what a merchant means when they ask whether an order made money:
-- payment processing, shipping they absorb, and per-order handling all come out
-- before contribution. A 4x ROAS on a 22% gross margin product can still lose
-- money once those land, which is exactly the case the Profit Tracker exists to
-- surface.
--
-- Every column defaults to 0, so a merchant who has not entered fees sees the
-- identical numbers they saw before this migration. Contribution only diverges
-- from gross once real inputs exist, and the UI labels which one it is showing.

alter table public.user_integrations
  add column if not exists fee_payment_pct numeric(6,3) not null default 0,
  add column if not exists fee_payment_fixed_cents integer not null default 0,
  add column if not exists fee_shipping_cents integer not null default 0,
  add column if not exists fee_other_pct numeric(6,3) not null default 0;

comment on column public.user_integrations.fee_payment_pct is
  'Payment processor percentage of order value, e.g. 2.9 for Shopify Payments. 0 = not configured.';
comment on column public.user_integrations.fee_payment_fixed_cents is
  'Fixed payment processor fee per order in cents, e.g. 30. 0 = not configured.';
comment on column public.user_integrations.fee_shipping_cents is
  'Shipping cost per order the merchant absorbs, in cents. 0 = not configured or fully passed to the customer.';
comment on column public.user_integrations.fee_other_pct is
  'Other variable cost as a percentage of order value: pick and pack, marketplace fees, transaction levies. 0 = not configured.';

-- Bounds rather than blind trust. A percentage over 100 is always a typo, and a
-- negative fee would silently inflate margin, which is the failure mode this
-- whole change exists to prevent.
alter table public.user_integrations
  drop constraint if exists user_integrations_fee_payment_pct_check;
alter table public.user_integrations
  add constraint user_integrations_fee_payment_pct_check
  check (fee_payment_pct >= 0 and fee_payment_pct <= 100);

alter table public.user_integrations
  drop constraint if exists user_integrations_fee_other_pct_check;
alter table public.user_integrations
  add constraint user_integrations_fee_other_pct_check
  check (fee_other_pct >= 0 and fee_other_pct <= 100);

-- Combined percentage cannot reach 100 either, otherwise contribution margin is
-- zero or negative before COGS is even considered and break-even ROAS is undefined.
alter table public.user_integrations
  drop constraint if exists user_integrations_fee_pct_total_check;
alter table public.user_integrations
  add constraint user_integrations_fee_pct_total_check
  check (fee_payment_pct + fee_other_pct <= 100);

alter table public.user_integrations
  drop constraint if exists user_integrations_fee_payment_fixed_check;
alter table public.user_integrations
  add constraint user_integrations_fee_payment_fixed_check
  check (fee_payment_fixed_cents >= 0 and fee_payment_fixed_cents <= 100000);

alter table public.user_integrations
  drop constraint if exists user_integrations_fee_shipping_check;
alter table public.user_integrations
  add constraint user_integrations_fee_shipping_check
  check (fee_shipping_cents >= 0 and fee_shipping_cents <= 1000000);
