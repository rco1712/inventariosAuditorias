# AuditoriaModulos — app independiente (PWA)

App de inventario/despiece/auditoría de Clóset Vera, ahora fuera de Claude: funciona
con o sin internet, soporta varios usuarios con su propia cuenta, y todo se respalda en
una base de datos real (Supabase) que se sincroniza sola en cuanto hay señal.

Todos los archivos están sueltos en la raíz del proyecto (sin subcarpetas), a propósito,
para poder subirlos fácil desde el selector de archivos del celular.

## Cómo funciona (resumen)

- **Sin internet**: todo se lee/escribe primero en el propio celular/computadora
  (IndexedDB, vía `db.js`). La app sigue funcionando normal, capturando movimientos,
  auditorías, instalaciones, etc.
- **Con internet**: cada cambio (propio o de otro módulo/usuario) se sincroniza solo con
  Supabase en segundo plano. No hay que darle a "sincronizar": pasa automático apenas hay señal.
- Arriba de la pantalla hay una etiqueta que dice si estás **sincronizado**, si hay
  **cambios pendientes** por subir, o si estás **sin internet**.
- **Varios usuarios**: cada quien entra con su correo/contraseña (pantalla de login).
- **Respaldo**: los datos viven en Supabase (Postgres, con respaldo automático de
  Supabase). Además, en "Reportes" hay un botón para descargar un respaldo manual en `.json`.

## Estado de la configuración

- ✅ Supabase: proyecto "InventariosAuditorias" creado, `schema.sql` ya ejecutado,
  llaves ya puestas en `supabase.js`.
- ✅ Publicación: en `https://rco1712.github.io/inventariosAuditorias/` (GitHub Pages).
- ✅ Roles y permisos por módulo, implementados.

## Roles y permisos

Cada usuario tiene un **rol** guardado en la tabla `perfiles` de Supabase:

- **admin**: ve y edita los 5 módulos completos, sin restricción (inventario, despiece,
  auditorías, instalaciones, traspasos, reportes, poner en cero). Debe haber al menos uno: tú.
- **coordinador**: solo ve y edita el módulo que tenga asignado en la columna `modulo` de
  su perfil (Saltillo, Escobedo, Apodaca, Guadalajara o Tlaquepaque). No ve la pestaña de
  Traspasos (cruza módulos, así que queda solo para admin). Si un coordinador no tiene
  módulo asignado, la app se lo dice y no lo deja avanzar hasta que tú se lo asignes.
- **supervisor**: ve los 5 módulos (como el admin), pero de solo lectura — no le aparecen
  las pestañas de Entradas/Salidas, Auditoría física, Instalaciones ni Traspasos, y no
  puede editar el "Inicial" ni poner en cero.

**Cómo asignar rol/módulo a cada usuario** (tú, como dueño del proyecto, desde Supabase):
1. Ve a tu proyecto de Supabase → **Table Editor** → tabla **`perfiles`**.
2. Ahí sale un renglón por cada persona que se haya registrado en la app (por defecto
   quedan como `rol = coordinador` y `modulo` vacío).
3. Edita el renglón de cada quien: pon su `rol` (`admin`, `coordinador` o `supervisor`) y,
   si es coordinador, su `modulo` (escribe el nombre exacto: `Saltillo`, `Escobedo`,
   `Apodaca`, `Guadalajara` o `Tlaquepaque`).
4. La próxima vez que esa persona entre a la app (o recargue), ya le aplica el nuevo rol.

> A ti mismo te toca subirte a `admin` una vez, a mano, la primera vez (por tu propia
> seguridad, la app no deja que nadie se suba su propio rol desde el celular).

Por seguridad, estas reglas están reforzadas también en la base de datos (RLS), no solo en
la pantalla: aunque alguien intentara saltarse la app, Supabase igual bloquea la
lectura/escritura fuera de lo que le toca a su rol.

## Estructura del proyecto

```
index.html      — la app (shell visual + carga los scripts)
manifest.json    — hace que se pueda "instalar" en el celular/PC (PWA)
sw.js            — service worker: cachea la app para que abra sin internet
app.js            — toda la lógica de negocio (inventario, despiece, auditoría…)
db.js             — capa de datos local-first (IndexedDB) + sincronización con Supabase
supabase.js        — configuración de conexión a Supabase (URL + anon key)
auth.js             — login / registro / cerrar sesión
bootstrap.js         — conecta los módulos anteriores con app.js
schema.sql            — script para crear las tablas y permisos en Supabase (ya ejecutado)
icon-192.png            — ícono de la app (PWA)
icon-512.png             — ícono de la app (PWA)
```

## Publicar en GitHub Pages (una vez subidos los archivos)

1. Entra al repositorio en GitHub → **Settings → Pages**.
2. En "Source" elige **"Deploy from a branch"**, branch **main**, carpeta **/(root)**, y
   dale **Save**.
3. A los 1-2 minutos la app queda viva en:
   `https://rco1712.github.io/inventariosAuditorias/`

## Probarla en una computadora antes de publicarla (opcional)

No requiere instalar nada especial. Desde una terminal, dentro de esta carpeta:

```
python3 -m http.server 8080
```

y abre `http://localhost:8080` en el navegador.

## Siguientes mejoras posibles (no incluidas todavía)

- Pantalla de administración para asignar rol/módulo sin entrar a Supabase directamente.
- Notificaciones cuando el stock de algo se queda muy bajo.
