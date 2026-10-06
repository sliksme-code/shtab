-- Штаб: таблицы, доступы, realtime. Выполнить один раз в Supabase → SQL Editor.
create table if not exists public.shtab_members (
  email text primary key,
  role text not null check (role in ('owner','member')),
  name text,
  created_at timestamptz not null default now()
);

create table if not exists public.shtab_docs (
  path text primary key,
  coll text not null,
  doc_id text not null,
  data jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by text
);
create index if not exists shtab_docs_coll_idx on public.shtab_docs (coll);

create or replace function public.shtab_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.shtab_members where email = lower(coalesce(auth.jwt() ->> 'email',''))
$$;
revoke all on function public.shtab_role() from public;
revoke execute on function public.shtab_role() from anon;
grant execute on function public.shtab_role() to authenticated;

create or replace function public.shtab_can(c text) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when c = 'life' or c like 'life/%' then public.shtab_role() = 'owner'
    else public.shtab_role() is not null
  end
$$;
revoke all on function public.shtab_can(text) from public;
revoke execute on function public.shtab_can(text) from anon;
grant execute on function public.shtab_can(text) to authenticated;

create or replace function public.shtab_touch() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' then new.version := old.version + 1; end if;
  new.updated_at := now();
  new.updated_by := coalesce(auth.jwt() ->> 'email', new.updated_by, 'system');
  return new;
end $$;
drop trigger if exists shtab_docs_touch on public.shtab_docs;
create trigger shtab_docs_touch before insert or update on public.shtab_docs
  for each row execute function public.shtab_touch();

alter table public.shtab_docs enable row level security;
alter table public.shtab_members enable row level security;

drop policy if exists shtab_docs_select on public.shtab_docs;
drop policy if exists shtab_docs_insert on public.shtab_docs;
drop policy if exists shtab_docs_update on public.shtab_docs;
drop policy if exists shtab_docs_delete on public.shtab_docs;
create policy shtab_docs_select on public.shtab_docs for select to authenticated using (public.shtab_can(coll));
create policy shtab_docs_insert on public.shtab_docs for insert to authenticated with check (public.shtab_can(coll));
create policy shtab_docs_update on public.shtab_docs for update to authenticated using (public.shtab_can(coll)) with check (public.shtab_can(coll));
create policy shtab_docs_delete on public.shtab_docs for delete to authenticated using (public.shtab_can(coll));

drop policy if exists shtab_members_select on public.shtab_members;
create policy shtab_members_select on public.shtab_members for select to authenticated using (public.shtab_role() is not null);

insert into public.shtab_members (email, role, name) values ('sliks.me@gmail.com','owner','Марат')
  on conflict (email) do update set role = 'owner';

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.shtab_docs;
    exception when duplicate_object then null;
    end;
  end if;
end $$;
