begin;

create table if not exists public.ai_token_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  recorded_at timestamptz not null default now(),
  provider text not null check (provider in ('deepseek', 'claude', 'qwen', 'custom')),
  model text not null check (char_length(model) between 1 and 255),
  input_tokens bigint not null check (input_tokens >= 0),
  output_tokens bigint not null check (output_tokens >= 0),
  cache_read_input_tokens bigint check (cache_read_input_tokens between 0 and input_tokens),
  cache_write_input_tokens bigint check (cache_write_input_tokens between 0 and input_tokens),
  check (input_tokens > 0 or output_tokens > 0),
  check (coalesce(cache_read_input_tokens, 0) <= input_tokens - coalesce(cache_write_input_tokens, 0))
);

alter table public.ai_token_usage enable row level security;
revoke all on public.ai_token_usage from anon, authenticated;
grant insert (user_id, provider, model, input_tokens, output_tokens,
  cache_read_input_tokens, cache_write_input_tokens) on public.ai_token_usage to authenticated;

drop policy if exists "insert own usage" on public.ai_token_usage;
create policy "insert own usage" on public.ai_token_usage
  for insert to authenticated with check ((select auth.uid()) = user_id);

commit;
