alter table public.user_integrations
  add column if not exists currency text not null default 'EUR';

alter table public.user_integrations
  drop constraint if exists user_integrations_currency_check;

alter table public.user_integrations
  add constraint user_integrations_currency_check check (currency in ('EUR', 'USD'));
