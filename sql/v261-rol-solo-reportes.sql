-- ============================================================================
-- v261 · Rol "Solo reportes" (reportes de instalaciones)
-- Pegar UNA vez en: Supabase -> SQL Editor -> New query -> Run.
-- Solo AGREGA una regla nueva: no cambia ni quita ninguna de las que ya existen,
-- y no toca ningún dato. Es seguro correrlo otra vez.
--
-- Qué hace: una cuenta con rol 'reportes' puede LEER únicamente los documentos de
-- la colección 'reportesInst' (los reportes de salida y cierre de los coordinadores).
-- No puede leer inventario, movimientos, instalaciones ni nada más, y no puede
-- escribir nada (las reglas de escritura existentes solo permiten admin y coordinador).
-- ============================================================================
drop policy if exists "solo reportes lee reportes de instalaciones" on public.docs;
create policy "solo reportes lee reportes de instalaciones" on public.docs
  for select using (
    docs.collection = 'reportesInst'
    and exists (
      select 1 from public.perfiles p
      where p.user_id = auth.uid() and p.rol = 'reportes'
    )
  );

-- Para revisar que quedó (debe salir 1 renglón):
-- select policyname from pg_policies where tablename = 'docs' and policyname like 'solo reportes%';
