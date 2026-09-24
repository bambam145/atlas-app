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

-- Registrar un hábito desde el botón de una notificación (lo llama la función quick-log con service_role).
create or replace function public.push_quick_log(p_user uuid, p_day text, p_habit text, p_value text, p_time text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  d jsonb;
  h jsonb;
  cur jsonb;
  nv jsonb;
begin
  if not private.license_ok(p_user) then return false; end if;
  if p_value not in ('done', 'meh', 'none', 'inc') or p_day !~ '^\d{4}-\d{2}-\d{2}$' or p_time !~ '^\d{2}:\d{2}$' then return false; end if;
  select data into d from atlas_data where user_id = p_user for update;
  if d is null then return false; end if;
  select x into h from jsonb_array_elements(coalesce(d->'habits', '[]')) x where x->>'id' = p_habit;
  if h is null then return false; end if;

  cur := d->'log'->p_day->p_habit;
  if p_value = 'inc' then
    nv := to_jsonb(1 + case
      when jsonb_typeof(cur) = 'number' then (cur #>> '{}')::int
      when cur #>> '{}' = 'done' then greatest(1, coalesce((h->>'target')::int, 1))
      else 0 end);
  else
    nv := to_jsonb(p_value);
  end if;

  d := jsonb_set(d, '{log}', coalesce(d->'log', '{}'));
  d := jsonb_set(d, array['log', p_day], coalesce(d->'log'->p_day, '{}') || jsonb_build_object(p_habit, nv));
  d := jsonb_set(d, '{times}', coalesce(d->'times', '{}'));
  d := jsonb_set(d, array['times', p_day], coalesce(d->'times'->p_day, '{}') || jsonb_build_object(p_habit, p_time));
  update atlas_data set data = d, updated_at = now() where user_id = p_user;
  return true;
end;
$$;
revoke all on function public.push_quick_log(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.push_quick_log(uuid, text, text, text, text) to service_role;

-- El usuario elimina su propia cuenta y todos sus datos (Ajustes → Eliminar mi cuenta).
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'no_auth'; end if;
  delete from private.push_sent where user_id = uid;
  delete from private.email_log where user_id = uid;
  delete from auth.users where id = uid; -- en cascada: datos, licencia, avisos, invitaciones
end;
$$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- Marcar una tarea como hecha desde el botón del aviso (lo llama quick-log con service_role).
create or replace function public.push_quick_task(p_user uuid, p_task text, p_day text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  d jsonb;
  idx int;
begin
  if not private.license_ok(p_user) then return false; end if;
  if p_day !~ '^\d{4}-\d{2}-\d{2}$' then return false; end if;
  select data into d from atlas_data where user_id = p_user for update;
  if d is null then return false; end if;
  select i - 1 into idx from jsonb_array_elements(coalesce(d->'tasks', '[]')) with ordinality as x(t, i) where x.t->>'id' = p_task;
  if idx is null then return false; end if;
  d := jsonb_set(d, array['tasks', idx::text], (d->'tasks'->idx) || jsonb_build_object('status', 'done', 'doneAt', p_day));
  update atlas_data set data = d, updated_at = now() where user_id = p_user;
  return true;
end;
$$;
revoke all on function public.push_quick_task(uuid, text, text) from public, anon, authenticated;
grant execute on function public.push_quick_task(uuid, text, text) to service_role;
