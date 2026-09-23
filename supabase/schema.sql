-- atlas · base de datos en Supabase
-- Pega todo esto en Supabase → SQL Editor → New query → Run.
-- Cada usuario tiene UNA fila con todos sus datos (hábitos, tareas, metas, diario).

create table if not exists public.atlas_data (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Seguridad: cada persona solo puede ver y cambiar SUS datos.
alter table public.atlas_data enable row level security;

drop policy if exists "atlas: leer lo mio" on public.atlas_data;
drop policy if exists "atlas: crear lo mio" on public.atlas_data;
drop policy if exists "atlas: editar lo mio" on public.atlas_data;
drop policy if exists "atlas: borrar lo mio" on public.atlas_data;

create policy "atlas: leer lo mio"   on public.atlas_data for select to authenticated using ((select auth.uid()) = user_id);
create policy "atlas: crear lo mio"  on public.atlas_data for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "atlas: editar lo mio" on public.atlas_data for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "atlas: borrar lo mio" on public.atlas_data for delete to authenticated using ((select auth.uid()) = user_id);
