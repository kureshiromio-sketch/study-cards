-- 刷题App 云同步表：整段复制，粘贴到 Supabase 的 SQL Editor，点 Run
create table if not exists public.items (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,
  kind text not null,
  data jsonb not null,
  updated_at bigint not null,
  deleted boolean not null default false,
  server_ts timestamptz not null default now(),
  primary key (user_id, id)
);
alter table public.items enable row level security;
drop policy if exists "own rows" on public.items;
create policy "own rows" on public.items for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists items_user_ts on public.items(user_id, server_ts);
create or replace function public.touch_items() returns trigger
  language plpgsql as $$ begin new.server_ts = now(); return new; end $$;
drop trigger if exists items_touch on public.items;
create trigger items_touch before insert or update on public.items
  for each row execute function public.touch_items();
