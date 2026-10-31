# CONTEXTO — léelo antes de tocar la app

Este archivo es para que **cualquier chat nuevo de Claude** (o cualquier persona) entienda cómo funciona
la app, por qué está hecha así y cómo se trabaja con Dirección. Al empezar un chat nuevo: lee este archivo,
`README.md` y el código (`app.js`, `db.js`, `sw.js`). Todo está en español porque la app y el negocio lo están.

## 1. Qué es

- **AuditoriaModulos**: PWA de inventario, despiece, instalaciones, auditorías y herramienta de **Closets Vera**.
- 5 módulos: Saltillo, Escobedo, Apodaca, Guadalajara, Tlaquepaque. Usan la app: Escobedo, Apodaca, Saltillo.
- En vivo: `rco1712.github.io/inventariosAuditorias` · repo `rco1712/inventariosAuditorias` · nube: Supabase.
- Roles: **Dirección (admin)** ve y corrige todo; **coordinador** solo su módulo; supervisor solo lectura.
- El usuario que pide los cambios es Dirección (creó la app, también hace de Auditor). Responder en español.

## 2. Reglas de trabajo (obligatorias)

1. **"Mándame ejemplos antes de subir cualquier actualización"**: antes de subir, mandar capturas o
   simulaciones y esperar el visto bueno. Se sube cuando dice "súbelo" / "fusiónalo".
2. Cómo se sube: rama `claude/vNNN-...`, PR con `gh api repos/rco1712/inventariosAuditorias/pulls`
   y merge con `gh api -X PUT .../pulls/N/merge`.
3. **Cada versión** cambia DOS cosas iguales: `const APP_VERSION = 'vNNN'` en `app.js` **y**
   `const CACHE = 'auditoriamodulos-vNNN'` en `sw.js`. (Si solo se cambia uno, el aviso de actualizar no se quita.)
4. **"Es sumamente importante que no se hagan descuentos de más."** Ante la duda, no descontar y avisar a Dirección.
5. **Nunca** subir contraseñas, respaldos ni JSON con datos al repo (es público).
6. La llave `service_role` de Supabase **nunca** va en la app.
7. Dominio propio, plan de Supabase y cambios de seguridad/permisos de la nube: **en pausa** hasta que lo aprueben los dueños.
8. Los coordinadores no son muy hábiles con el celular: todo simple, con avisos grandes y claros.
9. Lista `unaSolaVez` (cerca del final de `app.js`): protege botones de doble toque. **Nunca** poner una
   función dos veces (si se envuelve doble, el botón deja de funcionar sin error).
10. PDF (jsPDF): no usar '−', '→' ni emojis dentro del PDF (no se dibujan). `doc.text` solo con texto (String()).

## 3. Cómo funciona por dentro

- `db.js`: local primero (Dexie/IndexedDB) y se sincroniza con Supabase (tabla `docs`).
  **Un coordinador solo puede crear/modificar documentos de SU módulo** en la nube; lo que intente cambiar de
  otro módulo se queda en su teléfono "por sincronizar" y nunca sube. Por eso, cuando dos módulos participan
  (traspasos, deudas), **cada uno escribe solo lo suyo** y el estado se calcula juntando registros (ver §5).
- Inventario = inicial (conteo/auditoría) + movimientos aprobados. Motor: `calcularFormula`.
  Tipos: entrada, salida, corte, instalacion, garantia, devolucion, merma, sobrante, ajuste.
- **Hojas (melamina y MDF)** se llevan en **completas** y **cortado**:
  - Entradas y salidas: de completas. Corte: pasa de completas a cortado (el total no cambia).
  - Instalaciones descuentan del **cortado**; si no alcanza, la app abre hojas por su cuenta ("deuda") que
    luego cubre el corte del cierre.
  - **Cierre del turno**: el coordinador cuenta solo hojas **completas**; la app calcula el corte. Entra directo, sin aprobación.
  - Si cuenta completas **de más**, se manda a Dirección como "hojas de más" (ajuste por aprobar).

## 4. Puertas (v227, confirmado por Dirección)

- Medidas de piezas por tipo en `calcularPuerta` (Normal, Con pared falsa, Con dos paredes falsas,
  Con cubos a los lados, Con cubo al centro). Hoja: **122×244**, sierra **5 mm**.
- **Corte real (misma regla para todos los tipos)**: primero puertas y paredes falsas; los marcos, fijos y
  extensiones van **en los sobrantes de esas hojas** si caben; si no caben, se cobran **proporcional** de otra hoja
  (nunca hoja completa). Pedazo libre de ≥10 cm × ≥27 cm queda en cortado; menos de 10 cm es merma.
- Las puertas se descuentan del cortado como lo demás (no se abren hojas completas en inventario, v209).
- Historia: hasta el 27-oct Escobedo usó una versión vieja que descontaba de más las puertas (2, 2.2, 2.33, 2.5…).

## 5. Traspasos y deudas entre módulos (v223 a v226)

- **Traspaso** (préstamo): sale del módulo que manda y queda **en camino**; se suma al que recibe y nace la deuda
  **solo cuando el que recibe confirma** "Sí llegaron". "No llegaron" lo cancela y la salida se anula.
- **Pagar deuda**: el que debe manda (sale de su inventario, "en camino"); el que prestó confirma que llegó.
- Al confirmar sale un aviso rojo: si ya hizo su **cierre del turno con esas hojas**, debe elegir
  "YA las conté en mi cierre" para que **no se sumen dos veces**.
- v225: los pasos se guardan como **eventos** nuevos en la colección `prestamos` (`{evento:true, prestamoId, tipo:
  'envio'|'confEnvio'|'traspConf'}`) y el estado se calcula en `prestAplicarEventos`. Nunca se modifica el préstamo
  original desde un coordinador. v226: Dirección recupera un envío desde la salida que sí se subió.
- En melamina, una deuda se puede pagar con cualquier color.

## 6. Instalaciones (resumen)

- Se capturan el mismo día con su **calle** (obligatoria); el material se descuenta al capturar.
- Dirección verifica al día siguiente con el grupo de WhatsApp: "sí se instaló" = aprobada; "no se instaló" =
  el material regresa pieza por pieza (inventario / sobrantes / merma) y los herrajes regresan; "se instala otro día".
- Cambio de modelo: solo se mueve la diferencia. Nunca descontar doble.

## 7. Pendiente / decisiones abiertas (al 30-oct-2026)

- Rama `claude/v224-deshacer-corte` **sin subir** (Dirección no está segura): cuando en el cierre cuentan completas
  de más y hubo un corte en los últimos 3 días (y ese día la app no abrió hojas por su cuenta ni hay material en
  camino), regresar esa hoja de cortado a completas sin cambiar el total. Hay que actualizarla a la versión actual antes de usarla.
- Rama `claude/v210-conteo-ciegas` sin subir por decisión de Dirección.
- Escobedo: corregir cortado de colores de puerta (Gris, Nogal, Roble Santana…) con una **auditoría de un material**
  (contar y comparar; al final "Cancelar" para no aplicar). Apodaca: +2 al cortado de Durango si se confirma la
  puerta de Huertos 306. Revisar instalaciones repetidas de Francisco Villa 834 (Escobedo).
- Para que los coordinadores actualicen: Dirección ve en su Inicio "📱 App sin actualizar" (v227).

## 8. Cómo probar

Hay pruebas automáticas con Playwright que cargan `index.html` en modo local (sin nube) y simulan coordinadores y
Dirección. No están en el repo (se crean en cada sesión). Probar siempre: traspasos/deudas, cierre del turno,
instalaciones, PDFs, y que no haya errores de JavaScript.
