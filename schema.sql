-- ============================================================================
-- AuditoriaModulos · Clóset Vera — esquema de Supabase
-- Pega TODO este archivo en: tu proyecto de Supabase -> SQL Editor -> New query -> Run
-- Es seguro volver a correrlo aunque ya lo hayas corrido antes (no duplica ni borra nada,
-- solo actualiza las tablas/reglas a la versión más reciente).
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

-- Perfiles: un renglón por usuario (correo/módulo/rol).
-- rol: 'admin' (ve y edita los 5 módulos, sin restricción) |
--      'coordinador' (solo ve/edita el módulo que tenga asignado en la columna "modulo") |
--      'supervisor' (ve todo, en los 5 módulos, pero no puede capturar/editar nada).
create table if not exists public.perfiles (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  email     text,
  modulo    text,
  rol       text not null default 'coordinador',
  creado_en timestamptz not null default now()
);

-- Crea automáticamente un perfil (rol "coordinador", sin módulo) cuando alguien se registra.
-- A ti (el dueño) te toca subirte el rol a 'admin' manualmente una vez, desde el Table
-- Editor de Supabase o con: update public.perfiles set rol='admin' where email='tu@correo.com';
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

-- Por si ya habías corrido una versión anterior de este script (con el rol por defecto
-- llamado "operador"): lo deja en el nuevo esquema de 3 roles sin perder nada.
alter table public.perfiles alter column rol set default 'coordinador';
update public.perfiles set rol = 'coordinador' where rol = 'operador';

-- ============================================================================
-- Seguridad (RLS): cada quien lee/escribe según su rol y su módulo asignado.
-- ============================================================================
alter table public.docs enable row level security;
alter table public.perfiles enable row level security;

drop policy if exists "usuarios autenticados leen docs" on public.docs;
drop policy if exists "usuarios autenticados escriben docs" on public.docs;
drop policy if exists "usuarios autenticados actualizan docs" on public.docs;

-- Lectura: admin y supervisor ven todo; coordinador solo su módulo.
create policy "leer docs segun rol" on public.docs
  for select using (
    exists (
      select 1 from public.perfiles p
      where p.user_id = auth.uid()
        and (p.rol in ('admin','supervisor') or (p.rol='coordinador' and p.modulo = docs.modulo))
    )
  );

-- Escritura (insert/update): solo admin y coordinador (en su propio módulo). Supervisor
-- nunca puede escribir, ni siquiera si alguien manipula la app desde fuera.
create policy "insertar docs segun rol" on public.docs
  for insert with check (
    exists (
      select 1 from public.perfiles p
      where p.user_id = auth.uid()
        and (p.rol = 'admin' or (p.rol='coordinador' and p.modulo = docs.modulo))
    )
  );

create policy "actualizar docs segun rol" on public.docs
  for update using (
    exists (
      select 1 from public.perfiles p
      where p.user_id = auth.uid()
        and (p.rol = 'admin' or (p.rol='coordinador' and p.modulo = docs.modulo))
    )
  );

drop policy if exists "usuarios ven su perfil" on public.perfiles;
create policy "usuarios ven su perfil" on public.perfiles
  for select using (auth.uid() is not null);

-- A propósito NO hay policy de "update" para usuarios normales: si la hubiera, cualquiera
-- podría subirse su propio rol a 'admin' llamando la API directo (sin pasar por la app).
-- Los roles/módulos SOLO se asignan desde el Table Editor de Supabase (como dueño del
-- proyecto), que usa una llave que se salta RLS.
drop policy if exists "usuarios editan su perfil" on public.perfiles;

-- Habilita Realtime (para que los cambios de un módulo/usuario lleguen a los demás al instante,
-- sin esperar los 30s del respaldo por polling). Envuelto en un chequeo para que sea seguro
-- volver a correr este script aunque ya se haya habilitado antes.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'docs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.docs;
  END IF;
END $$;
