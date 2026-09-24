-- ============================================================================
-- AuditoriaModulos · Clóset Vera — esquema de Supabase
-- Pega TODO este archivo en: tu proyecto de Supabase -> SQL Editor -> New query -> Run
-- ============================================================================

-- Tabla única "docs": guarda cualquier colección de la app (inicial, movimientos,
-- resets, auditorias, instalacionesLog, instalacionesPuertas, prestamos, y cualquier
-- otra que se agregue después) como un documento JSON. Esto evita tener que crear/alterar
-- tablas cada vez que la app cambia de forma (igual que hacía el almacenamiento anterior).
create table if not exists public.docs (
  collection   text not null,
  id           text not null,
  modulo       text,
  payload      jsonb not null default '{}'::jsonb,
  updated_at   timestamptz not null default now(),
  deleted      boolean not null default false,
  primary key (collection, id)
);

create index if not exists docs_collection_idx on public.docs (collection);
create index if not exists docs_updated_at_idx on public.docs (updated_at);
create index if not exists docs_modulo_idx on public.docs (modulo);

-- Perfiles: un renglón por usuario (correo/módulo/rol). Lo usa la app para mostrar
-- quién eres; también puedes usarla más adelante para restringir cada usuario a "su" módulo.
create table if not exists public.perfiles (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  email     text,
  modulo    text,
  rol       text not null default 'operador', -- 'admin' o 'operador'
  creado_en timestamptz not null default now()
);

-- Crea automáticamente un perfil vacío cuando alguien se registra.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.perfiles (user_id, email) values (new.id, new.email)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================================
-- Seguridad (RLS). Para empezar: cualquier usuario que haya iniciado sesión puede leer y
-- escribir todo (igual que la app de antes, donde cualquiera con el link veía todos los
-- módulos). Si más adelante quieres que cada empleado SOLO vea su módulo, hay una versión
-- más estricta comentada al final de este archivo.
-- ============================================================================
alter table public.docs enable row level security;
alter table public.perfiles enable row level security;

drop policy if exists "usuarios autenticados leen docs" on public.docs;
create policy "usuarios autenticados leen docs" on public.docs
  for select using (auth.uid() is not null);

drop policy if exists "usuarios autenticados escriben docs" on public.docs;
create policy "usuarios autenticados escriben docs" on public.docs
  for insert with check (auth.uid() is not null);

drop policy if exists "usuarios autenticados actualizan docs" on public.docs;
create policy "usuarios autenticados actualizan docs" on public.docs
  for update using (auth.uid() is not null);

drop policy if exists "usuarios ven su perfil" on public.perfiles;
create policy "usuarios ven su perfil" on public.perfiles
  for select using (auth.uid() is not null);

drop policy if exists "usuarios editan su perfil" on public.perfiles;
create policy "usuarios editan su perfil" on public.perfiles
  for update using (auth.uid() = user_id);

-- Habilita Realtime (para que los cambios de un módulo/usuario lleguen a los demás al instante,
-- sin esperar los 30s del respaldo por polling).
alter publication supabase_realtime add table public.docs;

-- ============================================================================
-- OPCIONAL — más adelante, si quieres restringir cada usuario a SU módulo:
-- 1) Asigna el módulo de cada empleado: update public.perfiles set modulo='Saltillo', rol='operador' where email='empleado@correo.com';
-- 2) Reemplaza las policies de arriba por estas (bórralas primero con "drop policy"):
--
-- create policy "lee su módulo o es admin" on public.docs
--   for select using (
--     exists (select 1 from public.perfiles p where p.user_id = auth.uid() and (p.rol = 'admin' or p.modulo = docs.modulo))
--   );
-- create policy "escribe su módulo o es admin" on public.docs
--   for insert with check (
--     exists (select 1 from public.perfiles p where p.user_id = auth.uid() and (p.rol = 'admin' or p.modulo = docs.modulo))
--   );
-- ============================================================================
