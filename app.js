// ===== AuditoriaModulos · Clóset Vera =====
// App independiente (PWA) — funciona con o sin internet. Las lecturas/escrituras van
// primero a IndexedDB (ver src/db.js) y se sincronizan con Supabase en cuanto hay señal.
// NOTA: este archivo es un script clásico (no type="module") a propósito: toda la UI usa
// atributos onclick="..." inline en el HTML generado, y esos solo pueden llamar funciones
// que cuelguen de `window` — lo que Un script clásico hace automáticamente con cada
// `function nombre(){}` de nivel superior. db/initSync/auth, etc. los expone src/bootstrap.js
// (un módulo aparte) como variables globales ANTES de insertar este script; ver index.html.


const $=s=>document.querySelector(s);
let inicialMap={}, inicialCortadoMap={}, inicialFechaMap={}, movs=[], resetMap={}, auditorias=[], deudas=[], histTab='aud', current='inv', conteoMap={}, pedidos=[], minimosMap={};
let auditCat=null, auditCapturas={};
// Piezas cortadas contadas en la auditoría: { 'Blanco': {pared:3, ...}, 'MDF': {fondocajon:10} }
let auditPiezas={}, auditPiezaGrupo=null, audTipo='seguimiento', audAuditor='', audPaso=0, audHechas={};
// Contar a ciegas (confirmado por el usuario): oculta el teórico mientras se cuenta; se puede prender o
// apagar en cualquier momento. Por default prendido. El resultado siempre muestra teórico vs. físico.
let audOcultarTeo = true;
// Armados contados (cajoneras sin cajones, cajones completos, cuadros de cajón)
let auditArmados=[], auditArmadoForm={tipo:'cajonera', variante:'3', color:'Blanco', colorCuadro:'Blanco', ext:false, puertitas:false, puertitasSinJal:false, sinFondo:false, sinHerrajes:false, colorFrente:'', cantidad:''};
let moduloActual = localStorage.getItem('am_modulo') || null;
// Perfil del usuario (rol + módulo asignado). Lo llena boot() con getMyProfile() antes de
// llamar a init(). rol guardado en la base (nunca cambia, lo usan los permisos/RLS): 'admin'
// (ve/edita todo) | 'coordinador' (solo su módulo) | 'supervisor' (ve todo, sin capturar) |
// 'gerente' (igual que supervisor: ve todo, sin capturar; es solo otra etiqueta). ROL_LABELS
// es nada más el nombre que se muestra en pantalla (p.ej. 'admin' se ve como "Dirección"
// para no decir "dueño"); el valor guardado en la base no cambia. Sin Supabase configurado,
// miPerfil queda null y la app se comporta como antes (un solo usuario local, sin restricciones).
let miPerfil = null;
const ROL_LABELS = { admin:'Dirección', coordinador:'Coordinador', supervisor:'Supervisor', gerente:'Gerente', administracion:'Administración' };
// 'administracion' (confirmado por el usuario): la persona que surte el material. Sube los pedidos
// que van a llegar, aprueba lo que llegó, ve lo que falta por entregar y el inventario de los 5
// módulos. NO aprueba instalaciones ni captura entradas/salidas/instalaciones.
function esAdministracion(){ return !!miPerfil && miPerfil.rol==='administracion'; }
function puedePedidos(){ return esAdmin() || esAdministracion(); }
function puedeEscribir(){ return !miPerfil || miPerfil.rol==='admin' || miPerfil.rol==='coordinador'; }
function esAdmin(){ return !miPerfil || miPerfil.rol==='admin'; }
// Lo que capture un coordinador queda "pendiente" hasta que Dirección lo apruebe; lo de
// Dirección (o traspasos, que siempre son inmediatos) se guarda ya "aprobado".
function estadoNuevoMovimiento(){ return esAdmin() ? 'aprobado' : 'pendiente'; }
let instSub = 'mueble', instRegreso = false, instRegresoLibre = false;
let instCambio = null; // cambio de modelo de una instalación ya registrada {logId, desc, fechaDia, categoria, estado, consumo}
let instPreview = null; // {piezas, consumo:[{itemId,cantidad}], bloqueado, motivosBloqueo:[]}
// Adicionales: muebles extra que se agregan a un modelo (cajonera, entrepañera, cajonera de
// espejo, zapatera, repisa), sin contar como uno de los muebles fijos del modelo elegido.
let dAdicionales = []; // Despiece
let iAdicionales = []; // Instalación de mueble
const TIPOS_ADICIONAL = {
  entrepanera: 'Entrepañera',
  cajonera: 'Cajonera (cantidad libre)',
  cajonera_emma: 'Cajonera Emma (4 cajones)',
  cajonera_espejo: 'Cajonera de espejo',
  cajonera_espejo_max: 'Espejo Max',
  cajonera_max: 'Cajonera Max (4 cajones)',
  entrepanera_max: 'Entrepañera Max',
  zapatera: 'Zapatera',
  repisa: 'Repisa',
  piso_zoclo: 'Piso y zóclo'
};
// Piso y zóclo (confirmado por el usuario): el coordinador elige cuánto de cada pieza y de qué color.
const PISO_ZOCLO_PIEZAS = [
  {k:'maleteroG', t:'Maletero grande', nombre:'Maletero grande', dim:'40×244 cm'},
  {k:'maleteroC', t:'Maletero chico', nombre:'Maletero chico', dim:'191×40 cm'},
  {k:'marco', t:'Marco 10×244', nombre:'Marco 10×244', dim:'10×244 cm'},
  {k:'cargador', t:'Cargador 10×40', nombre:'Cargador', dim:'10×40 cm'},
  {k:'zoclo', t:'Zóclo 10×52', nombre:'Zóclo normal', dim:'10×52 cm'}
];

// ===== Composición por muebles: en vez de elegir un modelo con nombre, se arma la familia
// mueble por mueble (entrepañera / cajonera / Emma / espejo / Max), confirmado por el usuario:
// "las cajoneras Emma y Max sustituyen los muebles... esto aplica para todos los modelos".
const NUM_MUEBLES_FAM = {Lateral:1, Central:1, Doble:2, King:2, Triple:3, 'Doble Especial':2};
const FAMILIAS_COMP = Object.keys(NUM_MUEBLES_FAM);
const MUEBLE_TIPO_OPCIONES = [
  {value:'entrepanera', label:'Entrepañera'},
  {value:'cajonera_1', label:'Cajonera de 1 cajón'},
  {value:'cajonera_3', label:'Cajonera de 3 cajones'},
  {value:'cajonera_5', label:'Cajonera de 5 cajones'},
  {value:'cajonera_emma', label:'Cajonera Emma (4 cajones)'},
  {value:'cajonera_espejo', label:'Cajonera de espejo'},
  {value:'cajonera_espejo_max', label:'Espejo Max'},
  {value:'cajonera_max', label:'Cajonera Max (4 cajones)'},
  {value:'entrepanera_max', label:'Entrepañera Max'},
  {value:'cajonera_otra', label:'Cajonera (otra cantidad)'},
  {value:'zapatera', label:'Zapatera (en vez de entrepañera; solo Lateral y Central)'}
];
let dModoComp=false, dFamiliaComp=null, dMueblesComp=[];
let iModoComp=false, iFamiliaComp=null, iMueblesComp=[];

const MODULOS = [
  {nombre:'Saltillo', region:'Coahuila', color:'#2f6fed', code:'S'},
  {nombre:'Escobedo', region:'Monterrey', color:'#2e7d4f', code:'E'},
  {nombre:'Apodaca', region:'Monterrey', color:'#e0791a', code:'A'},
  {nombre:'Guadalajara', region:'Jalisco', color:'#b3452c', code:'G'},
  {nombre:'Tlaquepaque', region:'Jalisco', color:'#7a4fb5', code:'T'},
];
// Fecha de hoy en hora local (AAAA-MM-DD).
function fechaHoyLocal(){ return new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10); }
// ¿Dirección abrió el conteo del almacén HOY para este módulo? (se cierra solo al cambiar el día)
function conteoAbiertoHoy(mod){ const c = conteoMap[mod||modulo()]; return !!(c && c.abierto && c.fechaDia===fechaHoyLocal()); }
// Modo conteo del coordinador: puede capturar la auditoría, pero a ciegas (sin ver el teórico).
function modoConteoCoord(){ return esCoordinador() && conteoAbiertoHoy(); }


const CATALOGO = [];
(function build(){
  const melColores=['Blanco','Cenizo','Beige','Durango','Gris','Lino','Bco Mármol','Neg Mármol','Monarca','Negro','Nogal','Polar','Rioja','Roble','Roble Santana','Choco'];
  melColores.forEach(c=>CATALOGO.push({cat:'Melamina',nombre:'Melamina '+c,unidad:'hojas'}));
  ['MDF 3mm','MDF 5mm'].forEach(n=>CATALOGO.push({cat:'MDF',nombre:n,unidad:'hojas'}));
  const cintillaPvcColores=['Blanco','Durango','Ébano Indi','Wengue','Nogal','Chardonnay','Ceniza','Lino','Roble Santana','Negro','Bco. Mármol','Negro Mármol','Roble','Polar','Rioja','Monarca'];
  cintillaPvcColores.forEach(c=>CATALOGO.push({cat:'Cintilla',nombre:'Cintilla '+c,unidad:'metros'}));
  cintillaPvcColores.forEach(c=>CATALOGO.push({cat:'PVC',nombre:'PVC '+c,unidad:'metros'}));
  ['Pegamento amarillo','Pegamento granulado'].forEach(n=>CATALOGO.push({cat:'Pegamento',nombre:n,unidad:'kg'}));
  // Stickers: mismos colores que la melamina (confirmado por el usuario; no hay stickers de MDF).
  melColores.forEach(c=>CATALOGO.push({cat:'Stickers',nombre:'Sticker '+c,unidad:'pza'}));
  ['Aros colgadores','Bastidores','Bisagras','Clavo 25','Clavo 30','Emplaye','Escuadras','Espejos closet','Espejos 60x160','Jaladeras','Juego de corredera','Lambrín por caja','Pijas 1','Pijas 2','Pijas 3/4','Pijas 5/8','Pintura blanca','Pintura choco','Pintura de colores','Pintura negra','Resbalones','Rieles','Sistemas','Taquetes','Tarugos','Tornillos recortables','Tubos 1.5 m','Correderas de extensión','Jaladera plana','Push']
    .forEach(n=>CATALOGO.push({cat:'Herrajes',nombre:n,unidad:'pza'}));
  CATALOGO.push({cat:'Herrajes',nombre:'Juegos de bridas',unidad:'juego'});
  // Medias correderas sin su pareja (confirmado por el usuario): cada una va justo después de su juego.
  [['Juego de corredera',['Corredera hembra (sin pareja)','Corredera macho (sin pareja)']],
   ['Correderas de extensión',['Corredera ext. hembra (sin pareja)','Corredera ext. macho (sin pareja)']]].forEach(([juego,sueltas])=>{
    const i = CATALOGO.findIndex(x=>x.nombre===juego);
    CATALOGO.splice(i+1, 0, ...sueltas.map(n=>({cat:'Herrajes',nombre:n,unidad:'pza'})));
  });
  CATALOGO.forEach(it=>it.id = slug(it.nombre));
})();
function slug(s){return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'_');}
function cryptoId(){return 'm'+Math.random().toString(36).slice(2,10);}
function item2unidad(itemId){ const it=CATALOGO.find(i=>i.id===itemId); return it? it.unidad:''; }
function itemByName(nombre){ return CATALOGO.find(i=>i.nombre===nombre); }
// Media corredera (nombre de pieza) -> artículo de inventario "sin pareja", y su juego.
const CORR_SUELTA_ITEM = {'Corredera hembra':'Corredera hembra (sin pareja)', 'Corredera macho':'Corredera macho (sin pareja)',
  'Corredera hembra (extensión)':'Corredera ext. hembra (sin pareja)', 'Corredera macho (extensión)':'Corredera ext. macho (sin pareja)'};
const CORR_TIPOS = [
  {suf:'', juego:'Juego de corredera', hembra:'Corredera hembra (sin pareja)', macho:'Corredera macho (sin pareja)', etiqueta:'Corredera normal'},
  {suf:' (extensión)', juego:'Correderas de extensión', hembra:'Corredera ext. hembra (sin pareja)', macho:'Corredera ext. macho (sin pareja)', etiqueta:'Corredera de extensión'}];
// Correderas del inventario actual por tipo: {etiqueta, juegos, hembras, machos} (solo tipos con algo).
function correderasHoy(){
  return CORR_TIPOS.map(t=>{ const v = n=>{ const it=itemByName(n); return it ? calcFormula(it.id).final : 0; };
    return {etiqueta:t.etiqueta, juegos:v(t.juego), hembras:v(t.hembra), machos:v(t.macho)}; })
    .filter(b=>Math.abs(b.juegos)>0.005 || Math.abs(b.hembras)>0.005 || Math.abs(b.machos)>0.005);
}
function esCorrSuelta(it){ return !!it && /\(sin pareja\)$/.test(it.nombre); }
function modulo(){return moduloActual;}
// Búsqueda sin acentos ni mayúsculas ("correde" encuentra "Juego de corredera").
function normTxt(t){ return String(t||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }
function coincide(nombre, q){ const n=normTxt(nombre); return normTxt(q).split(/\s+/).filter(Boolean).every(w=>n.includes(w)); }
function inicialKey(mod,itemId){return mod+'__'+itemId;}

function renderModBar(){
  const m = MODULOS.find(x=>x.nombre===moduloActual);
  const puedeCambiar = !miPerfil || miPerfil.rol!=='coordinador';
  $('#modbar').innerHTML = m
    ? `<button class="modpill" style="background:${m.color}" ${puedeCambiar?'onclick="showPicker()"':'disabled'}>📍 ${m.nombre}${puedeCambiar?' · cambiar módulo':' (tu módulo asignado)'}</button>`
    : `<button class="modpill" style="background:#555" onclick="showPicker()">Selecciona un módulo</button>`;
}

// Muestra/oculta pestañas de navegación y acciones según el rol de quien inició sesión.
function aplicarPermisosUI(){
  if(!miPerfil) return; // sin Supabase configurado: modo local, sin restricciones
  // Coordinadores: solo lo que usan en el día (se ocultan Catálogo e Historial, que son de consulta avanzada).
  // Coordinador: menú corto (confirmado por el usuario) con lo del día; lo demás queda en "☰ Más".
  const ocultarTabs = miPerfil.rol==='administracion' ? ['mov','aud','inst','trasp','usr','apr','mas','gar','cat','desp','hist']
    : (miPerfil.rol==='supervisor'||miPerfil.rol==='gerente') ? ['mov','aud','inst','trasp','usr','apr','ped','mas'] : (miPerfil.rol==='coordinador' ? ['aud','usr','apr','cat','hist','gar','trasp','rep','desp'] : ['mas']);
  document.querySelectorAll('#nav button[data-v]').forEach(b=>{
    b.style.display = ocultarTabs.includes(b.dataset.v) ? 'none' : '';
  });
}

function showPicker(){
  document.getElementById('nav').style.display='none';
  $('#main').innerHTML = `<div class="pickerTitle">Selecciona el módulo</div>
    <div class="pickergrid">${MODULOS.map(m=>`
      <button class="modcard" style="background:${m.color}" onclick="chooseModulo('${m.nombre}')">
        <div class="modbadge">${m.code}<span>${m.region.slice(0,3).toUpperCase()}</span></div>
        <div class="modname">${m.nombre}</div><div class="modregion">${m.region}</div>
      </button>`).join('')}
    </div>`;
}

async function chooseModulo(nombre){
  moduloActual = nombre;
  localStorage.setItem('am_modulo', nombre);
  document.getElementById('nav').style.display='flex';
  renderModBar(); ajustarNavSticky();
  await loadStock();
  setView('home');
}

// El menú de pestañas se pega justo debajo del encabezado; su altura cambia según la pantalla
// (PC, celular, nombre del módulo), así que se calcula en vez de usar un número fijo.
function ajustarNavSticky(){
  try{ const h=document.querySelector('header'), n=document.getElementById('nav'); if(h&&n) n.style.top = h.offsetHeight+'px'; }catch(e){}
}
window.addEventListener('resize', ajustarNavSticky);
try{ if(window.ResizeObserver){ const ro = new ResizeObserver(ajustarNavSticky); document.addEventListener('DOMContentLoaded', ()=>{ const h=document.querySelector('header'); if(h) ro.observe(h); }); const h0=document.querySelector('header'); if(h0) ro.observe(h0); } }catch(e){}
// ===== Versión de la app (confirmado por el usuario) =====
// Se ve en Inicio; si en el servidor ya hay una versión más nueva, sale un aviso para actualizar con
// un toque (borra lo guardado de la versión vieja y recarga). Cada usuario deja registrada su versión
// para que Dirección vea quién trae una versión vieja.
const APP_VERSION = 'v126';
const numVersion = v => Number(String(v||'').replace(/\D/g,''))||0;
let versionServidor = null;
async function revisarVersion(){
  try{
    const r = await fetch('sw.js?ts='+Date.now(), {cache:'no-store'}); if(!r.ok) return;
    const m = (await r.text()).match(/auditoriamodulos-(v\d+)/); if(!m) return;
    versionServidor = m[1];
    if(numVersion(versionServidor) > numVersion(APP_VERSION)) mostrarAvisoVersion();
  }catch(e){}
}
function mostrarAvisoVersion(){
  if(document.getElementById('ver-banner')) return;
  const b = document.createElement('div'); b.id='ver-banner';
  b.style.cssText='position:fixed;left:12px;right:12px;bottom:14px;z-index:9998;background:#1f9d55;color:#fff;border-radius:14px;padding:12px 14px;display:flex;gap:10px;align-items:center;box-shadow:0 8px 24px rgba(0,0,0,.35);font-weight:700';
  b.innerHTML = `<span style="flex:1">🔄 Hay una versión nueva de la app (${versionServidor}). Tú tienes la ${APP_VERSION}.</span><button class="btn small" style="background:#fff;color:#1f9d55;box-shadow:none" onclick="actualizarApp()">Actualizar</button>`;
  document.body.appendChild(b);
}
async function actualizarApp(){
  try{ if(typeof guardarBorradorAud==='function' && current==='aud') guardarBorradorAud(); }catch(e){}
  try{ const regs = navigator.serviceWorker ? await navigator.serviceWorker.getRegistrations() : []; for(const r of regs) await r.unregister(); }catch(e){}
  try{ if(window.caches){ const ks = await caches.keys(); for(const k of ks) await caches.delete(k); } }catch(e){}
  location.reload();
}
async function registrarVersionUsuario(){
  try{
    const email = getCurrentUserEmail ? getCurrentUserEmail() : ''; if(!email || esSoloLectura()) return;
    await db.collection('versiones').doc(email).set({email, modulo: (miPerfil&&miPerfil.modulo) || modulo() || '', rol:(miPerfil&&miPerfil.rol)||'', version:APP_VERSION, fecha:new Date().toISOString()});
  }catch(e){}
}
setInterval(revisarVersion, 10*60*1000);
document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='visible') revisarVersion(); });

async function init(){
  document.querySelectorAll('#nav button[data-v]').forEach(b=>b.onclick=()=>setView(b.dataset.v));
  document.getElementById('logoutBtn').onclick = doLogout;
  initSync();
  unsubscribeSyncBadge = onSyncStateChange(renderSyncBadge);
  aplicarPermisosUI();
  if(miPerfil && miPerfil.rol==='coordinador'){
    if(!miPerfil.modulo){
      document.getElementById('nav').style.display='none';
      $('#main').innerHTML = `<div class="card">Tu cuenta (${getCurrentUserEmail()}) todavía no tiene un módulo asignado.
        <p class="hint">Pídele a tu administrador que te lo asigne (tabla "perfiles" en Supabase) y vuelve a entrar.</p></div>`;
      return;
    }
    moduloActual = miPerfil.modulo;
    localStorage.setItem('am_modulo', moduloActual);
  }
  renderModBar();
  if(!moduloActual){ showPicker(); return; }
  // Al iniciar sesión por primera vez el menú quedaba oculto (lo esconde la pantalla de login) y
  // las cuentas con módulo fijo nunca lo volvían a mostrar: se muestra siempre que ya hay módulo.
  document.getElementById('nav').style.display='flex';
  ajustarNavSticky();
  await loadStock();
  setView('home');
  abrirAccesoDirecto();
  revisarVersion(); registrarVersionUsuario();
  // Pide al teléfono que NO borre los datos guardados de la app (importante para lo anotado sin internet).
  try{ if(navigator.storage && navigator.storage.persist) navigator.storage.persist(); }catch(e){}
}

// ===== App instalable (PWA) =====
function esAppInstalada(){ return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true; }
function esIPhone(){ return /iphone|ipad|ipod/i.test(navigator.userAgent||'') || (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1); }
// Accesos directos del ícono (mantener presionado): ?ir=entrada | corte | inst | inv
function abrirAccesoDirecto(){
  try{
    const ir = new URLSearchParams(location.search).get('ir');
    if(!ir) return;
    history.replaceState(null, '', location.pathname);
    if(ir==='entrada' && !esSoloLectura()) irA('mov',{tipo:'entrada'});
    else if(ir==='corte' && !esSoloLectura()) irA('mov',{tipo:'corte',cat:'Melamina'});
    else if(ir==='inst' && !esSoloLectura()) irA('inst');
    else if(ir==='inv') irA('inv');
  }catch(e){}
}
function avisoInstalarHtml(){
  if(esAppInstalada()) return '';
  try{ if(localStorage.getItem('am_ocultarInstalar')==='1') return ''; }catch(e){}
  const cerrar = `<button class="btn small" style="background:transparent;color:var(--sub);border:1px solid var(--line);box-shadow:none" onclick="try{localStorage.setItem('am_ocultarInstalar','1')}catch(e){};renderHome()">Ahora no</button>`;
  if(window.__installPrompt) return `<div class="card" style="padding:12px"><div class="pend"><div>📲 <strong>Instala la app</strong> en tu celular para abrirla desde su ícono, a pantalla completa.</div>
    <div class="row" style="gap:6px;flex-wrap:nowrap">${cerrar}<button class="btn small" onclick="instalarApp()">Instalar</button></div></div></div>`;
  if(esIPhone()) return `<div class="card" style="padding:12px"><div><strong>📲 Instala la app en tu iPhone</strong>
    <ol style="margin:6px 0 8px 18px;padding:0;line-height:1.6"><li>Ábrela en <strong>Safari</strong>.</li><li>Toca <strong>Compartir</strong> (cuadro con flecha ⬆️).</li><li>Elige <strong>"Agregar a inicio"</strong> y toca <strong>Agregar</strong>.</li><li>Ábrela siempre desde el ícono nuevo.</li></ol>${cerrar}</div></div>`;
  return '';
}
async function instalarApp(){
  const p = window.__installPrompt; if(!p) return;
  p.prompt();
  try{ await p.userChoice; }catch(e){}
  window.__installPrompt = null;
  renderHome();
}

async function doLogout(){
  if(!confirm('¿Cerrar sesión en este dispositivo?')) return;
  await signOut();
  location.reload();
}

let unsubscribeSyncBadge = null;
function renderSyncBadge(state){
  const el = document.getElementById('syncBadge');
  if(!el) return;
  if(!supabaseReady){
    el.textContent = 'Modo local (sin Supabase configurado)';
    el.style.background = 'rgba(255,255,255,.15)';
    return;
  }
  if(!state.enLinea){
    el.textContent = '📴 Sin internet' + (state.pendientes? ' · '+state.pendientes+' cambio(s) por sincronizar' : ' · todo respaldado localmente');
    el.style.background = 'rgba(179,69,44,.35)';
  } else if(state.sincronizando){
    el.textContent = '🔄 Sincronizando…';
    el.style.background = 'rgba(255,255,255,.15)';
  } else if(state.pendientes>0){
    el.textContent = '⏳ '+state.pendientes+' cambio(s) por sincronizar';
    el.style.background = 'rgba(224,121,26,.35)';
  } else {
    el.textContent = '✅ Sincronizado';
    el.style.background = 'rgba(46,125,79,.3)';
  }
}

// Suscripciones activas: se cancelan al cambiar de módulo para no acumular escuchas repetidas
// (antes cada cambio de módulo sumaba otra copia de todas y la app se iba poniendo lenta).
let _subs = [];
async function loadStock(){
  _subs.forEach(u=>{ try{ if(typeof u==='function') u(); }catch(e){} }); _subs = [];
  const sub = u => { if(typeof u==='function') _subs.push(u); };
  try{
    sub(db.collection('inicial').where('modulo','==',modulo()).onSnapshot(snap=>{
      inicialMap={}; inicialCortadoMap={}; inicialFechaMap={};
      snap.docs.forEach(d=>{ const x=d.data(); inicialMap[x.itemId]=x.cantidad; if(x.cortado) inicialCortadoMap[x.itemId]=x.cortado; if(x.fecha) inicialFechaMap[x.itemId]=x.fecha; });
      if(current==='home') renderHome();
      if(current==='inv') renderInv();
    }));
  }catch(e){}
  try{
    sub(db.collection('movimientos').where('modulo','==',modulo()).onSnapshot(snap=>{
      movs = snap.docs.map(d=>({id:d.id,...d.data()})).filter(m=>m.modulo===modulo()).sort((a,b)=>(b.fecha||'').localeCompare(a.fecha||''));
      if(current==='inv') renderInv(); if(current==='mov') renderMov(); if(current==='home') renderHome(); if(current==='ped') renderPed();
      revisarAvisosNuevos();
    }));
  }catch(e){}
  try{
    sub(db.collection('resets').onSnapshot(snap=>{
      resetMap={}; snap.docs.forEach(d=>{ resetMap[d.id]=d.data().fecha; });
      if(current==='inv') renderInv();
    }));
  }catch(e){}
  try{
    // Stock mínimo por módulo (lo fija Dirección)
    sub(db.collection('config').where('modulo','==',modulo()).onSnapshot(snap=>{
      minimosMap = {}; snap.docs.forEach(d=>{ if(d.id==='minimos_'+modulo()) minimosMap = (d.data().valores)||{}; });
      if(current==='home') renderHome(); if(current==='min') renderMin();
    }));
  }catch(e){}
  try{
    // Cierres del turno de los módulos (aviso para Dirección, confirmado por el usuario).
    if(esAdmin()) sub(db.collection('cierres').onSnapshot(snap=>{
      cierresCache = snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.fecha||'').localeCompare(a.fecha||''));
      if(current==='home') renderHome();
      revisarAvisosNuevos();
    }));
  }catch(e){}
  try{
    // Pedidos de material en camino (todos los módulos para Dirección; el suyo para el coordinador).
    sub(db.collection('pedidos').onSnapshot(snap=>{
      pedidos = snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.fecha||'').localeCompare(a.fecha||''));
      if(current==='ped') renderPed(); if(current==='home') renderHome();
      revisarAvisosNuevos();
    }));
  }catch(e){}
  try{
    // Conteo del almacén abierto por Dirección para los coordinadores (solo el día indicado).
    sub(db.collection('conteoAbierto').onSnapshot(snap=>{
      conteoMap={}; snap.docs.forEach(d=>{ conteoMap[d.id]=d.data(); });
      if(current==='home') renderHome();
      if(current==='aud') renderAud();
    }));
  }catch(e){}
  try{
    sub(db.collection('auditorias').where('modulo','==',modulo()).onSnapshot(snap=>{
      auditorias = snap.docs.map(d=>({id:d.id,...d.data()})).filter(a=>a.modulo===modulo()).sort((a,b)=>(b.fecha||'').localeCompare(a.fecha||''));
      if(current==='hist') renderHist();
    }));
  }catch(e){}
  try{
    // Deuda por faltantes de auditoría (se conserva aparte aunque el inventario se ajuste)
    sub(db.collection('deudasAuditoria').where('modulo','==',modulo()).onSnapshot(snap=>{
      deudas = snap.docs.map(d=>({id:d.id,...d.data()})).filter(x=>x.modulo===modulo()).sort((a,b)=>(b.fechaAuditoria||'').localeCompare(a.fechaAuditoria||''));
      if(current==='hist') renderHist();
      if(current==='rep') renderRep();
    }));
  }catch(e){}
}

// ===== Hojas completas vs. material cortado/armado (confirmado por el usuario) =====
// Solo aplica a artículos que se miden en hojas (Melamina y MDF):
//  - Entradas (y traspasos recibidos) llegan como hojas COMPLETAS.
//  - "Corte" pasa hojas de completas a CORTADO (no importa en qué piezas se convirtieron).
//  - Instalaciones descuentan del CORTADO. Si no alcanza, la app pasa HOJAS ENTERAS de
//    completas a cortado (como un corte que no se registró), de ahí toma lo proporcional y el
//    sobrante se queda en cortado. Eso se marca como "corte automático" para avisar.
//  - Salidas (y traspasos enviados) salen siempre de completas.
//  - Mermas: se elige si fueron de completas o de cortado (por defecto, completas).
function esHoja(it){ return !!it && (it.cat==='Melamina' || it.cat==='MDF'); }
function esHojaId(itemId){ return esHoja(CATALOGO.find(i=>i.id===itemId)); }

// Motor único (lo usan calcFormula y calcFormulaForModulo). movsItem = movimientos YA filtrados
// por módulo/artículo/estado aprobado/reset. Se procesan en orden de fecha.
// Corte del día (confirmado por el usuario): el corte se registra al FINAL del turno, y las
// instalaciones se capturan antes o después. Si una instalación llega antes del corte, la app
// toma hojas completas "provisionalmente" (deuda). Cuando llega el corte, primero cubre esa
// deuda (esas hojas ya salieron de completas, no se vuelven a descontar) y solo el resto pasa
// de completas a cortado. Así el orden de captura no altera el resultado.
function calcularFormula(itemId, inicial, inicialCortado, movsItem){
  let entradas=0, salidas=0, instalaciones=0, garantias=0, mermas=0, cortes=0, ajustes=0, deuda=0, faltoCortado=0;
  const hoja = esHojaId(itemId);
  const iniCort = hoja ? Math.min(Math.max(0, inicialCortado||0), Math.max(0,inicial)) : 0;
  let cortado = iniCort;
  let completas = inicial - cortado;
  const EPS = 1e-9;
  [...movsItem].sort((a,b)=>(a.fecha||'').localeCompare(b.fecha||'')).forEach(m=>{
    const q = Number(m.cantidad)||0;
    if(m.tipo==='entrada'){ entradas+=q; completas+=q; }
    else if(m.tipo==='devolucion'){
      // Material que regresó de una garantía y sí sirve: suma. En hojas regresa como material cortado.
      entradas+=q; if(hoja) cortado+=q; else completas+=q;
    }
    else if(m.tipo==='salida'){ salidas+=q; completas-=q; }
    else if(m.tipo==='corte'){
      if(!hoja) return;
      cortes+=q;
      const cubre = Math.min(q, deuda);   // hojas que ya se habían tomado provisionalmente
      deuda -= cubre;
      const resto = q - cubre;
      completas-=resto; cortado+=resto;
    }
    else if(m.tipo==='merma'){ mermas+=q; if(hoja && m.lado==='cortado') cortado-=q; else completas-=q; }
    else if(m.tipo==='ajuste'){
      // Ajuste por auditoría aplicada: deja el inventario igual a lo contado (q puede ser negativo).
      ajustes+=q;
      if(hoja){
        completas += Number(m.completasDelta)||0;
        cortado += Number(m.cortadoDelta)||0;
        if(m.limpiarDeuda) deuda = 0; // el conteo físico manda: ya no hay hojas "sin corte" pendientes
      } else completas += q;
    }
    else if(m.tipo==='sobrante'){
      // Material que regresó sin instalarse y se aparta en "Sobrantes": sale del inventario (del
      // cortado; si no alcanza, toma hojas completas como una instalación) hasta que se transforme.
      salidas+=q;
      if(!hoja){ completas-=q; return; }
      if(cortado >= q-EPS){ cortado-=q; return; }
      const falta = q - Math.max(0,cortado); const hojas = Math.ceil(falta - EPS);
      faltoCortado += falta; deuda += hojas; completas -= hojas; cortado = Math.max(0,cortado) + hojas - q;
    }
    else if(m.tipo==='instalacion' || m.tipo==='garantia'){
      // Garantías consumen igual que una instalación (del material cortado), pero se cuentan aparte.
      if(m.tipo==='garantia') garantias+=q; else instalaciones+=q;
      if(!hoja){ completas-=q; return; }
      if(cortado >= q-EPS){ cortado-=q; return; }
      const falta = q - Math.max(0,cortado);
      const hojas = Math.ceil(falta - EPS);
      faltoCortado += falta; deuda += hojas;
      completas -= hojas; cortado = Math.max(0,cortado) + hojas - q;
    }
  });
  // autoCortes = hojas tomadas provisionalmente que TODAVÍA no cubre ningún corte registrado.
  const autoCortes = Math.abs(deuda)<EPS ? 0 : deuda;
  const final = inicial+entradas-salidas-instalaciones-garantias-mermas+ajustes;
  const r = {inicial,entradas,salidas,instalaciones,garantias,mermas,ajustes,final};
  if(hoja){
    Object.assign(r, {esHoja:true, cortes, autoCortes, faltoCortado,
      completas: Math.abs(completas)<EPS?0:completas, cortado: Math.abs(cortado)<EPS?0:cortado,
      inicialCortado: iniCort});
  } else {
    r.completas = final; r.cortado = 0;
  }
  return r;
}

// Calcula {inicial, entradas, salidas, instalaciones, mermas, final, (hojas: completas, cortado,
// cortes, autoCortes)} para un artículo del módulo actual.
// Línea base de un artículo (confirmado por el usuario: "stock inicial" = lo que hay HOY).
// - Si se capturó un stock inicial con fecha (y es posterior a un "poner en cero"), ese es el punto
//   de partida y solo cuentan los movimientos DESPUÉS de esa fecha.
// - Si no, y el módulo se puso en cero, se parte de 0 desde la fecha del reset.
// - Inicial viejo sin fecha (versiones anteriores): se suma a todos los movimientos, como antes.
function lineaBase(resetFecha, doc){
  if(doc && doc.fecha && (!resetFecha || doc.fecha > resetFecha)) return {inicial:Number(doc.cantidad)||0, inicialCortado:Number(doc.cortado)||0, desde:doc.fecha};
  if(resetFecha) return {inicial:0, inicialCortado:0, desde:resetFecha};
  return {inicial:(doc&&Number(doc.cantidad))||0, inicialCortado:(doc&&Number(doc.cortado))||0, desde:null};
}
function calcFormula(itemId){
  const resetFecha = resetMap[modulo()];
  const doc = inicialMap[itemId]!==undefined ? {cantidad:inicialMap[itemId], cortado:inicialCortadoMap[itemId], fecha:inicialFechaMap[itemId]} : null;
  const b = lineaBase(resetFecha, doc);
  // Solo cuenta lo "aprobado" (o sin estado = movimientos viejos, de antes de que existiera
  // esta función) hacia el Final oficial. Lo "pendiente" o "rechazado" no descuenta/suma nada.
  const lista = movs.filter(m=>m.itemId===itemId && (!b.desde || m.fecha>b.desde) && m.estado!=='pendiente' && m.estado!=='rechazado');
  return calcularFormula(itemId, b.inicial, b.inicialCortado, lista);
}

// Cuántas hojas completas tendría que tomar una instalación nueva que consume `cantidad`
// (0 si el cortado alcanza). Sirve para avisar ANTES de guardar.
function hojasAutoCorteSiInstala(itemId, cantidad){
  if(!esHojaId(itemId)) return {hojas:0, falta:0};
  const f = calcFormula(itemId);
  if(f.cortado >= cantidad - 1e-9) return {hojas:0, falta:0};
  const falta = cantidad - Math.max(0,f.cortado);
  return {hojas: Math.ceil(falta - 1e-9), falta};
}

// Redondea a máximo 2 decimales para mostrar en pantalla/reportes (evita cifras como
// 6.9679999999999 por errores normales de redondeo con decimales en JavaScript).
function fmtNum(n){
  const x = Math.round((Number(n)||0)*100)/100;
  return Object.is(x,-0) ? 0 : x;
}

// ===== PIN de administrador para "poner en cero" =====
// Se guarda en la colección 'config' (no en el código) para que el admin lo pueda cambiar
// él mismo desde la app, sin depender de que se suba un archivo nuevo. Si nunca se ha
// configurado, cae en un PIN por defecto (confirmado por el usuario: 1712).
const PIN_CERO_DEFECTO = '1712';
async function getPinCero(){
  try{
    const d = await db.collection('config').doc('pin_cero').get();
    return (d && d.exists && d.data().pin) ? String(d.data().pin) : PIN_CERO_DEFECTO;
  }catch(e){ return PIN_CERO_DEFECTO; }
}
async function cambiarPinCero(){
  if(!esAdmin()) return alert('Solo el administrador puede cambiar el PIN.');
  const actual = await getPinCero();
  const nuevo = prompt('Nuevo PIN para "poner en cero" (numérico, 4 dígitos o más):', actual);
  if(nuevo===null) return;
  if(!/^\d{4,}$/.test(nuevo)) return alert('El PIN debe ser numérico, de al menos 4 dígitos.');
  try{ await db.collection('config').doc('pin_cero').set({pin:nuevo}); alert('PIN actualizado.'); }
  catch(e){ alert('Error: '+e.message); }
}

// "Poner en cero" (confirmado por el usuario): se elige entre empezar de cero borrando TODO el
// historial del módulo, o solo dejar el inventario en 0 conservando el historial.
function ceroModulo(){
  if(!esAdmin()) return alert('Solo el administrador puede poner el inventario en cero.');
  let ov = document.getElementById('cero-ov'); if(ov) ov.remove();
  ov = document.createElement('div'); ov.id='cero-ov';
  ov.style.cssText='position:fixed;inset:0;background:rgba(10,12,20,.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
  ov.innerHTML = `<div class="card" style="max-width:420px;width:100%;margin:0">
    <div style="font-size:17px;font-weight:800">Poner en cero · ${modulo()}</div>
    <p class="hint">¿Qué quieres hacer?</p>
    <button class="btn" style="width:100%;min-height:64px;text-align:left;background:var(--bad);margin-top:6px" onclick="document.getElementById('cero-ov').remove();borrarDatosModulo([modulo()])">🧹 Empezar de cero: borrar TODO<br><small style="font-weight:400">Inventario, entradas, salidas, cortes, instalaciones, garantías, traspasos, auditorías, pedidos y todo el historial de ${modulo()}.</small></button>
    <button class="btn" style="width:100%;min-height:64px;text-align:left;background:transparent;color:var(--ink);border:1px solid var(--line);box-shadow:none;margin-top:10px" onclick="document.getElementById('cero-ov').remove();ceroSoloInventario()">0️⃣ Solo poner el inventario en 0<br><small style="font-weight:400;color:var(--sub)">El historial se conserva; el stock parte de 0 desde hoy.</small></button>
    <button class="btn small" style="width:100%;margin-top:10px;background:transparent;color:var(--sub);border:none;box-shadow:none" onclick="document.getElementById('cero-ov').remove()">Cancelar</button>
  </div>`;
  document.body.appendChild(ov);
}
async function ceroSoloInventario(){
  const pin = prompt('Ingresa el PIN de administrador para confirmar:');
  if(pin===null) return;
  const pinGuardado = await getPinCero();
  if(pin!==pinGuardado) return alert('PIN incorrecto. No se puso en cero el inventario.');
  if(!confirm('¿Poner en CERO el inventario de '+modulo()+'? Esto no borra el historial, pero el stock actual de este módulo partirá de 0. Los demás módulos no se afectan.')) return;
  try{ await db.collection('resets').doc(modulo()).set({modulo:modulo(), fecha:new Date().toISOString()}); alert('Inventario de '+modulo()+' reiniciado a cero.'); }
  catch(e){ alert('Error: '+e.message); }
}

// Historial de cambios al stock inicial: antes → después, quién y cuándo.
async function registrarCambioInicial(it, docNuevo, origen){
  try{
    const f = calcFormula(it.id);
    await db.collection('inicialHist').doc(cryptoId()).set({modulo:docNuevo.modulo, itemId:it.id, itemNombre:it.nombre,
      antesInicial: fmtNum(Number(inicialMap[it.id]??0)), stockAntes: fmtNum(f.final), nuevo: fmtNum(Number(docNuevo.cantidad)||0), cortado: docNuevo.cortado!==undefined?docNuevo.cortado:null,
      origen, fecha:new Date().toISOString(), creadoPor: getCurrentUserEmail?getCurrentUserEmail():''});
  }catch(e){}
}
async function pedirPinAdmin(que){
  const pin = prompt('🔒 El stock inicial está bloqueado.\n\nEscribe el PIN de Dirección para '+que+':');
  if(pin===null) return false;
  if(pin!==(await getPinCero())){ alert('PIN incorrecto. No se cambió nada.'); return false; }
  return true;
}
async function editInicial(itemId){
  if(!esAdmin()) return alert('Solo Dirección puede cambiar el stock inicial.');
  if(!(await pedirPinAdmin('cambiar el stock inicial'))) return;
  const itE = CATALOGO.find(i=>i.id===itemId);
  const actual = inicialMap[itemId] ?? 0;
  if(esHojaId(itemId)){
    // Hojas: la línea base se captura separada en completas y cortado/armado.
    const cortActual = inicialCortadoMap[itemId] ?? 0;
    const vComp = prompt('Stock inicial en '+modulo()+'\n\n1 de 2 · Hojas COMPLETAS:', fmtNum(actual - cortActual));
    if(vComp===null || vComp.trim()==='' || isNaN(Number(vComp)) || Number(vComp)<0) return;
    const vCort = prompt('Stock inicial en '+modulo()+'\n\n2 de 2 · Material CORTADO o armado (en hojas equivalentes, 0 si no hay):', fmtNum(cortActual));
    if(vCort===null || vCort.trim()==='' || isNaN(Number(vCort)) || Number(vCort)<0) return;
    const comp = Number(vComp), cort = Number(vCort);
    try{ const d={modulo:modulo(),itemId,cantidad:fmtNum(comp+cort),cortado:cort,fecha:new Date().toISOString(),creadoPor:getCurrentUserEmail?getCurrentUserEmail():''}; await registrarCambioInicial(itE, d, 'Cambio manual'); await db.collection('inicial').doc(inicialKey(modulo(),itemId)).set(d); }
    catch(e){ alert('Error: '+e.message); }
    return;
  }
  const val = prompt('Stock inicial (línea base) para este artículo en '+modulo(), actual);
  if(val===null || isNaN(Number(val))) return;
  try{ const d={modulo:modulo(),itemId,cantidad:Number(val),fecha:new Date().toISOString(),creadoPor:getCurrentUserEmail?getCurrentUserEmail():''}; await registrarCambioInicial(itE, d, 'Cambio manual'); await db.collection('inicial').doc(inicialKey(modulo(),itemId)).set(d); }
  catch(e){ alert('Error: '+e.message); }
}

function setView(v){
  current=v;
  if(esSoloLectura() && ['mov','inst','trasp','pend','mas','pzenc','gas'].includes(v)){
    document.querySelectorAll('#nav button[data-v]').forEach(b=>b.classList.toggle('active',b.dataset.v===v));
    $('#main').innerHTML = `<div class="card">Tu cuenta (${ROL_LABELS[miPerfil.rol]||miPerfil.rol}) no captura en esta sección.</div>`; return;
  }
  document.querySelectorAll('#nav button[data-v]').forEach(b=>b.classList.toggle('active',b.dataset.v===v));
  if(v==='home') renderHome();
  if(v==='gar'){ if(garSub==='sobrante') salirSobrante(); renderGar(); }
  if(v==='ini') renderIni();
  if(v==='movhist') renderMovHist();
  if(v==='ped') renderPed();
  if(v==='mas') renderMas();
  if(v==='cierre') renderCierre();
  if(v==='min') renderMin();
  if(v==='todos'){ todosCache=null; renderTodos(); }
  if(v==='pend') renderPend();
  if(v==='tubos') renderTubos();
  if(v==='pzenc') renderPzEnc();
  if(v==='recon') renderRecon();
  if(v==='gas'){ gasCache=null; renderGas(); }
  if(v==='resumen'){ resumenCache=null; renderResumen(); }
  if(v==='valinst') renderValInst();
  if(v==='sob'){ if(garSub==='sobrante') salirSobrante(); renderSob(); }
  if(v==='inv') renderInv(); if(v==='mov') renderMov(); if(v==='aud') renderAud(); if(v==='hist') renderHist();
  if(v==='cat') renderCat(); if(v==='desp') renderDesp(); if(v==='inst'){ instPreview=null; instRegresoLibre=false; renderInst(); } else instCambio=null;
  if(v==='trasp') renderTrasp(); if(v==='rep') renderRep(); if(v==='usr') renderUsuarios(); if(v==='apr') renderAprobaciones();
}

let invCat = null, invDetalle = false;
// Hojas que todavía no tienen un corte registrado (se tomaron provisionalmente), de todo el catálogo.
function cortesPendientes(){
  return CATALOGO.filter(it=>esHoja(it)).map(it=>({it, f:calcFormula(it.id)})).filter(x=>x.f.autoCortes>0);
}
// Último corte anotado de una hoja en el módulo actual (para decir desde cuándo se acumula).
function ultimoCorteTxt(itemId){
  const c = movs.filter(m=>m.itemId===itemId && m.tipo==='corte' && m.estado!=='rechazado' && (!m.modulo || m.modulo===modulo())).map(m=>m.fecha||'').sort().pop();
  return c ? 'acumulado desde el último corte anotado ('+new Date(c).toLocaleDateString('es-MX',{day:'numeric',month:'short'})+')' : 'nunca se ha anotado un corte de este color';
}
function avisoCortePendienteHtml(lista){
  if(!lista.length || !puedeEscribir() || (miPerfil && (miPerfil.rol==='supervisor'||miPerfil.rol==='gerente'))) return '';
  return `<div class="warn" style="display:flex;align-items:center;gap:10px;margin:0 0 12px;padding:10px 12px">
    <div style="flex:1;line-height:1.4">✂️ <strong>Falta contar en el cierre:</strong> ${lista.map(x=>`${fmtNum(x.f.autoCortes)} ${x.it.nombre.replace('Melamina ','')}`).join(' · ')}<br><small>Ya están descontadas del inventario.</small></div>
    <button class="btn small" style="white-space:nowrap" onclick="irA('cierre')">Contar</button>
  </div>`;
}
// Muestra de color y barra completas/cortado en el inventario (confirmado por el usuario).
const SWATCH_COLOR = {'Blanco':'#f7f7f4','Cenizo':'#b9b2a6','Beige':'#e3d3b5','Durango':'#9b6b43','Gris':'#8d9196','Lino':'#d8cfc0','Bco Mármol':'linear-gradient(135deg,#fafafa,#d4d4d4 55%,#fff)','Neg Mármol':'linear-gradient(135deg,#222,#5a5a5a 55%,#111)','Monarca':'#6e4a2f','Negro':'#1d1d1f','Nogal':'#5a3b26','Polar':'#e8ecef','Rioja':'#8a4b32','Roble':'#b38452','Roble Santana':'#a6784a','Choco':'#4a2e22'};
function swatchHtml(nombre){
  const c = String(nombre||'').replace(/^(Melamina|MDF)\s+/,'');
  const col = SWATCH_COLOR[c]; if(!col || c===nombre) return '';
  return `<span class="sw" style="background:${col}"></span>`;
}
function barraHojasHtml(f){
  const a = Math.max(0, Number(f.completas)||0), k = Math.max(0, Number(f.cortado)||0), T = a+k;
  if(T<=0) return '';
  return `<div class="barra" title="Azul: completas · Rojo: ya cortadas"><i style="width:${a/T*100}%;background:var(--brand)"></i><i style="width:${k/T*100}%;background:var(--accent)"></i></div>`;
}
function renderInv(){
  const cats = [...new Set(CATALOGO.map(i=>i.cat))];
  if(!invCat) invCat = cats[0];
  const catsHtml = cats.map(c=>
    `<button class="chip ${c===invCat?'on':''}" onclick="invCat='${c}';renderInv()">${ICONO_CAT[c]||''} ${c}</button>`
  ).join('');
  const rows = CATALOGO.filter(i=>i.cat===invCat);
  const catHoja = rows.length>0 && esHoja(rows[0]);
  let html = `<div class="card">
    <div class="row" style="justify-content:space-between">
      <div style="font-size:17px;font-weight:800">📦 Inventario · ${modulo()}</div>
      ${esAdmin()?`<button class="btn small" style="background:transparent;color:var(--bad);border:1px solid var(--line);box-shadow:none" onclick="ceroModulo()">Poner en cero</button>`:''}
    </div>
    ${esAdmin() ? `<button class="btn" style="margin-top:10px;width:100%;background:transparent;color:var(--brand);border:1px solid var(--line);box-shadow:none" onclick="irA('ini')">🔒 Stock inicial (solo Dirección, con PIN)</button>` : ''}
    <button class="btn" style="margin-top:8px;width:100%;background:transparent;color:var(--brand);border:1px solid var(--line);box-shadow:none" onclick="irA('movhist')">📜 Historial de entradas y salidas</button>
    <p class="hint">Elige qué quieres ver:</p>
    <div class="chips">${catsHtml}</div>
  </div>`;
  html += avisoCortePendienteHtml(cortesPendientes().filter(x=>x.it.cat===invCat));
  if(catHoja){
    const tot = rows.reduce((s,it)=>{ const f=calcFormula(it.id); s.c+=f.completas; s.k+=f.cortado; s.t+=f.final; return s; },{c:0,k:0,t:0});
    html += `<div class="card">
      <div class="grid2" style="grid-template-columns:1fr 1fr 1fr;text-align:center">
        <div><div class="hint" style="margin:0">Hojas completas</div><div class="bignum">${fmtNum(tot.c)}</div></div>
        <div><div class="hint" style="margin:0">Ya cortadas</div><div class="bignum" style="color:var(--accent)">${fmtNum(tot.k)}</div></div>
        <div><div class="hint" style="margin:0">Total</div><div class="bignum" style="color:var(--brand)">${fmtNum(tot.t)}</div></div>
      </div>
    </div>`;
  }
  if(invCat==='Herrajes') html += correderasSueltasCardHtml();
  html += `<div class="row" style="justify-content:space-between;margin:4px 2px 10px">
      <strong>${ICONO_CAT[invCat]||''} ${invCat}</strong>
      <button class="btn small" style="background:transparent;color:var(--brand);border:1px solid var(--line);box-shadow:none" onclick="invDetalle=!invDetalle;renderInv()">${invDetalle?'Ver sencillo':'Ver tabla detallada'}</button>
    </div>`;
  if(!invDetalle){
    // Lo que sí hay primero; lo que está en cero, al final (para no buscar entre ceros).
    const orden = rows.map(it=>({it, f:calcFormula(it.id)})).sort((a,b)=>(Math.abs(a.f.final)<0.005)-(Math.abs(b.f.final)<0.005));
    html += `<div class="invlist">${orden.map(({it,f})=>{
      const vacio = Math.abs(f.final)<0.005;
      return `<div class="invitem ${vacio?'vacio':''}">
        <div style="min-width:0;flex:1"><div class="invname">${swatchHtml(it.nombre)}${it.nombre}</div>
          ${catHoja && !vacio ? `<div class="hint" style="margin:2px 0 0">${fmtNum(f.completas)} completas · ${fmtNum(f.cortado)} ya cortadas</div>${barraHojasHtml(f)}` : ''}</div>
        <div class="invqty ${f.final<0?'neg':''}">${fmtNum(f.final)}<span>${it.unidad}</span></div>
      </div>`; }).join('')}</div>`;
  } else {
    html += `<div class="card">
      <p class="hint" style="margin-top:0">Fórmula: Inicial + Entradas − Salidas − Instalaciones − Garantías − Mermas ± Ajustes = Final.${catHoja?' En hojas: Completas + Cortado = Final. "Sin corte" = hojas usadas antes de anotar el corte del día (se quita al registrar el corte).':''} ${esAdmin()?'El stock inicial está bloqueado: solo Dirección lo puede cambiar, con PIN.':''}</p>
      <div class="wrap-x"><table>
      <tr><th>Artículo</th><th>Inicial</th><th>Entr.</th><th>Sal.</th>${catHoja?'<th>Corte</th>':''}<th>Instal.</th><th>Garant.</th><th>Mermas</th><th>Ajuste</th>${catHoja?'<th>Compl.</th><th>Cortado</th>':''}<th>Final</th></tr>
      ${rows.map(it=>{ const f=calcFormula(it.id);
        return `<tr>
          <td>${it.nombre}<div class="tag">${it.unidad}</div></td>
          <td>${esAdmin()?`<a href="#" onclick="editInicial('${it.id}');return false;">${fmtNum(f.inicial)}</a>`:fmtNum(f.inicial)}${catHoja&&f.inicialCortado?`<div class="hint" style="margin:2px 0 0">${fmtNum(f.inicialCortado)} cort.</div>`:''}</td>
          <td class="pos">${fmtNum(f.entradas)}</td>
          <td class="neg">${fmtNum(f.salidas)}</td>
          ${catHoja?`<td>${fmtNum(f.cortes+f.autoCortes)}${f.autoCortes?`<div class="tag" style="color:#b3742c;border-color:#b3742c">${fmtNum(f.autoCortes)} sin corte</div>`:''}</td>`:''}
          <td class="neg">${fmtNum(f.instalaciones)}</td>
          <td class="neg">${fmtNum(f.garantias)}</td>
          <td class="neg">${fmtNum(f.mermas)}</td>
          <td class="${f.ajustes>0?'pos':(f.ajustes<0?'neg':'')}">${f.ajustes>0?'+':''}${fmtNum(f.ajustes)}</td>
          ${catHoja?`<td>${fmtNum(f.completas)}</td><td style="color:var(--accent);font-weight:700">${fmtNum(f.cortado)}</td>`:''}
          <td><strong>${fmtNum(f.final)}</strong></td>
        </tr>`; }).join('')}
      </table></div></div>`;
  }
  $('#main').innerHTML = html;
}

// ===== Correderas sin pareja: tarjeta en Inventario → Herrajes + botón "Armar juegos" =====
// Si hay hembras y machos sueltos del mismo tipo, se pueden juntar en juegos completos:
// −n hembra, −n macho, +n juego (un solo lote, con aprobación igual que cualquier movimiento).
function correderasSueltasCardHtml(){
  const filas = CORR_TIPOS.map(t=>{
    const h = calcFormula(slug(t.hembra)).final, m = calcFormula(slug(t.macho)).final, j = calcFormula(slug(t.juego)).final;
    if(Math.abs(h)<0.005 && Math.abs(m)<0.005) return '';
    const n = Math.floor(Math.min(h, m));
    return `<div class="movitem" style="flex-wrap:wrap;gap:8px"><span style="min-width:0"><span class="invname">${t.etiqueta}</span>
        <span class="hint" style="display:block;margin:2px 0 0">${fmtNum(j)} juego(s) completos · <strong>${fmtNum(h)}</strong> hembra(s) y <strong>${fmtNum(m)}</strong> macho(s) sin pareja</span></span>
        ${n>0 && puedeEscribir() && !esSoloLectura() ? `<button class="btn small" onclick="armarJuegosCorredera('${t.juego}')">🔗 Armar ${n} juego(s)</button>` : ''}</div>`;
  }).join('');
  if(!filas) return '';
  return `<div class="card"><strong>🔩 Correderas sin pareja</strong>
    <p class="hint" style="margin-top:4px">Una corredera completa es hembra + macho. Si juntas una hembra y un macho sueltos, toca "Armar juegos" y pasan a juegos completos.</p>
    <div class="movlist">${filas}</div></div>`;
}
async function armarJuegosCorredera(juegoNombre){
  const t = CORR_TIPOS.find(x=>x.juego===juegoNombre); if(!t) return;
  const h = calcFormula(slug(t.hembra)).final, m = calcFormula(slug(t.macho)).final;
  const max = Math.floor(Math.min(h, m));
  if(max<=0) return alert('Se necesita al menos 1 hembra y 1 macho sueltos del mismo tipo.');
  const r = prompt(`${t.etiqueta}: hay ${fmtNum(h)} hembra(s) y ${fmtNum(m)} macho(s) sin pareja.\n\n¿Cuántos juegos quieres armar? (máximo ${max})`, String(max));
  if(r===null) return;
  const n = Math.floor(Number(r));
  if(!n || n<=0 || n>max) return alert('Escribe un número entre 1 y '+max+'.');
  try{
    const estado = estadoNuevoMovimiento();
    const loteId = cryptoId();
    const creadoPor = getCurrentUserEmail?getCurrentUserEmail():'';
    const fecha = new Date().toISOString();
    const nota = `Se armaron ${n} juego(s) con hembras y machos sueltos`;
    for(const [nombre, q] of [[t.hembra,-n],[t.macho,-n],[t.juego,n]]){
      const it = itemByName(nombre);
      await db.collection('movimientos').doc(cryptoId()).set({modulo:modulo(), itemId:it.id, itemNombre:it.nombre, tipo:'ajuste', motivo:'armarJuegos',
        cantidad:q, completasDelta:q, cortadoDelta:0, nota, fecha, estado, loteId, creadoPor});
    }
    toast(estado==='pendiente' ? '✅ Guardado.<br><small>Dirección lo tiene que aprobar.</small>' : `✅ ${n} juego(s) armados.`);
    renderInv();
  }catch(e){ alert('Error: '+e.message); }
}

// ===== Capturar stock inicial (pantalla sencilla, confirmado por el usuario) =====
// "Stock inicial" = lo que hay HOY: la cantidad capturada queda como el stock de ese artículo a
// partir de este momento; lo que se anote después se suma/resta desde aquí.
let iniCat = null, iniVals = {};
function renderIni(){
  if(!esAdmin()){ $('#main').innerHTML='<div class="card">🔒 El stock inicial solo lo puede cambiar Dirección.</div>'; return; }
  const cats = [...new Set(CATALOGO.map(i=>i.cat))];
  if(!iniCat) iniCat = cats[0];
  const items = CATALOGO.filter(i=>i.cat===iniCat);
  const hoja = items.length>0 && esHoja(items[0]);
  const v = id => iniVals[id] || {};
  $('#main').innerHTML = `
    <div class="card">
      <div style="font-size:17px;font-weight:800">✏️ Capturar stock inicial · ${modulo()}</div>
      <p class="hint">Escribe lo que hay <strong>hoy</strong> de cada artículo. Esa cantidad queda como su stock a partir de ahora, y lo que se anote después (entradas, instalaciones, etc.) se suma o resta desde aquí.<br>Deja vacío lo que no quieras cambiar.</p>
      <div class="chips" style="margin-top:8px">${cats.map(c=>{ const n=CATALOGO.filter(i=>i.cat===c && iniVals[i.id] && (iniVals[i.id].c!==undefined||iniVals[i.id].k!==undefined)).length;
        return `<button class="chip ${c===iniCat?'on':''}" onclick="iniCat='${c}';renderIni()">${ICONO_CAT[c]||''} ${c}${n?' ✓'+n:''}</button>`; }).join('')}</div>
    </div>
    <div class="card">
      <strong>${ICONO_CAT[iniCat]||''} ${iniCat}</strong>
      ${hoja?'<p class="hint">En hojas escribe por separado las <strong>completas</strong> (sin cortar) y las <strong>ya cortadas</strong> (en hojas; si no hay, déjalo vacío o en 0).</p>':''}
      <div class="movlist">${items.map(it=>{ const f=calcFormula(it.id);
        return hoja
          ? `<div class="movitem" style="flex-wrap:wrap"><span style="min-width:0;flex:1 1 100%"><span class="invname">${it.nombre}</span><span class="hint" style="display:block;margin:2px 0 0">Hoy dice: ${fmtNum(f.completas)} completas · ${fmtNum(f.cortado)} cortadas</span></span>
              <label style="flex:1"><span class="hint" style="margin:0">Completas</span><input type="number" min="0" inputmode="decimal" style="width:100%;margin-top:2px" value="${v(it.id).c??''}" oninput="setIni('${it.id}','c',this.value)" placeholder="—"></label>
              <label style="flex:1"><span class="hint" style="margin:0">Ya cortadas</span><input type="number" min="0" inputmode="decimal" style="width:100%;margin-top:2px" value="${v(it.id).k??''}" oninput="setIni('${it.id}','k',this.value)" placeholder="—"></label></div>`
          : `<label class="movitem"><span style="min-width:0"><span class="invname">${it.nombre}</span><span class="hint" style="display:block;margin:2px 0 0">Hoy dice: ${fmtNum(f.final)} ${it.unidad}</span></span>
              <input type="number" min="0" inputmode="decimal" value="${v(it.id).c??''}" oninput="setIni('${it.id}','c',this.value)" placeholder="—"></label>`;
      }).join('')}</div>
      <button class="btn" style="margin-top:14px;width:100%;min-height:54px;font-size:16px" onclick="guardarIni()">Guardar stock inicial</button>
      <p class="hint" style="text-align:center">Se guarda lo que capturaste en todas las categorías.</p>
    </div>`;
}
function setIni(id, lado, val){
  iniVals[id] = iniVals[id] || {};
  if(val===''||val===null) delete iniVals[id][lado]; else iniVals[id][lado] = Number(val);
  if(!Object.keys(iniVals[id]).length) delete iniVals[id];
}
async function guardarIni(){
  const ids = Object.keys(iniVals).filter(id=>iniVals[id] && (iniVals[id].c!==undefined || iniVals[id].k!==undefined));
  if(!ids.length) return alert('No escribiste ninguna cantidad.');
  const malos = ids.filter(id=>(iniVals[id].c||0)<0 || (iniVals[id].k||0)<0);
  if(malos.length) return alert('Las cantidades no pueden ser negativas.');
  const lineas = ids.map(id=>{ const it=CATALOGO.find(i=>i.id===id); const x=iniVals[id];
    if(esHoja(it)){ const f=calcFormula(id); const c = x.c!==undefined?x.c:f.completas, k = x.k!==undefined?x.k:0; return {it, c, k, txt:`• ${it.nombre}: ${fmtNum(c)} completas${k?' + '+fmtNum(k)+' cortadas':''}`}; }
    return {it, c:x.c, k:0, txt:`• ${it.nombre}: ${fmtNum(x.c)} ${it.unidad}`}; });
  if(!esAdmin()) return alert('Solo Dirección puede cambiar el stock inicial.');
  if(!(await pedirPinAdmin('cambiar el stock inicial'))) return;
  if(!confirm(`Vas a fijar el stock de HOY de ${ids.length} artículo(s) en ${modulo()}:\n\n${lineas.slice(0,20).map(l=>l.txt).join('\n')}${lineas.length>20?'\n… y '+(lineas.length-20)+' más':''}\n\n¿Todo bien?`)) return;
  try{
    const fecha = new Date().toISOString(), creadoPor = getCurrentUserEmail?getCurrentUserEmail():'';
    for(const l of lineas){
      const docIni = {modulo:modulo(), itemId:l.it.id, cantidad:fmtNum(l.c + l.k), fecha, creadoPor};
      if(esHoja(l.it)) docIni.cortado = fmtNum(l.k);
      await registrarCambioInicial(l.it, docIni, 'Captura manual');
      await db.collection('inicial').doc(inicialKey(modulo(), l.it.id)).set(docIni);
    }
    iniVals = {};
    toast('✅ Stock inicial guardado ('+lineas.length+' artículo(s)).');
    setView('inv');
  }catch(e){ alert('Error: '+e.message); }
}

// ===== Inicio: botones grandes según el rol =====
const ICONO_CAT = {Melamina:'🟫', MDF:'🟤', Cintilla:'🎞️', PVC:'📏', Pegamento:'🧴', Stickers:'🏷️', Herrajes:'🔩'};
function esSoloLectura(){ return miPerfil && (miPerfil.rol==='supervisor' || miPerfil.rol==='gerente' || miPerfil.rol==='administracion'); }
function esCoordinador(){ return miPerfil && miPerfil.rol==='coordinador'; }
// Abre una pantalla con opciones ya elegidas (p. ej. Entradas/Salidas en "Corte" de Melamina).
function irA(v, opts){
  opts = opts||{};
  if(v==='mov'){ if(opts.tipo && opts.tipo!==movTipo){ movVals={}; movBuscar=''; } if(opts.tipo) movTipo=opts.tipo; if(opts.cat) movCat=opts.cat; else if(opts.tipo==='corte' && !esHoja(CATALOGO.find(i=>i.cat===movCat))) movCat='Melamina'; }
  if(v==='hist' && opts.tab) histTab=opts.tab;
  setView(v);
  window.scrollTo(0,0);
}
// Iconos de línea para Inicio (diseño serio, confirmado por el usuario).
const HOME_IC = {
  entrada:'<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
  salida:'<path d="M12 15V3"/><path d="m7 8 5-5 5 5"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
  traspaso:'<path d="M7 7h13"/><path d="m16 3 4 4-4 4"/><path d="M17 17H4"/><path d="m8 13-4 4 4 4"/>',
  camion:'<path d="M3 6h11v10H3z"/><path d="M14 9h4l3 3v4h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
  reciclar:'<path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 21v-5h5"/>',
  cajas:'<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
  cierre:'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2.5h6V4"/><path d="m9 13 2 2 4-4"/>',
  herramienta:'<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>',
  escudo:'<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  gasolina:'<path d="M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16"/><path d="M3 21h12"/><path d="M4 10h10"/><path d="M14 8h2a2 2 0 0 1 2 2v6a1.5 1.5 0 0 0 3 0V9l-3-3"/>',
  aprobar:'<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  lupa:'<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.3-4.3"/><path d="M8.5 11h5"/>',
  mapa:'<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  capas:'<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  tendencia:'<path d="M3 20h18"/><path d="m4 15 5-5 4 4 7-7"/><path d="M15 7h5v5"/>',
  reloj:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  barras:'<path d="M5 20V11"/><path d="M12 20V4"/><path d="M19 20v-7"/><path d="M2 20h20"/>',
  usuarios:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M18 14a6 6 0 0 1 3.5 6"/>',
  mas:'<path d="M12 5v14M5 12h14"/>',
  lista:'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2.5h6V4"/><path d="M9 10h6M9 14h6M9 18h4"/>'
};
function homeIcon(k){ return `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${HOME_IC[k]||HOME_IC.cajas}</svg>`; }
// Secciones de Inicio: cada una con su familia de color; dentro de Material, una etiqueta
// distingue lo que ENTRA (verde) de lo que SALE (rojo).
const HOME_SECCIONES = {
  mat:{t:'Material', c:'#2348b5'},
  dia:{t:'Trabajo del día', c:'#0d7468'},
  dir:{t:'Dirección', c:'#4a3b8f'},
  ped:{t:'Pedidos', c:'#2348b5'}
};
function renderHome(){
  const sec = {mat:[], dia:[], dir:[], ped:[]};
  const t = (icon, titulo, sub, js, s, badge) => sec[s].push(`<button class="tile" style="--tc:${HOME_SECCIONES[s].c}" onclick="${js}" title="${String(sub).replace(/"/g,'&quot;')}">${badge?`<span class="tile-b ${badge.k}">${badge.t}</span>`:''}<span class="tile-ic">${homeIcon(icon)}</span><span class="tile-t">${titulo}</span><span class="tile-s">${sub}</span></button>`);
  const ENTRA = {k:'ent', t:'↓ Entra'}, SALE = {k:'sal', t:'↑ Sale'}, MUEVE = {k:'mov', t:'⇄ Mueve'};
  let destacado = '';
  if(!esSoloLectura()){
    t('entrada','Llegó material','Anotar hojas, herrajes, etc. que entraron',"irA('mov',{tipo:'entrada'})",'mat',ENTRA);
    t('salida','Salida o merma','Material que salió o se dañó',"irA('mov',{tipo:'salida'})",'mat',SALE);
    t('traspaso','Traspaso','Enviar material a otro módulo',"irA('trasp')",'mat',MUEVE);
    const enCamino = pedidos.filter(p=>p.modulo===modulo() && pedidoEnCamino(p)).length;
    t('camion','Por llegar', enCamino ? `${enCamino} pedido(s) en camino` : (esAdmin()?'Subir material pedido':'Material pedido que viene'),"irA('ped')",'mat', enCamino?{k:'num', t:String(enCamino)}:null);
    t('reciclar','Tubos ahorrados','Tubos que regresan los instaladores',"irA('tubos')",'mat',ENTRA);
    t('cierre','Cierre del turno','Corte de hojas, PVC, cintilla, pegamento…',"irA('cierre')",'dia');
    t('herramienta','Instalación','Registrar un clóset o puerta instalada',"irA('inst')",'dia');
    t('escudo','Garantía','Material que se da en garantía',"irA('gar')",'dia');
    t('gasolina','Gasolina','Cargas y presupuesto de la semana',"irA('gas')",'dia');
  }
  if(modoConteoCoord()) destacado = `<button class="tile tile-ancho" style="--tc:#c0392b;grid-column:1/-1" onclick="irA('aud')"><span class="tile-ic">${homeIcon('lista')}</span><span><span class="tile-t">Conteo del almacén</span><span class="tile-s">Dirección abrió el conteo de hoy. Cuenta todo lo que hay.</span></span></button>`;
  t('cajas','Ver inventario','Cuánto hay de cada cosa',"irA('inv')",'mat');
  if(esAdministracion()){
    const enCaminoT = pedidos.filter(pedidoEnCamino).length;
    t('camion','Pedidos en camino', enCaminoT?enCaminoT+' pedido(s) de los 5 módulos':'No hay nada en camino',"pedSub='camino';irA('ped')",'ped', enCaminoT?{k:'num',t:String(enCaminoT)}:null);
    t('mas','Nuevo pedido','Subir material que va a llegar',"pedSub='nuevo';irA('ped')",'ped');
    t('lista','Falta por entregar','Reporte por módulo',"pedSub='faltan';irA('ped')",'ped');
  }
  if(esAdmin()){
    t('aprobar','Aprobaciones','Revisar lo que capturaron',"irA('apr')",'dir');
    t('lupa','Auditoría y conteo','Contar lo que hay físicamente',"irA('aud')",'dir');
    t('mapa','Los 5 módulos','Cuánto hay en cada uno',"irA('todos')",'dir');
    t('capas','Sobrantes','Material que regresó sin instalar',"irA('sob')",'dir');
    t('tendencia','Resumen semanal','Cómo va cada módulo',"irA('resumen')",'dir');
  }
  if(esSoloLectura()) t('mapa','Los 5 módulos','Cuánto hay en cada uno',"irA('todos')",'dir');
  if((esAdmin() || esSoloLectura()) && !esAdministracion()) t('reloj','Historial','Auditorías y faltantes',"irA('hist')",'dir');
  t('barras','Reportes','Reporte del día en PDF',"irA('rep')", (esAdmin()||esSoloLectura()) ? 'dir' : 'dia');
  if(esAdmin()) t('usuarios','Usuarios','Dar de alta al personal',"irA('usr')",'dir');
  const orden = esAdministracion() ? ['ped','mat','dia','dir'] : ['mat','dia','dir','ped'];
  const tilesHtml = destacado + orden.filter(k=>sec[k].length).map(k=>`<div class="home-sec" style="--tc:${HOME_SECCIONES[k].c}"><div class="home-sec-t">${HOME_SECCIONES[k].t}</div><div class="tiles">${sec[k].join('')}</div></div>`).join('');

  const pend = [];
  const cp = cortesPendientes();
  if(cp.length && !esSoloLectura()) pend.push(`<div class="pend"><div>✂️ <strong>Corte sin anotar</strong>: ${cp.map(x=>`${fmtNum(x.f.autoCortes)} hoja(s) de ${x.it.nombre.replace('Melamina ','')}`).join(', ')} <span class="hint" style="margin:0">(ya descontadas del inventario; solo falta anotarlas)</span>.</div><button class="btn small" onclick="irA('cierre')">Cierre</button></div>`);
  const misPend = movs.filter(m=>m.estado==='pendiente').length;
  if(misPend && esCoordinador()) pend.push(`<div class="pend"><div>⏳ Tienes <strong>${misPend}</strong> movimiento(s) esperando que Dirección los apruebe.</div><button class="btn small" onclick="irA('pend')">Ver / corregir</button></div>`);
  const deudaPend = deudas.filter(d=>d.estado!=='saldada').length;
  if(deudaPend && (esAdmin()||esSoloLectura())) pend.push(`<div class="pend"><div>📉 Hay <strong>${deudaPend}</strong> faltante(s) de auditoría sin saldar.</div><button class="btn small" onclick="irA('hist',{tab:'deuda'})">Ver</button></div>`);

  const nombre = (getCurrentUserEmail?getCurrentUserEmail():'').split('@')[0];
  $('#main').innerHTML = `
    <div class="hello">Hola${nombre?' '+nombre:''} 👋<div class="hint" style="margin:2px 0 0;font-size:14px">¿Qué quieres hacer en <strong>${modulo()}</strong>?</div></div>
    ${pend.length?`<div class="card" style="padding:12px">${pend.join('')}</div>`:''}
    ${avisosCardHtml()}
    ${cierresHoyHtml()}
    ${recordatorioCierreHtml()}
    ${stockBajoHtml()}
    ${avisoInstalarHtml()}
    <div id="home-apr"></div>
    ${tilesHtml}
    <p class="hint" style="text-align:center;margin:14px 0 4px">Versión ${APP_VERSION}${versionServidor && numVersion(versionServidor)>numVersion(APP_VERSION)?` · <a href="#" onclick="actualizarApp();return false;">hay una nueva (${versionServidor})</a>`:' · ✅ al día'}</p>`;
  if(esAdmin()) contarAprobacionesPendientes();
  if(esAdministracion()){
    const porAprobar = []; pedidos.forEach(p=>recepcionesDe(p).forEach((r,idx)=>{ if(estadoRecepcion(r)==='pendiente') porAprobar.push(p.modulo); }));
    const el = document.getElementById('home-apr');
    if(el && porAprobar.length) el.innerHTML = `<div class="card" style="padding:12px"><div class="pend"><div>📦 Hay <strong>${porAprobar.length}</strong> entrega(s) que llegaron y esperan tu aprobación (${[...new Set(porAprobar)].join(', ')}).</div><button class="btn small" onclick="pedSub='porAprobar';irA('ped')">Revisar</button></div></div>`;
  }
}
async function contarAprobacionesPendientes(){
  try{
    const [snapMov, snapLog] = await Promise.all([db.collection('movimientos').get(), db.collection('instalacionesLog').get()]);
    const lotes = new Set(snapMov.docs.map(d=>d.data()).filter(m=>m.estado==='pendiente' && m.tipo!=='instalacion').map(m=>m.loteId||Math.random()));
    const inst = snapLog.docs.map(d=>d.data()).filter(l=>l.estado==='pendiente').length;
    const n = lotes.size + inst;
    const el = document.getElementById('home-apr');
    if(el && current==='home' && n) el.innerHTML = `<div class="card" style="padding:12px"><div class="pend"><div>✅ Hay <strong>${n}</strong> captura(s) esperando tu aprobación (todos los módulos).</div><button class="btn small" onclick="irA('apr')">Revisar</button></div></div>`;
  }catch(e){}
}

// Aviso breve que desaparece solo (más amable que una ventana de alerta).
function toast(msg, tipo){
  let el = document.getElementById('toast');
  if(!el){ el = document.createElement('div'); el.id='toast'; document.body.appendChild(el); }
  el.className = 'show '+(tipo||'ok');
  el.innerHTML = msg;
  clearTimeout(toast._t);
  toast._t = setTimeout(()=>{ el.className = ''; }, 3800);
}

let movCat = null;
// Tipo y lado elegidos en Entradas/Salidas (se conservan al cambiar de categoría).
let movTipo='entrada', movLado='completas', movVals={}, movBuscar='';
const TIPO_LABEL = {entrada:'Entrada', salida:'Salida', instalacion:'Instalación', merma:'Merma', corte:'Corte', ajuste:'Ajuste auditoría', garantia:'Garantía', devolucion:'Regresó de garantía', sobrante:'A sobrantes'};
function etiquetaTipoMov(m){
  if(m.motivo==='cierreCompletasDeMas') return 'Hojas completas de más (cierre)';
  if(m.motivo==='armarJuegos') return 'Armado de juegos';
  if(m.motivo==='sobranteGarantia') return 'Sobrante de garantía';
  if(m.motivo==='tuboAhorrado') return 'Tubo ahorrado';
  if(m.motivo==='deSobrante') return 'Sobrante transformado';
  if(m.motivo==='regresoMerma') return 'Merma (regresó sin instalar)';
  if(m.motivo==='regresoInstalacion') return 'Regresó de instalación';
  if(m.motivo==='cambioModelo') return 'Cambio de modelo (regresa)';
  if(m.motivo==='regresoPiezasInst') return 'Regresó de instalación (ya descontado)';
  if(m.motivo==='regresoSobrante') return 'A sobrantes (regresó de instalación)';
  if(m.motivo==='deudaAparecio') return 'Apareció (faltante de auditoría)';
  if(m.motivo==='piezasEncontradas') return 'Piezas encontradas';
  return (TIPO_LABEL[m.tipo]||m.tipo) + (m.tipo==='merma' && m.lado==='cortado' ? ' (de cortado)' : '');
}
function stockHojaTxt(f, unidad){
  if(!f.esHoja) return fmtNum(f.final)+' '+unidad;
  return `${fmtNum(f.final)} ${unidad}<div class="hint" style="margin-top:2px">${fmtNum(f.completas)} completas · ${fmtNum(f.cortado)} cortado</div>`;
}
// Explicación sencilla de cada tipo de movimiento (pantalla Entradas/Salidas).
const TIPO_INFO = {
  entrada:     {ic:'📥', t:'Entrada',      s:'Llegó material al módulo', verbo:'Entrada de'},
  corte:       {ic:'✂️', t:'Corte del día', s:'Hojas que se cortaron hoy', verbo:'Corte de'},
  salida:      {ic:'📤', t:'Salida',       s:'Salió material (no es instalación)', verbo:'Salida de'},
  merma:       {ic:'⚠️', t:'Merma',        s:'Material dañado o perdido', verbo:'Merma de'},
  instalacion: {ic:'🔧', t:'Instalación manual', s:'Solo si no usaste la pantalla de Instalación', verbo:'Instalación de'}
};
function renderMov(){
  if(!TIPO_INFO[movTipo]) movTipo='entrada';
  const todasCats = [...new Set(CATALOGO.map(i=>i.cat))];
  // "Corte" solo aplica a hojas (Melamina y MDF)
  const cats = movTipo==='corte' ? todasCats.filter(c=>esHoja(CATALOGO.find(i=>i.cat===c))) : todasCats;
  if(!movCat || !cats.includes(movCat)) movCat = cats[0];
  const items = CATALOGO.filter(i=>i.cat===movCat);
  const catHoja = movBuscar ? true : (items.length>0 && esHoja(items[0]));
  const info = TIPO_INFO[movTipo];
  const tiposBtns = Object.keys(TIPO_INFO).map(k=>{ const x=TIPO_INFO[k];
    return `<button class="tipobtn ${k===movTipo?'on':''} ${k==='instalacion'?'menor':''}" onclick="if(movTipo!=='${k}'){movVals={};movBuscar='';}movTipo='${k}';renderMov()"><span class="tipo-ic">${x.ic}</span><span><strong>${x.t}</strong><br><small>${x.s}</small></span></button>`; }).join('');
  const catsHtml = cats.map(c=>{ const n=CATALOGO.filter(i=>i.cat===c && Number(movVals[i.id])>0).length; return `<button class="chip ${c===movCat&&!movBuscar?'on':''}" onclick="movCat='${c}';movBuscar='';renderMov()">${ICONO_CAT[c]||''} ${c}${n?' ✓'+n:''}</button>`; }).join('');
  const pregunta = {
    entrada:'¿Cuánto llegó de cada cosa?', corte:'¿Cuántas hojas se cortaron hoy de cada color?',
    salida:'¿Cuánto salió de cada cosa?', merma:'¿Cuánto se dañó o se perdió?', instalacion:'¿Cuánto se usó en la instalación?'
  }[movTipo];
  const ayuda = {
    entrada: catHoja ? 'Las hojas que llegan cuentan como hojas completas.' : '',
    corte: 'Anota al final del turno todas las hojas que se cortaron. No importa en qué piezas se convirtieron. Si ya se registraron instalaciones hoy, se ajustan solas.',
    salida: catHoja ? 'Las salidas siempre son de hojas completas.' : '',
    merma: '',
    instalacion: 'Lo normal es usar la pantalla 🔧 Instalación, que calcula todo sola. Usa esto solo para casos especiales.'
  }[movTipo];
  $('#main').innerHTML = `
  <div class="card">
    <div class="paso">1</div><strong>¿Qué quieres anotar?</strong>
    <div class="tipos" style="margin-top:10px">${tiposBtns}</div>
    <button class="btn small" style="margin-top:10px;width:100%;background:transparent;color:#0e8a8a;border:1px solid var(--line);box-shadow:none" onclick="pzSetModo('enc');irA('pzenc')">🧩 Encontré piezas cortadas que no estaban en el inventario</button>
  </div>
  <div class="card">
    <div class="paso">2</div><strong>¿De qué material?</strong>
    <input id="mv-buscar" type="search" placeholder="🔍 Buscar artículo (ej. corredera, blanco)" value="${String(movBuscar).replace(/"/g,'&quot;')}" style="margin-top:10px" oninput="movBuscar=this.value;renderMovLista()">
    <div class="chips" style="margin-top:10px">${catsHtml}</div>
  </div>
  <div class="card">
    <div class="paso">3</div><strong>${info.ic} ${pregunta}</strong>
    ${ayuda?`<p class="hint">${ayuda}</p>`:''}
    ${movCat==='Herrajes'||movBuscar?'<p class="hint">🔩 Correderas: <strong>"Juego"</strong> = hembra + macho juntos. <strong>"Sin pareja"</strong> = una sola pieza (solo hembra o solo macho).</p>':''}
    ${catHoja && movTipo==='merma' ? `<div style="margin-top:8px"><label class="hint">¿Qué se dañó?</label>
      <select id="mv-lado" style="margin-top:4px" onchange="movLado=this.value;renderMov()"><option value="completas" ${movLado==='completas'?'selected':''}>Hojas completas</option><option value="cortado" ${movLado==='cortado'?'selected':''}>Material ya cortado o armado</option></select>
      ${movLado==='cortado'?`<button class="btn" style="margin-top:10px;width:100%;min-height:50px;background:linear-gradient(135deg,#e0791a,#c0620f)" onclick="pzSetModo('merma');irA('pzenc')">✂️ Contar las piezas dañadas (entrepaños, zóclos, paredes…)</button><p class="hint" style="margin:6px 0 0">La app convierte las piezas a hojas. O escribe abajo las hojas directo si ya las sabes.</p>`:''}</div>` : ''}
    <p class="hint">Escribe la cantidad solo en lo que aplique. Lo que dejes vacío no se toca. Puedes cambiar de material o buscar otro artículo: lo que ya escribiste se conserva.</p>
    <div class="movlist" id="mv-lista"></div>
    ${movTipo==='merma'?fotoPickerHtml('merma','Foto de lo dañado (opcional)'):''}
    <input id="mv-nota" placeholder="Nota (opcional)" style="margin-top:12px">
    <button class="btn" id="mv-guardar" style="margin-top:12px;width:100%;min-height:54px;font-size:16px" onclick="registrarMovLote()">Revisar y guardar</button>
  </div>
  <details class="card">
    <summary><strong>Ver lo último que se anotó</strong></summary>
    <div class="wrap-x" style="margin-top:8px"><table><tr><th>Fecha</th><th>Artículo</th><th>Tipo</th><th>Cant.</th><th>Nota</th><th>Estado</th></tr>
    ${movs.filter(m=>m.tipo!=='nota').slice(0,30).map(m=>`<tr><td>${new Date(m.fecha).toLocaleString()}</td><td>${m.itemNombre}</td>
      <td class="${m.tipo==='entrada'||m.tipo==='devolucion'||(m.tipo==='ajuste'&&m.cantidad>0)?'pos':(m.tipo==='corte'?'':'neg')}">${etiquetaTipoMov(m)}</td><td>${m.tipo==='ajuste'&&m.cantidad>0?'+':''}${fmtNum(m.cantidad)} ${item2unidad(m.itemId)}</td><td>${m.nota||''}</td><td>${badgeEstado(m.estado)}</td></tr>`).join('')}
    </table></div>
  </details>`;
  renderMovLista();
}
function renderMovLista(){
  const el = document.getElementById('mv-lista'); if(!el) return;
  const cats = movTipo==='corte' ? ['Melamina','MDF'] : null;
  const items = movBuscar.trim() ? CATALOGO.filter(i=>(!cats||cats.includes(i.cat)) && coincide(i.nombre, movBuscar)).slice(0,40) : CATALOGO.filter(i=>i.cat===movCat);
  el.innerHTML = items.length ? items.map(it=>{ const f=calcFormula(it.id);
    const hay = f.esHoja ? (movTipo==='corte'||movTipo==='salida'||(movTipo==='merma'&&movLado!=='cortado') ? `${fmtNum(f.completas)} completas` : (movTipo==='merma' ? `${fmtNum(f.cortado)} ya cortadas` : `${fmtNum(f.final)} ${it.unidad}`)) : `${fmtNum(f.final)} ${it.unidad}`;
    return `<label class="movitem"><span style="min-width:0"><span class="invname">${it.nombre}</span><span class="hint" style="display:block;margin:2px 0 0">Hay: ${hay}</span></span>
      <input type="number" min="0" inputmode="decimal" id="mv-${it.id}" placeholder="—" value="${movVals[it.id]||''}" oninput="movVals['${it.id}']=this.value;actualizarBotonMov()"></label>`;
  }).join('') : '<p class="hint">No se encontró ningún artículo con ese nombre.</p>';
  actualizarBotonMov();
}
function actualizarBotonMov(){
  const n = Object.keys(movVals).filter(id=>Number(movVals[id])>0).length;
  const b = document.getElementById('mv-guardar'); if(b) b.textContent = n ? `Revisar y guardar (${n} artículo${n>1?'s':''})` : 'Revisar y guardar';
}

// Etiqueta visual para el estado de aprobación de un movimiento/instalación.
function badgeEstado(estado){
  if(estado==='pendiente') return '<span class="tag" style="color:#b3742c;border-color:#b3742c">Pendiente</span>';
  if(estado==='rechazado') return '<span class="tag" style="color:var(--bad);border-color:var(--bad)">Rechazado</span>';
  return '<span class="tag pos" style="border-color:var(--ok)">Aprobado</span>';
}

async function registrarMovLote(){
  const tipo = movTipo;
  const nota = ($('#mv-nota').value||'').trim();
  const ladoEl = document.getElementById('mv-lado');
  const lado = ladoEl ? ladoEl.value : 'completas';
  const items = CATALOGO.filter(i=>Number(movVals[i.id])>0 && (tipo!=='corte' || esHoja(i)));
  const decrece = tipo!=='entrada';
  const mod = modulo();
  const aplicar = [];
  const avisosAuto = [];
  for(const it of items){
    const cantidad = Number(movVals[it.id]);
    if(!cantidad || cantidad<=0) continue;
    const f = calcFormula(it.id);
    const sinStock = (disp, que)=>{ alert('No alcanza: de "'+it.nombre+'" solo hay '+fmtNum(disp)+' ('+que+') y escribiste '+cantidad+'.\n\nRevisa la cantidad. No se guardó nada.'); };
    if(f.esHoja && tipo==='corte'){
      // El corte puede cubrir hojas que ya se tomaron provisionalmente (autoCortes) + las completas.
      if(cantidad > f.completas + f.autoCortes + 1e-9){ sinStock(f.completas + f.autoCortes, 'hojas completas'); return; }
    } else if(f.esHoja && (tipo==='salida' || (tipo==='merma' && lado==='completas'))){
      if(cantidad > f.completas + 1e-9){ sinStock(f.completas, 'hojas completas'); return; }
    } else if(f.esHoja && tipo==='merma' && lado==='cortado'){
      if(cantidad > f.cortado + 1e-9){ sinStock(f.cortado, 'material cortado'); return; }
    } else if(decrece && f.final - cantidad < -1e-9){ sinStock(f.final, 'stock'); return; }
    if(f.esHoja && tipo==='instalacion'){
      const ac = hojasAutoCorteSiInstala(it.id, cantidad);
      if(ac.hojas>0) avisosAuto.push(`${it.nombre}: se tomarán ${ac.hojas} hoja(s) completa(s) provisionalmente`);
    }
    const mv = {itemId:it.id, itemNombre:it.nombre, cantidad};
    if(f.esHoja && tipo==='merma') mv.lado = lado;
    aplicar.push(mv);
  }
  if(aplicar.length===0) return alert('No escribiste ninguna cantidad. Escribe cuánto en el artículo que quieras anotar.');
  const verbo = (TIPO_INFO[tipo]||{}).verbo || tipo;
  const resumen = aplicar.map(a=>`• ${fmtNum(a.cantidad)} ${item2unidad(a.itemId)} de ${a.itemNombre}`).join('\n');
  if(!confirm(`¿Todo está bien?\n\n${verbo}:\n${resumen}${tipo==='merma'&&lado==='cortado'?'\n(material ya cortado)':''}${nota?'\n\nNota: '+nota:''}\n\nToca Aceptar para guardar.`)) return;
  if(avisosAuto.length && !confirm('Todavía no se anota el corte de hoy:\n\n'+avisosAuto.join('\n')+'\n\nNo pasa nada: cuando se registre el corte del día se ajusta solo. ¿Continuar?')) return;
  try{
    // Confirmado por el usuario: el Corte del día NO requiere aprobación (se aplica directo,
    // aunque lo registre un coordinador). Lo demás sigue el flujo normal de aprobación.
    const estado = tipo==='corte' ? 'aprobado' : estadoNuevoMovimiento();
    const loteId = cryptoId();
    const creadoPor = getCurrentUserEmail?getCurrentUserEmail():'';
    for(const a of aplicar){
      const doc = {modulo:mod,itemId:a.itemId,itemNombre:a.itemNombre,tipo,cantidad:a.cantidad,nota,fecha:new Date().toISOString(),estado,loteId,creadoPor};
      if(tipo==='merma' && (fotosTmp.merma||[]).length){ doc.fotos = fotosTmp.merma.length; doc.fotosRef = loteId; }
      if(a.lado) doc.lado = a.lado;
      await db.collection('movimientos').doc(cryptoId()).set(doc);
    }
    toast(estado==='pendiente'
      ? '✅ Guardado. <br><small>Dirección lo tiene que aprobar para que cuente en el inventario.</small>'
      : '✅ Guardado: '+aplicar.length+' artículo(s).');
    if(tipo==='merma') await guardarFotos('merma', 'merma', loteId, mod);
    movVals={}; movBuscar='';
    renderMov();
  }catch(e){ alert('Error: '+e.message); }
}

// ===== Conteo / auditoría paso a paso (confirmado por el usuario) =====
// Se cuenta por secciones en orden. No se puede pasar a la siguiente sección si quedó algún
// artículo sin contar: hay que escribirlo o ponerlo en 0. Piezas cortadas y armados se confirman
// al terminar. En cualquier artículo se puede SUMAR lo que aparezca después (botón ➕).
const AUD_SECCIONES = [
  {k:'Melamina', t:'Melamina', s:'Solo hojas completas'},
  {k:'MDF', t:'MDF', s:'Solo hojas completas'},
  {k:'Cintilla', t:'Cintilla'}, {k:'PVC', t:'PVC'}, {k:'Pegamento', t:'Pegamento'}, {k:'Stickers', t:'Stickers'},
  {k:'Herrajes', t:'Herrajes'},
  {k:'__piezas', t:'Piezas cortadas', s:'Piezas sueltas ya cortadas'},
  {k:'__armados', t:'Armados', s:'Cajoneras, cajones y cuadros armados'},
  {k:'__revisar', t:'Revisar y enviar'}
];
const AUD_ICONO = {Melamina:'🟫', MDF:'🟤', Cintilla:'🎞️', PVC:'📏', Pegamento:'🧴', Stickers:'🏷️', Herrajes:'🔩', __piezas:'✂️', __armados:'📦', __revisar:'✅'};
function itemsSeccionAud(k){ return CATALOGO.filter(i=>i.cat===k); }
// Correderas sueltas contadas en Herrajes (hembra / macho sin su pareja): entran al mismo "pool"
// que las de cajoneras y cajones armados, para formar juegos cuando hay pareja.
const CORR_SUELTA_PIEZA = {'Corredera hembra (sin pareja)':'Corredera hembra', 'Corredera macho (sin pareja)':'Corredera macho',
  'Corredera ext. hembra (sin pareja)':'Corredera hembra (extensión)', 'Corredera ext. macho (sin pareja)':'Corredera macho (extensión)'};
function piezasCorrSueltasAud(){
  return Object.keys(CORR_SUELTA_PIEZA).map(n=>{ const it=itemByName(n); const q=it?Number(auditCapturas[it.id])||0:0; return q>0 ? {nombre:CORR_SUELTA_PIEZA[n], cantidad:q, dim:'—', colorDestino:'—', estado:'ok'} : null; }).filter(Boolean);
}
function faltanSeccionAud(k){ return itemsSeccionAud(k).filter(i=>auditCapturas[i.id]===undefined); }
function esComplementoAud(){ return audTipo==='complemento' && !modoConteoCoord(); }
// Auditoría de un material (confirmado por el usuario): solo se compara lo que se cuenta; lo que no se
// toca se queda como está (no se toma como 0). Sirve para corregir un material sin contar todo.
function esParcialAud(){ return audTipo==='parcial' && !modoConteoCoord(); }
function esLibreAud(){ return esComplementoAud() || esParcialAud(); }
// Complemento del conteo inicial: solo se captura lo que faltó; nada es obligatorio.
function capturadosSeccionAud(k){
  if(k==='__piezas') return contarPiezasSueltas();
  if(k==='__armados') return auditArmados.length;
  if(k==='__revisar') return 0;
  return itemsSeccionAud(k).filter(i=>Number(auditCapturas[i.id])>0).length;
}
function seccionCompletaAud(k){
  if(k==='__revisar') return false;
  if(esLibreAud()) return true;
  if(k==='__piezas' || k==='__armados') return !!audHechas[k];
  return faltanSeccionAud(k).length===0;
}
function primerPasoPendienteAud(){ const i = AUD_SECCIONES.findIndex(x=>!seccionCompletaAud(x.k)); return i<0 ? AUD_SECCIONES.length-1 : i; }
// Se puede ir a cualquier sección (confirmado por el usuario: a veces algo no se puede contar
// todavía y hay que seguir con otra). Lo que quede pendiente se muestra en cada sección y no se
// puede guardar/enviar hasta que todo esté contado o puesto en 0.
function irPasoAud(i){
  if(AUD_SECCIONES[audPaso]) audHechas['v_'+AUD_SECCIONES[audPaso].k] = true;
  audPaso = i; auditCat = AUD_SECCIONES[i].k; renderAud(); window.scrollTo(0,0);
}
function avanzarPasoAud(){
  audHechas['v_'+AUD_SECCIONES[audPaso].k] = true; // sección vista (para marcar lo que quedó pendiente)
  guardarBorradorAud();
  audPaso = Math.min(audPaso+1, AUD_SECCIONES.length-1); auditCat = AUD_SECCIONES[audPaso].k;
  renderAud(); window.scrollTo(0,0);
}
// Ventana con 3 opciones (las alertas del celular solo tienen 2).
function modalAud(titulo, texto, botones){
  let ov = document.getElementById('aud-ov'); if(ov) ov.remove();
  ov = document.createElement('div'); ov.id='aud-ov';
  ov.style.cssText='position:fixed;inset:0;background:rgba(10,12,20,.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
  ov.innerHTML = `<div class="card" style="max-width:440px;width:100%;margin:0;max-height:85vh;overflow:auto"><div style="font-size:16px;font-weight:800">${titulo}</div><div class="hint" style="margin-top:6px">${texto}</div>
    ${botones.map((b,i)=>`<button class="btn" data-i="${i}" style="width:100%;min-height:50px;margin-top:10px;text-align:left;${b.estilo||''}">${b.t}${b.s?`<br><small style="font-weight:400">${b.s}</small>`:''}</button>`).join('')}</div>`;
  document.body.appendChild(ov);
  ov.querySelectorAll('button[data-i]').forEach(btn=>btn.onclick=()=>{ ov.remove(); const f=botones[Number(btn.dataset.i)].fn; if(f) f(); });
}
function siguientePasoAud(){
  const sec = AUD_SECCIONES[audPaso];
  const secundario = 'background:transparent;color:var(--ink);border:1px solid var(--line);box-shadow:none';
  if(esLibreAud()) return avanzarPasoAud();
  if(sec.k==='__piezas' || sec.k==='__armados'){
    if(audHechas[sec.k]) return avanzarPasoAud();
    const n = sec.k==='__piezas' ? contarPiezasSueltas() : auditArmados.length;
    const q = sec.k==='__piezas'
      ? (n ? `¿Ya contaste TODAS las piezas cortadas, de todos los colores? Llevas ${n} tipo(s) de pieza.` : '¿No hay piezas cortadas sueltas en el módulo?')
      : (n ? `¿Ya contaste TODOS los armados? Llevas ${n}.` : '¿No hay cajoneras, cajones ni cuadros armados en el módulo?');
    return modalAud(`${AUD_ICONO[sec.k]} ${sec.t}`, q, [
      {t:'✅ Sí, ya terminé esta sección', fn:()=>{ audHechas[sec.k]=true; avanzarPasoAud(); }},
      {t:'⏭️ Dejarla pendiente y seguir', s:'Regresas después a terminarla', estilo:secundario, fn:avanzarPasoAud},
      {t:'← Regresar a contar', estilo:secundario}
    ]);
  }
  const faltan = faltanSeccionAud(sec.k);
  if(!faltan.length) return avanzarPasoAud();
  modalAud(`Faltan ${faltan.length} en ${sec.t}`, faltan.slice(0,15).map(i=>'• '+i.nombre).join('<br>')+(faltan.length>15?`<br>… y ${faltan.length-15} más`:''), [
    {t:'0️⃣ De esos no hay: ponerlos en 0 y seguir', fn:()=>{ faltan.forEach(i=>{ auditCapturas[i.id]=0; }); avanzarPasoAud(); }},
    {t:'⏭️ Dejarlos pendientes y seguir', s:'Todavía no se pueden contar; regresas después', estilo:secundario, fn:avanzarPasoAud},
    {t:'← Regresar a contarlos', estilo:secundario}
  ]);
}
function pendienteSeccionTxt(k){
  if(k==='__revisar' || esLibreAud()) return '';
  if(k==='__piezas' || k==='__armados') return audHechas[k] ? '' : 'sin confirmar';
  const n = faltanSeccionAud(k).length; return n ? `faltan ${n}` : '';
}
function sumarAud(id){
  const it = CATALOGO.find(i=>i.id===id); if(!it) return;
  const actual = Number(auditCapturas[id])||0;
  const v = prompt(`➕ ¿Cuánto más encontraste de ${it.nombre}?\n\nLlevas ${fmtNum(actual)} ${it.unidad}. Lo que escribas se SUMA.`);
  if(v===null || String(v).trim()==='') return;
  const n = Number(String(v).replace(',','.')); if(!isFinite(n)) return alert('Escribe solo el número.');
  auditCapturas[id] = fmtNum(actual + n); guardarBorradorAud(); renderAud();
  toast(`${it.nombre}: ahora ${fmtNum(actual+n)} ${it.unidad}`);
}
function sumarPiezaAud(grupo, key){
  const p = PIEZAS_AUDIT.find(x=>x.key===key); if(!p) return;
  const actual = ((auditPiezas[grupo]||{})[key])||0;
  const v = prompt(`➕ ¿Cuántas piezas más encontraste de ${p.label}?\n\nLlevas ${actual}. Lo que escribas se SUMA.`);
  if(v===null || String(v).trim()==='') return;
  const n = Number(v); if(!isFinite(n)) return alert('Escribe solo el número.');
  setAuditPieza(grupo, key, String(actual+n)); guardarBorradorAud(); renderAud();
  toast(`${p.label}: ahora ${actual+n}`);
}
function etiquetaTipoAud(t){ return t==='conteo' ? 'Conteo inicial' : (t==='complemento' ? '➕ Complemento del conteo inicial' : (t==='parcial' ? '🎯 Auditoría de un material' : (t==='inicial' ? 'Auditoría inicial' : 'Auditoría'))); }
function renderAud(){
  const ciego = modoConteoCoord();
  if(esCoordinador() && !ciego){ $('#main').innerHTML = '<div class="card">📋 El conteo del almacén solo se abre cuando Dirección lo activa, y solo ese día.</div>'; return; }
  if(esSoloLectura()){ $('#main').innerHTML = '<div class="card">Tu cuenta es de solo lectura.</div>'; return; }
  recuperarBorradorAud();
  if(ciego){ audTipo='conteo'; if(!audAuditor) audAuditor=(getCurrentUserEmail?getCurrentUserEmail():'').split('@')[0]; }
  if(audTipo==='inicial') audTipo='seguimiento';
  // auditCat puede venir de fuera (selectAuditCat); se alinea con el paso.
  const idxCat = AUD_SECCIONES.findIndex(x=>x.k===auditCat);
  if(idxCat>=0) audPaso = idxCat; else { audPaso = Math.min(audPaso, AUD_SECCIONES.length-1); auditCat = AUD_SECCIONES[audPaso].k; }
  const sec = AUD_SECCIONES[audPaso];
  const limite = primerPasoPendienteAud();
  const hechas = AUD_SECCIONES.filter(x=>seccionCompletaAud(x.k)).length;
  const comp = esComplementoAud(), parcial = esParcialAud(), libre = comp || parcial;
  const chips = libre ? AUD_SECCIONES.map((x,i)=>{ const on=i===audPaso, n=capturadosSeccionAud(x.k);
    return `<button class="chip ${on?'on':''}" style="${n&&!on?'border-color:var(--ok);color:var(--ok);':''}" onclick="irPasoAud(${i})">${AUD_ICONO[x.k]||''} ${x.t}${n?` <small>(${n})</small>`:''}</button>`; }).join('')
  : AUD_SECCIONES.map((x,i)=>{ const ok = seccionCompletaAud(x.k), on = i===audPaso; const pend = pendienteSeccionTxt(x.k);
    const empezada = x.k!=='__revisar' && !ok && (audHechas['v_'+x.k] || (!x.k.startsWith('__') && itemsSeccionAud(x.k).some(it=>auditCapturas[it.id]!==undefined)));
    return `<button class="chip ${on?'on':''}" style="${ok&&!on?'border-color:var(--ok);color:var(--ok);':''}${!ok&&empezada&&!on?'border-color:#b3742c;color:#b3742c;':''}" onclick="irPasoAud(${i})">${ok?'✓ ':(empezada?'⏳ ':'')}${AUD_ICONO[x.k]||''} ${x.t}${!ok&&empezada&&pend?` <small>(${pend})</small>`:''}</button>`; }).join('');

  let cuerpo;
  if(sec.k==='__piezas'){
    cuerpo = renderAudPiezasHtml();
  } else if(sec.k==='__armados'){
    cuerpo = renderAudArmadosHtml();
  } else if(sec.k==='__revisar' && parcial){
    const eqP = piezasAuditAHojas(); const lin = [];
    CATALOGO.forEach(it=>{ if(auditCapturas[it.id]===undefined) return; const f=calcFormula(it.id); const v=(Number(auditCapturas[it.id])||0)+(Number(eqP[it.id])||0);
      lin.push(`${it.nombre}: contado <strong>${fmtNum(f.esHoja && !eqP[it.id] ? (Number(auditCapturas[it.id])||0) : v)}</strong>${f.esHoja?(eqP[it.id]?' (completas + piezas)':' hojas completas (el cortado no se toca)'):' '+(it.unidad||'')}`); });
    cuerpo = `<div class="card"><h3>✅ Revisar auditoría de un material</h3>
      <p class="hint">Solo se compara lo que <strong>escribiste</strong>; todo lo demás se queda como está (otros colores, herrajes, etc.). En melamina/MDF escribe las hojas completas de ese color (aunque sea <strong>0</strong>) y, si quieres corregir también el cortado, cuenta sus piezas en ✂️ Piezas cortadas. Si no cuentas piezas de ese color, solo se corrigen las <strong>hojas completas</strong>.</p>
      ${lin.length?`<div class="movlist" style="margin-top:8px">${lin.map(x=>`<div class="movitem"><span>${x}</span></div>`).join('')}</div>`:'<p class="neg">Todavía no capturas nada. Ve a la sección del material y escribe lo que contaste.</p>'}
      <button class="btn" style="width:100%;min-height:54px;font-size:16px;margin-top:10px" ${lin.length?'':'disabled'} onclick="saveAudit()">Guardar auditoría</button>
    </div>`;
  } else if(sec.k==='__revisar' && comp){
    const lin = [];
    CATALOGO.forEach(it=>{ const v=Number(auditCapturas[it.id])||0; if(v>0) lin.push(`${it.nombre}: <strong>${fmtNum(v)}</strong> ${it.unidad||''}`); });
    const np = contarPiezasSueltas(), na = auditArmados.length;
    if(np) lin.push(`✂️ ${np} tipo(s) de pieza cortada`);
    if(na) lin.push(`📦 ${na} armado(s): ${auditArmados.slice(0,6).map(a=>a.cantidad+' × '+describirArmado(a)).join(', ')}${na>6?'…':''}`);
    cuerpo = `<div class="card"><h3>✅ Revisar complemento</h3>
      <p class="hint">Esto se va a <strong>SUMAR</strong> al stock inicial de ${modulo()}. Lo que ya estaba contado no se toca.</p>
      ${lin.length?`<div class="movlist" style="margin-top:8px">${lin.map(x=>`<div class="movitem"><span>${x}</span></div>`).join('')}</div>`:'<p class="neg">Todavía no capturas nada. Ve a la sección donde está lo que te faltó y escribe la cantidad.</p>'}
      <button class="btn" style="width:100%;min-height:54px;font-size:16px;margin-top:10px" ${lin.length?'':'disabled'} onclick="saveAudit()">Guardar complemento</button>
    </div>`;
  } else if(sec.k==='__revisar'){
    const filas = AUD_SECCIONES.filter(x=>x.k!=='__revisar').map(x=>{
      let det;
      if(x.k==='__piezas') det = `${contarPiezasSueltas()} tipo(s) de pieza`;
      else if(x.k==='__armados') det = `${auditArmados.length} armado(s)`;
      else { const its=itemsSeccionAud(x.k); const conAlgo=its.filter(i=>Number(auditCapturas[i.id])>0).length; det = `${its.length-faltanSeccionAud(x.k).length} de ${its.length} contados · ${conAlgo} con existencia`; }
      const ok = seccionCompletaAud(x.k); const idx = AUD_SECCIONES.findIndex(z=>z.k===x.k);
      let falta = '';
      if(!ok){ if(x.k.startsWith('__')) falta = 'Falta confirmar que ya se contó todo.';
        else { const f=faltanSeccionAud(x.k); falta = `Faltan: ${f.slice(0,6).map(i=>i.nombre).join(', ')}${f.length>6?' y '+(f.length-6)+' más':''}`; } }
      return `<div class="movitem" style="flex-wrap:wrap;gap:6px"><span style="min-width:0;flex:1 1 60%"><span class="invname">${ok?'✅':'⏳'} ${AUD_ICONO[x.k]||''} ${x.t}</span><span class="hint" style="display:block;margin:2px 0 0">${det}</span>${falta?`<span class="hint" style="display:block;margin:2px 0 0;color:#b3742c">${falta}</span>`:''}</span>${ok?'':`<button class="btn small" onclick="irPasoAud(${idx})">Ir a contar</button>`}</div>`; }).join('');
    const listo = primerPasoPendienteAud()===AUD_SECCIONES.length-1;
    cuerpo = `<div class="card"><h3>✅ Revisar y enviar</h3>
      <div class="movlist" style="margin-top:8px">${filas}</div>
      ${listo?'<p class="hint" style="margin-top:8px">Todo está contado. Si encontraste algo más, regresa a su sección y usa ➕ para sumarlo.</p>':'<p class="neg" style="margin-top:8px">Todavía hay secciones pendientes. Termínalas para poder guardar; si de verdad no hay de lo que falta, entra a la sección y ponlo en 0.</p>'}
      <button class="btn" style="width:100%;min-height:54px;font-size:16px;margin-top:10px" ${listo?'':'disabled'} onclick="saveAudit()">${ciego?'📤 Enviar conteo a Dirección':(audTipo==='conteo'?'Guardar conteo inicial':'Guardar auditoría')}</button>
    </div>
    ${resumenCardHtml()}`;
  } else {
    const items = itemsSeccionAud(sec.k);
    const eq = piezasAuditAHojas();
    const sinTeo = ciego || (audOcultarTeo && audTipo!=='conteo');
    const catHoja = items.length>0 && esHoja(items[0]);
    const faltan = faltanSeccionAud(sec.k).length;
    cuerpo = `<div class="card">
    <h3>${AUD_ICONO[sec.k]||''} ${sec.t}</h3>
    ${catHoja?'<p class="hint">Aquí captura solo las <strong>hojas completas</strong>. Lo cortado o armado va más adelante en ✂️ Piezas cortadas y 📦 Armados.</p>':''}
    ${sec.k==='Herrajes'?'<p class="hint">🔩 <strong>Correderas:</strong> en "Juego de corredera" van los juegos completos (hembra + macho juntos). Las <strong>hembras y machos sueltos</strong> van en sus renglones "(sin pareja)", normal o de extensión. La app los junta con los de cajoneras y cajones armados y forma juegos donde hay pareja.</p>':''}
    <p class="hint">Escribe cuánto hay de cada uno; si no hay, pon <strong>0</strong>. Si después aparece más, toca <strong>➕</strong> y se suma a lo que ya llevas.</p>
    ${comp?'<p class="hint" style="font-weight:700;color:var(--brand)">➕ Escribe SOLO lo que te faltó contar. Lo demás déjalo vacío.</p>':`<p class="hint" style="font-weight:700;${faltan?'color:#b3742c':'color:var(--ok)'}" id="aud-faltan">${faltan?`Faltan ${faltan} de ${items.length} por contar`:'✓ Todo contado en esta sección'}</p>`}
    <div class="wrap-x"><table><tr><th>Artículo</th>${sinTeo?'':'<th>Teórico</th>'}<th>${catHoja?'Hojas completas':'Contado'}</th></tr>
      ${items.map(it=>{ const f=calcFormula(it.id); const v=auditCapturas[it.id];
        const extra = eq[it.id] ? `<div class="hint" style="margin-top:3px">+ ${fmtNum(eq[it.id])} ${it.unidad||''} en piezas/armados</div>` : '';
        return `<tr style="${v===undefined&&!comp?'background:rgba(224,121,26,.08)':''}"><td>${it.nombre}<div class="tag">${it.unidad}</div></td>${sinTeo?'':`<td>${fmtNum(f.final)}${f.esHoja?`<div class="hint" style="margin-top:2px">${fmtNum(f.completas)} compl. · ${fmtNum(f.cortado)} cort.</div>`:''}</td>`}
          <td><div class="row" style="gap:6px;flex-wrap:nowrap"><input type="number" min="0" inputmode="decimal" style="min-width:70px" placeholder="—" value="${v??''}" oninput="auditCapturas['${it.id}']=this.value===''?undefined:Number(this.value);actualizarFaltanAud()">
          <button class="btn small" style="padding:6px 10px;background:transparent;color:var(--brand);border:1px solid var(--line);box-shadow:none" title="Sumar" onclick="sumarAud('${it.id}')">➕</button></div>${extra}</td></tr>`;
      }).join('')}
    </table></div>
  </div>`;
  }

  $('#main').innerHTML = `
  ${esAdmin() ? conteoAdminCardHtml() : ''}
  ${ciego ? `<div class="card" style="border:2px solid var(--bad)"><div style="font-size:17px;font-weight:800">📋 Conteo del almacén · ${modulo()}</div>
    <p class="hint">Cuenta <strong>todo</strong> lo que hay en el módulo, también lo del taller, en cajas o en esquinas. Ve sección por sección; la app no te deja avanzar si algo quedó sin contar.</p></div>` : ''}
  <div class="card">
    <strong>${ciego?'Conteo paso a paso':etiquetaTipoAud(audTipo)+' · '+modulo()}</strong>
    <div class="grid2" style="margin-top:8px">
      <select id="aud-tipo" onchange="audTipo=this.value;renderAud()" ${ciego?'style="display:none"':''}><option value="conteo" ${audTipo==='conteo'?'selected':''}>Conteo inicial (arranque desde cero)</option><option value="complemento" ${audTipo==='complemento'?'selected':''}>➕ Complemento del conteo inicial (lo que faltó)</option><option value="seguimiento" ${audTipo==='seguimiento'?'selected':''}>Auditoría</option><option value="parcial" ${audTipo==='parcial'?'selected':''}>🎯 Auditoría de un material (solo lo que cuentes)</option></select>
      <input id="aud-auditor" placeholder="Nombre de quien cuenta" value="${String(audAuditor).replace(/"/g,'&quot;')}" oninput="audAuditor=this.value">
    </div>
    ${ciego||audTipo==='conteo'?'':`<button class="btn small" style="margin-top:8px;width:100%;${audOcultarTeo?'background:linear-gradient(135deg,#6b4bd6,#5338b8)':'background:transparent;color:var(--ink);border:1px solid var(--line);box-shadow:none'}" onclick="audOcultarTeo=!audOcultarTeo;guardarBorradorAud();renderAud()">${audOcultarTeo?'🙈 Contando a ciegas · toca para ver el teórico':'👁️ Viendo el teórico · toca para contar a ciegas'}</button>`}
    ${ciego?'':`<p class="hint" style="margin-top:6px">${parcial?'<strong>Auditoría de un material:</strong> cuenta solo lo que quieres corregir (por ejemplo, la Melamina Blanco). Se compara contra lo que dice la app y, al aplicarla, solo eso se corrige; lo que no cuentes se queda igual.':comp?'<strong>Complemento:</strong> para lo que no se pudo contar en el conteo inicial. Solo capturas eso y, al guardarlo, se <strong>SUMA</strong> al stock inicial sin tocar lo que ya estaba contado.':audTipo==='conteo'?'<strong>Conteo inicial:</strong> lo contado se vuelve el stock inicial del módulo (no se compara ni genera faltantes).':'<strong>Auditoría:</strong> se compara contra lo que dice la app; al aplicarla se corrige el inventario y lo que faltó queda como deuda.'}</p>`}
    ${libre?'':`<div style="margin-top:10px;height:8px;border-radius:6px;background:var(--line);overflow:hidden"><div style="height:100%;width:${Math.round(hechas/(AUD_SECCIONES.length-1)*100)}%;background:var(--ok)"></div></div>`}
    <p class="hint" style="margin:4px 0 0;${libre?'display:none':''}">Paso ${audPaso+1} de ${AUD_SECCIONES.length}: <strong>${sec.t}</strong> · ${hechas} de ${AUD_SECCIONES.length-1} secciones listas. Puedes pasar a cualquier sección; lo pendiente se marca con ⏳.</p>
    <div class="chips" style="margin-top:8px">${chips}</div>
  </div>
  ${cuerpo}
  <div class="card row" style="justify-content:space-between;gap:8px">
    <button class="btn small" style="background:transparent;color:var(--ink);border:1px solid var(--line);box-shadow:none" ${audPaso===0?'disabled':''} onclick="irPasoAud(${Math.max(0,audPaso-1)})">← Anterior</button>
    <span class="hint" id="aud-contador" style="margin:0;text-align:center;flex:1">${textoContadorAudit()}</span>
    ${sec.k==='__revisar'?'':`<button class="btn" onclick="siguientePasoAud()">Siguiente →</button>`}
  </div>`;
}
function actualizarFaltanAud(){
  const sec = AUD_SECCIONES[audPaso]; const el = document.getElementById('aud-faltan'); if(!el || !sec) return;
  const n = faltanSeccionAud(sec.k).length, tot = itemsSeccionAud(sec.k).length;
  el.textContent = n ? `Faltan ${n} de ${tot} por contar` : '✓ Todo contado en esta sección';
  el.style.color = n ? '#b3742c' : 'var(--ok)';
  const c = document.getElementById('aud-contador'); if(c) c.textContent = textoContadorAudit();
}
function selectAuditCat(c){ auditCat=c; renderAud(); }
// Borrador del conteo/auditoría: se guarda en el teléfono cada pocos segundos, para no perder lo
// contado si se cierra la app, se acaba la pila o llega una actualización.
function claveBorradorAud(){ return 'borradorAud_'+modulo(); }
function guardarBorradorAud(){
  try{
    const hay = Object.keys(auditCapturas).some(k=>auditCapturas[k]!==undefined) || contarPiezasSueltas() || auditArmados.length;
    if(hay) localStorage.setItem(claveBorradorAud(), JSON.stringify({auditCapturas, auditPiezas, auditArmados, audAuditor, audPaso, audHechas, audTipo, audOcultarTeo, fecha:new Date().toISOString()}));
    else localStorage.removeItem(claveBorradorAud());
  }catch(e){}
}
function borrarBorradorAud(){ try{ localStorage.removeItem(claveBorradorAud()); }catch(e){} }
let _borradorRevisado = {};
function recuperarBorradorAud(){
  try{
    // Solo se recupera UNA vez al abrir el conteo (no cada vez que se redibuja la pantalla); si no,
    // al quitar lo último capturado regresaba el borrador y no se podía dejar en blanco.
    if(_borradorRevisado[modulo()]) return; _borradorRevisado[modulo()] = true;
    const raw = localStorage.getItem(claveBorradorAud()); if(!raw) return;
    const hayAhora = Object.keys(auditCapturas).some(k=>auditCapturas[k]!==undefined) || contarPiezasSueltas() || auditArmados.length;
    if(hayAhora) return;
    const b = JSON.parse(raw);
    auditCapturas = b.auditCapturas||{}; auditPiezas = b.auditPiezas||{}; auditArmados = b.auditArmados||[]; if(b.audAuditor) audAuditor = b.audAuditor;
    audHechas = b.audHechas||{}; if(typeof b.audPaso==='number'){ audPaso = b.audPaso; auditCat = (AUD_SECCIONES[audPaso]||{}).k; } if(b.audTipo && !modoConteoCoord()) audTipo = b.audTipo; if(typeof b.audOcultarTeo==='boolean') audOcultarTeo = b.audOcultarTeo;
    toast('↩️ Se recuperó lo que ya habías contado.');
  }catch(e){}
}
setInterval(()=>{ if(current==='aud') guardarBorradorAud(); }, 4000);

// ----- Piezas cortadas (auditoría) -----
function contarPiezasSueltas(){
  return Object.values(auditPiezas).reduce((s,g)=>s+Object.values(g).filter(v=>v>0).length,0);
}
function textoContadorAudit(){
  const art = Object.keys(auditCapturas).filter(k=>auditCapturas[k]!==undefined).length;
  return `${art} artículo(s), ${contarPiezasSueltas()} tipo(s) de pieza y ${auditArmados.length} armado(s) capturados.`;
}
// Convierte piezas sueltas + armados a su equivalente en artículos del catálogo
// (hojas de melamina/MDF y herrajes): {itemId: cantidad}. Todo se junta por color antes de
// convertir, para que paredes y entrepaños se combinen igual que en el despiece (3+3 por hoja).
function piezasAuditAHojas(){
  const pool = [];
  Object.keys(auditPiezas).forEach(grupo=>{
    const counts = auditPiezas[grupo]||{};
    PIEZAS_AUDIT.filter(p=>counts[p.key]>0)
      .forEach(p=>pool.push({nombre:p.nombre, cantidad:counts[p.key], dim:p.dim, colorDestino:grupo, estado:'ok'}));
  });
  auditArmados.forEach(a=>piezasDeArmado(a).forEach(p=>pool.push(p)));
  piezasCorrSueltasAud().forEach(p=>pool.push(p));
  const porColor = {};
  pool.forEach(p=>{ (porColor[p.colorDestino] = porColor[p.colorDestino]||[]).push(p); });
  const out = {};
  Object.keys(porColor).forEach(c=>{
    piezasAConsumo(porColor[c], c).forEach(r=>{ out[r.itemId]=(out[r.itemId]||0)+r.cantidad; });
  });
  // Correderas: solo cuentan los JUEGOS COMPLETOS (hembra + macho)
  balanceCorrederas(pool).forEach(b=>{
    if(b.pares>0){ const it=itemByName(b.item); if(it) out[it.id]=(out[it.id]||0)+b.pares; }
    // Las medias que no tienen pareja se guardan en su propio artículo "(sin pareja)"
    const t = CORR_TIPOS.find(x=>x.juego===b.item);
    if(t && b.hembrasSinPareja>0){ const it=itemByName(t.hembra); out[it.id]=(out[it.id]||0)+b.hembrasSinPareja; }
    if(t && b.machosSinPareja>0){ const it=itemByName(t.macho); out[it.id]=(out[it.id]||0)+b.machosSinPareja; }
  });
  return out;
}
// Junta hembras (de cajoneras) y machos (de cajones) en parejas. Devuelve por tipo de corredera:
// {item, etiqueta, hembras, machos, pares, hembrasSinPareja, machosSinPareja}
function balanceCorrederas(pool){
  if(!pool){ pool=[]; auditArmados.forEach(a=>piezasDeArmado(a).forEach(p=>pool.push(p))); piezasCorrSueltasAud().forEach(p=>pool.push(p)); }
  return [['', 'Juego de corredera', 'Corredera normal'], [' (extensión)', 'Correderas de extensión', 'Corredera de extensión']].map(([suf,item,etiqueta])=>{
    const h = pool.filter(p=>p.nombre==='Corredera hembra'+suf).reduce((s,p)=>s+(Number(p.cantidad)||0),0);
    const m = pool.filter(p=>p.nombre==='Corredera macho'+suf).reduce((s,p)=>s+(Number(p.cantidad)||0),0);
    const pares = Math.min(h,m);
    const it = itemByName(item);
    const juegosSueltos = it && auditCapturas[it.id]!==undefined ? Number(auditCapturas[it.id])||0 : 0; // juegos completos contados en Herrajes
    return {item, etiqueta, hembras:h, machos:m, pares, juegosSueltos, totalJuegos: pares+juegosSueltos, hembrasSinPareja:h-pares, machosSinPareja:m-pares};
  }).filter(b=>b.hembras||b.machos||b.juegosSueltos);
}
function avisoCorrederasHtml(){
  const bs = balanceCorrederas();
  if(!bs.length) return '';
  return bs.map(b=>`<div class="${b.hembrasSinPareja||b.machosSinPareja?'warn':'hint'}" style="margin-top:8px">
    <strong>${b.etiqueta}:</strong> ${fmtNum(b.hembras)} hembra(s) + ${fmtNum(b.machos)} macho(s) = <strong>${fmtNum(b.pares)} juego(s) armados</strong>${b.juegosSueltos?` + ${fmtNum(b.juegosSueltos)} juego(s) sueltos contados en Herrajes`:''} → <strong>total ${fmtNum(b.totalJuegos)} juego(s)</strong>
    ${b.hembrasSinPareja?`<br>⚠️ ${fmtNum(b.hembrasSinPareja)} hembra(s) sin su macho → se guardan como "hembra sin pareja".`:''}
    ${b.machosSinPareja?`<br>⚠️ ${fmtNum(b.machosSinPareja)} macho(s) sin su hembra → se guardan como "macho sin pareja".`:''}
  </div>`).join('');
}
function resumenPiezasHtml(){
  const eq = piezasAuditAHojas();
  const ids = Object.keys(eq);
  const avisoCorr = avisoCorrederasHtml();
  if(!ids.length && !avisoCorr) return '<p class="hint">Todavía no has capturado piezas ni armados.</p>';
  return (ids.length?`<table><tr><th>Artículo</th><th>Equivale a</th></tr>${ids.map(id=>{
    const it = CATALOGO.find(i=>i.id===id);
    return `<tr><td>${it?it.nombre:id}</td><td><strong>${fmtNum(eq[id])}</strong> ${it&&it.unidad?it.unidad:''}</td></tr>`;
  }).join('')}</table>`:'') + avisoCorr;
}
function resumenCardHtml(){
  return `<div class="card">
    <h3>Equivalencia total (piezas cortadas + armados)</h3>
    <div id="aud-piezas-resumen" class="wrap-x">${resumenPiezasHtml()}</div>
    <p class="hint">Esto se suma a lo que captures en cada categoría (hojas completas, herrajes sueltos). Si no capturas nada en esa categoría, se toma como 0.</p>
    <button class="btn small" style="margin-top:6px;background:transparent;color:var(--bad);border:1px solid var(--line);box-shadow:none" onclick="vaciarConteoAud()">🗑️ Empezar el conteo en blanco</button>
  </div>`;
}

// ----- Armados (auditoría) -----
function renderAudArmadosHtml(){
  const f = auditArmadoForm;
  const esCajonera = f.tipo==='cajonera';
  const esCorr = f.tipo==='corredera';
  const esEsp = ARMADO_ES_ESPEJO(f.tipo);
  const variantes = esCajonera ? ARMADO_CAJONERAS : (esCorr ? ARMADO_CORREDERA : (ARMADO_SIN_VARIANTE(f.tipo) ? {normal:'Normal'} : {normal:'Normal', max:'Max'}));
  if(!variantes[f.variante]) f.variante = Object.keys(variantes)[0];
  const colorOpts = sel => MEL_COLORES.map(c=>`<option value="${c}" ${c===sel?'selected':''}>${c}</option>`).join('');
  const labelColor = (esCajonera||f.tipo==='cajonera_espejo') ? 'Color de la cajonera' : ((f.tipo==='cajon'||f.tipo==='puerta_espejo') ? 'Color del frente' : (f.tipo==='puerta_zapatera' ? 'Color de la puerta' : 'Color del cuadro'));
  const usaCorredera = armadoUsaCorredera(f);
  const puedePuertitas = esCajonera && armadoTienePuertitas(f.variante);
  const set = (campo, rerender=true) => `auditArmadoForm.${campo}=this.${campo==='ext'||campo==='puertitas'||campo==='sinFondo'||campo==='sinHerrajes'?'checked':'value'};${rerender?'renderAud()':''}`;
  const preview = Number(f.cantidad)>0 ? describirArmado(f) : '';
  return `<div class="card">
    <h3>📦 Armados</h3>
    <p class="hint">Cajoneras armadas sin cajones, cajones completos, cuadros de cajón, cajoneras de espejo, puertas de espejo y puertas de zapatera (las correderas sueltas se cuentan en 🔩 Herrajes). Las cajoneras traen la corredera <strong>hembra</strong> y los cajones la <strong>macho</strong>: solo se cuenta un juego cuando hay pareja.</p>
    <label class="hint">¿Qué encontraste?</label>
    <select style="margin-top:4px" onchange="${set('tipo')}">${Object.keys(ARMADO_TIPOS).map(k=>`<option value="${k}" ${k===f.tipo?'selected':''}>${ARMADO_TIPOS[k]}</option>`).join('')}</select>
    ${(()=>{ const fa=familiaArmado(f); return `<div style="margin-top:6px;padding:6px 10px;border-left:5px solid ${fa.c};border-radius:8px;color:${fa.c};font-weight:700">${fa.ic} ${fa.t}</div>`; })()}
    <div class="grid2" style="margin-top:10px">
      ${ARMADO_SIN_VARIANTE(f.tipo)?'':`<div><label class="hint">Tipo</label><select style="margin-top:4px" onchange="${set('variante')}">${Object.keys(variantes).map(k=>`<option value="${k}" ${k===f.variante?'selected':''}>${variantes[k]}</option>`).join('')}</select></div>`}
      ${esCorr?'':`<div><label class="hint">${labelColor}</label><select style="margin-top:4px" onchange="${set('color')}">${colorOpts(f.color)}</select></div>`}
      ${(esCajonera||f.tipo==='cajonera_espejo')?`<div><label class="hint">Color de ${f.tipo==='cajonera_espejo'?'los zóclos':'frentes y zóclos'}</label><select style="margin-top:4px" onchange="${set('colorFrente')}">${colorOpts(f.colorFrente||f.color)}</select></div>`:''}
      ${f.tipo==='cajon'?`<div><label class="hint">Color del cuadro</label><select style="margin-top:4px" onchange="${set('colorCuadro')}">${colorOpts(f.colorCuadro)}</select></div>`:''}
      <div><label class="hint">Cantidad</label><input type="number" min="0" inputmode="numeric" style="margin-top:4px" value="${f.cantidad}" oninput="auditArmadoForm.cantidad=this.value"></div>
    </div>
    ${(esCajonera||f.tipo==='cajon')?`<label class="row" style="margin-top:10px;gap:8px;font-size:14px"><input type="checkbox" style="width:auto;min-height:0" ${f.sinHerrajes?'checked':''} onchange="${set('sinHerrajes')}"> Sin herrajes (sin correderas${f.tipo==='cajon'?' ni jaladera':', bisagras ni jaladeras'})</label>`:''}
    ${f.tipo==='puerta_zapatera'?`<p class="hint" style="margin-top:10px">Puerta de 172×30 (0.25 hojas). Marca los herrajes que trae puestos.</p>
      <label class="row" style="margin-top:6px;gap:8px;font-size:14px"><input type="checkbox" style="width:auto;min-height:0" ${f.peBisagras!==false?'checked':''} onchange="auditArmadoForm.peBisagras=this.checked;renderAud()"> Con bisagras (1.5)</label>
      <label class="row" style="margin-top:6px;gap:8px;font-size:14px"><input type="checkbox" style="width:auto;min-height:0" ${f.peJaladera!==false?'checked':''} onchange="auditArmadoForm.peJaladera=this.checked;renderAud()"> Con jaladera (1)</label>`:''}
    ${f.tipo==='puerta_espejo'?`<p class="hint" style="margin-top:10px">La puerta lleva 2 marcos de ${f.variante==='max'?'13×160':'10×160'} y 2 de 10×35 (los zóclos van con la cajonera de espejo).</p>
      <label class="row" style="margin-top:6px;gap:8px;font-size:14px"><input type="checkbox" style="width:auto;min-height:0" ${f.peBisagras!==false?'checked':''} onchange="auditArmadoForm.peBisagras=this.checked;renderAud()"> Con bisagras (1.5)</label>
      <label class="row" style="margin-top:6px;gap:8px;font-size:14px"><input type="checkbox" style="width:auto;min-height:0" ${f.peJaladera!==false?'checked':''} onchange="auditArmadoForm.peJaladera=this.checked;renderAud()"> Con jaladera (1)</label>
      <label class="row" style="margin-top:6px;gap:8px;font-size:14px"><input type="checkbox" style="width:auto;min-height:0" ${f.sinEspejo?'checked':''} onchange="auditArmadoForm.sinEspejo=this.checked;renderAud()"> Sin espejo (solo los marcos)</label>`:''}
    ${usaCorredera && !((esCajonera||f.tipo==='cajon') && f.sinHerrajes)?`<label class="row" style="margin-top:10px;gap:8px;font-size:14px"><input type="checkbox" style="width:auto;min-height:0" ${f.ext?'checked':''} onchange="${set('ext')}"> ${esCorr?'Es corredera de extensión':'Lleva corredera de extensión (si no, corredera normal)'}</label>`:''}
    ${f.variante==='max' && f.tipo!=='cuadro_fondo' && f.tipo!=='cuadro_sin'?`<p class="hint">Max: siempre lleva corredera de extensión${f.tipo==='cajon'?' y no lleva jaladera':''}.</p>`:''}
    ${puedePuertitas?(()=>{ const jal = f.variante==='max'?'push':'jaladeras'; const val = !f.puertitas ? 'no' : (f.puertitasSinJal ? 'sinjal' : 'si');
      return `<div style="margin-top:10px"><label class="hint">¿Trae sus puertitas puestas?</label>
      <select style="margin-top:4px" onchange="auditArmadoForm.puertitas=this.value!=='no';auditArmadoForm.puertitasSinJal=this.value==='sinjal';renderAud()">
        <option value="no" ${val==='no'?'selected':''}>No trae puertitas</option>
        <option value="si" ${val==='si'?'selected':''}>Sí, ${f.sinHerrajes?'puertitas':'con bisagras y '+jal}</option>
        ${f.sinHerrajes?'':`<option value="sinjal" ${val==='sinjal'?'selected':''}>Sí, con bisagras pero SIN ${jal}</option>`}
      </select></div>`; })():''}
    ${(esCajonera||f.tipo==='cajonera_espejo')?`<label class="row" style="margin-top:10px;gap:8px;font-size:14px"><input type="checkbox" style="width:auto;min-height:0" ${f.sinFondo?'checked':''} onchange="${set('sinFondo')}"> Sin fondo (todavía no le ponen el fondo de MDF)</label>`:''}
    ${f.tipo==='cajonera_espejo'?(f.variante==='max'?'<p class="hint">Max: 2 paredes de 40×185, 5 entrepaños de 40×58, su fondo y los zóclos de 16×58 y 18×58. La puerta se cuenta aparte.</p>':'<p class="hint">Lleva 2 paredes, 5 entrepaños, su fondo y los zóclos de espejo (16×52 y 18×52). La puerta de espejo se cuenta aparte como "Puerta de espejo".</p>'):''}
    ${esCajonera && !armadoTienePuertitas(f.variante)?`<p class="hint">La cajonera ${ARMADO_CAJONERAS[f.variante].toLowerCase()} todavía no tiene medida de puertita confirmada.</p>`:''}
    <button class="btn" style="margin-top:12px;width:100%" onclick="agregarArmado()">Agregar</button>
  </div>
  <div class="card">
    <h3>Armados capturados (${auditArmados.length})</h3>
    ${auditArmados.length? `<div class="wrap-x"><table><tr><th>Descripción</th><th>Cant.</th><th></th></tr>
      ${auditArmados.map((a,i)=>{ const f=familiaArmado(a); return `<tr style="box-shadow:inset 5px 0 0 ${f.c}"><td style="padding-left:12px"><span style="color:${f.c};font-weight:700">${f.ic} ${describirArmado(a)}</span></td><td><strong>${a.cantidad}</strong></td><td><button class="btn small" style="background:transparent;color:var(--bad);border:1px solid var(--line);box-shadow:none" onclick="quitarArmado(${i})">Quitar</button></td></tr>`; }).join('')}
    </table></div>` : '<p class="hint">Todavía no has agregado armados.</p>'}
  </div>
  ${resumenCardHtml()}`;
}
function agregarArmado(){
  const f = auditArmadoForm;
  const n = Number(f.cantidad);
  if(!n || n<=0) return alert('Captura la cantidad.');
  const a = {tipo:f.tipo, variante:f.variante, color:f.color, cantidad:n};
  if(f.tipo==='cajon') a.colorCuadro = f.colorCuadro;
  const sinH = (f.tipo==='cajonera'||f.tipo==='cajon') && !!f.sinHerrajes;
  if(f.tipo==='puerta_zapatera'){ if(f.peBisagras===false) a.sinBisagras = true; if(f.peJaladera===false) a.sinJaladera = true; }
  if(f.tipo==='puerta_espejo'){ if(f.sinEspejo) a.sinEspejo = true; if(f.peBisagras===false) a.sinBisagras = true; if(f.peJaladera===false) a.sinJaladera = true; }
  if(f.tipo==='cajonera_espejo'){ if(f.sinFondo) a.sinFondo = true; if(f.colorFrente && f.colorFrente!==f.color) a.colorFrente = f.colorFrente; }
  if(armadoUsaCorredera(f) && !sinH) a.ext = !!f.ext;
  if(sinH) a.sinHerrajes = true;
  if(f.tipo==='cajonera' && armadoTienePuertitas(f.variante)){ a.puertitas = !!f.puertitas; if(a.puertitas && f.puertitasSinJal && !sinH) a.puertitasSinJal = true; }
  if(f.tipo==='cajonera' && f.sinFondo) a.sinFondo = true;
  if(f.tipo==='cajonera' && f.colorFrente && f.colorFrente!==f.color) a.colorFrente = f.colorFrente;
  // Si ya habías capturado el mismo armado, se SUMA a esa línea (no se repite).
  const clave = x => JSON.stringify(Object.assign({}, x, {cantidad:0}));
  const igual = auditArmados.find(x=>clave(x)===clave(a));
  if(igual){ igual.cantidad = Number(igual.cantidad) + n; toast(`Sumado: ahora ${igual.cantidad} de ese armado.`); }
  else auditArmados.push(a);
  guardarBorradorAud();
  f.cantidad = '';
  renderAud();
}
function quitarArmado(i){ auditArmados.splice(i,1); guardarBorradorAud(); renderAud(); }
function vaciarConteoAud(){
  if(!confirm('¿Borrar TODO lo que llevas capturado en este conteo?\n\n(Hojas, herrajes, piezas cortadas y armados. No se toca el inventario.)')) return;
  auditCapturas={}; auditPiezas={}; auditArmados=[]; audHechas={}; audPaso=0; auditCat='Melamina'; borrarBorradorAud(); renderAud(); toast('Conteo en blanco.');
}
// ===== Lista de piezas para contar (confirmado por el usuario): agrupada por familia, con color por
// familia (dibujo, nombre y franja), dibujo de la forma de la pieza, buscador, ✓ en lo contado y
// botones +1 / +5. La usan el conteo de la auditoría y "Piezas encontradas".
const FAMILIAS_PIEZA = [
  {k:'est', t:'Estructura', ic:'🧱', c:'#5b8def', keys:['maletero','pared','entrepano','cargador','zoclo']},
  {k:'caj', t:'Cajones', ic:'🗄️', c:'#e3b341', keys:['frente','pgrande','pchica','fondocajon','fondocajonera']},
  {k:'max', t:'MAX', ic:'⭐', c:'#b07cf2', keys:['paredmax','entmaxlargo','entmaxcorto','respaldomax','frentemax','puertitamax','pgrandemax','pchicamax','zoclomax','espzoclo18max','espzoclo16max','espmarco160max','fondomax']},
  {k:'zap', t:'Zapatera', ic:'👟', c:'#3fbf74', keys:['puertazap','entzap','zoclozap12','zoclozap']},
  {k:'esp', t:'Espejo', ic:'🪞', c:'#35c2d0', keys:['espmarco160','espzoclo18','espzoclo16','espmarco35']},
  {k:'pta', t:'Puertitas', ic:'🚪', c:'#f08a3c', keys:['puertita5','puertita3']}
];
// Color de un armado según su familia (mismos colores que las piezas).
function familiaArmado(a){
  const F = k => FAMILIAS_PIEZA.find(f=>f.k===k);
  if(a.variante==='max') return F('max');
  if(a.tipo==='cajonera_espejo' || a.tipo==='puerta_espejo') return F('esp');
  if(a.tipo==='puerta_zapatera') return F('zap');
  return F('caj');
}
function familiaDePieza(key){ return FAMILIAS_PIEZA.find(f=>f.keys.includes(key)) || FAMILIAS_PIEZA[0]; }
let piezasAbiertas = {}, piezasBuscar = '';
function dibujoPiezaSvg(dim, color){
  const m = String(dim).match(/([\d.]+)\s*×\s*([\d.]+)/); if(!m) return '';
  let a = Number(m[1]), b = Number(m[2]); const L = Math.max(a,b), C = Math.min(a,b);
  // Forma real (proporción) y tamaño relativo: las piezas grandes se ven más grandes que las chicas.
  const W = 64, H = 32;
  let w = 16 + 48*Math.sqrt(L/244), h = w*C/L;
  if(h > H){ w = w*H/h; h = H; }
  h = Math.max(3, h);
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="flex:0 0 ${W}px" aria-hidden="true"><rect x="${(W-w)/2}" y="${(H-h)/2}" width="${w}" height="${h}" rx="2" fill="${color}" fill-opacity=".85" stroke="${color}"/></svg>`;
}
// ctx: 'aud' (auditoría) o 'pz' (piezas encontradas)
function piezasCtx(ctx){
  return ctx==='aud'
    ? {grupo:auditPiezaGrupo, counts:auditPiezas[auditPiezaGrupo]||{}, set:(k,v)=>{ setAuditPieza(auditPiezaGrupo,k,v); guardarBorradorAud(); }}
    : {grupo:pzGrupo, counts:pzVals[pzGrupo]||{}, set:(k,v)=>setPz(pzGrupo,k,v)};
}
function listaPiezasHtml(ctx){
  const {grupo, counts} = piezasCtx(ctx);
  const esMDF = grupo===AUD_GRUPO_MDF;
  const lista = PIEZAS_AUDIT.filter(p=>p.tipo===(esMDF?'mdf':'mel'));
  const area = p=>{ const m=String(p.dim).match(/([\d.]+)\s*×\s*([\d.]+)/); return m?Number(m[1])*Number(m[2]):0; };
  const bloques = FAMILIAS_PIEZA.map(f=>{
    const ps = lista.filter(p=>familiaDePieza(p.key).k===f.k).sort((x,y)=>area(y)-area(x));
    if(!ps.length) return '';
    const n = ps.filter(p=>counts[p.key]>0).length;
    const abierto = !!piezasBuscar || (piezasAbiertas[f.k]!==undefined ? piezasAbiertas[f.k] : (f.k==='est' || n>0));
    return `<div class="pz-grupo" data-fam="${f.k}" style="margin-top:10px;border-left:5px solid ${f.c};border-radius:10px;background:rgba(127,127,127,.06)">
      <button type="button" onclick="piezasAbiertas['${f.k}']=${abierto?'false':'true'};rerenderPiezas('${ctx}')" style="all:unset;cursor:pointer;display:flex;align-items:center;gap:8px;width:100%;box-sizing:border-box;padding:10px 12px">
        <span style="font-size:18px">${f.ic}</span><strong style="color:${f.c};font-size:16px;flex:1">${f.t}</strong>
        <span id="pzcnt-${ctx}-${f.k}" class="tag" style="${n?`color:${f.c};border-color:${f.c}`:''}">${n?n+' ✓':ps.length+' piezas'}</span><span class="hint" style="margin:0">${abierto?'▲':'▼'}</span>
      </button>
      ${abierto?`<div style="padding:0 8px 8px">${ps.map(p=>filaPiezaHtml(ctx, p, f, counts[p.key])).join('')}</div>`:''}
    </div>`; }).join('');
  const leyenda = FAMILIAS_PIEZA.filter(f=>lista.some(p=>familiaDePieza(p.key).k===f.k)).map(f=>`<span style="display:inline-flex;align-items:center;gap:4px;margin:2px 8px 2px 0;font-size:12px"><span style="width:10px;height:10px;border-radius:3px;background:${f.c};display:inline-block"></span>${f.t}</span>`).join('');
  return `<input type="search" placeholder="🔍 Buscar pieza (ej. max, zap, 52)" value="${String(piezasBuscar).replace(/"/g,'&quot;')}" oninput="piezasBuscar=this.value;filtrarPiezas('${ctx}')" style="margin-top:8px">
    <div class="hint" style="margin:6px 0 0">${leyenda}</div>
    <div id="pz-lista-${ctx}">${bloques}</div>`;
}
function filaPiezaHtml(ctx, p, f, v){
  const on = v>0;
  return `<div class="pz-fila" data-txt="${(p.label+' '+p.dim+' '+f.t).toLowerCase().replace(/"/g,'')}" id="pzf-${ctx}-${p.key}" style="display:flex;align-items:center;gap:8px;padding:8px 6px;margin-top:6px;border-radius:10px;${on?`background:${f.c}22;`:''}">
    ${dibujoPiezaSvg(p.dim, f.c)}
    <div style="flex:1;min-width:0"><div class="pz-nombre" style="color:${f.c};font-weight:700;line-height:1.2">${on?'✓ ':''}${p.label}</div><span class="tag" style="color:#fff">${p.dim}</span></div>
    <input type="number" min="0" inputmode="numeric" placeholder="—" value="${v??''}" style="width:64px;min-width:64px;text-align:center" oninput="piezaCambio('${ctx}','${p.key}',this.value)">
    <div style="display:flex;flex-direction:column;gap:4px">
      <button class="btn small" style="padding:4px 8px;min-height:0" onclick="piezaSumar('${ctx}','${p.key}',1)">+1</button>
      <button class="btn small" style="padding:4px 8px;min-height:0;background:transparent;color:var(--brand);border:1px solid var(--line);box-shadow:none" onclick="piezaSumar('${ctx}','${p.key}',5)">+5</button>
    </div>
  </div>`;
}
function piezaCambio(ctx, key, val){
  piezasCtx(ctx).set(key, val);
  marcarFilaPieza(ctx, key);
}
function piezaSumar(ctx, key, n){
  const c = piezasCtx(ctx); const actual = Number(c.counts[key])||0;
  c.set(key, String(actual+n));
  const row = document.getElementById('pzf-'+ctx+'-'+key); if(row){ const inp=row.querySelector('input'); if(inp) inp.value = actual+n; }
  marcarFilaPieza(ctx, key);
}
function marcarFilaPieza(ctx, key){
  const {counts} = piezasCtx(ctx); const f = familiaDePieza(key); const p = PIEZAS_AUDIT.find(x=>x.key===key);
  const row = document.getElementById('pzf-'+ctx+'-'+key); if(!row || !p) return;
  const on = counts[key]>0;
  row.style.background = on ? f.c+'22' : '';
  const nm = row.querySelector('.pz-nombre'); if(nm) nm.textContent = (on?'✓ ':'')+p.label;
  const tag = document.getElementById('pzcnt-'+ctx+'-'+f.k);
  if(tag){ const n = f.keys.filter(k=>counts[k]>0).length; tag.textContent = n ? n+' ✓' : f.keys.filter(k=>PIEZAS_AUDIT.find(x=>x.key===k&&x.tipo===p.tipo)).length+' piezas'; tag.style.color = n?f.c:''; tag.style.borderColor = n?f.c:''; }
}
function filtrarPiezas(ctx){
  const q = piezasBuscar.trim().toLowerCase();
  // al buscar se abren todos los grupos; se redibuja solo la lista (sin perder el cursor del buscador)
  const el = document.getElementById('pz-lista-'+ctx); if(!el) return;
  const tmp = document.createElement('div'); tmp.innerHTML = listaPiezasHtml(ctx);
  el.innerHTML = tmp.querySelector('#pz-lista-'+ctx).innerHTML;
  el.querySelectorAll('.pz-fila').forEach(r=>{ r.style.display = !q || r.dataset.txt.includes(q) ? 'flex' : 'none'; });
  el.querySelectorAll('.pz-grupo').forEach(g=>{ const vis=[...g.querySelectorAll('.pz-fila')].some(r=>r.style.display!=='none'); g.style.display = (!q || vis) ? '' : 'none'; });
}
function rerenderPiezas(ctx){ if(ctx==='aud') renderAud(); else if(pzModo==='recon') renderRecon(); else renderPzEnc(); if(piezasBuscar) filtrarPiezas(ctx); }

function renderAudPiezasHtml(){
  if(!auditPiezaGrupo) auditPiezaGrupo = MEL_COLORES[0];
  const esMDF = auditPiezaGrupo===AUD_GRUPO_MDF;
  const lista = PIEZAS_AUDIT.filter(p=>p.tipo===(esMDF?'mdf':'mel'));
  const counts = auditPiezas[auditPiezaGrupo]||{};
  const opciones = MEL_COLORES.map(c=>{
    const n = Object.values(auditPiezas[c]||{}).filter(v=>v>0).length;
    return `<option value="${c}" ${c===auditPiezaGrupo?'selected':''}>Melamina ${c}${n?' ✓'+n:''}</option>`;
  }).join('') + (()=>{ const n=Object.values(auditPiezas[AUD_GRUPO_MDF]||{}).filter(v=>v>0).length;
    return `<option value="${AUD_GRUPO_MDF}" ${esMDF?'selected':''}>MDF (fondos de cajón/cajonera)${n?' ✓'+n:''}</option>`; })();
  return `<div class="card">
    <h3>✂️ Piezas cortadas</h3>
    <p class="hint">Cuenta las piezas que ya están cortadas y sueltas en el módulo. La app las convierte a hojas con los mismos rendimientos del despiece y las suma al conteo físico de esa hoja.</p>
    <p class="hint">🧩 <strong>No cuentes</strong> lo que está apartado en <strong>Sobrantes</strong>: eso ya está fuera del inventario hasta que se transforme.</p>
    <label class="hint">Color / material</label>
    <select onchange="auditPiezaGrupo=this.value;renderAud()" style="margin-top:4px;font-weight:700">${opciones}</select>
    ${listaPiezasHtml('aud')}
  </div>
  ${resumenCardHtml()}`;
}
function setAuditPieza(grupo, key, val){
  const n = val==='' ? 0 : Number(val);
  auditPiezas[grupo] = auditPiezas[grupo]||{};
  if(!n || n<0) delete auditPiezas[grupo][key]; else auditPiezas[grupo][key] = n;
  if(!Object.keys(auditPiezas[grupo]).length) delete auditPiezas[grupo];
  // Solo refresca el resumen (sin redibujar la tabla, para no perder el cursor al escribir)
  const r = document.getElementById('aud-piezas-resumen'); if(r) r.innerHTML = resumenPiezasHtml();
  const c = document.getElementById('aud-contador');
  if(c) c.textContent = textoContadorAudit();
}

async function saveAudit(){
  const tipo = $('#aud-tipo').value;
  const auditor = $('#aud-auditor').value.trim() || 'Sin nombre';
  const eq = piezasAuditAHojas();
  const resultados=[]; let totalDiff=0;
  const capturados = Object.keys(auditCapturas).filter(k=>auditCapturas[k]!==undefined);
  if(!capturados.length && !Object.keys(eq).length) return alert('No has capturado ningún artículo, pieza ni armado todavía.');
  // Confirmado por el usuario: el reporte de auditoría lleva TODOS los artículos, aunque estén en
  // cero. Lo que no se capturó se toma como 0 físico; antes se avisa de los que sí tenían existencia.
  const ciego = modoConteoCoord();
  if(ciego && !confirm('¿Ya contaste TODO el almacén?\n\nLo que no escribiste se toma como 0.\n\nAl enviar, el conteo le llega a Dirección y esta opción se cierra.')) return;
  const comp = tipo==='complemento', parcial = tipo==='parcial';
  if(comp && !confirm('¿Guardar este COMPLEMENTO del conteo inicial de '+modulo()+'?\n\nSolo lleva lo que acabas de capturar; se va a SUMAR al stock inicial sin tocar lo que ya estaba contado.')) return;
  const noContados = (ciego||comp||parcial) ? [] : CATALOGO.filter(it=>auditCapturas[it.id]===undefined && !eq[it.id] && Math.abs(calcFormula(it.id).final)>0.005);
  if(noContados.length && !confirm(`Hay ${noContados.length} artículo(s) que según el inventario SÍ hay, pero no los contaste:\n\n${noContados.slice(0,15).map(it=>'• '+it.nombre+' (debería haber '+fmtNum(calcFormula(it.id).final)+')').join('\n')}${noContados.length>15?'\n… y '+(noContados.length-15)+' más':''}\n\nSi guardas así, se toman como 0 (faltante). ¿Guardar de todos modos?\n\n(Cancelar = regresar a contarlos)`)) return;
  CATALOGO.forEach(it=>{
    const itemId = it.id;
    const f = calcFormula(itemId);
    // Las correderas sueltas ya entraron al balance de juegos (eq), no se suman dos veces.
    const hojasCompletas = (auditCapturas[itemId]!==undefined && !esCorrSuelta(it)) ? auditCapturas[itemId] : 0;
    const hojasEnPiezas = fmtNum(eq[itemId]||0);
    const fisico = fmtNum(hojasCompletas + hojasEnPiezas);
    const diff = fmtNum(fisico - f.final);
    if(diff!==0) totalDiff++;
    if(comp && !(fisico>0.0005)) return; // en el complemento solo va lo que se encontró
    if(parcial && auditCapturas[itemId]===undefined) return; // auditoría de un material: solo lo que se escribió (las piezas/armados solo suman a lo escrito)
    const r = {itemId, nombre:it.nombre, cat:it.cat, unidad:it.unidad, teorico:fmtNum(f.final), fisico, diff, capturado: auditCapturas[itemId]!==undefined || !!eq[itemId]};
    if(hojasEnPiezas){ r.hojasCompletas = hojasCompletas; r.hojasEnPiezas = hojasEnPiezas; }
    if(f.esHoja){
      // Comparación por lado: hojas completas contadas vs. teóricas, y cortado/armado contado
      // vs. teórico (la diferencia en cortado es desperdicio o piezas perdidas).
      r.teoricoCompletas = fmtNum(f.completas); r.teoricoCortado = fmtNum(f.cortado);
      r.fisicoCompletas = fmtNum(hojasCompletas); r.fisicoCortado = hojasEnPiezas;
      r.diffCompletas = fmtNum(hojasCompletas - f.completas); r.diffCortado = fmtNum(hojasEnPiezas - f.cortado);
      if(parcial && !eq[itemId]){ // no se contaron piezas de este material: el cortado se queda como está
        r.fisicoCortado = r.teoricoCortado; r.diffCortado = 0; r.cortadoNoContado = true;
        r.fisico = fmtNum(hojasCompletas + f.cortado); r.diff = fmtNum(r.fisico - f.final);
      }
    }
    resultados.push(r);
  });
  // Detalle de piezas contadas, para consultarlo después en el Historial
  const piezasContadas = [];
  Object.keys(auditPiezas).forEach(grupo=>{
    Object.keys(auditPiezas[grupo]).forEach(key=>{
      const p = PIEZAS_AUDIT.find(x=>x.key===key);
      if(p) piezasContadas.push({grupo: grupo===AUD_GRUPO_MDF?'MDF':'Melamina '+grupo, pieza:p.label, dim:p.dim, cantidad:auditPiezas[grupo][key]});
    });
  });
  try{
    if(parcial) totalDiff = resultados.filter(r=>Math.abs(Number(r.diff)||0)>0.005).length;
    const doc = {modulo:modulo(),tipo,auditor,fecha:new Date().toISOString(),resultados,totalDiff,completa:!parcial,creadoPor:getCurrentUserEmail?getCurrentUserEmail():''};
    if(tipo==='conteo') doc.conteoInicial = true;
    if(comp){ doc.complemento = true; doc.totalDiff = 0; }
    if(piezasContadas.length) doc.piezasContadas = piezasContadas;
    if(auditArmados.length) doc.armadosContados = auditArmados.map(a=>({descripcion:describirArmado(a), cantidad:a.cantidad, ...a}));
    const bc = balanceCorrederas();
    if(bc.length) doc.correderas = bc;
    const audId = cryptoId();
    await db.collection('auditorias').doc(audId).set(doc);
    auditCapturas={}; auditPiezas={}; auditArmados=[]; audAuditor=''; audHechas={}; audPaso=0; auditCat='Melamina';
    borrarBorradorAud();
    if(ciego){
      try{ await db.collection('conteoAbierto').doc(modulo()).set({...(conteoMap[modulo()]||{}), modulo:modulo(), abierto:false, cerrado:new Date().toISOString(), cerradoPor:doc.creadoPor, auditoriaId:audId}); }catch(e){}
      toast('✅ Conteo enviado a Dirección. ¡Gracias!');
      setView('home'); return;
    }
    toast(comp ? '✅ Complemento guardado.' : '✅ Auditoría guardada.');
    histTab='aud';
    setView('hist');
    if(comp){
      if(esAdmin() && confirm('¿SUMAR ahora este complemento al stock inicial de '+doc.modulo+'?\n\nTambién lo puedes hacer después desde el Historial.')) await sumarComplementoInicial(audId, {...doc, id:audId});
      return;
    }
    if(confirm('¿Quieres descargar el REPORTE DE AUDITORÍA en PDF (teórico vs. físico de cada artículo)?')){
      try{ await generarReporteAuditoriaPDF({...doc, id:audId}); }catch(e){ alert('No se pudo generar el PDF: '+e.message); }
    }
    if(esAdmin() && tipo==='conteo'){
      if(confirm('¿Usar este conteo como el STOCK INICIAL de '+doc.modulo+' ahora?\n\nTambién lo puedes hacer después desde el Historial.')) await usarConteoComoInicial(audId, {...doc, id:audId});
    } else if(esAdmin() && confirm('¿Aplicar esta auditoría al inventario ahora?\n\nEl inventario quedará igual a lo contado y lo que haya faltado se guarda como DEUDA en Historial → Faltantes (deuda).\n\nTambién puedes aplicarla después desde el Historial.')){
      await aplicarAuditoria(audId, {...doc, id:audId});
    }
  }catch(e){ alert('Error: '+e.message); }
}

// ===== Conteo del almacén (arranque desde cero, confirmado por el usuario) =====
// Dirección abre el conteo de un módulo (o de los 5) SOLO para hoy. El coordinador lo ve en su Inicio,
// cuenta a ciegas (sin ver el teórico) y lo envía; al enviar, o al cambiar el día, la opción desaparece.
// Dirección lo revisa y lo usa como STOCK INICIAL: todo el módulo parte de ese conteo (lo anterior deja
// de contar) y, desde ahí, solo se mueven entradas, salidas, instalaciones, etc.
function conteoAdminCardHtml(){
  const hoy = fechaHoyLocal();
  const filas = MODULOS.map(m=>{
    const c = conteoMap[m.nombre]; const abierto = conteoAbiertoHoy(m.nombre);
    const estado = abierto ? '<span class="tag" style="color:var(--bad);border-color:var(--bad)">🟢 Abierto hoy</span>'
      : (c && c.auditoriaId && c.fechaDia===hoy ? '<span class="tag pos" style="border-color:var(--ok)">✓ Conteo recibido</span>' : '<span class="tag">Cerrado</span>');
    return `<div class="movitem"><span style="min-width:0"><span class="invname">${m.nombre}</span><span style="display:block;margin-top:2px">${estado}</span></span>
      ${abierto ? `<button class="btn small" style="background:transparent;color:var(--bad);border:1px solid var(--line);box-shadow:none" onclick="abrirConteo(['${m.nombre}'],false)">Cerrar</button>` : `<button class="btn small" onclick="abrirConteo(['${m.nombre}'],true)">Abrir hoy</button>`}</div>`;
  }).join('');
  return `<details class="card" ${Object.keys(conteoMap).some(k=>conteoAbiertoHoy(k))?'open':''}>
    <summary><strong>📋 Conteo del almacén para coordinadores</strong></summary>
    <p class="hint">Abre el conteo y el coordinador verá <strong>"Conteo del almacén"</strong> en su Inicio <strong>solo hoy</strong>. Cuenta a ciegas y, al enviarlo, se cierra. Te llega al Historial para que lo uses como stock inicial.</p>
    <button class="btn" style="width:100%;margin-bottom:8px" onclick="abrirConteo(MODULOS.map(m=>m.nombre),true)">Abrir hoy en los 5 módulos</button>
    <div class="movlist">${filas}</div>
  </details>`;
}
async function abrirConteo(mods, abrir){
  if(!esAdmin()) return;
  if(abrir && !confirm(`¿Abrir el conteo del almacén HOY para: ${mods.join(', ')}?\n\nLos coordinadores lo verán en su Inicio solo el día de hoy.`)) return;
  try{
    const quien = getCurrentUserEmail?getCurrentUserEmail():'';
    for(const m of mods){
      await db.collection('conteoAbierto').doc(m).set(abrir ? {modulo:m, abierto:true, fechaDia:fechaHoyLocal(), abiertoPor:quien, fecha:new Date().toISOString()}
        : {...(conteoMap[m]||{}), modulo:m, abierto:false, cerrado:new Date().toISOString(), cerradoPor:quien});
    }
    toast(abrir ? '✅ Conteo abierto para hoy.' : 'Conteo cerrado.');
    renderAud();
  }catch(e){ alert('Error: '+e.message); }
}
// Resumen de hojas del conteo: completas + cortado = total, por color.
function resumenHojasConteoHtml(a){
  const hojas = (a.resultados||[]).filter(r=>r.teoricoCompletas!==undefined && (Number(r.fisicoCompletas)||Number(r.fisicoCortado)));
  if(!hojas.length) return '';
  const t = hojas.reduce((s,r)=>{ s.c+=Number(r.fisicoCompletas)||0; s.k+=Number(r.fisicoCortado)||0; return s; },{c:0,k:0});
  return `<details style="margin-top:8px"><summary class="hint"><strong>🪵 Hojas contadas: ${fmtNum(t.c)} completas + ${fmtNum(t.k)} cortadas = ${fmtNum(t.c+t.k)}</strong></summary>
    <div class="wrap-x"><table><tr><th>Artículo</th><th>Completas</th><th>Cortado</th><th>Total</th></tr>
    ${hojas.map(r=>`<tr><td>${r.nombre}</td><td>${fmtNum(r.fisicoCompletas)}</td><td>${fmtNum(r.fisicoCortado)}</td><td><strong>${fmtNum(r.fisico)}</strong></td></tr>`).join('')}
    </table></div></details>`;
}
async function usarConteoComoInicialUI(id){ const a = auditorias.find(x=>x.id===id); if(a) await usarConteoComoInicial(id, a); }
async function usarConteoComoInicial(id, a){
  if(!esAdmin()) return alert('Solo Dirección puede usar un conteo como stock inicial.');
  if(a.aplicada) return alert('Este conteo ya se usó.');
  const res = a.resultados||[];
  const hojas = res.filter(r=>r.teoricoCompletas!==undefined);
  const tc = hojas.reduce((s,r)=>s+(Number(r.fisicoCompletas)||0),0), tk = hojas.reduce((s,r)=>s+(Number(r.fisicoCortado)||0),0);
  const conAlgo = res.filter(r=>Math.abs(Number(r.fisico)||0)>0.005).length;
  if(!confirm(`Usar el conteo del ${new Date(a.fecha).toLocaleString('es-MX')} como STOCK INICIAL de ${a.modulo}.\n\n• Todo el inventario de ${a.modulo} parte de este conteo (lo que no se contó queda en 0).\n• Lo anotado ANTES del conteo deja de contar; lo anotado DESPUÉS sí cuenta.\n• Hojas: ${fmtNum(tc)} completas + ${fmtNum(tk)} cortadas = ${fmtNum(tc+tk)}.\n• ${conAlgo} artículo(s) con existencia.\n\n¿Continuar?`)) return;
  if(!(await pedirPinAdmin('fijar el stock inicial con este conteo'))) return;
  try{
    const creadoPor = getCurrentUserEmail?getCurrentUserEmail():'';
    // Punto de partida = momento del conteo: el "cero" justo en ese momento y el conteo 1 ms después,
    // así lo que se anote después del conteo (aunque se apruebe más tarde) sí cuenta.
    const t0 = new Date(a.fecha).getTime();
    await db.collection('resets').doc(a.modulo).set({modulo:a.modulo, fecha:new Date(t0).toISOString(), porConteo:id});
    const fechaIni = new Date(t0+1).toISOString();
    for(const it of CATALOGO){
      const r = res.find(x=>x.itemId===it.id) || {fisico:0};
      const d = {modulo:a.modulo, itemId:it.id, cantidad:fmtNum(Number(r.fisico)||0), fecha:fechaIni, creadoPor, origen:'conteo', auditoriaId:id};
      if(esHoja(it)) d.cortado = fmtNum(Number(r.fisicoCortado)||0);
      await db.collection('inicial').doc(inicialKey(a.modulo, it.id)).set(d);
    }
    await db.collection('inicialHist').doc(cryptoId()).set({modulo:a.modulo, origen:'Conteo inicial', auditoriaId:id, fecha:new Date().toISOString(), creadoPor, articulos:conAlgo, hojasCompletas:fmtNum(tc), hojasCortadas:fmtNum(tk)});
    await db.collection('auditorias').doc(id).update({aplicada:true, fechaAplicada:new Date().toISOString(), aplicadaPor:creadoPor, usadoComoInicial:true});
    alert(`✅ Listo. ${a.modulo} ya arranca con este conteo como stock inicial.`);
    if(current==='hist') renderHist();
  }catch(e){ alert('Error: '+e.message); }
}

// Complemento del conteo inicial (confirmado por el usuario: hubo cosas que no se pudieron contar
// porque no venían en la lista). Lo contado se SUMA al stock inicial de cada artículo, con la misma
// fecha del conteo, así lo que ya se había contado no se toca y los movimientos siguen igual.
async function sumarComplementoUI(id){ const a = auditorias.find(x=>x.id===id); if(a) await sumarComplementoInicial(id, a); }
async function sumarComplementoInicial(id, a){
  if(!esAdmin()) return alert('Solo Dirección puede sumar al stock inicial.');
  if(a.aplicada) return alert('Este complemento ya se sumó.');
  if(a.modulo!==modulo()) return alert('Cambia al módulo '+a.modulo+' para sumar este complemento.');
  const res = (a.resultados||[]).filter(r=>(Number(r.fisico)||0)>0.0005);
  if(!res.length) return alert('Este complemento no tiene nada que sumar.');
  const resetF = resetMap[a.modulo];
  const fechaBase = resetF ? new Date(new Date(resetF).getTime()+1).toISOString() : (fechaInicioModulo() || new Date().toISOString());
  const lineas = res.map(r=>{ const vigente = inicialFechaMap[r.itemId] && (!resetF || inicialFechaMap[r.itemId] > resetF);
    const antes = vigente ? Number(inicialMap[r.itemId])||0 : 0;
    return {r, antes, despues: fmtNum(antes + Number(r.fisico)), vigente}; });
  // Correderas: las hembras y machos sueltos que se suman se juntan con los que ya había en el
  // stock inicial y forman juegos (confirmado por el usuario: si no, quedaban separados).
  const vig = id => inicialFechaMap[id] && (!resetF || inicialFechaMap[id] > resetF);
  const iniDe = id => vig(id) ? Number(inicialMap[id])||0 : 0;
  const lineaDe = it => { let l = lineas.find(x=>x.r.itemId===it.id);
    if(!l){ l = {r:{itemId:it.id, nombre:it.nombre, fisico:0}, antes:iniDe(it.id), despues:iniDe(it.id), vigente:vig(it.id), soloJuntar:true}; lineas.push(l); }
    return l; };
  const juntados = [];
  CORR_TIPOS.forEach(t=>{
    const itH=itemByName(t.hembra), itM=itemByName(t.macho), itJ=itemByName(t.juego); if(!itH||!itM||!itJ) return;
    if(!lineas.some(l=>l.r.itemId===itH.id || l.r.itemId===itM.id)) return;
    const lH=lineaDe(itH), lM=lineaDe(itM);
    const p = Math.floor(Math.min(lH.despues, lM.despues)); if(p<=0) return;
    const lJ=lineaDe(itJ);
    lH.despues=fmtNum(lH.despues-p); lM.despues=fmtNum(lM.despues-p); lJ.despues=fmtNum(lJ.despues+p);
    juntados.push(`🔗 ${t.etiqueta}: ${p} hembra(s) + ${p} macho(s) sueltos → ${p} juego(s)`);
  });
  if(!confirm(`Sumar al STOCK INICIAL de ${a.modulo}:\n\n${lineas.slice(0,15).map(l=>`• ${l.r.nombre}: ${fmtNum(l.antes)} ${l.soloJuntar?'→':'+ '+fmtNum(l.r.fisico)+' ='} ${fmtNum(l.despues)}`).join('\n')}${lineas.length>15?'\n… y '+(lineas.length-15)+' más':''}${juntados.length?'\n\n'+juntados.join('\n'):''}\n\nLo demás no cambia. ¿Continuar?`)) return;
  if(!(await pedirPinAdmin('sumar el complemento al stock inicial'))) return;
  try{
    const creadoPor = getCurrentUserEmail?getCurrentUserEmail():'';
    for(const l of lineas){
      const it = CATALOGO.find(i=>i.id===l.r.itemId); if(!it) continue;
      const d = {modulo:a.modulo, itemId:it.id, cantidad:l.despues, fecha: l.vigente ? inicialFechaMap[it.id] : fechaBase, creadoPor, origen:'complemento', complementoId:id};
      if(esHoja(it)){ const cortAntes = l.vigente ? Number(inicialCortadoMap[it.id])||0 : 0; d.cortado = fmtNum(cortAntes + (Number(l.r.fisicoCortado)||0)); }
      if(l.soloJuntar) d.origen='complementoJuntarCorrederas';
      await registrarCambioInicial(it, d, l.soloJuntar?'Complemento: juntar correderas':'Complemento del conteo');
      await db.collection('inicial').doc(inicialKey(a.modulo, it.id)).set(d);
    }
    await db.collection('auditorias').doc(id).update({aplicada:true, fechaAplicada:new Date().toISOString(), aplicadaPor:creadoPor});
    alert(`✅ Listo. Se sumaron ${res.length} artículo(s) al stock inicial de ${a.modulo}.${juntados.length?'\n\n'+juntados.join('\n'):''}`);
    if(current==='hist') renderHist();
  }catch(e){ alert('Error: '+e.message); }
}

// ===== Historial de entradas y salidas (por fecha) =====
let mhDesde = null, mhHasta = null, mhTipo = 'todos', mhCat = 'todas', mhItem = 'todos';
const MH_TIPOS = {todos:'Todo', entrada:'📥 Entradas', salida:'📤 Salidas', instalacion:'🔧 Instalaciones', garantia:'🛡️ Garantías', devolucion:'↩️ Regresó de garantía', sobrante:'🧩 A sobrantes', merma:'⚠️ Mermas', corte:'✂️ Cortes', ajuste:'⚖️ Ajustes'};
function fechaInicioModulo(){
  // Fecha del stock inicial vigente (el conteo): la más reciente de los iniciales capturados.
  const fs = Object.values(inicialFechaMap).filter(Boolean).sort();
  return fs.length ? fs[fs.length-1] : (resetMap[modulo()]||null);
}
function renderMovHist(){
  const ini = fechaInicioModulo();
  const aLocal = iso => new Date(new Date(iso).getTime()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
  if(!mhDesde) mhDesde = ini ? aLocal(ini) : fechaHoyLocal().slice(0,8)+'01';
  if(!mhHasta) mhHasta = fechaHoyLocal();
  const cats = [...new Set(CATALOGO.map(i=>i.cat))];
  const desdeISO = new Date(mhDesde+'T00:00:00').toISOString(), hastaISO = new Date(mhHasta+'T23:59:59.999').toISOString();
  const lista = movs.filter(m=>m.tipo!=='nota' && m.fecha>=desdeISO && m.fecha<=hastaISO && m.estado!=='rechazado'
    && (mhTipo==='todos' || m.tipo===mhTipo)
    && (mhItem==='todos' ? (mhCat==='todas' || (CATALOGO.find(i=>i.id===m.itemId)||{}).cat===mhCat) : m.itemId===mhItem));
  const aprob = lista.filter(m=>m.estado!=='pendiente');
  // Totales por artículo
  const tot = {};
  aprob.forEach(m=>{ const t = tot[m.itemId] = tot[m.itemId] || {entrada:0, salida:0, instalacion:0, garantia:0, merma:0, otros:0};
    const q = Number(m.cantidad)||0;
    if(m.tipo==='entrada'||m.tipo==='devolucion') t.entrada+=q; else if(m.tipo==='salida'||m.tipo==='sobrante') t.salida+=q; else if(m.tipo==='instalacion') t.instalacion+=q;
    else if(m.tipo==='garantia') t.garantia+=q; else if(m.tipo==='merma') t.merma+=q; else if(m.tipo==='ajuste') t.otros+=q; });
  const ids = Object.keys(tot).sort((a,b)=>(CATALOGO.findIndex(i=>i.id===a))-(CATALOGO.findIndex(i=>i.id===b)));
  const nom = id => (CATALOGO.find(i=>i.id===id)||{nombre:id}).nombre;
  const uni = id => item2unidad(id);
  const porDia = {};
  lista.forEach(m=>{ const d=aLocal(m.fecha); (porDia[d]=porDia[d]||[]).push(m); });
  const dias = Object.keys(porDia).sort().reverse();
  $('#main').innerHTML = `
  <div class="card">
    <div style="font-size:17px;font-weight:800">📜 Historial de entradas y salidas · ${modulo()}</div>
    <p class="hint">Todo lo que se anotó, día por día.${ini?` El stock inicial (conteo) es del <strong>${new Date(ini).toLocaleDateString('es-MX',{day:'numeric',month:'long',year:'numeric'})}</strong>.`:''}</p>
    <div class="grid2" style="margin-top:8px;grid-template-columns:minmax(0,1fr) minmax(0,1fr)">
      <div><label class="hint">Desde</label><input type="date" value="${mhDesde}" style="margin-top:4px;min-width:0;width:100%;max-width:100%" onchange="mhDesde=this.value;renderMovHist()"></div>
      <div><label class="hint">Hasta</label><input type="date" value="${mhHasta}" style="margin-top:4px;min-width:0;width:100%;max-width:100%" onchange="mhHasta=this.value;renderMovHist()"></div>
      <div><label class="hint">Material</label><select style="margin-top:4px;min-width:0;width:100%" onchange="mhCat=this.value;mhItem='todos';renderMovHist()"><option value="todas">Todo</option>${cats.map(c=>`<option ${c===mhCat?'selected':''}>${c}</option>`).join('')}</select></div>
      <div><label class="hint">Artículo</label><select style="margin-top:4px;min-width:0;width:100%" onchange="mhItem=this.value;renderMovHist()"><option value="todos">Todos</option>${CATALOGO.filter(i=>mhCat==='todas'||i.cat===mhCat).map(i=>`<option value="${i.id}" ${i.id===mhItem?'selected':''}>${i.nombre}</option>`).join('')}</select></div>
    </div>
    <div class="row" style="gap:8px;margin-top:8px;flex-wrap:wrap">
      ${ini?`<button class="btn small" style="background:transparent;color:var(--brand);border:1px solid var(--line);box-shadow:none" onclick="mhDesde='${aLocal(ini)}';mhHasta=fechaHoyLocal();renderMovHist()">Desde el conteo hasta hoy</button>`:''}
      <button class="btn small" onclick="descargarHistorialCSV()">📊 Descargar Excel</button>
    </div>
    <div class="chips" style="margin-top:10px">${Object.keys(MH_TIPOS).map(k=>`<button class="chip ${k===mhTipo?'on':''}" onclick="mhTipo='${k}';renderMovHist()">${MH_TIPOS[k]}</button>`).join('')}</div>
  </div>
  <div class="card">
    <h3>Totales del periodo</h3>
    ${ids.length?`<div class="wrap-x"><table><tr><th>Artículo</th><th>Entradas</th><th>Salidas</th><th>Instal.</th><th>Garant.</th><th>Mermas</th></tr>
    ${ids.map(id=>{ const t=tot[id]; return `<tr><td>${nom(id)}<div class="tag">${uni(id)}</div></td><td class="pos">${t.entrada?'+'+fmtNum(t.entrada):'—'}</td><td class="neg">${t.salida?fmtNum(t.salida):'—'}</td><td class="neg">${t.instalacion?fmtNum(t.instalacion):'—'}</td><td class="neg">${t.garantia?fmtNum(t.garantia):'—'}</td><td class="neg">${t.merma?fmtNum(t.merma):'—'}</td></tr>`; }).join('')}
    </table></div><p class="hint">Solo cuenta lo aprobado. Las entradas incluyen lo que regresó de garantías.</p>`:'<p class="hint">No hay movimientos en estas fechas.</p>'}
  </div>
  ${dias.map(d=>`<div class="card">
    <strong>${new Date(d+'T12:00:00').toLocaleDateString('es-MX',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</strong>
    <div class="wrap-x" style="margin-top:6px"><table><tr><th>Hora</th><th>Artículo</th><th>Tipo</th><th>Cant.</th><th>Nota</th><th>Quién</th></tr>
    ${porDia[d].map(m=>`<tr><td>${new Date(m.fecha).toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'})}</td><td>${m.itemNombre||nom(m.itemId)}</td>
      <td class="${m.tipo==='entrada'||m.tipo==='devolucion'||(m.tipo==='ajuste'&&m.cantidad>0)?'pos':(m.tipo==='corte'?'':'neg')}">${etiquetaTipoMov(m)}${m.estado==='pendiente'?' '+badgeEstado('pendiente'):''}</td>
      <td>${m.tipo==='ajuste'&&m.cantidad>0?'+':''}${fmtNum(m.cantidad)} ${uni(m.itemId)}</td><td>${m.nota||''}</td><td>${(m.creadoPor||'').split('@')[0]}${esAdmin() && m.tipo==='corte' && m.estado!=='rechazado' ? `<button class="btn small" style="display:block;margin-top:4px;background:transparent;color:var(--bad);border:1px solid var(--line);box-shadow:none;white-space:nowrap" onclick="borrarCorte('${m.id}')">🗑️ Corte mal capturado</button>` : ''}</td></tr>`).join('')}
    </table></div></div>`).join('')}`;
}
// Dirección puede borrar un corte mal capturado (p. ej. pusieron las hojas que TENÍAN en vez de las que
// CORTARON). El corte solo mueve hojas de "completas" a "cortado"; al borrarlo regresan a completas y
// después se captura el corte correcto. Pide PIN. No se permite si ya se aplicó una auditoría posterior.
async function borrarCorte(id){
  if(!esAdmin()) return;
  const m = movs.find(x=>x.id===id); if(!m) return;
  const audDespues = (auditorias||[]).find(a=>a.aplicada && (a.fecha||'') > (m.fecha||''));
  if(audDespues) return alert(`No se puede borrar: después de este corte ya se aplicó la auditoría del ${new Date(audDespues.fecha).toLocaleDateString('es-MX')}, que dejó las hojas como se contaron.\n\nSi las hojas completas no cuadran, haz una nueva auditoría de Melamina/MDF.`);
  if(!confirm(`🗑️ Borrar este corte mal capturado:\n\n✂️ ${fmtNum(m.cantidad)} hoja(s) de ${m.itemNombre}\n${new Date(m.fecha).toLocaleString('es-MX')} · ${(m.creadoPor||'').split('@')[0]}\n\nEsas hojas regresan a "completas" (el total no cambia). Después captura el corte correcto en Anotar → Corte del día.\n\n¿Continuar?`)) return;
  if(!(await pedirPinAdmin('borrar este corte'))) return;
  try{
    await db.collection('movimientos').doc(id).delete();
    movs = movs.filter(x=>x.id!==id);
    toast('🗑️ Corte borrado. Captura el corte correcto en Anotar → Corte del día.');
    renderMovHist();
  }catch(e){ alert('Error: '+e.message); }
}

function renderHist(){
  const pend = deudas.filter(d=>d.estado!=='saldada');
  const tabs = `<div class="card" style="padding:10px"><div class="subtabs" style="margin:0">
    <button class="${histTab==='aud'?'active':''}" onclick="histTab='aud';renderHist()">Auditorías (${auditorias.length})</button>
    <button class="${histTab==='deuda'?'active':''}" onclick="histTab='deuda';renderHist()">Faltantes (deuda)${pend.length?' · '+pend.length:''}</button>
  </div></div>`;
  if(histTab==='deuda'){ $('#main').innerHTML = tabs + renderDeudasHtml(); return; }
  if(auditorias.length===0){ $('#main').innerHTML = tabs + '<div class="card">Aún no hay auditorías registradas para '+modulo()+'.</div>'; return; }
  $('#main').innerHTML = tabs + auditorias.map(a=>`
    <div class="card">
      <div class="row" style="justify-content:space-between;cursor:pointer" onclick="toggleAud('${a.id}')">
        <div><strong>${new Date(a.fecha).toLocaleString()}</strong><div class="tag" ${a.conteoInicial||a.complemento?'style="color:var(--bad);border-color:var(--bad)"':''}>${a.conteoInicial?'📋 Conteo inicial':etiquetaTipoAud(a.tipo)}</div> <div class="tag">Auditor: ${a.auditor}</div>
          ${a.aplicada?`<div class="tag pos" style="border-color:var(--ok)">✓ ${a.conteoInicial?'Es el stock inicial':(a.complemento?'Sumado al stock inicial':'Aplicada al inventario')}</div>`:`<div class="tag" style="color:#b3742c;border-color:#b3742c">${a.conteoInicial||a.complemento?'Esperando tu aprobación':'Sin aplicar'}</div>`}</div>
        ${a.complemento ? `<div style="font-weight:700;color:var(--brand)">${(a.resultados||[]).length} artículo(s) a sumar</div>` : a.conteoInicial ? `<div style="font-weight:700;color:var(--brand)">${(a.resultados||[]).filter(r=>Math.abs(Number(r.fisico)||0)>0.005).length} artículo(s) con existencia</div>` : `<div class="${a.totalDiff?'neg':'pos'}" style="font-weight:700">${a.totalDiff} discrepancia(s)</div>`}
      </div>
      <div class="row" style="justify-content:flex-end;margin-top:8px;gap:8px">
        <button class="btn small" style="background:transparent;color:var(--brand);border:1px solid var(--line);box-shadow:none" onclick="reporteAuditoriaUI('${a.id}')">📄 Reporte PDF</button>
        ${!a.aplicada && esAdmin() ? (a.complemento ? `<button class="btn small" style="background:linear-gradient(135deg,#1f9d55,#178045)" onclick="sumarComplementoUI('${a.id}')">➕ Sumar al stock inicial</button>` : a.conteoInicial ? `<button class="btn small" style="background:linear-gradient(135deg,#1f9d55,#178045)" onclick="usarConteoComoInicialUI('${a.id}')">✅ Usar como stock inicial</button>` : `<button class="btn small" onclick="aplicarAuditoriaUI('${a.id}')">Aplicar al inventario</button>`) : ''}
        ${esAdmin() && !a.conteoInicial && !a.complemento ? `<button class="btn small" style="background:transparent;color:#6b4bd6;border:1px solid var(--line);box-shadow:none" onclick="iniciarReconteo('${a.id}')">🔍 Volver a contar un material</button>` : ''}
        ${esAdmin() ? `<button class="btn small" style="background:transparent;color:var(--bad);border:1px solid var(--line);box-shadow:none" onclick="borrarAuditoria('${a.id}')">🗑️ Borrar</button>` : ''}
      </div>
      ${(a.reconteos||[]).length ? `<div style="margin-top:8px">${a.reconteos.map(rc=>`<p class="hint" style="margin:2px 0">🔍 Reconteo de ${rc.cat} (${new Date(rc.fecha).toLocaleString()}): ${rc.ok?'<span class="pos">✅ coincidió con la auditoría</span>':`<span class="neg">⚠️ no coincidió</span>${rc.corrigio?' · <strong>auditoría corregida</strong>':''}`}</p>`).join('')}</div>` : ''}
      ${a.conteoInicial||a.complemento ? resumenHojasConteoHtml(a) : ''}
      ${a.aplicada ? `<p class="hint" style="margin:6px 0 0">Aplicada el ${new Date(a.fechaAplicada).toLocaleString()}${a.aplicadaPor?' por '+a.aplicadaPor:''}${a.deudasCreadas?` · ${a.deudasCreadas} faltante(s) pasaron a deuda`:''}.</p>` : ''}
      <div id="ad-${a.id}" style="display:none;margin-top:8px" class="wrap-x">
        ${(()=>{ const fila = r=>`<tr><td>${r.nombre}${r.capturado===false&&Math.abs(Number(r.teorico))>0.005?' <span class="tag">no contado</span>':''}</td><td>${fmtNum(r.teorico)}</td><td>${fmtNum(r.fisico)}${r.hojasEnPiezas&&r.teoricoCompletas===undefined?`<div class="hint" style="margin-top:3px">${fmtNum(r.hojasCompletas)} sueltas/completas + ${fmtNum(r.hojasEnPiezas)} en piezas/armados</div>`:''}</td><td class="${r.diff<0?'neg':(r.diff>0?'pos':'')}">${r.diff>0?'+':''}${fmtNum(r.diff)}</td></tr>${detalleLadosHtml(r)}`;
          if(a.complemento) return `<h3>Lo que se suma al stock inicial</h3><table><tr><th>Artículo</th><th>Contado</th></tr>${a.resultados.map(r=>`<tr><td>${r.nombre}</td><td>${fmtNum(r.fisico)} ${r.unidad||''}${r.fisicoCortado?`<div class="hint" style="margin-top:3px">${fmtNum(r.fisicoCompletas)} completas + ${fmtNum(r.fisicoCortado)} en piezas/armados</div>`:''}</td></tr>`).join('')}</table>`;
          const dif = a.resultados.filter(r=>Math.abs(Number(r.diff)||0)>0.005), ok = a.resultados.filter(r=>!(Math.abs(Number(r.diff)||0)>0.005));
          return `<h3>Con diferencia (${dif.length})</h3>
          ${dif.length?`<table><tr><th>Artículo</th><th>Teórico</th><th>Físico</th><th>Dif.</th></tr>${dif.map(fila).join('')}</table>`:'<p class="hint">Todo cuadra. 🎉</p>'}
          <details style="margin-top:10px"><summary class="hint">Ver los ${ok.length} artículo(s) que cuadran</summary>
          <table><tr><th>Artículo</th><th>Teórico</th><th>Físico</th><th>Dif.</th></tr>${ok.map(fila).join('')}</table></details>`; })()}
        ${a.piezasContadas&&a.piezasContadas.length?`<h3 style="margin-top:12px">✂️ Piezas cortadas contadas</h3>
        <table><tr><th>Material</th><th>Pieza</th><th>Cant.</th></tr>
        ${a.piezasContadas.map(p=>`<tr><td>${p.grupo}</td><td>${p.pieza}<div class="tag">${p.dim}</div></td><td>${fmtNum(p.cantidad)}</td></tr>`).join('')}
        </table>`:''}
        ${a.armadosContados&&a.armadosContados.length?`<h3 style="margin-top:12px">📦 Armados contados</h3>
        <table><tr><th>Descripción</th><th>Cant.</th></tr>
        ${a.armadosContados.map(x=>`<tr><td>${x.descripcion}</td><td>${fmtNum(x.cantidad)}</td></tr>`).join('')}
        </table>`:''}
        ${(a.correderas||[]).map(b=>`<p class="hint">${b.etiqueta}: total <strong>${fmtNum(b.totalJuegos!==undefined?b.totalJuegos:b.pares)} juego(s)</strong> (${fmtNum(b.hembras)} hembra(s) + ${fmtNum(b.machos)} macho(s)${b.juegosSueltos?` + ${fmtNum(b.juegosSueltos)} sueltos`:''})${b.hembrasSinPareja?` · <span class="neg">${fmtNum(b.hembrasSinPareja)} hembra(s) sin macho</span>`:''}${b.machosSinPareja?` · <span class="neg">${fmtNum(b.machosSinPareja)} macho(s) sin hembra</span>`:''}</p>`).join('')}
      </div>
    </div>`).join('');
}

// ===== Reporte de auditoría en PDF (confirmado por el usuario) =====
// Todos los artículos (aunque estén en cero): lo que el inventario dice que hay (teórico, el stock
// final del momento de la auditoría) contra lo que se contó (físico), y la diferencia (+ sobra, − falta).
async function reporteAuditoriaUI(id){
  const a = auditorias.find(x=>x.id===id);
  if(!a) return;
  try{ await generarReporteAuditoriaPDF(a); }catch(e){ alert('No se pudo generar el reporte: '+e.message); }
}
async function generarReporteAuditoriaPDF(a){
  if(!(window.jspdf && window.jspdf.jsPDF)) throw new Error('No se pudo cargar el generador de PDF. Revisa tu conexión a internet.');
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const marginL = 14, pageH = doc.internal.pageSize.getHeight(), W = 182;
  const fecha = new Date(a.fecha);
  const fechaStr = fecha.toLocaleDateString('es-MX',{year:'numeric',month:'long',day:'numeric'})+', '+fecha.toLocaleTimeString('es-MX');
  const res = (a.resultados||[]).map(r=>{ const it = CATALOGO.find(i=>i.id===r.itemId); return {...r, cat: r.cat || (it?it.cat:'Otros'), unidad: r.unidad || (it?it.unidad:'')}; });
  const conDif = res.filter(r=>Math.abs(Number(r.diff)||0)>0.005);
  const faltan = conDif.filter(r=>r.diff<0).length, sobran = conDif.filter(r=>r.diff>0).length;
  let y = 15, cols = [];
  const colX = i => { let x=marginL; for(let k=0;k<i;k++) x+=cols[k].w; return x; };
  const tw = () => cols.reduce((s,c)=>s+c.w,0);
  const sgn = v => (v>0?'+':'')+fmtNum(v);
  function header(){
    doc.setFillColor(62,92,222); doc.setTextColor(255,255,255); doc.rect(marginL, y, tw(), 6, 'F');
    doc.setFontSize(8); doc.setFont(undefined,'bold');
    cols.forEach((c,i)=>doc.text(c.label, colX(i)+1.5, y+4.2));
    doc.setFont(undefined,'normal'); doc.setTextColor(0,0,0); y += 6;
  }
  doc.setFontSize(14); doc.text('Closets Vera · Reporte de Auditoría', marginL, y); y+=7;
  doc.setFontSize(10);
  doc.text(`Módulo: ${a.modulo}`, marginL, y); y+=5;
  doc.text(`Fecha de la auditoría: ${fechaStr}`, marginL, y); y+=5;
  doc.text(`Auditor: ${a.auditor||'—'} · Tipo: ${etiquetaTipoAud(a.tipo)} · ${a.aplicada?'Aplicada al inventario':'Todavía NO aplicada al inventario'}`, marginL, y); y+=7;
  // Resumen
  doc.setFillColor(238,242,255); doc.rect(marginL, y, W, 17, 'F');
  doc.setFontSize(10); doc.setFont(undefined,'bold');
  doc.text(`${res.length} artículo(s) revisados · ${conDif.length} con diferencia`, marginL+2, y+6);
  doc.setFont(undefined,'normal'); doc.setFontSize(9);
  doc.text(`Faltan: ${faltan} artículo(s) · Sobran: ${sobran} artículo(s) · Cuadran: ${res.length-conDif.length}`, marginL+2, y+11.5);
  doc.text('Teórico = lo que decía el inventario ese día. Diferencia = Físico - Teórico (- falta, + sobra). En hojas: T = teórico, F = físico.', marginL+2, y+15.5);
  y += 23;

  const cats = [...new Set(CATALOGO.map(i=>i.cat))].filter(c=>res.some(r=>r.cat===c));
  if(res.some(r=>!cats.includes(r.cat))) cats.push(...new Set(res.filter(r=>!cats.includes(r.cat)).map(r=>r.cat)));
  cats.forEach(cat=>{
    const filas = res.filter(r=>r.cat===cat);
    const hoja = filas.some(r=>r.teoricoCompletas!==undefined);
    cols = hoja
      ? [{label:'Artículo',w:42},{label:'Completas T',w:20},{label:'Completas F',w:20},{label:'Cortado T',w:18},{label:'Cortado F',w:18},{label:'Total T',w:18},{label:'Total F',w:18},{label:'Diferencia',w:28}]
      : [{label:'Artículo',w:92},{label:'Teórico',w:30},{label:'Físico',w:30},{label:'Diferencia',w:30}];
    if(y > pageH-30){ doc.addPage(); y=15; }
    doc.setFontSize(11); doc.setFont(undefined,'bold'); doc.text(cat, marginL, y+4); doc.setFont(undefined,'normal'); y+=7;
    header(); doc.setFontSize(8);
    filas.forEach((r,idx)=>{
      if(y > pageH-15){ doc.addPage(); y=15; header(); doc.setFontSize(8); }
      const d = Number(r.diff)||0;
      if(Math.abs(d)>0.005){ doc.setFillColor(d<0?253:232, d<0?236:247, d<0?236:238); doc.rect(marginL, y, tw(), 5, 'F'); }
      else if(idx%2===1){ doc.setFillColor(244,246,251); doc.rect(marginL, y, tw(), 5, 'F'); }
      let nom = r.nombre + (r.capturado===false && Math.abs(Number(r.teorico))>0.005 ? ' (no contado)' : '');
      const maxLen = hoja ? 24 : 55; if(nom.length>maxLen) nom = nom.slice(0,maxLen-2)+'…';
      const lados = r.teoricoCompletas!==undefined;
      const vals = hoja
        ? [nom, lados?fmtNum(r.teoricoCompletas):'', lados?fmtNum(r.fisicoCompletas):'', lados?fmtNum(r.teoricoCortado):'', lados?fmtNum(r.fisicoCortado):'', fmtNum(r.teorico), fmtNum(r.fisico), sgn(d)]
        : [nom, fmtNum(r.teorico), fmtNum(r.fisico), sgn(d)];
      const colDif = hoja ? 7 : 3;
      vals.forEach((v,i)=>{
        const esDif = i===colDif && typeof v==='string' && v!=='' && v!=='0';
        if(hoja && lados && (i===2 || i===4)){ const t=Number(i===2?r.teoricoCompletas:r.teoricoCortado), fv=Number(i===2?r.fisicoCompletas:r.fisicoCortado); if(Math.abs(fv-t)>0.005) doc.setFont(undefined,'bold'); }
        if(esDif) doc.setTextColor(v.startsWith('-')?200:31, v.startsWith('-')?40:130, v.startsWith('-')?40:70);
        doc.text(String(v), colX(i)+1.5, y+3.6);
        doc.setTextColor(0,0,0); doc.setFont(undefined,'normal');
      });
      y += 5;
    });
    y += 6;
  });

  // Correderas (juegos y desfasadas)
  if(a.correderas && a.correderas.length){
    if(y > pageH-40){ doc.addPage(); y=15; }
    doc.setFontSize(11); doc.setFont(undefined,'bold'); doc.text('Correderas', marginL, y+4); doc.setFont(undefined,'normal'); y+=7;
    cols = [{label:'Tipo',w:62},{label:'Juegos totales',w:40},{label:'Hembras sin macho',w:40},{label:'Machos sin hembra',w:40}];
    header(); doc.setFontSize(9);
    a.correderas.forEach(b=>{ [b.etiqueta, fmtNum(b.totalJuegos!==undefined?b.totalJuegos:b.pares), fmtNum(b.hembrasSinPareja), fmtNum(b.machosSinPareja)].forEach((v,i)=>doc.text(String(v), colX(i)+1.5, y+4)); y+=5.5; });
    y += 6;
  }
  // Reconteos de verificación
  if((a.reconteos||[]).length){
    if(y > pageH-40){ doc.addPage(); y=15; }
    doc.setFontSize(11); doc.setFont(undefined,'bold'); doc.text('Reconteos de verificación', marginL, y+4); doc.setFont(undefined,'normal'); y+=8; doc.setFontSize(9);
    a.reconteos.forEach(rc=>{
      if(y > pageH-20){ doc.addPage(); y=15; }
      doc.setFont(undefined,'bold'); doc.text(`${rc.cat} · ${new Date(rc.fecha).toLocaleString('es-MX')} · ${rc.ok?'Coincidió con la auditoría':'No coincidió'}${rc.corrigio?' · auditoría corregida':''}`, marginL+2, y); doc.setFont(undefined,'normal'); y+=5;
      (rc.filas||[]).forEach(f=>{ if(y > pageH-12){ doc.addPage(); y=15; } doc.text(`• ${f.nombre}: auditoría ${fmtNum(f.fisAud)} · movimientos ${sgn(Number(f.mov)||0)} · debería ${fmtNum(f.esperado)} · reconteo ${fmtNum(f.reconteo)} · dif. ${sgn(Number(f.dif)||0)}`, marginL+4, y); y+=5; });
      y+=2;
    });
    y += 4;
  }
  // Detalle de lo que se contó en piezas y armados
  const detalle = [...(a.piezasContadas||[]).map(p=>`${fmtNum(p.cantidad)} × ${p.pieza} (${p.grupo})`), ...(a.armadosContados||[]).map(x=>`${fmtNum(x.cantidad)} × ${x.descripcion}`)];
  if(detalle.length){
    if(y > pageH-30){ doc.addPage(); y=15; }
    doc.setFontSize(11); doc.setFont(undefined,'bold'); doc.text('Piezas cortadas y armados contados', marginL, y+4); doc.setFont(undefined,'normal'); y+=8;
    doc.setFontSize(9);
    detalle.forEach(t=>{ if(y > pageH-12){ doc.addPage(); y=15; } doc.text('• '+(t.length>100?t.slice(0,98)+'…':t), marginL+2, y); y+=5; });
  }

  const filename = `auditoria-${String(a.modulo).replace(/\s+/g,'_')}-${a.fecha.slice(0,10)}.pdf`;
  const blob = doc.output('blob');
  if(navigator.canShare && navigator.canShare({ files:[new File([blob], filename, {type:'application/pdf'})] })){
    try{ await navigator.share({ files:[new File([blob], filename, {type:'application/pdf'})], title:'Reporte de auditoría', text:`Reporte de auditoría · ${a.modulo} · ${fechaStr}` }); return; }catch(e){}
  }
  doc.save(filename);
}

// ===== Borrar una auditoría (solo Dirección, pide el PIN de administrador) =====
// Si la auditoría ya se aplicó al inventario, también se deshacen sus ajustes y se quitan los
// faltantes (deuda) que generó, para que el inventario quede como si nunca se hubiera aplicado.
async function borrarAuditoria(id){
  if(!esAdmin()) return alert('Solo Dirección puede borrar una auditoría.');
  const a = auditorias.find(x=>x.id===id); if(!a) return;
  const fechaTxt = new Date(a.fecha).toLocaleString('es-MX');
  const ajustes = movs.filter(m=>m.tipo==='ajuste' && m.auditoriaId===id);
  const deudasDe = deudas.filter(d=>d.auditoriaId===id);
  const extra = a.aplicada
    ? `\n\n⚠️ Esta auditoría YA SE APLICÓ al inventario. Al borrarla también se deshacen sus ${ajustes.length} ajuste(s) y se quitan sus ${deudasDe.length} faltante(s) de la deuda.`
    : '';
  if(!confirm(`¿Borrar la auditoría del ${fechaTxt} (${a.auditor||'sin nombre'})?${extra}\n\nNo se puede deshacer.`)) return;
  const pin = prompt('Escribe el PIN de administrador para confirmar:');
  if(pin===null) return;
  if(pin !== await getPinCero()) return alert('PIN incorrecto. No se borró nada.');
  try{
    for(const m of ajustes) await db.collection('movimientos').doc(m.id).delete();
    for(const d of deudasDe) await db.collection('deudasAuditoria').doc(d.id).delete();
    await db.collection('auditorias').doc(id).delete();
    // Refresca la vista de inmediato (sin esperar a la sincronización)
    auditorias = auditorias.filter(x=>x.id!==id);
    deudas = deudas.filter(d=>d.auditoriaId!==id);
    movs = movs.filter(m=>!(m.tipo==='ajuste' && m.auditoriaId===id));
    toast('🗑️ Auditoría borrada.'+(ajustes.length?'<br><small>También se deshicieron sus ajustes al inventario.</small>':''));
    renderHist();
  }catch(e){ alert('Error al borrar: '+e.message); }
}

// ===== Aplicar auditoría al inventario (solo Dirección) =====
// Deja el inventario igual a lo contado registrando movimientos "ajuste" (con rastro) y guarda
// cada FALTANTE como deuda en 'deudasAuditoria', para no perderlo aunque el stock se corrija.
// Los ajustes llevan la fecha de la auditoría, así lo que se movió después sigue contando.
function calcularAjustesAuditoria(a, ajustarCortado){
  const ajustes = [], faltantes = [];
  (a.resultados||[]).forEach(r=>{
    const it = CATALOGO.find(i=>i.id===r.itemId); if(!it) return;
    if(esHoja(it) && r.teoricoCompletas!==undefined){
      const dC = Number(r.diffCompletas)||0;
      const dK = ajustarCortado ? (Number(r.diffCortado)||0) : 0;
      if(dC||dK) ajustes.push({it, completasDelta:dC, cortadoDelta:dK, total:fmtNum(dC+dK), limpiarDeuda:ajustarCortado && !r.cortadoNoContado});
      else if(ajustarCortado && !r.cortadoNoContado && calcFormula(it.id).autoCortes>0) ajustes.push({it, completasDelta:0, cortadoDelta:0, total:0, limpiarDeuda:true}); // solo para quitar hojas "sin corte" pendientes
      if(dC<0) faltantes.push({it, lado:'completas', cantidad:fmtNum(-dC)});
      if(dK<0) faltantes.push({it, lado:'cortado', cantidad:fmtNum(-dK)});
    } else {
      const d = Number(r.diff)||0;
      if(d) ajustes.push({it, completasDelta:d, cortadoDelta:0, total:fmtNum(d)});
      if(d<0) faltantes.push({it, lado: esHoja(it)?'completas':null, cantidad:fmtNum(-d)});
    }
  });
  return {ajustes, faltantes};
}
async function aplicarAuditoriaUI(id){
  const a = auditorias.find(x=>x.id===id);
  if(!a) return;
  await aplicarAuditoria(id, a);
}
async function aplicarAuditoria(id, a){
  if(!esAdmin()) return alert('Solo Dirección puede aplicar una auditoría al inventario.');
  if(a.aplicada) return alert('Esta auditoría ya se aplicó.');
  // Resguardo: si no se contó nada de material cortado, preguntar antes de dejar el cortado en lo "contado" (0).
  const hayHojaConCortado = (a.resultados||[]).some(r=>r.teoricoCompletas!==undefined && Number(r.teoricoCortado)>0);
  const contoCortado = (a.piezasContadas&&a.piezasContadas.length) || (a.armadosContados&&a.armadosContados.length);
  let ajustarCortado = true;
  if(hayHojaConCortado && !contoCortado && a.tipo!=='parcial'){
    ajustarCortado = confirm('Esta auditoría NO contó piezas cortadas ni armados, pero el inventario dice que sí hay material cortado.\n\nAceptar = ajustar también el cortado (quedará en 0 y lo que había se va a deuda).\nCancelar = ajustar SOLO las hojas completas y dejar el cortado como está.');
  }
  const {ajustes, faltantes} = calcularAjustesAuditoria(a, ajustarCortado);
  const reales = ajustes.filter(x=>x.total || x.completasDelta || x.cortadoDelta);
  const resumen = reales.slice(0,12).map(x=>`• ${x.it.nombre}: ${x.total>0?'+':''}${fmtNum(x.total)}${(x.completasDelta&&x.cortadoDelta)?` (compl. ${fmtNum(x.completasDelta)}, cort. ${fmtNum(x.cortadoDelta)})`:(x.cortadoDelta?' (cortado)':'')}`).join('\n') + (reales.length>12?`\n… y ${reales.length-12} más`:'');
  if(!confirm(`Aplicar auditoría del ${new Date(a.fecha).toLocaleString()} al inventario de ${a.modulo}:\n\n${reales.length? resumen : 'No hay diferencias que ajustar.'}\n\n${faltantes.length} faltante(s) se guardarán como DEUDA.\n\n¿Continuar?`)) return;
  const creadoPor = getCurrentUserEmail?getCurrentUserEmail():'';
  const fechaAjuste = new Date(new Date(a.fecha).getTime()+1).toISOString();
  const fechaStr = new Date(a.fecha).toLocaleDateString('es-MX');
  try{
    for(const x of ajustes){
      await db.collection('movimientos').doc(cryptoId()).set({modulo:a.modulo, itemId:x.it.id, itemNombre:x.it.nombre, tipo:'ajuste',
        cantidad:x.total, completasDelta:fmtNum(x.completasDelta), cortadoDelta:fmtNum(x.cortadoDelta), limpiarDeuda:!!x.limpiarDeuda,
        nota:`Ajuste por auditoría del ${fechaStr} (${a.auditor})`, fecha:fechaAjuste, estado:'aprobado', auditoriaId:id, creadoPor});
    }
    for(const f of faltantes){
      await db.collection('deudasAuditoria').doc(cryptoId()).set({modulo:a.modulo, auditoriaId:id, fechaAuditoria:a.fecha, auditor:a.auditor,
        itemId:f.it.id, itemNombre:f.it.nombre, unidad:f.it.unidad, lado:f.lado, cantidad:f.cantidad, estado:'pendiente', creadoPor, creado:new Date().toISOString()});
    }
    await db.collection('auditorias').doc(id).update({aplicada:true, fechaAplicada:new Date().toISOString(), aplicadaPor:creadoPor, deudasCreadas:faltantes.length, ajustoCortado:ajustarCortado});
    alert(`Auditoría aplicada. ${reales.length} ajuste(s) al inventario${faltantes.length?` y ${faltantes.length} faltante(s) guardados como deuda`:''}.`);
    renderHist();
  }catch(e){ alert('Error al aplicar: '+e.message); }
}

// ===== Deuda por faltantes de auditoría =====
function etiquetaLado(l){ return l==='cortado' ? 'Cortado/armado' : (l==='completas' ? 'Hojas completas' : '—'); }
function renderDeudasHtml(){
  const pend = deudas.filter(d=>d.estado!=='saldada');
  const sald = deudas.filter(d=>d.estado==='saldada');
  // Totales pendientes por artículo + lado
  const tot = {};
  pend.forEach(d=>{ const k=d.itemNombre+'||'+(d.lado||''); const it=CATALOGO.find(i=>i.id===d.itemId);
    tot[k]=tot[k]||{nombre:d.itemNombre, lado:d.lado, unidad:d.unidad, cat:it?it.cat:'Otros', cantidad:0}; tot[k].cantidad+=Number(d.cantidad)||0; });
  const secciones = [...new Set(CATALOGO.map(i=>i.cat).concat(['Otros']))].filter(c=>Object.values(tot).some(t=>t.cat===c));
  const filas = (lista, conBoton) => lista.map(d=>`<tr>
      <td>${d.itemNombre}<div class="tag">${etiquetaLado(d.lado)}</div></td>
      <td class="neg"><strong>${fmtNum(d.cantidad)}</strong> ${d.unidad||''}</td>
      <td>${new Date(d.fechaAuditoria).toLocaleDateString('es-MX')}<div class="hint" style="margin:2px 0 0">${d.auditor||''}</div></td>
      <td>${conBoton && esAdmin() ? `<button class="btn small" onclick="saldarDeuda('${d.id}')">Saldar</button><button class="btn small" style="margin-top:6px;background:linear-gradient(135deg,#1f9d55,#178045)" onclick="saldarDeuda('${d.id}',true)">📥 Apareció: sumar</button>` : (d.estado==='saldada' ? `<div class="hint" style="margin:0">${d.notaSaldo||'Saldada'}<br>${d.fechaSaldo?new Date(d.fechaSaldo).toLocaleDateString('es-MX'):''}</div>` : '')}</td>
    </tr>`).join('');
  return `<div class="card">
      <strong>Faltantes de auditoría (deuda) · ${modulo()}</strong>
      <p class="hint">Cuando una auditoría se aplica, el inventario queda igual a lo contado, pero lo que faltó se guarda aquí para darle seguimiento (a quién se cobra, si apareció, etc.). <strong>Saldar</strong> solo la cierra (sin sumar material). Si el material <strong>apareció</strong>, usa <strong>📥 Apareció: sumar</strong>: regresa al inventario (al mismo lado del que faltó) y cierra la deuda.</p>
    </div>
    ${secciones.length ? secciones.map(cat=>`<div class="card"><h3>${cat} · pendiente</h3>
      <div class="wrap-x"><table><tr><th>Artículo</th><th>Lado</th><th>Total pendiente</th></tr>
        ${Object.values(tot).filter(t=>t.cat===cat).map(t=>`<tr><td>${t.nombre}</td><td>${etiquetaLado(t.lado)}</td><td class="neg"><strong>${fmtNum(t.cantidad)}</strong> ${t.unidad||''}</td></tr>`).join('')}
      </table></div></div>`).join('') : '<div class="card"><p class="hint" style="margin:0">No hay deuda pendiente. 🎉</p></div>'}
    ${pend.length?`<div class="card"><h3>Detalle pendiente (${pend.length})</h3><div class="wrap-x"><table><tr><th>Artículo</th><th>Faltó</th><th>Auditoría</th><th></th></tr>${filas(pend,true)}</table></div></div>`:''}
    ${sald.length?`<div class="card"><h3>Saldadas (${sald.length})</h3><div class="wrap-x"><table><tr><th>Artículo</th><th>Faltó</th><th>Auditoría</th><th>Cierre</th></tr>${filas(sald,false)}</table></div></div>`:''}`;
}
async function saldarDeuda(id, sumar){
  if(!esAdmin()) return alert('Solo Dirección puede saldar una deuda.');
  const d = deudas.find(x=>x.id===id); if(!d) return;
  if(sumar){
    // Confirmado por el usuario: el material faltante apareció → se suma al inventario en el MISMO lado
    // del que faltó (hojas completas o cortado) y la deuda se cierra, sin cargarle nada al coordinador.
    const it = CATALOGO.find(i=>i.id===d.itemId); if(!it) return alert('No se encontró el artículo.');
    const nota = prompt(`📥 Apareció el material:\n\n+ ${fmtNum(d.cantidad)} ${d.unidad||''} de ${d.itemNombre}${esHoja(it)?' ('+etiquetaLado(d.lado)+')':''} vuelve al inventario y la deuda se cierra.\n\n¿Dónde apareció? (opcional)`, '');
    if(nota===null) return;
    try{
      const q = Number(d.cantidad)||0, hoja = esHoja(it), corto = d.lado==='cortado';
      await db.collection('movimientos').doc(cryptoId()).set({modulo:d.modulo||modulo(), itemId:it.id, itemNombre:it.nombre, tipo:'ajuste', motivo:'deudaAparecio', cantidad:q,
        ...(hoja?{completasDelta:corto?0:q, cortadoDelta:corto?q:0}:{}), nota:`Apareció material faltante de la auditoría del ${new Date(d.fechaAuditoria||d.creado).toLocaleDateString('es-MX')}`+(nota.trim()?' · '+nota.trim():''),
        fecha:new Date().toISOString(), estado:'aprobado', deudaId:id, creadoPor:getCurrentUserEmail?getCurrentUserEmail():''});
      await db.collection('deudasAuditoria').doc(id).update({estado:'saldada', notaSaldo:'Apareció el material (se sumó al inventario)'+(nota.trim()?' · '+nota.trim():''), fechaSaldo:new Date().toISOString(), saldadaPor:getCurrentUserEmail?getCurrentUserEmail():'', sumadoAlInventario:true});
      toast('📥 Material sumado al inventario y deuda cerrada.');
    }catch(e){ alert('Error: '+e.message); }
    return;
  }
  const nota = prompt(`Saldar deuda: ${fmtNum(d.cantidad)} ${d.unidad||''} de ${d.itemNombre} (${etiquetaLado(d.lado)}).\n\n¿Cómo se saldó? (ej. "Se descontó al responsable", "Apareció el material", "Se autorizó como merma")`, '');
  if(nota===null) return;
  try{
    await db.collection('deudasAuditoria').doc(id).update({estado:'saldada', notaSaldo:nota.trim()||'Saldada', fechaSaldo:new Date().toISOString(), saldadaPor:getCurrentUserEmail?getCurrentUserEmail():''});
  }catch(e){ alert('Error: '+e.message); }
}

// Fila extra en el historial de auditorías para hojas: completas y cortado por separado.
function detalleLadosHtml(r){
  if(r.teoricoCompletas===undefined) return '';
  const d = v => `<span class="${v?'neg':'pos'}">${v>0?'+':''}${fmtNum(v)}</span>`;
  return `<tr><td colspan="4" class="hint" style="padding-top:0">
    Completas: teórico ${fmtNum(r.teoricoCompletas)} · contado ${fmtNum(r.fisicoCompletas)} · dif. ${d(r.diffCompletas)}<br>
    Cortado/armado: teórico ${fmtNum(r.teoricoCortado)} · contado ${fmtNum(r.fisicoCortado)} · dif. ${d(r.diffCortado)}${r.diffCortado<0?' (desperdicio o piezas faltantes)':''}
  </td></tr>`;
}
function toggleAud(id){ const el=document.getElementById('ad-'+id); el.style.display = el.style.display==='none'?'block':'none'; }

const FAMILIAS_CAT = {
  'Lateral (4 modelos)': ['Lateral Sencillo','Lateral 3 Cajones','Lateral 5 Cajones','Lateral Espejo'],
  'Central (4 modelos)': ['Central Sencillo','Central 3 Cajones','Central 5 Cajones','Central Espejo'],
  'Doble (8 modelos)': ['Doble Sencillo','Doble 3 Cajones','Doble 5 Cajones','Doble 6 Cajones','Doble 10 Cajones','Doble Espejo','Doble 3 Cajones con Espejo','Doble 5 Cajones con Espejo'],
  'Doble Especial (9 modelos, disponible a 3 mts)': ['Doble Especial Sencillo','Doble Especial 3 Cajones','Doble Especial 5 Cajones','Doble Especial 6 Cajones','Doble Especial 10 Cajones','Doble Especial con Espejo','Doble Especial 3 Cajones y Espejo','Doble Especial 5 Cajones y Espejo','Doble Especial con Dos Espejos'],
  'Triple (15 modelos)': ['Triple Sencillo','Triple 3 Cajones','Triple 5 Cajones','Triple 6 Cajones','Triple 8 Cajones','Triple 10 Cajones','Triple Espejo','Triple 3 Cajones con Espejo','Triple 5 Cajones con Espejo','Triple 6 Cajones con Espejo','Triple 8 Cajones con Espejo','Triple 10 Cajones con Espejo','Triple 2 Espejos','Triple 2 Espejos + 3 Cajones','Triple 2 Espejos + 5 Cajones'],
  'King (8 modelos, nombres del recetario — el total exacto de 8 vs. los 9 nombres mencionados aún no se confirma)': ['King Sencillo','King 3 Cajones','King 5 Cajones','King 6 Cajones','King 10 Cajones','King Espejo','King 3 Cajones con Espejo','King 5 Cajones con Espejo','King 2 Espejos']
};
// Tabla de modelos: nombre exacto -> familia/cajones/espejos, para elegir por modelo (no por combinación suelta)
const MODELOS = [
  {nombre:'Lateral Sencillo', fam:'Lateral', cajones:0, espejos:0},
  {nombre:'Lateral 3 Cajones', fam:'Lateral', cajones:3, espejos:0},
  {nombre:'Lateral 5 Cajones', fam:'Lateral', cajones:5, espejos:0},
  {nombre:'Lateral Espejo', fam:'Lateral', cajones:0, espejos:1},
  {nombre:'Central Sencillo', fam:'Central', cajones:0, espejos:0},
  {nombre:'Central 3 Cajones', fam:'Central', cajones:3, espejos:0},
  {nombre:'Central 5 Cajones', fam:'Central', cajones:5, espejos:0},
  {nombre:'Central Espejo', fam:'Central', cajones:0, espejos:1},
  {nombre:'Doble Sencillo', fam:'Doble', cajones:0, espejos:0},
  {nombre:'Doble 3 Cajones', fam:'Doble', cajones:3, espejos:0},
  {nombre:'Doble 5 Cajones', fam:'Doble', cajones:5, espejos:0},
  {nombre:'Doble 6 Cajones', fam:'Doble', cajones:6, espejos:0},
  {nombre:'Doble 10 Cajones', fam:'Doble', cajones:10, espejos:0},
  {nombre:'Doble Espejo', fam:'Doble', cajones:0, espejos:1},
  {nombre:'Doble 3 Cajones con Espejo', fam:'Doble', cajones:3, espejos:1},
  {nombre:'Doble 5 Cajones con Espejo', fam:'Doble', cajones:5, espejos:1},
  {nombre:'Doble Especial Sencillo', fam:'Doble Especial', cajones:0, espejos:0, especial3mDisponible:true, nota:'Misma estructura que Doble; solo cambia en herrajes (4 tubos/4 bridas en vez de 2/2)'},
  {nombre:'Doble Especial 3 Cajones', fam:'Doble Especial', cajones:3, espejos:0, especial3mDisponible:true},
  {nombre:'Doble Especial 5 Cajones', fam:'Doble Especial', cajones:5, espejos:0, especial3mDisponible:true},
  {nombre:'Doble Especial 6 Cajones', fam:'Doble Especial', cajones:6, espejos:0, especial3mDisponible:true},
  {nombre:'Doble Especial 10 Cajones', fam:'Doble Especial', cajones:10, espejos:0, especial3mDisponible:true},
  {nombre:'Doble Especial con Espejo', fam:'Doble Especial', cajones:0, espejos:1, especial3mDisponible:true},
  {nombre:'Doble Especial 3 Cajones y Espejo', fam:'Doble Especial', cajones:3, espejos:1, especial3mDisponible:true},
  {nombre:'Doble Especial 5 Cajones y Espejo', fam:'Doble Especial', cajones:5, espejos:1, especial3mDisponible:true},
  {nombre:'Doble Especial con Dos Espejos', fam:'Doble Especial', cajones:0, espejos:2, especial3mDisponible:true},
  {nombre:'Triple Sencillo', fam:'Triple', cajones:0, espejos:0},
  {nombre:'Triple 3 Cajones', fam:'Triple', cajones:3, espejos:0},
  {nombre:'Triple 5 Cajones', fam:'Triple', cajones:5, espejos:0},
  {nombre:'Triple 6 Cajones', fam:'Triple', cajones:6, espejos:0},
  {nombre:'Triple 8 Cajones', fam:'Triple', cajones:8, espejos:0},
  {nombre:'Triple 10 Cajones', fam:'Triple', cajones:10, espejos:0},
  {nombre:'Triple Espejo', fam:'Triple', cajones:0, espejos:1},
  {nombre:'Triple 3 Cajones con Espejo', fam:'Triple', cajones:3, espejos:1},
  {nombre:'Triple 5 Cajones con Espejo', fam:'Triple', cajones:5, espejos:1},
  {nombre:'Triple 6 Cajones con Espejo', fam:'Triple', cajones:6, espejos:1},
  {nombre:'Triple 8 Cajones con Espejo', fam:'Triple', cajones:8, espejos:1},
  {nombre:'Triple 10 Cajones con Espejo', fam:'Triple', cajones:10, espejos:1},
  {nombre:'Triple 2 Espejos', fam:'Triple', cajones:0, espejos:2},
  {nombre:'Triple 2 Espejos + 3 Cajones', fam:'Triple', cajones:3, espejos:2},
  {nombre:'Triple 2 Espejos + 5 Cajones', fam:'Triple', cajones:5, espejos:2},
  {nombre:'King Sencillo', fam:'King', cajones:0, espejos:0, maxDisponible:true},
  {nombre:'King 3 Cajones', fam:'King', cajones:3, espejos:0, maxDisponible:true},
  {nombre:'King 5 Cajones', fam:'King', cajones:5, espejos:0, maxDisponible:true},
  {nombre:'King 6 Cajones', fam:'King', cajones:6, espejos:0, maxDisponible:true},
  {nombre:'King 10 Cajones', fam:'King', cajones:10, espejos:0, maxDisponible:true},
  {nombre:'King Espejo', fam:'King', cajones:0, espejos:1, maxDisponible:true},
  {nombre:'King 3 Cajones con Espejo', fam:'King', cajones:3, espejos:1, maxDisponible:true},
  {nombre:'King 5 Cajones con Espejo', fam:'King', cajones:5, espejos:1, maxDisponible:true},
  {nombre:'King 2 Espejos', fam:'King', cajones:0, espejos:2, maxDisponible:true},
];
// Confirmado por el usuario: los modelos Max existen para todas las familias (todo el modelo se
// vuelve Max), también los de espejo (existe el espejo Max).
MODELOS.forEach(m=>{ m.maxDisponible = true; });
function modeloOptionsHtml(){
  const porFam = {};
  MODELOS.forEach(m=>{ (porFam[m.fam]=porFam[m.fam]||[]).push(m); });
  return Object.keys(porFam).map(fam=>
    `<optgroup label="${fam}">${porFam[fam].map(m=>`<option value="${m.nombre}">${m.nombre}</option>`).join('')}</optgroup>`
  ).join('');
}

function renderCat(){
  let html = `<div class="card"><strong>Catálogo de familias y modelos</strong>
    <p class="hint">Modelos confirmados en 5 familias. Usa "Despiece" o "Instalaciones" y elige el modelo por su nombre exacto para calcular sus piezas.</p></div>`;
  Object.keys(FAMILIAS_CAT).forEach(fam=>{
    html += `<div class="card"><h3>${fam}</h3><p class="hint" style="margin:0">${FAMILIAS_CAT[fam].join(' · ')}</p></div>`;
  });
  $('#main').innerHTML = html;
}

const MEL_COLORES = ['Blanco','Cenizo','Beige','Durango','Gris','Lino','Bco Mármol','Neg Mármol','Monarca','Negro','Nogal','Polar','Rioja','Roble','Roble Santana','Choco'];

// ===== Cajonera Max / Entrepañera Max (confirmado por el usuario) =====
// "La cajonera Max puede tener todas las variantes de los modelos al ser modelo Max, todo el
// modelo se vuelve Max; no puede ser una cajonera Max y una entrepañera normal." Por eso, cuando
// maxOn está activo, TODOS los muebles (cajonera y entrepañera) de ese modelo usan estas piezas
// en vez de las normales. Cada unidad (1 cajonera Max o 1 entrepañera Max) sale de 1 hoja de
// melamina de 15mm — artículo de inventario todavía sin definir (ver nota 'pendiente' abajo).
function piezasCajoneraMax(add, colorCaj, unidades){
  add('Pared Max', 2*unidades, '40×185 cm', colorCaj, 'ok', 'Cajonera Max (confirmado por el usuario)');
  add('Entrepaño Max corto', 2*unidades, '27×58 cm', colorCaj, 'ok', 'Cajonera Max');
  add('Entrepaño Max largo', 2*unidades, '40×58 cm', colorCaj, 'ok', 'Cajonera Max');
  add('Respaldo Max', 1*unidades, '20×58 cm', colorCaj, 'ok', 'Cajonera Max');
  add('Zóclo Max', 4*unidades, '12×58 cm', colorCaj, 'ok', 'Cajonera Max: 4 zóclos de 12×58 (confirmado por el usuario; la entrepañera Max lleva 2)');
  add('Fondo de cajonera (MDF 3mm)', unidades, '55×122 cm', '—', 'ok', '1 por cajonera Max (misma regla que cualquier cajonera)');
  add('Melamina (cajonera Max)', unidades, '—', colorCaj, 'ok', 'Confirmado: 1 hoja de melamina por cajonera Max, misma melamina que el resto de los muebles (no es un artículo de catálogo aparte)');
}
function piezasEntrepaneraMax(add, color, unidades){
  add('Pared Max', 2*unidades, '40×185 cm', color, 'ok', 'Entrepañera Max (confirmado por el usuario)');
  add('Entrepaño Max largo', 5*unidades, '40×58 cm', color, 'ok', 'Entrepañera Max');
  add('Zóclo Max', 2*unidades, '12×58 cm', color, 'ok', 'Entrepañera Max');
  add('Melamina (entrepañera Max)', unidades, '—', color, 'ok', 'Confirmado: 1 hoja de melamina por entrepañera Max, misma melamina que el resto de los muebles (no es un artículo de catálogo aparte)');
}
// Piezas de los cajones de una Cajonera Max (confirmado por el usuario): distintas a las de un
// cajón normal. Sin jaladera (los cajones Max no llevan) y siempre con corredera de extensión.
function piezasCajonesMax(add, cajones, color, estructuraColor){
  add('Frente Max', cajones, '60×20 cm', color, 'ok', 'Confirmado: 24 por hoja (mismo rendimiento que el Frente normal)');
  add('Pieza chica de cajón Max', cajones*2, '15×38 cm', estructuraColor, 'ok', 'Rendimiento confirmado: 45 por hoja');
  add('Pieza grande de cajón Max', cajones*2, '15×52.5 cm', estructuraColor, 'ok', 'Rendimiento confirmado: 30 por hoja');
  add('Fondo de cajón (MDF 5mm, Max)', cajones, '55.5×37.9 cm', '—', 'ok', 'Rendimiento confirmado: 12 por hoja de MDF 5mm');
  add('Correderas de extensión', cajones, '—', '—', 'ok', '1 por cajón. Confirmado: todas las cajoneras Max llevan corredera de extensión y no llevan jaladera');
}

// ===== Motor de despiece compartido por Despiece e Instalaciones =====
// Devuelve { piezas:[{nombre,cantidad,dim,colorDestino,estado,nota}], maxNota }
// Actualizado con el recetario confirmado por modelo (paredes/maleteros/cajonera/piezas de cajón/espejos/herrajes).
function buildDespiece(fam, cajones, espejos, color, todoColor, maxOn, colorCajonera, especial3m, correderaExt){
  const estructuraColor = todoColor ? color : 'Blanco';
  // Color de la cajonera: independiente del frente y de "todo un color" (confirmado por el
  // usuario: "la cajonera puede ser de cualquier color y el frente también puede ser de
  // cualquier color"). Si no se especifica, cae en la estructuraColor de siempre.
  // Confirmado por el usuario: "todo de un color" = frente, cajonera, estructura y piezas de cajón
  // del mismo color, aunque en pantalla se haya elegido otro color de cajonera.
  const colorCaj = todoColor ? color : (colorCajonera || estructuraColor);
  const piezas = [];
  const add=(nombre,cantidad,dim,colorDestino,estado,nota)=>piezas.push({nombre,cantidad,dim,colorDestino,estado,nota:nota||''});
  let maxNota = '';
  let mueblesCajonera = 0; // cuántos "muebles" ocupa la cajonera normal (no espejo) — usado también para el fondo de cajonera

  {
    // Base por familia (paredes/maleteros).
    // IMPORTANTE: las paredes de la familia son el TOTAL del mueble (ya incluyen las
    // paredes de cada "mueble" interno — entrepañera, cajonera o espejo, los tres usan 2
    // paredes); NUNCA cambian según qué ocupa cada mueble.
    // Confirmado por el usuario: "Lateral Sencillo = 1 maletero chico (que es una pared) +
    // 2 paredes + 5 entrepaños + 2 zóclos" = 3 paredes en total, con o sin cajones.
    // Nota general (confirmado por el usuario): cuando un modelo es Max, sus paredes ya no
    // salen de aquí — cada cajonera/entrepañera Max aporta sus propias "Pared Max" (ver
    // piezasCajoneraMax/piezasEntrepaneraMax), y sumar también la "Pared" plana de la familia
    // duplicaría el material. Por eso cada bloque de familia condiciona su "Pared" a `!maxOn`.
    if(fam==='Lateral'){
      if(!maxOn) add('Pared',2,'191×40 cm',estructuraColor,'ok','2 paredes de la entrepañera/cajonera base');
      add('Maletero chico',1,'191×40 cm',estructuraColor,'ok','Maletero chico (mide igual que una Pared, 191×40 cm) — con o sin cajones');
    }
    if(fam==='Central'){ if(!maxOn) add('Pared',2,'191×40 cm',estructuraColor,'ok'); add('Maletero grande',1,'40×244 cm',estructuraColor,'ok'); }
    if(fam==='Doble'){ if(!maxOn) add('Pared',4,'191×40 cm',estructuraColor,'ok'); add('Maletero grande',1,'40×244 cm',estructuraColor,'ok'); }
    if(fam==='Doble Especial'){
      if(!maxOn) add('Pared',4,'191×40 cm',estructuraColor,'ok','Confirmado: Doble Especial tiene la misma estructura que Doble; solo cambia en herrajes (4 tubos/4 bridas en vez de 2/2)');
      add('Maletero grande',1,'40×244 cm',estructuraColor,'ok');
      if(especial3m) add('Maletero chico',1,'191×40 cm',estructuraColor,'ok','Variante a 3 metros: se agrega 1 maletero chico extra (una pared), confirmado por el usuario');
    }
    if(fam==='Triple'){ if(!maxOn) add('Pared',6,'191×40 cm',estructuraColor,'ok'); add('Maletero grande',2,'40×244 cm',estructuraColor,'ok'); }
    if(fam==='King'){
      if(!maxOn) add('Pared',4,'191×40 cm',estructuraColor,'ok');
      if(maxOn){
        // Confirmado por el usuario: en Max el maletero chico (191×40) se sustituye por uno
        // normal (244×40); el maletero grande que ya tenía el modelo se queda igual (toda
        // variante Max lleva maleteros grandes). No se duplica ninguno. Las 4 "Pared" del King
        // tampoco se suman aquí: las aportan las 2 unidades de cajonera/entrepañera Max
        // (2 "Pared Max" por unidad = 4 en total), así que sumarlas de las dos formas
        // duplicaría el material — mismo principio que en las combinaciones "por muebles".
        add('Maletero grande',1,'40×244 cm',estructuraColor,'ok','Modelo Max: el maletero chico se cambia por maletero grande (confirmado por el usuario)');
        add('Maletero grande',1,'40×244 cm',estructuraColor,'ok','El maletero grande del King se queda igual en la variante Max (no se sustituye)');
        maxNota = 'King Max: las 4 "Pared" las aportan las 2 unidades de cajonera/entrepañera Max (no se suman aparte). El maletero chico se cambió por maletero grande: quedan 2 maleteros grandes.';
      } else {
        add('Maletero chico',1,'191×40 cm',estructuraColor,'ok','Confirmado: la medida del maletero chico es la misma que una Pared (191×40 cm); se agrupa con las paredes para el cálculo de hojas');
        add('Maletero grande',1,'40×244 cm',estructuraColor,'ok','Confirmado: mismo tamaño que el maletero normal (rendimiento: 3 por hoja)');
      }
    }

    // Confirmado por el usuario: si el modelo lleva muebles Max (cajonera o entrepañera Max), TODO
    // maletero chico (191×40) se cambia por maletero grande (40×244). Ej.: chico + grande → 2 grandes.
    if(maxOn) piezas.forEach(p=>{ if(p.nombre==='Maletero chico'){ p.nombre='Maletero grande'; p.dim='40×244 cm'; p.nota='Modelo Max: el maletero chico se cambia por maletero grande (confirmado por el usuario)'; } });

    // Cargadores 10×40 (confirmado por el usuario): Lateral 1, Doble 0, Doble Especial 1 (2 si es a
    // 3 metros), Triple 1, King 3, Central 2. Van en el color de la estructura y se descuentan
    // proporcional: 69 por hoja con sierra de 5 mm.
    const CARGADORES_FAMILIA = {Lateral:1, Central:2, Doble:0, 'Doble Especial': especial3m ? 2 : 1, Triple:1, King:3};
    if(CARGADORES_FAMILIA[fam]) add('Cargador', CARGADORES_FAMILIA[fam], '10×40 cm', estructuraColor, 'ok', fam==='Doble Especial'&&especial3m ? 'Doble Especial a 3 metros lleva 2 cargadores (confirmado por el usuario)' : 'Cargadores 10×40 del modelo (confirmado por el usuario)');

    // Entrepaños: cada familia se compone de N "muebles" fijos (confirmado por el usuario:
    // Lateral y Central = 1; Doble, King y Doble Especial = 2; Triple = 3). Cada mueble es
    // entrepañera (5 entrepaños), cajonera (los entrepaños de la tabla confirmada, y ocupa
    // 1 mueble si es de 3 o 5 cajones, o 2 muebles si es de 6, 8 o 10 — confirmado: "cajonera
    // de 6/8/10 lleva 4 paredes" = 2 muebles) o espejo (5 entrepaños, mismo aporte que una
    // entrepañera; 1 mueble por espejo — confirmado: "King 3 Cajones con Espejo = una
    // cajonera de 3 + una cajonera de espejo", y esto aplica a todos los modelos). Los muebles
    // que sobran después de asignar cajonera y espejo son entrepañeras normales.
    // Validado contra el único caso con número exacto confirmado ("Doble 5 Cajones con
    // Espejo"): cajonera(5)=4 + espejo(1×5)=5 + 0 restantes = 9 entrepaños, 2 muebles usados
    // de 2 → coincide exactamente.
    const NUM_MUEBLES = {Lateral:1, Central:1, Doble:2, King:2, Triple:3, 'Doble Especial':2};
    const numMuebles = NUM_MUEBLES[fam];
    const CAJONERA_ENTREPANOS = {1:4, 3:5, 5:4, 6:10, 8:9, 10:8};
    const MUEBLES_CAJONERA = {1:1, 3:1, 5:1, 6:2, 8:2, 10:2};

    if(cajones===0 && espejos===0){
      if(maxOn){
        piezasEntrepaneraMax(add, estructuraColor, numMuebles);
      } else {
        const notaBase = fam==='Central'
          ? 'Asumido igual que Lateral (1 mueble = 1 entrepañera); no confirmado explícitamente para Central'
          : numMuebles+' mueble(s) = entrepañera(s) = '+(numMuebles*5)+' entrepaños (confirmado por el usuario)';
        add('Entrepaño', numMuebles*5, '52×40 cm', estructuraColor, 'ok', notaBase);
      }
    } else if(cajones>0 && MUEBLES_CAJONERA[cajones]===undefined){
      add('Entrepaño','Pendiente','—','—','pendiente','La cantidad de entrepaños/muebles que ocupa la cajonera de '+cajones+' cajones no está confirmada; no se inventa');
    } else {
      mueblesCajonera = cajones>0 ? MUEBLES_CAJONERA[cajones] : 0;
      const mueblesUsados = mueblesCajonera + espejos;
      const restantes = numMuebles - mueblesUsados;
      if(restantes < 0){
        add('Entrepaño','Pendiente','—','—','pendiente','La cajonera de '+cajones+' cajones + '+espejos+' espejo(s) ocupan más muebles ('+mueblesUsados+') de los que tiene '+fam+' ('+numMuebles+'); revisar el modelo, no se inventa');
      } else {
        // Confirmado por el usuario: "todo el modelo se vuelve Max" — con maxOn, tanto la(s)
        // cajonera(s) como la(s) entrepañera(s) restante(s) de este modelo usan piezas Max
        // (no se puede mezclar cajonera Max con entrepañera normal en el mismo modelo).
        if(cajones>0){
          if(maxOn) piezasCajoneraMax(add, colorCaj, mueblesCajonera);
          else add('Entrepaño', CAJONERA_ENTREPANOS[cajones], '40×52 cm', colorCaj, 'ok', 'Cajonera de '+cajones+' cajones ('+mueblesCajonera+' mueble(s)). Color de cajonera independiente del frente.');
        }
        if(espejos>0 && maxOn) piezasEspejoMax(add, colorCaj, espejos);
        else if(espejos>0) add('Entrepaño', espejos*5, '52×40 cm', colorCaj, 'ok', espejos+' espejo(s) = '+espejos+' mueble(s) tipo "cajonera de espejo" (5 entrepaños cada uno, confirmado por el usuario)');
        if(restantes>0){
          if(maxOn) piezasEntrepaneraMax(add, estructuraColor, restantes);
          else add('Entrepaño', restantes*5, '52×40 cm', estructuraColor, 'ok', restantes+' mueble(s) restante(s) = entrepañera(s) (confirmado: los muebles no usados por cajonera/espejo son entrepañeras)');
        }
      }
    }
  }

  // Piezas de cajón: confirmadas para cualquier cantidad de cajones (regla general del recetario)
  if(cajones>0){
    if(maxOn){
      // Confirmado por el usuario: la Cajonera Max SIEMPRE lleva 4 cajones por cada mueble/unidad
      // de cajonera Max (medida fija, no depende de si el modelo original era de 3/5/6/8/10
      // cajones). Para King 6/10 Cajones Max (2 muebles), son 4 cajones × 2 muebles = 8 cajones.
      piezasCajonesMax(add, 4*mueblesCajonera, color, estructuraColor);
    } else {
      add('Frente',cajones,'18×54 cm',color,'ok');
      add('Pieza chica de cajón',cajones*2,'33×16.5 cm',estructuraColor,'ok','Medida tomada del despiece confirmado de Doble 5 Cajones (única con medida documentada; aplicada como regla general de pieza de cajón)');
      add('Pieza grande de cajón',cajones*2,'46.4×16.5 cm',estructuraColor,'ok','Medida tomada del despiece confirmado de Doble 5 Cajones (única con medida documentada; aplicada como regla general de pieza de cajón)');
      add('Fondo de cajón (MDF 3mm)',cajones,'49.4×33 cm','—','ok');
      if(correderaExt) add('Correderas de extensión',cajones,'—','—','ok','1 por cajón (sustituye al juego de corredera normal; elegido por el usuario)');
      else add('Juego de corredera',cajones,'—','—','ok','1 por cajón. Cada juego = 2 correderas macho (1 izq + 1 der, van en el cajón) + 2 correderas hembra (1 izq + 1 der, van en la cajonera). Se sigue descontando 1 "Juego de corredera" del catálogo; macho/hembra es informativo, no son artículos separados en inventario');
      add('Jaladera (por cajón)',cajones,'—',color,'ok','1 por cajón');
    }
  }

  // Zóclos: si el modelo lleva cajonera, sus zóclos dependen del color del FRENTE (confirmado
  // por el usuario: "los zóclos dependen del frente del color"), no del color de la cajonera
  // ni de la estructura. Sin cajonera, se quedan con el color de estructura de siempre.
  // Confirmado por el usuario: los zóclos SIEMPRE van del color del frente (también en modelos sin
  // cajones, como el Lateral Sencillo), aunque la estructura sea de otro color.
  const colorZoclo = color;

  // Espejos: el espejo ocupa un "mueble" completo (mismas 2 paredes + 5 entrepaños que una
  // entrepañera — ya contabilizado arriba en paredes/entrepaños, no se vuelve a sumar aquí),
  // más su propio "fondo de cajonera de espejo" + 2 zóclos + jaladera + bisagra + el espejo
  // en sí (confirmado por el usuario).
  if(espejos>0){
    add('Jaladera (por espejo)',espejos,'—',color,'ok','1 jaladera por espejo (confirmado por el usuario)');
    add('Bisagra (por espejo)',espejos*1.5,'—','—','ok','1.5 bisagras por espejo (confirmado por el usuario); no lleva correderas ni tubos/bridas extra por el espejo');
    if(fam==='King'){
      add('Entrepaña con espejo',espejos,'—','—','ok','Pieza estructural del mueble de espejo; el espejo de closet se descuenta aparte (ver "Espejo" abajo)');
      if(espejos===1) add('Entrepaña normal',1,'—','—','ok','King con 1 espejo = 1 entrepaña normal + 1 entrepaña con espejo');
    }
    add('Espejo',espejos,'—','—','ok','1 "Espejos closet" por espejo (confirmado por el usuario, incluido King: "el espejo es espejo de clóset... aplica para todas las variantes de los modelos")');
    // Frente del espejo (confirmado por el usuario): 1 zóclo 16×52 + 1 zóclo 18×52 + 2 marcos
    // 10×160 + 2 marcos 10×35, todo del COLOR DEL FRENTE; se descuenta de esa melamina.
    piezasFrenteEspejo(add, espejos, color, maxOn);
  } else if(!maxOn){
    // Confirmado por el usuario: los modelos Max NO llevan zóclos de 10×52 (solo sus zóclos Max).
    add('Zóclo normal',2,'10×52 cm',colorZoclo,'ok', 'Color del frente (confirmado por el usuario)');
  }

  // Fondo de cajonera: confirmado por el usuario — "cada mueble que sea cajonera de 1, de 3,
  // de 5, espejo, Emma o Max lleva un fondo de cajonera, más aparte los fondos de los cajones".
  // Las entrepañeras NO llevan fondo de cajonera. 1 fondo por cada mueble ocupado por cajonera
  // (mueblesCajonera, ya contando que 6/8/10 cajones ocupan 2 muebles = 2 fondos) + 1 por cada
  // espejo (cada espejo ocupa 1 mueble). Medida y rendimiento confirmados: 55×122 cm, MDF 3mm,
  // 4 fondos por hoja.
  // Si maxOn, la(s) cajonera(s) Max ya trae(n) su propio fondo de cajonera (piezasCajoneraMax);
  // aquí solo se cuenta lo que no sea Max: mueblesCajonera normal + espejos (el espejo no cambia con Max).
  const mueblesCajoneraParaFondo = maxOn ? 0 : mueblesCajonera;
  const mueblesFondoCajonera = mueblesCajoneraParaFondo + espejos;
  if(mueblesFondoCajonera>0){
    add('Fondo de cajonera (MDF 3mm)', mueblesFondoCajonera, '55×122 cm', '—', 'ok',
      (mueblesCajoneraParaFondo>0 && espejos>0)
        ? (mueblesCajoneraParaFondo+' mueble(s) de cajonera + '+espejos+' de espejo (confirmado por el usuario)')
        : '1 fondo por mueble de cajonera/espejo (confirmado por el usuario), aparte del fondo de cada cajón');
  }

  // Herrajes (tubos/bridas) por familia
  if(fam==='Lateral'||fam==='Doble'){ add('Tubo',2,'—','—','ok'); add('Juego de bridas',2,'—','—','ok'); }
  else if(fam==='Central'){ add('Tubo',3,'—','—','ok'); add('Juego de bridas',3,'—','—','ok'); }
  else if(fam==='Doble Especial'){ add('Tubo',4,'—','—','ok'); add('Juego de bridas',4,'—','—','ok'); }
  else if(fam==='Triple'){ add('Tubo',4,'—','—','ok'); add('Juego de bridas',4,'—','—','ok'); }
  else if(fam==='King'){ add('Tubo',5,'—','—','ok'); add('Juego de bridas',5,'—','—','ok'); }

  // Igual que los zóclos normales: si el modelo lleva cajonera, los zóclos Max van del color del frente.
  piezas.forEach(p=>{ if(p.nombre==='Zóclo Max') p.colorDestino = color; });
  return {piezas, maxNota};
}

// ===== Adicionales: muebles extra que se agregan a un modelo (no cuentan como uno de los
// muebles fijos del modelo, van aparte). Confirmado por el usuario: pueden ser cualquier
// cajonera, entrepañera, zapatera, repisa o cajonera de espejo.
// Puertitas de cajonera (confirmado por el usuario): cada cajonera lleva 1 "par" (2 puertitas
// iguales) como puerta. La cajonera Emma usa la misma medida que la cajonera de 5 cajones.
// Solo hay medida confirmada para cajonera de 3, de 5 (y Emma) y Max; cualquier otra cantidad
// de cajones (6, 8, 10, "otra") todavía no tiene medida y se deja "Pendiente".
const PUERTITA_CAJONERA = {
  '3':   {dim:'70×27.3 cm', porHoja:12},
  '5':   {dim:'80×27.3 cm', porHoja:12},
  'max': {dim:'83×30.3 cm', porHoja:7}
};
// Mismo dato, indexado por medida (dim), para convertir piezas -> consumo sin importar de
// qué tipo de cajonera vino la puertita (piezasAConsumo solo ve nombre+dim, no el tipo).
const PUERTITA_POR_HOJA_POR_DIM = {};
Object.values(PUERTITA_CAJONERA).forEach(s=>{ PUERTITA_POR_HOJA_POR_DIM[s.dim] = s.porHoja; });

// ===== Piezas cortadas para la Auditoría física =====
// Piezas sueltas (ya cortadas) que se cuentan en la auditoría. Se convierten a hojas con
// piezasAConsumo(), el MISMO motor que usa el despiece para descontar, así una hoja cortada
// y contada en piezas vuelve a dar exactamente la hoja que se descontó.
// Cargador 10×40 (confirmado por el usuario): con sierra de 5 mm salen 3 a lo ancho (3×40 + 2 cortes
// = 121 cm de 122) × 23 a lo largo (23×10 + 22 cortes = 241 cm de 244) = 69 por hoja.
const CARGADORES_POR_HOJA = 69;
// Piezas sueltas de un frente de espejo (conteo): el frente completo cuesta 1/5 de hoja
// (ESPEJOS_POR_HOJA). Cada pieza suelta vale su parte de ese 1/5 según su área, así que contar
// las 6 piezas de un frente da exactamente 0.20 hojas, igual que al instalarlo.
const FRENTE_ESPEJO_PIEZAS = {'10×160 cm':2, '10×35 cm':2, '16×52 cm':1, '18×52 cm':1};
// Piezas sueltas de muebles Max (paredes, entrepaños y respaldo): la entrepañera Max completa
// (2 paredes 40×185 + 5 entrepaños 40×58) sale de 1 hoja; cada pieza suelta vale su parte por área.
const AREA_ENTREPANERA_MAX = 2*40*185 + 5*40*58;
function fraccionPiezaMax(dim){ const m=String(dim).match(/([\d.]+)\s*×\s*([\d.]+)/); return m ? Number(m[1])*Number(m[2])/AREA_ENTREPANERA_MAX : 0; }
function fraccionPiezaFrenteEspejo(dim){
  const area = d => { const m=String(d).match(/([\d.]+)\s*×\s*([\d.]+)/); return m ? Number(m[1])*Number(m[2]) : 0; };
  const total = Object.keys(FRENTE_ESPEJO_PIEZAS).reduce((s,d)=>s+area(d)*FRENTE_ESPEJO_PIEZAS[d],0);
  return total ? area(dim)/total/ESPEJOS_POR_HOJA : 0;
}
const PIEZAS_AUDIT = [
  {key:'pared',       tipo:'mel', nombre:'Pared',                    dim:'191×40 cm',   label:'Pared (o maletero chico)', rinde:'3 por hoja (junto con 3 entrepaños)'},
  {key:'entrepano',   tipo:'mel', nombre:'Entrepaño',                dim:'52×40 cm',    label:'Entrepaño',                rinde:'Van con las paredes (3+3); los que sobren, 14 por hoja'},
  {key:'maletero',    tipo:'mel', nombre:'Maletero grande',          dim:'40×244 cm',   label:'Maletero grande', rinde:'3 por hoja'},
  {key:'frente',      tipo:'mel', nombre:'Frente',                   dim:'18×54 cm',    label:'Frente de cajón',          rinde:'24 por hoja'},
  {key:'frentemax',   tipo:'mel', nombre:'Frente Max',               dim:'60×20 cm',    label:'Frente de cajón Max',      rinde:'24 por hoja'},
  {key:'pchica',      tipo:'mel', nombre:'Pieza chica de cajón',     dim:'33×16.5 cm',  label:'Pieza chica de cajón',     rinde:'49 por hoja'},
  {key:'pgrande',     tipo:'mel', nombre:'Pieza grande de cajón',    dim:'46.4×16.5 cm',label:'Pieza grande de cajón',    rinde:'35 por hoja'},
  {key:'pchicamax',   tipo:'mel', nombre:'Pieza chica de cajón Max', dim:'15×38 cm',    label:'Pieza chica de cajón Max', rinde:'45 por hoja'},
  {key:'pgrandemax',  tipo:'mel', nombre:'Pieza grande de cajón Max',dim:'15×52.5 cm',  label:'Pieza grande de cajón Max',rinde:'30 por hoja'},
  {key:'entzap',      tipo:'mel', nombre:'Entrepaño zapatera',       dim:'27×40 cm',    label:'Entrepaño de zapatera (27 o 30×40)', rinde:'24 por hoja'},
  {key:'puertita3',   tipo:'mel', nombre:'Puertita de cajonera',     dim:PUERTITA_CAJONERA['3'].dim,   label:'Puertita de cajonera de 3',        rinde:PUERTITA_CAJONERA['3'].porHoja+' por hoja'},
  {key:'puertita5',   tipo:'mel', nombre:'Puertita de cajonera',     dim:PUERTITA_CAJONERA['5'].dim,   label:'Puertita de cajonera de 5 / Emma', rinde:PUERTITA_CAJONERA['5'].porHoja+' por hoja'},
  {key:'puertitamax', tipo:'mel', nombre:'Puertita de cajonera',     dim:PUERTITA_CAJONERA['max'].dim, label:'Puertita de cajonera Max',         rinde:PUERTITA_CAJONERA['max'].porHoja+' por hoja'},
  {key:'puertazap',   tipo:'mel', nombre:'Puerta de zapatera',       dim:'172×30 cm',   label:'Puerta de zapatera',       rinde:'Corte combinado (igual que en despiece)'},
  {key:'zoclo',       tipo:'mel', nombre:'Zóclo normal',             dim:'10×52 cm',    label:'Zóclo 10×52',              rinde:'48 por hoja'},
  {key:'zoclomax',    tipo:'mel', nombre:'Zóclo Max',                dim:'12×58 cm',    label:'Zóclo Max 12×58',          rinde:'Por área (proporcional)'},
  {key:'paredmax',    tipo:'mel', nombre:'Pieza Max suelta',         dim:'40×185 cm',   label:'Pared Max 40×185',         rinde:'Por área: 1 entrepañera Max = 1 hoja'},
  {key:'entmaxlargo', tipo:'mel', nombre:'Pieza Max suelta',         dim:'40×58 cm',    label:'Entrepaño Max largo 40×58',rinde:'Por área: 1 entrepañera Max = 1 hoja'},
  {key:'entmaxcorto', tipo:'mel', nombre:'Pieza Max suelta',         dim:'27×58 cm',    label:'Entrepaño Max corto 27×58',rinde:'Por área: 1 entrepañera Max = 1 hoja'},
  {key:'respaldomax', tipo:'mel', nombre:'Pieza Max suelta',         dim:'20×58 cm',    label:'Respaldo Max 20×58',       rinde:'Por área: 1 entrepañera Max = 1 hoja'},
  {key:'zoclozap12',  tipo:'mel', nombre:'Zóclo zapatera',           dim:'12×27 cm',    label:'Zóclo de zapatera 12×27 (con puerta)', rinde:'Por área (proporcional)'},
  {key:'zoclozap',    tipo:'mel', nombre:'Zóclo zapatera',           dim:'10×27 cm',    label:'Zóclo de zapatera 10×27',  rinde:'108 por hoja'},
  {key:'cargador',    tipo:'mel', nombre:'Cargador',                 dim:'10×40 cm',    label:'Cargador 10×40',           rinde:CARGADORES_POR_HOJA+' por hoja (sierra de 5 mm)'},
  {key:'espzoclo16',  tipo:'mel', nombre:'Pieza de frente de espejo',dim:'16×52 cm',    label:'Zóclo de espejo 16×52',    rinde:'Parte del frente de espejo (5 frentes por hoja)'},
  {key:'espzoclo18',  tipo:'mel', nombre:'Pieza de frente de espejo',dim:'18×52 cm',    label:'Zóclo de espejo 18×52',    rinde:'Parte del frente de espejo (5 frentes por hoja)'},
  {key:'espmarco160', tipo:'mel', nombre:'Pieza de frente de espejo',dim:'10×160 cm',   label:'Marco de espejo largo 10×160', rinde:'Parte del frente de espejo (5 frentes por hoja)'},
  {key:'espmarco35',  tipo:'mel', nombre:'Pieza de frente de espejo',dim:'10×35 cm',    label:'Marco de espejo corto 10×35',  rinde:'Parte del frente de espejo (5 frentes por hoja)'},
  {key:'espzoclo16max',tipo:'mel', nombre:'Pieza de frente de espejo',dim:'16×58 cm',    label:'Zóclo de espejo Max 16×58',  rinde:'Parte del frente de espejo Max (por área)'},
  {key:'espzoclo18max',tipo:'mel', nombre:'Pieza de frente de espejo',dim:'18×58 cm',    label:'Zóclo de espejo Max 18×58',  rinde:'Parte del frente de espejo Max (por área)'},
  {key:'espmarco160max',tipo:'mel',nombre:'Pieza de frente de espejo',dim:'13×160 cm',   label:'Marco de espejo Max largo 13×160', rinde:'Parte del frente de espejo Max (por área)'},
  {key:'fondocajon',  tipo:'mdf', nombre:'Fondo de cajón (MDF 3mm)',     dim:'49.4×33 cm',  label:'Fondo de cajón (MDF 3mm)',     rinde:'14 por hoja de MDF 3mm'},
  {key:'fondocajonera',tipo:'mdf',nombre:'Fondo de cajonera (MDF 3mm)',  dim:'55×122 cm',   label:'Fondo de cajonera (MDF 3mm)',  rinde:'4 por hoja de MDF 3mm'},
  {key:'fondomax',    tipo:'mdf', nombre:'Fondo de cajón (MDF 5mm, Max)',dim:'55.5×37.9 cm',label:'Fondo de cajón Max (MDF 5mm)', rinde:'12 por hoja de MDF 5mm'}
];
const AUD_GRUPO_MDF = 'MDF';

// ===== Armados para la Auditoría física (confirmado por el usuario) =====
// - Cajonera armada sin cajones: estructura + herrajes de cajonera (y puertitas, si las trae).
// - Cajón completo: frente + cuadro + fondo + herrajes de cajón.
// - Cuadro de cajón con fondo / sin fondo: solo piezas (sin herrajes).
// Correderas (corregido por el usuario): un juego = hembra (va en la cajonera) + macho (va en el
// cajón). Una cajonera sin cajones aporta hembras y un cajón completo aporta un macho; solo cuenta
// como JUEGO cuando hay pareja (hembra + macho). Lo que quede sin pareja se reporta aparte y no
// cuenta como juego. También se pueden contar correderas sueltas (hembra o macho).
// Las recetas de cajonera se toman de buildAdicionalPiezas (mismo despiece que al instalar),
// quitando lo que pertenece a los cajones.
const ARMADO_TIPOS = {
  cajonera:     'Cajonera armada sin cajones',
  cajon:        'Cajón completo',
  cuadro_fondo: 'Cuadro de cajón con fondo',
  cuadro_sin:   'Cuadro de cajón sin fondo',
  cajonera_espejo: 'Cajonera de espejo (sin la puerta)',
  puerta_espejo:   'Puerta de espejo (marcos con su espejo)',
  puerta_zapatera: 'Puerta de zapatera (172×30)'
  // Las correderas sueltas ahora se cuentan en Herrajes → "(sin pareja)".
};
const ARMADO_ES_ESPEJO = t => t==='cajonera_espejo' || t==='puerta_espejo' || t==='puerta_zapatera';
const ARMADO_SIN_VARIANTE = t => t==='puerta_zapatera'; // espejo sí tiene Normal/Max
const ARMADO_CORREDERA = {hembra:'Hembra (la que va en la cajonera)', macho:'Macho (la que va en el cajón)'};
const ARMADO_CAJONERAS = {'1':'De 1 cajón','3':'De 3 cajones','5':'De 5 cajones','6':'De 6 cajones','8':'De 8 cajones','10':'De 10 cajones','emma':'Emma (4 cajones)','max':'Max (4 cajones)'};
const PIEZAS_DE_CAJON = ['Frente','Frente Max','Pieza chica de cajón','Pieza grande de cajón','Pieza chica de cajón Max','Pieza grande de cajón Max','Fondo de cajón (MDF 3mm)','Fondo de cajón (MDF 5mm, Max)','Jaladera (por cajón)','Juego de corredera','Correderas de extensión'];
function armadoTienePuertitas(variante){ return ['3','5','emma','max'].includes(variante); }
function armadoUsaCorredera(a){ return (a.tipo==='cajonera' || a.tipo==='cajon' || a.tipo==='corredera') && a.variante!=='max'; }

// Devuelve las piezas (formato del despiece) de un armado, ya multiplicadas por su cantidad.
// Herrajes de un armado (para la opción "sin herrajes" del conteo, confirmada por el usuario).
function esPiezaHerraje(nombre){ return /^(Bisagra|Jaladera|Push|Juego de corredera|Correderas de extensión|Corredera )/.test(nombre); }
function piezasDeArmado(a){
  const n = Number(a.cantidad)||0;
  const piezas = [];
  const add = (nombre,cantidad,dim,colorDestino,estado)=>((a.sinHerrajes && esPiezaHerraje(nombre)) || (a.puertitasSinJal && /^(Jaladera \(puertita|Push \(puertita)/.test(nombre))) ? null : piezas.push({nombre, cantidad: typeof cantidad==='number'? cantidad*n : cantidad, dim, colorDestino, estado:estado||'ok'});
  // Medias correderas: 'Corredera hembra' / 'Corredera macho' (+ ' (extensión)'). No se descuentan
  // solas: piezasAuditAHojas las junta en parejas para formar juegos completos.
  const sufCorr = (a.variante==='max' || a.ext) ? ' (extensión)' : '';
  const esMax = a.variante==='max';
  if(a.tipo==='cajonera'){
    const tipoAdic = esMax ? 'cajonera_max' : (a.variante==='emma' ? 'cajonera_emma' : 'cajonera');
    const cajones = (esMax || a.variante==='emma') ? 4 : Number(a.variante);
    const conPuerta = !!a.puertitas && armadoTienePuertitas(a.variante);
    buildAdicionalPiezas(tipoAdic, cajones, a.color, !!a.ext, conPuerta, {colorFrente:a.colorFrente})
      .filter(p=>p.estado==='ok' && !PIEZAS_DE_CAJON.includes(p.nombre) && !(a.sinFondo && p.nombre.startsWith('Fondo de cajonera')))
      .forEach(p=>add(p.nombre, p.cantidad, p.dim, p.colorDestino));
    add('Corredera hembra'+sufCorr, cajones, '—', '—');
  } else if(a.tipo==='cajonera_espejo'){
    // Estructura de la cajonera de espejo (sin la puerta): 2 paredes + 5 entrepaños + fondo.
    // Confirmado por el usuario: la cajonera de espejo lleva los zóclos de espejo (16×52 y 18×52).
    // Cada pieza del frente de espejo vale su parte de 1/5 de hoja (ver fraccionPiezaFrenteEspejo).
    const cz = a.colorFrente || a.color;
    if(esMax){ add('Pared Max', 2, '40×185 cm', a.color); add('Entrepaño Max largo', 5, '40×58 cm', a.color); add('Melamina (espejo Max)', 1, '—', a.color);
      add('Pieza de frente de espejo', 1, '16×58 cm', cz); add('Pieza de frente de espejo', 1, '18×58 cm', cz); }
    else { add('Pared', 2, '191×40 cm', a.color); add('Entrepaño', 5, '52×40 cm', a.color);
      add('Pieza de frente de espejo', 1, '16×52 cm', cz); add('Pieza de frente de espejo', 1, '18×52 cm', cz); }
    if(!a.sinFondo) add('Fondo de cajonera (MDF 3mm)', 1, '55×122 cm', '—');
  } else if(a.tipo==='puerta_espejo'){
    // Puerta de espejo: solo los marcos (2 de 10×160 y 2 de 10×35) + su espejo; bisagras (1.5) y
    // jaladera (1) se eligen por separado (confirmado por el usuario).
    add('Pieza de frente de espejo', 2, esMax?'13×160 cm':'10×160 cm', a.color); add('Pieza de frente de espejo', 2, '10×35 cm', a.color);
    if(!a.sinEspejo) add('Espejo', 1, '—', '—');
    if(!a.sinJaladera) add('Jaladera (por espejo)', 1, '—', a.color);
    if(!a.sinBisagras) add('Bisagra (por espejo)', 1.5, '—', '—');
  } else if(a.tipo==='puerta_zapatera'){
    // Puerta de zapatera 172×30 con sus herrajes opcionales: 1.5 bisagras y 1 jaladera.
    add('Puerta de zapatera', 1, '172×30 cm', a.color);
    if(!a.sinBisagras) add('Bisagra (zapatera)', 1.5, '—', '—');
    if(!a.sinJaladera) add('Jaladera (zapatera)', 1, '—', a.color);
  } else if(a.tipo==='corredera'){
    add('Corredera '+(a.variante==='macho'?'macho':'hembra')+sufCorr, 1, '—', '—');
  } else if(a.tipo==='cajon'){
    if(esMax){
      add('Frente Max', 1, '60×20 cm', a.color);
      add('Pieza chica de cajón Max', 2, '15×38 cm', a.colorCuadro);
      add('Pieza grande de cajón Max', 2, '15×52.5 cm', a.colorCuadro);
      add('Fondo de cajón (MDF 5mm, Max)', 1, '55.5×37.9 cm', '—');
    } else {
      add('Frente', 1, '18×54 cm', a.color);
      add('Pieza chica de cajón', 2, '33×16.5 cm', a.colorCuadro);
      add('Pieza grande de cajón', 2, '46.4×16.5 cm', a.colorCuadro);
      add('Fondo de cajón (MDF 3mm)', 1, '49.4×33 cm', '—');
      add('Jaladera (por cajón)', 1, '—', a.color);
    }
    add('Corredera macho'+sufCorr, 1, '—', '—');
  } else if(a.tipo==='cuadro_fondo' || a.tipo==='cuadro_sin'){
    add(esMax?'Pieza chica de cajón Max':'Pieza chica de cajón', 2, esMax?'15×38 cm':'33×16.5 cm', a.color);
    add(esMax?'Pieza grande de cajón Max':'Pieza grande de cajón', 2, esMax?'15×52.5 cm':'46.4×16.5 cm', a.color);
    if(a.tipo==='cuadro_fondo'){
      if(esMax) add('Fondo de cajón (MDF 5mm, Max)', 1, '55.5×37.9 cm', '—');
      else add('Fondo de cajón (MDF 3mm)', 1, '49.4×33 cm', '—');
    }
  }
  return piezas;
}
function describirArmado(a){
  let d;
  if(a.tipo==='corredera') d = 'Corredera suelta · '+(a.variante==='macho'?'macho':'hembra');
  else if(a.tipo==='cajonera') d = 'Cajonera sin cajones '+ARMADO_CAJONERAS[a.variante].toLowerCase()+' · '+a.color+(a.colorFrente&&a.colorFrente!==a.color?' (frentes y zóclos '+a.colorFrente+')':'');
  else if(a.tipo==='cajonera_espejo') d = 'Cajonera de espejo'+(a.variante==='max'?' Max':'')+' (sin puerta) · '+a.color+(a.colorFrente&&a.colorFrente!==a.color?' (zóclos '+a.colorFrente+')':'')+(a.sinFondo?' · sin fondo':'');
  else if(a.tipo==='puerta_zapatera') d = 'Puerta de zapatera · '+a.color+(a.sinBisagras&&a.sinJaladera?' · sin herrajes':(a.sinBisagras?' · sin bisagras':(a.sinJaladera?' · sin jaladera':' · con bisagras y jaladera')));
  else if(a.tipo==='puerta_espejo') d = 'Puerta de espejo'+(a.variante==='max'?' Max':'')+' · '+a.color+(a.sinEspejo?' · sin espejo':'')+(a.sinBisagras&&a.sinJaladera?' · sin herrajes':(a.sinBisagras?' · sin bisagras':(a.sinJaladera?' · sin jaladera':'')));
  else if(a.tipo==='cajon') d = 'Cajón completo'+(a.variante==='max'?' Max':'')+' · frente '+a.color+' / cuadro '+a.colorCuadro;
  else d = ARMADO_TIPOS[a.tipo]+(a.variante==='max'?' Max':'')+' · '+a.color;
  if(a.sinHerrajes) d += ' · sin herrajes';
  else if(armadoUsaCorredera(a)) d += a.ext ? ' · corredera de extensión' : ' · corredera normal';
  if(a.tipo==='cajonera' && a.puertitas && armadoTienePuertitas(a.variante)) d += a.puertitasSinJal ? ' · con puertitas (sin '+(a.variante==='max'?'push':'jaladeras')+')' : ' · con puertitas';
  if(a.tipo==='cajonera' && a.sinFondo) d += ' · sin fondo';
  return d;
}
function piezasPuertitaCajonera(add, color, claveMedida, tipoEtiqueta){
  const spec = PUERTITA_CAJONERA[claveMedida];
  if(!spec){
    add('Puertita de cajonera', 'Pendiente', '—', '—', 'pendiente',
      'Medida de la puertita de '+tipoEtiqueta+' no confirmada todavía; no se inventa. Dile a Claude la medida (ancho×alto).');
    return;
  }
  add('Puertita de cajonera', 2, spec.dim, color, 'ok',
    'Confirmado por el usuario: 1 par (2 puertitas) por cajonera, '+spec.porHoja+' puertitas por hoja ('+tipoEtiqueta+').');
  // Herrajes (confirmado por el usuario): cada puertita (cada una de las 2 del par) lleva su
  // propio juego de bisagras, así que una cajonera con puertitas gasta 2. Las puertitas de
  // 3/5/Emma llevan 1 jaladera cada una (2 por cajonera); las de Max no llevan jaladera, pero
  // el par completo lleva 1 "Push" (no es por puerta, es 1 por par).
  add('Bisagra de puertita de cajonera', 2, '—', '—', 'ok', '1 juego de bisagras por puerta, 2 por cajonera (confirmado por el usuario)');
  if(claveMedida==='max'){
    add('Push (puertita Max)', 1, '—', '—', 'ok', '1 push por par de puertitas Max; las de Max no llevan jaladera (confirmado por el usuario)');
  } else {
    add('Jaladera (puertita de cajonera)', 2, '—', color, 'ok', '1 jaladera por puerta, 2 por cajonera (confirmado por el usuario)');
  }
}

const ESPEJOS_POR_HOJA = 5; // frentes de espejo completos por hoja 122×244 con sierra de 5 mm (confirmado por el usuario)
// Frente de un espejo (confirmado por el usuario): 2 zóclos y 4 marcos, del color del frente.
function piezasFrenteEspejo(add, n, colorFrente, max){
  if(max){
    // Espejo Max (confirmado por el usuario): zóclos de 16×58 y 18×58; en la puerta los marcos
    // largos van a 13×160 y los cortos son iguales (10×35). Se descuenta por área, en la misma
    // proporción que el frente normal (1 hoja = 5 frentes normales).
    add('Zóclo especial',n,'16×58 cm',colorFrente,'ok','Espejo Max: 1 por espejo, color del frente');
    add('Zóclo especial',n,'18×58 cm',colorFrente,'ok','Espejo Max: 1 por espejo, color del frente');
    add('Marco de espejo',2*n,'13×160 cm',colorFrente,'ok','Espejo Max: marcos largos de 13×160, color del frente');
    add('Marco de espejo',2*n,'10×35 cm',colorFrente,'ok','Espejo Max: marcos cortos iguales al espejo normal');
    return;
  }
  add('Zóclo especial',n,'16×52 cm',colorFrente,'ok','Frente de espejo: 1 por espejo, color del frente');
  add('Zóclo especial',n,'18×52 cm',colorFrente,'ok','Frente de espejo: 1 por espejo, color del frente');
  add('Marco de espejo',2*n,'10×160 cm',colorFrente,'ok','Frente de espejo: 2 por espejo, color del frente. Todo el frente se descuenta junto: 1 hoja = frentes de 5 espejos (0.20 hojas por espejo)');
  add('Marco de espejo',2*n,'10×35 cm',colorFrente,'ok','Frente de espejo: 2 por espejo, color del frente');
}
// Mueble de espejo Max (confirmado por el usuario): 2 paredes Max de 40×185 y 5 entrepaños Max de
// 40×58, igual que una entrepañera Max; sale de 1 hoja como los demás muebles Max.
function piezasEspejoMax(add, color, n){
  add('Pared Max', 2*n, '40×185 cm', color, 'ok', 'Espejo Max (confirmado por el usuario)');
  add('Entrepaño Max largo', 5*n, '40×58 cm', color, 'ok', 'Espejo Max');
  add('Melamina (espejo Max)', n, '—', color, 'ok', '1 hoja por mueble de espejo Max, igual que la entrepañera Max');
}
function buildAdicionalPiezas(tipo, cajones, color, correderaExt, conPuerta, extra){
  const piezas = [];
  const add=(nombre,cantidad,dim,colorDestino,estado,nota)=>piezas.push({nombre,cantidad,dim,colorDestino,estado,nota:nota||''});
  const CAJONERA_ENTREPANOS = {1:4, 3:5, 5:4, 6:10, 8:9, 10:8};
  const MUEBLES_CAJONERA = {1:1, 3:1, 5:1, 6:2, 8:2, 10:2};
  if(tipo==='entrepanera'){
    add('Pared',2,'191×40 cm',color,'ok','Adicional: entrepañera (2 paredes + 5 entrepaños + 2 zóclos)');
    add('Entrepaño',5,'52×40 cm',color,'ok');
    add('Zóclo normal',2,'10×52 cm',color,'ok');
  } else if(tipo==='cajonera'){
    add('Pared',2,'191×40 cm',color,'ok','Adicional: cajonera de '+cajones+' cajones');
    if(CAJONERA_ENTREPANOS[cajones]) add('Entrepaño',CAJONERA_ENTREPANOS[cajones],'40×52 cm',color,'ok');
    else add('Entrepaño','Pendiente','—','—','pendiente','Cantidad de entrepaños de cajonera de '+cajones+' cajones no confirmada; no se inventa');
    add('Zóclo normal',2,'10×52 cm',color,'ok');
    add('Frente',cajones,'18×54 cm',color,'ok');
    add('Pieza chica de cajón',cajones*2,'33×16.5 cm',color,'ok');
    add('Pieza grande de cajón',cajones*2,'46.4×16.5 cm',color,'ok');
    add('Fondo de cajón (MDF 3mm)',cajones,'49.4×33 cm','—','ok');
    if(correderaExt) add('Correderas de extensión',cajones,'—','—','ok','1 por cajón (sustituye al juego de corredera normal; elegido por el usuario)');
    else add('Juego de corredera',cajones,'—','—','ok','1 por cajón');
    add('Jaladera (por cajón)',cajones,'—',color,'ok');
    if(MUEBLES_CAJONERA[cajones]) add('Fondo de cajonera (MDF 3mm)',MUEBLES_CAJONERA[cajones],'55×122 cm','—','ok','1 fondo de cajonera por mueble ocupado (confirmado por el usuario), aparte del fondo de cada cajón');
    else add('Fondo de cajonera (MDF 3mm)','Pendiente','—','—','pendiente','Cantidad de muebles que ocupa la cajonera de '+cajones+' cajones no confirmada; no se inventa');
    if(conPuerta) piezasPuertitaCajonera(add, color, (cajones===3||cajones===5)?String(cajones):null, 'cajonera de '+cajones+' cajones');
  } else if(tipo==='cajonera_espejo_max'){
    piezasEspejoMax(add, color, 1);
    add('Fondo de cajonera (MDF 3mm)',1,'55×122 cm','—','ok','Igual que el espejo normal');
    piezasFrenteEspejo(add, 1, color, true);
    add('Espejo',1,'—','—','ok','1 "Espejos closet"');
    add('Jaladera (por espejo)',1,'—',color,'ok');
    add('Bisagra (por espejo)',1.5,'—','—','ok');
  } else if(tipo==='entrepanera_max'){
    piezasEntrepaneraMax(add, color, 1);
  } else if(tipo==='cajonera_max'){
    // Confirmado por el usuario: receta completa de la Cajonera Max (ver piezasCajoneraMax /
    // piezasCajonesMax). Como adicional cuenta como 1 sola unidad. Confirmado: la Cajonera Max
    // SIEMPRE lleva 4 cajones (medida fija, no la elige el cliente ni varía por modelo).
    piezasCajoneraMax(add, color, 1);
    piezasCajonesMax(add, 4, color, color);
    if(conPuerta) piezasPuertitaCajonera(add, color, 'max', 'cajonera Max');
  } else if(tipo==='cajonera_emma'){
    add('Pared',2,'191×40 cm',color,'ok','Cajonera Emma: 2 paredes + 4 entrepaños + 5 zóclos de 10×52 + 4 cajones (confirmado por el usuario)');
    add('Entrepaño',4,'52×40 cm',color,'ok');
    add('Zóclo normal',5,'10×52 cm',color,'ok','Emma lleva 5 zóclos de 10×52 (confirmado por el usuario; distinto de los 2 de una cajonera/entrepañera normal)');
    add('Frente',4,'18×54 cm',color,'ok');
    add('Pieza chica de cajón',4*2,'33×16.5 cm',color,'ok');
    add('Pieza grande de cajón',4*2,'46.4×16.5 cm',color,'ok');
    add('Fondo de cajón (MDF 3mm)',4,'49.4×33 cm','—','ok');
    // Confirmado por el usuario: la Emma puede llevar corredera normal o de extensión.
    if(correderaExt) add('Correderas de extensión',4,'—','—','ok','1 por cajón (Emma con corredera de extensión)');
    else add('Juego de corredera',4,'—','—','ok','1 por cajón');
    // Confirmado por el usuario: los cajones de la cajonera Emma NO llevan jaladera.
    add('Fondo de cajonera (MDF 3mm)',1,'55×122 cm','—','ok','Emma ocupa 1 mueble = 1 fondo de cajonera (confirmado por el usuario)');
    // Confirmado por el usuario: la puertita de la cajonera Emma es la misma que la de la
    // cajonera de 5 cajones (80×27.3 cm).
    if(conPuerta) piezasPuertitaCajonera(add, color, '5', 'cajonera de 5 cajones (la misma que usa Emma)');
  } else if(tipo==='cajonera_espejo'){
    add('Pared',2,'191×40 cm',color,'ok','Adicional: cajonera de espejo');
    add('Entrepaño',5,'52×40 cm',color,'ok');
    add('Fondo de cajonera (MDF 3mm)',1,'55×122 cm','—','ok','Rendimiento confirmado: 4 fondos de cajonera por hoja de MDF 3mm');
    piezasFrenteEspejo(add, 1, color);
    add('Espejo',1,'—','—','ok','1 "Espejos closet"');
    add('Jaladera (por espejo)',1,'—',color,'ok');
    add('Bisagra (por espejo)',1.5,'—','—','ok');
  } else if(tipo==='zapatera'){
    // Confirmado por el usuario: 2 paredes (191×40, iguales a las normales) + 8 entrepaños
    // (7 de 27×40 + 1 de 30×40, 24 por hoja) + 2 zóclos de 27×10. Aplica solo como opción de
    // mueble en Lateral y Central (en vez de entrepañera).
    add('Pared',2,'191×40 cm',color,'ok','Adicional: zapatera (2 paredes + 8 entrepaños + 2 zóclos)');
    add('Entrepaño zapatera',7,'27×40 cm',color,'ok','Confirmado: entrepaños de zapatera, 24 por hoja');
    add('Entrepaño zapatera',1,'30×40 cm',color,'ok','Confirmado: mismo rendimiento que el de 27×40 (24 por hoja)');
    add('Zóclo zapatera',2,'27×10 cm',color,'ok','Confirmado por el usuario');
    if(conPuerta){
      // Confirmado por el usuario: "zapatera con puerta" agrega 1 zóclo extra de 12×27 y la
      // puerta en sí (172×30, 1.5 bisagras, 1 jaladera).
      add('Zóclo zapatera',1,'12×27 cm',color,'ok','Zóclo extra cuando la zapatera lleva puerta (confirmado por el usuario)');
      add('Puerta de zapatera',1,'172×30 cm',color,'ok','Confirmado por el usuario: 172×30 cm');
      add('Bisagra (zapatera)',1.5,'—','—','ok','Confirmado por el usuario');
      add('Jaladera (zapatera)',1,'—',color,'ok','Confirmado por el usuario');
    }
  } else if(tipo==='piso_zoclo'){
    (extra && extra.pz || []).forEach(r=>{ const d = PISO_ZOCLO_PIEZAS.find(x=>x.k===r.k); if(d && r.cantidad>0) add(d.nombre, r.cantidad, d.dim, r.color||color, 'ok', 'Piso y zóclo'); });
  } else if(tipo==='repisa'){
    // Confirmado por el usuario: la repisa lleva su medida (largo × fondo) y pueden ser 1, 2 o 3.
    // Se descuenta el PROPORCIONAL de la hoja (ver piezasAConsumo), no la hoja completa.
    const largo = extra && Number(extra.largo), fondo = extra && Number(extra.fondo), cant = (extra && Number(extra.cantidad)) || 1;
    if(largo>0 && fondo>0) add('Repisa', cant, `${fmtNum(largo)}×${fmtNum(fondo)} cm`, color, 'ok', `${cant} repisa(s) de ${fmtNum(largo)}×${fmtNum(fondo)} cm; se descuenta la parte proporcional de la hoja`);
    else add('Repisa','Pendiente','—','—','pendiente','Falta capturar la medida de la repisa (largo × fondo).');
  }
  // Color de frentes y zóclos (confirmado por el usuario): en las cajoneras, los zóclos, frentes,
  // puertitas y el frente del espejo van del color del FRENTE; la estructura (paredes, entrepaños)
  // y el cuadro del cajón se quedan del color de la cajonera.
  const colorFrente = extra && extra.colorFrente;
  if(colorFrente && colorFrente!==color && String(tipo).startsWith('cajonera'))
    piezas.forEach(p=>{ if(PIEZAS_COLOR_FRENTE.includes(p.nombre)) p.colorDestino = colorFrente; });
  // Zapatera (confirmado por el usuario): los zóclos y la puerta van del color del frente.
  if(colorFrente && colorFrente!==color && String(tipo).startsWith('entrepanera'))
    piezas.forEach(p=>{ if(p.nombre==='Zóclo normal' || p.nombre==='Zóclo Max') p.colorDestino = colorFrente; });
  if(colorFrente && colorFrente!==color && tipo==='zapatera')
    piezas.forEach(p=>{ if(PIEZAS_ZAPATERA_FRENTE.includes(p.nombre)) p.colorDestino = colorFrente; });
  return piezas;
}
const PIEZAS_ZAPATERA_FRENTE = ['Zóclo zapatera','Puerta de zapatera','Jaladera (zapatera)'];
const PIEZAS_COLOR_FRENTE = ['Zóclo normal','Zóclo Max','Zóclo especial','Marco de espejo','Frente','Frente Max','Puertita de cajonera'];

// Traduce el valor del selector "por muebles" (MUEBLE_TIPO_OPCIONES) a buildAdicionalPiezas
function buildMueblePiezasComp(value, cajonesManual, color, correderaExt){
  // Cajonera de 1 cajón (confirmado por el usuario): 2 paredes, 4 entrepaños, 2 zóclos, 1 fondo
  // de cajonera y 1 cajón completo con sus herrajes (1 juego de corredera y 1 jaladera).
  if(value==='cajonera_1') return buildAdicionalPiezas('cajonera', 1, color, correderaExt);
  if(value==='cajonera_3') return buildAdicionalPiezas('cajonera', 3, color, correderaExt);
  if(value==='cajonera_5') return buildAdicionalPiezas('cajonera', 5, color, correderaExt);
  if(value==='cajonera_otra') return buildAdicionalPiezas('cajonera', cajonesManual, color, correderaExt);
  if(value==='cajonera_emma') return buildAdicionalPiezas('cajonera_emma', 4, color, correderaExt);
  return buildAdicionalPiezas(value, cajonesManual, color); // entrepanera, cajonera_espejo, cajonera_max
}

// ===== Composición "por muebles" (combinaciones) =====
// Principio confirmado por el usuario y aplicado de forma general a TODOS los modelos/variantes:
// cada "mueble" de una familia (entrepañera, cajonera normal, Cajonera Max, Cajonera Emma o
// cajonera de espejo) trae sus PROPIAS paredes y zóclos — ver buildAdicionalPiezas: cada tipo
// ya suma sus 2 paredes (o las que le tocan) y sus zóclos, sean "Zóclo normal", "Zóclo Max"
// o "Zóclo especial". Por eso, al armar una combinación, el mueble SUSTITUYE su parte del
// total de la familia — no se le agrega aparte lo que ya trae. En la práctica esto significa
// que las piezas "Pared" y "Zóclo normal" del total plano de la familia (el que usa
// buildDespiece para los modelos con nombre) nunca se cuentan en una combinación: siempre
// vienen, completas, de la suma de los muebles elegidos. Esta regla es la misma sin importar
// si el mueble es normal, Emma, Max o espejo, así que no hace falta un caso especial por tipo.

// Deja solo las piezas de la familia que NO pertenecen a ningún mueble en particular: maleteros
// extra y herrajes (tubos/bridas). "Pared" y "Zóclo normal" se descartan porque cada mueble ya
// aporta los suyos (ver nota arriba); "Entrepaño" se descarta porque lo define la combinación.
function piezasFijasDeFamilia(base){
  return base.piezas.filter(p => p.nombre!=='Entrepaño' && p.nombre!=='Pared' && p.nombre!=='Zóclo normal');
}

// Confirmado por el usuario: toda variante Max lleva maleteros grandes; el maletero chico
// (191×40, mide igual que una Pared) se sustituye por uno normal (244×40). Si la familia ya
// tenía su propio maletero normal aparte (p.ej. Doble Especial a 3 metros), el chico sube a
// "grande" en vez de duplicar el normal.
function sustituirMaleteroPorMax(piezasFijas){
  // Confirmado por el usuario: con muebles Max, todo maletero chico se cambia por maletero grande.
  return piezasFijas.map(p=>{
    if(p.nombre!=='Maletero chico') return p;
    return Object.assign({}, p, {nombre:'Maletero grande', dim:'40×244 cm', nota:'Modelo con muebles Max: el maletero chico se cambia por maletero grande (confirmado por el usuario)'});
  });
}

// Arma la composición completa de una familia eligiendo qué es cada uno de sus muebles fijos
// (en vez de un modelo con nombre). Los maleteros extra y herrajes de la familia se toman de
// buildDespiece con cajones=0/espejos=0 (son fijos, no cambian según qué ocupa cada mueble);
// las paredes/zóclos/entrepaños los aporta cada mueble elegido (ver piezasFijasDeFamilia).
function buildComposicion(fam, muebles, color, todoColor, maxOn, colorCajonera, especial3m, correderaExt){
  const estructuraColor = todoColor ? color : 'Blanco';
  const colorCaj = todoColor ? color : (colorCajonera || estructuraColor);
  // La base solo aporta maleteros, cargadores y herrajes; las piezas de cada mueble (normal o Max)
  // las pone cada mueble elegido, así que la base se pide sin Max para no duplicar nada.
  const base = buildDespiece(fam, 0, 0, color, todoColor, false, colorCajonera, especial3m, correderaExt);
  let piezasFijas = piezasFijasDeFamilia(base);

  const numMueblesMax = muebles.filter(m=>m.value==='cajonera_max' || m.value==='entrepanera_max' || m.value==='cajonera_espejo_max').length;
  if(numMueblesMax>0 || maxOn) piezasFijas = sustituirMaleteroPorMax(piezasFijas);

  const piezasMuebles = muebles.flatMap(m=>buildMueblePiezasComp(m.value, m.cajones, colorCaj, correderaExt));
  // Confirmado por el usuario: los zóclos de una cajonera dependen del color del FRENTE, no
  // del color de la cajonera. Se corrige aquí (una sola vez, sobre lo que aportó cada mueble)
  // en vez de duplicar esta regla dentro de cada tipo de mueble en buildAdicionalPiezas.
  piezasMuebles.forEach(p=>{ if(p.nombre==='Zóclo normal' || p.nombre==='Zóclo Max') p.colorDestino = color; });
  // El frente del espejo (zóclos especiales y marcos) va del color del FRENTE, no de la cajonera.
  piezasMuebles.forEach(p=>{ if(p.nombre==='Zóclo especial' || p.nombre==='Marco de espejo' || PIEZAS_ZAPATERA_FRENTE.includes(p.nombre)) p.colorDestino = color; });

  return {piezas: piezasFijas.concat(piezasMuebles), maxNota: base.maxNota};
}

// Rendimientos de hoja confirmados (melamina 122×244, MDF 3mm y 5mm):
//  - 1 hoja de melamina = 3 paredes (191×40) + 3 entrepaños (52×40) juntos (corte combinado estándar)
//  - 1 hoja de melamina = 14 entrepaños sueltos (12 de 52×40 + 2 de 52×34) — corte alterno cuando hacen falta más entrepaños que paredes
//  - 1 hoja de melamina = 3 maleteros grandes (40×244)
//  - 1 hoja de melamina = 49 piezas de cajón cortas (33×16.5)
//  - 1 hoja de melamina = 35 piezas de cajón largas (46.4×16.5)
//  - 1 hoja de MDF 3mm = 4 fondos de cajonera (55×122)
//  - 1 hoja de MDF 3mm = 14 fondos de cajón (49.4×33)
//  - 1 hoja de MDF 5mm = 12 fondos de cajón (49.4×33), solo para cajones de cajoneras Max

// Combina paredes + entrepaños por color, usando el corte estándar (3+3) y el alterno (14) para el sobrante de entrepaños.
function combinarParedEntrepano(piezas){
  const porColor = {};
  piezas.forEach(p=>{
    if(p.estado!=='ok' || typeof p.cantidad!=='number') return;
    if(p.nombre==='Pared'||p.nombre==='Pared cajonera'||p.nombre==='Maletero chico'){ porColor[p.colorDestino]=porColor[p.colorDestino]||{paredes:0,entrepanos:0}; porColor[p.colorDestino].paredes+=p.cantidad; }
    if(p.nombre==='Entrepaño'||p.nombre==='Entrepaño cajonera'){ porColor[p.colorDestino]=porColor[p.colorDestino]||{paredes:0,entrepanos:0}; porColor[p.colorDestino].entrepanos+=p.cantidad; }
  });
  const resultado = [];
  Object.keys(porColor).forEach(color=>{
    const {paredes,entrepanos} = porColor[color];
    if(!paredes && !entrepanos) return;
    // 1 hoja = 3 paredes + 3 entrepaños (corte combinado): cada pareja pared+entrepaño = 1/3 de hoja.
    // Entrepaño suelto = 1/14. Pared SIN su entrepaño (confirmado por el usuario) = 1/3 − 1/14,
    // porque la tira del entrepaño que sale junto a ella no se usó y se queda como material.
    const parejas = Math.min(paredes, entrepanos);
    const hojas = parejas/3 + (paredes-parejas)*(1/3 - 1/14) + (entrepanos-parejas)/14;
    resultado.push({color, hojas});
  });
  return resultado;
}

// Convierte piezas -> consumo real de artículos de CATALOGO (solo donde el rendimiento está confirmado)
function piezasAConsumo(piezas, color){
  const consumoMap = {}; // itemId -> cantidad
  const addConsumo = (itemNombre, cantidad) => {
    const it = itemByName(itemNombre);
    if(!it) return false;
    consumoMap[it.id] = (consumoMap[it.id]||0) + cantidad;
    return true;
  };

  // Paredes + entrepaños (corte combinado), por color de estructura
  combinarParedEntrepano(piezas).forEach(r=>{ if(r.hojas>0) addConsumo('Melamina '+r.color, r.hojas); });

  // Maleteros grandes/normales: 3 por hoja
  const maleterosPorColor = {};
  piezas.filter(p=>p.estado==='ok' && typeof p.cantidad==='number' && (p.nombre==='Maletero normal'||p.nombre==='Maletero normal (Max)'||p.nombre==='Maletero grande'))
    .forEach(p=>{ maleterosPorColor[p.colorDestino]=(maleterosPorColor[p.colorDestino]||0)+p.cantidad; });
  Object.keys(maleterosPorColor).forEach(c=>addConsumo('Melamina '+c, maleterosPorColor[c]/3));

  // Frentes: 24 por hoja, color solicitado por el cliente (Frente Max usa el mismo rendimiento)
  const frentes = piezas.filter(p=>(p.nombre==='Frente'||p.nombre==='Frente Max') && p.estado==='ok').reduce((s,p)=>s+(typeof p.cantidad==='number'?p.cantidad:0),0);
  if(frentes>0) addConsumo('Melamina '+color, frentes/24);

  // Melamina de Cajonera Max / Entrepañera Max: 1 hoja por unidad, ya expresada en hojas (no se divide),
  // y es la misma melamina por color que usa el resto de los muebles (confirmado por el usuario).
  const melaminaMaxPorColor = {};
  piezas.forEach(p=>{
    if(p.estado!=='ok' || typeof p.cantidad!=='number') return;
    if(p.nombre==='Melamina (cajonera Max)' || p.nombre==='Melamina (entrepañera Max)' || p.nombre==='Melamina (espejo Max)'){
      melaminaMaxPorColor[p.colorDestino] = (melaminaMaxPorColor[p.colorDestino]||0) + p.cantidad;
    }
  });
  Object.keys(melaminaMaxPorColor).forEach(c=>addConsumo('Melamina '+c, melaminaMaxPorColor[c]));

  // Piezas de cajón: cortas 49/hoja, largas 35/hoja
  const cortasPorColor = {}, largasPorColor = {};
  const cortasMaxPorColor = {}, largasMaxPorColor = {};
  piezas.forEach(p=>{
    if(p.estado!=='ok' || typeof p.cantidad!=='number') return;
    if(p.nombre==='Pieza chica de cajón') cortasPorColor[p.colorDestino]=(cortasPorColor[p.colorDestino]||0)+p.cantidad;
    if(p.nombre==='Pieza grande de cajón') largasPorColor[p.colorDestino]=(largasPorColor[p.colorDestino]||0)+p.cantidad;
    if(p.nombre==='Pieza chica de cajón Max') cortasMaxPorColor[p.colorDestino]=(cortasMaxPorColor[p.colorDestino]||0)+p.cantidad;
    if(p.nombre==='Pieza grande de cajón Max') largasMaxPorColor[p.colorDestino]=(largasMaxPorColor[p.colorDestino]||0)+p.cantidad;
  });
  Object.keys(cortasPorColor).forEach(c=>addConsumo('Melamina '+c, cortasPorColor[c]/49));
  Object.keys(largasPorColor).forEach(c=>addConsumo('Melamina '+c, largasPorColor[c]/35));
  Object.keys(cortasMaxPorColor).forEach(c=>addConsumo('Melamina '+c, cortasMaxPorColor[c]/45));
  Object.keys(largasMaxPorColor).forEach(c=>addConsumo('Melamina '+c, largasMaxPorColor[c]/30));

  // Entrepaños de zapatera: 24 por hoja (confirmado por el usuario), sin importar si son de
  // 27×40 o 30×40 — mismo rendimiento para ambos.
  const entrepanosZapateraPorColor = {};
  piezas.forEach(p=>{
    if(p.estado!=='ok' || typeof p.cantidad!=='number') return;
    if(p.nombre==='Entrepaño zapatera') entrepanosZapateraPorColor[p.colorDestino]=(entrepanosZapateraPorColor[p.colorDestino]||0)+p.cantidad;
  });
  Object.keys(entrepanosZapateraPorColor).forEach(c=>addConsumo('Melamina '+c, entrepanosZapateraPorColor[c]/24));

  // Puertitas de cajonera (3, 5/Emma y Max): rendimiento fijo por hoja, según su medida
  // (confirmado por el usuario). Se agrupan por color+medida porque el mismo nombre de pieza
  // ("Puertita de cajonera") se usa para las tres medidas.
  const puertitaPorColorDim = {};
  piezas.forEach(p=>{
    if(p.estado!=='ok' || typeof p.cantidad!=='number') return;
    if(p.nombre==='Puertita de cajonera'){
      const key = p.colorDestino+'|'+p.dim;
      puertitaPorColorDim[key] = (puertitaPorColorDim[key]||0) + p.cantidad;
    }
  });
  Object.keys(puertitaPorColorDim).forEach(key=>{
    const [c, dim] = key.split('|');
    const porHoja = PUERTITA_POR_HOJA_POR_DIM[dim];
    if(porHoja) addConsumo('Melamina '+c, puertitaPorColorDim[key]/porHoja);
  });

  // Puerta de zapatera (172×30 cm): mismo motor de corte combinado que las puertas de clóset,
  // para no sobrestimar cuando se piden varias puertas de zapatera del mismo color.
  const puertaZapateraPorColor = {};
  piezas.forEach(p=>{
    if(p.estado!=='ok' || typeof p.cantidad!=='number') return;
    if(p.nombre==='Puerta de zapatera') puertaZapateraPorColor[p.colorDestino]=(puertaZapateraPorColor[p.colorDestino]||0)+p.cantidad;
  });
  Object.keys(puertaZapateraPorColor).forEach(c=>{
    const r = hojasParaCortesCombinado([{ancho:172, alto:30, cantidad:puertaZapateraPorColor[c]}], 122, 244);
    if(r.costo>0) addConsumo('Melamina '+c, r.costo);
  });

  // Zóclos (todos: normal, Max, zapatera, de espejo) y marcos de espejo (confirmado por el usuario):
  // proporcional según cuántas piezas de esa medida salen de una hoja de 122×244, en la melamina
  // de su color (p. ej. zóclo 10×52 → 48 por hoja → cada uno = 1/48 de hoja).
  const PIEZAS_PROPORCIONALES = ['Zóclo normal','Zóclo Max','Zóclo zapatera','Marco 10×244'];
  // Frente de espejo completo (2 marcos 10×160 + 2 marcos 10×35 + zóclos 16×52 y 18×52): se cortan
  // juntos; con sierra de 5 mm, 1 hoja da para los frentes de 5 espejos (confirmado por el usuario)
  // → 0.20 hojas por espejo, en el color del frente. Se cuenta un espejo por cada 2 marcos largos.
  // Cada pieza del frente (normal o Max) vale su parte según su área: el frente normal completo da
  // exactamente 0.20 hojas; el Max, con piezas más grandes, un poco más.
  piezas.forEach(p=>{
    if(p.estado!=='ok' || typeof p.cantidad!=='number' || (p.nombre!=='Marco de espejo' && p.nombre!=='Zóclo especial')) return;
    if(!p.colorDestino || p.colorDestino==='—') return;
    addConsumo('Melamina '+p.colorDestino, p.cantidad*fraccionPiezaFrenteEspejo(p.dim));
  });
  // Piezas sueltas de frente de espejo (conteo/garantía) y cargadores 10×40
  piezas.forEach(p=>{
    if(p.estado!=='ok' || typeof p.cantidad!=='number' || !p.colorDestino || p.colorDestino==='—') return;
    if(p.nombre==='Pieza de frente de espejo') addConsumo('Melamina '+p.colorDestino, p.cantidad*fraccionPiezaFrenteEspejo(p.dim));
    if(p.nombre==='Pieza Max suelta') addConsumo('Melamina '+p.colorDestino, p.cantidad*fraccionPiezaMax(p.dim));
    if(p.nombre==='Cargador') addConsumo('Melamina '+p.colorDestino, p.cantidad/CARGADORES_POR_HOJA);
  });
  piezas.forEach(p=>{
    if(p.estado!=='ok' || typeof p.cantidad!=='number' || !PIEZAS_PROPORCIONALES.includes(p.nombre)) return;
    const m = String(p.dim).match(/([\d.]+)\s*×\s*([\d.]+)/);
    if(!m || !p.colorDestino || p.colorDestino==='—') return;
    const porHoja = piezasPorHojaIndividual(Number(m[1]), Number(m[2]), 122, 244);
    if(porHoja>0) addConsumo('Melamina '+p.colorDestino, p.cantidad/porHoja);
  });

  // Repisas (adicional): se descuenta el proporcional de la hoja según cuántas repisas de esa
  // medida salen de una hoja de 122×244 (p. ej. si salen 8, cada repisa = 1/8 de hoja).
  piezas.forEach(p=>{
    if(p.estado!=='ok' || typeof p.cantidad!=='number' || p.nombre!=='Repisa') return;
    const m = String(p.dim).match(/([\d.]+)\s*×\s*([\d.]+)/);
    if(!m) return;
    const porHoja = piezasPorHojaIndividual(Number(m[1]), Number(m[2]), 122, 244);
    if(porHoja>0) addConsumo('Melamina '+p.colorDestino, p.cantidad/porHoja);
  });

  // Fondos MDF: cajón normal (14/hoja MDF3mm), cajón Max (12/hoja MDF5mm), cajonera con espejo (4/hoja MDF3mm)
  const fondosCajon3 = piezas.filter(p=>p.nombre==='Fondo de cajón (MDF 3mm)' && p.estado==='ok').reduce((s,p)=>s+(typeof p.cantidad==='number'?p.cantidad:0),0);
  if(fondosCajon3>0) addConsumo('MDF 3mm', fondosCajon3/14);
  const fondosCajon5Max = piezas.filter(p=>p.nombre==='Fondo de cajón (MDF 5mm, Max)' && p.estado==='ok').reduce((s,p)=>s+(typeof p.cantidad==='number'?p.cantidad:0),0);
  if(fondosCajon5Max>0) addConsumo('MDF 5mm', fondosCajon5Max/12);
  const fondosCajonera = piezas.filter(p=>p.nombre.startsWith('Fondo de cajonera') && p.estado==='ok').reduce((s,p)=>s+(typeof p.cantidad==='number'?p.cantidad:0),0);
  if(fondosCajonera>0) addConsumo('MDF 3mm', fondosCajonera/4);

  // Herrajes
  piezas.forEach(p=>{
    if(p.estado!=='ok') return;
    if(typeof p.cantidad!=='number') return;
    if(p.nombre==='Tubo') addConsumo('Tubos 1.5 m', p.cantidad);
    if(p.nombre==='Juego de bridas') addConsumo('Juegos de bridas', p.cantidad);
    if(p.nombre==='Juego de corredera') addConsumo('Juego de corredera', p.cantidad);
    if(p.nombre.startsWith('Correderas de extensión')) addConsumo('Correderas de extensión', p.cantidad);
    if(p.nombre.startsWith('Jaladera')) addConsumo('Jaladeras', p.cantidad);
    if(p.nombre.startsWith('Bisagra')) addConsumo('Bisagras', p.cantidad);
    if(p.nombre.startsWith('Push')) addConsumo('Push', p.cantidad);
    if(p.nombre==='Espejo') addConsumo('Espejos closet', p.cantidad);
  });

  return Object.keys(consumoMap).map(itemId=>({itemId, cantidad:Math.round(consumoMap[itemId]*1000)/1000}));
}

// ===== Adicionales: UI compartida entre Despiece ('d') e Instalación de mueble ('i') =====
// Tipos de adicional que pueden llevar puerta/puertitas opcionales, y cómo se llama esa
// opción en la pantalla de cada uno (zapatera = puerta; cualquier cajonera = puertitas).
const ADIC_CON_PUERTA_LABEL = {
  zapatera: '¿Lleva puerta? (172×30 cm, 1.5 bisagras, 1 jaladera)',
  cajonera: '¿Lleva puertitas de cajonera?',
  cajonera_emma: '¿Lleva puertitas de cajonera? (usa la medida de la de 5 cajones)',
  cajonera_max: '¿Lleva puertitas de cajonera Max?'
};

function renderAdicBox(prefix){
  const box = document.getElementById(prefix+'-adic-box');
  if(!box) return;
  const list = prefix==='d' ? dAdicionales : iAdicionales;
  const rows = list.map((a,idx)=>`<tr>
      <td>${TIPOS_ADICIONAL[a.tipo]}${a.tipo==='cajonera'?(' ('+a.cajones+' cajones)'):''}${a.tipo==='repisa'?(' ('+a.cantidad+' de '+fmtNum(a.largo)+'×'+fmtNum(a.fondo)+' cm)'):''}${a.tipo==='piso_zoclo'?'<div class="hint" style="margin:2px 0 0">'+(a.pz||[]).map(r=>{ const d=PISO_ZOCLO_PIEZAS.find(x=>x.k===r.k); return r.cantidad+' '+(d?d.t:r.k)+' '+r.color; }).join('<br>')+'</div>':''}${a.conPuerta?(a.tipo==='zapatera'?' + puerta':' + puertitas'):''}${a.ext?' · corredera de extensión':''}</td>
      <td>${a.tipo==='piso_zoclo'?'—':a.color}${a.colorFrente?'<div class="hint" style="margin:0">'+(a.tipo==='zapatera'?'frente (zóclos y puerta): ':'frentes y zóclos: ')+a.colorFrente+'</div>':''}</td>
      <td><button class="btn small" style="background:transparent;color:var(--bad);border:1px solid var(--line)" onclick="quitarAdicional('${prefix}',${idx})">Quitar</button></td>
    </tr>`).join('');
  box.innerHTML = `<div class="card">
    ${prefix==='d'?`<strong>Adicionales</strong>
    <p class="hint">Cajonera, entrepañera, cajonera de espejo, zapatera, repisa o piso y zóclo que se agregan aparte del modelo — no cuentan como uno de sus muebles fijos.</p>`:''}
    ${list.length? `<div class="wrap-x"><table><tr><th>Extra</th><th>Color</th><th></th></tr>${rows}</table></div>` : (prefix==='d'?'<p class="hint">Sin adicionales.</p>':'')}
    <div class="grid2" style="margin-top:8px">
      <div><label class="hint">¿Qué es?</label><select id="${prefix}-adic-tipo" style="margin-top:4px" onchange="toggleAdicionalCajones('${prefix}')">${Object.keys(TIPOS_ADICIONAL).map(k=>`<option value="${k}">${TIPOS_ADICIONAL[k]}</option>`).join('')}</select></div>
      <div><label class="hint">Color</label><select id="${prefix}-adic-color" style="margin-top:4px" onchange="const f=document.getElementById('${prefix}-adic-colorfrente'); if(f && !f.dataset.tocado) f.value=this.value; PISO_ZOCLO_PIEZAS.forEach(d=>{ const s=document.getElementById('${prefix}-pzc-'+d.k); if(s && !s.dataset.tocado) s.value=this.value; })">${MEL_COLORES.map(c=>`<option>${c}</option>`).join('')}</select></div>
    </div>
    <div id="${prefix}-adic-cajones-wrap"></div>
    <button class="btn small" style="margin-top:10px;width:100%" onclick="agregarAdicional('${prefix}')">+ Agregar este extra</button>
  </div>`;
  toggleAdicionalCajones(prefix);
}
function toggleAdicionalCajones(prefix){
  const sel = document.getElementById(prefix+'-adic-tipo');
  const wrap = document.getElementById(prefix+'-adic-cajones-wrap');
  if(!sel || !wrap) return;
  let html = (sel.value==='cajonera')
    ? `<label class="hint" style="display:block;margin-top:8px">Cantidad de cajones</label><input type="number" min="1" id="${prefix}-adic-cajones" placeholder="ej. 3">
       <label class="hint" style="display:flex;align-items:center;gap:6px;margin-top:8px"><input type="checkbox" id="${prefix}-adic-ext" style="width:auto"> Este extra lleva corredera de extensión</label>`
    : (sel.value==='cajonera_max' ? `<p class="hint" style="margin-top:8px">La Cajonera Max siempre lleva 4 cajones (confirmado; no se captura cantidad).</p>`
      : (sel.value==='cajonera_emma' ? `<label class="hint" style="display:flex;align-items:center;gap:6px;margin-top:8px"><input type="checkbox" id="${prefix}-adic-ext" style="width:auto"> Este extra lleva corredera de extensión</label>` : ''));
  if(sel.value==='repisa'){
    html = `<div class="grid2" style="margin-top:8px">
        <div><label class="hint">Largo (cm)</label><input type="number" min="1" inputmode="decimal" id="${prefix}-adic-largo" placeholder="ej. 90" style="margin-top:4px"></div>
        <div><label class="hint">Fondo (cm)</label><input type="number" min="1" inputmode="decimal" id="${prefix}-adic-fondo" placeholder="ej. 30" style="margin-top:4px"></div>
      </div>
      <label class="hint" style="display:block;margin-top:8px">¿Cuántas repisas?</label>
      <div class="chips" style="margin-top:4px" id="${prefix}-adic-cant-wrap">${[1,2,3].map(n=>`<button type="button" class="chip ${n===1?'on':''}" data-n="${n}" onclick="this.parentNode.querySelectorAll('.chip').forEach(b=>b.classList.remove('on'));this.classList.add('on')">${n}</button>`).join('')}</div>
      <p class="hint">Se descuenta solo la parte de la hoja que usan las repisas, no la hoja completa.</p>`;
  }
  if(sel.value==='piso_zoclo'){
    const base = (document.getElementById(prefix+'-adic-color')||{}).value || 'Blanco';
    html = `<p class="hint" style="margin-top:8px">Escribe cuánto lleva de cada pieza y de qué color. Lo que dejes vacío no se descuenta.</p>
      <div class="movlist" style="margin-top:6px">${PISO_ZOCLO_PIEZAS.map(d=>`<div class="movitem" style="padding:8px 10px;gap:8px;flex-wrap:wrap"><span style="flex:1 1 120px;min-width:0"><strong>${d.t}</strong><span class="hint" style="display:block;margin:0">${d.dim}</span></span>
        <input type="number" min="0" inputmode="numeric" id="${prefix}-pz-${d.k}" placeholder="0" style="width:64px;min-width:64px;text-align:center">
        <select id="${prefix}-pzc-${d.k}" style="width:auto;min-width:110px" onchange="this.dataset.tocado='1'">${MEL_COLORES.map(c=>`<option ${c===base?'selected':''}>${c}</option>`).join('')}</select></div>`).join('')}</div>`;
  }
  if(String(sel.value).startsWith('cajonera') || sel.value==='zapatera' || String(sel.value).startsWith('entrepanera')){
    const base = (document.getElementById(prefix+'-adic-color')||{}).value || 'Blanco';
    html += `<label class="hint" style="display:block;margin-top:8px">${sel.value==='zapatera'?'Color del frente (zóclos y puerta)':(String(sel.value).startsWith('entrepanera')?'Color de los zóclos':'Color de frentes y zóclos')}</label><select id="${prefix}-adic-colorfrente" style="margin-top:4px" onchange="this.dataset.tocado='1'">${MEL_COLORES.map(c=>`<option ${c===base?'selected':''}>${c}</option>`).join('')}</select>`;
  }
  const labelPuerta = ADIC_CON_PUERTA_LABEL[sel.value];
  if(labelPuerta){
    html += `<label class="hint" style="display:flex;align-items:center;gap:6px;margin-top:8px">
      <input type="checkbox" id="${prefix}-adic-puerta" style="width:auto"> ${labelPuerta}
    </label>`;
  }
  wrap.innerHTML = html;
}
function agregarAdicional(prefix){
  const tipo = document.getElementById(prefix+'-adic-tipo').value;
  const color = document.getElementById(prefix+'-adic-color').value;
  let cajones = null;
  if(tipo==='cajonera'){
    const el = document.getElementById(prefix+'-adic-cajones');
    cajones = Number(el && el.value);
    if(!cajones || cajones<=0) return alert('Captura la cantidad de cajones del adicional.');
  } else if(tipo==='cajonera_max'){
    cajones = 4; // Confirmado por el usuario: la Cajonera Max siempre lleva 4 cajones, fijo.
  }
  const puertaEl = document.getElementById(prefix+'-adic-puerta');
  const conPuerta = !!(puertaEl && puertaEl.checked);
  const nuevo = {tipo, cajones, color, conPuerta};
  const extEl = document.getElementById(prefix+'-adic-ext'); if((tipo==='cajonera' || tipo==='cajonera_emma') && extEl && extEl.checked) nuevo.ext = true;
  const cf = document.getElementById(prefix+'-adic-colorfrente');
  if(cf && (String(tipo).startsWith('cajonera') || tipo==='zapatera' || String(tipo).startsWith('entrepanera')) && cf.value && cf.value!==color) nuevo.colorFrente = cf.value;
  if(tipo==='piso_zoclo'){
    nuevo.pz = PISO_ZOCLO_PIEZAS.map(d=>({k:d.k, cantidad:Math.round(Number((document.getElementById(prefix+'-pz-'+d.k)||{}).value)||0), color:(document.getElementById(prefix+'-pzc-'+d.k)||{}).value||color})).filter(r=>r.cantidad>0);
    if(!nuevo.pz.length) return alert('Escribe cuánto lleva de al menos una pieza (maletero, marco, cargador o zóclo).');
  }
  if(tipo==='repisa'){
    const largo = Number(document.getElementById(prefix+'-adic-largo').value);
    const fondo = Number(document.getElementById(prefix+'-adic-fondo').value);
    if(!largo || !fondo || largo<=0 || fondo<=0) return alert('Escribe el largo y el fondo de la repisa en centímetros.');
    if(piezasPorHojaIndividual(largo, fondo, 122, 244)<1) return alert('Esa repisa no cabe en una hoja de 122×244 cm. Revisa la medida.');
    const on = document.querySelector('#'+prefix+'-adic-cant-wrap .chip.on');
    nuevo.largo = largo; nuevo.fondo = fondo; nuevo.cantidad = on ? Number(on.dataset.n) : 1;
  }
  (prefix==='d' ? dAdicionales : iAdicionales).push(nuevo);
  renderAdicBox(prefix);
}
function quitarAdicional(prefix, idx){
  (prefix==='d' ? dAdicionales : iAdicionales).splice(idx,1);
  renderAdicBox(prefix);
}

function renderDesp(){
  $('#main').innerHTML = `
  <div class="card">
    <strong>Producción / Despiece</strong>
    <p class="hint">Elige el modelo exacto, o arma tu propia combinación de muebles por familia. Si algo no está documentado, se marca como "Pendiente" en vez de inventarse.</p>
    <label class="hint" style="display:flex;align-items:center;gap:6px;margin-top:8px">
      <input type="checkbox" id="d-modo-comp" ${dModoComp?'checked':''} onchange="dModoComp=document.getElementById('d-modo-comp').checked; renderDSelector();"> Armar por combinación de muebles (entrepañera / cajonera / Emma / espejo / Max)
    </label>
    <div id="d-selector-wrap" style="margin-top:8px"></div>
    <div class="grid2" style="margin-top:8px">
      <select id="d-color" onchange="syncTodoColor('d')">${MEL_COLORES.map(c=>`<option>${c}</option>`).join('')}</select>
      <select id="d-color-cajonera">${MEL_COLORES.map(c=>`<option>${c}</option>`).join('')}</select>
    </div>
    <p class="hint" style="margin:2px 0 0">El segundo color es para cajonera(s)/cajonera de espejo, independiente del frente.</p>
    <label class="hint" style="display:flex;align-items:center;gap:6px;margin-top:8px">
      <input type="checkbox" id="d-todocolor" style="width:auto" onchange="syncTodoColor('d')"> Cliente pidió "todo de un solo color"
    </label>
    <label class="hint" style="display:flex;align-items:center;gap:6px;margin-top:8px">
      <input type="checkbox" id="d-corredera-ext" style="width:auto"> Las cajoneras del modelo llevan corredera de extensión (los adicionales se marcan aparte; la Cajonera Max siempre lleva extensión)
    </label>
    <button class="btn" style="margin-top:10px" onclick="calcDespiece()">Calcular despiece</button>
  </div>
  <div id="d-adic-box"></div>
  <div id="d-result"></div>`;
  renderDSelector();
  renderAdicBox('d');
}

function renderDSelector(){
  const wrap = document.getElementById('d-selector-wrap');
  if(!wrap) return;
  if(dModoComp){
    if(!dFamiliaComp) dFamiliaComp = FAMILIAS_COMP[0];
    const n = NUM_MUEBLES_FAM[dFamiliaComp];
    if(dMueblesComp.length!==n) dMueblesComp = Array.from({length:n},()=>({value:'entrepanera',cajones:null}));
    wrap.innerHTML = `
      <select id="d-familia-comp" onchange="dFamiliaComp=this.value; dMueblesComp=[]; renderDSelector();">${FAMILIAS_COMP.map(f=>`<option ${f===dFamiliaComp?'selected':''}>${f}</option>`).join('')}</select>
      <p class="hint" style="margin:6px 0 0">${dFamiliaComp} tiene ${n} mueble(s) fijo(s). Elige qué es cada uno:</p>
      ${dMueblesComp.map((m,i)=>`
        <div class="grid2" style="margin-top:6px">
          <select onchange="dMueblesComp[${i}].value=this.value; renderDSelector();">
            ${MUEBLE_TIPO_OPCIONES.map(o=>`<option value="${o.value}" ${o.value===m.value?'selected':''}>Mueble ${i+1}: ${o.label}</option>`).join('')}
          </select>
          ${m.value==='cajonera_otra'?`<input type="number" min="0" placeholder="Cantidad de cajones" value="${m.cajones||''}" oninput="dMueblesComp[${i}].cajones=Number(this.value)">`:'<div></div>'}
        </div>`).join('')}

      ${dFamiliaComp==='Doble Especial'?`<label class="hint" style="display:flex;align-items:center;gap:6px;margin-top:8px"><input type="checkbox" id="d-especial3m-comp" style="width:auto"> Es variante a 3 metros (maletero chico extra)</label>`:''}
    `;
  } else {
    wrap.innerHTML = `<select id="d-modelo" onchange="renderDespMaxToggle()">${modeloOptionsHtml()}</select><div id="d-max-wrap"></div>`;
    renderDespMaxToggle();
  }
}

function renderDespMaxToggle(){
  const m = MODELOS.find(x=>x.nombre===$('#d-modelo').value);
  const wrap = document.getElementById('d-max-wrap');
  if(!wrap) return;
  wrap.innerHTML = (m.maxDisponible ? `<label class="hint" style="display:flex;align-items:center;gap:6px;margin-top:4px"><input type="checkbox" id="d-max" style="width:auto"> Es versión Max (cajoneras y entrepañeras Max; el maletero chico pasa a grande)</label>` : '')
    + (m.especial3mDisponible ? `<label class="hint" style="display:flex;align-items:center;gap:6px;margin-top:4px"><input type="checkbox" id="d-especial3m" style="width:auto"> Es variante a 3 metros (maletero chico extra)</label>` : '');
}

function calcDespiece(){
  const color = $('#d-color').value;
  const todoColor = $('#d-todocolor').checked;
  const colorCajonera = $('#d-color-cajonera').value;
  const correderaExt = document.getElementById('d-corredera-ext') ? document.getElementById('d-corredera-ext').checked : false;
  let piezasModelo, maxNota, titulo, notaModelo=null;
  if(dModoComp){
    const maxOn = false; // en combinación, lo Max lo definen los muebles elegidos
    const especial3m = dFamiliaComp==='Doble Especial' && document.getElementById('d-especial3m-comp') ? document.getElementById('d-especial3m-comp').checked : false;
    const incompletos = dMueblesComp.filter(m=>m.value==='cajonera_otra' && !m.cajones);
    if(incompletos.length) return alert('Captura la cantidad de cajones en los muebles "Cajonera (otra cantidad)".');
    const r = buildComposicion(dFamiliaComp, dMueblesComp, color, todoColor, maxOn, colorCajonera, especial3m, correderaExt);
    piezasModelo = r.piezas; maxNota = r.maxNota;
    titulo = dFamiliaComp+' — combinación: '+dMueblesComp.map(m=>MUEBLE_TIPO_OPCIONES.find(o=>o.value===m.value).label).join(' + ')+(especial3m?' · a 3 metros':'');
  } else {
    const modelo = MODELOS.find(x=>x.nombre===$('#d-modelo').value);
    const maxOn = modelo.maxDisponible && document.getElementById('d-max') ? document.getElementById('d-max').checked : false;
    const especial3m = modelo.especial3mDisponible && document.getElementById('d-especial3m') ? document.getElementById('d-especial3m').checked : false;
    const r = buildDespiece(modelo.fam, modelo.cajones, modelo.espejos, color, todoColor, maxOn, colorCajonera, especial3m, correderaExt);
    piezasModelo = r.piezas; maxNota = r.maxNota;
    titulo = modelo.nombre+(especial3m?' · a 3 metros':''); notaModelo = modelo.nota;
  }
  const piezasAdic = dAdicionales.flatMap(a=>buildAdicionalPiezas(a.tipo, a.cajones, a.color, !!a.ext, a.conPuerta, a)); // cada extra con su propia corredera
  const piezas = piezasModelo.concat(piezasAdic);
  const consumo = piezasAConsumo(piezas, color);

  let html = `<div class="card"><h3>${titulo}${dAdicionales.length?' + '+dAdicionales.length+' adicional(es)':''}</h3>
    ${notaModelo? `<div class="warn">${notaModelo}</div>`:''}
    ${maxNota? `<div class="warn">${maxNota}</div>`:''}
    <div class="wrap-x"><table>
    <tr><th>Pieza</th><th>Cant.</th><th>Medida</th><th>Color destino</th><th>Estado</th></tr>
    ${piezas.map(p=>`<tr><td>${p.nombre}${p.nota?`<div class="tag">${p.nota}</div>`:''}</td><td>${p.cantidad}</td><td>${p.dim}</td><td>${p.colorDestino}</td>
      <td class="${p.estado==='ok'?'pos':'neg'}">${p.estado==='ok'?'Confirmado':'Pendiente'}</td></tr>`).join('')}
  </table></div></div>
  <div class="card">
    <strong>Consumo real de inventario (solo lo confirmado)</strong>
    <div class="wrap-x"><table><tr><th>Artículo</th><th>Consumo</th></tr>
    ${consumo.map(c=>`<tr><td>${CATALOGO.find(i=>i.id===c.itemId).nombre}</td><td>${c.cantidad} ${item2unidad(c.itemId)}</td></tr>`).join('')}
    </table></div>
    <p class="hint">Herrajes de espejo no confirmados (Espejo, Entrepaña con espejo) siguen sin artículo de catálogo 1 a 1; no se descuentan automáticamente. El resto de piezas "Pendiente" que aparezcan arriba tampoco se descuentan.</p>
  </div>`;
  $('#d-result').innerHTML = html;
}

// ===== Capa 4: Instalaciones / Descuentos =====
let instLog = [];
function renderInst(){
  const op = (k, ic, t, sub) => `<button class="tipobtn ${instSub===k?'on':''}" onclick="instSub='${k}';instRegreso=false;instRegresoLibre=false;instPreview=null;renderInst()"><span class="tipo-ic">${ic}</span><span><strong>${t}</strong><br><small>${sub}</small></span></button>`;
  $('#main').innerHTML = instCambio ? avisoCambioHtml()+'<div id="inst-body"></div>' : `
    <div class="card">
      <div style="font-size:17px;font-weight:800;margin-bottom:10px">🔧 ¿Qué se instaló?</div>
      <div class="tipos">
        ${op('mueble','🗄️','Clóset','Un modelo o muebles')}
        ${op('puertas','🚪','Puertas','Puertas corredizas')}
      </div>
      <button class="btn small" style="margin-top:10px;width:100%;background:transparent;color:var(--brand);border:1px solid var(--line);box-shadow:none" onclick="instSub='historial';instRegreso=false;instRegresoLibre=false;renderInst()">📅 Ver instalaciones anteriores</button>
      ${esSoloLectura()?'':`<button class="btn small" style="margin-top:8px;width:100%;background:transparent;color:#1f9d55;border:1px solid var(--line);box-shadow:none" onclick="instSub='historial';instRegreso=true;instRegresoLibre=false;renderInst()">↩️ Regresó un modelo completo → vuelve al inventario</button>
      <button class="btn small" style="margin-top:8px;width:100%;background:transparent;color:#0e8a8a;border:1px solid var(--line);box-shadow:none" onclick="irA('sob')">🧩 Regresaron piezas sueltas sin instalar → Sobrantes</button>`}
    </div>
    <div id="inst-body"></div>`;
  if(instSub==='mueble') renderInstMueble();
  else if(instSub==='puertas') renderInstPuertas();
  else renderInstHistorial();
  if(instCambio){ const f=document.getElementById(instSub==='puertas'?'p-fecha':'i-fecha'); if(f){ f.value=instCambio.fechaDia; f.disabled=true; } }
}

async function cargarInstLog(){
  try{
    const snap = await db.collection('instalacionesLog').get();
    instLog = snap.docs.map(d=>({id:d.id,...d.data()})).filter(x=>x.modulo===modulo()).sort((a,b)=>(b.fechaDia||'').localeCompare(a.fechaDia||'')||(b.fecha||'').localeCompare(a.fecha||''));
  }catch(e){ instLog=[]; }
}

async function renderInstHistorial(){
  $('#inst-body').innerHTML = `<div class="card hint">Cargando historial de ${modulo()}…</div>`;
  await cargarInstLog();
  const avisoReg = instRegreso ? `<div class="card" style="border:2px solid #1f9d55"><strong>↩️ Regresó un modelo completo</strong>
    <p class="hint" style="margin-top:4px">Todo su material (melamina, cargadores, herrajes…) vuelve al inventario; la melamina regresa como <strong>material cortado</strong>. No va a merma ni a sobrantes.</p>
    <button class="btn" style="width:100%;min-height:50px;margin-top:6px;background:linear-gradient(135deg,#1f9d55,#178045)" onclick="instSub='mueble';instRegresoLibre=true;instRegreso=false;instPreview=null;renderInst();window.scrollTo(0,0)">🗄️ Elegir el clóset que regresó</button>
    <button class="btn" style="width:100%;min-height:50px;margin-top:8px;background:linear-gradient(135deg,#1f9d55,#178045)" onclick="instSub='puertas';instRegresoLibre=true;instRegreso=false;puertaPreview=null;renderInst();window.scrollTo(0,0)">🚪 Elegir las puertas que regresaron</button>
    <p class="hint" style="margin:8px 0 0">Úsalo aunque no haya una instalación registrada: eliges el modelo, su color y sus extras, y todo se suma al inventario.${instLog.length?' Si el modelo sí se registró como instalación, también puedes buscarla abajo y tocar "↩️ Regresó completo".':''}</p>
    <p class="hint" style="margin:4px 0 0">Si solo regresaron algunas piezas, usa 🧩 Sobrantes.</p></div>` : '';
  if(instLog.length===0){ $('#inst-body').innerHTML = avisoReg + (instRegreso ? '' : `<div class="card">Aún no hay instalaciones registradas en ${modulo()}.</div>`); return; }
  const porDia = {};
  instLog.forEach(x=>{ (porDia[x.fechaDia] = porDia[x.fechaDia]||[]).push(x); });
  const dias = Object.keys(porDia).sort((a,b)=>b.localeCompare(a));
  const puede = !esSoloLectura();
  const btnCambio = x => puedeCambiarModelo(x) ? ` <button class="btn small" style="background:transparent;color:#3E5CDE;border:1px solid var(--line);box-shadow:none;white-space:nowrap;margin-top:4px" onclick="iniciarCambioModelo('${x.id}')">✏️ Cambiar modelo</button>` : '';
  const colReg = x => { if(x.cambiadaPor) return '<span class="tag" style="color:#3E5CDE;border-color:#3E5CDE">✏️ Cambiada · no cuenta</span>';
    const pc = cambioDeInstalacion(x.id); if(pc) return '<span class="tag" style="color:#3E5CDE;border-color:#3E5CDE">✏️ Cambio de modelo esperando aprobación</span>';
    return colRegBase(x) + btnCambio(x) + (esAdmin() ? ` <button class="btn small" style="background:transparent;color:var(--bad);border:1px solid var(--line);box-shadow:none;white-space:nowrap;margin-top:4px" onclick="borrarInstalacionError('${x.id}')">🗑️ Se capturó por error</button>` : ''); };
  const colRegBase = x => { const r = regresoDeInstalacion(x.id);
    if(r) return `<span class="tag pos" style="border-color:var(--ok)">↩️ Regresó</span>${r.estado==='pendiente'?' '+badgeEstado('pendiente'):''}`;
    if(!puede || x.estado==='rechazado') return '';
    if(x.estado==='pendiente') return '<span class="hint" style="margin:0">Aún sin aprobar</span>';
    return `<button class="btn small" style="background:transparent;color:#1f9d55;border:1px solid var(--line);box-shadow:none;white-space:nowrap" onclick="regresarInstalacion('${x.id}')">↩️ Regresó completo</button>`; };
  const aviso = avisoReg;
  if(esAdmin()) await cargarValoresInst();
  const regresadas = regresadasDe(movs);
  const semanaDe = {}; instLog.forEach(x=>{ const k=sabadoDe(x.fechaDia||diaLocal(x.fecha)); (semanaDe[k]=semanaDe[k]||[]).push(x); });
  const cabSemana = dia => { const sab = sabadoDe(dia); const xs = semanaDe[sab]||[]; const vale = xs.filter(x=>instCuenta(x, regresadas));
    return `<div class="card" style="border-left:6px solid #e3b341;padding:12px 14px"><strong>📅 Semana ${fCorta(sab)} – ${fCorta(finSemana(sab))}</strong>
      <div class="hint" style="margin:4px 0 0">🔧 <strong>${vale.length}</strong> instalación(es)${xs.length-vale.length?` · ${xs.length-vale.length} no cuentan (regresaron, se cambiaron o se rechazaron)`:''}${esAdmin()?` · ⭐ Valor: <strong>${fmtNum(xs.reduce((s,x)=>s+valorInstalacion(x,regresadas),0))}</strong>`:''}</div></div>`; };
  let ultimaSemana = null;
  const tagValor = x => { if(!esAdmin()) return ''; const v = valorInstalacion(x, regresadas);
    if(!instCuenta(x, regresadas)) return '<span class="tag" style="text-decoration:line-through">⭐ no cuenta</span>';
    const det = valorDetalleTxt(x);
    return `<span class="tag" style="color:#b38a1e;border-color:#b38a1e">⭐ ${fmtNum(v)}${det?' <span style="font-weight:500">('+det+')</span>':''}</span>`; };
  $('#inst-body').innerHTML = aviso + dias.map(dia=>{ const sab=sabadoDe(dia); const cab = sab!==ultimaSemana ? cabSemana(dia) : ''; ultimaSemana = sab; return cab + `
    <div class="card">
      <strong>${new Date(dia+'T00:00:00').toLocaleDateString('es-MX',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</strong>
      <div class="tag">${porDia[dia].length} instalación(es)</div>
      <div class="wrap-x" style="margin-top:6px"><table><tr><th>Tipo</th><th>Detalle</th><th>Nota</th><th>Hora</th><th>Estado</th></tr>
      ${porDia[dia].map(x=>`<tr><td>${x.categoria}</td><td style="min-width:150px">${x.cambiadaPor?`<span style="text-decoration:line-through;opacity:.6">${x.descripcion}</span>`:x.descripcion}${extrasLogHtml(x)} ${tagValor(x)}${x.cambioDe||x.cambioDeDesc?' <span class="tag" style="color:#3E5CDE;border-color:#3E5CDE">✏️ Cambio de modelo</span>':''}${(()=>{ const c=colReg(x); return c?`<div style="margin-top:6px">${c}</div>`:''; })()}</td><td>${x.nota||''}</td><td>${new Date(x.fecha).toLocaleTimeString()}</td><td>${badgeEstado(x.estado)}</td></tr>`).join('')}
      </table></div>
    </div>`; }).join('');
  if(regVolver && regInstSel){ regVolver = false; mostrarRegresoInst(); }
}

// ===== Regreso de un modelo completo (confirmado por el usuario) =====
// Un modelo que se registró como instalado pero regresó completo sin instalarse: NO va a merma ni a
// sobrantes, regresa al inventario tal cual (la melamina como material cortado, lo demás a su artículo).
// Dirección puede borrar una instalación que se capturó por error (p. ej. un regreso que se anotó
// como instalación): se borran sus movimientos y el material vuelve a como estaba. Pide PIN.
async function borrarInstalacionError(logId){
  if(!esAdmin()) return;
  const x = instLog.find(l=>l.id===logId); if(!x) return;
  const ms = movs.filter(m=>m.loteId===logId || (m.motivo==='regresoInstalacion' && m.instalacionId===logId));
  if(!confirm(`🗑️ Borrar esta instalación capturada por error:\n\n${x.descripcion} (${x.fechaDia})\n\nSe borran sus ${ms.length} movimiento(s) y el material que descontó vuelve al inventario, como si nunca se hubiera capturado. ¿Continuar?`)) return;
  if(!(await pedirPinAdmin('borrar esta instalación'))) return;
  try{
    for(const m of ms) await db.collection('movimientos').doc(m.id).delete();
    await db.collection('instalacionesLog').doc(logId).delete();
    if(x.cambioDe){ try{ await db.collection('instalacionesLog').doc(x.cambioDe).update({cambiadaPor:null}); }catch(e){} }
    movs = movs.filter(m=>!ms.includes(m));
    toast('🗑️ Instalación borrada. El material volvió al inventario.');
    renderInstHistorial();
  }catch(e){ alert('Error: '+e.message); }
}
// ===== Cambio de modelo (confirmado por el usuario) =====
// A veces en el domicilio se instala otro modelo distinto al capturado. Desde el historial se elige el
// modelo real: si la instalación aún no estaba aprobada, se reemplaza; si ya estaba aprobada, solo se
// mueve la DIFERENCIA de material (lo que el nuevo no usa regresa al inventario —las hojas como
// cortado— y lo que lleva de más se descuenta). La original deja de contar cuando se aprueba el cambio.
// Se puede cambiar hasta 7 días después de la fecha de instalación.
const DIAS_CAMBIO_MODELO = 7;
function diffConsumo(orig, nuevo){
  const m = {}; (orig||[]).forEach(c=>{ m[c.itemId]=(m[c.itemId]||0)-(Number(c.cantidad)||0); }); (nuevo||[]).forEach(c=>{ m[c.itemId]=(m[c.itemId]||0)+(Number(c.cantidad)||0); });
  const regresa=[], descuenta=[]; let iguales=0;
  Object.keys(m).forEach(id=>{ if(!CATALOGO.find(i=>i.id===id)) return; const v=Math.round(m[id]*1e6)/1e6; if(v<0) regresa.push({itemId:id, cantidad:-v}); else if(v>0) descuenta.push({itemId:id, cantidad:v}); else iguales++; });
  return {regresa, descuenta, iguales};
}
function consumoAValidar(consumo){ return (instCambio && instCambio.estado!=='pendiente') ? diffConsumo(instCambio.consumo, consumo).descuenta : consumo; }
function cambioDeInstalacion(logId){ return (instLog||[]).find(l=>l.cambioDe===logId && l.estado==='pendiente'); }
function puedeCambiarModelo(x){
  if(esSoloLectura() || x.estado==='rechazado' || x.cambiadaPor || (x.cambioDe && x.estado==='pendiente') || regresoDeInstalacion(x.id) || cambioDeInstalacion(x.id)) return false;
  const dias = Math.round((new Date(fechaHoyLocal()+'T12:00:00') - new Date((x.fechaDia||diaLocal(x.fecha))+'T12:00:00'))/86400000);
  return dias <= DIAS_CAMBIO_MODELO;
}
function iniciarCambioModelo(id){
  const x = (instLog||[]).find(l=>l.id===id); if(!x) return;
  instCambio = {logId:x.id, desc:x.descripcion, fechaDia:x.fechaDia, categoria:x.categoria, estado:x.estado, consumo:(x.consumo||[]).map(c=>({...c}))};
  instSub = x.categoria==='Puerta' ? 'puertas' : 'mueble'; instRegreso=false; instRegresoLibre=false; instPreview=null; puertaPreview=null; iAdicionales=[];
  renderInst(); window.scrollTo(0,0);
}
function cancelarCambioModelo(){ instCambio=null; instPreview=null; puertaPreview=null; instSub='historial'; renderInst(); window.scrollTo(0,0); }
function avisoCambioHtml(){
  const c = instCambio;
  return `<div class="card" style="border:2px solid #3E5CDE;background:rgba(62,92,222,.12)"><div style="font-size:16px;font-weight:800">✏️ Cambiando el modelo de una instalación</div>
    <p class="hint" style="margin:6px 0 0">Se registró: <strong>${c.desc}</strong> (${fCorta(c.fechaDia)})</p>
    <p class="hint" style="margin:4px 0 0">Elige abajo ${c.categoria==='Puerta'?'las puertas que':'el modelo que'} <strong>de verdad se instaló</strong>, con su color${c.categoria==='Puerta'?' y medidas':' y sus extras'}. La fecha se queda igual.</p>
    <button class="btn small" style="margin-top:8px;background:transparent;color:var(--bad);border:1px solid var(--line);box-shadow:none" onclick="cancelarCambioModelo()">Cancelar cambio</button></div>`;
}
function cambioPreviewHtml(consumo, accion){
  const c = instCambio; const li = arr => arr.length ? arr.map(x=>{ const it=CATALOGO.find(i=>i.id===x.itemId); return `<li>${fmtNum(x.cantidad)} ${it.unidad} ${it.nombre}</li>`; }).join('') : '<li>Nada</li>';
  let cuerpo;
  if(c.estado==='pendiente'){
    cuerpo = `<p class="hint" style="margin:8px 0 0">La instalación original todavía no está aprobada: <strong>se reemplaza por esta</strong> y Dirección aprueba el modelo nuevo. Nada se mueve del inventario hasta que se apruebe.</p>`;
  } else {
    const d = diffConsumo(c.consumo, consumo);
    cuerpo = `<div style="margin-top:12px;font-weight:800;color:#1f9d55">↩️ Regresa al inventario</div><ul style="margin:4px 0 0 18px;padding:0">${li(d.regresa.map(x=>({...x})))}</ul>
      ${d.regresa.some(x=>esHoja(CATALOGO.find(i=>i.id===x.itemId)))?'<p class="hint" style="margin:2px 0 0">Las hojas regresan como material cortado.</p>':''}
      <div style="margin-top:12px;font-weight:800;color:#e0791a">📤 Se descuenta además</div><ul style="margin:4px 0 0 18px;padding:0">${li(d.descuenta)}</ul>
      <p class="hint" style="margin:10px 0 0">✔️ ${d.iguales} artículo(s) son iguales en los dos modelos: no se mueven.</p>
      ${estadoNuevoMovimiento()==='pendiente'?'<p class="hint" style="margin:4px 0 0">⏳ Dirección tiene que aprobar el cambio. Mientras tanto todo sigue como estaba.</p>':''}`;
  }
  return `<div class="card" style="border:2px solid #3E5CDE"><div style="font-size:16px;font-weight:800">✏️ Revisa el cambio</div>
    <div class="movlist" style="margin-top:8px"><div class="movitem" style="padding:8px 10px"><span>Antes</span><strong style="text-decoration:line-through;opacity:.7;text-align:right">${c.desc.split(' · ').slice(0,2).join(' · ')}</strong></div></div>
    ${cuerpo}
    <p class="hint" style="margin:4px 0 0">⭐ La instalación vale lo del modelo nuevo, en la misma semana.</p>
    <button class="btn" style="width:100%;min-height:52px;margin-top:10px" onclick="${accion}">✅ Guardar cambio de modelo</button></div>`;
}
async function guardarCambioModelo(n){
  const c = instCambio; if(!c) return;
  await cargarInstLog();
  const L = (instLog||[]).find(l=>l.id===c.logId);
  if(!L || L.estado==='rechazado' || L.cambiadaPor) { alert('Esa instalación ya no se puede cambiar (se borró, se rechazó o ya se cambió).'); cancelarCambioModelo(); return; }
  const estado = estadoNuevoMovimiento(), creadoPor = getCurrentUserEmail?getCurrentUserEmail():'', fecha = new Date().toISOString(), mod = modulo(), newId = cryptoId();
  const antes = L.descripcion.split(' · ')[0];
  const nota = 'Cambio de modelo · antes: '+antes+(n.nota?' · '+n.nota:'');
  const mov = (it, tipo, cantidad, extra) => db.collection('movimientos').doc(cryptoId()).set({modulo:mod, itemId:it.id, itemNombre:it.nombre, tipo, cantidad:Number(cantidad), nota:`${n.desc} · ${nota}`, fecha, estado, loteId:newId, creadoPor, ...(extra||{})});
  try{
    if(L.estado==='pendiente'){
      for(const x of n.consumo){ const f=calcFormula(x.itemId); if(f.final - x.cantidad < 0) return alert('No alcanza: '+CATALOGO.find(i=>i.id===x.itemId).nombre); }
      const viejos = movs.filter(m=>m.loteId===L.id);
      for(const x of n.consumo) await mov(CATALOGO.find(i=>i.id===x.itemId), 'instalacion', x.cantidad);
      await db.collection('instalacionesLog').doc(newId).set({modulo:mod, categoria:n.categoria, descripcion:n.desc, nota, fechaDia:L.fechaDia, modeloKey:n.modeloKey, esMax:!!n.esMax, extras:n.extras||0, extrasDetalle:n.extrasDetalle||[], consumo:n.consumo, fecha, estado, creadoPor, cambioDeDesc:L.descripcion});
      for(const m of viejos) await db.collection('movimientos').doc(m.id).delete();
      await db.collection('instalacionesLog').doc(L.id).delete();
      movs = movs.filter(m=>!viejos.includes(m));
    } else {
      const d = diffConsumo(L.consumo, n.consumo);
      for(const x of d.descuenta){ const f=calcFormula(x.itemId); if(f.final - x.cantidad < 0) return alert('No alcanza: '+CATALOGO.find(i=>i.id===x.itemId).nombre); }
      for(const x of d.regresa) await mov(CATALOGO.find(i=>i.id===x.itemId), 'devolucion', x.cantidad, {motivo:'cambioModelo', instalacionId:L.id, cambioModelo:true});
      for(const x of d.descuenta) await mov(CATALOGO.find(i=>i.id===x.itemId), 'instalacion', x.cantidad, {cambioModelo:true});
      await db.collection('instalacionesLog').doc(newId).set({modulo:mod, categoria:n.categoria, descripcion:n.desc, nota, fechaDia:L.fechaDia, modeloKey:n.modeloKey, esMax:!!n.esMax, extras:n.extras||0, extrasDetalle:n.extrasDetalle||[], consumo:n.consumo, fecha, estado, creadoPor,
        cambioDe:L.id, cambio:{deDesc:L.descripcion, regresa:d.regresa, descuenta:d.descuenta}});
      if(estado==='aprobado') await db.collection('instalacionesLog').doc(L.id).update({cambiadaPor:newId});
    }
    toast(estado==='pendiente' ? '✅ Cambio de modelo guardado.<br><small>Dirección lo tiene que aprobar.</small>' : '✅ Modelo cambiado.');
    instCambio=null; instPreview=null; puertaPreview=null; iAdicionales=[]; instLog=null; instSub='historial';
    await cargarInstLog(); renderInst(); window.scrollTo(0,0);
  }catch(e){ alert('Error: '+e.message); }
}
function detalleCambioAprob(l){
  const li = arr => (arr||[]).length ? arr.map(x=>{ const it=CATALOGO.find(i=>i.id===x.itemId); return `<li>${fmtNum(x.cantidad)} ${it?it.unidad:''} ${it?it.nombre:x.itemId}</li>`; }).join('') : '<li>Nada</li>';
  return `<div style="margin-top:8px;padding:10px 12px;border-radius:12px;background:rgba(62,92,222,.10);border:1px solid rgba(62,92,222,.4)"><strong>✏️ Cambio de modelo</strong>
    <div class="hint" style="margin:4px 0 0">Antes: <span style="text-decoration:line-through">${l.cambio.deDesc}</span><br>Ahora: <strong>${l.descripcion}</strong></div>
    <div style="margin-top:8px;font-weight:700;color:#1f9d55">↩️ Regresa al inventario</div><ul style="margin:2px 0 0 18px;padding:0">${li(l.cambio.regresa)}</ul>
    <div style="margin-top:6px;font-weight:700;color:#e0791a">📤 Se descuenta además</div><ul style="margin:2px 0 0 18px;padding:0">${li(l.cambio.descuenta)}</ul>
    <div class="hint" style="margin:6px 0 0">Al aprobar, la instalación original deja de contar y cuenta esta.</div></div>`;
}
function regresoDeInstalacion(logId){
  const ms = movs.filter(m=>m.motivo==='regresoInstalacion' && m.instalacionId===logId && m.estado!=='rechazado');
  if(!ms.length) return null;
  return {estado: ms.some(m=>m.estado==='pendiente') ? 'pendiente' : 'aprobado'};
}
// Regresó completo (confirmado por el usuario): se elige qué se va a MERMA y cuánto, artículo por
// artículo — melamina, MDF y también herrajes. Todo lo demás vuelve al inventario. Para la melamina/MDF
// se pueden contar las piezas dañadas y la app las convierte a hojas. La instalación deja de contar.
let regInstSel = null, regMerma = {}, regVolver = false, regMotivo = '';
// regSob[itemId] = true → lo que no es merma de esa melamina/MDF va a 🧩 Sobrantes (apartado) en vez del inventario.
let regSob = {};
function regresarInstalacion(logId){
  const x = instLog.find(l=>l.id===logId); if(!x) return;
  if(regresoDeInstalacion(logId)) return alert('Esta instalación ya se regresó al inventario.');
  const cons = (x.consumo||[]).filter(c=>Number(c.cantidad)>0 && CATALOGO.find(i=>i.id===c.itemId));
  if(!cons.length) return alert('Esta instalación no tiene material registrado.');
  regInstSel = logId; regMerma = {}; regSob = {}; regMotivo = '';
  mostrarRegresoInst();
}
function regCons(){ const x = (instLog||[]).find(l=>l.id===regInstSel); return x ? (x.consumo||[]).filter(c=>Number(c.cantidad)>0 && CATALOGO.find(i=>i.id===c.itemId)) : []; }
function regTodo(tipo){ // 'nada' | 'hojas' | 'todo' | 'sob'
  regCons().forEach(c=>{ const h = esHojaId(c.itemId);
    if(tipo==='nada'){ delete regMerma[c.itemId]; delete regSob[c.itemId]; }
    else if(tipo==='sob'){ if(h){ regSob[c.itemId] = true; delete regMerma[c.itemId]; } }
    else if(tipo==='todo' || (tipo==='hojas' && h)){ regMerma[c.itemId] = Number(c.cantidad); delete regSob[c.itemId]; } });
  mostrarRegresoInst();
}
function regPiezas(itemId){
  const it = CATALOGO.find(i=>i.id===itemId); if(!it) return;
  regMotivo = (document.getElementById('reg-motivo')||{}).value||regMotivo;
  pzSetModo('reg'); pzVals = {}; pzMedidas = [];
  pzGrupo = it.cat==='MDF' ? AUD_GRUPO_MDF : it.nombre.replace(/^Melamina /,'');
  regPzItem = itemId; setView('pzenc'); window.scrollTo(0,0);
}
let regPzItem = null;
function usarPiezasRegreso(){
  const cons = pzConsumo(); const c = regCons().find(z=>z.itemId===regPzItem);
  const q = (cons.find(z=>z.itemId===regPzItem)||{}).cantidad || 0;
  if(!(q>0)) return alert('Cuenta primero las piezas dañadas de este material.');
  if(c && q > Number(c.cantidad)+1e-9) return alert(`Las piezas equivalen a ${fmtNum(q)} hojas y el modelo solo llevaba ${fmtNum(c.cantidad)}. Revisa las piezas.`);
  regMerma[regPzItem] = q; volverRegreso();
}
function volverRegreso(){ pzSetModo('enc'); regPzItem = null; regVolver = true; instSub='historial'; setView('inst'); }
function mostrarRegresoInst(){
  const x = (instLog||[]).find(l=>l.id===regInstSel); if(!x) return;
  const cons = regCons(); const body = document.getElementById('inst-body'); if(!body) return;
  const fila = c => { const it=CATALOGO.find(i=>i.id===c.itemId), h=esHoja(it), q=Number(c.cantidad), m=Number(regMerma[c.itemId])||0;
    return `<div class="movitem" style="padding:10px 12px;align-items:flex-start;${m>0?'border-color:var(--bad);':''}"><span style="min-width:0;flex:1"><span class="invname">${it.nombre}</span>
        <span class="hint" style="display:block;margin:2px 0 0">Regresan ${fmtNum(q)} ${it.unidad}${m>0?` · <strong class="neg">${fmtNum(m)} a merma</strong>`:''}${q-m>0.0005?(regSob[c.itemId]?` · <strong style="color:#0e8a8a">${fmtNum(q-m)} a sobrantes</strong>`:` · ${fmtNum(q-m)} al inventario`):''}</span>
        <span style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">
          <button class="btn small" style="padding:4px 10px;min-height:0;${m>=q-1e-9?'':'background:transparent;color:var(--bad);border:1px solid var(--line);box-shadow:none'}" onclick="regMerma['${c.itemId}']=${q};mostrarRegresoInst()">Todo a merma</button>
          ${m>0||regSob[c.itemId]?`<button class="btn small" style="padding:4px 10px;min-height:0;background:transparent;color:var(--ok);border:1px solid var(--line);box-shadow:none" onclick="delete regMerma['${c.itemId}'];delete regSob['${c.itemId}'];mostrarRegresoInst()">Sirve todo</button>`:''}
          ${h?`<button class="btn small" style="padding:4px 10px;min-height:0;${regSob[c.itemId]?'background:#0e8a8a':'background:transparent;color:#0e8a8a;border:1px solid var(--line);box-shadow:none'}" onclick="if(regSob['${c.itemId}']) delete regSob['${c.itemId}']; else regSob['${c.itemId}']=true; mostrarRegresoInst()">🧩 ${m>0?'El resto a sobrantes':'A sobrantes'}</button>`:''}
          ${h?`<button class="btn small" style="padding:4px 10px;min-height:0;background:transparent;color:#e0791a;border:1px solid var(--line);box-shadow:none" onclick="regPiezas('${c.itemId}')">✂️ Contar piezas dañadas</button>`:''}
        </span></span>
      <input type="number" min="0" max="${q}" step="${h?'0.01':'1'}" inputmode="decimal" placeholder="—" value="${m?fmtNum(m):''}" style="width:72px;min-width:72px;text-align:center" title="Cuánto a merma" oninput="const v=Number(this.value)||0; if(v>${q}){ this.value=${q}; } if(v>0) regMerma['${c.itemId}']=Math.min(v,${q}); else delete regMerma['${c.itemId}'];" onchange="mostrarRegresoInst()"></div>`; };
  const hojas = cons.filter(c=>esHojaId(c.itemId)), otros = cons.filter(c=>!esHojaId(c.itemId));
  const nM = Object.keys(regMerma).filter(k=>regMerma[k]>0).length, nS = cons.filter(c=>regSob[c.itemId] && Number(c.cantidad)-(Number(regMerma[c.itemId])||0)>0.0005).length;
  body.innerHTML = `<div class="card" style="border:2px solid #1f9d55">
    <div style="font-size:16px;font-weight:800">↩️ Regresó completo sin instalar</div>
    <p class="hint" style="margin:6px 0 0"><strong>${x.descripcion}</strong> (${fCorta(x.fechaDia)}). Esta instalación ya no va a contar.</p>
    <p class="hint" style="margin:6px 0 0">Todo vuelve al inventario <strong>menos lo que marques como merma</strong> (mojado, roto, dañado). En la casilla de la derecha va cuánto se va a merma.</p>
    <p class="hint" style="margin:4px 0 0">🧩 <strong>A sobrantes</strong>: la melamina/MDF queda apartada para cortarla en otras piezas; en Sobrantes se anota en qué se transformó.</p>
    <div class="row" style="gap:6px;flex-wrap:wrap;margin-top:8px">
      <button class="btn small" style="background:transparent;color:var(--ok);border:1px solid var(--line);box-shadow:none" onclick="regTodo('nada')">✅ Todo sirve</button>
      ${hojas.length?`<button class="btn small" style="background:transparent;color:#0e8a8a;border:1px solid var(--line);box-shadow:none" onclick="regTodo('sob')">🧩 Toda la melamina/MDF a sobrantes</button>`:''}
      ${hojas.length?`<button class="btn small" style="background:transparent;color:var(--bad);border:1px solid var(--line);box-shadow:none" onclick="regTodo('hojas')">🪵 Toda la melamina/MDF a merma</button>`:''}
      <button class="btn small" style="background:transparent;color:var(--bad);border:1px solid var(--line);box-shadow:none" onclick="regTodo('todo')">🗑️ Todo a merma</button>
    </div>
    ${hojas.length?`<div style="margin-top:12px;font-weight:700">🪵 Melamina / MDF</div><div class="movlist" style="margin-top:6px">${hojas.map(fila).join('')}</div>`:''}
    ${otros.length?`<div style="margin-top:12px;font-weight:700">🔩 Herrajes</div><div class="movlist" style="margin-top:6px">${otros.map(fila).join('')}</div>`:''}
    <input id="reg-motivo" placeholder="¿Por qué regresó? (opcional)" value="${String(regMotivo).replace(/"/g,'&quot;')}" oninput="regMotivo=this.value" style="margin-top:12px">
    <button class="btn" style="width:100%;min-height:54px;margin-top:10px;background:linear-gradient(135deg,#1f9d55,#178045)" onclick="confirmarRegresoInst()">${nM||nS?`↩️ Regresar${nM?` · ${nM} con merma`:''}${nS?` · ${nS} a sobrantes`:''}`:'↩️ Regresar todo al inventario'}</button>
    <button class="btn small" style="margin-top:10px;background:transparent;color:var(--brand);border:1px solid var(--line);box-shadow:none" onclick="regInstSel=null;regMerma={};regSob={};renderInstHistorial()">Cancelar</button>
  </div>`;
  window.scrollTo(0,0);
}
async function confirmarRegresoInst(){
  const logId = regInstSel; const x = instLog.find(l=>l.id===logId); if(!x) return;
  if(regresoDeInstalacion(logId)) return alert('Esta instalación ya se regresó al inventario.');
  const cons = regCons();
  const motivo = (document.getElementById('reg-motivo')||{}).value||regMotivo||'';
  const merm = cons.filter(c=>Number(regMerma[c.itemId])>0).map(c=>({c, q:Math.min(Number(regMerma[c.itemId]), Number(c.cantidad))}));
  const sobs = cons.filter(c=>regSob[c.itemId] && esHojaId(c.itemId)).map(c=>{ const m=merm.find(z=>z.c===c); return {c, q:Number(c.cantidad)-(m?m.q:0)}; }).filter(z=>z.q>0.0005);
  const txt = '↩️ Regresó sin instalar: '+x.descripcion+'\n\n'+cons.map(c=>{ const it=CATALOGO.find(i=>i.id===c.itemId); const m=merm.find(z=>z.c===c), sb=sobs.find(z=>z.c===c); const resto=Number(c.cantidad)-(m?m.q:0);
    return `• ${it.nombre}: ${[m?`${fmtNum(m.q)} a MERMA`:'', resto>0.0005?`${fmtNum(resto)} ${sb?'a SOBRANTES':'al inventario'}`:''].filter(Boolean).join(', ')}`; }).join('\n')+'\n\n¿Guardar?';
  if(!confirm(txt)) return;
  try{
    const estado = estadoNuevoMovimiento(), creadoPor = getCurrentUserEmail?getCurrentUserEmail():'', fecha = new Date().toISOString(), loteId = cryptoId();
    const fechaM = new Date(Date.parse(fecha)+1).toISOString(); // la merma va 1 ms después del regreso
    const nota = 'Regresó sin instalar · '+x.descripcion+(motivo.trim()?' · '+motivo.trim():'');
    for(const c of cons){ const it = CATALOGO.find(i=>i.id===c.itemId);
      await db.collection('movimientos').doc(cryptoId()).set({modulo:modulo(), itemId:it.id, itemNombre:it.nombre, tipo:'devolucion', motivo:'regresoInstalacion', instalacionId:logId, cantidad:Number(c.cantidad), nota, fecha, estado, loteId, creadoPor});
      const m = merm.find(z=>z.c===c);
      if(m) await db.collection('movimientos').doc(cryptoId()).set({modulo:modulo(), itemId:it.id, itemNombre:it.nombre, tipo:'merma', ...(esHoja(it)?{lado:'cortado'}:{}), motivo:'regresoMerma', instalacionId:logId, cantidad:m.q, nota:'Dañado (no sirve) · '+nota, fecha:fechaM, estado, loteId, creadoPor});
      const sb = sobs.find(z=>z.c===c);
      if(sb) await db.collection('movimientos').doc(cryptoId()).set({modulo:modulo(), itemId:it.id, itemNombre:it.nombre, tipo:'sobrante', motivo:'regresoSobrante', instalacionId:logId, cantidad:sb.q, nota:'A sobrantes · '+nota, fecha:fechaM, estado, loteId, sobranteId:loteId, creadoPor});
    }
    if(sobs.length){ // el sobrante usa el mismo id que el lote, así se aprueba junto con el regreso
      const material = sobs.map(z=>({itemId:z.c.itemId, cantidad:fmtNum(z.q)})); const restante = {}; material.forEach(mm=>{ restante[mm.itemId]=mm.cantidad; });
      await db.collection('sobrantes').doc(loteId).set({modulo:modulo(), fecha, nota:(motivo.trim()||'')+' (regresó de instalación)', lineas:[x.descripcion+' · regresó sin instalar'], lineasData:[], material, restante, estado:'abierto', transformaciones:[], creadoPor, deInstalacion:logId});
    }
    regInstSel = null; regMerma = {}; regSob = {}; regMotivo = '';
    toast(estado==='pendiente' ? '✅ Guardado.<br><small>Dirección lo aprueba.</small>' : (sobs.length?'✅ Regresó; la melamina quedó apartada en 🧩 Sobrantes.':(merm.length?'✅ Regresó; lo dañado quedó como merma.':'✅ Regresó al inventario.')));
    renderInstHistorial();
  }catch(e){ alert('Error: '+e.message); }
}
// Regreso de un modelo completo elegido a mano (sin instalación registrada): mismo cálculo que una
// instalación, pero todo se SUMA al inventario (confirmado por el usuario).
async function confirmarRegresoLibre(){
  if(!instPreview || instPreview.bloqueado || !instRegresoLibre) return;
  const nota = ($('#i-nota').value||'').trim();
  const desc = `${instPreview.modeloNombre} · ${instPreview.color}${instPreview.colorCajonera?(' · Cajonera '+instPreview.colorCajonera):''}`;
  const cons = instPreview.consumo.filter(c=>Number(c.cantidad)>0);
  if(!confirm(`↩️ Regresar al inventario:\n${desc}\n\n${cons.map(c=>{ const it=CATALOGO.find(i=>i.id===c.itemId); return `+ ${fmtNum(c.cantidad)} ${it.unidad} ${it.nombre}${esHoja(it)?' (como cortado)':''}`; }).join('\n')}\n\n¿Continuar?`)) return;
  try{
    const estado = estadoNuevoMovimiento(), creadoPor = getCurrentUserEmail?getCurrentUserEmail():'', fecha = new Date().toISOString(), loteId = cryptoId();
    for(const c of cons){ const it = CATALOGO.find(i=>i.id===c.itemId);
      await db.collection('movimientos').doc(cryptoId()).set({modulo:modulo(), itemId:it.id, itemNombre:it.nombre, tipo:'devolucion', motivo:'regresoInstalacion', modeloRegreso:desc, cantidad:fmtNum(Number(c.cantidad)), nota:'Regresó modelo completo · '+desc+(nota?' · '+nota:''), fecha, estado, loteId, creadoPor});
    }
    toast(estado==='pendiente' ? '✅ Guardado.<br><small>Dirección lo aprueba y se suma al inventario.</small>' : '✅ Modelo regresado al inventario.');
    instPreview=null; iAdicionales=[]; renderInstMueble(); window.scrollTo(0,0);
  }catch(e){ alert('Error: '+e.message); }
}
function detalleRegresoInstAprob(items, logs){
  const m = items.find(x=>x.motivo==='regresoInstalacion'); if(!m) return '';
  const l = logs.find(x=>x.id===m.instalacionId);
  return `<div style="margin-top:8px;padding:10px 12px;border-radius:12px;background:rgba(31,157,85,.10);border:1px solid rgba(31,157,85,.35)"><strong>↩️ Modelo que regresó sin instalar</strong><div class="hint" style="margin:4px 0 0">${l?l.descripcion+' · instalado el '+l.fechaDia:(m.modeloRegreso?m.modeloRegreso+' · elegido a mano (sin instalación registrada)':(m.nota||''))}</div><div class="hint" style="margin:2px 0 0">${items.some(x=>x.motivo==='regresoMerma'||x.motivo==='regresoSobrante') ? [items.some(x=>x.motivo==='regresoMerma')?'🗑️ A <strong>merma</strong> (dañado): '+items.filter(x=>x.motivo==='regresoMerma').map(x=>fmtNum(x.cantidad)+' '+x.itemNombre).join(', ')+'.':'', items.some(x=>x.motivo==='regresoSobrante')?'🧩 A <strong>sobrantes</strong> (para cortarse en otras piezas): '+items.filter(x=>x.motivo==='regresoSobrante').map(x=>fmtNum(x.cantidad)+' '+x.itemNombre).join(', ')+'.':'', 'Lo demás vuelve al inventario.'].filter(Boolean).join('<br>') : 'Todo vuelve al inventario (la melamina como cortado).'}</div></div>`;
}

let iFamSel = null; // familia elegida (para no mostrar todos los modelos juntos)
function renderInstMueble(){
  const hoy = new Date(); const hoyStr = new Date(hoy.getTime()-hoy.getTimezoneOffset()*60000).toISOString().slice(0,10);
  const reg = instRegresoLibre;
  $('#inst-body').innerHTML = `
  ${reg?`<div class="card" style="border:2px solid #1f9d55"><strong>↩️ Modelo completo que regresa al inventario</strong>
    <p class="hint" style="margin-top:4px">Elige el modelo igual que en una instalación. Al confirmar, todo su material se <strong>SUMA</strong> al inventario (la melamina como material cortado).</p>
    <button class="btn small" style="background:transparent;color:var(--bad);border:1px solid var(--line);box-shadow:none" onclick="instRegresoLibre=false;instSub='historial';instRegreso=true;renderInst()">Cancelar</button></div>`:''}
  <div class="card">
    <div class="paso">1</div><strong>¿Qué modelo ${reg?'regresó':'se instaló'}?</strong>
    <div id="i-selector-wrap" style="margin-top:10px"></div>
    <div id="i-max-wrap"></div>
    <label class="row" style="margin-top:10px;gap:10px;font-size:14px;flex-wrap:nowrap"><input type="checkbox" id="i-corredera-ext" style="width:22px;min-height:22px;flex:0 0 22px"> <span>Las cajoneras <strong>del modelo</strong> llevan corredera de extensión <span class="hint" style="margin:0">(los extras se marcan aparte; la Max siempre la lleva)</span></span></label>
    <button class="btn small" style="margin-top:10px;background:transparent;color:var(--brand);border:1px solid var(--line);box-shadow:none" onclick="iModoComp=!iModoComp;renderInstMueble()">${iModoComp?'← Elegir de la lista de modelos':'¿No está el modelo? Ármalo mueble por mueble'}</button>
  </div>
  <div class="card">
    <div class="paso">2</div><strong>¿De qué color?</strong>
 <label class="hint" id="i-color-label" style="display:block;margin-top:10px">Color del frente (frentes de cajón y zóclos)</label>
    <select id="i-color" style="margin-top:4px" onchange="syncTodoColor('i')">${MEL_COLORES.map(c=>`<option>${c}</option>`).join('')}</select>
    <div id="i-cajcolor-wrap"></div>
    <label class="row" style="margin-top:12px;gap:10px;font-size:14px;flex-wrap:nowrap"><input type="checkbox" id="i-todocolor" style="width:22px;min-height:22px;flex:0 0 22px" onchange="syncTodoColor('i')"> El cliente pidió todo del mismo color (también el interior)</label>
    <p id="i-todocolor-hint" class="hint" style="display:none;margin:6px 0 0">✅ Frente, cajonera, estructura y piezas de cajón van del mismo color.</p>
  </div>
  <details class="card" ${iAdicionales.length?'open':''}>
    <summary><span class="paso">3</span><strong>¿Lleva algo extra?</strong> <span class="hint" style="margin:0 0 0 6px">(opcional)</span></summary>
    <p class="hint">Cajoneras, zapateras, repisas u otros muebles que se agregaron aparte del modelo.</p>
    <div id="i-adic-box" class="subcard"></div>
  </details>
  <div class="card">
    <div class="paso">4</div><strong>${reg?'Datos del regreso':'Datos de la instalación'}</strong>
    <div class="grid2" style="margin-top:10px">
      <div><label class="hint">Fecha</label><input id="i-fecha" type="date" value="${hoyStr}" style="margin-top:4px"></div>
      <div><label class="hint">${reg?'¿De dónde viene? (opcional)':'Cliente (opcional)'}</label><input id="i-nota" placeholder="${reg?'Cliente o motivo del regreso':'Nombre o referencia'}" style="margin-top:4px"></div>
    </div>
    <button class="btn" style="margin-top:14px;width:100%;min-height:54px;font-size:16px" onclick="previewInst()">Revisar material</button>
  </div>
  <div id="i-result"></div>`;
  renderISelector();
  renderAdicBox('i');
}

function renderISelector(){
  const wrap = document.getElementById('i-selector-wrap');
  if(!wrap) return;
  if(iModoComp){
    if(!iFamiliaComp) iFamiliaComp = FAMILIAS_COMP[0];
    const n = NUM_MUEBLES_FAM[iFamiliaComp];
    if(iMueblesComp.length!==n) iMueblesComp = Array.from({length:n},()=>({value:'entrepanera',cajones:null}));
    wrap.innerHTML = `
      <select id="i-familia-comp" onchange="iFamiliaComp=this.value; iMueblesComp=[]; renderISelector();">${FAMILIAS_COMP.map(f=>`<option ${f===iFamiliaComp?'selected':''}>${f}</option>`).join('')}</select>
      <p class="hint" style="margin:6px 0 0">${iFamiliaComp} tiene ${n} mueble(s) fijo(s). Elige qué es cada uno:</p>
      ${iMueblesComp.map((m,i)=>`
        <div class="grid2" style="margin-top:6px">
          <select onchange="iMueblesComp[${i}].value=this.value; renderISelector();">
            ${MUEBLE_TIPO_OPCIONES.map(o=>`<option value="${o.value}" ${o.value===m.value?'selected':''}>Mueble ${i+1}: ${o.label}</option>`).join('')}
          </select>
          ${m.value==='cajonera_otra'?`<input type="number" min="0" placeholder="Cantidad de cajones" value="${m.cajones||''}" oninput="iMueblesComp[${i}].cajones=Number(this.value)">`:'<div></div>'}
        </div>`).join('')}

      ${iFamiliaComp==='Doble Especial'?`<label class="hint" style="display:flex;align-items:center;gap:6px;margin-top:8px"><input type="checkbox" id="i-especial3m-comp" style="width:auto"> Es variante a 3 metros (maletero chico extra)</label>`:''}
      <label class="hint" style="display:block;margin-top:8px">Color de la cajonera / cajonera de espejo (independiente del frente)</label><select id="i-color-cajonera-comp">${MEL_COLORES.map(c=>`<option>${c}</option>`).join('')}</select>
    `;
    syncTodoColor('i');
  } else {
    const fams = [...new Set(MODELOS.map(m=>m.fam))];
    if(!iFamSel || !fams.includes(iFamSel)) iFamSel = fams[0];
    wrap.innerHTML = `<label class="hint">Familia</label>
      <div class="chips" style="margin-top:4px">${fams.map(f=>`<button type="button" class="chip ${f===iFamSel?'on':''}" onclick="iFamSel='${f}';renderISelector()">${f}</button>`).join('')}</div>
      <label class="hint" style="display:block;margin-top:10px">Modelo</label>
      <select id="i-modelo" style="margin-top:4px" onchange="renderInstMaxToggle()">${MODELOS.filter(m=>m.fam===iFamSel).map(m=>`<option value="${m.nombre}">${m.nombre}</option>`).join('')}</select>`;
    renderInstMaxToggle();
  }
}

function renderInstMaxToggle(){
  const sel = document.getElementById('i-modelo');
  const wrapMax = document.getElementById('i-max-wrap');
  const wrapCaj = document.getElementById('i-cajcolor-wrap');
  if(!sel || !wrapMax || !wrapCaj) return;
  const m = MODELOS.find(x=>x.nombre===sel.value);
  wrapMax.innerHTML = (m.maxDisponible ? `<label class="row" style="margin-top:10px;gap:10px;font-size:14px;flex-wrap:nowrap"><input type="checkbox" id="i-max" style="width:22px;min-height:22px;flex:0 0 22px"> Es versión <strong>Max</strong></label>` : '')
    + (m.especial3mDisponible ? `<label class="row" style="margin-top:10px;gap:10px;font-size:14px;flex-wrap:nowrap"><input type="checkbox" id="i-especial3m" style="width:22px;min-height:22px;flex:0 0 22px"> Es de <strong>3 metros</strong> (lleva maletero chico extra)</label>` : '');
  wrapCaj.innerHTML = (m.cajones>0 || m.espejos>0)
    ? `<label class="hint" style="display:block;margin-top:10px">Color de la cajonera${m.espejos>0?' y del mueble de espejo':''}</label><select id="i-color-cajonera" style="margin-top:4px">${MEL_COLORES.map(c=>`<option>${c}</option>`).join('')}</select>`
    : '';
  syncTodoColor('i');
}

// "Todo de un color" (confirmado por el usuario): al marcarlo, la cajonera toma en automático el
// color del frente y se bloquea; al desmarcarlo se puede elegir otra vez.
function syncTodoColor(prefix){
  const chk = document.getElementById(prefix+'-todocolor');
  const frente = document.getElementById(prefix+'-color');
  if(!chk || !frente) return;
  const ids = prefix==='i' ? ['i-color-cajonera','i-color-cajonera-comp'] : ['d-color-cajonera'];
  ids.forEach(id=>{ const sel=document.getElementById(id); if(!sel) return;
    if(chk.checked){ sel.value = frente.value; sel.disabled = true; sel.style.opacity = '.6'; }
    else { sel.disabled = false; sel.style.opacity = ''; }
  });
  const hint = document.getElementById(prefix+'-todocolor-hint'); if(hint) hint.style.display = chk.checked ? 'block' : 'none';
}

function previewInst(){
  const color = $('#i-color').value;
  const todoColor = $('#i-todocolor').checked;
  const correderaExt = document.getElementById('i-corredera-ext') ? document.getElementById('i-corredera-ext').checked : false;
  let piezasModelo, maxNota, titulo, notaModelo=null, colorCajonera, modeloKey=null, esMax=false;
  if(iModoComp){
    const maxOn = false; // en combinación, lo Max lo definen los muebles elegidos
    const especial3m = iFamiliaComp==='Doble Especial' && document.getElementById('i-especial3m-comp') ? document.getElementById('i-especial3m-comp').checked : false;
    const incompletos = iMueblesComp.filter(m=>m.value==='cajonera_otra' && !m.cajones);
    if(incompletos.length){ alert('Captura la cantidad de cajones en los muebles "Cajonera (otra cantidad)".'); return; }
    colorCajonera = document.getElementById('i-color-cajonera-comp') ? document.getElementById('i-color-cajonera-comp').value : null;
    const r = buildComposicion(iFamiliaComp, iMueblesComp, color, todoColor, maxOn, colorCajonera, especial3m, correderaExt);
    piezasModelo = r.piezas; maxNota = r.maxNota;
    titulo = iFamiliaComp+' — combinación: '+iMueblesComp.map(m=>MUEBLE_TIPO_OPCIONES.find(o=>o.value===m.value).label).join(' + ')+(especial3m?' · a 3 metros':'');
    modeloKey = 'Combinación '+iFamiliaComp; esMax = iMueblesComp.some(m=>/_max$/.test(m.value));
  } else {
    const modeloSel = MODELOS.find(x=>x.nombre===$('#i-modelo').value);
    const fam = modeloSel.fam, cajones = modeloSel.cajones, espejos = modeloSel.espejos;
    const maxOn = modeloSel.maxDisponible && document.getElementById('i-max') ? document.getElementById('i-max').checked : false;
    const especial3m = modeloSel.especial3mDisponible && document.getElementById('i-especial3m') ? document.getElementById('i-especial3m').checked : false;
    colorCajonera = (cajones>0 || espejos>0) && document.getElementById('i-color-cajonera') ? document.getElementById('i-color-cajonera').value : null;
    const r = buildDespiece(fam, cajones, espejos, color, todoColor, maxOn, colorCajonera, especial3m, correderaExt);
    piezasModelo = r.piezas; maxNota = r.maxNota;
    titulo = modeloSel.nombre+(maxOn?' Max':'')+(especial3m?' · a 3 metros':''); notaModelo = modeloSel.nota;
    modeloKey = modeloSel.nombre; esMax = maxOn;
  }
  const piezasAdic = iAdicionales.flatMap(a=>buildAdicionalPiezas(a.tipo, a.cajones, a.color, !!a.ext, a.conPuerta, a)); // cada extra con su propia corredera
  const piezas = piezasModelo.concat(piezasAdic);
  const pendientes = piezas.filter(p=>p.estado==='pendiente');
  const consumo = piezasAConsumo(piezas, color);

  // Validar existencias de cada artículo a consumir (en un cambio de modelo ya aprobado, solo lo que se descuenta de más)
  const faltantes = [];
  consumoAValidar(consumo).forEach(c=>{
    const f = calcFormula(c.itemId);
    if(f.final - c.cantidad < 0){
      faltantes.push({itemId:c.itemId, nombre:CATALOGO.find(i=>i.id===c.itemId).nombre, disponible:f.final, requerido:c.cantidad});
    }
  });

  const bloqueadoPorReceta = pendientes.length>0;
  const bloqueadoPorStock = !instRegresoLibre && faltantes.length>0; // un regreso suma, no necesita existencia
  const extrasN = iAdicionales.reduce((t,a)=>t+(a.tipo==='repisa'?((Number(a.cantidad)||1)):1),0); // cada extra vale aparte (repisa: por pieza)
  instPreview = {modeloNombre:titulo,modeloKey,esMax,extras:extrasN,extrasDetalle:iAdicionales.map(describirExtra),color,colorCajonera,piezas,consumo,pendientes,faltantes,bloqueado: bloqueadoPorReceta||bloqueadoPorStock};

  let html = `<div class="card" id="i-preview-card">
    <div style="font-size:16px;font-weight:800">${instRegresoLibre?'↩️ Esto regresa al inventario':(instCambio?'📋 Material del modelo que se instaló':'📋 Esto se va a descontar')}</div>
    <p class="hint" style="margin-top:4px"><strong>${titulo}</strong> · ${color}${colorCajonera?' · cajonera '+colorCajonera:''}${iAdicionales.length?' · ➕ '+iAdicionales.map(describirExtra).join(', '):''}</p>
    ${notaModelo? `<div class="warn">${notaModelo}</div>`:''}
    ${maxNota? `<div class="warn">${maxNota}</div>`:''}
    <div class="movlist">${consumo.map(c=>{ const f=calcFormula(c.itemId); const insuf = !instRegresoLibre && faltantes.some(x=>x.itemId===c.itemId);
      return `<div class="movitem" style="${insuf?'border-color:var(--bad)':''}"><span style="min-width:0"><span class="invname">${CATALOGO.find(i=>i.id===c.itemId).nombre}</span><span class="hint" style="display:block;margin:2px 0 0">Hay ${fmtNum(f.final)} ${item2unidad(c.itemId)}</span></span>
        <strong class="${insuf?'neg':''}" style="font-size:17px;white-space:nowrap">${fmtNum(c.cantidad)} ${item2unidad(c.itemId)}</strong></div>`;
    }).join('')}</div>
  </div>`;

  if(bloqueadoPorReceta){
    html += `<div class="card aviso"><strong>⛔ No se puede registrar todavía</strong>
      <p style="margin:6px 0">A este modelo le faltan datos que aún no están confirmados, y la app no inventa material:</p>
      <ul style="margin:6px 0 0 18px;padding:0">${pendientes.map(p=>`<li>${p.nombre}: ${p.nota}</li>`).join('')}</ul>
      <p class="hint">Avísale a Dirección para que se agregue esa información.</p></div>`;
  } else if(bloqueadoPorStock){
    html += `<div class="card aviso"><strong>⛔ No alcanza el material en ${modulo()}</strong>
      <ul style="margin:6px 0 0 18px;padding:0;line-height:1.7">${faltantes.map(f=>`<li>${f.nombre}: hay <strong>${fmtNum(f.disponible)}</strong> y se necesitan <strong>${fmtNum(f.requerido)}</strong></li>`).join('')}</ul>
      <p class="hint">Revisa que el modelo y el color sean correctos, o que ya se hayan anotado las entradas de material. No se descontó nada.</p></div>`;
  } else if(instRegresoLibre){
    html += `<div class="card"><button class="btn" style="width:100%;min-height:56px;font-size:16px;background:linear-gradient(135deg,#1f9d55,#178045)" onclick="confirmarRegresoLibre()">↩️ Regresar al inventario</button></div>`;
  } else {
    html += avisoAutoCorteHtml(consumo);
    html += instCambio ? cambioPreviewHtml(consumo, 'confirmarInst()') : `<div class="card"><button class="btn" style="width:100%;min-height:56px;font-size:16px;background:linear-gradient(135deg,#1f9d55,#178045)" onclick="confirmarInst()">✅ Confirmar instalación</button></div>`;
  }
  $('#i-result').innerHTML = html;
  const pc = document.getElementById('i-preview-card'); if(pc && pc.scrollIntoView) pc.scrollIntoView({behavior:'smooth', block:'start'});
}

// ===== Garantías (confirmado por el usuario) =====
// Material que se entrega en garantía y se descuenta del inventario. Puede ser cualquier cosa:
// una pieza (pared, entrepaño, maletero…), una pieza a medida (1 puerta —una sola, no el par—,
// marco, fijo, repisa…), un mueble armado (cajonera, cajón, cuadro) o cualquier artículo del
// inventario (jaladera, espejo, juego de correderas…). Se descuenta igual que una instalación
// (las hojas salen del material cortado; si no hay, se toman hojas provisionalmente).
let garLineas = [], garTipo = 'pieza', garSub = 'nueva', garPreview = null, garRet = null, garHistLogs = [];
let garForm = {pieza:'pared', color:'Blanco', cantidad:'', medidaNombre:'Puerta', ancho:'', alto:'', armTipo:'cajon', armVar:'normal', colorCuadro:'Blanco', colorFrente:'', ext:false, itemId:null,
  pTipo:'Normal', pAlto:'', pAncho:'', pModo:'completas', pHerrajes:true, pJaladera:'normal', pPiezas:{puerta:1, marco:0, fijo:0, paredFalsa:0, extFijo:0}};
const GAR_TIPOS = {
  puertas:{ic:'🚪', t:'Puertas', s:'Completas, 1 puerta, el fijo… (por medida del hueco)'},
  pieza:  {ic:'🧩', t:'Pieza', s:'Pared, entrepaño, maletero, frente, pieza de cajón, fondo…'},
  medida: {ic:'📐', t:'Pieza a medida', s:'Cualquier pieza con ancho y alto (marco, repisa…)'},
  armado: {ic:'📦', t:'Mueble armado', s:'Cajonera, cajón completo, cuadro de cajón'},
  item:   {ic:'🔩', t:'Herraje u otro', s:'Jaladera, espejo, correderas, bisagras…'}
};
const GAR_MEDIDA_NOMBRES = ['Puerta','Marco','Fijo','Pared falsa','Extensión de fijo','Repisa','Otra pieza'];

function describirLineaGar(l){
  if(l.tipo==='pieza'){ const p=PIEZAS_AUDIT.find(x=>x.key===l.pieza); return `${l.cantidad} × ${p?p.label:l.pieza}${p&&p.tipo==='mel'?' · '+l.color:''}`; }
  if(l.tipo==='medida') return `${l.cantidad} × ${l.nombre} de ${fmtNum(l.ancho)}×${fmtNum(l.alto)} cm · ${l.color}`;
  if(l.tipo==='armado') return `${l.cantidad} × ${describirArmado({tipo:l.armTipo, variante:l.armVar, color:l.color, colorCuadro:l.colorCuadro, colorFrente:l.colorFrente, ext:l.ext, cantidad:l.cantidad})}`;
  if(l.tipo==='item'){ const it=CATALOGO.find(i=>i.id===l.itemId); return `${l.cantidad} ${it?it.unidad:''} de ${it?it.nombre:l.itemId}`; }
  if(l.tipo==='puertas'){
    const base = `puertas "${l.pTipo}" (hueco ${fmtNum(l.pAncho)} ancho × ${fmtNum(l.pAlto)} alto) · ${l.color}`;
    if(l.pModo==='completas') return `${l.cantidad} × Juego completo de ${base} · ${l.pHerrajes?'con herrajes'+(l.pJaladera==='plana'?' (jaladera plana)':''):'sin herrajes'}`;
    const partes = Object.keys(PUERTA_PIEZA_LBL).filter(k=>(l.pPiezas||{})[k]>0).map(k=>`${l.pPiezas[k]} ${PUERTA_PIEZA_LBL[k].toLowerCase()}`);
    return `${partes.join(' + ')} de ${base}`;
  }
  return '';
}
const PUERTA_PIEZA_LBL = {puerta:'Puerta(s)', marco:'Marco(s)', fijo:'Fijo(s)', paredFalsa:'Pared(es) falsa(s)', extFijo:'Extensión(es) de fijo'};
// Cuántas piezas de cada tipo lleva un juego de puertas de ese tipo, con su medida: {puerta:{n,ancho,alto}, ...}
function piezasDisponiblesPuerta(tipo, alto, ancho){
  const out = {};
  calcularPuerta(tipo, alto, ancho, false).cortes.forEach(c=>{
    out[c.pieza] = out[c.pieza] || {n:0, ancho:c.ancho, alto:c.alto};
    out[c.pieza].n += c.cantidad;
  });
  return out;
}
// Convierte las líneas de la garantía a consumo de artículos del catálogo: [{itemId, cantidad}]
function consumoGarantia(lineas){ return consumoGarantiaDetalle(lineas).consumo; }
// {consumo:[{itemId,cantidad}], sobrantes:[{itemId,cantidad}]}. Las medias correderas de un mueble
// (hembra en cajonera, macho en cajón) salen primero de las "sin pareja"; si no hay, se abre un
// juego completo y la otra mitad regresa al inventario como "sin pareja" (sobrante).
function consumoGarantiaDetalle(lineas){
  const pool = [], medidas = {}, directo = {}, medias = {};
  lineas.forEach(l=>{
    const n = Number(l.cantidad)||0; if(!n) return;
    if(l.tipo==='pieza'){
      const p = PIEZAS_AUDIT.find(x=>x.key===l.pieza); if(!p) return;
      pool.push({nombre:p.nombre, cantidad:n, dim:p.dim, colorDestino: p.tipo==='mel'? l.color : '—', estado:'ok'});
    } else if(l.tipo==='medida'){
      (medidas[l.color] = medidas[l.color]||[]).push({ancho:Number(l.ancho), alto:Number(l.alto), cantidad:n});
    } else if(l.tipo==='armado'){
      piezasDeArmado({tipo:l.armTipo, variante:l.armVar, color:l.color, colorCuadro:l.colorCuadro, colorFrente:l.colorFrente, ext:l.ext, cantidad:n}).forEach(p=>{
        if(CORR_SUELTA_ITEM[p.nombre]) medias[p.nombre] = (medias[p.nombre]||0) + p.cantidad;
        else pool.push(p);
      });
    } else if(l.tipo==='item'){
      directo[l.itemId] = (directo[l.itemId]||0) + n;
    } else if(l.tipo==='puertas'){
      // Mismas fórmulas que Instalación de puertas, a partir de la medida del hueco.
      const r = calcularPuerta(l.pTipo, Number(l.pAlto), Number(l.pAncho), false);
      const lista = (medidas[l.color] = medidas[l.color]||[]);
      if(l.pModo==='completas'){
        r.cortes.forEach(c=>lista.push({ancho:c.ancho, alto:c.alto, cantidad:c.cantidad*n}));
        if(r.zoclos) pool.push({nombre:'Zóclo normal', cantidad:r.zoclos*n, dim:'10×52 cm', colorDestino:l.color, estado:'ok'});
        if(l.pHerrajes){
          const h = TIPOS_PUERTA_HERRAJES[l.pTipo];
          [['Rieles',h.riel],['Sistemas',h.sistema],['Bastidores',h.bastidor],[l.pJaladera==='plana'?'Jaladera plana':'Jaladeras',h.jaladera]].forEach(([nom,q])=>{
            const it=itemByName(nom); if(it && q) directo[it.id]=(directo[it.id]||0)+q*n; });
        }
      } else {
        const quiere = Object.assign({}, l.pPiezas||{});
        r.cortes.forEach(c=>{
          const toma = Math.min(quiere[c.pieza]||0, c.cantidad);
          if(toma>0){ lista.push({ancho:c.ancho, alto:c.alto, cantidad:toma}); quiere[c.pieza]-=toma; }
        });
      }
    }
  });
  const out = {};
  const porColor = {};
  pool.forEach(p=>{ (porColor[p.colorDestino] = porColor[p.colorDestino]||[]).push(p); });
  Object.keys(porColor).forEach(c=>piezasAConsumo(porColor[c], c).forEach(r=>{ out[r.itemId]=(out[r.itemId]||0)+r.cantidad; }));
  Object.keys(medidas).forEach(c=>{
    const r = hojasParaCortesCombinado(medidas[c], 122, 244);
    const it = itemByName('Melamina '+c);
    if(it && r.costo>0) out[it.id] = (out[it.id]||0) + r.costo;
  });
  const sobr = {};
  CORR_TIPOS.forEach(t=>{
    const needH = medias['Corredera hembra'+t.suf]||0, needM = medias['Corredera macho'+t.suf]||0;
    if(!needH && !needM) return;
    const hId = slug(t.hembra), mId = slug(t.macho), jId = slug(t.juego);
    const disp = id => Math.max(0, Math.floor(calcFormula(id).final - (directo[id]||0) + 1e-9));
    const useH = Math.min(needH, disp(hId)), useM = Math.min(needM, disp(mId));
    const remH = needH-useH, remM = needM-useM;
    const juegos = Math.max(remH, remM);
    if(useH) directo[hId] = (directo[hId]||0) + useH;
    if(useM) directo[mId] = (directo[mId]||0) + useM;
    if(juegos){
      directo[jId] = (directo[jId]||0) + juegos;
      if(juegos-remH>0) sobr[hId] = (sobr[hId]||0) + juegos-remH;
      if(juegos-remM>0) sobr[mId] = (sobr[mId]||0) + juegos-remM;
    }
  });
  Object.keys(directo).forEach(id=>{ if(id && id!=='undefined') out[id]=(out[id]||0)+directo[id]; });
  return {consumo: Object.keys(out).map(itemId=>({itemId, cantidad: Math.round(out[itemId]*1000)/1000})),
    sobrantes: Object.keys(sobr).map(itemId=>({itemId, cantidad:sobr[itemId]}))};
}

function renderGar(){
  if(esSoloLectura()){ garSub='historial'; }
  if(garSub==='retorno' && !garRet) garSub='regreso';
  const hoy = new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
  const top = `<div class="card">
      <div style="font-size:17px;font-weight:800">🛡️ Garantías · ${modulo()}</div>
      <p class="hint">Material que se entrega en garantía. Se descuenta del inventario al confirmar.</p>
      ${esSoloLectura()?'':`<div class="subtabs" style="margin:8px 0 0"><button class="${garSub==='nueva'?'active':''}" onclick="salirRetornoGar();garSub='nueva';renderGar()">Nueva</button><button class="${garSub==='regreso'||garSub==='retorno'?'active':''}" onclick="salirRetornoGar();garSub='regreso';renderGar()">↩️ Regreso <span id="gar-reg-n"></span></button><button class="${garSub==='historial'?'active':''}" onclick="salirRetornoGar();garSub='historial';renderGar()">Anteriores</button></div>`}
    </div>`;
  if(garSub==='historial' || garSub==='regreso'){ $('#main').innerHTML = top + (garSub==='regreso'?'<div class="card hint" style="padding:12px">Aquí quedan las garantías cuyo material dañado <strong>todavía no regresa</strong>. Cuando el cliente lo entregue, toca <strong>↩️ Registrar lo que regresó</strong>.</div>':'') + '<div id="gar-hist"><div class="card hint">Cargando…</div></div>'; renderGarHistorial(); return; }
  if(!esSoloLectura()) setTimeout(actualizarContadorRegreso, 0);
  const esRet = garSub==='retorno' && garRet;
  const topRet = esRet ? `<div class="card" style="border:2px solid var(--accent)">
      <div style="font-size:17px;font-weight:800">↩️ Lo que regresó el cliente</div>
      <p class="hint">Garantía del ${fechaGarTxt(garRet.log)}${garRet.log.cliente?' · '+garRet.log.cliente:''}${garRet.log.motivo?' · '+garRet.log.motivo:''}.<br>La lista ya trae lo que se entregó; quita o agrega si regresó algo distinto.</p>
      <button class="btn small" style="background:transparent;color:var(--bad);border:1px solid var(--line);box-shadow:none" onclick="cancelarRetornoGar()">Cancelar</button>
    </div>` : '';
  const f = garForm;
  const colorOpts = sel => MEL_COLORES.map(c=>`<option ${c===sel?'selected':''}>${c}</option>`).join('');
  const tipoBtns = Object.keys(GAR_TIPOS).map(k=>{ const x=GAR_TIPOS[k];
    return `<button class="tipobtn ${k===garTipo?'on':''}" onclick="garTipo='${k}';renderGar()"><span class="tipo-ic">${x.ic}</span><span><strong>${x.t}</strong><br><small>${x.s}</small></span></button>`; }).join('');
  let campos = '';
  if(garTipo==='puertas'){
    const al = Number(f.pAlto), an = Number(f.pAncho);
    const disp = (al && an) ? piezasDisponiblesPuerta(f.pTipo, al, an) : null;
    const medidasTxt = disp ? Object.keys(disp).map(k=>`${PUERTA_PIEZA_LBL[k]}: ${disp[k].n} de ${fmtNum(disp[k].ancho)}×${fmtNum(disp[k].alto)} cm`).join('<br>') : '';
    campos = `<label class="hint">Tipo de puerta</label>
      <select style="margin-top:4px" onchange="garForm.pTipo=this.value;renderGar()">${Object.keys(TIPOS_PUERTA).map(t=>`<option ${t===f.pTipo?'selected':''}>${t}</option>`).join('')}</select>
      <div class="grid2" style="margin-top:10px">
        <div><label class="hint">Ancho del hueco (cm)</label><input type="number" inputmode="decimal" style="margin-top:4px" value="${f.pAncho}" onchange="garForm.pAncho=this.value;renderGar()" placeholder="ej. 180"></div>
        <div><label class="hint">Alto del hueco (cm)</label><input type="number" inputmode="decimal" style="margin-top:4px" value="${f.pAlto}" onchange="garForm.pAlto=this.value;renderGar()" placeholder="ej. 240"></div>
      </div>
      <label class="hint" style="display:block;margin-top:10px">Color</label><select style="margin-top:4px" onchange="garForm.color=this.value">${colorOpts(f.color)}</select>
      <label class="hint" style="display:block;margin-top:12px">¿Qué se va a dar?</label>
      <div class="subtabs" style="margin-top:4px"><button class="${f.pModo==='completas'?'active':''}" onclick="garForm.pModo='completas';renderGar()">Puertas completas</button><button class="${f.pModo==='piezas'?'active':''}" onclick="garForm.pModo='piezas';renderGar()">Solo algunas piezas</button></div>
      ${f.pModo==='completas' ? `
        <label class="row" style="margin-top:10px;gap:10px;font-size:15px;flex-wrap:nowrap;font-weight:700"><input type="checkbox" style="width:24px;min-height:24px;flex:0 0 24px" ${f.pHerrajes?'checked':''} onchange="garForm.pHerrajes=this.checked;renderGar()"> ¿También lleva herrajes?</label>
        ${f.pHerrajes ? `<p class="hint">Riel, sistema, bastidor y jaladeras, igual que en una instalación.</p>
          <label class="hint">Jaladera</label><select style="margin-top:4px" onchange="garForm.pJaladera=this.value"><option value="normal" ${f.pJaladera!=='plana'?'selected':''}>Normal</option><option value="plana" ${f.pJaladera==='plana'?'selected':''}>Plana</option></select>` : '<p class="hint">Solo se descuenta la melamina de las puertas, marcos y fijo.</p>'}
        <label class="hint" style="display:block;margin-top:10px">¿Cuántos juegos?</label><input type="number" min="1" inputmode="numeric" style="margin-top:4px" value="${f.cantidad}" oninput="garForm.cantidad=this.value" placeholder="1">`
      : (disp ? `<p class="hint">Escribe cuántas de cada pieza (por ejemplo, 1 puerta y 1 fijo):</p>
        <div class="movlist">${Object.keys(disp).map(k=>`<label class="movitem"><span style="min-width:0"><span class="invname">${PUERTA_PIEZA_LBL[k]}</span><span class="hint" style="display:block;margin:2px 0 0">${fmtNum(disp[k].ancho)}×${fmtNum(disp[k].alto)} cm · el juego lleva ${disp[k].n}</span></span>
          <input type="number" min="0" max="${disp[k].n}" inputmode="numeric" value="${f.pPiezas[k]||''}" oninput="garForm.pPiezas['${k}']=Number(this.value)" placeholder="—"></label>`).join('')}</div>`
        : '<p class="hint">Escribe primero el ancho y el alto del hueco para ver las piezas.</p>')}
      ${disp && f.pModo==='completas' ? `<p class="hint" style="margin-top:10px"><strong>Medidas calculadas:</strong><br>${medidasTxt}</p>` : ''}`;
  } else if(garTipo==='pieza'){
    const p = PIEZAS_AUDIT.find(x=>x.key===f.pieza) || PIEZAS_AUDIT[0];
    campos = `<label class="hint">¿Qué pieza?</label>
      <select style="margin-top:4px" onchange="garForm.pieza=this.value;renderGar()">${PIEZAS_AUDIT.map(x=>`<option value="${x.key}" ${x.key===p.key?'selected':''}>${x.label} (${x.dim})</option>`).join('')}</select>
      <div class="grid2" style="margin-top:10px">
        ${p.tipo==='mel'?`<div><label class="hint">Color</label><select style="margin-top:4px" onchange="garForm.color=this.value">${colorOpts(f.color)}</select></div>`:'<div class="hint" style="margin-top:22px">Es de MDF (sin color)</div>'}
        <div><label class="hint">¿Cuántas?</label><input type="number" min="1" inputmode="numeric" style="margin-top:4px" value="${f.cantidad}" oninput="garForm.cantidad=this.value" placeholder="1"></div>
      </div>`;
  } else if(garTipo==='medida'){
    campos = `<label class="hint">¿Qué pieza?</label>
      <div class="chips" style="margin-top:4px">${GAR_MEDIDA_NOMBRES.map(n=>`<button type="button" class="chip ${n===f.medidaNombre?'on':''}" onclick="garForm.medidaNombre='${n}';renderGar()">${n}</button>`).join('')}</div>
      ${f.medidaNombre==='Puerta'?'<p class="hint">Una sola puerta (no el par). Si son las dos, pon cantidad 2.</p>':''}
      <div class="grid2" style="margin-top:10px">
        <div><label class="hint">Ancho (cm)</label><input type="number" min="1" inputmode="decimal" style="margin-top:4px" value="${f.ancho}" oninput="garForm.ancho=this.value" placeholder="ej. 104"></div>
        <div><label class="hint">Alto (cm)</label><input type="number" min="1" inputmode="decimal" style="margin-top:4px" value="${f.alto}" oninput="garForm.alto=this.value" placeholder="ej. 232"></div>
        <div><label class="hint">Color</label><select style="margin-top:4px" onchange="garForm.color=this.value">${colorOpts(f.color)}</select></div>
        <div><label class="hint">¿Cuántas?</label><input type="number" min="1" inputmode="numeric" style="margin-top:4px" value="${f.cantidad}" oninput="garForm.cantidad=this.value" placeholder="1"></div>
      </div>
      <p class="hint">Se descuenta la parte de la hoja que usa; si la pieza ocupa la hoja entera (como una puerta), se descuenta 1 hoja.</p>`;
  } else if(garTipo==='armado'){
    const esCaj = f.armTipo==='cajonera';
    const vars = esCaj ? ARMADO_CAJONERAS : {normal:'Normal', max:'Max'};
    if(!vars[f.armVar]) f.armVar = Object.keys(vars)[0];
    const tipos = {cajonera:'Cajonera (sin cajones)', cajon:'Cajón completo', cuadro_fondo:'Cuadro de cajón con fondo', cuadro_sin:'Cuadro de cajón sin fondo'};
    campos = `<label class="hint">¿Qué mueble?</label>
      <select style="margin-top:4px" onchange="garForm.armTipo=this.value;renderGar()">${Object.keys(tipos).map(k=>`<option value="${k}" ${k===f.armTipo?'selected':''}>${tipos[k]}</option>`).join('')}</select>
      <div class="grid2" style="margin-top:10px">
        <div><label class="hint">Tipo</label><select style="margin-top:4px" onchange="garForm.armVar=this.value;renderGar()">${Object.keys(vars).map(k=>`<option value="${k}" ${k===f.armVar?'selected':''}>${vars[k]}</option>`).join('')}</select></div>
        <div><label class="hint">${esCaj?'Color de la cajonera':(f.armTipo==='cajon'?'Color del frente':'Color del cuadro')}</label><select style="margin-top:4px" onchange="garForm.color=this.value">${colorOpts(f.color)}</select></div>
        ${f.armTipo==='cajon'?`<div><label class="hint">Color del cuadro</label><select style="margin-top:4px" onchange="garForm.colorCuadro=this.value">${colorOpts(f.colorCuadro)}</select></div>`:''}
        ${esCaj?`<div><label class="hint">Color de frentes y zóclos</label><select style="margin-top:4px" onchange="garForm.colorFrente=this.value">${colorOpts(f.colorFrente||f.color)}</select></div>`:''}
        <div><label class="hint">¿Cuántos?</label><input type="number" min="1" inputmode="numeric" style="margin-top:4px" value="${f.cantidad}" oninput="garForm.cantidad=this.value" placeholder="1"></div>
      </div>
      ${(f.armTipo==='cajonera'||f.armTipo==='cajon') && f.armVar!=='max' ? `<label class="row" style="margin-top:10px;gap:10px;font-size:14px;flex-wrap:nowrap"><input type="checkbox" style="width:22px;min-height:22px;flex:0 0 22px" ${f.ext?'checked':''} onchange="garForm.ext=this.checked"> Lleva corredera de extensión</label>`:''}
      ${(f.armTipo==='cajonera'||f.armTipo==='cajon')?(garSub==='retorno'?'<p class="hint">Incluye sus correderas (la cajonera trae las hembras y el cajón el macho).</p>':'<p class="hint">Incluye sus correderas: primero se usan las hembras/machos <strong>sin pareja</strong>; si no hay, se abre un juego y la otra mitad queda como "sin pareja".</p>'):''}`;
  } else {
    if(!f.itemId) f.itemId = (itemByName('Jaladeras')||CATALOGO[0]).id;
    const cats = [...new Set(CATALOGO.map(i=>i.cat))];
    campos = `<label class="hint">¿Qué artículo?</label>
      <select style="margin-top:4px" onchange="garForm.itemId=this.value;renderGar()">${cats.map(c=>`<optgroup label="${c}">${CATALOGO.filter(i=>i.cat===c).map(i=>`<option value="${i.id}" ${i.id===f.itemId?'selected':''}>${i.nombre}</option>`).join('')}</optgroup>`).join('')}</select>
      <label class="hint" style="display:block;margin-top:10px">¿Cuántos? (${item2unidad(f.itemId)})</label>
      <input type="number" min="0" inputmode="decimal" style="margin-top:4px" value="${f.cantidad}" oninput="garForm.cantidad=this.value" placeholder="1">`;
  }
  const lista = garLineas.length ? `<div class="movlist">${garLineas.map((l,i)=>`<div class="movitem"><span style="min-width:0">${describirLineaGar(l)}</span><button class="btn small" style="background:transparent;color:var(--bad);border:1px solid var(--line);box-shadow:none;flex:0 0 auto" onclick="garLineas.splice(${i},1);garPreview=null;if(garRet)garRet.comps=null;renderGar()">Quitar</button></div>`).join('')}</div>` : '<p class="hint">Todavía no agregas nada.</p>';
  if(garSub==='sobrante'){ renderSobranteNuevo(lista, campos); return; }
  if(esRet){
    $('#main').innerHTML = topRet + `
    <div class="card">
      <div class="paso">1</div><strong>Lo que regresó (${garLineas.length})</strong>
      <div style="margin-top:10px">${lista}</div>
      <details style="margin-top:10px"><summary class="hint"><strong>+ Agregar algo más que regresó</strong></summary>
        <div class="tipos" style="margin-top:10px">${tipoBtns}</div>
        <div style="margin-top:12px">${campos}</div>
        <button class="btn" style="margin-top:12px;width:100%" onclick="agregarLineaGar()">+ Agregar</button>
      </details>
    </div>
    <div class="card">
      <div class="paso">2</div><strong>¿Qué sirve, qué va a sobrantes y qué es merma?</strong>
      <p class="hint">La app separa lo que regresó en sus piezas y herrajes. Marca cada uno: <strong>✅ Sirve</strong> regresa al inventario; <strong>🧩 Sobrante</strong> (solo melamina/MDF) se aparta para aprovecharse después; <strong>🗑️ Merma</strong> solo queda anotado.</p>
      <button class="btn" style="width:100%;min-height:50px" onclick="separarRetornoGar()">Separar en piezas</button>
    </div>
    <div id="g-result"></div>`;
    if(garRet.comps) renderRetornoComps();
    return;
  }
  $('#main').innerHTML = top + `
    <div class="card">
      <div class="paso">1</div><strong>¿Qué se va a dar?</strong>
      <div class="tipos" style="margin-top:10px">${tipoBtns}</div>
      <div style="margin-top:12px">${campos}</div>
      <button class="btn" style="margin-top:12px;width:100%" onclick="agregarLineaGar()">+ Agregar a la garantía</button>
    </div>
    <div class="card">
      <div class="paso">2</div><strong>Lo que lleva esta garantía (${garLineas.length})</strong>
      <div style="margin-top:10px">${lista}</div>
    </div>
    <div class="card">
      <div class="paso">3</div><strong>Datos</strong>
      <div class="grid2" style="margin-top:10px">
        <div><label class="hint">Fecha</label><input id="g-fecha" type="date" value="${hoy}" style="margin-top:4px"></div>
        <div><label class="hint">Cliente</label><input id="g-cliente" placeholder="Nombre o folio" style="margin-top:4px"></div>
      </div>
      <label class="hint" style="display:block;margin-top:10px">¿Por qué? (motivo)</label>
      <input id="g-motivo" placeholder="ej. puerta rayada, cajón roto" style="margin-top:4px">
      ${fotoPickerHtml('gar','Foto del daño (opcional)')}
      <button class="btn" style="margin-top:14px;width:100%;min-height:54px;font-size:16px" onclick="previewGar()">Revisar material</button>
    </div>
    <div id="g-result"></div>`;
}
function agregarLineaGar(){
  const f = garForm;
  const n = Number(f.cantidad) || (garTipo==='item' ? 0 : 1);
  if(!n || n<=0) return alert('Escribe la cantidad.');
  let l;
  if(garTipo==='pieza'){ const p = PIEZAS_AUDIT.find(x=>x.key===f.pieza)||PIEZAS_AUDIT[0]; l = {tipo:'pieza', pieza:p.key, color:f.color, cantidad:n}; }
  else if(garTipo==='medida'){
    const an = Number(f.ancho), al = Number(f.alto);
    if(!an || !al) return alert('Escribe el ancho y el alto en centímetros.');
    if(piezasPorHojaIndividual(an, al, 122, 244)<1) return alert('Esa pieza no cabe en una hoja de 122×244 cm. Revisa la medida.');
    l = {tipo:'medida', nombre:f.medidaNombre, ancho:an, alto:al, color:f.color, cantidad:n};
  }
  else if(garTipo==='puertas'){
    const al = Number(f.pAlto), an = Number(f.pAncho);
    if(!al || !an) return alert('Escribe el ancho y el alto del hueco en centímetros.');
    if(f.pModo==='piezas'){
      const disp = piezasDisponiblesPuerta(f.pTipo, al, an);
      const pp = {}; let total = 0;
      Object.keys(disp).forEach(k=>{ const v=Math.min(Number(f.pPiezas[k])||0, disp[k].n); if(v>0){ pp[k]=v; total+=v; } });
      if(!total) return alert('Elige cuántas piezas se van a dar (por ejemplo 1 puerta).');
      l = {tipo:'puertas', pTipo:f.pTipo, pAlto:al, pAncho:an, color:f.color, pModo:'piezas', pPiezas:pp, cantidad:1};
    } else {
      l = {tipo:'puertas', pTipo:f.pTipo, pAlto:al, pAncho:an, color:f.color, pModo:'completas', pHerrajes:!!f.pHerrajes, pJaladera:f.pJaladera, cantidad:n};
    }
  }
  else if(garTipo==='armado'){ l = {tipo:'armado', armTipo:f.armTipo, armVar:f.armVar, color:f.color, colorCuadro:f.colorCuadro, colorFrente:(f.armTipo==='cajonera' && f.colorFrente && f.colorFrente!==f.color)?f.colorFrente:undefined, ext: (f.armTipo==='cajonera'||f.armTipo==='cajon') && f.armVar!=='max' ? !!f.ext : false, cantidad:n}; }
  else { l = {tipo:'item', itemId:f.itemId, cantidad:n}; }
  garLineas.push(l);
  garForm.cantidad=''; garForm.ancho=''; garForm.alto='';
  garPreview = null;
  if(garRet) garRet.comps = null;
  renderGar();
  toast('Agregado: '+describirLineaGar(l));
}
function previewGar(){
  if(!garLineas.length) return alert('Primero agrega lo que se va a dar en garantía (paso 1).');
  const det = consumoGarantiaDetalle(garLineas);
  const consumo = det.consumo;
  const faltantes = consumo.map(c=>({c, f:calcFormula(c.itemId)})).filter(x=>x.f.final - x.c.cantidad < -1e-9)
    .map(x=>({nombre:CATALOGO.find(i=>i.id===x.c.itemId).nombre, disponible:x.f.final, requerido:x.c.cantidad}));
  garPreview = {consumo, sobrantes: det.sobrantes, bloqueado: faltantes.length>0};
  let html = `<div class="card" id="g-preview-card">
    <div style="font-size:16px;font-weight:800">📋 Esto se va a descontar</div>
    <div class="movlist">${consumo.map(c=>{ const f=calcFormula(c.itemId); const insuf = f.final-c.cantidad<0;
      return `<div class="movitem" style="${insuf?'border-color:var(--bad)':''}"><span style="min-width:0"><span class="invname">${CATALOGO.find(i=>i.id===c.itemId).nombre}</span><span class="hint" style="display:block;margin:2px 0 0">Hay ${fmtNum(f.final)} ${item2unidad(c.itemId)}</span></span>
        <strong class="${insuf?'neg':''}" style="font-size:17px;white-space:nowrap">${fmtNum(c.cantidad)} ${item2unidad(c.itemId)}</strong></div>`; }).join('')}</div>
    ${det.sobrantes.length?`<div class="hint" style="margin-top:10px">🔩 Se abre un juego de corredera y sobra la otra mitad; regresa al inventario:<br>${det.sobrantes.map(x=>`+ ${fmtNum(x.cantidad)} ${CATALOGO.find(i=>i.id===x.itemId).nombre}`).join('<br>')}</div>`:''}
  </div>`;
  if(faltantes.length){
    html += `<div class="card aviso"><strong>⛔ No alcanza el material en ${modulo()}</strong>
      <ul style="margin:6px 0 0 18px;padding:0;line-height:1.7">${faltantes.map(f=>`<li>${f.nombre}: hay <strong>${fmtNum(f.disponible)}</strong> y se necesitan <strong>${fmtNum(f.requerido)}</strong></li>`).join('')}</ul>
      <p class="hint">No se descontó nada.</p></div>`;
  } else {
    html += avisoAutoCorteHtml(consumo);
    html += `<div class="card"><button class="btn" style="width:100%;min-height:56px;font-size:16px;background:linear-gradient(135deg,#1f9d55,#178045)" onclick="confirmarGar()">✅ Confirmar garantía</button></div>`;
  }
  $('#g-result').innerHTML = html;
  const pc = document.getElementById('g-preview-card'); if(pc && pc.scrollIntoView) pc.scrollIntoView({behavior:'smooth', block:'start'});
}
async function confirmarGar(){
  if(!garPreview || garPreview.bloqueado) return;
  const cliente = ($('#g-cliente').value||'').trim();
  const motivo = ($('#g-motivo').value||'').trim();
  const fechaDia = $('#g-fecha').value;
  const mod = modulo();
  for(const c of garPreview.consumo){ if(calcFormula(c.itemId).final - c.cantidad < -1e-9) return alert('El inventario cambió; vuelve a revisar el material.'); }
  try{
    const estado = estadoNuevoMovimiento();
    const creadoPor = getCurrentUserEmail?getCurrentUserEmail():'';
    const logId = cryptoId();
    const nota = `Garantía${cliente?' · '+cliente:''}${motivo?' · '+motivo:''}`;
    for(const c of garPreview.consumo){
      const it = CATALOGO.find(i=>i.id===c.itemId);
      await db.collection('movimientos').doc(cryptoId()).set({modulo:mod,itemId:c.itemId,itemNombre:it.nombre,tipo:'garantia',cantidad:c.cantidad,nota,fecha:new Date().toISOString(),estado,loteId:logId,creadoPor});
    }
    for(const x of (garPreview.sobrantes||[])){
      const it = CATALOGO.find(i=>i.id===x.itemId);
      await db.collection('movimientos').doc(cryptoId()).set({modulo:mod,itemId:x.itemId,itemNombre:it.nombre,tipo:'entrada',motivo:'sobranteGarantia',cantidad:x.cantidad,nota:nota+' · mitad sobrante de un juego abierto',fecha:new Date().toISOString(),estado,loteId:logId,creadoPor});
    }
    const logDoc = {modulo:mod, fechaDia, cliente, motivo, lineas:garLineas.map(describirLineaGar), lineasData:JSON.parse(JSON.stringify(garLineas)), consumo:garPreview.consumo, fecha:new Date().toISOString(), estado, creadoPor};
    if(garPreview.sobrantes && garPreview.sobrantes.length) logDoc.sobrantes = garPreview.sobrantes;
    const nFotosGar = await guardarFotos('gar', 'garantia', logId, mod);
    if(nFotosGar) logDoc.fotos = nFotosGar;
    await db.collection('garantiasLog').doc(logId).set(logDoc);
    toast((estado==='pendiente' ? '✅ Garantía guardada.<br><small>Dirección la tiene que aprobar para que se descuente.</small>' : '✅ Garantía registrada.')+'<br><small>Cuando el cliente regrese lo dañado, anótalo en <strong>↩️ Regreso</strong>.</small>');
    garLineas=[]; garPreview=null;
    renderGar(); window.scrollTo(0,0);
  }catch(e){ alert('Error al registrar: '+e.message); }
}
function fechaGarTxt(l){ return new Date((l.fechaDia||(l.fecha||'').slice(0,10))+'T12:00:00').toLocaleDateString('es-MX',{day:'numeric',month:'long',year:'numeric'}); }
async function renderGarHistorial(){
  let logs=[];
  try{ const snap = await db.collection('garantiasLog').get(); logs = snap.docs.map(d=>({id:d.id,...d.data()})).filter(x=>x.modulo===modulo()).sort((a,b)=>(b.fecha||'').localeCompare(a.fecha||'')); }catch(e){}
  garHistLogs = logs;
  // El estado real sale de sus movimientos (se aprueban/rechazan desde Aprobaciones).
  const estadoLote = (loteId, def) => { const ms = movs.filter(m=>m.loteId===loteId); if(!ms.length) return def; if(ms.some(m=>m.estado==='pendiente')) return 'pendiente'; if(ms.every(m=>m.estado==='rechazado')) return 'rechazado'; return 'aprobado'; };
  const esperando = logs.filter(l=>!l.retorno && estadoLote(l.id, l.estado)!=='rechazado');
  const n = document.getElementById('gar-reg-n'); if(n) n.textContent = esperando.length ? '('+esperando.length+')' : '';
  const el = document.getElementById('gar-hist'); if(!el) return;
  if(garSub==='regreso'){ logs = esperando; if(!logs.length){ el.innerHTML = '<div class="card">No hay garantías esperando regreso en '+modulo()+'. 🎉</div>'; return; } }
  if(!logs.length){ el.innerHTML = '<div class="card">Aún no hay garantías registradas en '+modulo()+'.</div>'; return; }
  const puede = puedeEscribir() && !esSoloLectura();
  el.innerHTML = logs.map(l=>{
    const r = l.retorno;
    const retHtml = r ? `<div style="margin-top:10px;padding-top:10px;border-top:1px dashed var(--line)">
        <div class="row" style="justify-content:space-between"><strong>↩️ Regresó el ${new Date(r.fecha).toLocaleDateString('es-MX')}</strong>${r.loteId && (r.devuelto||[]).length?badgeEstado(estadoLote(r.loteId, r.estado)):''}</div>
        ${(r.sirve||[]).length?`<div class="hint" style="margin:4px 0 0"><strong>✅ Sirvió (regresó al inventario):</strong><br>${r.sirve.join('<br>')}</div>`:''}
        ${(r.merma||[]).length?`<div class="hint" style="margin:4px 0 0"><strong>🗑️ Merma:</strong><br>${r.merma.join('<br>')}</div>`:''}
        ${(r.sobrante||[]).length?`<div class="hint" style="margin:4px 0 0"><strong>🧩 A sobrantes:</strong><br>${r.sobrante.join('<br>')}</div>`:''}
        ${r.fotos?`<button class="btn small" style="background:transparent;color:var(--brand);border:1px solid var(--line);box-shadow:none;margin:4px 0" onclick="verFotos('${r.loteId}',${r.fotos},'Lo que regresó')">📷 Ver fotos (${r.fotos})</button>`:''}
        ${(r.devuelto||[]).length?`<details><summary class="hint">Lo que se sumó al inventario</summary><div class="hint">${r.devuelto.map(c=>{ const it=CATALOGO.find(i=>i.id===c.itemId); return `${it?it.nombre:c.itemId}: +${fmtNum(c.cantidad)} ${it?it.unidad:''}${it&&esHoja(it)?' (cortado)':''}`; }).join('<br>')}</div></details>`:''}
      </div>` : (puede ? `<button class="btn" style="margin-top:10px;width:100%;background:linear-gradient(135deg,#e0791a,#c2650f)" onclick="iniciarRetornoGarId('${l.id}')">↩️ Registrar lo que regresó</button>` : '<p class="hint" style="margin-top:8px">Todavía no se registra lo que regresó.</p>');
    return `<div class="card">
      <div class="row" style="justify-content:space-between"><strong>${fechaGarTxt(l)}</strong>${badgeEstado(estadoLote(l.id, l.estado))}</div>
      ${l.cliente||l.motivo?`<p class="hint" style="margin:4px 0">${l.cliente?'Cliente: '+l.cliente:''}${l.cliente&&l.motivo?' · ':''}${l.motivo?'Motivo: '+l.motivo:''}</p>`:''}
      <ul style="margin:6px 0 6px 18px;padding:0;line-height:1.6">${(l.lineas||[]).map(x=>`<li>${x}</li>`).join('')}</ul>
      ${l.fotos?`<button class="btn small" style="background:transparent;color:var(--brand);border:1px solid var(--line);box-shadow:none;margin:4px 0" onclick="verFotos('${l.id}',${l.fotos},'Garantía')">📷 Ver fotos (${l.fotos})</button>`:''}
      <details><summary class="hint">Material descontado</summary><div class="hint">${(l.consumo||[]).map(c=>{ const it=CATALOGO.find(i=>i.id===c.itemId); return `${it?it.nombre:c.itemId}: ${fmtNum(c.cantidad)} ${it?it.unidad:''}`; }).join('<br>')}${(l.sobrantes||[]).map(c=>{ const it=CATALOGO.find(i=>i.id===c.itemId); return `<br>Sobró: +${fmtNum(c.cantidad)} ${it?it.nombre:c.itemId}`; }).join('')}</div></details>
      ${retHtml}
    </div>`;
  }).join('');
}

// ===== Lo que regresa el cliente en una garantía (confirmado por el usuario) =====
// Se separa en piezas/herrajes; cada uno se marca ✅ Sirve (regresa al inventario como
// "Regresó de garantía"; las hojas regresan como material cortado) o 🗑️ Merma (solo se anota).
// Por defecto la melamina/MDF es merma y los herrajes sirven.
let garLineasGuardadas = null;
function iniciarRetornoGarId(id){ const l = garHistLogs.find(x=>x.id===id); if(l) iniciarRetornoGar(l); }
function iniciarRetornoGar(log){
  if(garSub!=='retorno') garLineasGuardadas = garLineas;
  garRet = {log, comps:null};
  garLineas = JSON.parse(JSON.stringify(log.lineasData||[]));
  garPreview = null; garSub = 'retorno'; garForm.cantidad = '';
  renderGar(); window.scrollTo(0,0);
  if(!garLineas.length) toast('Esta garantía es de antes: agrega lo que regresó con "+ Agregar algo más".');
}
function salirRetornoGar(){
  if(garSub!=='retorno') return;
  garRet = null; garLineas = garLineasGuardadas || []; garLineasGuardadas = null; garPreview = null;
}
function cancelarRetornoGar(){ salirRetornoGar(); garSub='regreso'; renderGar(); }
async function actualizarContadorRegreso(){
  try{
    const snap = await db.collection('garantiasLog').get();
    const rech = id => { const ms = movs.filter(m=>m.loteId===id); return ms.length && ms.every(m=>m.estado==='rechazado'); };
    const k = snap.docs.map(d=>({id:d.id,...d.data()})).filter(l=>l.modulo===modulo() && !l.retorno && !rech(l.id)).length;
    const n = document.getElementById('gar-reg-n'); if(n) n.textContent = k ? '('+k+')' : '';
  }catch(e){}
}

// Separa las líneas en componentes: {label, kind:'item'|'hoja', itemId, n, pool:[piezas], medidas:[{color,ancho,alto}], estado, sirven}
function componentesRetorno(lineas){
  const comps = [];
  const esHojaIdLocal = id => { const it=CATALOGO.find(i=>i.id===id); return it && esHoja(it); };
  const addItem = (itemId, n, label) => { if(!itemId || !(n>0)) return; comps.push({label: label || CATALOGO.find(i=>i.id===itemId).nombre, kind:'item', itemId, n}); };
  const addPieza = (p, extraLbl) => {
    if(typeof p.cantidad!=='number' || !(p.cantidad>0)) return;
    if(CORR_SUELTA_ITEM[p.nombre]){ const it=itemByName(CORR_SUELTA_ITEM[p.nombre]); addItem(it.id, p.cantidad, p.nombre+(extraLbl||'')); return; }
    const res = piezasAConsumo([p], p.colorDestino);
    if(!res.length) return;
    const colorTxt = p.colorDestino && p.colorDestino!=='—' ? ' · '+p.colorDestino : '';
    if(res.some(r=>esHojaIdLocal(r.itemId))) comps.push({label: p.nombre+colorTxt+(extraLbl||''), kind:'hoja', n:p.cantidad, pool:[p]});
    else addItem(res[0].itemId, res[0].cantidad, p.nombre+(extraLbl||''));
  };
  const addMedida = (nombre, color, ancho, alto, n) => { if(n>0) comps.push({label:`${nombre} ${fmtNum(ancho)}×${fmtNum(alto)} cm · ${color}`, kind:'hoja', n, medidas:[{color, ancho, alto}]}); };
  lineas.forEach(l=>{
    const n = Number(l.cantidad)||0; if(!n) return;
    if(l.tipo==='pieza'){
      const p = PIEZAS_AUDIT.find(x=>x.key===l.pieza); if(!p) return;
      addPieza({nombre:p.nombre, cantidad:n, dim:p.dim, colorDestino: p.tipo==='mel'? l.color : '—', estado:'ok'});
    } else if(l.tipo==='medida'){
      addMedida(l.nombre, l.color, Number(l.ancho), Number(l.alto), n);
    } else if(l.tipo==='armado'){
      const origen = ' (de '+describirArmado({tipo:l.armTipo, variante:l.armVar, color:l.color, colorCuadro:l.colorCuadro, colorFrente:l.colorFrente, ext:l.ext, cantidad:n}).split(' · ')[0].toLowerCase()+')';
      piezasDeArmado({tipo:l.armTipo, variante:l.armVar, color:l.color, colorCuadro:l.colorCuadro, colorFrente:l.colorFrente, ext:l.ext, cantidad:n}).forEach(p=>addPieza(p, origen));
    } else if(l.tipo==='item'){
      addItem(l.itemId, n);
    } else if(l.tipo==='puertas'){
      const r = calcularPuerta(l.pTipo, Number(l.pAlto), Number(l.pAncho), false);
      const quiere = l.pModo==='completas' ? null : Object.assign({}, l.pPiezas||{});
      r.cortes.forEach(c=>{
        const q = quiere ? Math.min(quiere[c.pieza]||0, c.cantidad) : c.cantidad*n;
        if(quiere && q>0) quiere[c.pieza]-=q;
        addMedida((PUERTA_PIEZA_LBL[c.pieza]||'Pieza').replace(/\(e?s\)/g,''), l.color, c.ancho, c.alto, q);
      });
      if(l.pModo==='completas' && r.zoclos) addPieza({nombre:'Zóclo normal', cantidad:r.zoclos*n, dim:'10×52 cm', colorDestino:l.color, estado:'ok'}, ' (de las puertas)');
      if(l.pModo==='completas' && l.pHerrajes){
        const h = TIPOS_PUERTA_HERRAJES[l.pTipo];
        [['Rieles',h.riel],['Sistemas',h.sistema],['Bastidores',h.bastidor],[l.pJaladera==='plana'?'Jaladera plana':'Jaladeras',h.jaladera]].forEach(([nom,q])=>{
          const it=itemByName(nom); if(it && q) addItem(it.id, q*n); });
      }
    }
  });
  comps.forEach(c=>{ c.estado = c.kind==='hoja' ? 'merma' : 'sirve'; c.sirven = c.n; });
  return comps;
}
function separarRetornoGar(){
  if(!garLineas.length) return alert('Agrega primero lo que regresó.');
  garRet.comps = componentesRetorno(garLineas);
  if(!garRet.comps.length) return alert('No se encontraron piezas en lo que regresó.');
  renderRetornoComps();
  const c = document.getElementById('g-ret-card'); if(c && c.scrollIntoView) c.scrollIntoView({behavior:'smooth', block:'start'});
}
function retMarcar(i, estado){ const c=garRet.comps[i]; c.estado=estado; if(estado==='sirve' && !(c.sirven>0)) c.sirven=c.n; renderRetornoComps(); }
function renderRetornoComps(){
  const el = document.getElementById('g-result'); if(!el || !garRet || !garRet.comps) return;
  const comps = garRet.comps;
  const filas = comps.map((c,i)=>{
    const sirve = c.estado==='sirve', sob = c.estado==='sobrante';
    return `<div class="movitem" style="flex-direction:column;align-items:stretch;gap:8px;${sirve?'border-color:var(--ok)':(sob?'border-color:#0e8a8a':'')}">
      <div><span class="invname">${fmtNum(c.n)} × ${c.label}</span><span class="hint" style="display:block;margin:2px 0 0">${c.kind==='hoja'?'Melamina / MDF':'Herraje'}</span></div>
      <div class="chips"><button class="chip ${sirve?'on':''}" onclick="retMarcar(${i},'sirve')">✅ Sirve</button>${c.kind==='hoja'?`<button class="chip ${sob?'on':''}" onclick="retMarcar(${i},'sobrante')">🧩 Sobrante</button>`:''}<button class="chip ${c.estado==='merma'?'on':''}" onclick="retMarcar(${i},'merma')">🗑️ Merma</button></div>
      ${sob?'<p class="hint" style="margin:0">Se aparta en 🧩 Sobrantes para aprovecharla después; cuando se transforme, las piezas que salgan regresan al inventario.</p>':''}
      ${sirve && c.n>1 ? `<label class="hint">¿Cuántas sirven? (de ${fmtNum(c.n)})<input type="number" min="0" max="${c.n}" inputmode="numeric" value="${c.sirven}" style="margin-top:4px" oninput="garRet.comps[${i}].sirven=Math.min(${c.n},Math.max(0,Number(this.value)||0))"></label>` : ''}
    </div>`;
  }).join('');
  el.innerHTML = `<div class="card" id="g-ret-card">
    <div style="font-size:16px;font-weight:800">🔍 Revisa cada pieza</div>
    <p class="hint">Por defecto la melamina queda como merma y los herrajes como que sirven. Cámbialo si no es así. <strong>✅ Sirve</strong> regresa al inventario, <strong>🧩 Sobrante</strong> se aparta para aprovecharse después y <strong>🗑️ Merma</strong> solo se anota.</p>
    <div class="movlist">${filas}</div>
    ${fotoPickerHtml('ret','Foto de lo que regresó (opcional)')}
    <button class="btn" style="margin-top:12px;width:100%;min-height:56px;font-size:16px;background:linear-gradient(135deg,#1f9d55,#178045)" onclick="confirmarRetornoGar()">✅ Guardar lo que regresó</button>
  </div>`;
}
// Convierte lo que sirve a artículos del inventario: [{itemId, cantidad}]
function devolucionDeComps(comps, estadoBuscado){
  const out = {}, pool = [], medidas = {};
  comps.forEach(c=>{
    const k = (estadoBuscado||'sirve')==='sirve' ? (c.estado==='sirve' ? Math.min(c.n, Number(c.sirven)||0) : 0) : (c.estado===estadoBuscado ? c.n : 0); if(!(k>0)) return;
    if(c.kind==='item') out[c.itemId] = (out[c.itemId]||0) + k;
    else {
      (c.pool||[]).forEach(p=>pool.push({...p, cantidad:k}));
      (c.medidas||[]).forEach(m=>(medidas[m.color]=medidas[m.color]||[]).push({ancho:m.ancho, alto:m.alto, cantidad:k}));
    }
  });
  const porColor = {};
  pool.forEach(p=>{ (porColor[p.colorDestino] = porColor[p.colorDestino]||[]).push(p); });
  Object.keys(porColor).forEach(c=>piezasAConsumo(porColor[c], c).forEach(r=>{ out[r.itemId]=(out[r.itemId]||0)+r.cantidad; }));
  Object.keys(medidas).forEach(c=>{
    const r = hojasParaCortesCombinado(medidas[c], 122, 244);
    const it = itemByName('Melamina '+c);
    if(it && r.costo>0) out[it.id] = (out[it.id]||0) + r.costo;
  });
  return Object.keys(out).map(itemId=>({itemId, cantidad: Math.round(out[itemId]*1000)/1000})).filter(x=>x.cantidad>0);
}
async function confirmarRetornoGar(){
  if(!garRet || !garRet.comps) return;
  const log = garRet.log, comps = garRet.comps;
  const devuelto = devolucionDeComps(comps);
  const aSobrante = devolucionDeComps(comps, 'sobrante').filter(d=>esHojaId(d.itemId));
  const sirve = [], merma = [], sobr = [];
  comps.forEach(c=>{
    if(c.estado==='sobrante'){ sobr.push(`${fmtNum(c.n)} × ${c.label}`); return; }
    const k = c.estado==='sirve' ? Math.min(c.n, Number(c.sirven)||0) : 0;
    if(k>0) sirve.push(`${fmtNum(k)} × ${c.label}`);
    if(c.n-k>0) merma.push(`${fmtNum(c.n-k)} × ${c.label}`);
  });
  const resumen = (devuelto.length ? 'Regresa al inventario:\n'+devuelto.map(d=>{ const it=CATALOGO.find(i=>i.id===d.itemId); return `• +${fmtNum(d.cantidad)} ${it.unidad} ${it.nombre}${esHoja(it)?' (cortado)':''}`; }).join('\n') : 'Nada regresa al inventario.')
    + (sobr.length ? '\n\nSe aparta en Sobrantes:\n'+sobr.map(x=>'• '+x).join('\n') : '')
    + (merma.length ? '\n\nMerma (solo se anota):\n'+merma.map(x=>'• '+x).join('\n') : '');
  if(!confirm(resumen+'\n\n¿Guardar?')) return;
  try{
    const estado = estadoNuevoMovimiento();
    const creadoPor = getCurrentUserEmail?getCurrentUserEmail():'';
    const loteId = cryptoId();
    const fecha = new Date().toISOString();
    const nota = `Regresó de garantía${log.cliente?' · '+log.cliente:''}${log.motivo?' · '+log.motivo:''}`;
    for(const d of devuelto){
      const it = CATALOGO.find(i=>i.id===d.itemId);
      await db.collection('movimientos').doc(cryptoId()).set({modulo:log.modulo||modulo(), itemId:d.itemId, itemNombre:it.nombre, tipo:'devolucion', cantidad:d.cantidad, nota, fecha, estado, loteId, garantiaId:log.id, creadoPor});
    }
    const nFotosRet = await guardarFotos('ret', 'retorno', loteId, log.modulo||modulo());
    // Confirmado por el usuario: lo que regresa de una garantía también puede ir a Sobrantes. Esa
    // melamina ya había salido del inventario con la garantía, así que solo se aparta (no se descuenta
    // otra vez); cuando se transforme, las piezas que salgan regresan al inventario.
    let sobranteId = null;
    if(aSobrante.length){
      sobranteId = cryptoId();
      const restante = {}; aSobrante.forEach(c=>{ restante[c.itemId] = c.cantidad; });
      await db.collection('sobrantes').doc(sobranteId).set({modulo:log.modulo||modulo(), fecha, nota:nota+' (regresó de garantía)', lineas:sobr, lineasData:[], material:aSobrante, restante, estado:'abierto', transformaciones:[], creadoPor, deGarantia:log.id});
    }
    await db.collection('garantiasLog').doc(log.id).update({retorno:{fecha, lineas:garLineas.map(describirLineaGar), sirve, merma, sobrante:sobr, sobranteId, devuelto, estado, loteId, creadoPor, fotos:nFotosRet||0}});
    toast((devuelto.length && estado==='pendiente' ? '✅ Guardado.<br><small>Dirección lo tiene que aprobar para que sume al inventario.</small>' : '✅ Guardado lo que regresó.')+(sobranteId?'<br><small>🧩 Lo de sobrante quedó apartado en Sobrantes.</small>':''));
    salirRetornoGar(); garSub='regreso'; renderGar(); window.scrollTo(0,0);
  }catch(e){ alert('Error al guardar: '+e.message); }
}

// Aviso en la vista previa de una instalación: qué hojas no tienen suficiente material cortado
// registrado, y cuántas hojas completas va a pasar la app a cortado automáticamente.
function avisoAutoCorteHtml(consumo){
  const lineas = (consumo||[]).map(c=>{
    const ac = hojasAutoCorteSiInstala(c.itemId, c.cantidad);
    if(!ac.hojas) return '';
    const it = CATALOGO.find(i=>i.id===c.itemId);
    const f = calcFormula(c.itemId);
    return `<li>${it?it.nombre:c.itemId}: ${ac.hojas} hoja(s)</li>`;
  }).filter(Boolean);
  if(!lineas.length) return '';
  return `<div class="card"><div class="warn"><strong>✂️ Aún no se anota el corte de hoy de:</strong>
    <ul style="margin:6px 0 6px 18px;padding:0">${lineas.join('')}</ul>
    No pasa nada, puedes continuar. Se ajusta solo cuando se registre el corte del día.</div></div>`;
}

async function confirmarInst(){
  if(!instPreview || instPreview.bloqueado) return;
  const nota = ($('#i-nota').value||'').trim();
  if(instCambio) return guardarCambioModelo({categoria:'Mueble', desc:`${instPreview.modeloNombre} · ${instPreview.color}${instPreview.colorCajonera?(' · Cajonera '+instPreview.colorCajonera):''}`, nota, modeloKey:instPreview.modeloKey||null, esMax:!!instPreview.esMax, extras:instPreview.extras||0, extrasDetalle:instPreview.extrasDetalle||[], consumo:instPreview.consumo});
  const fechaDia = $('#i-fecha').value || new Date().toISOString().slice(0,10);
  const mod = modulo();
  const desc = `${instPreview.modeloNombre} · ${instPreview.color}${instPreview.colorCajonera?(' · Cajonera '+instPreview.colorCajonera):''}`;
  try{
    // Re-valida en el último momento antes de escribir, y escribe todo o nada
    for(const c of instPreview.consumo){
      const f = calcFormula(c.itemId);
      if(f.final - c.cantidad < 0){ alert('Existencia cambió, ya no alcanza para: '+CATALOGO.find(i=>i.id===c.itemId).nombre); return; }
    }
    const estado = estadoNuevoMovimiento();
    const creadoPor = getCurrentUserEmail?getCurrentUserEmail():'';
    const logId = cryptoId();
    for(const c of instPreview.consumo){
      const item = CATALOGO.find(i=>i.id===c.itemId);
      await db.collection('movimientos').doc(cryptoId()).set({modulo:mod,itemId:c.itemId,itemNombre:item.nombre,tipo:'instalacion',cantidad:c.cantidad,nota:`${desc}${nota?(' · '+nota):''}`,fecha:new Date().toISOString(),estado,loteId:logId,creadoPor});
    }
    // Registro consolidado para el historial por día del módulo
    await db.collection('instalacionesLog').doc(logId).set({
      modulo:mod, categoria:'Mueble', descripcion:desc, nota, fechaDia, modeloKey:instPreview.modeloKey||null, esMax:!!instPreview.esMax, extras:instPreview.extras||0, extrasDetalle:instPreview.extrasDetalle||[],
      consumo:instPreview.consumo, fecha:new Date().toISOString(), estado, creadoPor
    });
    toast(estado==='pendiente'
      ? '✅ Instalación guardada.<br><small>Dirección la tiene que aprobar para que se descuente.</small>'
      : '✅ Instalación registrada.');
    instPreview=null;
    iAdicionales=[];
    renderInstMueble();
    window.scrollTo(0,0);
  }catch(e){ alert('Error al registrar: '+e.message); }
}

// ---- Puertas (modelos de instalación, NO ferretería) ----
const TIPOS_PUERTA = {
  'Normal': 'Composición: 1 par de puertas, 3 marcos, 1 fijo.',
  'Con pared falsa': 'Composición: 1 par de puertas, 1 pared falsa, 2 marcos, 1 fijo, 1 extensión de fijo.',
  'Con dos paredes falsas': 'Composición: 1 par de puertas, 1 marco, 1 fijo, 2 paredes falsas, 2 extensiones de fijo.',
  'Con cubos a los lados': 'Composición: 1 par de puertas, 1 fijo o 2 fijos según medida, 9 marcos.',
  'Con cubo al centro': 'Composición: 2 pares de puertas, 2 fijos, 8 marcos.'
};
// Herrajes de puertas (confirmado por el usuario): riel/sistema/bastidor/jaladeras por tipo.
// La jaladera puede sustituirse por "Jaladera plana" (elegido por el usuario); esto solo aplica
// a las jaladeras de puertas, no a las de cajones/cajoneras.
const TIPOS_PUERTA_HERRAJES = {
  'Normal': {riel:1, sistema:1, bastidor:1, jaladera:2},
  'Con pared falsa': {riel:1, sistema:1, bastidor:1, jaladera:2},
  'Con dos paredes falsas': {riel:1, sistema:1, bastidor:1, jaladera:2},
  'Con cubos a los lados': {riel:1, sistema:1, bastidor:1, jaladera:2},
  'Con cubo al centro': {riel:2, sistema:2, bastidor:2, jaladera:4}
};
function renderInstPuertas(){
  const reg = instRegresoLibre;
  $('#inst-body').innerHTML = `
  ${reg?`<div class="card" style="border:2px solid #1f9d55"><strong>↩️ Puertas completas que regresan al inventario</strong>
    <p class="hint" style="margin-top:4px">Captúralas igual que una instalación de puertas. Al confirmar, todo se <strong>SUMA</strong> al inventario (la melamina como material cortado).</p>
    <label class="row" style="margin-top:8px;gap:10px;font-size:14px;flex-wrap:nowrap;font-weight:700"><input type="checkbox" id="p-reg-herrajes" checked style="width:22px;min-height:22px;flex:0 0 22px"> También regresaron sus herrajes (riel, sistema, bastidor y jaladeras)</label>
    <button class="btn small" style="margin-top:8px;background:transparent;color:var(--bad);border:1px solid var(--line);box-shadow:none" onclick="instRegresoLibre=false;instSub='historial';instRegreso=true;renderInst()">Cancelar</button></div>`:''}
  <div class="card">
    <div class="paso">1</div><strong>¿Qué tipo de puerta${reg?' regresó':''}?</strong>
    <select id="p-tipo" style="margin-top:10px" onchange="renderPuertaParedFalsaExtra()">${Object.keys(TIPOS_PUERTA).map(t=>`<option>${t}</option>`).join('')}</select>
    <div id="p-pared-falsa-extra-wrap" style="margin-top:8px"></div>
  </div>
  <div class="card">
    <div class="paso">2</div><strong>Medidas del hueco</strong>
    <div class="grid2" style="margin-top:10px">
      <div><label class="hint">Ancho total (cm)</label><input id="p-ancho" type="number" inputmode="decimal" placeholder="ej. 180" style="margin-top:4px"></div>
      <div><label class="hint">Alto total (cm)</label><input id="p-alto" type="number" inputmode="decimal" placeholder="ej. 240" style="margin-top:4px"></div>
    </div>
  </div>
  <div class="card">
    <div class="paso">3</div><strong>Color y jaladera</strong>
    <div class="grid2" style="margin-top:10px">
      <div><label class="hint">Color</label><select id="p-color" style="margin-top:4px">${MEL_COLORES.map(c=>`<option>${c}</option>`).join('')}</select></div>
      <div><label class="hint">Jaladera</label><select id="p-jaladera-tipo" style="margin-top:4px"><option value="normal">Normal</option><option value="plana">Plana</option></select></div>
    </div>
  </div>
  <div class="card">
    <div class="paso">4</div><strong>${reg?'Datos del regreso':'Datos de la instalación'}</strong>
    <div class="grid2" style="margin-top:10px">
      <div><label class="hint">Fecha</label><input id="p-fecha" type="date" value="${new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10)}" style="margin-top:4px"></div>
      <div><label class="hint">${reg?'¿De dónde viene? (opcional)':'Cliente (opcional)'}</label><input id="p-nota" placeholder="${reg?'Cliente o motivo del regreso':'Nombre o referencia'}" style="margin-top:4px"></div>
    </div>
    <button class="btn" style="margin-top:14px;width:100%;min-height:54px;font-size:16px" onclick="calcPuerta()">Revisar material</button>
  </div>
  <div id="p-result"></div>`;
  renderPuertaParedFalsaExtra();
}

// Caso aislado confirmado por el usuario: en "Con cubos a los lados" y "Con cubo al centro"
// a veces piden, aparte, una pared falsa (con su extensión de fijo). No es parte fija de esos
// modelos, así que va como casilla opcional.
const TIPOS_CON_PARED_FALSA_EXTRA = ['Con cubos a los lados','Con cubo al centro'];
function renderPuertaParedFalsaExtra(){
  const wrap = document.getElementById('p-pared-falsa-extra-wrap');
  if(!wrap) return;
  const tipo = document.getElementById('p-tipo').value;
  wrap.innerHTML = TIPOS_CON_PARED_FALSA_EXTRA.includes(tipo)
    ? `<label class="hint" style="display:flex;align-items:center;gap:6px"><input type="checkbox" id="p-pared-falsa-extra" style="width:auto"> Piden pared falsa aparte (poco común; agrega 1 pared falsa de 244×60 cm + su extensión de fijo)</label>`
    : '';
}

// Confirmado por el usuario: puertas/marcos/fijos/pared falsa/extensión de fijo salen todos del
// mismo color que elige el cliente, en melamina de 15mm — misma hoja estándar de 122×244 cm que
// se usa para todo lo demás (no hay un artículo de catálogo aparte para el 15mm). Como la medida
// de cada pieza depende de la puerta que se está cortando (no es una medida fija como el Frente),
// se acomodan TODAS las piezas juntas (puertas, marcos, fijos, etc.) en el menor número de hojas
// posible — permitiendo que las piezas chicas entren en el sobrante que dejan las grandes, tal
// como se cortaría en el taller — en vez de calcular cada tipo de pieza por separado.
// Algoritmo tipo "MaxRects" (acomodo de rectángulos, mismo principio que se usa para aprovechar
// materiales en la industria): por cada pieza busca, entre el espacio libre de las hojas ya
// abiertas, el hueco donde quepa dejando menos sobrante (probando las dos orientaciones); si no
// cabe en ninguna hoja abierta, abre una hoja nueva. No es una optimización perfecta (acomodar
// rectángulos de forma óptima no tiene una solución exacta rápida), pero es mucho más realista
// que sumar hojas por tipo de pieza por separado.
function _mejorEspacioParaPieza(libres, w, h){
  let mejor = null;
  libres.forEach((r, idx)=>{
    [[w,h],[h,w]].forEach(([pw,ph])=>{
      if(pw<=r.w+0.001 && ph<=r.h+0.001){
        const sobra = r.w*r.h - pw*ph;
        if(!mejor || sobra<mejor.sobra) mejor = {idx, pw, ph, sobra};
      }
    });
  });
  return mejor;
}
let _corteVerticalPrimero = false; // lo cambia hojasParaCortesCombinado al probar las dos formas de cortar
function _colocarPiezaEnLibres(libres, idx, pw, ph){
  const r = libres[idx];
  libres.splice(idx,1);
  if(_corteVerticalPrimero){
    // Primero el corte a lo largo: la tira de al lado queda del alto completo (p. ej. junto a una
    // puerta de 236.5 queda una tira de 244 donde caben los marcos).
    const der = {x:r.x+pw, y:r.y, w:r.w-pw, h:r.h};
    const arr = {x:r.x, y:r.y+ph, w:pw, h:r.h-ph};
    const areaA = Math.max((r.w-pw)*ph, r.w*(r.h-ph)), areaB = Math.max((r.w-pw)*r.h, pw*(r.h-ph));
    if(areaB>=areaA){
      if(der.w>0.01 && der.h>0.01) libres.push(der);
      if(arr.w>0.01 && arr.h>0.01) libres.push(arr);
      return;
    }
  }
  // Método guillotina: divide el rectángulo libre usado en el sobrante a la derecha y arriba de
  // la pieza colocada.
  const derecha = {x:r.x+pw, y:r.y, w:r.w-pw, h:ph};
  const arriba = {x:r.x, y:r.y+ph, w:r.w, h:r.h-ph};
  if(derecha.w>0.01 && derecha.h>0.01) libres.push(derecha);
  if(arriba.w>0.01 && arriba.h>0.01) libres.push(arriba);
}
// Cuántas piezas de anchoPieza×altoPieza caben, ELLAS SOLAS, en una hoja vacía (probando las dos
// orientaciones). Se usa para saber si una pieza por sí sola ya exige una hoja completa (cuando
// da 1) o es una pieza chica que normalmente comparte hoja con otras del mismo tipo.
function piezasPorHojaIndividual(anchoPieza, altoPieza, anchoHoja, altoHoja){
  anchoHoja = anchoHoja || 122; altoHoja = altoHoja || 244;
  if(!(anchoPieza>0) || !(altoPieza>0)) return 0;
  const op1 = Math.floor(anchoHoja/anchoPieza) * Math.floor(altoHoja/altoPieza);
  const op2 = Math.floor(anchoHoja/altoPieza) * Math.floor(altoHoja/anchoPieza);
  return Math.max(op1, op2);
}
// Acomoda una lista de piezas [{ancho,alto,cantidad}] en el menor número de hojas de
// anchoHoja×altoHoja (122×244 por default), y calcula cuánto material se debe descontar.
// Devuelve {hojas, costo, noCaben}:
//   - hojas: cuántas hojas físicas hay que cortar (para saber cuántas hojas sacar del almacén).
//   - costo: cuánto se descuenta del inventario (puede ser fraccionario). Una hoja que lleva
//     alguna pieza que por sí sola ya ocupa una hoja completa (como una puerta) cuesta 1 hoja
//     entera —lo demás que comparte esa hoja "viene gratis", porque de todas formas se iba a
//     cortar esa hoja completa—. Una hoja que solo lleva piezas chicas (sobrantes que no obligan
//     a abrir hoja nueva por sí solas, como un marco suelto) cuesta la proporción de hoja que
//     cada pieza ocuparía si se cortara sola (p.ej. si de una hoja salen 12 marcos, 1 marco = 1/12
//     de hoja), asumiendo que el resto de esa hoja queda como sobrante para otro corte futuro.
//   - noCaben: piezas que no caben en una hoja completa en ninguna orientación (medida inválida).
// Se prueban dos órdenes de acomodo y se queda el mejor (menos hojas físicas y, a igual número de
// hojas, lo que menos se descuenta). El segundo orden pone primero las piezas que ocupan una hoja
// entera (puertas), para que los marcos aprovechen la tira que queda al lado de cada puerta.
function hojasParaCortesCombinado(cortes, anchoHoja, altoHoja){
  let mejor = null;
  for(const vert of [false, true]) for(const gp of [false, true]){
    _corteVerticalPrimero = vert;
    let r; try{ r = _empacarCortes(cortes, anchoHoja, altoHoja, gp); } finally { _corteVerticalPrimero = false; }
    if(!mejor || r.hojas<mejor.hojas || (r.hojas===mejor.hojas && r.costo<mejor.costo-1e-9)) mejor = r;
  }
  return mejor;
}
function _empacarCortes(cortes, anchoHoja, altoHoja, grandesPrimero){
  anchoHoja = anchoHoja || 122; altoHoja = altoHoja || 244;
  let items = [];
  cortes.forEach(c=>{ for(let i=0;i<(c.cantidad||0);i++) items.push({ancho:c.ancho, alto:c.alto}); });
  // Piezas más grandes primero: da mejores resultados con este tipo de acomodo "greedy".
  const tam = x=>Math.max(x.ancho,x.alto);
  const entera = x=>(x.ancho>0&&x.alto>0&&piezasPorHojaIndividual(x.ancho,x.alto,anchoHoja,altoHoja)<=1)?1:0;
  items.sort((a,b)=> grandesPrimero ? (entera(b)-entera(a) || tam(b)-tam(a)) : tam(b)-tam(a));

  const hojas = []; // cada hoja = {libres:[...], items:[...]}
  let noCaben = 0;

  items.forEach(item=>{
    if(!(item.ancho>0) || !(item.alto>0)) return;
    const cabeEnHojaVacia = (item.ancho<=anchoHoja && item.alto<=altoHoja) || (item.alto<=anchoHoja && item.ancho<=altoHoja);
    if(!cabeEnHojaVacia){ noCaben++; return; }
    let mejorGlobal = null;
    hojas.forEach((hoja,hIdx)=>{
      const cand = _mejorEspacioParaPieza(hoja.libres, item.ancho, item.alto);
      if(cand && (!mejorGlobal || cand.sobra<mejorGlobal.sobra)) mejorGlobal = Object.assign({hIdx}, cand);
    });
    if(mejorGlobal){
      _colocarPiezaEnLibres(hojas[mejorGlobal.hIdx].libres, mejorGlobal.idx, mejorGlobal.pw, mejorGlobal.ph);
      hojas[mejorGlobal.hIdx].items.push(item);
    } else {
      const libres = [{x:0,y:0,w:anchoHoja,h:altoHoja}];
      const cand = _mejorEspacioParaPieza(libres, item.ancho, item.alto);
      _colocarPiezaEnLibres(libres, cand.idx, cand.pw, cand.ph);
      hojas.push({libres, items:[item]});
    }
  });

  let costo = 0;
  const sobrantesHoja = []; // hojas cobradas en proporción: lo que no se usa de ellas
  hojas.forEach((hoja,hIdx)=>{
    const obligaHojaCompleta = hoja.items.some(it=>piezasPorHojaIndividual(it.ancho,it.alto,anchoHoja,altoHoja)<=1);
    if(obligaHojaCompleta){
      costo += 1;
    } else {
      let ch = 0;
      hoja.items.forEach(it=>{
        const porHoja = piezasPorHojaIndividual(it.ancho,it.alto,anchoHoja,altoHoja);
        ch += porHoja>0 ? 1/porHoja : 1;
      });
      costo += ch;
      const libre = (hoja.libres||[]).reduce((b,r)=> (!b || r.w*r.h > b.w*b.h) ? r : b, null);
      const usado = Math.min(1, Math.round(ch*1000)/1000);
      if(usado < 1) sobrantesHoja.push({hoja:hIdx+1, usado, sobra:Math.round((1-usado)*1000)/1000, piezas:hoja.items.length, libre: libre?{w:Math.round(Math.min(libre.w,libre.h)*10)/10, h:Math.round(Math.max(libre.w,libre.h)*10)/10}:null});
    }
  });

  sobrantesHoja.forEach((x,i)=>{ x.hoja = hojas.length - sobrantesHoja.length + i + 1; }); // se cuentan al final: son las hojas que se abren de más
  return {hojas: hojas.length, costo: Math.round(costo*1000)/1000, noCaben, sobrantesHoja};
}

let puertaPreview = null;

// Fórmulas de puertas (compartidas por Instalación de puertas y Garantías). Devuelve las medidas
// para mostrar (info) y los cortes de melamina etiquetados por pieza (puerta/marco/fijo/paredFalsa/extFijo).
function calcularPuerta(tipo, alto, ancho, paredFalsaExtra){
  const piezas = [];
  const add=(n,v,nota)=>piezas.push({n,v,nota:nota||''});
  const cortes = [];
  let altoFijoParaExtra = null;
  add('Composición', TIPOS_PUERTA[tipo]);

  if(tipo==='Con pared falsa' || tipo==='Con dos paredes falsas'){
    // Confirmado por el usuario (ejemplo: ancho 200, alto 260 → pared falsa 244×60, marcos
    // 240×10, puertas 104.25×232.5, fijo 202×37, extensión de fijo 60×37):
    // alto de pared falsa = alto total − 2, con tope de 244 cm (medida de la hoja); ancho de
    // pared falsa = siempre 60 cm. Alto de marcos = alto de pared falsa (ya con el tope
    // aplicado) − 4. Alto de puertas = alto de marcos − 7.5. Ancho de puertas = (ancho total
    // − 1.5) ÷ 2 + 5. Ancho del fijo = ancho total + 2; alto del fijo = alto total − alto de
    // marcos + 17. La extensión de fijo mide lo mismo de ancho que la pared falsa (60 cm) y lo
    // mismo de alto que el fijo. "Con dos paredes falsas" usa la misma fórmula, solo cambia la
    // cantidad de piezas (2 paredes falsas y 2 extensiones de fijo en vez de 1).
    const altoParedFalsa = Math.min(alto-2, 244);
    const altoMarcos = altoParedFalsa-4;
    const altoPuertas = altoMarcos-7.5;
    const anchoPuertas = (ancho-1.5)/2+5;
    const anchoFijo = ancho+2;
    const altoFijo = alto-altoMarcos+17;
    add('Alto pared falsa', altoParedFalsa.toFixed(1)+' cm', (altoParedFalsa===244?'Tope de hoja: alto total − 2 pasa de 244, se deja en 244':'Alto total − 2')+(tipo==='Con dos paredes falsas'?' (aplica a cada una de las 2 paredes falsas)':''));
    add('Ancho pared falsa', '60 cm', 'Siempre 60 cm');
    add('Alto de marcos', altoMarcos.toFixed(1)+' cm', 'Alto de pared falsa − 4');
    add('Alto de puertas', altoPuertas.toFixed(1)+' cm', 'Alto de marcos − 7.5');
    add('Ancho de puertas (c/u del par)', anchoPuertas.toFixed(1)+' cm', '(Ancho total − 1.5) ÷ 2 + 5');
    add('Ancho del fijo', anchoFijo.toFixed(1)+' cm', 'Ancho total + 2');
    add('Alto del fijo', altoFijo.toFixed(1)+' cm', 'Alto total − alto de marcos + 17');
    add('Extensión de fijo', altoFijo.toFixed(1)+'×60 cm', 'Mismo ancho que la pared falsa (60 cm) y mismo alto que el fijo ('+(tipo==='Con dos paredes falsas'?'lleva 2':'lleva 1')+')');
    const numParedFalsa = tipo==='Con dos paredes falsas' ? 2 : 1;
    const numMarcos1 = tipo==='Con dos paredes falsas' ? 1 : 2;
    cortes.push({pieza:'puerta', ancho:anchoPuertas, alto:altoPuertas, cantidad:2});
    cortes.push({pieza:'marco', ancho:10, alto:altoMarcos, cantidad:numMarcos1});
    cortes.push({pieza:'fijo', ancho:anchoFijo, alto:altoFijo, cantidad:1});
    cortes.push({pieza:'paredFalsa', ancho:60, alto:altoParedFalsa, cantidad:numParedFalsa});
    cortes.push({pieza:'extFijo', ancho:60, alto:altoFijo, cantidad:numParedFalsa});
  } else if(tipo==='Normal'){
    // Confirmado por el usuario (ejemplo: ancho 180, alto 260 → par 93.5×236.5, marcos 244×10, fijo 33×182):
    // alto de marcos = alto total − 6, con tope de 244 cm (medida de la hoja: 122×244);
    // alto de puertas = alto de marcos − 7.5; ancho de puertas = (ancho total − 3) ÷ 2 + 5;
    // ancho del fijo = ancho total + 2; alto del fijo = alto total − alto de marcos + 17;
    // ancho de marco = 10 cm, fijo.
    const altoMarcos = Math.min(alto-6, 244);
    const altoPuertas = altoMarcos-7.5;
    const anchoPuertas = (ancho-3)/2+5;
    const anchoFijo = ancho+2;
    const altoFijo = alto-altoMarcos+17;
    add('Ancho de puertas (c/u del par)', anchoPuertas.toFixed(1)+' cm', '(Ancho total − 3) ÷ 2 + 5');
    add('Alto de marcos', altoMarcos.toFixed(1)+' cm', altoMarcos===244 ? 'Tope de hoja: alto total − 6 pasa de 244, se deja en 244' : 'Alto total − 6');
    add('Alto de puertas', altoPuertas.toFixed(1)+' cm', 'Alto de marcos − 7.5');
    add('Ancho de marco', '10 cm', 'Fijo (confirmado por el usuario)');
    add('Ancho del fijo', anchoFijo.toFixed(1)+' cm', 'Ancho total + 2');
    add('Alto del fijo', altoFijo.toFixed(1)+' cm', 'Alto total − alto de marcos + 17');
    cortes.push({pieza:'puerta', ancho:anchoPuertas, alto:altoPuertas, cantidad:2});
    cortes.push({pieza:'marco', ancho:10, alto:altoMarcos, cantidad:3});
    cortes.push({pieza:'fijo', ancho:anchoFijo, alto:altoFijo, cantidad:1});
  } else if(tipo==='Con cubos a los lados'){
    // Confirmado por el usuario (ejemplo: ancho 250, alto 240 → puertas 120×226.5, marcos
    // 234×10, y como el ancho es grande se necesitan 2 fijos de 126×23):
    // ancho de puertas = (ancho total − 20 de los cubos de los lados) ÷ 2 + 5.
    // alto de marcos = alto total − 6, con tope de 244 cm (medida de la hoja); alto de
    // puertas = alto de marcos − 7.5 (igual que en Normal). Ancho del fijo = ancho total + 2;
    // si esa medida pasa de 244 cm (tope de la hoja), se reparte entre 2 fijos iguales; si no,
    // es 1 solo fijo. Alto del fijo = alto total − alto de marcos + 17 (igual que en Normal).
    const altoMarcos = Math.min(alto-6, 244);
    const altoPuertas = altoMarcos-7.5;
    const anchoPuertas = (ancho-20)/2+5;
    const altoFijo = alto-altoMarcos+17;
    const anchoFijoTotal = ancho+2;
    const dosFijos = anchoFijoTotal>244;
    add('Ancho de puertas (c/u del par)', anchoPuertas.toFixed(1)+' cm', '(Ancho total − 20 de los cubos) ÷ 2 + 5');
    add('Alto de marcos', altoMarcos.toFixed(1)+' cm', altoMarcos===244 ? 'Tope de hoja: alto total − 6 pasa de 244, se deja en 244' : 'Alto total − 6');
    add('Alto de puertas', altoPuertas.toFixed(1)+' cm', 'Alto de marcos − 7.5');
    add('Ancho de marco', '10 cm', 'Fijo (confirmado por el usuario)');
    if(dosFijos){
      add('Fijos', '2 de '+(anchoFijoTotal/2).toFixed(1)+'×'+altoFijo.toFixed(1)+' cm', 'Ancho total + 2 = '+anchoFijoTotal.toFixed(1)+' cm; pasa de 244 (tope de hoja), se reparte en 2 fijos iguales');
    } else {
      add('Fijo', '1 de '+anchoFijoTotal.toFixed(1)+'×'+altoFijo.toFixed(1)+' cm', 'Ancho total + 2 (no pasa de 244, así que es 1 solo fijo)');
    }
    altoFijoParaExtra = altoFijo;
    cortes.push({pieza:'puerta', ancho:anchoPuertas, alto:altoPuertas, cantidad:2});
    cortes.push({pieza:'marco', ancho:10, alto:altoMarcos, cantidad:9});
    if(dosFijos) cortes.push({pieza:'fijo', ancho:anchoFijoTotal/2, alto:altoFijo, cantidad:2});
    else cortes.push({pieza:'fijo', ancho:anchoFijoTotal, alto:altoFijo, cantidad:1});
  } else {
    // Con cubo al centro: confirmado por el usuario (ejemplo: ancho 300, alto 260 →
    // puertas 76.75×236.5 (4 piezas), marcos 244×10 (8 piezas), fijos 151×33 (2 piezas)):
    // ancho de cada puerta = (((ancho total − 10 del cubo) ÷ 2) − 1.5) ÷ 2 + 5 (son 4 puertas,
    // 2 pares, uno a cada lado del cubo). Alto de marcos = alto total − 6, con tope de 244 cm
    // (medida de la hoja); alto de puertas = alto de marcos − 7.5 (igual que en los demás
    // tipos). Los 2 fijos miden (ancho total + 2) ÷ 2 de ancho cada uno; su alto se saca igual
    // que en todos los tipos de puerta: alto total − alto de marcos + 17.
    const altoMarcos = Math.min(alto-6, 244);
    const altoPuertas = altoMarcos-7.5;
    const anchoEfectivo = ancho-10;
    const anchoPuertas = (anchoEfectivo/2-1.5)/2+5;
    const anchoFijo = (ancho+2)/2;
    const altoFijo = alto-altoMarcos+17;
    add('Ancho de puertas (c/u, 4 piezas)', anchoPuertas.toFixed(2)+' cm', '(((Ancho total − 10 del cubo) ÷ 2) − 1.5) ÷ 2 + 5');
    add('Alto de marcos', altoMarcos.toFixed(1)+' cm', altoMarcos===244 ? 'Tope de hoja: alto total − 6 pasa de 244, se deja en 244' : 'Alto total − 6');
    add('Alto de puertas', altoPuertas.toFixed(1)+' cm', 'Alto de marcos − 7.5');
    add('Ancho de marco', '10 cm', 'Fijo (confirmado por el usuario), 8 piezas');
    add('Fijos (2 piezas)', anchoFijo.toFixed(1)+'×'+altoFijo.toFixed(1)+' cm', 'Ancho: (ancho total + 2) ÷ 2. Alto: alto total − alto de marcos + 17');
    altoFijoParaExtra = altoFijo;
    cortes.push({pieza:'puerta', ancho:anchoPuertas, alto:altoPuertas, cantidad:4});
    cortes.push({pieza:'marco', ancho:10, alto:altoMarcos, cantidad:8});
    cortes.push({pieza:'fijo', ancho:anchoFijo, alto:altoFijo, cantidad:2});
  }

  // Caso aislado (confirmado por el usuario): piden una pared falsa aparte en un modelo
  // "Con cubos a los lados" o "Con cubo al centro" (no es parte fija de esos modelos). La
  // pared falsa siempre sale de 244×60 cm (tamaño fijo, no depende de la medida del hueco), y
  // su extensión de fijo mide lo mismo de ancho (60 cm) por el alto del fijo de esa puerta.
  if(TIPOS_CON_PARED_FALSA_EXTRA.includes(tipo) && paredFalsaExtra){
    add('Pared falsa (aparte, poco común)', '244×60 cm', 'Medida fija, confirmada por el usuario');
    if(altoFijoParaExtra!=null) add('Extensión de fijo (aparte)', altoFijoParaExtra.toFixed(1)+'×60 cm', 'Mismo ancho que la pared falsa (60 cm) y el mismo alto del fijo de esta puerta');
    cortes.push({pieza:'paredFalsa', ancho:60, alto:244, cantidad:1});
    if(altoFijoParaExtra!=null) cortes.push({pieza:'extFijo', ancho:60, alto:altoFijoParaExtra, cantidad:1});
  }

  // Melamina de 15mm (confirmado por el usuario: mismo color que elige el cliente, misma hoja
  // estándar de 122×244 que el resto del inventario). Se acomodan todas las piezas de este corte
  // juntas (puertas, marcos, fijos, etc.) para aprovechar el sobrante entre ellas, y el resultado
  // es el número real de hojas completas que se van a cortar para esta instalación.
  // Confirmado por el usuario: "Con cubo al centro" lleva además 1 zóclo de 10×52 del color de
  // las puertas. Se descuenta proporcional (48 por hoja), aparte del acomodo de las puertas.
  const zoclos = tipo==='Con cubo al centro' ? 1 : 0;
  if(zoclos) add('Zóclo', '1 de 10×52 cm', 'Del color de las puertas (confirmado por el usuario)');
  return {info:piezas, cortes, zoclos};
}

function calcPuerta(){
  const tipo = $('#p-tipo').value;
  const color = $('#p-color').value;
  const alto = Number($('#p-alto').value);
  const ancho = Number($('#p-ancho').value);
  if(!alto || !ancho) return alert('Captura alto y ancho');
  const jaladeraTipo = $('#p-jaladera-tipo') ? $('#p-jaladera-tipo').value : 'normal';
  const pfExtra = !!(document.getElementById('p-pared-falsa-extra') && document.getElementById('p-pared-falsa-extra').checked);
  const calc = calcularPuerta(tipo, alto, ancho, pfExtra);
  const piezas = calc.info;
  const add=(n,v,nota)=>piezas.push({n,v,nota:nota||''});
  const cortes = calc.cortes; // [{pieza,ancho,alto,cantidad}] para calcular hojas de melamina

  const empaque = hojasParaCortesCombinado(cortes);
  const hojasMelamina = fmtNum(empaque.costo + (calc.zoclos||0)/piezasPorHojaIndividual(10, 52, 122, 244));
  if(empaque.noCaben>0) add('Aviso de corte', empaque.noCaben+' pieza(s) no caben en una hoja completa (122×244) en ninguna orientación', 'Revisa las medidas capturadas; esas piezas no se incluyeron en el cálculo de melamina');

  // Herrajes (confirmado por el usuario): riel/sistema/bastidor/jaladera según el tipo de puerta.
  // La jaladera se sustituye por "Jaladera plana" si el usuario lo eligió arriba (nunca se suman las dos).
  const herrajesTipo = TIPOS_PUERTA_HERRAJES[tipo];
  const nombreJaladera = jaladeraTipo==='plana' ? 'Jaladera plana' : 'Jaladeras';
  const consumo = [
    {itemId: itemByName('Rieles').id, cantidad: herrajesTipo.riel},
    {itemId: itemByName('Sistemas').id, cantidad: herrajesTipo.sistema},
    {itemId: itemByName('Bastidores').id, cantidad: herrajesTipo.bastidor},
    {itemId: itemByName(nombreJaladera).id, cantidad: herrajesTipo.jaladera}
  ];
  const regHerr = !instRegresoLibre || !document.getElementById('p-reg-herrajes') || document.getElementById('p-reg-herrajes').checked;
  if(!regHerr) consumo.length = 0; // regreso sin herrajes: solo la melamina
  if(hojasMelamina>0) consumo.push({itemId: itemByName('Melamina '+color).id, cantidad: hojasMelamina});

  const faltantes = [];
  consumoAValidar(consumo).forEach(c=>{
    const f = calcFormula(c.itemId);
    if(f.final - c.cantidad < 0){
      faltantes.push({itemId:c.itemId, nombre:CATALOGO.find(i=>i.id===c.itemId).nombre, disponible:f.final, requerido:c.cantidad});
    }
  });
  const bloqueado = !instRegresoLibre && faltantes.length>0; // un regreso suma, no necesita existencia
  // Sobrante de la última hoja (confirmado por el usuario): cuando las puertas pasan de 2 hojas y
  // de la siguiente solo se usa un poco, se ofrece mandar ese pedazo a Sobrantes para hacer piezas.
  const sobHojas = (!instRegresoLibre && !instCambio) ? (empaque.sobrantesHoja||[]).filter(x=>x.sobra>=0.05) : [];
  const sobOferta = sobHojas.length ? {hojas:sobHojas, cantidad:(sobHojas.length===1 ? Math.round((Math.ceil(Number(hojasMelamina)-1e-9)-Number(hojasMelamina))*1000)/1000 : Math.round(sobHojas.reduce((a,x)=>a+x.sobra,0)*1000)/1000), itemId:itemByName('Melamina '+color).id, totalHojas:empaque.hojas} : null;
  const prevSob = puertaPreview && puertaPreview.sobOferta && puertaPreview.tipo===tipo && puertaPreview.alto===alto && puertaPreview.ancho===ancho && puertaPreview.color===color ? puertaPreview.aSob : false;
  puertaPreview = {tipo, color, alto, ancho, consumo, faltantes, bloqueado, regreso:instRegresoLibre, conHerrajes:regHerr, sobOferta, aSob: sobOferta ? prevSob : false};

  let html = `<div class="card"><h3>${tipo} · ${color}</h3>
    <div class="wrap-x"><table><tr><th>Dato</th><th>Valor</th><th>Regla</th></tr>
    ${piezas.map(p=>`<tr><td>${p.n}</td><td>${p.v}</td><td class="hint">${p.nota}</td></tr>`).join('')}
    </table></div>
    <div class="hint">Melamina de 15mm (color ${color}): todas las piezas de este corte se acomodan juntas en hojas de 122×244 cm, aprovechando el sobrante entre puertas/marcos/fijos. Se van a cortar <strong>${empaque.hojas} hoja(s) física(s)</strong> del almacén, pero solo se descuenta <strong>${hojasMelamina}</strong> del inventario (lo que realmente ocupan las piezas; el resto queda como sobrante disponible para otro corte).</div>
    <div class="wrap-x" style="margin-top:8px"><table><tr><th>${instRegresoLibre?'↩️ Regresa al inventario':'Material/herraje a descontar'}</th><th>Cantidad</th><th>Disponible</th></tr>
    ${consumo.map(c=>{ const f=calcFormula(c.itemId); const insuf = !instRegresoLibre && faltantes.some(x=>x.itemId===c.itemId);
      return `<tr><td>${CATALOGO.find(i=>i.id===c.itemId).nombre}</td><td class="${insuf?'neg':''}">${c.cantidad} ${item2unidad(c.itemId)}</td><td>${fmtNum(f.final)}</td></tr>`;
    }).join('')}
    </table></div>
  </div>`;

  if(bloqueado){
    html += `<div class="card aviso"><strong>⛔ No alcanza el material en ${modulo()}</strong>
      <ul style="margin:6px 0 0 18px;padding:0;line-height:1.7">${faltantes.map(f=>`<li>${f.nombre}: hay <strong>${fmtNum(f.disponible)}</strong> y se necesitan <strong>${fmtNum(f.requerido)}</strong></li>`).join('')}</ul>
      <p class="hint">Revisa las medidas y el color, o que ya se hayan anotado las entradas de material. No se descontó nada.</p></div>`;
  } else if(instRegresoLibre){
    html += `<div class="card"><button class="btn" style="width:100%;min-height:56px;font-size:16px;background:linear-gradient(135deg,#1f9d55,#178045)" onclick="confirmarRegresoPuerta()">↩️ Regresar puertas al inventario</button></div>`;
  } else {
    html += avisoAutoCorteHtml(consumo);
    if(sobOferta) html += `<div class="card" id="p-sob-card"></div>`;
    html += instCambio ? cambioPreviewHtml(consumo, `registrarPuerta('${tipo}',${alto},${ancho})`) : `<div class="card"><button class="btn" style="width:100%;min-height:56px;font-size:16px;background:linear-gradient(135deg,#1f9d55,#178045)" onclick="registrarPuerta('${tipo}',${alto},${ancho})">✅ Confirmar instalación de puertas</button></div>`;
  }
  $('#p-result').innerHTML = html;
  pintarSobPuerta();
}
function pintarSobPuerta(){
  const el = document.getElementById('p-sob-card'); const pp = puertaPreview;
  if(!el || !pp || !pp.sobOferta) return;
  const o = pp.sobOferta, on = !!pp.aSob;
  const det = o.hojas.map(x=>`<li>Hoja ${x.hoja} de ${o.totalHojas}: solo se usa <strong>${Math.round(x.usado*100)}%</strong> (${x.piezas} pieza${x.piezas===1?'':'s'}) → sobra <strong>${fmtNum(x.sobra)} hoja</strong>${x.libre?` · pedazo libre aprox. <strong>${fmtNum(x.libre.w)}×${fmtNum(x.libre.h)} cm</strong>`:''}</li>`).join('');
  el.style.border = '2px solid #0e8a8a';
  el.innerHTML = `<div style="font-size:16px;font-weight:800">🧩 ¿Mandar el sobrante a Sobrantes?</div>
    <ul style="margin:8px 0 6px 18px;padding:0;line-height:1.6">${det}</ul>
    <p class="hint" style="margin:0 0 10px">Si lo mandas, ese pedazo sale del inventario y queda apartado en <strong>Sobrantes</strong> para convertirlo en piezas (entrepaños, zóclos, puertas…). Si no, se queda en el inventario como <strong>cortado</strong>.</p>
    <div class="row" style="gap:8px">
      <button class="btn" style="flex:1;min-height:50px;${on?'background:linear-gradient(135deg,#0e8a8a,#0b6f6f)':'background:transparent;color:inherit;border:1px solid var(--line);box-shadow:none'}" onclick="puertaPreview.aSob=true;pintarSobPuerta()">${on?'✅ ':''}Sí, a sobrantes (${fmtNum(o.cantidad)})</button>
      <button class="btn" style="flex:1;min-height:50px;${!on?'background:linear-gradient(135deg,#5b6b7f,#46566a)':'background:transparent;color:inherit;border:1px solid var(--line);box-shadow:none'}" onclick="puertaPreview.aSob=false;pintarSobPuerta()">${!on?'✅ ':''}No, se queda cortado</button>
    </div>`;
}

// Puertas completas que regresan sin instalación registrada (confirmado por el usuario): mismo
// cálculo que una instalación de puertas, pero todo se SUMA al inventario.
async function confirmarRegresoPuerta(){
  const pp = puertaPreview;
  if(!pp || !pp.regreso || !instRegresoLibre) return;
  if(pp.color!==$('#p-color').value || pp.tipo!==$('#p-tipo').value || pp.alto!==Number($('#p-alto').value) || pp.ancho!==Number($('#p-ancho').value)) return alert('Vuelve a tocar "Revisar material": los datos cambiaron.');
  const nota = ($('#p-nota').value||'').trim();
  const desc = `Puerta ${pp.tipo} · ${pp.color} · ${pp.ancho}×${pp.alto} cm (ancho×alto)${pp.conHerrajes?'':' · sin herrajes'}`;
  const cons = pp.consumo.filter(c=>Number(c.cantidad)>0);
  if(!confirm(`↩️ Regresar al inventario:\n${desc}\n\n${cons.map(c=>{ const it=CATALOGO.find(i=>i.id===c.itemId); return `+ ${fmtNum(c.cantidad)} ${it.unidad} ${it.nombre}${esHoja(it)?' (como cortado)':''}`; }).join('\n')}\n\n¿Continuar?`)) return;
  try{
    const estado = estadoNuevoMovimiento(), creadoPor = getCurrentUserEmail?getCurrentUserEmail():'', fecha = new Date().toISOString(), loteId = cryptoId();
    for(const c of cons){ const it = CATALOGO.find(i=>i.id===c.itemId);
      await db.collection('movimientos').doc(cryptoId()).set({modulo:modulo(), itemId:it.id, itemNombre:it.nombre, tipo:'devolucion', motivo:'regresoInstalacion', modeloRegreso:desc, cantidad:fmtNum(Number(c.cantidad)), nota:'Regresaron puertas completas · '+desc+(nota?' · '+nota:''), fecha, estado, loteId, creadoPor});
    }
    toast(estado==='pendiente' ? '✅ Guardado.<br><small>Dirección lo aprueba y se suma al inventario.</small>' : '✅ Puertas regresadas al inventario.');
    puertaPreview=null; renderInstPuertas(); window.scrollTo(0,0);
  }catch(e){ alert('Error: '+e.message); }
}
async function registrarPuerta(tipo, alto, ancho){
  const colorSel = $('#p-color') ? $('#p-color').value : null;
  if(!puertaPreview || puertaPreview.bloqueado || puertaPreview.regreso || puertaPreview.tipo!==tipo || puertaPreview.alto!==alto || puertaPreview.ancho!==ancho || puertaPreview.color!==colorSel){
    alert('Vuelve a calcular las medidas antes de registrar (los datos cambiaron o no hay vista previa).');
    return;
  }
  const nota = ($('#p-nota').value||'').trim();
  const fechaDia = $('#p-fecha').value || new Date().toISOString().slice(0,10);
  const desc = `Puerta ${tipo} · ${puertaPreview.color} · ${ancho}×${alto} cm (ancho×alto)`;
  if(instCambio) return guardarCambioModelo({categoria:'Puerta', desc, nota, modeloKey:'Puerta '+tipo, esMax:false, extras:0, consumo:puertaPreview.consumo});
  try{
    // Re-valida en el último momento antes de escribir, y escribe todo o nada
    for(const c of puertaPreview.consumo){
      const f = calcFormula(c.itemId);
      if(f.final - c.cantidad < 0){ alert('Existencia cambió, ya no alcanza para: '+CATALOGO.find(i=>i.id===c.itemId).nombre); return; }
    }
    const estado = estadoNuevoMovimiento();
    const creadoPor = getCurrentUserEmail?getCurrentUserEmail():'';
    const logId = cryptoId();
    for(const c of puertaPreview.consumo){
      const item = CATALOGO.find(i=>i.id===c.itemId);
      await db.collection('movimientos').doc(cryptoId()).set({modulo:modulo(),itemId:c.itemId,itemNombre:item.nombre,tipo:'instalacion',cantidad:c.cantidad,nota:`${desc}${nota?(' · '+nota):''}`,fecha:new Date().toISOString(),estado,loteId:logId,creadoPor});
    }
    await db.collection('instalacionesPuertas').doc(cryptoId()).set({modulo:modulo(),tipo,color:puertaPreview.color,alto,ancho,nota,fechaDia,fecha:new Date().toISOString(),estado});
    await db.collection('instalacionesLog').doc(logId).set({
      modulo:modulo(), categoria:'Puerta', descripcion:desc, nota, fechaDia, modeloKey:'Puerta '+tipo,
      consumo:puertaPreview.consumo, fecha:new Date().toISOString(), estado, creadoPor
    });
    const so = puertaPreview.sobOferta; let conSob = false;
    if(so && puertaPreview.aSob && so.cantidad>0){
      const sid = logId+'s', it = CATALOGO.find(i=>i.id===so.itemId), fS = new Date(Date.now()+1).toISOString();
      const lineas = so.hojas.map(x=>`Sobrante de hoja ${x.hoja} de ${so.totalHojas} del corte de puertas (${fmtNum(x.sobra)} hoja${x.libre?`, pedazo aprox. ${fmtNum(x.libre.w)}×${fmtNum(x.libre.h)} cm`:''})`);
      await db.collection('movimientos').doc(cryptoId()).set({modulo:modulo(), itemId:it.id, itemNombre:it.nombre, tipo:'sobrante', motivo:'sobranteCortePuertas', instalacionId:logId, cantidad:so.cantidad, nota:'Sobrante del corte · '+desc, fecha:fS, estado, loteId:sid, sobranteId:sid, creadoPor});
      await db.collection('sobrantes').doc(sid).set({modulo:modulo(), fecha:fS, nota:'Sobrante del corte de '+desc, lineas, lineasData:[], material:[{itemId:it.id, cantidad:so.cantidad}], restante:{[it.id]:so.cantidad}, estado:'abierto', transformaciones:[], creadoPor, deInstalacion:logId, deCortePuertas:true});
      conSob = true;
    }
    toast((estado==='pendiente'
      ? '✅ Puertas guardadas.<br><small>Dirección las tiene que aprobar para que se descuenten.</small>'
      : '✅ Instalación de puertas registrada.') + (conSob?'<br><small>🧩 El sobrante de la hoja quedó en Sobrantes.</small>':''));
    puertaPreview = null;
    renderInstPuertas();
    window.scrollTo(0,0);
  }catch(e){ alert('Error al registrar: '+e.message); }
}

// ===== Capa 5: Traspasos entre módulos =====
// Calcula la fórmula para CUALQUIER módulo (no solo el activo), consultando Supabase/DB directamente.
async function calcFormulaForModulo(mod, itemId){
  let resetFecha=null, docIni=null;
  const lista = [];
  try{ const r = await db.collection('resets').doc(mod).get(); if(r && r.data) resetFecha = r.data().fecha; }catch(e){}
  try{
    const d = await db.collection('inicial').doc(inicialKey(mod,itemId)).get();
    if(d && d.data) docIni = d.data();
  }catch(e){}
  const b = lineaBase(resetFecha, docIni);
  const inicial = b.inicial, inicialCortado = b.inicialCortado;
  try{
    const snap = await db.collection('movimientos').get();
    snap.docs.forEach(doc=>{
      const m = doc.data();
      if(m.modulo!==mod || m.itemId!==itemId) return;
      if(b.desde && m.fecha<=b.desde) return;
      if(m.estado==='pendiente' || m.estado==='rechazado') return;
      lista.push(m);
    });
  }catch(e){}
  return calcularFormula(itemId, inicial, inicialCortado, lista);
}

// Un traspaso = movimiento de inventario (inmediato) + registro de préstamo (deuda entre módulos).
// Para hojas de melamina, el color no importa para la deuda: 1 hoja de cualquier color = 1 hoja para efectos de préstamo/devolución.
// Para todo lo demás, la devolución debe ser exactamente del mismo artículo.
let traspSub = 'nuevo';
let traspCat = null;
let traspOrigen = null;
let traspDestino = null;
let prestamos = [];

function esMelaminaId(itemId){ const it=CATALOGO.find(i=>i.id===itemId); return it && it.cat==='Melamina'; }
function grupoDeuda(itemId){ return esMelaminaId(itemId) ? 'Melamina' : itemId; } // clave de agrupación de la deuda

async function cargarPrestamos(){
  try{
    const snap = await db.collection('prestamos').get();
    prestamos = snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.fecha||'').localeCompare(a.fecha||''));
  }catch(e){ prestamos=[]; }
}

function renderTrasp(){
  // Un coordinador solo puede traspasar DESDE su propio módulo (nunca desde otro).
  if(miPerfil && miPerfil.rol==='coordinador') traspOrigen = modulo();
  if(!traspOrigen) traspOrigen = modulo();
  $('#main').innerHTML = `
    <div class="card"><div class="subtabs">
      <button class="${traspSub==='nuevo'?'active':''}" onclick="traspSub='nuevo';renderTrasp()">Nuevo traspaso</button>
      <button class="${traspSub==='historial'?'active':''}" onclick="traspSub='historial';renderTrasp()">Préstamos / Historial</button>
      <button class="${traspSub==='resumen'?'active':''}" onclick="traspSub='resumen';renderTrasp()">Resumen de deudas</button>
    </div></div>
    <div id="trasp-body"></div>`;
  if(traspSub==='nuevo') renderTraspNuevo();
  else if(traspSub==='historial') renderTraspHistorial();
  else renderTraspResumen();
}

function renderTraspNuevo(){
  const cats = [...new Set(CATALOGO.map(i=>i.cat))];
  if(!traspCat) traspCat = cats[0];
  if(!traspDestino || traspDestino===traspOrigen) traspDestino = MODULOS.find(m=>m.nombre!==traspOrigen).nombre;
  const catsHtml = cats.map(c=>
    `<button class="btn small" style="background:${c===traspCat?'var(--brand)':'transparent'};color:${c===traspCat?'var(--brand-ink)':'var(--ink)'};border:1px solid var(--line);margin:2px" onclick="traspCat='${c}';renderTraspNuevo()">${c}</button>`
  ).join('');
  const items = CATALOGO.filter(i=>i.cat===traspCat);
  $('#trasp-body').innerHTML = `
  <div class="card">
    <strong>Nuevo traspaso</strong>
    <p class="hint">El material sale del inventario del módulo origen y entra al del destino de inmediato. Además queda un registro de préstamo para llevar la deuda entre módulos.</p>
    <div class="grid2" style="margin-top:8px">
      <div><label class="hint">Módulo origen</label>${(miPerfil && miPerfil.rol==='coordinador')
        ? `<input value="${traspOrigen}" disabled>`
        : `<select id="t-origen" onchange="traspOrigen=this.value;renderTraspNuevo()">${MODULOS.map(m=>`<option ${m.nombre===traspOrigen?'selected':''}>${m.nombre}</option>`).join('')}</select>`}</div>
      <div><label class="hint">Módulo destino</label><select id="t-destino" onchange="traspDestino=this.value">${MODULOS.filter(m=>m.nombre!==traspOrigen).map(m=>`<option ${m.nombre===traspDestino?'selected':''}>${m.nombre}</option>`).join('')}</select></div>
    </div>
    <div style="margin-top:8px">${catsHtml}</div>
    <div class="wrap-x" style="margin-top:6px"><table><tr><th>Artículo</th><th>Stock en ${traspOrigen}</th><th>Cantidad a traspasar</th></tr>
      ${items.map(it=>`<tr><td>${it.nombre}</td><td id="t-stock-${it.id}" class="hint">cargando…</td><td><input type="number" min="0" id="t-cant-${it.id}" placeholder="0"></td></tr>`).join('')}
    </table></div>
    <input id="t-nota" placeholder="Nota (opcional)" style="margin-top:8px">
    <button class="btn" style="margin-top:10px" onclick="previewTraspaso()">Ver resumen del traspaso</button>
  </div>
  <div id="t-result"></div>`;
  items.forEach(async it=>{
    const f = await calcFormulaForModulo(traspOrigen, it.id);
    const el = document.getElementById('t-stock-'+it.id);
    if(el) el.textContent = f.esHoja ? (fmtNum(f.completas)+' completas ('+fmtNum(f.cortado)+' cortado)') : (fmtNum(f.final)+' '+it.unidad);
  });
}

let traspPreview = null;
async function previewTraspaso(){
  const items = CATALOGO.filter(i=>i.cat===traspCat);
  const elegidos = [];
  for(const it of items){
    const el = document.getElementById('t-cant-'+it.id);
    const cantidad = Number(el.value);
    if(cantidad>0) elegidos.push({itemId:it.id, itemNombre:it.nombre, unidad:it.unidad, cantidad});
  }
  if(elegidos.length===0) return alert('Captura al menos una cantidad.');
  $('#t-result').innerHTML = `<div class="card hint">Validando existencias en ${traspOrigen}…</div>`;
  const faltantes = [];
  for(const e of elegidos){
    const f = await calcFormulaForModulo(traspOrigen, e.itemId);
    // Hojas: un traspaso sale de hojas COMPLETAS (igual que una salida).
    const disp = f.esHoja ? f.completas : f.final;
    if(disp - e.cantidad < -1e-9) faltantes.push({...e, disponible:disp});
  }
  traspPreview = {origen:traspOrigen, destino:traspDestino, elegidos, nota:($('#t-nota').value||'').trim(), bloqueado: faltantes.length>0, faltantes};
  let html = `<div class="card"><h3>${traspOrigen} → ${traspDestino}</h3>
    <div class="wrap-x"><table><tr><th>Artículo</th><th>Cantidad</th></tr>
    ${elegidos.map(e=>`<tr><td>${e.itemNombre}</td><td>${e.cantidad} ${e.unidad}</td></tr>`).join('')}
    </table></div>
  </div>`;
  if(faltantes.length>0){
    html += `<div class="card"><div class="warn"><strong>Traspaso bloqueado — existencia insuficiente en ${traspOrigen}.</strong>
      <ul style="margin:6px 0 0 18px;padding:0">${faltantes.map(f=>`<li>${f.itemNombre}: disponible ${fmtNum(f.disponible)}, se pidieron ${fmtNum(f.cantidad)}</li>`).join('')}</ul>
      No se movió nada.</div></div>`;
  } else {
    html += `<div class="card row" style="justify-content:flex-end"><button class="btn" onclick="confirmarTraspaso()">Confirmar traspaso</button></div>`;
  }
  $('#t-result').innerHTML = html;
}

async function confirmarTraspaso(){
  if(!traspPreview || traspPreview.bloqueado) return;
  const {origen, destino, elegidos, nota} = traspPreview;
  try{
    const creadoPor = getCurrentUserEmail?getCurrentUserEmail():'';
    for(const e of elegidos){
      const notaTxt = `Traspaso ${origen} → ${destino}${nota?(' · '+nota):''}`;
      // Los traspasos SIEMPRE se aplican de inmediato (no piden aprobación de Dirección),
      // aunque los registre un coordinador — así lo pidió el negocio. La deuda entre
      // módulos (colección "prestamos") sí queda registrada para llevar el control de quién
      // le debe a quién ("estado" aquí es pendiente/parcial/cerrado de la DEUDA, no de aprobación).
      await db.collection('movimientos').doc(cryptoId()).set({modulo:origen,itemId:e.itemId,itemNombre:e.itemNombre,tipo:'salida',cantidad:e.cantidad,nota:notaTxt,fecha:new Date().toISOString(),estado:'aprobado',creadoPor});
      await db.collection('movimientos').doc(cryptoId()).set({modulo:destino,itemId:e.itemId,itemNombre:e.itemNombre,tipo:'entrada',cantidad:e.cantidad,nota:notaTxt,fecha:new Date().toISOString(),estado:'aprobado',creadoPor});
      // Registro de préstamo: cada artículo lleva su propia deuda.
      await db.collection('prestamos').doc(cryptoId()).set({
        origen, destino, itemId:e.itemId, itemNombre:e.itemNombre, categoria:CATALOGO.find(i=>i.id===e.itemId).cat, unidad:e.unidad,
        esMelamina: esMelaminaId(e.itemId), cantidad:e.cantidad, devuelto:0, pendiente:e.cantidad, estado:'pendiente',
        nota, fecha:new Date().toISOString(), devoluciones:[], creadoPor
      });
    }
    $('#t-result').innerHTML = `<div class="card pos">Traspaso registrado: ${elegidos.length} artículo(s) de ${origen} a ${destino}. Queda como préstamo pendiente hasta que ${destino} devuelva el material.</div>`;
    traspPreview = null;
  }catch(e){ alert('Error al registrar: '+e.message); }
}

async function renderTraspHistorial(){
  $('#trasp-body').innerHTML = `<div class="card hint">Cargando préstamos…</div>`;
  await cargarPrestamos();
  if(prestamos.length===0){ $('#trasp-body').innerHTML = `<div class="card">Aún no hay traspasos registrados.</div>`; return; }
  $('#trasp-body').innerHTML = prestamos.map(p=>`
    <div class="card">
      <div class="row" style="justify-content:space-between">
        <div><strong>${p.origen} → ${p.destino}</strong><div class="tag">${new Date(p.fecha).toLocaleString()}</div></div>
        <div class="${p.estado==='cerrado'?'pos':(p.estado==='parcial'?'':'neg')}" style="font-weight:700">${p.estado.toUpperCase()}</div>
      </div>
      <p class="hint" style="margin:6px 0">${p.itemNombre}${p.esMelamina?' (hoja de melamina — cualquier color cuenta igual para la deuda)':''} · Prestado: ${fmtNum(p.cantidad)} ${p.unidad} · Devuelto: ${fmtNum(p.devuelto)} · Pendiente: <strong>${fmtNum(p.pendiente)} ${p.unidad}</strong></p>
      ${p.pendiente>0? `<button class="btn small" onclick="mostrarFormDevolucion('${p.id}')">Registrar devolución</button><div id="dev-${p.id}"></div>` : ''}
    </div>`).join('');
}

function mostrarFormDevolucion(prestamoId){
  const p = prestamos.find(x=>x.id===prestamoId);
  const opciones = p.esMelamina
    ? MEL_COLORES.map(c=>`<option value="${itemByName('Melamina '+c).id}">Melamina ${c}</option>`).join('')
    : `<option value="${p.itemId}">${p.itemNombre}</option>`;
  document.getElementById('dev-'+prestamoId).innerHTML = `
    <div class="warn" style="margin-top:8px">
      <div class="grid2">
        <select id="dev-item-${prestamoId}">${opciones}</select>
        <input id="dev-cant-${prestamoId}" type="number" min="0" max="${p.pendiente}" placeholder="Cantidad a devolver (máx. ${fmtNum(p.pendiente)})">
      </div>
      <button class="btn small" style="margin-top:8px" onclick="registrarDevolucion('${prestamoId}')">Confirmar devolución</button>
    </div>`;
}

async function registrarDevolucion(prestamoId){
  const p = prestamos.find(x=>x.id===prestamoId);
  const itemId = document.getElementById('dev-item-'+prestamoId).value;
  const cantidad = Number(document.getElementById('dev-cant-'+prestamoId).value);
  if(!cantidad || cantidad<=0) return alert('Cantidad inválida');
  if(cantidad > p.pendiente) return alert('No puedes devolver más de lo pendiente ('+fmtNum(p.pendiente)+' '+p.unidad+').');
  const item = CATALOGO.find(i=>i.id===itemId);
  // Quien devuelve es el destino original del préstamo; el material regresa al origen original.
  const fDestino = await calcFormulaForModulo(p.destino, itemId);
  const dispDev = fDestino.esHoja ? fDestino.completas : fDestino.final;
  if(dispDev - cantidad < -1e-9) return alert(p.destino+' no tiene suficiente "'+item.nombre+'" para devolver ('+fmtNum(dispDev)+(fDestino.esHoja?' hojas completas':'')+' disponibles).');
  try{
    const notaTxt = `Devolución de préstamo ${p.destino} → ${p.origen} (${p.itemNombre})`;
    await db.collection('movimientos').doc(cryptoId()).set({modulo:p.destino,itemId,itemNombre:item.nombre,tipo:'salida',cantidad,nota:notaTxt,fecha:new Date().toISOString(),estado:'aprobado'});
    await db.collection('movimientos').doc(cryptoId()).set({modulo:p.origen,itemId,itemNombre:item.nombre,tipo:'entrada',cantidad,nota:notaTxt,fecha:new Date().toISOString(),estado:'aprobado'});
    const nuevoDevuelto = p.devuelto + cantidad;
    const nuevoPendiente = p.cantidad - nuevoDevuelto;
    const nuevoEstado = nuevoPendiente<=0 ? 'cerrado' : (nuevoDevuelto>0 ? 'parcial' : 'pendiente');
    await db.collection('prestamos').doc(prestamoId).update({
      devuelto: nuevoDevuelto, pendiente: Math.max(0,nuevoPendiente), estado: nuevoEstado,
      devoluciones: [...(p.devoluciones||[]), {fecha:new Date().toISOString(), cantidad, itemId, itemNombre:item.nombre}]
    });
    alert('Devolución registrada.'+(nuevoEstado==='cerrado'? ' Préstamo CERRADO.':' Pendiente: '+fmtNum(Math.max(0,nuevoPendiente))+' '+p.unidad+'.'));
    renderTraspHistorial();
  }catch(e){ alert('Error: '+e.message); }
}

async function renderTraspResumen(){
  $('#trasp-body').innerHTML = `<div class="card hint">Calculando deudas…</div>`;
  await cargarPrestamos();
  const pendientes = prestamos.filter(p=>p.pendiente>0);
  if(pendientes.length===0){ $('#trasp-body').innerHTML = `<div class="card">No hay deudas pendientes entre módulos.</div>`; return; }
  // Agrupar por (destino debe a origen) + grupo de deuda (Melamina agrupa colores; lo demás por itemId)
  const grupos = {};
  pendientes.forEach(p=>{
    const key = p.destino+'||'+p.origen+'||'+grupoDeuda(p.itemId);
    if(!grupos[key]) grupos[key] = {deudor:p.destino, acreedor:p.origen, etiqueta: p.esMelamina?'Hojas de melamina (cualquier color)':p.itemNombre, unidad:p.unidad, pendiente:0};
    grupos[key].pendiente += p.pendiente;
  });
  const porDeudor = {};
  Object.values(grupos).forEach(g=>{ (porDeudor[g.deudor+'||'+g.acreedor] = porDeudor[g.deudor+'||'+g.acreedor]||[]).push(g); });
  $('#trasp-body').innerHTML = `<div class="card"><strong>Préstamos entre módulos (pendientes)</strong>
    <p class="hint">Para hojas de melamina, el color no afecta la deuda: se suma por hoja, sin importar el color prestado o devuelto.</p></div>` +
    Object.keys(porDeudor).map(key=>{
      const [deudor,acreedor] = key.split('||');
      const items = porDeudor[key];
      return `<div class="card"><strong>${deudor} debe a ${acreedor}</strong>
        <ul style="margin:6px 0 0 18px;padding:0">${items.map(g=>`<li>${fmtNum(g.pendiente)} ${g.unidad} de ${g.etiqueta}</li>`).join('')}</ul>
      </div>`;
    }).join('');
}

// ===== Capa 5: Reportes =====
function puedeCerrarInventarioDiario(){ return esAdmin() || (miPerfil && miPerfil.rol==='coordinador'); }

function renderRep(){
  const cats = [...new Set(CATALOGO.map(i=>i.cat))];
  const conMovimiento = CATALOGO.filter(it=>{ const f=calcFormula(it.id); return f.inicial||f.entradas||f.salidas||f.instalaciones||f.garantias||f.mermas||f.cortes||f.ajustes; });
  const ultimaAud = auditorias[0];

  let html = '';

  if(puedeCerrarInventarioDiario()){
    html += `<div class="card row" style="justify-content:space-between">
      <div><strong>Cierre de inventario diario</strong><p class="hint" style="margin:2px 0 0">Genera un solo PDF de ${modulo()} con dos partes: el inventario completo y, en una hoja aparte, la melamina sin cortar.</p></div>
      <button class="btn" onclick="cerrarInventarioDiarioUI()">📄 Cerrar inventario diario</button>
    </div>`;
  }

  html += `<div class="card" id="rep-inst"><strong>🔧 Instalaciones de ${modulo()}</strong><p class="hint" style="margin:4px 0 0">Calculando…</p></div>`;
  html += `<div class="card" id="rep-gas"><strong>⛽ Gasolina de ${modulo()}</strong><p class="hint" style="margin:4px 0 0">Calculando…</p></div>`;
  setTimeout(repGasolinaSemana, 0);
  setTimeout(repInstalacionesSemana, 0);
  html += `<div class="card row" style="justify-content:space-between">
      <div><strong>📜 Historial de entradas y salidas</strong><p class="hint" style="margin:2px 0 0">Cuándo llegó material, cuándo salió y quién lo anotó, con totales por fechas.</p></div>
      <button class="btn small" onclick="irA('movhist')">Ver historial</button>
    </div>`;
  html += `<div class="card">
    <strong>Reporte · ${modulo()}</strong>
    <p class="hint">Comprobación matemática: Inicial + Entradas − Salidas − Instalaciones − Garantías − Mermas ± Ajustes de auditoría = Final, artículo por artículo. En hojas, además: Final = Completas + Cortado.</p>
  </div>`;

  html += `<div class="card row" style="justify-content:space-between">
    <div><strong>Respaldo manual</strong><p class="hint" style="margin:2px 0 0">Descarga toda la base (de todos los módulos) en un archivo .json, como respaldo extra al de Supabase.</p></div>
    <button class="btn small" onclick="exportarRespaldo()">Descargar respaldo</button>
  </div>`;

  if(esAdmin()){
    html += `<div class="card row" style="justify-content:space-between">
      <div><strong>PIN de administrador</strong><p class="hint" style="margin:2px 0 0">Se pide para "poner en cero" el inventario de cualquier módulo. Solo tú (admin) puedes cambiarlo.</p></div>
      <button class="btn small" onclick="cambiarPinCero()">Cambiar PIN</button>
    </div>
    <div class="card row" style="justify-content:space-between">
      <div><strong>⚠️ Stock mínimo</strong><p class="hint" style="margin:2px 0 0">Avisa cuando un módulo baja de lo mínimo.</p></div>
      <button class="btn small" onclick="minVals=null;irA('min')">Configurar</button>
    </div>
    <div class="card" style="border:1px solid var(--bad)">
      <strong style="color:var(--bad)">🗑️ Borrar datos de prueba</strong>
      <p class="hint" style="margin:4px 0 10px">Deja un módulo (o los 5) <strong>completamente en blanco</strong>: borra movimientos, instalaciones, garantías, traspasos, auditorías, faltantes, stock inicial e historial. Los usuarios y el PIN no se tocan. No se puede deshacer; descarga un respaldo antes.</p>
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <button class="btn small" style="background:var(--bad)" onclick="borrarDatosModulo([modulo()])">Borrar todo de ${modulo()}</button>
        <button class="btn small" style="background:transparent;color:var(--bad);border:1px solid var(--bad);box-shadow:none" onclick="borrarDatosModulo(MODULOS.map(m=>m.nombre))">Borrar todo de los 5 módulos</button>
      </div>
    </div>`;
  }

  // Hojas completas vs. material cortado/armado (Melamina y MDF)
  const hojasItems = CATALOGO.filter(it=>esHoja(it)).map(it=>({it, f:calcFormula(it.id)})).filter(x=>x.f.final||x.f.cortes||x.f.autoCortes||x.f.instalaciones);
  const tH = hojasItems.reduce((s,x)=>{ s.c+=x.f.completas; s.k+=x.f.cortado; s.t+=x.f.final; s.cr+=x.f.cortes; s.a+=x.f.autoCortes; s.i+=x.f.instalaciones; return s; },{c:0,k:0,t:0,cr:0,a:0,i:0});
  html += `<div class="card"><h3>Hojas completas y material cortado/armado</h3>
    <p class="hint">Cuánto hay en hojas completas y cuánto ya está cortado o armado. "Cortes" = hojas que el taller registró como cortadas; "Sin corte" = hojas tomadas provisionalmente por instalaciones capturadas antes del corte (se cubren solas al registrar el corte del día; si siguen aquí al día siguiente, faltó registrarlo).</p>
    <div class="wrap-x"><table><tr><th>Hoja</th><th>Completas</th><th>Cortado</th><th>Total</th><th>Cortes</th><th>Sin corte</th><th>Usado instal.</th></tr>
    ${hojasItems.map(({it,f})=>`<tr><td>${it.nombre}</td><td>${fmtNum(f.completas)}</td><td style="color:var(--accent);font-weight:700">${fmtNum(f.cortado)}</td><td><strong>${fmtNum(f.final)}</strong></td><td>${fmtNum(f.cortes)}</td><td class="${f.autoCortes?'neg':''}">${fmtNum(f.autoCortes)}</td><td>${fmtNum(f.instalaciones)}</td></tr>`).join('')}
    ${hojasItems.length?`<tr><td><strong>Total</strong></td><td><strong>${fmtNum(tH.c)}</strong></td><td><strong>${fmtNum(tH.k)}</strong></td><td><strong>${fmtNum(tH.t)}</strong></td><td><strong>${fmtNum(tH.cr)}</strong></td><td><strong>${fmtNum(tH.a)}</strong></td><td><strong>${fmtNum(tH.i)}</strong></td></tr>`:'<tr><td colspan="7" class="hint">Sin hojas en inventario todavía.</td></tr>'}
    </table></div>
  </div>`;

  // Deuda por faltantes de auditoría (aparte del inventario)
  const deudaPend = deudas.filter(d=>d.estado!=='saldada');
  html += `<div class="card row" style="justify-content:space-between">
    <div><strong>Deuda por faltantes de auditoría</strong><p class="hint" style="margin:2px 0 0">${deudaPend.length ? `${deudaPend.length} faltante(s) pendiente(s) en ${modulo()}: ${[...new Set(deudaPend.map(d=>d.itemNombre))].slice(0,4).join(', ')}${new Set(deudaPend.map(d=>d.itemNombre)).size>4?'…':''}` : 'Sin deuda pendiente en '+modulo()+'.'}</p></div>
    <button class="btn small" onclick="histTab='deuda';setView('hist')">Ver deuda</button>
  </div>`;

  html += `<div class="card"><h3>Inventario (solo artículos con movimiento)</h3>
    <div class="wrap-x"><table><tr><th>Artículo</th><th>Inicial</th><th>Entr.</th><th>Sal.</th><th>Instal.</th><th>Garant.</th><th>Mermas</th><th>Ajuste</th><th>Final</th></tr>
    ${conMovimiento.map(it=>{ const f=calcFormula(it.id);
      return `<tr><td>${it.nombre}</td><td>${fmtNum(f.inicial)}</td><td class="pos">${fmtNum(f.entradas)}</td><td class="neg">${fmtNum(f.salidas)}</td><td class="neg">${fmtNum(f.instalaciones)}</td><td class="neg">${fmtNum(f.garantias)}</td><td class="neg">${fmtNum(f.mermas)}</td><td>${f.ajustes>0?'+':''}${fmtNum(f.ajustes)}</td><td><strong>${fmtNum(f.final)}</strong></td></tr>`;
    }).join('')}
    </table></div>
    ${conMovimiento.length===0? '<p class="hint">Aún no hay movimientos registrados en este módulo.</p>':''}
  </div>`;

  html += `<div class="card"><h3>🛡️ Material entregado en garantía (acumulado)</h3>
    <div class="wrap-x"><table><tr><th>Artículo</th><th>Total en garantías</th></tr>
    ${CATALOGO.filter(it=>calcFormula(it.id).garantias>0).map(it=>`<tr><td>${it.nombre}</td><td>${fmtNum(calcFormula(it.id).garantias)} ${it.unidad}</td></tr>`).join('') || '<tr><td colspan="2" class="hint">Sin garantías todavía.</td></tr>'}
    </table></div>
  </div>`;

  html += `<div class="card"><h3>Consumo por instalaciones (acumulado)</h3>
    <div class="wrap-x"><table><tr><th>Artículo</th><th>Total consumido</th></tr>
    ${CATALOGO.filter(it=>calcFormula(it.id).instalaciones>0).map(it=>{ const f=calcFormula(it.id);
      return `<tr><td>${it.nombre}</td><td>${fmtNum(f.instalaciones)} ${it.unidad}</td></tr>`;
    }).join('') || '<tr><td colspan="2" class="hint">Sin consumo por instalaciones todavía.</td></tr>'}
    </table></div>
  </div>`;

  // Correderas del inventario actual: juegos completos y medias sin pareja
  const corrHoyRep = correderasHoy();
  html += `<div class="card"><h3>🔩 Correderas (juegos y sin pareja)</h3>
    ${corrHoyRep.length ? `<p class="hint">Inventario de hoy. Si hay hembras y machos sueltos del mismo tipo, júntalos en Inventario → Herrajes → "Armar juegos".</p>
    <div class="wrap-x"><table><tr><th>Tipo</th><th>Juegos completos</th><th>Hembras sin macho</th><th>Machos sin hembra</th></tr>
    ${corrHoyRep.map(b=>`<tr><td>${b.etiqueta}</td><td><strong>${fmtNum(b.juegos)}</strong></td><td class="${b.hembras?'neg':''}">${fmtNum(b.hembras)}</td><td class="${b.machos?'neg':''}">${fmtNum(b.machos)}</td></tr>`).join('')}
    </table></div>` : '<p class="hint">No hay correderas en el inventario.</p>'}
  </div>`;

  html += `<div class="card"><h3>Última auditoría vs. teórico</h3>`;
  if(!ultimaAud){
    html += `<p class="hint">Aún no hay auditorías guardadas en ${modulo()}. Ve a "Auditoría física" para levantar la primera.</p>`;
  } else {
    html += `<p class="hint">${new Date(ultimaAud.fecha).toLocaleString()} · ${ultimaAud.tipo} · Auditor: ${ultimaAud.auditor} · <strong class="${ultimaAud.totalDiff?'neg':'pos'}">${ultimaAud.totalDiff} discrepancia(s)</strong></p>
    <div class="wrap-x"><table><tr><th>Artículo</th><th>Teórico</th><th>Físico</th><th>Dif.</th></tr>
    ${ultimaAud.resultados.map(r=>`<tr><td>${r.nombre}</td><td>${fmtNum(r.teorico)}</td><td>${fmtNum(r.fisico)}</td><td class="${r.diff?'neg':'pos'}">${r.diff>0?'+':''}${fmtNum(r.diff)}</td></tr>${detalleLadosHtml(r)}`).join('')}
    </table></div>`;
  }
  html += `</div>`;

  $('#main').innerHTML = html;
}

// ===== Aprobaciones (solo admin) =====
// Lo que captura un coordinador (entradas/salidas e instalaciones — los traspasos NO, esos
// son siempre inmediatos) queda "pendiente" y no afecta el inventario oficial hasta que
// Dirección lo aprueba o rechaza aquí. Se revisa de TODOS los módulos a la vez.
// Colores en Aprobaciones (confirmado por el usuario): cada tipo de captura con su propio color
// para distinguirlas de un vistazo.
const APROB_CLASES = {
  inst:   {ic:'🛠️', t:'Instalación',          c:'#2f6fde'},
  cambio: {ic:'🔄', t:'Cambio de modelo',     c:'#5a4fcf'},
  entrada:{ic:'📥', t:'Entrada de material',  c:'#1f9d55'},
  salida: {ic:'📤', t:'Salida de material',   c:'#d64545'},
  merma:  {ic:'🗑️', t:'Merma',                c:'#e0791a'},
  sob:    {ic:'🧩', t:'Sobrantes',            c:'#0e8a8a'},
  regreso:{ic:'↩️', t:'Regreso de instalación',c:'#8e44ad'},
  gar:    {ic:'🛡️', t:'Garantía',             c:'#c2417a'},
  corte:  {ic:'✂️', t:'Corte',                c:'#5b6b7f'},
  ajuste: {ic:'🔧', t:'Ajuste / piezas',      c:'#a0742a'},
  otro:   {ic:'📋', t:'Otro',                 c:'#7a8594'}
};
function claseAprobLote(items, garLogs){
  const has = f=>items.some(f), mot = x=>has(m=>m.motivo===x), tip = x=>has(m=>m.tipo===x);
  const k = (()=>{
    if(tip('garantia') || (garLogs||[]).some(g=>g.id===(items[0].loteId||items[0].id) || (g.retorno&&g.retorno.loteId===(items[0].loteId||items[0].id))) || mot('sobranteGarantia')) return 'gar';
    if(mot('regresoInstalacion') || mot('regresoPiezasInst')) return 'regreso';
    if(tip('merma')) return 'merma';
    if(tip('sobrante') || mot('deSobrante') || mot('regresoSobrante')) return 'sob';
    if(mot('piezasEncontradas') || tip('ajuste') || mot('deudaAparecio')) return 'ajuste';
    if(tip('corte')) return 'corte';
    if(tip('entrada') || has(m=>m.pedidoId)) return 'entrada';
    if(tip('salida')) return 'salida';
    if(tip('devolucion')) return 'regreso';
    return 'otro';
  })();
  return Object.assign({k}, APROB_CLASES[k]);
}
function aprobCardStyle(cl){ return `border-left:7px solid ${cl.c};background:linear-gradient(90deg, ${cl.c}1f, ${cl.c}06 55%), var(--card, #fff)`; }
function aprobChip(cl, extra){ return `<span style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;background:${cl.c};color:#fff;font-weight:800;font-size:13px">${cl.ic} ${cl.t}${extra?' · '+extra:''}</span>`; }
function aprobLeyendaHtml(clases){
  const ks = [...new Set(clases)]; if(ks.length<2) return '';
  return `<div class="card" style="padding:10px 12px"><div class="hint" style="margin:0 0 6px">Colores:</div><div style="display:flex;flex-wrap:wrap;gap:6px">${ks.map(k=>aprobChip(APROB_CLASES[k])).join('')}</div></div>`;
}
async function renderAprobaciones(){
  if(!esAdmin()){ $('#main').innerHTML = '<div class="card">Esta sección es solo para Dirección.</div>'; return; }
  $('#main').innerHTML = '<div class="card">Cargando pendientes…</div>';
  let todosMovs=[], todosLogs=[], garLogs=[], sobLogs=[];
  try{
    const [snapMov, snapLog, snapGar, snapSob] = await Promise.all([db.collection('movimientos').get(), db.collection('instalacionesLog').get(), db.collection('garantiasLog').get(), db.collection('sobrantes').get()]);
    sobLogs = snapSob.docs.map(d=>({id:d.id,...d.data()}));
    todosMovs = snapMov.docs.map(d=>({id:d.id,...d.data()}));
    todosLogs = snapLog.docs.map(d=>({id:d.id,...d.data()}));
    garLogs = snapGar.docs.map(d=>({id:d.id,...d.data()}));
  }catch(e){ $('#main').innerHTML = `<div class="card">No se pudo cargar: ${e.message}</div>`; return; }

  const logsPendientes = todosLogs.filter(l=>l.estado==='pendiente').sort((a,b)=>(b.fecha||'').localeCompare(a.fecha||''));
  // Movimientos pendientes que NO son de una instalación (esos ya se muestran agrupados arriba
  // por su instalacionesLog) — se agrupan por loteId (una sola captura de Entradas/Salidas).
  const movsSueltosPendientes = todosMovs.filter(m=>m.estado==='pendiente' && m.tipo!=='instalacion' && !m.cambioModelo);
  const lotes = {};
  movsSueltosPendientes.forEach(m=>{ const key=m.loteId||m.id; (lotes[key]=lotes[key]||[]).push(m); });
  const loteIds = Object.keys(lotes).sort((a,b)=>(lotes[b][0].fecha||'').localeCompare(lotes[a][0].fecha||''));

  const cortesHoy = cortesHoyHtml(todosMovs, null);
  if(logsPendientes.length===0 && loteIds.length===0){
    $('#main').innerHTML = '<div class="card">No hay nada pendiente de aprobación. 🎉</div>' + cortesHoy;
    return;
  }

  const totalPend = loteIds.length + logsPendientes.length;
  let html = `<div class="card"><strong>Aprobaciones</strong><p class="hint">Lo que capturan los coordinadores queda aquí hasta que lo apruebes o rechaces. Los traspasos entre módulos no requieren aprobación (se aplican de inmediato).</p>
    ${totalPend>1?`<button class="btn" style="width:100%;margin-top:6px;background:linear-gradient(135deg,#1f9d55,#178045)" onclick="aprobarTodo()">✅ Aprobar todo (${totalPend})</button><p class="hint" style="margin:6px 0 0">Revisa la lista de abajo antes de aprobar todo junto.</p>`:''}</div>`;

  html += cortesHoy;
  const clasesLote = {}; loteIds.forEach(k=>{ clasesLote[k] = claseAprobLote(lotes[k], garLogs); });
  html += aprobLeyendaHtml([...loteIds.map(k=>clasesLote[k].k), ...logsPendientes.map(l=>l.cambio?'cambio':'inst')]);
  if(loteIds.length>0){
    html += `<div class="card"><h3>Entradas, salidas y garantías pendientes (${loteIds.length})</h3></div>`;
    html += loteIds.map(key=>{
      const items = lotes[key];
      const m0 = items[0];
      const cl = clasesLote[key];
      return `<div class="card" style="${aprobCardStyle(cl)}">
        <div style="margin-bottom:6px">${aprobChip(cl)}</div>
        <div class="row" style="justify-content:space-between">
          <div><strong>${m0.modulo}</strong><div class="tag">${new Date(m0.fecha).toLocaleString()}</div>${m0.creadoPor?`<div class="tag">${m0.creadoPor}</div>`:''}</div>
        </div>
        ${detalleGarantiaAprob(key, garLogs)}${detalleSobranteAprob(key, sobLogs)}${detalleRegresoInstAprob(items, todosLogs)}${(()=>{ const m=items.find(x=>x.motivo==='piezasEncontradas' && x.piezasDetalle); return m?`<div style="margin-top:8px;padding:10px 12px;border-radius:12px;background:rgba(14,138,138,.10);border:1px solid rgba(14,138,138,.35)"><strong>✂️ Piezas cortadas encontradas</strong><div class="hint" style="margin:4px 0 0">${m.piezasDetalle.join('<br>')}</div><div class="hint" style="margin:2px 0 0">Se suman al material cortado.</div></div>`:''; })()}${(()=>{ const m=items.find(x=>x.motivo==='mermaPiezas' && x.piezasDetalle); return m?`<div style="margin-top:8px;padding:10px 12px;border-radius:12px;background:rgba(224,121,26,.10);border:1px solid rgba(224,121,26,.4)"><strong>⚠️ Piezas dañadas (merma)</strong><div class="hint" style="margin:4px 0 0">${m.piezasDetalle.join('<br>')}</div><div class="hint" style="margin:2px 0 0">Salen del material cortado.</div></div>`:''; })()}
        <div class="wrap-x" style="margin-top:6px"><table><tr><th>Artículo</th><th>Tipo</th><th>Cant.</th><th>Nota</th></tr>
        ${items.map(m=>`<tr><td>${m.itemNombre}</td><td class="${m.tipo==='entrada'||m.tipo==='devolucion'||(m.tipo==='ajuste'&&m.cantidad>0)?'pos':(m.tipo==='corte'?'':'neg')}">${etiquetaTipoMov(m)}</td><td>${m.tipo==='ajuste'&&m.cantidad>0?'+':''}${fmtNum(m.cantidad)}</td><td>${m.nota||''}</td></tr>`).join('')}
        </table></div>
        ${items.find(m=>m.fotos)?(()=>{ const f=items.find(m=>m.fotos); return `<button class="btn small" style="background:transparent;color:var(--brand);border:1px solid var(--line);box-shadow:none;margin-top:6px" onclick="verFotos('${f.fotosRef}',${f.fotos},'Evidencia')">📷 Ver fotos (${f.fotos})</button>`; })():''}
        <div class="row" style="justify-content:flex-end;margin-top:8px">
          <button class="btn small" style="background:transparent;color:var(--bad);border:1px solid var(--line)" onclick="rechazarLote('${key}')">Rechazar</button>
          <button class="btn small" onclick="aprobarLote('${key}')">Aprobar</button>
        </div>
      </div>`;
    }).join('');
  }

  if(logsPendientes.length>0){
    html += `<div class="card"><h3>Instalaciones pendientes (${logsPendientes.length})</h3></div>`;
    html += logsPendientes.map(l=>{ const cl = APROB_CLASES[l.cambio?'cambio':'inst']; return `<div class="card" style="${aprobCardStyle(cl)}">
        <div style="margin-bottom:6px">${aprobChip(cl, l.categoria)}</div>
        <div class="row" style="justify-content:space-between">
          <div><strong>${l.modulo}</strong><div class="tag">${l.fechaDia}</div>${l.creadoPor?`<div class="tag">${l.creadoPor}</div>`:''}</div>
        </div>
        <p class="hint" style="margin:6px 0">${l.descripcion}${l.nota?(' · '+l.nota):''}</p>${extrasLogHtml(l)}
        ${l.cambio ? detalleCambioAprob(l) : `<div class="wrap-x"><table><tr><th>Artículo</th><th>Cant.</th></tr>
        ${(l.consumo||[]).map(c=>`<tr><td>${CATALOGO.find(i=>i.id===c.itemId)?.nombre||c.itemId}</td><td>${fmtNum(c.cantidad)}</td></tr>`).join('')}
        </table></div>`}
        <div class="row" style="justify-content:flex-end;margin-top:8px">
          <button class="btn small" style="background:transparent;color:var(--bad);border:1px solid var(--line)" onclick="rechazarInstalacion('${l.id}')">Rechazar</button>
          <button class="btn small" onclick="aprobarInstalacion('${l.id}')">Aprobar</button>
        </div>
      </div>`; }).join('');
  }

  $('#main').innerHTML = html;
}

// En Aprobaciones: de qué fue la garantía (o qué regresó el cliente), no solo el material.
function detalleGarantiaAprob(loteId, garLogs){
  const g = garLogs.find(x=>x.id===loteId);
  const caja = (titulo, cuerpo) => `<div style="margin-top:8px;padding:10px 12px;border-radius:12px;background:rgba(224,121,26,.10);border:1px solid rgba(224,121,26,.35)"><strong>${titulo}</strong>${cuerpo}</div>`;
  if(g){
    return caja('🛡️ Garantía'+(g.fechaDia?' · '+fechaGarTxt(g):''),
      `${g.cliente?`<div class="hint" style="margin:4px 0 0"><strong>Cliente:</strong> ${g.cliente}</div>`:''}
       ${g.motivo?`<div class="hint" style="margin:2px 0 0"><strong>Motivo:</strong> ${g.motivo}</div>`:''}
       <div class="hint" style="margin:6px 0 0"><strong>Se entregó:</strong></div>
       <ul style="margin:2px 0 0 18px;padding:0;line-height:1.5">${(g.lineas||[]).map(x=>`<li>${x}</li>`).join('') || '<li>—</li>'}</ul>
       ${g.fotos?`<button class="btn small" style="background:transparent;color:var(--brand);border:1px solid var(--line);box-shadow:none;margin-top:6px" onclick="verFotos('${g.id}',${g.fotos},'Garantía')">📷 Ver fotos (${g.fotos})</button>`:''}`);
  }
  const r = garLogs.find(x=>x.retorno && x.retorno.loteId===loteId);
  if(r){ const t=r.retorno;
    return caja('↩️ Regreso de garantía'+(r.cliente?' · '+r.cliente:''),
      `<div class="hint" style="margin:4px 0 0">De la garantía del ${fechaGarTxt(r)}${r.motivo?' ('+r.motivo+')':''}</div>
       ${(t.sirve||[]).length?`<div class="hint" style="margin:6px 0 0"><strong>✅ Sirvió (regresa al inventario):</strong><br>${t.sirve.join('<br>')}</div>`:''}
       ${(t.merma||[]).length?`<div class="hint" style="margin:6px 0 0"><strong>🗑️ Merma:</strong><br>${t.merma.join('<br>')}</div>`:''}`);
  }
  return '';
}
function detalleSobranteAprob(loteId, sobLogs){
  const caja = (titulo, cuerpo) => `<div style="margin-top:8px;padding:10px 12px;border-radius:12px;background:rgba(14,138,138,.10);border:1px solid rgba(14,138,138,.35)"><strong>${titulo}</strong>${cuerpo}</div>`;
  const s = sobLogs.find(x=>x.id===loteId);
  if(s && s.directoMerma) return caja('🗑️ Merma: regresó sin instalar y no sirve', `${s.nota?`<div class="hint" style="margin:4px 0 0">${s.nota}</div>`:''}<ul style="margin:4px 0 0 18px;padding:0;line-height:1.5">${(s.lineas||[]).map(l=>`<li>${l}</li>`).join('')}</ul>`);
  if(s) return caja('🧩 Material a sobrantes', `${s.nota?`<div class="hint" style="margin:4px 0 0">${s.nota}</div>`:''}<ul style="margin:4px 0 0 18px;padding:0;line-height:1.5">${(s.lineas||[]).map(l=>`<li>${l}</li>`).join('')}</ul><div class="hint" style="margin:4px 0 0">No se instaló y regresó al taller. Sale del inventario hasta que se transforme.</div>`);
  const t = sobLogs.find(x=>(x.transformaciones||[]).some(tr=>tr.loteId===loteId));
  if(t){ const tr = t.transformaciones.find(z=>z.loteId===loteId);
    return caja('✂️ Sobrante transformado', `<div class="hint" style="margin:4px 0 0">Del sobrante: ${(t.lineas||[]).join(', ')}${t.nota?' — '+t.nota:''}</div><div class="hint" style="margin:4px 0 0"><strong>Salió:</strong> ${tr.piezas.join(', ')}</div>`); }
  return '';
}
async function cambiarEstadoLote(loteId, nuevoEstado){
  const snap = await db.collection('movimientos').get();
  const docs = snap.docs.filter(d=>{ const m=d.data(); return ((m.loteId||d.id)===loteId || (m.loteId===loteId+'s' && m.motivo==='sobranteCortePuertas')) && m.estado==='pendiente'; });
  const revisadoEn = new Date().toISOString(), revisadoPor = getCurrentUserEmail?getCurrentUserEmail():'';
  for(const d of docs){ await db.collection('movimientos').doc(d.id).update({estado:nuevoEstado, revisadoEn, revisadoPor}); }
}
async function aprobarLote(loteId){
  try{ await cambiarEstadoLote(loteId,'aprobado'); renderAprobaciones(); }
  catch(e){ alert('Error: '+e.message); }
}
async function rechazarLote(loteId){
  if(!confirm('¿Rechazar este lote? El material NO se descontará/agregará al inventario.')) return;
  try{ await cambiarEstadoLote(loteId,'rechazado'); renderAprobaciones(); }
  catch(e){ alert('Error: '+e.message); }
}
async function aprobarTodo(){
  try{
    const [snapMov, snapLog] = await Promise.all([db.collection('movimientos').get(), db.collection('instalacionesLog').get()]);
    const logs = snapLog.docs.map(d=>({id:d.id,...d.data()})).filter(l=>l.estado==='pendiente');
    const lotes = [...new Set(snapMov.docs.map(d=>({id:d.id,...d.data()})).filter(m=>m.estado==='pendiente' && m.tipo!=='instalacion' && !m.cambioModelo).map(m=>m.loteId||m.id))];
    const porMod = {}; logs.forEach(l=>porMod[l.modulo]=(porMod[l.modulo]||0)+1);
    snapMov.docs.map(d=>d.data()).filter(m=>m.estado==='pendiente' && m.tipo!=='instalacion').forEach(m=>{ porMod[m.modulo]=porMod[m.modulo]||0; });
    if(!confirm(`¿Aprobar TODO lo pendiente?\n\n• ${lotes.length} captura(s) de entradas, salidas, garantías, pedidos…\n• ${logs.length} instalación(es)\n\nMódulos: ${Object.keys(porMod).join(', ')}\n\nTodo se sumará o descontará del inventario.`)) return;
    for(const l of logs){ await db.collection('instalacionesLog').doc(l.id).update({estado:'aprobado'}); await cambiarEstadoLote(l.id,'aprobado'); if(l.cambioDe) await db.collection('instalacionesLog').doc(l.cambioDe).update({cambiadaPor:l.id}); }
    for(const k of lotes) await cambiarEstadoLote(k,'aprobado');
    toast(`✅ Se aprobaron ${lotes.length+logs.length} captura(s).`);
    renderAprobaciones();
  }catch(e){ alert('Error: '+e.message); }
}
async function aprobarInstalacion(logId){
  try{
    await db.collection('instalacionesLog').doc(logId).update({estado:'aprobado'});
    await cambiarEstadoLote(logId,'aprobado');
    try{ const d = await db.collection('instalacionesLog').doc(logId).get(); const l = d && d.data && d.data(); if(l && l.cambioDe) await db.collection('instalacionesLog').doc(l.cambioDe).update({cambiadaPor:logId}); }catch(e){}
    renderAprobaciones();
  }catch(e){ alert('Error: '+e.message); }
}
async function rechazarInstalacion(logId){
  if(!confirm('¿Rechazar esta instalación? El material NO se descontará del inventario.')) return;
  try{
    await db.collection('instalacionesLog').doc(logId).update({estado:'rechazado'});
    await cambiarEstadoLote(logId,'rechazado');
    renderAprobaciones();
  }catch(e){ alert('Error: '+e.message); }
}

// ===== Cierre del turno (confirmado por el usuario) =====
// Lo que NO se descuenta solo con las instalaciones y garantías se captura al final del día:
//  1) el corte de hojas (cuántas se cortaron), y
//  2) los consumibles (cintilla, PVC, pegamento, stickers y los herrajes que no lleva el
//     despiece: pijas, taquetes, clavos, escuadras, tarugos, etc.). Aquí el coordinador escribe
//     CUÁNTO TIENE (lo que cuenta físicamente) y la app descuenta la diferencia como salida.
// Tubos, bridas, correderas, jaladeras, bisagras, push, espejos, rieles, sistemas y bastidores
// se descuentan en automático, por eso no aparecen aquí.
const CATS_CONSUMIBLES = ['Cintilla','PVC','Pegamento','Stickers'];
const HERRAJES_AUTOMATICOS = ['Bastidores','Bisagras','Espejos closet','Jaladeras','Jaladera plana','Juego de corredera','Correderas de extensión',
  'Corredera hembra (sin pareja)','Corredera macho (sin pareja)','Corredera ext. hembra (sin pareja)','Corredera ext. macho (sin pareja)',
  'Rieles','Sistemas','Tubos 1.5 m','Juegos de bridas','Push'];
function esConsumibleCierre(it){ return CATS_CONSUMIBLES.includes(it.cat) || (it.cat==='Herrajes' && !HERRAJES_AUTOMATICOS.includes(it.nombre)); }
const CIERRE_CATS = ['Cintilla','PVC','Pegamento','Stickers','Herrajes'];
const HORA_RECORDATORIO_CIERRE = 16; // el turno termina 4:30 pm: desde las 4 pm se recuerda el cierre (confirmado por el usuario)
// Se trabaja de lunes a sábado; el domingo no se recuerda.
function esHoraDeCierre(){ const d=new Date(); return d.getDay()!==0 && d.getHours()>=HORA_RECORDATORIO_CIERRE; }
let cierreVals = {}, cierreBuscar = '', cierreCat = 'Cintilla';
function cierreHechoHoy(){
  const hoy = fechaHoyLocal();
  const local = iso => new Date(new Date(iso).getTime()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
  return movs.some(m=>m.cierreTurno && local(m.fecha)===hoy);
}
function recordatorioCierreHtml(){
  if(esSoloLectura() || cierreHechoHoy() || !esHoraDeCierre()) return '';
  return `<div class="card aviso" style="padding:12px"><div class="pend"><div>📝 <strong>¿Ya capturaste tus salidas de hoy?</strong><br><span class="hint" style="margin:0">Corte de hojas y cuánto te queda de cintilla, PVC, pegamento, stickers, pijas y demás.</span></div><button class="btn small" onclick="irA('cierre')">Capturar</button></div></div>`;
}
// Lo que la app espera que haya, contando también lo que todavía espera aprobación (para no
// descontar dos veces si ayer se hizo un cierre que Dirección no ha aprobado).
function stockEsperadoCierre(itemId){
  let q = calcFormula(itemId).final;
  movs.filter(m=>m.itemId===itemId && m.estado==='pendiente').forEach(m=>{
    const c = Number(m.cantidad)||0;
    if(m.tipo==='entrada'||m.tipo==='devolucion') q += c;
    else if(m.tipo==='salida'||m.tipo==='merma'||m.tipo==='garantia'||m.tipo==='instalacion') q -= c;
    else if(m.tipo==='ajuste') q += c;
  });
  return fmtNum(q);
}
// Fórmula como si lo pendiente ya estuviera aprobado (para el conteo de completas del cierre).
function calcFormulaConPendientes(itemId){
  const resetFecha = resetMap[modulo()];
  const doc = inicialMap[itemId]!==undefined ? {cantidad:inicialMap[itemId], cortado:inicialCortadoMap[itemId], fecha:inicialFechaMap[itemId]} : null;
  const b = lineaBase(resetFecha, doc);
  const lista = movs.filter(m=>m.itemId===itemId && (!b.desde || m.fecha>b.desde) && m.estado!=='rechazado');
  return calcularFormula(itemId, b.inicial, b.inicialCortado, lista);
}
// Cierre por conteo de completas (confirmado por el usuario): el coordinador escribe cuántas
// hojas COMPLETAS tiene; la app calcula el corte. Si tiene MÁS de las esperadas no se toca el
// inventario solo: se manda a Dirección como ajuste por aprobar.
function corteDesdeConteo(itemId, contadas){
  const sim = calcFormulaConPendientes(itemId);
  const esp = fmtNum(sim.completas), deuda = fmtNum(sim.autoCortes||0), c = Number(contadas);
  const corte = fmtNum(deuda + Math.max(0, esp - c));
  const deMas = fmtNum(Math.max(0, c - esp));
  return {esp, deuda, contadas:c, corte, deMas};
}
let cierreTodasHojas = false;
function filaConteoHoja(it){
  const v = cierreVals[it.id]; const r = corteDesdeConteo(it.id, vacioCierre(v)?0:v);
  let res = '';
  if(!vacioCierre(v)){
    if(r.deMas>0) res = `<span style="color:#b3742c"> → ⚠️ hay ${fmtNum(r.deMas)} de más (se avisa a Dirección)</span>${r.corte>0?`<span class="neg"> · corte ${fmtNum(r.corte)}</span>`:''}`;
    else if(r.corte>0) res = `<span class="neg"> → se cortaron ${fmtNum(r.corte)}</span>`;
    else res = '<span class="pos"> → sin corte</span>';
  }
  return `<label class="movitem"><span style="min-width:0"><span class="invname">${swatchHtml(it.nombre)}${it.nombre}</span><span class="hint" style="display:block;margin:2px 0 0" id="chdif-${it.id}">La app espera: ${fmtNum(r.esp)} completas${res}</span></span>
    <input type="number" min="0" step="1" inputmode="numeric" placeholder="Hay" value="${vacioCierre(v)?'':v}" oninput="cierreVals['${it.id}']=this.value;refrescarHojaCierre('${it.id}')"></label>`;
}
function refrescarHojaCierre(id){
  const it = CATALOGO.find(i=>i.id===id); const el = document.getElementById('chdif-'+id); if(!it||!el) return;
  const tmp = document.createElement('div'); tmp.innerHTML = filaConteoHoja(it);
  const n = tmp.querySelector('#chdif-'+id); if(n) el.innerHTML = n.innerHTML;
}
function vacioCierre(v){ return v===undefined || v===null || String(v).trim()===''; }
function filaCierreConteo(it){
  const esp = stockEsperadoCierre(it.id); const v = cierreVals[it.id];
  let dif = '';
  if(!vacioCierre(v)){ const d = fmtNum(esp - Number(v)); dif = d>0 ? `<span class="neg"> → se usó ${fmtNum(d)}</span>` : (d<0 ? `<span style="color:#b3742c"> → tienes ${fmtNum(-d)} de más</span>` : '<span class="pos"> → sin cambio</span>'); }
  return `<label class="movitem"><span style="min-width:0"><span class="invname">${it.nombre}</span><span class="hint" style="display:block;margin:2px 0 0" id="cdif-${it.id}">La app dice: ${fmtNum(esp)} ${it.unidad}${dif}</span></span>
    <input type="number" min="0" inputmode="decimal" placeholder="Hay" value="${vacioCierre(v)?'':v}" oninput="cierreVals['${it.id}']=this.value;refrescarDifCierre('${it.id}')"></label>`;
}
function refrescarDifCierre(id){
  const it = CATALOGO.find(i=>i.id===id); const el = document.getElementById('cdif-'+id); if(!it||!el) return;
  const tmp = document.createElement('div'); tmp.innerHTML = filaCierreConteo(it);
  const nuevo = tmp.querySelector('#cdif-'+id); if(nuevo) el.innerHTML = nuevo.innerHTML;
  const c = document.getElementById('cierre-cuenta'); if(c) c.textContent = cuentaCierreTxt();
}
function cuentaCierreTxt(){ const n = CATALOGO.filter(i=>esConsumibleCierre(i) && !vacioCierre(cierreVals[i.id])).length; return n ? `Llevas ${n} artículo(s) contados.` : ''; }
function renderCierre(){
  if(esSoloLectura()){ $('#main').innerHTML='<div class="card">Tu cuenta es de solo lectura.</div>'; return; }
  const hojas = CATALOGO.filter(i=>esHoja(i));
  const cp = cortesPendientes();
  const conMaterial = hojas.filter(it=>{ const f=calcFormulaConPendientes(it.id); return f.completas>0.0005 || (f.autoCortes||0)>0 || !vacioCierre(cierreVals[it.id]); });
  const visibles = cierreTodasHojas ? hojas : conMaterial;
  $('#main').innerHTML = `<div class="card">
      <div style="font-size:17px;font-weight:800">📝 Cierre del turno · ${modulo()}</div>
      <p class="hint">Tubos, bridas, correderas, jaladeras, bisagras, espejos, rieles, sistemas y bastidores <strong>ya se descontaron solos</strong> con las instalaciones y garantías. Aquí solo va lo demás.</p>
      ${cierreHechoHoy()?'<p class="hint" style="color:var(--ok)">✅ Ya capturaste un cierre hoy. Puedes agregar más si faltó algo.</p>':''}
    </div>
    <div class="card">
      <div class="paso">1</div><strong>✂️ ¿Cuántas hojas completas te quedan?</strong>
      <p class="hint">Cuenta las hojas <strong>completas</strong> (sin cortar) de cada color y escríbelo. La app calcula sola cuántas se cortaron. El total del inventario no cambia: solo pasan de completas a cortadas.${cp.length?` <br>Pendiente de anotar: ${cp.map(x=>fmtNum(x.f.autoCortes)+' '+x.it.nombre.replace('Melamina ','')).join(', ')}.`:''}</p>
      <div class="movlist" style="margin-top:8px">${visibles.map(filaConteoHoja).join('') || '<p class="hint">No hay hojas completas registradas.</p>'}</div>
      ${hojas.length>conMaterial.length?`<button class="btn small" style="margin-top:8px;background:transparent;color:var(--brand);border:1px solid var(--line);box-shadow:none" onclick="cierreTodasHojas=!cierreTodasHojas;renderCierre()">${cierreTodasHojas?'Ver solo los que tienen material':'Ver todos los colores ('+hojas.length+')'}</button>`:''}
    </div>
    <div class="card">
      <div class="paso">2</div><strong>📦 ¿Cuánto te queda?</strong>
      <p class="hint">Cuenta lo que tienes <strong>ahora</strong> y escríbelo. La app calcula cuánto se usó y lo descuenta. Deja vacío lo que no contaste.</p>
      <div class="chips" style="margin-top:8px">${CIERRE_CATS.map(c=>{ const n=CATALOGO.filter(i=>i.cat===c && esConsumibleCierre(i) && !vacioCierre(cierreVals[i.id])).length; return `<button class="chip ${c===cierreCat&&!cierreBuscar?'on':''}" onclick="cierreCat='${c}';cierreBuscar='';renderCierre()">${ICONO_CAT[c]||''} ${c==='Herrajes'?'Pijas y demás':c}${n?' ✓'+n:''}</button>`; }).join('')}</div>
      <input type="search" placeholder="🔍 Buscar (ej. pijas, cintilla blanco)" value="${String(cierreBuscar).replace(/"/g,'&quot;')}" style="margin-top:8px" oninput="cierreBuscar=this.value;renderCierreConsumibles()">
      <div class="movlist" id="cierre-cons" style="margin-top:8px"></div>
      <p class="hint" id="cierre-cuenta" style="margin-top:6px">${cuentaCierreTxt()}</p>
    </div>
    <div class="card">
      <input id="cierre-nota" placeholder="Nota (opcional)">
      <button class="btn" style="margin-top:12px;width:100%;min-height:54px;font-size:16px" onclick="guardarCierre()">✅ Guardar cierre del turno</button>
    </div>`;
  renderCierreConsumibles();
}
function renderCierreConsumibles(){
  const el = document.getElementById('cierre-cons'); if(!el) return;
  const q = cierreBuscar.trim();
  const cons = CATALOGO.filter(i=>esConsumibleCierre(i) && (q ? coincide(i.nombre, q) : i.cat===cierreCat));
  el.innerHTML = cons.map(filaCierreConteo).join('') || '<p class="hint">No se encontró.</p>';
}
async function guardarCierre(){
  const nota = (document.getElementById('cierre-nota').value||'').trim();
  const hojasContadas = CATALOGO.filter(i=>esHoja(i) && !vacioCierre(cierreVals[i.id]));
  for(const it of hojasContadas){ const v=Number(cierreVals[it.id]); if(!(v>=0)) return alert(`Revisa lo que escribiste en ${it.nombre}.`); }
  const conteoHojas = hojasContadas.map(it=>Object.assign({it}, corteDesdeConteo(it.id, cierreVals[it.id])));
  const cortes = conteoHojas.filter(x=>x.corte>0).map(x=>({it:x.it, q:x.corte, esp:x.esp, contadas:x.contadas}));
  const hojasDeMas = conteoHojas.filter(x=>x.deMas>0);
  const contados = CATALOGO.filter(i=>esConsumibleCierre(i) && !vacioCierre(cierreVals[i.id]));
  for(const it of contados){ const v=Number(cierreVals[it.id]); if(!(v>=0)) return alert(`Revisa lo que escribiste en ${it.nombre}.`); }
  const salidas = [], deMas = [], iguales = [];
  contados.forEach(it=>{ const esp = stockEsperadoCierre(it.id), hay = Number(cierreVals[it.id]); const d = fmtNum(esp - hay);
    if(d>0) salidas.push({it, q:d, esp, hay}); else if(d<0) deMas.push({it, esp, hay}); else iguales.push(it); });
  if(!hojasContadas.length && !contados.length){
    if(!confirm('No escribiste nada.\n\n¿Hoy no se cortaron hojas y no quieres contar consumibles?\n\nAceptar = sí, guardar "sin movimiento" para que no te lo vuelva a recordar hoy.')) return;
  }
  if(hojasContadas.length || contados.length){
    const txt = `Cierre del turno:\n\n`
      + (cortes.length ? '✂️ Se cortaron (pasan de completas a cortado):\n'+cortes.map(c=>`• ${fmtNum(c.q)} ${c.it.nombre} (quedan ${fmtNum(c.contadas)} completas)`).join('\n')+'\n\n' : '')
      + (hojasDeMas.length ? '⚠️ Hay MÁS hojas completas de las que dice la app (se avisa a Dirección para que lo revise):\n'+hojasDeMas.map(x=>`• ${x.it.nombre}: app ${fmtNum(x.esp)}, tú ${fmtNum(x.contadas)}`).join('\n')+'\n\n' : '')
      + (salidas.length ? '📤 Se usó (se descuenta):\n'+salidas.map(x=>`• ${fmtNum(x.q)} ${x.it.unidad} ${x.it.nombre} (había ${fmtNum(x.esp)}, quedan ${fmtNum(x.hay)})`).join('\n')+'\n\n' : '')
      + (iguales.length ? `✔️ Sin cambio: ${iguales.length} artículo(s)\n\n` : '')
      + (deMas.length ? '⚠️ Tienes MÁS de lo que dice la app (no se toca; si llegó material, anótalo en "Llegó material"):\n'+deMas.map(x=>`• ${x.it.nombre}: app ${fmtNum(x.esp)}, tú ${fmtNum(x.hay)}`).join('\n')+'\n\n' : '')
      + '¿Guardar?';
    if(!confirm(txt)) return;
  }
  try{
    const creadoPor = getCurrentUserEmail?getCurrentUserEmail():'', fecha = new Date().toISOString(), mod = modulo();
    const loteC = cryptoId(), loteS = cryptoId();
    for(const c of cortes) await db.collection('movimientos').doc(cryptoId()).set({modulo:mod, itemId:c.it.id, itemNombre:c.it.nombre, tipo:'corte', cantidad:c.q, nota:`Cierre del turno: quedan ${fmtNum(c.contadas)} completas`+(nota?' · '+nota:''), fecha, estado:'aprobado', loteId:loteC, creadoPor, cierreTurno:true, conteoCompletas:{esperado:c.esp, contado:c.contadas}});
    // Hojas completas de más: no se tocan solas; van a Dirección como ajuste por aprobar.
    const loteA = cryptoId();
    for(const x of hojasDeMas) await db.collection('movimientos').doc(cryptoId()).set({modulo:mod, itemId:x.it.id, itemNombre:x.it.nombre, tipo:'ajuste', motivo:'cierreCompletasDeMas', cantidad:x.deMas, completasDelta:x.deMas, cortadoDelta:0, nota:`Cierre del turno: la app esperaba ${fmtNum(x.esp)} completas y contaron ${fmtNum(x.contadas)}`+(nota?' · '+nota:''), fecha, estado:'pendiente', loteId:loteA, creadoPor, cierreTurno:true});
    const estado = 'aprobado'; // Cierre del turno entra directo, sin aprobación (confirmado por el usuario)
    for(const x of salidas) await db.collection('movimientos').doc(cryptoId()).set({modulo:mod, itemId:x.it.id, itemNombre:x.it.nombre, tipo:'salida', cantidad:x.q, nota:`Cierre del turno: había ${fmtNum(x.esp)}, quedan ${fmtNum(x.hay)}`+(nota?' · '+nota:''), fecha, estado, loteId:loteS, creadoPor, cierreTurno:true, conteoCierre:{esperado:x.esp, contado:x.hay}});
    if(!cortes.length && !salidas.length) await db.collection('movimientos').doc(cryptoId()).set({modulo:mod, itemId:'_cierre', itemNombre:'Cierre sin movimiento', tipo:'nota', cantidad:0, nota:'Cierre del turno sin movimiento'+(nota?' · '+nota:''), fecha, estado:'aprobado', loteId:cryptoId(), creadoPor, cierreTurno:true});
    // Aviso a Dirección: el módulo ya hizo su cierre del turno.
    try{ await db.collection('cierres').doc(cryptoId()).set({modulo:mod, fecha, dia:fechaHoyLocal(), creadoPor, nota,
      cortes:cortes.map(c=>({nombre:c.it.nombre, q:c.q})), hojasDeMas:hojasDeMas.map(x=>({nombre:x.it.nombre, q:x.deMas})),
      consumibles:salidas.length, consDeMas:deMas.map(x=>x.it.nombre), hojasContadas:hojasContadas.length}); }catch(e){}
    cierreVals = {}; cierreBuscar = '';
    toast('✅ Cierre del turno guardado.'+(hojasDeMas.length?'<br><small>Las hojas de más las revisa Dirección.</small>':''));
    setView('home');
  }catch(e){ alert('Error: '+e.message); }
}
let _cierreAvisado = null;
setInterval(async ()=>{
  try{
    if(!moduloActual) return;
    const bajos = itemsBajos(); if(!bajos.length) return;
    const clave = 'bajoAvisado_'+modulo()+'_'+fechaHoyLocal();
    if(localStorage.getItem(clave) || typeof Notification==='undefined' || Notification.permission!=='granted') return;
    localStorage.setItem(clave,'1');
    const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
    const opts = {body: bajos.slice(0,4).map(x=>`${x.it.nombre}: ${fmtNum(x.f.final)} (mín. ${fmtNum(x.min)})`).join('\n'), icon:'icon-192.png', tag:'stockbajo'};
    if(reg && reg.showNotification) await reg.showNotification('⚠️ Stock bajo en '+modulo(), opts); else new Notification('⚠️ Stock bajo en '+modulo(), opts);
  }catch(e){}
}, 10*60*1000);
setInterval(async ()=>{
  try{
    if(!moduloActual || esSoloLectura() || cierreHechoHoy() || !esHoraDeCierre()) return;
    const clave = 'cierreAvisado_'+modulo()+'_'+fechaHoyLocal();
    if(_cierreAvisado===clave || localStorage.getItem(clave)) return;
    _cierreAvisado = clave; localStorage.setItem(clave,'1');
    if(typeof Notification==='undefined' || Notification.permission!=='granted') return;
    const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
    const opts = {body:'Anota el corte de hojas y cuánto te queda de cintilla, PVC, pegamento, stickers, pijas y demás.', icon:'icon-192.png', tag:'cierre'};
    if(reg && reg.showNotification) await reg.showNotification('📝 ¿Ya capturaste tus salidas de hoy?', opts); else new Notification('📝 ¿Ya capturaste tus salidas de hoy?', opts);
  }catch(e){}
}, 5*60*1000);

// ===== Stock mínimo y aviso de stock bajo (confirmado por el usuario) =====
function itemsBajos(){
  return CATALOGO.filter(it=>Number(minimosMap[it.id])>0).map(it=>({it, min:Number(minimosMap[it.id]), f:calcFormula(it.id)})).filter(x=>x.f.final < x.min - 1e-9);
}
function stockBajoHtml(){
  const b = itemsBajos(); if(!b.length) return '';
  return `<div class="card" style="padding:12px;border:2px solid var(--bad)">
    <strong style="color:var(--bad)">⚠️ Stock bajo en ${modulo()} (${b.length})</strong>
    <div class="movlist" style="margin-top:8px">${b.slice(0,6).map(x=>`<div class="movitem"><span class="invname">${x.it.nombre}</span><span class="neg" style="white-space:nowrap"><strong>${fmtNum(x.f.final)}</strong> / mín. ${fmtNum(x.min)}</span></div>`).join('')}</div>
    ${b.length>6?`<p class="hint">… y ${b.length-6} más</p>`:''}
    ${esAdmin()?`<p class="hint" style="margin:6px 0 0">Antes de pedir, revisa <a href="#" onclick="irA('todos');return false;">si otro módulo tiene</a>.</p>`:''}
  </div>`;
}
let minCat = null, minVals = null, minSoloModulo = false;
function renderMin(){
  if(!esAdmin()){ $('#main').innerHTML='<div class="card">Solo Dirección fija el stock mínimo.</div>'; return; }
  if(!minVals) minVals = Object.assign({}, minimosMap);
  const cats = [...new Set(CATALOGO.map(i=>i.cat))]; if(!minCat) minCat = cats[cats.length-1];
  const items = CATALOGO.filter(i=>i.cat===minCat);
  $('#main').innerHTML = `<div class="card"><div style="font-size:17px;font-weight:800">⚠️ Stock mínimo</div>
      <p class="hint">Escribe cuánto es lo mínimo que debe haber de cada artículo. Si un módulo baja de ahí, le aparece un aviso a él y a ti. Deja vacío lo que no quieras vigilar.</p>
      <div class="chips" style="margin-top:8px">${cats.map(c=>{ const n=CATALOGO.filter(i=>i.cat===c && Number(minVals[i.id])>0).length; return `<button class="chip ${c===minCat?'on':''}" onclick="minCat='${c}';renderMin()">${ICONO_CAT[c]||''} ${c}${n?' ✓'+n:''}</button>`; }).join('')}</div></div>
    <div class="card"><div class="movlist">${items.map(it=>`<label class="movitem"><span style="min-width:0"><span class="invname">${it.nombre}</span><span class="hint" style="display:block;margin:2px 0 0">Hay ${fmtNum(calcFormula(it.id).final)} ${it.unidad} en ${modulo()}</span></span>
      <input type="number" min="0" inputmode="decimal" placeholder="—" value="${minVals[it.id]||''}" oninput="minVals['${it.id}']=Number(this.value)||0"></label>`).join('')}</div></div>
    <div class="card">
      <label class="row" style="gap:10px;font-size:14px;flex-wrap:nowrap"><input type="checkbox" style="width:22px;min-height:22px;flex:0 0 22px" ${minSoloModulo?'checked':''} onchange="minSoloModulo=this.checked"> Solo para ${modulo()} (si no, aplica a los 5 módulos)</label>
      <button class="btn" style="width:100%;margin-top:10px" onclick="guardarMinimos()">Guardar mínimos</button>
    </div>`;
}
async function guardarMinimos(){
  const valores = {}; Object.keys(minVals||{}).forEach(k=>{ if(Number(minVals[k])>0) valores[k]=Number(minVals[k]); });
  const mods = minSoloModulo ? [modulo()] : MODULOS.map(m=>m.nombre);
  try{ for(const m of mods) await db.collection('config').doc('minimos_'+m).set({modulo:m, valores, fecha:new Date().toISOString()}); toast('✅ Mínimos guardados para '+(mods.length>1?'los 5 módulos':mods[0])+'.'); minVals=null; setView('home'); }catch(e){ alert('Error: '+e.message); }
}

// ===== Los 5 módulos en una sola vista (Dirección / supervisores) =====
let todosCat = null, todosSoloConAlgo = true, todosCache = null;
async function inventarioTodos(){
  const [mv, ini, rs, cfg] = await Promise.all(['movimientos','inicial','resets','config'].map(c=>db.collection(c).get()));
  const resetF = {}; rs.docs.forEach(d=>{ resetF[d.id]=d.data().fecha; });
  const iniMap = {}; ini.docs.forEach(d=>{ iniMap[d.id]=d.data(); });
  const mins = {}; cfg.docs.forEach(d=>{ if(d.id.startsWith('minimos_')) mins[d.id.slice(8)] = d.data().valores||{}; });
  const porModItem = {};
  mv.docs.forEach(d=>{ const m=d.data(); if(m.estado==='pendiente'||m.estado==='rechazado') return; const k=m.modulo+'__'+m.itemId; (porModItem[k]=porModItem[k]||[]).push(m); });
  const res = {};
  MODULOS.forEach(({nombre})=>{ res[nombre] = {};
    CATALOGO.forEach(it=>{ const b = lineaBase(resetF[nombre], iniMap[inicialKey(nombre,it.id)]||null);
      const lista = (porModItem[nombre+'__'+it.id]||[]).filter(m=>!b.desde || m.fecha>b.desde);
      res[nombre][it.id] = calcularFormula(it.id, b.inicial, b.inicialCortado, lista); }); });
  return {res, mins};
}
async function renderTodos(){
  if(!esAdmin() && !esSoloLectura()){ $('#main').innerHTML='<div class="card">Esta vista es para Dirección.</div>'; return; }
  if(!todosCache){ $('#main').innerHTML='<div class="card hint">Calculando los 5 módulos…</div>'; try{ todosCache = await inventarioTodos(); }catch(e){ $('#main').innerHTML='<div class="card">No se pudo calcular: '+e.message+'</div>'; return; } }
  const {res, mins} = todosCache;
  const cats = [...new Set(CATALOGO.map(i=>i.cat))]; if(!todosCat) todosCat = cats[0];
  let items = CATALOGO.filter(i=>i.cat===todosCat);
  if(todosSoloConAlgo) items = items.filter(it=>MODULOS.some(m=>Math.abs(res[m.nombre][it.id].final)>0.005 || (mins[m.nombre]||{})[it.id]));
  const celda = (m,it) => { const f=res[m][it.id]; const min=Number((mins[m]||{})[it.id])||0; const bajo = min>0 && f.final<min-1e-9;
    return `<td style="text-align:right;${bajo?'color:var(--bad);font-weight:800':(Math.abs(f.final)<0.005?'color:var(--sub)':'')}">${fmtNum(f.final)}${bajo?' ⚠️':''}</td>`; };
  $('#main').innerHTML = `<div class="card">
      <div style="font-size:17px;font-weight:800">🗺️ Los 5 módulos</div>
      <p class="hint">Cuánto hay de cada artículo en cada módulo (solo lo aprobado). En rojo ⚠️: debajo del mínimo. Antes de comprar, revisa si otro módulo tiene de sobra y haz un traspaso.</p>
      <div class="chips" style="margin-top:8px">${cats.map(c=>`<button class="chip ${c===todosCat?'on':''}" onclick="todosCat='${c}';renderTodos()">${ICONO_CAT[c]||''} ${c}</button>`).join('')}</div>
      <label class="row" style="gap:8px;margin-top:8px;font-size:14px;flex-wrap:nowrap"><input type="checkbox" style="width:20px;min-height:20px;flex:0 0 20px" ${todosSoloConAlgo?'checked':''} onchange="todosSoloConAlgo=this.checked;renderTodos()"> Ocultar lo que está en cero en todos</label>
      <div class="row" style="gap:8px;margin-top:10px;flex-wrap:wrap">
        <button class="btn small" onclick="todosCache=null;renderTodos()">🔄 Actualizar</button>
        <button class="btn small" onclick="descargarInventarioTodosCSV()">📊 Descargar Excel</button>
        ${esAdmin()?`<button class="btn small" style="background:transparent;color:var(--brand);border:1px solid var(--line);box-shadow:none" onclick="minVals=null;irA('min')">⚠️ Stock mínimo</button>`:''}
      </div>
    </div>
    <div class="card"><div class="wrap-x"><table>
      <tr><th>Artículo</th>${MODULOS.map(m=>`<th style="text-align:right" title="${m.nombre}">${m.nombre.slice(0,4)}.</th>`).join('')}<th style="text-align:right">Total</th></tr>
      ${items.map(it=>`<tr><td>${it.nombre}<div class="tag">${it.unidad}</div></td>${MODULOS.map(m=>celda(m.nombre,it)).join('')}<td style="text-align:right"><strong>${fmtNum(MODULOS.reduce((s,m)=>s+res[m.nombre][it.id].final,0))}</strong></td></tr>`).join('') || `<tr><td colspan="7" class="hint">Nada en ${todosCat}.</td></tr>`}
    </table></div>
    <p class="hint">${MODULOS.map(m=>m.nombre.slice(0,4)+'. = '+m.nombre).join(' · ')}</p></div>`;
}

// ===== Descargar en Excel (archivo .csv que abre Excel) =====
function descargarCSV(nombre, filas){
  const esc = v => { const t = (v===null||v===undefined)?'':String(v); return /[",\n]/.test(t) ? '"'+t.replace(/"/g,'""')+'"' : t; };
  const csv = '﻿' + filas.map(f=>f.map(esc).join(',')).join('\r\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nombre; document.body.appendChild(a); a.click();
  setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
async function descargarInventarioTodosCSV(){
  const {res, mins} = todosCache || await inventarioTodos();
  const filas = [['Categoría','Artículo','Unidad', ...MODULOS.flatMap(m=>[m.nombre, m.nombre+' completas', m.nombre+' cortado', m.nombre+' mínimo']), 'Total']];
  CATALOGO.forEach(it=>{ filas.push([it.cat, it.nombre, it.unidad, ...MODULOS.flatMap(m=>{ const f=res[m.nombre][it.id]; return [fmtNum(f.final), f.esHoja?fmtNum(f.completas):'', f.esHoja?fmtNum(f.cortado):'', (mins[m.nombre]||{})[it.id]||'']; }), fmtNum(MODULOS.reduce((s,m)=>s+res[m.nombre][it.id].final,0))]); });
  descargarCSV(`inventario-5-modulos-${fechaHoyLocal()}.csv`, filas);
}
function descargarHistorialCSV(){
  const desdeISO = new Date(mhDesde+'T00:00:00').toISOString(), hastaISO = new Date(mhHasta+'T23:59:59.999').toISOString();
  const lista = movs.filter(m=>m.tipo!=='nota' && m.fecha>=desdeISO && m.fecha<=hastaISO && m.estado!=='rechazado'
    && (mhTipo==='todos' || m.tipo===mhTipo) && (mhItem==='todos' ? (mhCat==='todas' || (CATALOGO.find(i=>i.id===m.itemId)||{}).cat===mhCat) : m.itemId===mhItem))
    .sort((a,b)=>(a.fecha||'').localeCompare(b.fecha||''));
  const filas = [['Fecha','Hora','Módulo','Artículo','Unidad','Tipo','Cantidad','Estado','Nota','Anotó']];
  lista.forEach(m=>{ const d=new Date(m.fecha); filas.push([d.toLocaleDateString('es-MX'), d.toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'}), m.modulo, m.itemNombre, item2unidad(m.itemId), etiquetaTipoMov(m), fmtNum(m.cantidad), m.estado||'aprobado', m.nota||'', m.creadoPor||'']); });
  descargarCSV(`historial-${modulo()}-${mhDesde}-a-${mhHasta}.csv`, filas);
}

// ===== Fotos de evidencia (confirmado por el usuario) =====
// Se reducen a ~900 px antes de guardarse (≈100 KB c/u) para no llenar la base de datos. En los
// demás celulares no se descargan solas: se piden a la nube solo al tocar "Ver fotos".
let fotosTmp = {};
function fotoPickerHtml(key, titulo){
  const fs = fotosTmp[key]||[];
  return `<div id="fotos-${key}" style="margin-top:10px"><label class="hint" style="display:block">${titulo}</label>
    <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:6px">
      ${fs.map((f,i)=>`<div style="position:relative"><img src="${f}" style="width:72px;height:72px;object-fit:cover;border-radius:10px;border:1px solid var(--line)"><button onclick="quitarFoto('${key}',${i})" style="position:absolute;top:-6px;right:-6px;width:24px;height:24px;border-radius:50%;border:none;background:var(--bad);color:#fff;font-weight:800;padding:0">×</button></div>`).join('')}
      ${fs.length<4?`<label class="btn small" style="background:transparent;color:var(--brand);border:1px dashed var(--brand);box-shadow:none;cursor:pointer">📷 ${fs.length?'Otra foto':'Agregar foto'}<input type="file" accept="image/*" capture="environment" style="display:none" onchange="agregarFoto('${key}',this,'${titulo.replace(/'/g,"\\'")}')"></label>`:''}
    </div></div>`;
}
function refrescarPicker(key, titulo){ const el=document.getElementById('fotos-'+key); if(el) el.outerHTML = fotoPickerHtml(key, titulo); }
function agregarFoto(key, input, titulo){
  const file = input.files && input.files[0]; if(!file) return;
  const img = new Image(); const url = URL.createObjectURL(file);
  img.onload = ()=>{
    const max = 900, k = Math.min(1, max/Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width*k); c.height = Math.round(img.height*k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    (fotosTmp[key] = fotosTmp[key]||[]).push(c.toDataURL('image/jpeg', 0.55));
    URL.revokeObjectURL(url); refrescarPicker(key, titulo);
  };
  img.onerror = ()=>{ URL.revokeObjectURL(url); alert('No se pudo leer la foto.'); };
  img.src = url;
}
function quitarFoto(key, i){ (fotosTmp[key]||[]).splice(i,1); const el=document.getElementById('fotos-'+key); if(el){ const t=el.querySelector('label.hint'); refrescarPicker(key, t?t.textContent:'Fotos'); } }
async function guardarFotos(key, tipo, refId, mod){
  const fs = fotosTmp[key]||[]; if(!fs.length) return 0;
  const creadoPor = getCurrentUserEmail?getCurrentUserEmail():'';
  for(let i=0;i<fs.length;i++) await db.collection('fotos').doc(refId+'_f'+i).set({modulo:mod, ref:{tipo, id:refId}, data:fs[i], fecha:new Date().toISOString(), creadoPor});
  fotosTmp[key] = [];
  return fs.length;
}
async function verFotos(refId, n, titulo){
  const ids = Array.from({length:n}, (_,i)=>refId+'_f'+i);
  let ov = document.getElementById('fotos-ov');
  if(!ov){ ov = document.createElement('div'); ov.id='fotos-ov'; ov.style.cssText='position:fixed;inset:0;background:rgba(10,12,20,.92);z-index:9999;overflow:auto;padding:16px;display:flex;flex-direction:column;gap:12px;align-items:center'; document.body.appendChild(ov); }
  ov.innerHTML = `<div style="color:#fff;font-weight:800;align-self:stretch;display:flex;justify-content:space-between;align-items:center">📷 ${titulo||'Fotos'}<button class="btn small" onclick="document.getElementById('fotos-ov').remove()">Cerrar</button></div><p style="color:#ccc">Cargando…</p>`;
  let fotos = [];
  try{
    if(window.buscarRemotos) fotos = await buscarRemotos('fotos', ids);
    else for(const id of ids){ const d = await db.collection('fotos').doc(id).get(); if(d && d.data) fotos.push(d.data()); }
  }catch(e){}
  if(!document.getElementById('fotos-ov')) return;
  ov.innerHTML = `<div style="color:#fff;font-weight:800;align-self:stretch;display:flex;justify-content:space-between;align-items:center">📷 ${titulo||'Fotos'}<button class="btn small" onclick="document.getElementById('fotos-ov').remove()">Cerrar</button></div>`
    + (fotos.length ? fotos.map(f=>`<img src="${f.data}" style="max-width:100%;border-radius:12px">`).join('') : '<p style="color:#ccc">No se pudieron cargar las fotos (revisa tu internet).</p>');
}

// ===== Tubos ahorrados (confirmado por el usuario) =====
// Los instaladores ahorran tubos en las instalaciones y los regresan al almacén: es una ENTRADA
// que suma al inventario (con aprobación de Dirección, como cualquier entrada del coordinador).
const TUBO_ITEM = 'Tubos 1.5 m';
function tubosAhorradosMovs(){ return movs.filter(m=>m.motivo==='tuboAhorrado' && m.estado!=='rechazado'); }
function renderTubos(){
  if(esSoloLectura()){ $('#main').innerHTML='<div class="card">Tu cuenta es de solo lectura.</div>'; return; }
  const it = itemByName(TUBO_ITEM);
  const lista = tubosAhorradosMovs();
  const mesIni = fechaHoyLocal().slice(0,7);
  const local = iso => new Date(new Date(iso).getTime()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
  const delMes = lista.filter(m=>local(m.fecha).slice(0,7)===mesIni);
  const porInst = {}; delMes.forEach(m=>{ const k=m.instalador||'(sin nombre)'; porInst[k]=(porInst[k]||0)+Number(m.cantidad||0); });
  const nombres = [...new Set(lista.map(m=>m.instalador).filter(Boolean))];
  $('#main').innerHTML = `<div class="card">
      <div style="font-size:17px;font-weight:800">♻️ Tubos ahorrados · ${modulo()}</div>
      <p class="hint">Tubos que los instaladores <strong>no usaron</strong> y regresaron al almacén. Se suman al inventario como entrada.</p>
      <label class="hint" style="display:block;margin-top:10px">¿Cuántos tubos (${TUBO_ITEM}) regresaron?</label>
      <input id="tb-cant" type="number" min="0" step="1" inputmode="numeric" placeholder="Ej. 2" style="margin-top:4px;font-size:20px">
      <label class="hint" style="display:block;margin-top:10px">¿Qué instalador los ahorró?</label>
      <input id="tb-inst" list="tb-inst-list" placeholder="Nombre del instalador" style="margin-top:4px">
      <datalist id="tb-inst-list">${nombres.map(n=>`<option value="${n.replace(/"/g,'&quot;')}">`).join('')}</datalist>
      <input id="tb-nota" placeholder="Nota (opcional, ej. cliente o folio)" style="margin-top:10px">
      <p class="hint" style="margin-top:8px">Hay ahora: ${fmtNum(calcFormula(it.id).final)} ${it.unidad}</p>
      <button class="btn" style="margin-top:6px;width:100%;min-height:54px;font-size:16px;background:linear-gradient(135deg,#1f9d55,#178045)" onclick="guardarTubos()">✅ Guardar tubos ahorrados</button>
    </div>
    <div class="card"><strong>🏆 Este mes</strong>
      ${Object.keys(porInst).length ? `<div class="movlist" style="margin-top:8px">${Object.entries(porInst).sort((a,b)=>b[1]-a[1]).map(([n,q])=>`<div class="movitem"><span class="invname">${n}</span><strong>${fmtNum(q)} tubo(s)</strong></div>`).join('')}</div>
        <p class="hint">Total del mes: <strong>${fmtNum(delMes.reduce((s,m)=>s+Number(m.cantidad||0),0))}</strong> tubo(s).</p>` : '<p class="hint">Todavía no hay tubos ahorrados este mes.</p>'}
    </div>
    ${lista.length?`<details class="card"><summary><strong>Últimos registros</strong></summary><div class="wrap-x" style="margin-top:8px"><table><tr><th>Fecha</th><th>Instalador</th><th>Tubos</th><th>Estado</th></tr>
      ${lista.slice(0,30).map(m=>`<tr><td>${new Date(m.fecha).toLocaleDateString('es-MX')}</td><td>${m.instalador||'—'}</td><td>${fmtNum(m.cantidad)}</td><td>${badgeEstado(m.estado)}</td></tr>`).join('')}</table></div></details>`:''}`;
}
async function guardarTubos(){
  const it = itemByName(TUBO_ITEM);
  const cantidad = Number(document.getElementById('tb-cant').value);
  const instalador = (document.getElementById('tb-inst').value||'').trim();
  const notaExtra = (document.getElementById('tb-nota').value||'').trim();
  if(!(cantidad>0)) return alert('Escribe cuántos tubos regresaron.');
  if(!instalador) return alert('Escribe el nombre del instalador que ahorró los tubos.');
  if(!confirm(`¿Todo está bien?\n\n♻️ ${fmtNum(cantidad)} tubo(s) ahorrados por ${instalador}\n\nSe suman al inventario de ${modulo()}.`)) return;
  try{
    const estado = estadoNuevoMovimiento();
    await db.collection('movimientos').doc(cryptoId()).set({modulo:modulo(), itemId:it.id, itemNombre:it.nombre, tipo:'entrada', motivo:'tuboAhorrado', instalador, cantidad,
      nota:'Tubos ahorrados · '+instalador+(notaExtra?' · '+notaExtra:''), fecha:new Date().toISOString(), estado, loteId:cryptoId(), creadoPor:getCurrentUserEmail?getCurrentUserEmail():''});
    toast(estado==='pendiente' ? '✅ Guardado.<br><small>Dirección lo aprueba y se suma al inventario.</small>' : '✅ Sumado al inventario.');
    renderTubos();
  }catch(e){ alert('Error: '+e.message); }
}

// ===== Sobrantes (confirmado por el usuario) =====
// Material que salió para una instalación, NO se instaló y regresó al taller para aprovecharse
// en otra cosa. Al mandarlo a Sobrantes, su melamina/MDF SALE del inventario (los herrajes no se
// tocan). Cuando se transforma, se anotan las piezas EXACTAS que salieron y esas regresan al
// inventario como material cortado. Lo que ya no se aprovecha queda como merma del sobrante.
let sobrantesCache = [], sobTab = 'abiertos', sobTransf = null, sobPreview = null, sobNota = '';
// "Ya se descontó en una instalación registrada" (confirmado por el usuario): las piezas regresaron de
// una instalación que ya descontó su material. Se registra que regresaron (suman) y en el mismo lote
// salen a sobrantes/merma, así el inventario no se descuenta dos veces.
let sobYaDesc = false;
const SOB_TIPOS = ['puertas','pieza','medida','armado'];
function iniciarSobrante(){
  if(garSub!=='sobrante'){ garLineasGuardadas = garLineas; }
  garLineas = []; garPreview = null; sobPreview = null; sobNota = ''; sobYaDesc = false; garSub = 'sobrante';
  if(!SOB_TIPOS.includes(garTipo)) garTipo = 'puertas';
  renderGar(); window.scrollTo(0,0);
}
function salirSobrante(){
  if(garSub!=='sobrante') return;
  garLineas = garLineasGuardadas || []; garLineasGuardadas = null; garPreview = null; sobPreview = null; garSub = 'nueva';
}
function consumoSobrante(lineas){
  return consumoGarantiaDetalle(lineas).consumo.filter(c=>esHojaId(c.itemId) && c.cantidad>0).map(c=>({itemId:c.itemId, cantidad:fmtNum(c.cantidad)}));
}
function renderSobranteNuevo(lista, campos){
  const tipoBtns = SOB_TIPOS.map(k=>{ const x=GAR_TIPOS[k];
    return `<button class="tipobtn ${k===garTipo?'on':''}" onclick="garTipo='${k}';renderGar()"><span class="tipo-ic">${x.ic}</span><span><strong>${x.t}</strong><br><small>${x.s}</small></span></button>`; }).join('');
  if(!SOB_TIPOS.includes(garTipo)){ garTipo='puertas'; return renderGar(); }
  $('#main').innerHTML = `<div class="card" style="border:2px solid #0e8a8a">
      <div style="font-size:17px;font-weight:800">🧩 Mandar a sobrantes · ${modulo()}</div>
      <p class="hint">Material que salió para una instalación, <strong>no se instaló</strong> y regresó al taller. Su melamina/MDF sale del inventario y queda apartada en Sobrantes hasta que se transforme en otra cosa. Los herrajes no se tocan.</p>
      <button class="btn small" style="background:transparent;color:var(--bad);border:1px solid var(--line);box-shadow:none" onclick="salirSobrante();renderSob()">Cancelar</button>
    </div>
    <div class="card">
      <div class="paso">1</div><strong>¿Qué regresó?</strong>
      <div class="tipos" style="margin-top:10px">${tipoBtns}</div>
      <div style="margin-top:12px">${campos}</div>
      <button class="btn" style="margin-top:12px;width:100%" onclick="agregarLineaGar()">+ Agregar</button>
    </div>
    <div class="card">
      <div class="paso">2</div><strong>Lo que va a sobrantes (${garLineas.length})</strong>
      <div style="margin-top:10px">${lista}</div>
    </div>
    <div class="card">
      <div class="paso">3</div><strong>¿De dónde viene?</strong>
      <input id="sob-nota" placeholder="Ej. Puertas del cliente Pérez, no las quiso" value="${String(sobNota).replace(/"/g,'&quot;')}" oninput="sobNota=this.value" style="margin-top:8px">
      <label style="display:flex;gap:10px;align-items:flex-start;margin-top:12px;padding:10px 12px;border-radius:12px;border:1px solid ${sobYaDesc?'#0e8a8a':'var(--line)'};background:${sobYaDesc?'rgba(14,138,138,.12)':'transparent'}"><input type="checkbox" style="width:auto;margin-top:3px" ${sobYaDesc?'checked':''} onchange="sobYaDesc=this.checked;renderGar()"><span><strong>Ya se descontó en una instalación registrada</strong><br><span class="hint" style="margin:0">Márcalo si estas piezas salieron para una instalación que ya está capturada (por ejemplo, puertas que no quedaron y se rehicieron). Así no se descuentan otra vez.</span></span></label>
      <button class="btn" style="margin-top:12px;width:100%;min-height:50px" onclick="previewSobrante()">Revisar material</button>
    </div>
    <div id="sob-result"></div>`;
  if(sobPreview) pintarPreviewSobrante();
}
function previewSobrante(){
  if(!garLineas.length) return alert('Primero agrega lo que regresó (paso 1).');
  sobPreview = consumoSobrante(garLineas);
  if(!sobPreview.length) return alert('Eso no tiene melamina ni MDF. A sobrantes solo va la melamina/MDF; los herrajes se quedan en el inventario.');
  pintarPreviewSobrante();
}
function pintarPreviewSobrante(){
  const el = document.getElementById('sob-result'); if(!el) return;
  sobPreview = consumoSobrante(garLineas); if(!sobPreview.length){ el.innerHTML=''; return; }
  el.innerHTML = `<div class="card" id="sob-prev">
    <div style="font-size:16px;font-weight:800">${sobYaDesc?'📋 Esto ya se había descontado':'📋 Esto sale del inventario'}</div>
    ${sobYaDesc?'<p class="hint" style="margin:4px 0 0">Ya salió con la instalación: el inventario <strong>no cambia</strong>, solo queda registrado a dónde se fue.</p>':''}
    <div class="movlist" style="margin-top:8px">${sobPreview.map(c=>{ const it=CATALOGO.find(i=>i.id===c.itemId); return `<div class="movitem"><span class="invname">${it.nombre}</span><strong>${fmtNum(c.cantidad)} ${it.unidad}</strong></div>`; }).join('')}</div>
    <p class="hint" style="margin-top:10px">¿Qué se hace con esto?</p>
    <button class="btn" style="width:100%;min-height:54px;margin-top:6px;background:linear-gradient(135deg,#0e8a8a,#0b6f6f)" onclick="confirmarSobrante('sobrante')">🧩 Sobrantes: se va a aprovechar</button>
    <button class="btn" style="width:100%;min-height:54px;margin-top:10px;background:transparent;color:var(--bad);border:1px solid var(--bad);box-shadow:none" onclick="confirmarSobrante('merma')">🗑️ Merma: ya no sirve</button>
  </div>`;
  const pc = document.getElementById('sob-prev'); if(pc && pc.scrollIntoView) pc.scrollIntoView({behavior:'smooth', block:'start'});
}
async function confirmarSobrante(destino){
  if(!sobPreview || !sobPreview.length) return;
  const nota = (sobNota||'').trim();
  const aMerma = destino==='merma';
  if(aMerma && !confirm('🗑️ Mandar a MERMA:\n\n'+sobPreview.map(c=>`• ${fmtNum(c.cantidad)} ${CATALOGO.find(i=>i.id===c.itemId).nombre}`).join('\n')+'\n\nSale del inventario y ya no se aprovecha. ¿Continuar?')) return;
  try{
    const estado = estadoNuevoMovimiento(), creadoPor = getCurrentUserEmail?getCurrentUserEmail():'', fecha = new Date().toISOString(), mod = modulo();
    const id = cryptoId();
    const yaDesc = sobYaDesc, fechaReg = new Date(Date.parse(fecha)-1).toISOString(); // el regreso va 1 ms antes, para que se sume antes de salir
    for(const c of sobPreview){ const it=CATALOGO.find(i=>i.id===c.itemId);
      if(yaDesc) await db.collection('movimientos').doc(cryptoId()).set({modulo:mod, itemId:c.itemId, itemNombre:it.nombre, tipo:'devolucion', motivo:'regresoPiezasInst', cantidad:c.cantidad, nota:'Regresó de una instalación ya registrada'+(nota?' · '+nota:''), fecha:fechaReg, estado, loteId:id, sobranteId:id, creadoPor});
      if(aMerma) await db.collection('movimientos').doc(cryptoId()).set({modulo:mod, itemId:c.itemId, itemNombre:it.nombre, tipo:'merma', lado:'cortado', motivo:'regresoMerma', cantidad:c.cantidad, nota:'Regresó sin instalar y no sirve'+(nota?' · '+nota:''), fecha, estado, loteId:id, sobranteId:id, creadoPor});
      else await db.collection('movimientos').doc(cryptoId()).set({modulo:mod, itemId:c.itemId, itemNombre:it.nombre, tipo:'sobrante', cantidad:c.cantidad, nota:'A sobrantes'+(nota?' · '+nota:''), fecha, estado, loteId:id, sobranteId:id, creadoPor}); }
    const restante = {}; if(!aMerma) sobPreview.forEach(c=>{ restante[c.itemId] = c.cantidad; });
    const doc = {modulo:mod, fecha, nota, ...(yaDesc?{yaDescontado:true}:{}), lineas:garLineas.map(describirLineaGar), lineasData:JSON.parse(JSON.stringify(garLineas)), material:sobPreview, restante, estado: aMerma?'cerrado':'abierto', transformaciones:[], creadoPor};
    if(aMerma){ doc.directoMerma = true; doc.cerradoEn = fecha; doc.mermaFinal = sobPreview.map(c=>({itemId:c.itemId, cantidad:c.cantidad})); }
    await db.collection('sobrantes').doc(id).set(doc);
    const pend = estado==='pendiente' ? (yaDesc?'<br><small>Dirección lo aprueba.</small>':'<br><small>Dirección lo aprueba para que salga del inventario.</small>') : '';
    toast((aMerma ? '🗑️ Registrado como merma.' : '🧩 Mandado a sobrantes.')+pend);
    salirSobrante(); sobTab = aMerma ? 'cerrados' : 'abiertos'; renderSob();
  }catch(e){ alert('Error: '+e.message); }
}
function estadoAprobSob(loteId){ const ms = movs.filter(m=>m.loteId===loteId); if(!ms.length) return 'aprobado'; if(ms.some(m=>m.estado==='pendiente')) return 'pendiente'; if(ms.every(m=>m.estado==='rechazado')) return 'rechazado'; return 'aprobado'; }
async function renderSob(){
  current = 'sob';
  $('#main').innerHTML = '<div class="card hint">Cargando sobrantes…</div>';
  try{ const snap = await db.collection('sobrantes').get(); sobrantesCache = snap.docs.map(d=>({id:d.id,...d.data()})).filter(x=>x.modulo===modulo()).sort((a,b)=>(b.fecha||'').localeCompare(a.fecha||'')); }catch(e){ sobrantesCache=[]; }
  if(current!=='sob') return;
  const vivos = sobrantesCache.filter(x=>estadoAprobSob(x.id)!=='rechazado');
  const abiertos = vivos.filter(x=>x.estado!=='cerrado'), cerrados = vivos.filter(x=>x.estado==='cerrado');
  // Totales por material de lo que sigue apartado
  const tot = {}; abiertos.forEach(x=>Object.keys(x.restante||{}).forEach(k=>{ tot[k]=(tot[k]||0)+Number(x.restante[k]||0); }));
  const totHtml = Object.keys(tot).filter(k=>tot[k]>0.0005).map(k=>{ const it=CATALOGO.find(i=>i.id===k); return `<div class="movitem"><span class="invname">${it?it.nombre:k}</span><strong>${fmtNum(tot[k])} ${it?it.unidad:''}</strong></div>`; }).join('');
  const puede = !esSoloLectura();
  const cardSob = x => { const ea = estadoAprobSob(x.id);
    const rest = Object.keys(x.restante||{}).filter(k=>x.restante[k]>0.0005).map(k=>{ const it=CATALOGO.find(i=>i.id===k); return `${fmtNum(x.restante[k])} ${it?it.unidad:''} de ${it?it.nombre:k}`; }).join('<br>');
    const trans = (x.transformaciones||[]).map(t=>`<div class="hint" style="margin:4px 0 0">✂️ ${new Date(t.fecha).toLocaleDateString('es-MX')}: salieron ${t.piezas.join(', ')} ${badgeEstado(estadoAprobSob(t.loteId))}</div>`).join('');
    return `<div class="card">
      <div class="row" style="justify-content:space-between"><strong>${new Date(x.fecha).toLocaleDateString('es-MX',{day:'numeric',month:'long'})}</strong>${badgeEstado(ea)}</div>
      ${x.nota?`<p class="hint" style="margin:4px 0">${x.nota}</p>`:''}
      <ul style="margin:6px 0 6px 18px;padding:0;line-height:1.5">${(x.lineas||[]).map(l=>`<li>${l}</li>`).join('')}</ul>
      ${x.estado==='cerrado' ? `<p class="hint" style="margin:4px 0">${x.directoMerma?'🗑️ Se fue directo a merma':'Terminado'}${x.mermaFinal&&x.mermaFinal.length?' · merma: '+x.mermaFinal.map(m=>{const it=CATALOGO.find(i=>i.id===m.itemId); return fmtNum(m.cantidad)+' '+(it?it.unidad+' '+it.nombre:'');}).join(', '):''}</p>` : `<p class="hint" style="margin:4px 0"><strong>Queda:</strong><br>${rest||'—'}</p>`}
      ${trans}
      ${puede && x.estado!=='cerrado' && ea!=='rechazado' ? `<button class="btn" style="width:100%;margin-top:10px;background:linear-gradient(135deg,#0e8a8a,#0b6f6f)" onclick="iniciarTransformacion('${x.id}')">✂️ Se transformó: anotar qué salió</button>
        <button class="btn small" style="width:100%;margin-top:8px;background:transparent;color:var(--bad);border:1px solid var(--bad);box-shadow:none" onclick="sobranteAMerma('${x.id}')">🗑️ Ya no sirve: lo que queda es merma</button>` : ''}
    </div>`; };
  let cuerpo;
  if(sobTransf) cuerpo = transformacionHtml();
  else cuerpo = (sobTab==='abiertos' ? (abiertos.length ? abiertos.map(cardSob).join('') : '<div class="card hint">No hay sobrantes apartados. 🎉</div>') : (cerrados.length ? cerrados.map(cardSob).join('') : '<div class="card hint">Todavía no hay sobrantes terminados.</div>'));
  $('#main').innerHTML = `<div class="card">
      <div style="font-size:17px;font-weight:800">🧩 Sobrantes · ${modulo()}</div>
      <p class="hint">Material que regresó sin instalarse. Está <strong>fuera del inventario</strong> hasta que se transforme; entonces regresa lo que salió de él (como material cortado). En las auditorías no se cuenta.</p>
      ${puede?`<button class="btn" style="width:100%;margin-top:6px" onclick="iniciarSobrante()">+ Mandar material a sobrantes</button>
      <button class="btn small" style="width:100%;margin-top:8px;background:transparent;color:#1f9d55;border:1px solid var(--line);box-shadow:none" onclick="instSub='historial';instRegreso=true;setView('inst')">↩️ ¿Regresó un modelo completo? Ese vuelve al inventario</button>`:''}
      ${totHtml?`<p class="hint" style="margin:10px 0 4px"><strong>Apartado ahora:</strong></p><div class="movlist">${totHtml}</div>`:''}
      <div class="subtabs" style="margin:10px 0 0"><button class="${sobTab==='abiertos'?'active':''}" onclick="sobTab='abiertos';sobTransf=null;renderSob()">Apartados (${abiertos.length})</button><button class="${sobTab==='cerrados'?'active':''}" onclick="sobTab='cerrados';sobTransf=null;renderSob()">Terminados (${cerrados.length})</button></div>
    </div>${cuerpo}`;
}
async function sobranteAMerma(id){
  const x = sobrantesCache.find(s=>s.id===id); if(!x) return;
  const rest = Object.keys(x.restante||{}).filter(k=>x.restante[k]>0.0005);
  if(!confirm('🗑️ Lo que queda de este sobrante ya no sirve:\n\n'+rest.map(k=>`• ${fmtNum(x.restante[k])} ${CATALOGO.find(i=>i.id===k).nombre}`).join('\n')+'\n\nSe marca como MERMA y el sobrante se cierra. (Ya había salido del inventario, así que no se descuenta otra vez.) ¿Continuar?')) return;
  try{
    await db.collection('sobrantes').doc(id).update({estado:'cerrado', cerradoEn:new Date().toISOString(), mermaFinal: rest.map(k=>({itemId:k, cantidad:x.restante[k]}))});
    toast('🗑️ Sobrante cerrado como merma.'); sobTab='cerrados'; renderSob();
  }catch(e){ alert('Error: '+e.message); }
}
// --- Transformación: se anotan las piezas exactas que salieron del sobrante ---
function iniciarTransformacion(id){
  const x = sobrantesCache.find(s=>s.id===id); if(!x) return;
  const colores = Object.keys(x.restante||{}).map(k=>CATALOGO.find(i=>i.id===k)).filter(it=>it && it.cat==='Melamina').map(it=>it.nombre.replace('Melamina ',''));
  sobTransf = {id, color: colores[0]||'Blanco', piezas:{}, medidas:[], mAncho:'', mAlto:'', mCant:'', pTipo:'Normal', pAncho:'', pAlto:'', pCortes:null};
  renderSob(); window.scrollTo(0,0);
}
function piezasTransformacion(){
  const t = sobTransf; const pool = [];
  Object.keys(t.piezas).forEach(k=>{ const n=Number(t.piezas[k]); const p=PIEZAS_AUDIT.find(x=>x.key===k); if(p && n>0) pool.push({nombre:p.nombre, cantidad:n, dim:p.dim, colorDestino: p.tipo==='mel'?t.color:'—', estado:'ok'}); });
  const out = {};
  const porColor = {}; pool.forEach(p=>{ (porColor[p.colorDestino]=porColor[p.colorDestino]||[]).push(p); });
  Object.keys(porColor).forEach(c=>piezasAConsumo(porColor[c], c).forEach(r=>{ if(esHojaId(r.itemId)) out[r.itemId]=(out[r.itemId]||0)+r.cantidad; }));
  t.medidas.forEach(m=>{ const porHoja = piezasPorHojaIndividual(m.ancho, m.alto, 122, 244); const it=itemByName('Melamina '+t.color); if(it && porHoja>0) out[it.id]=(out[it.id]||0)+m.cantidad/porHoja; });
  Object.keys(out).forEach(k=>out[k]=fmtNum(out[k]));
  return out;
}
function descPiezasTransformacion(){
  const t = sobTransf;
  return Object.keys(t.piezas).filter(k=>Number(t.piezas[k])>0).map(k=>{ const p=PIEZAS_AUDIT.find(x=>x.key===k); return `${t.piezas[k]} ${p.label}`; })
    .concat(t.medidas.map(m=>`${m.cantidad} ${m.label?m.label.toLowerCase()+'(s)':'pieza(s)'} de ${fmtNum(m.ancho)}×${fmtNum(m.alto)}`));
}
function transformacionHtml(){
  const t = sobTransf; const x = sobrantesCache.find(s=>s.id===t.id); if(!x){ sobTransf=null; return ''; }
  const colores = Object.keys(x.restante||{}).map(k=>CATALOGO.find(i=>i.id===k)).filter(it=>it && it.cat==='Melamina').map(it=>it.nombre.replace('Melamina ',''));
  const hayMDF = Object.keys(x.restante||{}).some(k=>{ const it=CATALOGO.find(i=>i.id===k); return it && it.cat==='MDF'; });
  const lista = PIEZAS_AUDIT.filter(p=>p.tipo==='mel' || hayMDF);
  const eq = piezasTransformacion();
  const rest = x.restante||{};
  const eqHtml = Object.keys(eq).map(k=>{ const it=CATALOGO.find(i=>i.id===k); const r=Number(rest[k]||0); const pasa = eq[k] > r + 0.0005;
    return `<div class="movitem"><span class="invname">${it.nombre}</span><span class="${pasa?'neg':''}"><strong>${fmtNum(eq[k])}</strong> de ${fmtNum(r)} ${it.unidad}${pasa?' ⚠️':''}</span></div>`; }).join('');
  return `<div class="card" style="border:2px solid #0e8a8a">
      <div style="font-size:16px;font-weight:800">✂️ ¿Qué salió de este sobrante?</div>
      <p class="hint">${(x.lineas||[]).join(' · ')}${x.nota?' — '+x.nota:''}</p>
      <p class="hint">Anota las piezas <strong>exactas</strong> que se sacaron. Regresan al inventario como material cortado.</p>
      ${colores.length>1?`<label class="hint">Color</label><select style="margin-top:4px" onchange="sobTransf.color=this.value;renderSob()">${colores.map(c=>`<option ${c===t.color?'selected':''}>${c}</option>`).join('')}</select>`:`<p class="hint" style="margin:0">Color: <strong>${t.color}</strong></p>`}
      <div class="wrap-x" style="margin-top:10px"><table><tr><th>Pieza</th><th>Cantidad</th></tr>
        ${lista.map(p=>`<tr><td>${p.label}<div class="tag">${p.dim}</div></td><td><input type="number" min="0" inputmode="numeric" style="min-width:70px" value="${t.piezas[p.key]||''}" onchange="sobTransf.piezas['${p.key}']=Number(this.value)||0;renderSob()"></td></tr>`).join('')}
      </table></div>
      <details style="margin-top:10px"><summary class="hint"><strong>+ Otra pieza a medida (ancho × alto)</strong></summary>
        <div class="grid2" style="margin-top:8px">
          <div><label class="hint">Ancho (cm)</label><input type="number" inputmode="decimal" value="${t.mAncho}" oninput="sobTransf.mAncho=this.value"></div>
          <div><label class="hint">Alto (cm)</label><input type="number" inputmode="decimal" value="${t.mAlto}" oninput="sobTransf.mAlto=this.value"></div>
          <div><label class="hint">¿Cuántas?</label><input type="number" inputmode="numeric" value="${t.mCant}" oninput="sobTransf.mCant=this.value"></div>
        </div>
        <button class="btn small" style="margin-top:8px" onclick="agregarMedidaTransf()">Agregar</button>
      </details>
      <div style="margin-top:12px;padding:10px 12px;border-radius:12px;border:1px solid var(--line)">
        <strong>🚪 Puertas (por la medida del hueco)</strong>
        <p class="hint" style="margin:4px 0 0">Elige el tipo y la medida del hueco; la app calcula las puertas, marcos y fijos. Deja solo las piezas que sacaste.</p>
        <select style="margin-top:8px" onchange="sobTransf.pTipo=this.value;sobTransf.pCortes=null;renderSob()">${Object.keys(TIPOS_PUERTA).map(k=>`<option ${k===t.pTipo?'selected':''}>${k}</option>`).join('')}</select>
        <div class="grid2" style="margin-top:8px">
          <div><label class="hint">Ancho del hueco (cm)</label><input type="number" inputmode="decimal" value="${t.pAncho}" oninput="sobTransf.pAncho=this.value"></div>
          <div><label class="hint">Alto del hueco (cm)</label><input type="number" inputmode="decimal" value="${t.pAlto}" oninput="sobTransf.pAlto=this.value"></div>
        </div>
        <button class="btn small" style="margin-top:8px" onclick="calcPuertaTransf()">Calcular piezas</button>
        ${t.pCortes?`<div class="movlist" style="margin-top:8px">${t.pCortes.map((c,i)=>`<label class="movitem" style="padding:8px 10px"><span>${PIEZA_PUERTA_LABEL[c.pieza]||c.pieza}<span class="tag" style="margin-left:6px">${fmtNum(c.ancho)}×${fmtNum(c.alto)}</span></span><input type="number" min="0" max="${c.max}" inputmode="numeric" value="${c.cantidad}" style="width:64px;min-width:64px;text-align:center" oninput="sobTransf.pCortes[${i}].cantidad=Math.max(0,Math.min(${c.max},Number(this.value)||0))"></label>`).join('')}</div>
          <button class="btn" style="margin-top:8px;width:100%;background:linear-gradient(135deg,#0e8a8a,#0b6f6f)" onclick="agregarPuertaTransf()">➕ Agregar estas piezas</button>`:''}
      </div>
      ${t.medidas.length?`<div style="margin-top:10px"><strong>Piezas a medida anotadas</strong><div class="movlist" style="margin-top:6px">${t.medidas.map((m,i)=>`<div class="movitem" style="padding:8px 10px"><span>${m.cantidad} × ${m.label||'Pieza'} de ${fmtNum(m.ancho)}×${fmtNum(m.alto)}</span><button class="btn small" style="background:transparent;color:var(--bad);border:1px solid var(--line);box-shadow:none" onclick="sobTransf.medidas.splice(${i},1);renderSob()">✖</button></div>`).join('')}</div></div>`:''}
    </div>
    <div class="card">
      <strong>Equivale a</strong>
      ${eqHtml?`<div class="movlist" style="margin-top:8px">${eqHtml}</div><p class="hint">"de X" = lo que queda en este sobrante.</p>`:'<p class="hint">Todavía no anotas piezas.</p>'}
      <div class="row" style="justify-content:space-between;margin-top:10px">
        <button class="btn small" style="background:transparent;color:var(--sub);border:1px solid var(--line);box-shadow:none" onclick="sobTransf=null;renderSob()">Cancelar</button>
        <button class="btn" onclick="confirmarTransformacion()">✅ Guardar</button>
      </div>
    </div>`;
}
const PIEZA_PUERTA_LABEL = {puerta:'Puerta', marco:'Marco', fijo:'Fijo', paredFalsa:'Pared falsa', extFijo:'Extensión de fijo'};
function calcPuertaTransf(){
  const t = sobTransf; const an = Number(t.pAncho), al = Number(t.pAlto);
  if(!(an>0) || !(al>0)) return alert('Escribe el ancho y el alto del hueco en centímetros.');
  const r = calcularPuerta(t.pTipo, al, an, false);
  t.pCortes = (r.cortes||[]).filter(c=>c.cantidad>0).map(c=>({pieza:c.pieza, ancho:fmtNum(c.ancho), alto:fmtNum(c.alto), cantidad:c.cantidad, max:c.cantidad}));
  renderSob();
}
function agregarPuertaTransf(){
  const t = sobTransf; if(!t.pCortes) return;
  const sel = t.pCortes.filter(c=>c.cantidad>0);
  if(!sel.length) return alert('Deja al menos una pieza con cantidad.');
  for(const c of sel){ if(piezasPorHojaIndividual(c.ancho, c.alto, 122, 244)<1) return alert(`${PIEZA_PUERTA_LABEL[c.pieza]||c.pieza} de ${c.ancho}×${c.alto} no cabe en una hoja de 122×244 cm.`); }
  sel.forEach(c=>t.medidas.push({ancho:c.ancho, alto:c.alto, cantidad:c.cantidad, label:PIEZA_PUERTA_LABEL[c.pieza]||'Pieza'}));
  t.pCortes = null; renderSob();
}
function agregarMedidaTransf(){
  const t = sobTransf; const an=Number(t.mAncho), al=Number(t.mAlto), n=Number(t.mCant)||1;
  if(!an || !al) return alert('Escribe ancho y alto.');
  if(piezasPorHojaIndividual(an, al, 122, 244)<1) return alert('Esa pieza no cabe en una hoja de 122×244 cm.');
  t.medidas.push({ancho:an, alto:al, cantidad:n}); t.mAncho=''; t.mAlto=''; t.mCant=''; renderSob();
}
async function confirmarTransformacion(){
  const t = sobTransf; const x = sobrantesCache.find(s=>s.id===t.id); if(!x) return;
  const eq = piezasTransformacion(); const piezas = descPiezasTransformacion();
  if(!Object.keys(eq).length) return alert('Anota qué piezas salieron.');
  const rest = Object.assign({}, x.restante||{});
  const pasados = Object.keys(eq).filter(k=>eq[k] > Number(rest[k]||0) + 0.0005);
  if(pasados.length) return alert('Las piezas equivalen a más material del que queda en este sobrante:\n\n'+pasados.map(k=>`• ${CATALOGO.find(i=>i.id===k).nombre}: ${fmtNum(eq[k])} y solo quedan ${fmtNum(rest[k]||0)}`).join('\n')+'\n\nRevisa las cantidades.');
  const usado = {}; Object.keys(eq).forEach(k=>{ usado[k]=eq[k]; rest[k] = fmtNum(Number(rest[k]||0) - eq[k]); });
  const quedaAlgo = Object.keys(rest).some(k=>rest[k]>0.0005);
  let cerrar = !quedaAlgo;
  if(quedaAlgo) cerrar = confirm(`Regresa al inventario:\n${Object.keys(eq).map(k=>`• ${fmtNum(eq[k])} ${CATALOGO.find(i=>i.id===k).nombre}`).join('\n')}\n\nEn el sobrante todavía queda:\n${Object.keys(rest).filter(k=>rest[k]>0.0005).map(k=>`• ${fmtNum(rest[k])} ${CATALOGO.find(i=>i.id===k).nombre}`).join('\n')}\n\n¿Ya se acabó este sobrante?\nAceptar = sí, lo que queda es MERMA.\nCancelar = no, lo que queda sigue apartado para después.`);
  try{
    const estado = estadoNuevoMovimiento(), creadoPor = getCurrentUserEmail?getCurrentUserEmail():'', fecha = new Date().toISOString(), loteId = cryptoId();
    for(const k of Object.keys(eq)){ const it=CATALOGO.find(i=>i.id===k);
      await db.collection('movimientos').doc(cryptoId()).set({modulo:x.modulo, itemId:k, itemNombre:it.nombre, tipo:'devolucion', motivo:'deSobrante', cantidad:eq[k], nota:'Sobrante transformado: '+piezas.join(', '), fecha, estado, loteId, sobranteId:x.id, creadoPor}); }
    const upd = {transformaciones:(x.transformaciones||[]).concat([{fecha, piezas, usado, loteId, creadoPor}]), restante: rest};
    if(cerrar){ upd.estado='cerrado'; upd.cerradoEn=fecha; upd.mermaFinal = Object.keys(rest).filter(k=>rest[k]>0.0005).map(k=>({itemId:k, cantidad:rest[k]})); }
    await db.collection('sobrantes').doc(x.id).update(upd);
    sobTransf = null;
    toast('✂️ Guardado.'+(estado==='pendiente'?'<br><small>Dirección lo aprueba para que se sume al inventario.</small>':''));
    renderSob();
  }catch(e){ alert('Error: '+e.message); }
}

// ===== Piezas cortadas encontradas (confirmado por el usuario) =====
// Material cortado que no estaba en el inventario (sobrante que nunca se contó). El coordinador
// captura las piezas (mismas que el conteo) y la app las convierte a hojas con los rendimientos del
// despiece; se SUMAN al material cortado de su color. Como cualquier captura, Dirección lo aprueba.
let pzGrupo = null, pzVals = {}, pzNota = '';
// La misma pantalla de piezas sirve para dos cosas (confirmado por el usuario): 'enc' = piezas encontradas
// (SUMAN al cortado) y 'merma' = piezas dañadas (SALEN del cortado como merma).
let pzModo = 'enc';
function pzSetModo(m){ if(pzModo!==m){ pzVals = {}; pzMedidas = []; pzNota = ''; } pzModo = m; }
// Piezas de puertas encontradas (confirmado por el usuario): pared falsa, puerta, marco, fijo, extensión
// de fijo… se capturan con su medida y se convierten a hojas igual que en garantías (acomodo en hoja 122×244).
let pzMedidas = []; // {nombre, ancho, alto, cantidad, color}
const PZ_MEDIDA_NOMBRES = {'Pared falsa':[60,244], 'Puerta':['',''], 'Marco':['',''], 'Fijo':['',''], 'Extensión de fijo':[60,''], 'Otra pieza':['','']};
let pzMedForm = {nombre:'Pared falsa', ancho:'60', alto:'244', cantidad:'1'};
function pzMedidasHtml(){
  const f = pzMedForm, mias = pzMedidas.map((m,i)=>({...m,i})).filter(m=>m.color===pzGrupo);
  return `<div class="card">
      <div class="paso">2b</div><strong>🚪 Piezas de puertas (con medida)</strong>
      <p class="hint" style="margin-top:4px">Pared falsa, puerta, marco, fijo, extensión de fijo… Escribe el ancho y el alto en cm.</p>
      <select style="margin-top:8px" onchange="pzMedForm.nombre=this.value; const d=PZ_MEDIDA_NOMBRES[this.value]||['','']; pzMedForm.ancho=String(d[0]); pzMedForm.alto=String(d[1]); renderPzEnc()">${Object.keys(PZ_MEDIDA_NOMBRES).map(n=>`<option ${n===f.nombre?'selected':''}>${n}</option>`).join('')}</select>
      <div class="grid2" style="margin-top:8px">
        <div><label class="hint">Ancho (cm)</label><input id="pzm-ancho" type="number" inputmode="decimal" value="${f.ancho}" oninput="pzMedForm.ancho=this.value" style="margin-top:4px"></div>
        <div><label class="hint">Alto (cm)</label><input id="pzm-alto" type="number" inputmode="decimal" value="${f.alto}" oninput="pzMedForm.alto=this.value" style="margin-top:4px"></div>
      </div>
      <label class="hint" style="display:block;margin-top:8px">¿Cuántas?</label><input id="pzm-cant" type="number" inputmode="numeric" min="1" value="${f.cantidad}" oninput="pzMedForm.cantidad=this.value" style="margin-top:4px">
      <button class="btn small" style="margin-top:10px;width:100%" onclick="agregarPzMedida()">➕ Agregar pieza de ${pzGrupo}</button>
      ${mias.length?`<div class="movlist" style="margin-top:10px">${mias.map(m=>`<div class="movitem" style="padding:8px 10px"><span>${m.cantidad} × ${m.nombre} de ${fmtNum(m.ancho)}×${fmtNum(m.alto)} cm</span><button class="btn small" style="background:transparent;color:var(--bad);border:1px solid var(--line);box-shadow:none" onclick="pzMedidas.splice(${m.i},1);renderPzEnc()">✖</button></div>`).join('')}</div>`:''}
    </div>`;
}
function agregarPzMedida(){
  const a = Number(pzMedForm.ancho), h = Number(pzMedForm.alto), n = Math.round(Number(pzMedForm.cantidad)||0);
  if(!(a>0) || !(h>0)) return alert('Escribe el ancho y el alto de la pieza en centímetros.');
  if(Math.min(a,h)>122 || Math.max(a,h)>244) return alert('La pieza es más grande que una hoja (122×244). Revisa las medidas.');
  if(!(n>0)) return alert('Escribe cuántas piezas son.');
  pzMedidas.push({nombre:pzMedForm.nombre, ancho:a, alto:h, cantidad:n, color:pzGrupo});
  pzMedForm.cantidad = '1';
  renderPzEnc();
}
function pzMedidasDetalle(){ return pzMedidas.map(m=>`${m.cantidad} × ${m.nombre} de ${fmtNum(m.ancho)}×${fmtNum(m.alto)} cm · ${m.color}`); }
function pzPool(){
  const pool = [];
  Object.keys(pzVals).forEach(g=>{ const c = pzVals[g]||{};
    PIEZAS_AUDIT.filter(p=>c[p.key]>0).forEach(p=>pool.push({nombre:p.nombre, cantidad:c[p.key], dim:p.dim, colorDestino:g, estado:'ok', label:p.label, grupo:g})); });
  return pool;
}
function pzConsumo(){
  const pool = pzPool(), porColor = {}, out = {};
  pool.forEach(p=>{ (porColor[p.colorDestino] = porColor[p.colorDestino]||[]).push(p); });
  Object.keys(porColor).forEach(c=>piezasAConsumo(porColor[c], c).forEach(r=>{ out[r.itemId]=(out[r.itemId]||0)+r.cantidad; }));
  const medPorColor = {}; pzMedidas.forEach(m=>{ (medPorColor[m.color]=medPorColor[m.color]||[]).push({ancho:m.ancho, alto:m.alto, cantidad:m.cantidad}); });
  Object.keys(medPorColor).forEach(c=>{ const r = hojasParaCortesCombinado(medPorColor[c], 122, 244); const it = itemByName('Melamina '+c); if(it && r.costo>0) out[it.id]=(out[it.id]||0)+r.costo; });
  return Object.keys(out).filter(k=>out[k]>0.00049).map(k=>({itemId:k, cantidad:fmtNum(out[k])}));
}
function pzResumenHtml(){
  const pool = pzPool(), cons = pzConsumo();
  if(!pool.length && !pzMedidas.length) return '<p class="hint">Todavía no capturas piezas.</p>';
  return `<div class="hint" style="margin:0 0 6px">${pool.map(p=>`${p.cantidad} × ${p.label} · ${p.grupo===AUD_GRUPO_MDF?'MDF':p.grupo}`).concat(pzMedidasDetalle()).join('<br>')}</div>
    <div class="movlist">${cons.map(c=>{ const it=CATALOGO.find(i=>i.id===c.itemId); const f=calcFormula(it.id); const m=pzModo==='merma'||pzModo==='reg', rc=pzModo==='recon';
      return `<div class="movitem"><span><span class="invname">${it.nombre}</span>${pzModo==='merma'?`<span class="hint" style="display:block;margin:2px 0 0">Hay ${fmtNum(f.cortado)} ya cortadas</span>`:''}</span><strong class="${rc?'':(m?'neg':'pos')}">${rc?'= ':(m?'−':'+')}${fmtNum(c.cantidad)} ${it.unidad}${rc?' en piezas':''}</strong></div>`; }).join('')}</div>`;
}
function setPz(g, key, val){
  const n = val==='' ? 0 : Number(val);
  pzVals[g] = pzVals[g]||{};
  if(!(n>0)) delete pzVals[g][key]; else pzVals[g][key] = n;
  if(!Object.keys(pzVals[g]).length) delete pzVals[g];
  const r = document.getElementById('pz-resumen'); if(r) r.innerHTML = pzResumenHtml();
}
function sumarPz(g, key){
  const p = PIEZAS_AUDIT.find(x=>x.key===key); if(!p) return;
  const actual = ((pzVals[g]||{})[key])||0;
  const v = prompt(`➕ ¿Cuántas piezas más de ${p.label}?\n\nLlevas ${actual}. Lo que escribas se SUMA.`);
  if(v===null || String(v).trim()==='') return;
  const n = Number(v); if(!isFinite(n)) return alert('Escribe solo el número.');
  setPz(g, key, String(actual+n)); renderPzEnc();
}
function renderPzEnc(){
  if(esSoloLectura()){ $('#main').innerHTML = '<div class="card">Tu cuenta es de solo lectura.</div>'; return; }
  if(!pzGrupo) pzGrupo = MEL_COLORES[0];
  const esMDF = pzGrupo===AUD_GRUPO_MDF;
  const lista = PIEZAS_AUDIT.filter(p=>p.tipo===(esMDF?'mdf':'mel'));
  const counts = pzVals[pzGrupo]||{};
  const opciones = MEL_COLORES.map(c=>{ const n=Object.keys(pzVals[c]||{}).length + pzMedidas.filter(m=>m.color===c).length; return `<option value="${c}" ${c===pzGrupo?'selected':''}>Melamina ${c}${n?' ✓'+n:''}</option>`; }).join('')
    + (()=>{ const n=Object.keys(pzVals[AUD_GRUPO_MDF]||{}).length; return `<option value="${AUD_GRUPO_MDF}" ${esMDF?'selected':''}>MDF (fondos de cajón/cajonera)${n?' ✓'+n:''}</option>`; })();
  const esMerma = pzModo==='merma', esReg = pzModo==='reg';
  if(esReg){ const it=CATALOGO.find(i=>i.id===regPzItem); if(it){ pzGrupo = it.cat==='MDF' ? AUD_GRUPO_MDF : it.nombre.replace(/^Melamina /,''); } }
  $('#main').innerHTML = (esReg ? `<div class="card" style="border:2px solid #e0791a">
      <div style="font-size:17px;font-weight:800">✂️ Piezas dañadas del regreso</div>
      <p class="hint">Cuenta solo las piezas de <strong>${(CATALOGO.find(i=>i.id===regPzItem)||{}).nombre||''}</strong> que vienen dañadas. La app las convierte a hojas y eso se va a merma; lo demás regresa al inventario.</p>
      <button class="btn small" style="background:transparent;color:var(--bad);border:1px solid var(--line);box-shadow:none" onclick="volverRegreso()">Cancelar</button>
    </div>` : esMerma ? `<div class="card" style="border:2px solid #e0791a">
      <div style="font-size:17px;font-weight:800">⚠️ Merma de piezas cortadas · ${modulo()}</div>
      <p class="hint">Piezas ya cortadas que <strong>se dañaron</strong> y ya no sirven. La app las convierte a hojas con los mismos rendimientos del despiece y las <strong>SACA</strong> del material cortado de su color como merma.</p>
      <button class="btn small" style="background:transparent;color:var(--bad);border:1px solid var(--line);box-shadow:none" onclick="pzSetModo('enc');irA('mov')">Cancelar</button>
    </div>` : `<div class="card" style="border:2px solid #0e8a8a">
      <div style="font-size:17px;font-weight:800">✂️ Piezas encontradas · ${modulo()}</div>
      <p class="hint">Piezas ya cortadas que <strong>no estaban en el inventario</strong> (sobrante que nunca se contó). La app las convierte a hojas con los mismos rendimientos del despiece y las <strong>SUMA</strong> al material cortado de su color.</p>
      <p class="hint" style="margin:4px 0 0">No es para lo que regresó de una instalación (eso va en ↩️ Regresó un modelo completo o en 🧩 Sobrantes).</p>
    </div>`) + `
    <div class="card" style="${esReg?'display:none':''}">
      <div class="paso">1</div><strong>¿De qué color?</strong>
      <select onchange="pzGrupo=this.value;renderPzEnc()" style="margin-top:8px">${opciones}</select>
      <p class="hint" style="margin-top:6px">Puedes capturar varios colores: cambia el color y sigue; lo de cada color se guarda.</p>
    </div>
    <div class="card">
      <div class="paso">2</div><strong>¿Cuántas piezas ${esMerma?'dañadas ':''}de cada una?</strong>
      ${listaPiezasHtml('pz')}
    </div>
    ${esMDF?'':pzMedidasHtml()}
    <div class="card">
      <div class="paso">3</div><strong>${esMerma||esReg?'Esto se va a merma':'Esto se suma al inventario'}</strong>
      <div id="pz-resumen" style="margin-top:8px">${pzResumenHtml()}</div>
      <input id="pz-nota" placeholder="${esMerma?'¿Qué pasó? (opcional)':'¿Dónde estaban? (opcional)'}" value="${String(pzNota).replace(/"/g,'&quot;')}" oninput="pzNota=this.value" style="margin-top:10px">
      ${esMerma?fotoPickerHtml('merma','Foto de lo dañado (opcional)'):''}
      ${esReg?`<button class="btn" style="margin-top:12px;width:100%;min-height:54px;font-size:16px;background:linear-gradient(135deg,#e0791a,#c0620f)" onclick="usarPiezasRegreso()">✅ Usar estas piezas como merma</button>`:`<button class="btn" style="margin-top:12px;width:100%;min-height:54px;font-size:16px;background:${esMerma?'linear-gradient(135deg,#e0791a,#c0620f)':'linear-gradient(135deg,#0e8a8a,#0b6f6f)'}" onclick="guardarPzEnc()">${esMerma?'⚠️ Registrar merma':'✅ Sumar al inventario'}</button>`}
    </div>`;
}
async function guardarPzEnc(){
  const pool = pzPool(), cons = pzConsumo();
  if((!pool.length && !pzMedidas.length) || !cons.length) return alert('Primero escribe cuántas piezas encontraste.');
  const detalle = pool.map(p=>`${p.cantidad} × ${p.label} (${p.dim}) · ${p.grupo===AUD_GRUPO_MDF?'MDF':p.grupo}`).concat(pzMedidasDetalle());
  if(pzModo==='merma') return guardarMermaPiezas(cons, detalle);
  if(!confirm(`✂️ Sumar piezas encontradas a ${modulo()}:\n\n${detalle.join('\n')}\n\nEquivale a:\n${cons.map(c=>{ const it=CATALOGO.find(i=>i.id===c.itemId); return `+ ${fmtNum(c.cantidad)} ${it.unidad} ${it.nombre} (cortado)`; }).join('\n')}\n\n¿Guardar?`)) return;
  try{
    const estado = estadoNuevoMovimiento(), creadoPor = getCurrentUserEmail?getCurrentUserEmail():'', fecha = new Date().toISOString(), loteId = cryptoId();
    const nota = 'Piezas encontradas'+(pzNota.trim()?' · '+pzNota.trim():'');
    for(const c of cons){ const it = CATALOGO.find(i=>i.id===c.itemId);
      await db.collection('movimientos').doc(cryptoId()).set({modulo:modulo(), itemId:it.id, itemNombre:it.nombre, tipo:'devolucion', motivo:'piezasEncontradas', cantidad:c.cantidad, nota, piezasDetalle:detalle, fecha, estado, loteId, creadoPor});
    }
    pzVals = {}; pzNota = ''; pzMedidas = [];
    toast(estado==='pendiente' ? '✅ Guardado.<br><small>Dirección lo aprueba y se suma al inventario.</small>' : '✅ Piezas sumadas al inventario.');
    renderPzEnc(); window.scrollTo(0,0);
  }catch(e){ alert('Error: '+e.message); }
}

// ===== Reconteo de verificación (confirmado por el usuario) =====
// Volver a contar SOLO un material de una auditoría (p. ej. el MDF) para saber si el conteo estuvo bien.
// Se compara contra lo que se contó en la auditoría, sumando lo que se movió desde entonces (lo que dice
// el inventario ahora − lo que decía el día de la auditoría). No cambia el inventario. Si no coincide,
// Dirección puede corregir la auditoría (aún sin aplicar) con el reconteo.
let reconAudId = null, reconCat = 'MDF', reconVals = {}, reconRes = null;
function iniciarReconteo(audId){
  reconAudId = audId; reconCat = 'MDF'; reconVals = {}; reconRes = null;
  pzSetModo('recon'); pzVals = {}; pzMedidas = []; pzGrupo = AUD_GRUPO_MDF; piezasBuscar = '';
  setView('recon'); window.scrollTo(0,0);
}
function reconItems(){ return CATALOGO.filter(i=>i.cat===reconCat && !esCorrSuelta(i)); }
function reconCambiarCat(c){ reconCat = c; reconVals = {}; reconRes = null; pzVals = {}; pzMedidas = []; pzGrupo = c==='MDF' ? AUD_GRUPO_MDF : MEL_COLORES[0]; renderRecon(); }
function renderRecon(){
  if(!esAdmin()){ $('#main').innerHTML='<div class="card">Solo Dirección.</div>'; return; }
  const a = auditorias.find(x=>x.id===reconAudId);
  if(!a){ $('#main').innerHTML='<div class="card">No se encontró la auditoría. <button class="btn small" onclick="histTab=\'aud\';setView(\'hist\')">Volver</button></div>'; return; }
  const cats = [...new Set(CATALOGO.map(i=>i.cat))];
  const items = reconItems(), hoja = items.length && esHoja(items[0]);
  const fechaA = new Date(a.fecha).toLocaleString('es-MX',{weekday:'short', day:'numeric', month:'short', hour:'numeric', minute:'2-digit'});
  const grupoSel = reconCat==='MDF' ? '' : `<label class="hint">Color de las piezas</label><select onchange="pzGrupo=this.value;renderRecon()" style="margin-top:4px;font-weight:700">${MEL_COLORES.map(c=>{ const n=Object.keys(pzVals[c]||{}).length; return `<option value="${c}" ${c===pzGrupo?'selected':''}>Melamina ${c}${n?' ✓'+n:''}</option>`; }).join('')}</select>`;
  $('#main').innerHTML = `<div class="card" style="border:2px solid #6b4bd6">
      <div style="font-size:17px;font-weight:800">🔍 Volver a contar un material</div>
      <p class="hint" style="margin:6px 0 0">Auditoría del <strong>${fechaA}</strong> (${a.auditor||'—'})${a.aplicada?' · ya aplicada':' · sin aplicar'}.</p>
      <p class="hint" style="margin:4px 0 0">Cuenta otra vez solo este material. La app lo compara con lo que se contó en la auditoría, tomando en cuenta lo que entró o salió desde entonces. <strong>No cambia el inventario.</strong></p>
      <button class="btn small" style="margin-top:8px;background:transparent;color:var(--bad);border:1px solid var(--line);box-shadow:none" onclick="pzSetModo('enc');histTab='aud';setView('hist')">Cancelar</button>
    </div>
    <div class="card"><div class="paso">1</div><strong>¿Qué material?</strong>
      <select style="margin-top:8px" onchange="reconCambiarCat(this.value)">${cats.map(c=>`<option ${c===reconCat?'selected':''}>${c}</option>`).join('')}</select></div>
    <div class="card"><div class="paso">2</div><strong>${hoja?'Hojas completas':'¿Cuánto hay?'}</strong>
      <p class="hint">Escribe solo lo que vuelves a contar. Lo que dejes vacío no se compara.${reconCat==='Herrajes'?' Correderas: cuenta los juegos completos (hembra + macho).':''}</p>
      <div class="movlist">${items.map(it=>`<label class="movitem"><span class="invname">${it.nombre}</span><input type="number" min="0" inputmode="decimal" placeholder="—" value="${reconVals[it.id]??''}" oninput="reconVals['${it.id}']=this.value"></label>`).join('')}</div></div>
    ${hoja?`<div class="card"><div class="paso">3</div><strong>✂️ Piezas cortadas${reconCat==='MDF'?' (fondos)':''}</strong>
      <p class="hint">Cuenta las piezas ya cortadas de este material; la app las convierte a hojas.</p>${grupoSel}
      ${listaPiezasHtml('pz')}
      <div id="pz-resumen" style="margin-top:8px">${pzResumenHtml()}</div></div>`:''}
    <div class="card"><button class="btn" style="width:100%;min-height:54px;font-size:16px;background:linear-gradient(135deg,#6b4bd6,#5338b8)" onclick="compararReconteo()">🔍 Comparar con la auditoría</button></div>
    <div id="recon-res">${reconRes?reconResHtml(a):''}</div>`;
}
function compararReconteo(){
  const a = auditorias.find(x=>x.id===reconAudId); if(!a) return;
  const eq = {}; pzConsumo().forEach(c=>{ eq[c.itemId] = Number(c.cantidad)||0; });
  const filas = reconItems().filter(it=>(reconVals[it.id]!==undefined && reconVals[it.id]!=='') || eq[it.id]).map(it=>{
    const r = (a.resultados||[]).find(x=>x.itemId===it.id) || {teorico:0, fisico:0};
    const f = calcFormula(it.id), hoja = esHoja(it);
    const comp = Number(reconVals[it.id])||0, cort = fmtNum(eq[it.id]||0), total = fmtNum(comp+cort);
    const mov = a.aplicada ? fmtNum(f.final - Number(r.fisico)) : fmtNum(f.final - Number(r.teorico));
    const esperado = fmtNum(Number(r.fisico) + mov);
    const x = {itemId:it.id, nombre:it.nombre, unidad:it.unidad, hoja, teoAud:Number(r.teorico), fisAud:Number(r.fisico), mov, esperado, total, comp, cort, dif:fmtNum(total-esperado)};
    if(hoja && r.teoricoCompletas!==undefined && !a.aplicada){
      x.movComp = fmtNum(f.completas - Number(r.teoricoCompletas)); x.movCort = fmtNum(f.cortado - Number(r.teoricoCortado));
      x.espComp = fmtNum(Number(r.fisicoCompletas) + x.movComp); x.espCort = fmtNum(Number(r.fisicoCortado) + x.movCort);
      x.difComp = fmtNum(comp - x.espComp); x.difCort = fmtNum(cort - x.espCort);
    }
    return x;
  });
  if(!filas.length) return alert('Escribe lo que volviste a contar (hojas o piezas).');
  reconRes = filas;
  const el = document.getElementById('recon-res'); if(el){ el.innerHTML = reconResHtml(a); el.scrollIntoView({behavior:'smooth', block:'start'}); }
}
function reconResHtml(a){
  const filas = reconRes||[]; const ok = filas.every(x=>Math.abs(x.dif)<0.01);
  const sg = v => `<span class="${v<0?'neg':(v>0?'pos':'')}">${v>0?'+':''}${fmtNum(v)}</span>`;
  return `<div class="card" style="border:2px solid ${ok?'#1f9d55':'#e0453f'}">
    <div style="font-size:16px;font-weight:800">${ok?'✅ La auditoría estuvo bien':'⚠️ El reconteo no coincide con la auditoría'}</div>
    ${filas.map(x=>`<div style="margin-top:10px;padding:10px 12px;border-radius:12px;background:rgba(127,127,127,.08)">
      <strong>${x.nombre}</strong>
      <div class="movlist" style="margin-top:6px">
        <div class="movitem" style="padding:6px 10px"><span>Se contó en la auditoría</span><strong>${fmtNum(x.fisAud)}</strong></div>
        <div class="movitem" style="padding:6px 10px"><span>Entró / salió desde entonces</span><strong>${sg(x.mov)}</strong></div>
        <div class="movitem" style="padding:6px 10px"><span>Debería haber hoy</span><strong>${fmtNum(x.esperado)}</strong></div>
        <div class="movitem" style="padding:6px 10px"><span>Reconteo de hoy</span><strong>${fmtNum(x.total)}</strong></div>
        <div class="movitem" style="padding:6px 10px"><span>Diferencia</span><strong>${sg(x.dif)} ${x.unidad}</strong></div>
      </div>
      ${x.espComp!==undefined?`<p class="hint" style="margin:6px 0 0">Completas: debería ${fmtNum(x.espComp)} · contaste ${fmtNum(x.comp)} (${sg(x.difComp)})<br>Cortado: debería ${fmtNum(x.espCort)} · contaste ${fmtNum(x.cort)} (${sg(x.difCort)})</p>`:''}
      <p class="hint" style="margin:6px 0 0">${Math.abs(x.dif)<0.01?'Coincide con la auditoría.':(x.dif>0?`La auditoría contó <strong>${fmtNum(x.dif)} de menos</strong>: el faltante real es menor.`:`La auditoría contó <strong>${fmtNum(-x.dif)} de más</strong>: el faltante real es mayor.`)}</p>
      ${Math.abs(x.dif)>=0.01?`<p class="hint" style="margin:2px 0 0">Con el reconteo, la diferencia de la auditoría quedaría en <strong>${sg(fmtNum(x.total - x.mov - x.teoAud))}</strong> (antes ${sg(fmtNum(x.fisAud - x.teoAud))}).</p>`:''}
    </div>`).join('')}
    <button class="btn" style="width:100%;min-height:50px;margin-top:12px;background:transparent;color:var(--brand);border:1px solid var(--line);box-shadow:none" onclick="guardarReconteo(false)">💾 Guardar el reconteo (no cambia nada)</button>
    ${!ok && !a.aplicada?`<button class="btn" style="width:100%;min-height:54px;margin-top:8px;background:linear-gradient(135deg,#6b4bd6,#5338b8)" onclick="guardarReconteo(true)">✏️ Corregir la auditoría con este reconteo</button>
    <p class="hint" style="margin:6px 0 0">Cambia lo contado de estos artículos en la auditoría (todavía sin aplicar), restando lo que se movió desde entonces. El inventario no se toca hasta que apliques la auditoría.</p>`:''}
    ${!ok && a.aplicada?'<p class="hint" style="margin:8px 0 0">La auditoría ya está aplicada: si el reconteo es el correcto, ajusta con una nueva auditoría de este material.</p>':''}
  </div>`;
}
async function guardarReconteo(corregir){
  const a = auditorias.find(x=>x.id===reconAudId); if(!a || !reconRes) return;
  const ok = reconRes.every(x=>Math.abs(x.dif)<0.01);
  if(corregir && !confirm('✏️ Corregir la auditoría con el reconteo:\n\n'+reconRes.filter(x=>Math.abs(x.dif)>=0.01).map(x=>`• ${x.nombre}: contado ${fmtNum(x.fisAud)} → ${fmtNum(fmtNum(x.total - x.mov))}`).join('\n')+'\n\nEl inventario no cambia hasta que apliques la auditoría. ¿Continuar?')) return;
  const reg = {fecha:new Date().toISOString(), por:getCurrentUserEmail?getCurrentUserEmail():'', cat:reconCat, ok, corrigio:!!corregir,
    filas:reconRes.map(x=>({itemId:x.itemId, nombre:x.nombre, fisAud:x.fisAud, mov:x.mov, esperado:x.esperado, reconteo:x.total, dif:x.dif}))};
  const upd = {reconteos:[...(a.reconteos||[]), reg]};
  if(corregir){
    const res = (a.resultados||[]).map(r=>({...r}));
    reconRes.forEach(x=>{
      let r = res.find(z=>z.itemId===x.itemId);
      if(!r){ const it=CATALOGO.find(i=>i.id===x.itemId); r = {itemId:x.itemId, nombre:it.nombre, cat:it.cat, unidad:it.unidad, teorico:0, fisico:0, diff:0}; res.push(r); }
      r.fisico = fmtNum(x.total - x.mov); r.diff = fmtNum(r.fisico - Number(r.teorico)); r.capturado = true; r.recontado = true;
      if(x.espComp!==undefined){
        r.fisicoCompletas = fmtNum(x.comp - x.movComp); r.fisicoCortado = fmtNum(x.cort - x.movCort);
        r.diffCompletas = fmtNum(r.fisicoCompletas - Number(r.teoricoCompletas)); r.diffCortado = fmtNum(r.fisicoCortado - Number(r.teoricoCortado));
        r.hojasCompletas = r.fisicoCompletas; r.hojasEnPiezas = r.fisicoCortado;
      }
    });
    upd.resultados = res; upd.totalDiff = res.filter(r=>Math.abs(Number(r.diff)||0)>0.005).length;
    // Piezas: lo recontado reemplaza lo que se había contado de ese material
    const esMat = g => reconCat==='MDF' ? g==='MDF' : (reconCat==='Melamina' ? /^Melamina /.test(g) : false);
    const nuevas = [];
    Object.keys(pzVals).forEach(g=>Object.keys(pzVals[g]).forEach(k=>{ const pz=PIEZAS_AUDIT.find(x=>x.key===k); if(pz) nuevas.push({grupo:g===AUD_GRUPO_MDF?'MDF':'Melamina '+g, pieza:pz.label, dim:pz.dim, cantidad:pzVals[g][k], recontado:true}); }));
    if(nuevas.length || reconCat==='MDF' || reconCat==='Melamina') upd.piezasContadas = (a.piezasContadas||[]).filter(pc=>!esMat(pc.grupo)).concat(nuevas);
  }
  try{
    await db.collection('auditorias').doc(a.id).update(upd);
    Object.assign(a, upd);
    toast(corregir ? '✏️ Auditoría corregida con el reconteo.' : '💾 Reconteo guardado.');
    pzSetModo('enc'); reconRes = null; histTab='aud'; setView('hist');
  }catch(e){ alert('Error: '+e.message); }
}

async function guardarMermaPiezas(cons, detalle){
  for(const c of cons){ const f=calcFormula(c.itemId); const it=CATALOGO.find(i=>i.id===c.itemId);
    if(c.cantidad > f.cortado + 1e-9) return alert(`No alcanza: de ${it.nombre} hay ${fmtNum(f.cortado)} hojas ya cortadas y las piezas equivalen a ${fmtNum(c.cantidad)}.\n\nRevisa las piezas. No se guardó nada.`); }
  if(!confirm(`⚠️ Merma de piezas cortadas en ${modulo()}:\n\n${detalle.join('\n')}\n\nEquivale a:\n${cons.map(c=>{ const it=CATALOGO.find(i=>i.id===c.itemId); return `− ${fmtNum(c.cantidad)} ${it.unidad} ${it.nombre} (de cortado)`; }).join('\n')}\n\n¿Guardar?`)) return;
  try{
    const estado = estadoNuevoMovimiento(), creadoPor = getCurrentUserEmail?getCurrentUserEmail():'', fecha = new Date().toISOString(), loteId = cryptoId();
    const nota = 'Merma de piezas'+(pzNota.trim()?' · '+pzNota.trim():'');
    const fotos = (fotosTmp.merma||[]).length;
    for(const c of cons){ const it = CATALOGO.find(i=>i.id===c.itemId);
      await db.collection('movimientos').doc(cryptoId()).set({modulo:modulo(), itemId:it.id, itemNombre:it.nombre, tipo:'merma', lado:'cortado', motivo:'mermaPiezas', cantidad:c.cantidad, nota, piezasDetalle:detalle, fecha, estado, loteId, creadoPor, ...(fotos?{fotos, fotosRef:loteId}:{})});
    }
    if(fotos) await guardarFotos('merma', 'merma', loteId, modulo());
    pzVals = {}; pzNota = ''; pzMedidas = []; pzModo = 'enc';
    toast(estado==='pendiente' ? '✅ Merma guardada.<br><small>Dirección la aprueba y se descuenta.</small>' : '⚠️ Merma registrada.');
    irA('mov'); window.scrollTo(0,0);
  }catch(e){ alert('Error: '+e.message); }
}

// ===== Valor de las instalaciones (confirmado por el usuario) =====
// Cada modelo tiene su valor (lo captura Dirección). Una instalación que regresó completa ya no vale;
// las garantías no restan. La semana de instalaciones va de SÁBADO a VIERNES.
let valoresInst = null; // {clave:{n, max}}
// Meta semanal de cada módulo (confirmado por el usuario): 96 por semana; Saltillo y Guadalajara 72.
const METAS_DEFAULT = {Saltillo:72, Guadalajara:72};
let metasInst = {};
function metaModulo(m){ return Number(metasInst[m]) || METAS_DEFAULT[m] || 96; }
async function cargarValoresInst(){
  if(valoresInst) return valoresInst;
  try{ const d = await db.collection('config').doc('valoresInstalacion').get(); const x = (d && d.data && d.data()) || {}; valoresInst = x.valores || {}; metasInst = x.metas || {}; }catch(e){ valoresInst = {}; }
  return valoresInst;
}
function claveInstalacion(log){
  if(log.modeloKey) return log.modeloKey;
  const nom = String(log.descripcion||'').split(' · ')[0];
  if(log.categoria==='Puerta') return nom; // "Puerta Normal"
  if(/ — combinación/.test(nom)) return 'Combinación '+nom.split(' — ')[0];
  return nom.replace(/ Max$/,'');
}
function esMaxInstalacion(log){ return log.esMax!==undefined ? !!log.esMax : / Max( ·|$)/.test(String(log.descripcion||'').split(' · ')[0]+' ·'); }
// Valor de una instalación: 0 si se rechazó o regresó completa. regresadas = Set de ids que regresaron.
// Valor (confirmado por el usuario): cuenta el MODELO (familia o tipo de puerta), sin importar si
// lleva cajonera normal, Emma o Max. Cada extra (zapatera, repisa —por pieza—, entrepañera, espejo,
// cajonera) suma 0.5. Lateral/Central/Doble/Doble Especial/King 1, Triple 2; puertas normal, con pared
// falsa y con 2 paredes falsas 2, con cubos a los lados 3, con cubo al centro 5.
const VALORES_DEFAULT = {Lateral:1, Central:1, Doble:1, 'Doble Especial':1, King:1, Triple:2,
  'Puerta Normal':2, 'Puerta Con pared falsa':2, 'Puerta Con dos paredes falsas':2, 'Puerta Con cubos a los lados':3, 'Puerta Con cubo al centro':5};
const VALOR_EXTRA_DEFAULT = 0.5;
function grupoValor(clave){
  if(/^Puerta /.test(clave)) return clave;
  if(/^Combinación /.test(clave)) return clave.replace(/^Combinación /,'');
  const m = MODELOS.find(x=>x.nombre===clave); return m ? m.fam : clave;
}
function valorDe(grupo){ const v = valoresInst && valoresInst[grupo]; return (v!==undefined && v!==null && v!=='') ? Number(v)||0 : (VALORES_DEFAULT[grupo]||0); }
function valorExtra(){ const v = valoresInst && valoresInst._extra; return (v!==undefined && v!==null && v!=='') ? Number(v)||0 : VALOR_EXTRA_DEFAULT; }
// Cuenta como instalación: no rechazada, no regresó completa, no se cambió por otro modelo (aprobado),
// y si es un cambio de modelo, ya está aprobado (mientras tanto sigue contando la original).
function instCuenta(log, regresadas){
  return log.estado!=='rechazado' && !(regresadas && regresadas.has(log.id)) && !log.cambiadaPor && !(log.cambioDe && log.estado==='pendiente');
}
// Texto de los extras de una instalación (confirmado por el usuario: que se vea qué extra sumó).
function describirExtra(a){
  return (TIPOS_ADICIONAL[a.tipo]||a.tipo).replace(' (cantidad libre)','')
    + (a.tipo==='cajonera'?' de '+a.cajones+' cajones':'')
    + (a.tipo==='repisa'?' ×'+(Number(a.cantidad)||1):'')
    + (a.conPuerta?(a.tipo==='zapatera'?' con puerta':' con puertitas'):'')
    + (a.tipo!=='piso_zoclo' && a.color ? ' '+a.color : '');
}
function extrasLogHtml(log){
  const n = Number(log.extras)||0; if(!n && !(log.extrasDetalle||[]).length) return '';
  const txt = (log.extrasDetalle||[]).length ? log.extrasDetalle.join(', ') : n+' extra'+(n===1?'':'s');
  return `<div style="margin-top:3px;font-size:12.5px;color:var(--sub)">➕ ${txt}</div>`;
}
function valorDetalleTxt(log){
  const base = valorDe(grupoValor(claveInstalacion(log))), n = Number(log.extras)||0;
  return n ? `${fmtNum(base)} del modelo + ${n} extra${n===1?'':'s'} × ${fmtNum(valorExtra())}` : '';
}
function valorInstalacion(log, regresadas){
  if(!instCuenta(log, regresadas)) return 0;
  return valorDe(grupoValor(claveInstalacion(log))) + (Number(log.extras)||0)*valorExtra();
}
function regresadasDe(movsList){ return new Set(movsList.filter(m=>m.motivo==='regresoInstalacion' && m.instalacionId && m.estado!=='rechazado').map(m=>m.instalacionId)); }
// Semana sábado → viernes: devuelve el sábado (YYYY-MM-DD) de la semana de esa fecha.
function sabadoDe(ymd){ const d = new Date(ymd+'T12:00:00'); d.setDate(d.getDate() - ((d.getDay()+1)%7)); return d.toISOString().slice(0,10); }
function finSemana(sab){ const d = new Date(sab+'T12:00:00'); d.setDate(d.getDate()+6); return d.toISOString().slice(0,10); }
const fCorta = ymd => new Date(ymd+'T12:00:00').toLocaleDateString('es-MX',{weekday:'short', day:'numeric', month:'short'});
function gruposValorInst(){
  return [...new Set(MODELOS.map(m=>m.fam))].concat(Object.keys(TIPOS_PUERTA).map(t=>'Puerta '+t));
}
let valEdit = null;
async function renderValInst(){
  if(!esAdmin()){ $('#main').innerHTML='<div class="card">Solo Dirección.</div>'; return; }
  await cargarValoresInst();
  if(!valEdit){ valEdit = {}; gruposValorInst().forEach(g=>valEdit[g]=valorDe(g)); valEdit._extra = valorExtra(); }
  const fila = (k, txt) => `<div class="movitem" style="padding:8px 10px;gap:8px"><span style="flex:1;min-width:0">${txt}</span><input type="number" min="0" step="0.5" inputmode="decimal" value="${valEdit[k]}" style="width:80px;min-width:80px;text-align:center" oninput="valEdit['${k}']=this.value===''?0:Number(this.value)"></div>`;
  const fams = [...new Set(MODELOS.map(m=>m.fam))];
  $('#main').innerHTML = `<div class="card">
      <div style="font-size:17px;font-weight:800">⭐ Valor de cada modelo</div>
      <p class="hint">Cuenta el modelo, sin importar si lleva cajonera normal, Emma o Max. Cada extra (zapatera, repisa, entrepañera, espejo o cajonera) suma aparte; las repisas cuentan por pieza. Semana de sábado a viernes. Una instalación que regresó completa no cuenta; las garantías no restan.</p>
      <p class="hint" style="margin:0">Ejemplo: Lateral + 1 zapatera + 1 repisa = 1 + 0.5 + 0.5 = <strong>2</strong>.</p>
    </div>
    <div class="card"><strong>🗄️ Muebles</strong><div class="movlist" style="margin-top:8px">${fams.map(f=>fila(f, f+' <span class="hint" style="margin:0">(todas sus versiones)</span>')).join('')}</div></div>
    <div class="card"><strong>🚪 Puertas corredizas</strong><div class="movlist" style="margin-top:8px">${Object.keys(TIPOS_PUERTA).map(t=>fila('Puerta '+t, t)).join('')}</div></div>
    <div class="card"><strong>➕ Extras</strong><div class="movlist" style="margin-top:8px">${fila('_extra','Cada extra <span class="hint" style="margin:0">(zapatera, repisa, entrepañera, espejo, cajonera)</span>')}</div></div>
    <details class="card"><summary><strong>🎯 Meta semanal por módulo</strong> <span class="hint" style="margin:0">(sábado a viernes)</span></summary>
      <p class="hint">Valor de instalaciones que cada módulo tiene que hacer por semana para estar en el rango óptimo.</p>
      <div class="movlist" style="margin-top:8px">${MODULOS.map(m=>`<div class="movitem" style="padding:8px 10px"><span style="flex:1">${m.nombre}</span><input id="meta-${m.nombre}" type="number" min="0" inputmode="decimal" value="${metaModulo(m.nombre)}" style="width:80px;min-width:80px;text-align:center"></div>`).join('')}</div>
    </details>
    <div class="card"><button class="btn" style="width:100%;min-height:52px" onclick="guardarValInst()">✅ Guardar valores</button></div>`;
}
async function guardarValInst(){
  try{
    const limpio = {}; Object.keys(valEdit||{}).forEach(k=>{ limpio[k] = Number(valEdit[k])||0; });
    const metas = {}; MODULOS.forEach(m=>{ const el=document.getElementById('meta-'+m.nombre); const v=el?Number(el.value):0; if(v>0) metas[m.nombre]=v; });
    await db.collection('config').doc('valoresInstalacion').set({modulo:'_global', valores:limpio, metas, fecha:new Date().toISOString()});
    valoresInst = limpio; metasInst = metas; valEdit = null; resumenCache = null;
    toast('✅ Valores guardados.'); setView('resumen');
  }catch(e){ alert('Error: '+e.message); }
}

// Tarjeta en Reportes: instalaciones de esta semana y la pasada (sábado a viernes) del módulo.
async function repInstalacionesSemana(){
  const el = document.getElementById('rep-inst'); if(!el) return;
  await cargarInstLog(); await cargarValoresInst();
  const regresadas = regresadasDe(movs);
  const hoy = fechaHoyLocal(), sab = sabadoDe(hoy);
  const sabP = (()=>{ const d=new Date(sab+'T12:00:00'); d.setDate(d.getDate()-7); return d.toISOString().slice(0,10); })();
  const sem = (desde, hasta) => { const xs = instLog.filter(x=>{ const f=x.fechaDia||diaLocal(x.fecha); return f>=desde && f<=hasta && x.estado!=='rechazado'; });
    const vale = xs.filter(x=>instCuenta(x, regresadas)); return {n:vale.length, reg:xs.length-vale.length, valor:xs.reduce((s,x)=>s+valorInstalacion(x,regresadas),0)}; };
  const a = sem(sab, hoy), b = sem(sabP, finSemana(sabP));
  const fila = (t, r, rango) => `<div class="movitem" style="padding:8px 10px"><span>${t}<span class="hint" style="display:block;margin:0">${rango}</span></span><strong>${fmtNum(r.valor)}</strong></div>`;
  el.innerHTML = `<strong>🔧 Instalaciones de ${modulo()}</strong>
    <p class="hint" style="margin:4px 0 0">Semana de sábado a viernes. El desglose está en Instalaciones.</p>
    <div class="movlist" style="margin-top:8px">${fila('Esta semana', a, fCorta(sab)+' – hoy')}${fila('Semana pasada', b, fCorta(sabP)+' – '+fCorta(finSemana(sabP)))}</div>
    ${esAdmin()?`<button class="btn small" style="margin-top:8px;background:transparent;color:#b38a1e;border:1px solid var(--line);box-shadow:none" onclick="valEdit=null;irA('valinst')">⭐ Valor de cada modelo</button>`:''}`;
}

// ===== Gasolina (confirmado por el usuario) =====
// Cada módulo tiene un presupuesto semanal (sábado a viernes, se reinicia cada semana) que captura
// Dirección. Los coordinadores registran cada carga: día, carro, instalador y cuánto en pesos (con foto
// del ticket opcional); se descuenta del presupuesto al momento (no requiere aprobación). Los carros y
// los instaladores de cada módulo los da de alta Dirección; el coordinador solo los elige.
let gasConfig = null, gasCache = null, gasSemana = 'esta', gasEditCfg = false, gasForm = {fecha:'', carro:'', instalador:'', monto:'', nota:''};
const fmtPesos = n => '$'+(Number(n)||0).toLocaleString('es-MX',{minimumFractionDigits:0, maximumFractionDigits:2});
async function cargarGasConfig(){
  if(gasConfig) return gasConfig;
  try{ const d = await db.collection('config').doc('gasolina').get(); const x = (d && d.data && d.data()) || {}; gasConfig = {presupuestos:x.presupuestos||{}, carros:x.carros||{}, instaladores:x.instaladores||{}}; }
  catch(e){ gasConfig = {presupuestos:{}, carros:{}, instaladores:{}}; }
  return gasConfig;
}
function gasRango(cual){
  const hoy = fechaHoyLocal(), sab = sabadoDe(hoy);
  if(cual==='pasada'){ const d=new Date(sab+'T12:00:00'); d.setDate(d.getDate()-7); const s0=d.toISOString().slice(0,10); return {desde:s0, hasta:finSemana(s0), txt:'Semana pasada'}; }
  return {desde:sab, hasta:finSemana(sab), txt:'Esta semana'};
}
async function cargarGas(){
  if(gasCache) return gasCache;
  try{ const snap = await db.collection('gasolina').get(); gasCache = snap.docs.map(d=>({id:d.id, ...d.data()})).filter(g=>g.estado!=='borrado'); }catch(e){ gasCache = []; }
  return gasCache;
}
function gasDeModulo(mod, rg, lista){ return (lista||[]).filter(g=>g.modulo===mod && g.fechaDia>=rg.desde && g.fechaDia<=rg.hasta); }
async function renderGas(){
  await cargarGasConfig(); await cargarGas();
  const mod = modulo(), cfg = gasConfig;
  if(gasEditCfg && esAdmin()) return renderGasConfig();
  const rg = gasRango(gasSemana), lista = gasDeModulo(mod, rg, gasCache).sort((a,b)=>(b.fechaDia||'').localeCompare(a.fechaDia||'')||(b.fecha||'').localeCompare(a.fecha||''));
  const pres = Number(cfg.presupuestos[mod])||0, gastado = lista.reduce((s,g)=>s+(Number(g.monto)||0),0), queda = pres - gastado;
  const pct = pres ? Math.min(100, gastado/pres*100) : 0, col = !pres ? '#888' : (gastado>pres ? '#e0453f' : (pct>=80 ? '#e3b341' : '#1f9d55'));
  const carros = cfg.carros[mod]||[], inst = cfg.instaladores[mod]||[];
  if(!gasForm.fecha) gasForm.fecha = fechaHoyLocal();
  const puede = !esSoloLectura();
  const porCarro = {}, porInst = {}; lista.forEach(g=>{ porCarro[g.carro]=(porCarro[g.carro]||0)+(Number(g.monto)||0); porInst[g.instalador]=(porInst[g.instalador]||0)+(Number(g.monto)||0); });
  const tablaTot = (o) => Object.keys(o).sort((a,b)=>o[b]-o[a]).map(k=>`<div class="movitem" style="padding:6px 10px"><span>${k||'—'}</span><strong>${fmtPesos(o[k])}</strong></div>`).join('');
  const porDia = {}; lista.forEach(g=>{ (porDia[g.fechaDia]=porDia[g.fechaDia]||[]).push(g); });
  $('#main').innerHTML = `<div class="card" style="border-left:6px solid ${col}">
      <div class="row" style="justify-content:space-between"><div style="font-size:17px;font-weight:800">⛽ Gasolina · ${mod}</div>${esAdmin()?`<button class="btn small" style="background:transparent;color:var(--brand);border:1px solid var(--line);box-shadow:none" onclick="gasEditCfg=true;renderGas()">⚙️ Presupuestos, carros e instaladores</button>`:''}</div>
      <div class="chips" style="margin-top:8px">${[['esta','Esta semana'],['pasada','Semana pasada']].map(([k,t])=>`<button class="chip ${k===gasSemana?'on':''}" onclick="gasSemana='${k}';renderGas()">${t}</button>`).join('')}</div>
      <p class="hint" style="margin:6px 0 0">${rg.txt}: ${fCorta(rg.desde)} – ${fCorta(rg.hasta)} (sábado a viernes)</p>
      ${pres ? `<div class="row" style="justify-content:space-between;margin-top:10px;align-items:flex-end"><span class="hint" style="margin:0">Gastado</span><span><strong style="font-size:22px">${fmtPesos(gastado)}</strong><span class="hint" style="margin:0"> de ${fmtPesos(pres)}</span></span></div>
        <div style="height:12px;border-radius:6px;background:rgba(127,127,127,.25);margin-top:6px;overflow:hidden"><div style="height:100%;width:${pct}%;background:${col}"></div></div>
        <div style="margin-top:8px;font-weight:800;font-size:16px;color:${col}">${queda>=0?`Quedan ${fmtPesos(queda)}`:`⚠️ Se pasó por ${fmtPesos(-queda)}`}</div>`
      : `<p class="hint" style="margin-top:8px">Gastado: <strong>${fmtPesos(gastado)}</strong>. ${esAdmin()?'Todavía no capturas el presupuesto semanal de este módulo (toca ⚙️).':'Dirección todavía no captura el presupuesto semanal.'}</p>`}
    </div>
    ${puede && gasSemana==='esta' ? (carros.length && inst.length ? `<div class="card">
      <strong>➕ Registrar carga de gasolina</strong>
      <div class="grid2" style="margin-top:8px">
        <div><label class="hint">Día</label><input id="gas-fecha" type="date" value="${gasForm.fecha}" max="${fechaHoyLocal()}" oninput="gasForm.fecha=this.value" style="margin-top:4px"></div>
        <div><label class="hint">¿Cuánto? (pesos)</label><input id="gas-monto" type="number" min="0" step="0.01" inputmode="decimal" placeholder="$" value="${gasForm.monto}" oninput="gasForm.monto=this.value" style="margin-top:4px"></div>
      </div>
      <label class="hint" style="display:block;margin-top:8px">Carro</label><select id="gas-carro" onchange="gasForm.carro=this.value" style="margin-top:4px"><option value="">— Elige el carro —</option>${carros.map(c=>`<option ${c===gasForm.carro?'selected':''}>${c}</option>`).join('')}</select>
      <label class="hint" style="display:block;margin-top:8px">Instalador</label><select id="gas-inst" onchange="gasForm.instalador=this.value" style="margin-top:4px"><option value="">— ¿Quién la cargó? —</option>${inst.map(c=>`<option ${c===gasForm.instalador?'selected':''}>${c}</option>`).join('')}</select>
      <input id="gas-nota" placeholder="Nota (opcional)" value="${String(gasForm.nota).replace(/"/g,'&quot;')}" oninput="gasForm.nota=this.value" style="margin-top:8px">
      ${fotoPickerHtml('gas','Foto del ticket (opcional)')}
      <button class="btn" style="width:100%;min-height:54px;margin-top:12px;background:linear-gradient(135deg,#e0791a,#c0620f)" onclick="guardarGas()">⛽ Guardar carga</button>
    </div>` : `<div class="card aviso"><strong>Faltan datos</strong><p class="hint" style="margin:4px 0 0">${esAdmin()?'Da de alta los carros y los instaladores de '+mod+' en ⚙️ para poder registrar cargas.':'Dirección todavía no da de alta los carros y los instaladores de este módulo.'}</p></div>`) : ''}
    ${lista.length ? `<div class="card"><strong>Por carro</strong><div class="movlist" style="margin-top:6px">${tablaTot(porCarro)}</div>
      <strong style="display:block;margin-top:10px">Por instalador</strong><div class="movlist" style="margin-top:6px">${tablaTot(porInst)}</div></div>
      <div class="card"><strong>Cargas (${lista.length})</strong>
      ${Object.keys(porDia).sort((a,b)=>b.localeCompare(a)).map(d=>`<div style="margin-top:10px;font-weight:700">${new Date(d+'T12:00:00').toLocaleDateString('es-MX',{weekday:'long', day:'numeric', month:'short'})} · ${fmtPesos(porDia[d].reduce((s,g)=>s+(Number(g.monto)||0),0))}</div>
        <div class="movlist" style="margin-top:4px">${porDia[d].map(g=>`<div class="movitem" style="padding:8px 10px;align-items:flex-start"><span style="min-width:0;flex:1"><strong>${g.carro}</strong> · ${g.instalador}${g.nota?`<span class="hint" style="display:block;margin:2px 0 0">${g.nota}</span>`:''}<span class="hint" style="display:block;margin:2px 0 0">${(g.creadoPor||'').split('@')[0]}${g.fotos?` · <a href="#" onclick="verFotos('${g.id}',${g.fotos},'Ticket de gasolina');return false;">📷 ticket</a>`:''}</span></span>
          <span style="text-align:right"><strong style="font-size:16px">${fmtPesos(g.monto)}</strong>${esAdmin()?`<button class="btn small" style="display:block;margin-top:4px;background:transparent;color:var(--bad);border:1px solid var(--line);box-shadow:none" onclick="borrarGas('${g.id}')">🗑️</button>`:''}</span></div>`).join('')}</div>`).join('')}
      </div>` : `<div class="card hint">No hay cargas registradas ${gasSemana==='esta'?'esta semana':'la semana pasada'}.</div>`}`;
}
async function guardarGas(){
  const f = gasForm, monto = Number(f.monto);
  if(!f.fecha) return alert('Elige el día.');
  if(f.fecha > fechaHoyLocal()) return alert('El día no puede ser después de hoy.');
  if(!f.carro) return alert('Elige el carro.');
  if(!f.instalador) return alert('Elige el instalador.');
  if(!(monto>0)) return alert('Escribe cuánto se echó de gasolina (en pesos).');
  const mod = modulo(), rg = gasRango('esta');
  const pres = Number(gasConfig.presupuestos[mod])||0, gastado = gasDeModulo(mod, rg, gasCache).reduce((s,g)=>s+(Number(g.monto)||0),0);
  const pasa = pres && f.fecha>=rg.desde && gastado + monto > pres;
  if(!confirm(`⛽ Carga de gasolina · ${mod}\n\n${new Date(f.fecha+'T12:00:00').toLocaleDateString('es-MX',{weekday:'long', day:'numeric', month:'long'})}\nCarro: ${f.carro}\nInstalador: ${f.instalador}\nMonto: ${fmtPesos(monto)}${pres&&!pasa?`\n\nQuedarían ${fmtPesos(pres-gastado-monto)} del presupuesto de la semana.`:''}${pasa?`\n\n⚠️ Con esta carga se pasa del presupuesto por ${fmtPesos(gastado+monto-pres)}.`:''}\n\n¿Guardar?`)) return;
  try{
    const id = cryptoId(), creadoPor = getCurrentUserEmail?getCurrentUserEmail():'';
    const nf = await guardarFotos('gas', 'gasolina', id, mod);
    await db.collection('gasolina').doc(id).set({modulo:mod, fechaDia:f.fecha, fecha:new Date().toISOString(), carro:f.carro, instalador:f.instalador, monto, nota:(f.nota||'').trim(), creadoPor, ...(nf?{fotos:nf}:{})});
    gasForm = {fecha:f.fecha, carro:'', instalador:'', monto:'', nota:''}; gasCache = null;
    toast('⛽ Carga guardada.'); renderGas(); window.scrollTo(0,0);
  }catch(e){ alert('Error: '+e.message); }
}
async function borrarGas(id){
  if(!esAdmin()) return;
  const g = (gasCache||[]).find(x=>x.id===id); if(!g) return;
  if(!confirm(`🗑️ Borrar la carga de ${fmtPesos(g.monto)} (${g.carro} · ${g.instalador}, ${g.fechaDia})?\n\nEl monto regresa al presupuesto de la semana.`)) return;
  try{ await db.collection('gasolina').doc(id).update({estado:'borrado', borradoPor:getCurrentUserEmail?getCurrentUserEmail():'', borradoEn:new Date().toISOString()}); gasCache=null; renderGas(); }catch(e){ alert('Error: '+e.message); }
}
let gasCfgEdit = null;
function renderGasConfig(){
  if(!gasCfgEdit) gasCfgEdit = JSON.parse(JSON.stringify(gasConfig));
  const c = gasCfgEdit;
  const lista = (tipo, mod) => (c[tipo][mod]||[]).map((n,i)=>`<span class="tag" style="display:inline-flex;align-items:center;gap:6px;margin:3px 4px 0 0">${n}<a href="#" style="color:var(--bad);text-decoration:none" onclick="gasCfgEdit['${tipo}']['${mod}'].splice(${i},1);renderGasConfig();return false;">✖</a></span>`).join('');
  $('#main').innerHTML = `<div class="card"><div style="font-size:17px;font-weight:800">⚙️ Gasolina: presupuestos, carros e instaladores</div>
      <p class="hint">El presupuesto es por semana (sábado a viernes) y se reinicia cada semana. Los coordinadores eligen el carro y el instalador de estas listas.</p></div>
    ${MODULOS.map(m=>{ const mod=m.nombre; return `<div class="card"><strong>📍 ${mod}</strong>
      <label class="hint" style="display:block;margin-top:8px">Presupuesto semanal (pesos)</label>
      <input type="number" min="0" inputmode="decimal" value="${c.presupuestos[mod]??''}" placeholder="$" oninput="gasCfgEdit.presupuestos['${mod}']=this.value===''?undefined:Number(this.value)" style="margin-top:4px">
      <label class="hint" style="display:block;margin-top:10px">🚗 Carros</label><div>${lista('carros',mod)||'<span class="hint">Ninguno</span>'}</div>
      <div class="row" style="gap:6px;margin-top:6px;flex-wrap:nowrap"><input id="gc-carro-${mod}" placeholder="Ej. Nissan blanca ABC-123" style="flex:1"><button class="btn small" onclick="gasCfgAgregar('carros','${mod}')">Agregar</button></div>
      <label class="hint" style="display:block;margin-top:10px">👷 Instaladores</label><div>${lista('instaladores',mod)||'<span class="hint">Ninguno</span>'}</div>
      <div class="row" style="gap:6px;margin-top:6px;flex-wrap:nowrap"><input id="gc-instaladores-${mod}" placeholder="Nombre del instalador" style="flex:1"><button class="btn small" onclick="gasCfgAgregar('instaladores','${mod}')">Agregar</button></div>
    </div>`; }).join('')}
    <div class="card"><button class="btn" style="width:100%;min-height:52px" onclick="guardarGasConfig()">✅ Guardar</button>
      <button class="btn small" style="margin-top:8px;background:transparent;color:var(--sub);border:1px solid var(--line);box-shadow:none" onclick="gasCfgEdit=null;gasEditCfg=false;renderGas()">Cancelar</button></div>`;
}
function gasCfgAgregar(tipo, mod){
  const el = document.getElementById('gc-'+(tipo==='carros'?'carro':'instaladores')+'-'+mod); const v = (el&&el.value||'').trim(); if(!v) return;
  const arr = (gasCfgEdit[tipo][mod] = gasCfgEdit[tipo][mod]||[]); if(!arr.includes(v)) arr.push(v);
  renderGasConfig();
}
async function guardarGasConfig(){
  try{
    const c = gasCfgEdit; const pres = {}; Object.keys(c.presupuestos).forEach(k=>{ const v=Number(c.presupuestos[k]); if(v>0) pres[k]=v; });
    await db.collection('config').doc('gasolina').set({modulo:'_global', presupuestos:pres, carros:c.carros, instaladores:c.instaladores, fecha:new Date().toISOString()});
    gasConfig = {presupuestos:pres, carros:c.carros, instaladores:c.instaladores}; gasCfgEdit = null; gasEditCfg = false; resumenCache = null;
    toast('✅ Guardado.'); renderGas();
  }catch(e){ alert('Error: '+e.message); }
}
async function repGasolinaSemana(){
  const el = document.getElementById('rep-gas'); if(!el) return;
  await cargarGasConfig(); gasCache = null; await cargarGas();
  const mod = modulo(), pres = Number(gasConfig.presupuestos[mod])||0;
  const fila = cual => { const rg=gasRango(cual), g=gasDeModulo(mod, rg, gasCache).reduce((s,x)=>s+(Number(x.monto)||0),0); const pasa = pres && g>pres;
    return `<div class="movitem" style="padding:8px 10px"><span>${rg.txt}<span class="hint" style="display:block;margin:0">${fCorta(rg.desde)} – ${fCorta(rg.hasta)}</span></span><strong class="${pasa?'neg':''}">${fmtPesos(g)}${pres?`<span class="hint" style="margin:0"> / ${fmtPesos(pres)}</span>`:''}</strong></div>`; };
  el.innerHTML = `<strong>⛽ Gasolina de ${mod}</strong><p class="hint" style="margin:4px 0 0">Semana de sábado a viernes.</p>
    <div class="movlist" style="margin-top:8px">${fila('esta')}${fila('pasada')}</div>
    <button class="btn small" style="margin-top:8px;background:transparent;color:#e0791a;border:1px solid var(--line);box-shadow:none" onclick="irA('gas')">⛽ Ver cargas</button>`;
}
function gasResumenHtml(R, rg){
  const cfg = gasConfig||{presupuestos:{}};
  const filas = MODULOS.map(m=>{ const xs=(R.gas||[]).filter(g=>g.modulo===m.nombre && g.estado!=='borrado' && g.fechaDia>=rg.desde && g.fechaDia<=rg.hasta);
    return {m:m.nombre, gasto:xs.reduce((s,g)=>s+(Number(g.monto)||0),0), n:xs.length, pres:Number(cfg.presupuestos[m.nombre])||0}; }).sort((a,b)=>b.gasto-a.gasto);
  const total = filas.reduce((s,x)=>s+x.gasto,0);
  if(!total && !filas.some(x=>x.pres)) return '';
  const col = x => !x.pres ? '#888' : (x.gasto>x.pres ? '#e0453f' : (x.gasto/x.pres>=0.8 ? '#e3b341' : '#1f9d55'));
  return `<div class="card"><div class="row" style="justify-content:space-between"><strong>⛽ Gasolina por módulo</strong><span class="hint" style="margin:0">${rg.txt}</span></div>
    <p class="hint" style="margin:4px 0 0">Total: <strong>${fmtPesos(total)}</strong>. Ordenado de quien gasta más a quien gasta menos.</p>
    <div class="movlist" style="margin-top:8px">${filas.map((x,i)=>`<div class="movitem" style="padding:10px 12px;border-left:5px solid ${col(x)}"><span style="flex:1;font-weight:800">${i+1}. ${x.m}<span class="hint" style="display:block;margin:2px 0 0;font-weight:400">${x.n} carga(s)</span></span>
      <span style="text-align:right"><strong style="font-size:18px">${fmtPesos(x.gasto)}</strong>${x.pres?`<span class="hint" style="margin:0"> / ${fmtPesos(x.pres)}</span><span style="display:block;font-size:13px;font-weight:700;color:${col(x)}">${x.gasto>x.pres?`Se pasó ${fmtPesos(x.gasto-x.pres)}`:`Quedan ${fmtPesos(x.pres-x.gasto)}`}</span>`:''}</span></div>`).join('')}</div>
  </div>`;
}

// ===== Resumen semanal para Dirección (confirmado por el usuario) =====
// Lo más importante de los 5 módulos en una pantalla: lo que pasó en el periodo (instalaciones,
// garantías, cortes, melamina usada, mermas, cierres del turno) y lo que hay que atender HOY
// (cortes sin registrar, pendientes, faltantes, stock bajo, versión vieja de la app).
let resumenCache = null, resumenPeriodo = 'semana';
function rangoResumen(){
  const hoy = new Date(); const d0 = new Date(hoy); d0.setHours(0,0,0,0);
  const ymd = d => new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);
  // Semana de sábado a viernes (confirmado por el usuario).
  if(resumenPeriodo==='semana'){ const sab=sabadoDe(ymd(d0)); return {desde:sab, hasta:ymd(d0), txt:'Esta semana (desde el sábado)'}; }
  if(resumenPeriodo==='pasada'){ const sab0=new Date(sabadoDe(ymd(d0))+'T12:00:00'); sab0.setDate(sab0.getDate()-7); const sab=sab0.toISOString().slice(0,10); return {desde:sab, hasta:finSemana(sab), txt:'Semana pasada (sábado a viernes)'}; }
  const ini=new Date(d0); ini.setDate(d0.getDate()-6); return {desde:ymd(ini), hasta:ymd(d0), txt:'Últimos 7 días'};
}
async function cargarResumen(){
  await cargarValoresInst();
  await cargarGasConfig();
  const [inv, mv, il, gl, du, au, ve, ga] = await Promise.all([inventarioTodos(), ...['movimientos','instalacionesLog','garantiasLog','deudasAuditoria','auditorias','versiones','gasolina'].map(c=>db.collection(c).get().catch(()=>({docs:[]})))]);
  const L = snap => snap.docs.map(d=>({id:d.id, ...d.data()}));
  return {inv, movs:L(mv), inst:L(il), gar:L(gl), deudas:L(du), auds:L(au), versiones:L(ve), gas:L(ga)};
}
function diaLocal(iso){ return iso ? new Date(new Date(iso).getTime()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10) : ''; }
function diasLaborables(desde, hasta){
  const out=[]; const hoy=fechaHoyLocal(); let d=new Date(desde+'T12:00:00');
  while(true){ const s=d.toISOString().slice(0,10); if(s>hasta || s>hoy) break; if(d.getDay()!==0) out.push(s); d.setDate(d.getDate()+1); }
  return out;
}
function datosModuloResumen(R, mod, rg){
  const enRango = f => f && f>=rg.desde && f<=rg.hasta;
  const ms = R.movs.filter(m=>m.modulo===mod && m.estado!=='rechazado');
  const msR = ms.filter(m=>enRango(diaLocal(m.fecha)));
  const esHojaMel = id => /^melamina_/.test(id), esHojaId2 = id => esHojaId(id);
  const sum = (arr, fn) => arr.reduce((s,m)=>s+(fn(m)?(Number(m.cantidad)||0):0),0);
  const res = R.inv.res[mod]||{}, mins = R.inv.mins[mod]||{};
  const sinCorte = CATALOGO.filter(it=>esHoja(it)).reduce((s,it)=>s+((res[it.id]||{}).autoCortes||0),0);
  const bajos = CATALOGO.filter(it=>Number(mins[it.id])>0 && res[it.id] && res[it.id].final < Number(mins[it.id])-1e-9).length;
  const lab = diasLaborables(rg.desde, rg.hasta);
  const diasCierre = new Set(ms.filter(m=>m.cierreTurno).map(m=>diaLocal(m.fecha)));
  const sinCierre = lab.filter(d=>d!==fechaHoyLocal() && !diasCierre.has(d));
  const pendLotes = new Set(R.movs.filter(m=>m.modulo===mod && m.estado==='pendiente').map(m=>m.loteId||m.id)).size;
  const auds = R.auds.filter(a=>a.modulo===mod && !a.complemento).sort((a,b)=>(b.fecha||'').localeCompare(a.fecha||''));
  const regresadas = regresadasDe(R.movs);
  const instR = R.inst.filter(x=>x.modulo===mod && x.estado!=='rechazado' && enRango(x.fechaDia||diaLocal(x.fecha)));
  return {
    inst: instR.filter(x=>instCuenta(x, regresadas)).length,
    instReg: instR.filter(x=>regresadas.has(x.id)).length,
    valor: instR.reduce((s,x)=>s+valorInstalacion(x, regresadas),0),
    gar: R.gar.filter(x=>x.modulo===mod && x.estado!=='rechazado' && enRango(x.fechaDia||diaLocal(x.fecha))).length,
    cortes: sum(msR, m=>m.tipo==='corte'),
    melUsada: sum(msR, m=>(m.tipo==='instalacion'||m.tipo==='garantia') && esHojaMel(m.itemId)),
    mermaHojas: sum(msR, m=>m.tipo==='merma' && esHojaId2(m.itemId)),
    mermasOtras: msR.filter(m=>m.tipo==='merma' && !esHojaId2(m.itemId)).length,
    cierres: lab.length - sinCierre.length, laborables: lab.length, sinCierre,
    sinCorte, pendLotes, bajos,
    deudas: R.deudas.filter(d=>d.modulo===mod && d.estado!=='saldada').length,
    ultAud: auds[0] ? auds[0].fecha : null
  };
}
// Ranking de instalaciones por módulo contra su meta semanal (confirmado por el usuario).
function rankingInstHtml(D, rg){
  const dias = Math.round((new Date(rg.hasta+'T12:00:00') - new Date(rg.desde+'T12:00:00'))/86400000)+1;
  const semanaCompleta = dias>=7;
  const filas = MODULOS.map(m=>({m:m.nombre, valor:D[m.nombre].valor, n:D[m.nombre].inst, meta:metaModulo(m.nombre)}))
    .map(x=>({...x, pct: x.meta ? x.valor/x.meta*100 : 0})).sort((a,b)=>b.valor-a.valor || b.n-a.n);
  const medalla = i => ['🥇','🥈','🥉'][i] || `${i+1}.`;
  const color = p => p>=100 ? '#1f9d55' : (p>=75 ? '#e3b341' : '#e0453f');
  return `<div class="card">
    <div class="row" style="justify-content:space-between"><strong>🏆 Instalaciones por módulo</strong><span class="hint" style="margin:0">${rg.txt}</span></div>
    <p class="hint" style="margin:4px 0 0">Meta por semana: 96 · Saltillo y Guadalajara: 72.${semanaCompleta?'':' <strong>La semana va en curso.</strong>'}</p>
    <div class="movlist" style="margin-top:8px">
    ${filas.map((x,i)=>`<div class="movitem" style="padding:10px 12px;gap:8px;border-left:5px solid ${color(x.pct)}">
      <span style="flex:1;min-width:0;font-weight:800;font-size:16px">${medalla(i)} ${x.m}</span>
      <span style="white-space:nowrap;text-align:right"><strong style="font-size:20px">${fmtNum(x.valor)}</strong><span class="hint" style="margin:0"> / ${fmtNum(x.meta)}</span>
        <span style="display:block;font-size:13px;font-weight:700;color:${color(x.pct)}">${x.pct>=100?'✅ En rango':(semanaCompleta?`Faltaron ${fmtNum(x.meta-x.valor)}`:`Faltan ${fmtNum(x.meta-x.valor)}`)}</span></span>
    </div>`).join('')}
    </div></div>`;
}
async function renderResumen(){
  if(!esAdmin()){ $('#main').innerHTML='<div class="card">Esta vista es para Dirección.</div>'; return; }
  if(!resumenCache){ $('#main').innerHTML='<div class="card hint">Calculando el resumen de los 5 módulos…</div>';
    try{ resumenCache = await cargarResumen(); }catch(e){ $('#main').innerHTML='<div class="card">No se pudo calcular: '+e.message+'</div>'; return; } }
  const R = resumenCache, rg = rangoResumen();
  const D = {}; MODULOS.forEach(m=>{ D[m.nombre] = datosModuloResumen(R, m.nombre, rg); });
  const tot = k => MODULOS.reduce((s,m)=>s+(D[m.nombre][k]||0),0);
  const tile = (ic, n, t, c) => `<div style="flex:1 1 45%;min-width:140px;background:rgba(127,127,127,.08);border-radius:14px;padding:12px;border-left:5px solid ${c}"><div style="font-size:22px;font-weight:800">${ic} ${n}</div><div class="hint" style="margin:2px 0 0">${t}</div></div>`;
  // Lo que hay que atender
  const alertas = [];
  MODULOS.forEach(m=>{ const d=D[m.nombre];
    if(d.sinCorte>0.005) alertas.push(`✂️ <strong>${m.nombre}</strong>: ${fmtNum(d.sinCorte)} hoja(s) usadas sin corte registrado`);
    if(d.sinCierre.length) alertas.push(`📝 <strong>${m.nombre}</strong>: sin cierre del turno ${d.sinCierre.length} día(s) (${d.sinCierre.map(x=>new Date(x+'T12:00:00').toLocaleDateString('es-MX',{weekday:'short',day:'numeric'})).join(', ')})`);
    if(d.pendLotes) alertas.push(`⏳ <strong>${m.nombre}</strong>: ${d.pendLotes} captura(s) esperando tu aprobación`);
    if(d.bajos) alertas.push(`⚠️ <strong>${m.nombre}</strong>: ${d.bajos} artículo(s) debajo del mínimo`);
    if(d.deudas) alertas.push(`🔻 <strong>${m.nombre}</strong>: ${d.deudas} faltante(s) de auditoría sin saldar`);
  });
  const viejas = R.versiones.filter(v=>numVersion(v.version) < numVersion(versionServidor||APP_VERSION));
  if(viejas.length) alertas.push(`📱 ${viejas.length} usuario(s) con versión vieja de la app: ${viejas.map(v=>`${(v.email||'').split('@')[0]} (${v.version})`).join(', ')}`);
  const fila = (ic, t, v, mal) => `<div class="movitem" style="padding:8px 10px"><span>${ic} ${t}</span><strong class="${mal?'neg':''}">${v}</strong></div>`;
  const cardMod = m => { const d=D[m.nombre]; const malos = (d.sinCorte>0.005) + (d.sinCierre.length>0) + (d.pendLotes>0) + (d.bajos>0) + (d.deudas>0);
    return `<div class="card" style="border-left:6px solid ${malos?'#e0453f':'#1f9d55'}">
      <div class="row" style="justify-content:space-between"><strong style="font-size:17px">📍 ${m.nombre}</strong><span class="tag" style="${malos?'color:var(--bad);border-color:var(--bad)':'color:var(--ok);border-color:var(--ok)'}">${malos?malos+' por atender':'✓ Todo en orden'}</span></div>
      <div class="movlist" style="margin-top:8px">
        ${fila('🔧','Instalaciones', `${fmtNum(d.valor)} <span class="hint" style="margin:0">/ ${fmtNum(metaModulo(m.nombre))}</span>`)}
        ${fila('🛡️','Garantías', d.gar)}
        ${fila('✂️','Hojas cortadas', fmtNum(d.cortes))}
        ${fila('🪵','Melamina usada (instal. y garantías)', fmtNum(d.melUsada)+' hojas')}
        ${fila('🗑️','Mermas', fmtNum(d.mermaHojas)+' hojas'+(d.mermasOtras?` + ${d.mermasOtras} otras`:''), d.mermaHojas>0)}
        ${fila('📝','Cierres del turno', `${d.cierres} de ${d.laborables} días`, d.sinCierre.length>0)}
        ${fila('✂️','Hojas sin corte registrado (hoy)', fmtNum(d.sinCorte), d.sinCorte>0.005)}
        ${fila('⏳','Por aprobar (hoy)', d.pendLotes, d.pendLotes>0)}
        ${fila('🔻','Faltantes sin saldar', d.deudas, d.deudas>0)}
        ${fila('⚠️','Debajo del mínimo', d.bajos, d.bajos>0)}
        ${fila('📋','Última auditoría', d.ultAud ? new Date(d.ultAud).toLocaleDateString('es-MX',{day:'numeric',month:'short'}) : 'Ninguna')}
      </div></div>`; };
  $('#main').innerHTML = `<div class="card">
      <div style="font-size:17px;font-weight:800">📈 Resumen · 5 módulos</div>
      <div class="chips" style="margin-top:8px">${[['semana','Esta semana'],['pasada','Semana pasada'],['7d','Últimos 7 días']].map(([k,t])=>`<button class="chip ${k===resumenPeriodo?'on':''}" onclick="resumenPeriodo='${k}';renderResumen()">${t}</button>`).join('')}</div>
      <p class="hint" style="margin:6px 0 0">${rg.txt}: ${new Date(rg.desde+'T12:00:00').toLocaleDateString('es-MX',{day:'numeric',month:'short'})} al ${new Date(rg.hasta+'T12:00:00').toLocaleDateString('es-MX',{day:'numeric',month:'short'})}. Lo marcado "hoy" es como está en este momento.</p>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px">
        ${tile('🔧', fmtNum(tot('valor')), 'Instalaciones', '#3E5CDE')}
        ${tile('🛡️', tot('gar'), 'Garantías', '#b3742c')}
        ${tile('✂️', fmtNum(tot('cortes')), 'Hojas cortadas', '#0e8a8a')}
        ${tile('🗑️', fmtNum(tot('mermaHojas')), 'Hojas en merma', '#e0453f')}
      </div>
      <div class="row" style="gap:8px;margin-top:10px;flex-wrap:wrap">
        <button class="btn small" style="background:transparent;color:var(--brand);border:1px solid var(--line);box-shadow:none" onclick="resumenCache=null;renderResumen()">🔄 Actualizar</button>
        <button class="btn small" style="background:transparent;color:#b38a1e;border:1px solid var(--line);box-shadow:none" onclick="valEdit=null;irA('valinst')">⭐ Valor de cada modelo</button>
      </div>
      
    </div>
    ${rankingInstHtml(D, rg)}
    ${gasResumenHtml(R, rg)}
    <div class="card" style="border:2px solid ${alertas.length?'#e0453f':'#1f9d55'}">
      <strong>${alertas.length?'🚨 Por atender ('+alertas.length+')':'✅ Nada por atender'}</strong>
      ${alertas.length?`<div class="movlist" style="margin-top:8px">${alertas.map(a=>`<div class="movitem" style="padding:8px 10px"><span>${a}</span></div>`).join('')}</div>`:'<p class="hint" style="margin:4px 0 0">Todos los módulos están al día.</p>'}
    </div>
    ${MODULOS.map(cardMod).join('')}
    <div class="card"><strong>📱 Versión de la app por usuario</strong>
      <p class="hint" style="margin:4px 0 0">La más nueva es la ${versionServidor||APP_VERSION}. Si alguien trae una vieja, que abra la app y toque "Actualizar".</p>
      <div class="movlist" style="margin-top:8px">${R.versiones.sort((a,b)=>(a.modulo||'').localeCompare(b.modulo||'')).map(v=>{ const vieja = numVersion(v.version) < numVersion(versionServidor||APP_VERSION);
        return `<div class="movitem" style="padding:8px 10px"><span>${(v.email||'').split('@')[0]}<span class="hint" style="display:block;margin:0">${v.modulo||'—'} · ${v.fecha?new Date(v.fecha).toLocaleDateString('es-MX',{day:'numeric',month:'short'}):''}</span></span><strong class="${vieja?'neg':'pos'}">${v.version}${vieja?' ⚠️':' ✓'}</strong></div>`; }).join('') || '<p class="hint">Todavía nadie ha abierto la versión nueva.</p>'}</div>
    </div>`;
}

// ===== Menú "Más" del coordinador =====
function renderMas(){
  const t = (ic, tit, sub, js, color) => `<button class="tile" style="--tc:${color}" onclick="${js}"><span class="tile-ic">${ic}</span><span class="tile-t">${tit}</span><span class="tile-s">${sub}</span></button>`;
  $('#main').innerHTML = `<div class="card"><strong>☰ Más opciones</strong><p class="hint">Lo que se usa de vez en cuando.</p></div>
    <div class="tiles">
      ${t('⏳','Mis pendientes','Ver o corregir lo que espera aprobación',"irA('pend')",'#b3742c')}
      ${t('🛡️','Garantías','Material que se da en garantía',"irA('gar')",'#b3742c')}
      ${t('🔄','Traspasos','Enviar material a otro módulo',"irA('trasp')",'#7a4fb5')}
      ${t('📊','Reportes','Cierre del día en PDF',"irA('rep')",'#3E5CDE')}
      ${t('📜','Historial','Entradas y salidas por fecha',"irA('movhist')",'#6b7280')}
      ${t('📐','Despiece','Piezas de cada modelo',"irA('desp')",'#2c46b8')}
      ${t('🧩','Sobrantes','Material que regresó sin instalar',"irA('sob')",'#0e8a8a')}
      ${t('✂️','Piezas encontradas','Piezas cortadas que no estaban en el inventario',"pzSetModo('enc');irA('pzenc')",'#0e8a8a')}
    </div>`;
}

// ===== Corregir antes de que se apruebe (confirmado por el usuario) =====
// Lo que sigue "pendiente" lo puede borrar quien lo anotó (o Dirección) para volverlo a capturar bien.
// Ya aprobado no se puede borrar: se corrige con una auditoría.
// Corte del día (confirmado por el usuario): el corte NO necesita aprobación, se aplica directo; por
// eso no salía en pendientes/aprobaciones y parecía que no se había capturado. Se muestra aparte.
function cortesHoyHtml(lista, soloModulo){
  const hoy = fechaHoyLocal();
  const local = iso => new Date(new Date(iso).getTime()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
  const cs = lista.filter(m=>m.tipo==='corte' && m.estado!=='rechazado' && m.fecha && local(m.fecha)===hoy && (!soloModulo || m.modulo===soloModulo));
  const porMod = {}; cs.forEach(m=>{ const k=m.modulo||''; (porMod[k]=porMod[k]||{}); porMod[k][m.itemNombre] = (porMod[k][m.itemNombre]||0) + (Number(m.cantidad)||0); });
  const sinCorte = soloModulo===modulo() ? cortesPendientes() : [];
  if(!cs.length && !sinCorte.length) return '';
  const bloques = Object.keys(porMod).map(k=>`<div class="hint" style="margin:6px 0 0">${soloModulo?'':`<strong>${k}</strong><br>`}${Object.keys(porMod[k]).map(n=>`✂️ ${fmtNum(porMod[k][n])} hoja(s) ${n}`).join('<br>')}</div>`).join('');
  return `<div class="card" style="border:1px solid var(--line)">
    <strong>✂️ Hojas cortadas hoy</strong> <span class="tag pos" style="border-color:var(--ok)">Ya aplicado</span>
    <p class="hint" style="margin:4px 0 0">El corte no necesita aprobación: se suma al cortado en cuanto se guarda.</p>
    ${bloques || '<p class="hint" style="margin:6px 0 0">Hoy no se ha registrado ningún corte.</p>'}
    ${sinCorte.length?`<p class="neg" style="margin:8px 0 0">⚠️ Usado sin corte anotado: ${sinCorte.map(x=>fmtNum(x.f.autoCortes)+' de '+x.it.nombre).join(', ')}. Falta registrarlo en el Cierre del turno (paso 1).</p>`:''}
  </div>`;
}
function renderPend(){
  const lotes = {};
  movs.filter(m=>m.estado==='pendiente').forEach(m=>{ const k=m.loteId||m.id; (lotes[k]=lotes[k]||[]).push(m); });
  const yo = getCurrentUserEmail?getCurrentUserEmail():'';
  const keys = Object.keys(lotes).sort((a,b)=>(lotes[b][0].fecha||'').localeCompare(lotes[a][0].fecha||''));
  $('#main').innerHTML = `<div class="card"><strong>⏳ Pendientes de aprobar · ${modulo()}</strong>
      <p class="hint">Si anotaste algo mal y todavía no se aprueba, bórralo aquí y vuelve a capturarlo bien. Lo ya aprobado no se puede borrar.</p></div>
    ${cortesHoyHtml(movs, modulo())}
    ${keys.length ? keys.map(k=>{ const ms=lotes[k]; const puede = esAdmin() || !ms[0].creadoPor || ms[0].creadoPor===yo;
      return `<div class="card">
        <div class="row" style="justify-content:space-between"><strong>${describirLote(ms)}</strong><span class="tag">${new Date(ms[0].fecha).toLocaleString('es-MX',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</span></div>
        <p class="hint" style="margin:4px 0">${(ms[0].creadoPor||'').split('@')[0]}${ms[0].nota?' · '+ms[0].nota:''}</p>
        <div class="hint">${ms.map(m=>`${fmtNum(m.cantidad)} ${item2unidad(m.itemId)} ${m.itemNombre}`).join('<br>')}</div>
        ${puede?`<div class="row" style="justify-content:flex-end;margin-top:8px"><button class="btn small" style="background:transparent;color:var(--bad);border:1px solid var(--bad);box-shadow:none" onclick="borrarLotePendiente('${k}')">🗑️ Borrar para corregir</button></div>`:'<p class="hint" style="margin-top:6px">Lo anotó otra persona.</p>'}
      </div>`; }).join('') : '<div class="card hint">No hay nada pendiente. 🎉</div>'}`;
}
async function borrarLotePendiente(loteId){
  const ms = movs.filter(m=>(m.loteId||m.id)===loteId && m.estado==='pendiente');
  if(!ms.length) return alert('Ya no está pendiente (quizá ya se aprobó).');
  if(!confirm(`¿Borrar esta captura?\n\n${describirLote(ms)}:\n${ms.map(m=>`• ${fmtNum(m.cantidad)} ${m.itemNombre}`).join('\n')}\n\nDespués puedes volver a capturarla bien.`)) return;
  try{
    for(const m of ms) await db.collection('movimientos').doc(m.id).delete();
    // Sobrante del corte de puertas ligado a esa instalación (lote propio: id + 's')
    try{ const sm = movs.filter(m=>m.loteId===loteId+'s' && m.motivo==='sobranteCortePuertas' && m.estado==='pendiente');
      for(const m of sm) await db.collection('movimientos').doc(m.id).delete();
      if(sm.length){ const d = await db.collection('sobrantes').doc(loteId+'s').get(); if(d && d.data) await db.collection('sobrantes').doc(loteId+'s').delete(); } }catch(e){}
    // Registros ligados a esa captura
    try{ const d = await db.collection('instalacionesLog').doc(loteId).get(); if(d && d.data) await db.collection('instalacionesLog').doc(loteId).delete(); }catch(e){}
    try{ const d = await db.collection('garantiasLog').doc(loteId).get(); if(d && d.data) await db.collection('garantiasLog').doc(loteId).delete(); }catch(e){}
    try{ const g = (await db.collection('garantiasLog').get()).docs.find(x=>((x.data()||{}).retorno||{}).loteId===loteId); if(g) await db.collection('garantiasLog').doc(g.id).update({retorno:null}); }catch(e){}
    try{ const p = pedidos.find(x=>recepcionesDe(x).some(r=>r.loteId===loteId)); if(p){ const recepciones = recepcionesDe(p).filter(r=>r.loteId!==loteId); await db.collection('pedidos').doc(p.id).update(Object.assign({recepciones, recibido:null}, p.estado==='recibido'?{estado:'enCamino'}:{})); } }catch(e){}
    for(let i=0;i<4;i++){ try{ await db.collection('fotos').doc(loteId+'_f'+i).delete(); }catch(e){} }
    try{ const d = await db.collection('sobrantes').doc(loteId).get(); if(d && d.data) await db.collection('sobrantes').doc(loteId).delete(); }catch(e){}
    try{ const sb = sobrantesCache.find(x=>(x.transformaciones||[]).some(t=>t.loteId===loteId));
      if(sb){ const t = sb.transformaciones.find(t=>t.loteId===loteId); const restante = Object.assign({}, sb.restante||{});
        Object.keys(t.usado||{}).forEach(k=>{ restante[k] = fmtNum((restante[k]||0) + t.usado[k]); });
        await db.collection('sobrantes').doc(sb.id).update({transformaciones: sb.transformaciones.filter(x=>x.loteId!==loteId), restante, estado:'abierto', mermaFinal:null}); } }catch(e){}
    toast('🗑️ Borrado. Ya puedes capturarlo otra vez.');
    renderPend();
  }catch(e){ alert('Error: '+e.message); }
}

// ===== Avisos (confirmado por el usuario) =====
// Cada módulo se entera cuando Dirección aprueba o rechaza lo que anotó (instalaciones, entradas,
// salidas, garantías…) y cuando le mandan material en camino. Dirección se entera cuando un módulo
// marca un pedido como recibido. Se muestran en Inicio y, si se activan, como notificación del celular
// mientras la app esté abierta o en segundo plano.
function claveAvisos(){ return 'avisosVisto_'+modulo()+'_'+(getCurrentUserEmail?getCurrentUserEmail():''); }
function avisosVisto(){ try{ const v=localStorage.getItem(claveAvisos()); if(v) return v; const ahora=new Date().toISOString(); localStorage.setItem(claveAvisos(), ahora); return ahora; }catch(e){ return new Date(0).toISOString(); } }
function describirLote(ms){
  const tipos = [...new Set(ms.map(m=>m.tipo))];
  if(ms.some(m=>m.pedidoId)) return 'Material recibido de un pedido';
  if(tipos.includes('instalacion')) return 'Instalación';
  if(tipos.includes('garantia')) return 'Garantía';
  if(ms.some(m=>m.motivo==='deSobrante')) return 'Sobrante transformado';
  if(ms.some(m=>m.motivo==='piezasEncontradas')) return 'Piezas cortadas encontradas';
  if(ms.some(m=>m.motivo==='regresoInstalacion')) return 'Regreso de modelo completo';
  if(ms.some(m=>m.motivo==='regresoMerma')) return 'Merma de material que regresó';
  if(tipos.includes('sobrante')) return 'Material a sobrantes';
  if(tipos.includes('devolucion')) return 'Regreso de garantía';
  if(ms.some(m=>m.motivo==='armarJuegos')) return 'Armado de juegos de corredera';
  if(ms.some(m=>m.motivo==='tuboAhorrado')) return 'Tubos ahorrados';
  return tipos.map(t=>(TIPO_LABEL[t]||t)).join(' y ');
}
function calcularAvisos(){
  const visto = avisosVisto(); const out = [];
  if(!puedePedidos()){
    const lotes = {};
    movs.filter(m=>m.revisadoEn && m.revisadoEn>visto && (m.estado==='aprobado'||m.estado==='rechazado')).forEach(m=>{ (lotes[m.loteId||m.id]=lotes[m.loteId||m.id]||[]).push(m); });
    Object.keys(lotes).forEach(k=>{ const ms=lotes[k]; const ok=ms[0].estado==='aprobado';
      out.push({id:'lote_'+k+'_'+ms[0].estado, fecha:ms[0].revisadoEn, ic: ok?'✅':'❌',
        titulo: `Dirección ${ok?'aprobó':'rechazó'}: ${describirLote(ms)}`,
        texto: `${ms.length} artículo(s) · anotado el ${new Date(ms[0].fecha).toLocaleDateString('es-MX')}${ok?'':' · no se sumó ni se descontó'}`}); });
    pedidos.filter(p=>p.modulo===modulo() && pedidoEnCamino(p) && p.fecha>visto).forEach(p=>out.push({id:'ped_'+p.id, fecha:p.fecha, ic:'🚚',
      titulo:'Viene material en camino', texto:`${p.items.length} artículo(s)${p.proveedor?' · '+p.proveedor:''}${p.fechaEstimada?' · llega aprox. '+fechaCorta(p.fechaEstimada):''}`}));
  } else {
    pedidos.forEach(p=>recepcionesDe(p).forEach((r,idx)=>{ if(r.fecha>visto && (p.modulo!==modulo() || estadoRecepcion(r)==='pendiente')) out.push({id:'pedrec_'+p.id+'_'+idx, fecha:r.fecha, ic:'📦',
      titulo:`${p.modulo} recibió material`, texto:'Revisa lo que llegó y apruébalo para sumarlo al inventario.'}); }));
    if(esAdmin()) cierresCache.filter(c=>c.fecha>visto).forEach(c=>out.push({id:'cierre_'+c.id, fecha:c.fecha, ic:'📝',
      titulo:`${c.modulo} hizo su cierre del turno`, texto:resumenCierreTxt(c)}));
  }
  return out.sort((a,b)=>(b.fecha||'').localeCompare(a.fecha||''));
}
let cierresCache = [];
function resumenCierreTxt(c){
  const partes = [];
  if((c.cortes||[]).length) partes.push('Cortó '+c.cortes.map(x=>fmtNum(x.q)+' '+String(x.nombre).replace('Melamina ','')).join(', '));
  else if(c.hojasContadas) partes.push('Sin corte de hojas');
  if(c.consumibles) partes.push(c.consumibles+' consumible(s) descontados');
  if((c.hojasDeMas||[]).length) partes.push('⚠️ Hojas de más: '+c.hojasDeMas.map(x=>fmtNum(x.q)+' '+String(x.nombre).replace('Melamina ','')).join(', ')+' (por aprobar)');
  if((c.consDeMas||[]).length) partes.push('⚠️ Tienen más de: '+c.consDeMas.slice(0,3).join(', '));
  return partes.join(' · ') || 'Sin movimiento';
}
function cierresHoyHtml(){
  if(!esAdmin()) return '';
  const hoy = fechaHoyLocal(), tarde = esHoraDeCierre();
  const filas = MODULOS.map(m=>{
    const c = cierresCache.find(x=>x.modulo===m.nombre && x.dia===hoy);
    const hora = c ? new Date(c.fecha).toLocaleTimeString('es-MX',{hour:'numeric',minute:'2-digit'}) : '';
    const alerta = c && ((c.hojasDeMas||[]).length || (c.consDeMas||[]).length);
    return `<div class="movitem" style="align-items:flex-start"><span style="min-width:0"><span class="invname"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${m.color};margin-right:6px"></span>${m.nombre}</span>${c?`<span class="hint" style="display:block;margin:2px 0 0">${resumenCierreTxt(c)}</span>`:''}</span>
      <strong style="white-space:nowrap;font-size:13px;color:${c?(alerta?'#b3742c':'var(--ok)'):(tarde?'var(--bad)':'var(--sub)')}">${c?(alerta?'⚠️ ':'✅ ')+hora:(tarde?'⏳ Falta':'Aún no')}</strong></div>`;
  }).join('');
  const hechos = MODULOS.filter(m=>cierresCache.some(x=>x.modulo===m.nombre && x.dia===hoy)).length;
  return `<details class="card" style="padding:12px" ${tarde?'open':''}><summary><strong>📝 Cierres del turno de hoy</strong><span class="tag" style="margin-left:auto">${hechos} de ${MODULOS.length}</span></summary><div class="movlist">${filas}</div></details>`;
}
function fechaCorta(d){ return new Date((String(d).length===10?d+'T12:00:00':d)).toLocaleDateString('es-MX',{day:'numeric',month:'short'}); }
function avisosCardHtml(){
  const av = calcularAvisos();
  const permiso = (typeof Notification!=='undefined') ? Notification.permission : 'unsupported';
  const botonPermiso = permiso==='default' ? `<button class="btn small" style="background:transparent;color:var(--brand);border:1px solid var(--line);box-shadow:none" onclick="activarNotificaciones()">🔔 Avisarme en el celular</button>` : '';
  if(!av.length) return botonPermiso ? `<div class="card" style="padding:12px"><div class="pend"><div class="hint" style="margin:0">Activa los avisos para enterarte cuando Dirección apruebe o te manden material.</div>${botonPermiso}</div></div>` : '';
  return `<div class="card" style="padding:12px;border:2px solid var(--brand)">
    <div class="row" style="justify-content:space-between"><strong>🔔 Novedades (${av.length})</strong><button class="btn small" onclick="marcarAvisosVistos()">Entendido</button></div>
    <div class="movlist" style="margin-top:8px">${av.slice(0,6).map(a=>`<div class="movitem"><span style="min-width:0"><span class="invname">${a.ic} ${a.titulo}</span><span class="hint" style="display:block;margin:2px 0 0">${a.texto}</span></span></div>`).join('')}</div>
    ${av.length>6?`<p class="hint">… y ${av.length-6} más</p>`:''}${botonPermiso?`<div style="margin-top:8px">${botonPermiso}</div>`:''}
  </div>`;
}
function marcarAvisosVistos(){ try{ localStorage.setItem(claveAvisos(), new Date().toISOString()); }catch(e){} renderHome(); }
async function activarNotificaciones(){
  if(typeof Notification==='undefined') return alert('Este celular no permite avisos desde el navegador. En iPhone, primero instala la app en la pantalla de inicio.');
  const r = await Notification.requestPermission();
  toast(r==='granted' ? '🔔 Avisos activados.' : 'No se activaron los avisos.');
  renderHome();
}
let _avisosNotificados = null;
async function revisarAvisosNuevos(){
  if(!moduloActual) return;
  const av = calcularAvisos();
  if(_avisosNotificados===null){ _avisosNotificados = new Set(av.map(a=>a.id)); return; } // al abrir no se repite lo que ya se ve en Inicio
  const nuevos = av.filter(a=>!_avisosNotificados.has(a.id));
  nuevos.forEach(a=>_avisosNotificados.add(a.id));
  if(!nuevos.length || typeof Notification==='undefined' || Notification.permission!=='granted') return;
  try{
    const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
    for(const a of nuevos.slice(0,3)){
      const opts = {body:a.texto, icon:'icon-192.png', badge:'icon-192.png', tag:a.id};
      if(reg && reg.showNotification) await reg.showNotification(a.ic+' '+a.titulo, opts); else new Notification(a.ic+' '+a.titulo, opts);
    }
  }catch(e){}
}

// ===== Material por llegar (pedidos) — confirmado por el usuario =====
// 1) Dirección/Administración sube lo que pidió para cada módulo (queda "en camino").
// 2) Cuando llega, el coordinador marca lo que realmente llegó (puede ser distinto a lo pedido).
// 3) Dirección lo revisa y lo aprueba: en ese momento se suma al inventario como Entrada.
let pedSub = 'camino', pedForm = {modulo:null, cat:null, items:{}, proveedor:'', nota:'', fechaEstimada:''}, pedRecibiendo = null;
function estadoLoteMovs(loteId){
  if(!loteId) return null;
  const ms = movs.filter(m=>m.loteId===loteId);
  if(!ms.length) return 'pendiente';
  if(ms.some(m=>m.estado==='pendiente')) return 'pendiente';
  if(ms.every(m=>m.estado==='rechazado')) return 'rechazado';
  return 'aprobado';
}
// Entregas parciales (confirmado por el usuario): un pedido puede llegar en varias entregas.
// Cada entrega es una "recepción" con su propia aprobación; lo que falta sigue "en camino" hasta
// que llegue o hasta que Dirección cierre el pedido. Si Dirección rechaza una entrega, esa cantidad
// vuelve a quedar pendiente.
function recepcionesDe(p){ return (p.recepciones && p.recepciones.length) ? p.recepciones : (p.recibido ? [p.recibido] : []); }
function estadoRecepcion(r){ if(!(r.items||[]).some(i=>i.cantidad>0)) return 'vacia'; return estadoLoteMovs(r.loteId); }
function resumenPedido(p){
  const recs = recepcionesDe(p).filter(r=>estadoRecepcion(r)!=='rechazado');
  const llego = {}; recs.forEach(r=>(r.items||[]).forEach(i=>{ llego[i.itemId]=(llego[i.itemId]||0)+(Number(i.cantidad)||0); }));
  const filas = p.items.map(it=>({...it, llego: fmtNum(llego[it.itemId]||0), falta: fmtNum(Math.max(0, it.cantidad-(llego[it.itemId]||0)))}));
  const extra = []; Object.keys(llego).forEach(id=>{ if(!p.items.some(i=>i.itemId===id)){ const it=CATALOGO.find(x=>x.id===id); extra.push({itemId:id, itemNombre:it?it.nombre:id, unidad:it?it.unidad:'', cantidad:0, llego:llego[id], falta:0}); } });
  const faltan = filas.filter(f=>f.falta>0);
  let estado;
  if(p.estado==='cancelado') estado='cancelado';
  else if(p.estado==='cerrado') estado='cerrado';
  else if(faltan.length) estado = recs.length ? 'parcial' : 'camino';
  else estado='completo';
  return {filas:filas.concat(extra), faltan, estado, recs:recepcionesDe(p)};
}
function pedidoEnCamino(p){ const e=resumenPedido(p).estado; return e==='camino' || e==='parcial'; }
function estadoPedidoTxt(p){
  const r = resumenPedido(p);
  if(r.estado==='cancelado') return '<span class="tag">Cancelado</span>';
  if(r.estado==='camino') return '<span class="tag" style="color:#0e8a8a;border-color:#0e8a8a">🚚 En camino</span>';
  if(r.estado==='parcial') return '<span class="tag" style="color:#b3742c;border-color:#b3742c">⏳ Llegó incompleto · falta material</span>';
  if(r.estado==='cerrado') return '<span class="tag">Cerrado con faltante</span>';
  if(r.recs.some(x=>estadoRecepcion(x)==='pendiente')) return '<span class="tag" style="color:#b3742c;border-color:#b3742c">Completo · falta aprobar</span>';
  return '<span class="tag pos" style="border-color:var(--ok)">✓ Completo y sumado</span>';
}
function renderPed(){
  const visibles = pedidos.filter(p=>p.estado!=='cancelado' && (esSoloLectura() || p.modulo===modulo()));
  const enCamino = visibles.filter(pedidoEnCamino);
  const recibidos = visibles.filter(p=>!pedidoEnCamino(p));
  const porAprobar = visibles.filter(p=>recepcionesDe(p).some(r=>estadoRecepcion(r)==='pendiente'));
  const tabs = [['camino',`En camino (${enCamino.length})`],['recibidos',`Recibidos (${recibidos.length})`]]
    .concat(puedePedidos()&&porAprobar.length?[['porAprobar',`Por aprobar (${porAprobar.length})`]]:[])
    .concat(puedePedidos()?[['faltan','📋 Falta por entregar'],['nuevo','+ Nuevo pedido']]:[]);
  if(!tabs.some(t=>t[0]===pedSub)) pedSub='camino';
  let cuerpo = '';
  if(pedSub==='nuevo') cuerpo = pedNuevoHtml();
  else if(pedSub==='faltan') cuerpo = pedFaltanHtml(visibles.filter(pedidoEnCamino));
  else if(pedSub==='porAprobar' && !pedRecibiendo) cuerpo = porAprobar.map(pedCardHtml).join('');
  else if(pedRecibiendo) cuerpo = pedRecibirHtml(pedRecibiendo);
  else {
    const lista = pedSub==='camino' ? enCamino : recibidos;
    cuerpo = lista.length ? lista.map(pedCardHtml).join('') : `<div class="card hint">${pedSub==='camino'?'No hay material en camino para '+modulo()+'.':'Todavía no hay pedidos recibidos.'}</div>`;
  }
  $('#main').innerHTML = `<div class="card">
      <div style="font-size:17px;font-weight:800">🚚 Material por llegar · ${esSoloLectura()?'los 5 módulos':modulo()}</div>
      <p class="hint">${esAdministracion()?'Aquí subes lo que va a llegar a cada módulo. Cuando llega, el coordinador marca lo que recibió y tú lo apruebas para sumarlo a su inventario. Si llega incompleto, lo que falta sigue en camino.':esAdmin()?'Sube lo que pediste para este módulo. Cuando llegue, el coordinador marca lo que recibió y tú lo apruebas para sumarlo al inventario. Si llega incompleto, lo que falta sigue en camino.':'Aquí ves lo que Dirección pidió para tu módulo. Cuando llegue, marca lo que recibiste. Si llega incompleto, lo que falta sigue aquí hasta que llegue.'}</p>
      <div class="subtabs" style="margin:8px 0 0">${tabs.map(([k,l])=>`<button class="${pedSub===k?'active':''}" onclick="pedSub='${k}';pedRecibiendo=null;renderPed()">${l}</button>`).join('')}</div>
    </div>${cuerpo}`;
}
function pedCardHtml(p){
  const r = resumenPedido(p);
  const hayRecs = r.recs.length>0;
  const filas = r.filas.map(f=>`<tr><td>${f.itemNombre}</td><td>${f.cantidad?fmtNum(f.cantidad)+' '+(f.unidad||''):'no pedido'}</td>${hayRecs?`<td class="${f.llego>0?'pos':''}">${fmtNum(f.llego)}</td><td class="${f.falta>0?'neg':''}"><strong>${f.falta>0?fmtNum(f.falta):'—'}</strong></td>`:''}</tr>`).join('');
  const enCamino = r.estado==='camino' || r.estado==='parcial';
  const puedeRecibir = enCamino && !esSoloLectura();
  const recsHtml = r.recs.map((x,idx)=>{ const e=estadoRecepcion(x);
    const tag = e==='aprobado'?'<span class="tag pos" style="border-color:var(--ok)">Sumado</span>':e==='rechazado'?'<span class="tag" style="color:var(--bad);border-color:var(--bad)">Rechazado</span>':e==='vacia'?'<span class="tag">No llegó nada</span>':'<span class="tag" style="color:#b3742c;border-color:#b3742c">Falta aprobar</span>';
    return `<div class="movitem" style="flex-wrap:wrap;gap:6px"><span style="min-width:0"><span class="invname">Entrega ${idx+1} · ${fechaCorta(x.fecha)} · ${(x.por||'').split('@')[0]}</span>
      <span class="hint" style="display:block;margin:2px 0 0">${(x.items||[]).filter(i=>i.cantidad>0).map(i=>fmtNum(i.cantidad)+' '+i.itemNombre).join(', ')||'—'}${x.nota?' · '+x.nota:''}</span>${x.fotos?`<a href="#" class="hint" onclick="verFotos('${x.loteId}',${x.fotos},'Entrega');return false;">📷 Ver fotos (${x.fotos})</a>`:''}</span>
      <span class="row" style="gap:6px;flex-wrap:nowrap">${tag}${puedePedidos() && e==='pendiente' ? `<button class="btn small" style="background:transparent;color:var(--bad);border:1px solid var(--line);box-shadow:none" onclick="rechazarRecepcion('${p.id}',${idx})">Rechazar</button><button class="btn small" onclick="aprobarRecepcion('${p.id}',${idx})">✅ Aprobar</button>`:''}</span></div>`; }).join('');
  return `<div class="card">
    <div class="row" style="justify-content:space-between"><strong>${esSoloLectura()?'📍 '+p.modulo+' · ':''}${p.proveedor||'Pedido'}</strong>${estadoPedidoTxt(p)}</div>
    <p class="hint" style="margin:4px 0">Subido el ${fechaCorta(p.fecha)}${p.fechaEstimada?' · llega aprox. '+fechaCorta(p.fechaEstimada):''}${p.nota?' · '+p.nota:''}</p>
    <div class="wrap-x"><table><tr><th>Artículo</th><th>Pedido</th>${hayRecs?'<th>Llegó</th><th>Falta</th>':''}</tr>${filas}</table></div>
    ${r.recs.length?`<div class="movlist" style="margin-top:8px">${recsHtml}</div>`:''}
    ${r.estado==='cerrado'?`<p class="hint" style="margin:6px 0 0">Cerrado el ${fechaCorta(p.cerradoEn)}: lo que faltaba ya no va a llegar.</p>`:''}
    <div class="row" style="justify-content:flex-end;gap:8px;margin-top:8px;flex-wrap:wrap">
      ${puedePedidos() && r.estado==='camino' ? `<button class="btn small" style="background:transparent;color:var(--bad);border:1px solid var(--line);box-shadow:none" onclick="cancelarPedido('${p.id}')">Cancelar pedido</button>` : ''}
      ${puedePedidos() && r.estado==='parcial' ? `<button class="btn small" style="background:transparent;color:var(--sub);border:1px solid var(--line);box-shadow:none" onclick="cerrarPedido('${p.id}')">Ya no llegará lo que falta</button>` : ''}
      ${puedeRecibir ? `<button class="btn small" style="background:linear-gradient(135deg,#1f9d55,#178045)" onclick="pedRecibiendo='${p.id}';renderPed()">📦 ${r.estado==='parcial'?'Llegó lo que faltaba':'Marcar lo que llegó'}</button>` : ''}
    </div>
  </div>`;
}
function pedNuevoHtml(){
  const f = pedForm;
  if(!f.modulo) f.modulo = modulo();
  const cats = [...new Set(CATALOGO.map(i=>i.cat))];
  if(!f.cat) f.cat = cats[0];
  const items = CATALOGO.filter(i=>i.cat===f.cat);
  const elegidos = Object.keys(f.items).filter(id=>f.items[id]>0);
  return `<div class="card">
    <div class="paso">1</div><strong>¿Para qué módulo?</strong>
    <select style="margin-top:8px" onchange="pedForm.modulo=this.value">${MODULOS.map(m=>`<option ${m.nombre===f.modulo?'selected':''}>${m.nombre}</option>`).join('')}</select>
  </div>
  <div class="card">
    <div class="paso">2</div><strong>¿Qué va a llegar?</strong>
    <input type="search" placeholder="🔍 Buscar artículo" value="${String(pedBuscar).replace(/"/g,'&quot;')}" style="margin-top:10px" oninput="pedBuscar=this.value;renderPedLista()">
    <div class="chips" style="margin-top:10px">${cats.map(c=>{ const n=CATALOGO.filter(i=>i.cat===c && f.items[i.id]>0).length; return `<button class="chip ${c===f.cat&&!pedBuscar?'on':''}" onclick="pedForm.cat='${c}';pedBuscar='';renderPed()">${ICONO_CAT[c]||''} ${c}${n?' ✓'+n:''}</button>`; }).join('')}</div>
    <div class="movlist" id="ped-lista" style="margin-top:10px">${pedListaHtml()}</div>
  </div>
  <div class="card">
    <div class="paso">3</div><strong>Datos del pedido</strong>
    <div class="grid2" style="margin-top:10px">
      <div><label class="hint">Proveedor</label><input style="margin-top:4px" value="${String(f.proveedor).replace(/"/g,'&quot;')}" oninput="pedForm.proveedor=this.value" placeholder="ej. Maderas del Norte"></div>
      <div><label class="hint">Llega aprox.</label><input type="date" style="margin-top:4px" value="${f.fechaEstimada}" onchange="pedForm.fechaEstimada=this.value"></div>
    </div>
    <input style="margin-top:10px" value="${String(f.nota).replace(/"/g,'&quot;')}" oninput="pedForm.nota=this.value" placeholder="Nota (opcional, ej. número de orden)">
    <p class="hint">${elegidos.length} artículo(s) capturados.</p>
    <button class="btn" style="width:100%;min-height:52px" onclick="guardarPedido()">🚚 Guardar pedido en camino</button>
  </div>`;
}
let pedBuscar = '';
function pedListaHtml(){
  const f = pedForm;
  const items = pedBuscar.trim() ? CATALOGO.filter(i=>coincide(i.nombre, pedBuscar)).slice(0,40) : CATALOGO.filter(i=>i.cat===f.cat);
  return items.length ? items.map(it=>`<label class="movitem"><span class="invname">${it.nombre}</span>
      <input type="number" min="0" inputmode="decimal" placeholder="—" value="${f.items[it.id]||''}" oninput="pedForm.items['${it.id}']=Number(this.value)||0"></label>`).join('') : '<p class="hint">No se encontró ese artículo.</p>';
}
function renderPedLista(){ const el=document.getElementById('ped-lista'); if(el) el.innerHTML = pedListaHtml(); }
async function guardarPedido(){
  if(!puedePedidos()) return;
  const f = pedForm;
  const items = Object.keys(f.items).filter(id=>f.items[id]>0).map(id=>{ const it=CATALOGO.find(i=>i.id===id); return {itemId:id, itemNombre:it.nombre, unidad:it.unidad, cantidad:f.items[id]}; });
  if(!items.length) return alert('Escribe la cantidad de al menos un artículo.');
  if(!confirm(`Pedido para ${f.modulo}:\n\n${items.map(i=>`• ${fmtNum(i.cantidad)} ${i.unidad} ${i.itemNombre}`).join('\n')}\n\n¿Guardar como "en camino"?`)) return;
  try{
    await db.collection('pedidos').doc(cryptoId()).set({modulo:f.modulo, items, proveedor:f.proveedor.trim(), nota:f.nota.trim(), fechaEstimada:f.fechaEstimada||'', estado:'enCamino', fecha:new Date().toISOString(), creadoPor:getCurrentUserEmail?getCurrentUserEmail():''});
    pedForm = {modulo:f.modulo, cat:f.cat, items:{}, proveedor:'', nota:'', fechaEstimada:''};
    toast('✅ Pedido guardado. '+f.modulo+' lo verá en "Por llegar".');
    pedSub='camino'; renderPed();
  }catch(e){ alert('Error: '+e.message); }
}
function pedRecibirHtml(id){
  const p = pedidos.find(x=>x.id===id); if(!p){ pedRecibiendo=null; return ''; }
  const r = resumenPedido(p);
  const filas = r.filas.filter(f=>f.cantidad>0);
  return `<div class="card" style="border:2px solid var(--ok)">
    <strong>📦 ¿Qué llegó${r.recs.length?' en esta entrega':''}?</strong>
    <p class="hint">Ya viene escrito lo que ${r.recs.length?'falta por llegar':'se pidió'}. Si llegó otra cantidad, cámbiala. Si algo no llegó, pon 0 y seguirá pendiente.</p>
    <div class="movlist">${filas.map(f=>`<label class="movitem"><span style="min-width:0"><span class="invname">${f.itemNombre}</span><span class="hint" style="display:block;margin:2px 0 0">Pedido ${fmtNum(f.cantidad)} ${f.unidad||''}${r.recs.length?' · ya llegó '+fmtNum(f.llego)+' · falta '+fmtNum(f.falta):''}</span></span>
      <input type="number" min="0" inputmode="decimal" id="rec-${f.itemId}" value="${f.falta}"></label>`).join('')}</div>
    <input id="rec-nota" placeholder="Nota (opcional, ej. llegó una hoja dañada)" style="margin-top:10px">
    ${fotoPickerHtml('rec','Foto de lo que llegó (opcional, útil si llegó dañado)')}
    <div class="row" style="justify-content:space-between;margin-top:10px">
      <button class="btn small" style="background:transparent;color:var(--sub);border:1px solid var(--line);box-shadow:none" onclick="pedRecibiendo=null;renderPed()">Cancelar</button>
      <button class="btn" onclick="confirmarRecepcion('${p.id}')">✅ Guardar lo que llegó</button>
    </div>
  </div>`;
}
async function confirmarRecepcion(id){
  const p = pedidos.find(x=>x.id===id); if(!p) return;
  const r0 = resumenPedido(p);
  const items = r0.filas.filter(f=>f.cantidad>0).map(f=>({itemId:f.itemId, itemNombre:f.itemNombre, unidad:f.unidad, cantidad:Math.max(0, Number(document.getElementById('rec-'+f.itemId).value)||0)}));
  const nota = (document.getElementById('rec-nota').value||'').trim();
  const llegan = items.filter(i=>i.cantidad>0);
  if(!llegan.length) return alert('No escribiste ninguna cantidad. Si no llegó nada, toca Cancelar.');
  const quedan = r0.filas.filter(f=>f.cantidad>0).map(f=>({f, falta: fmtNum(f.falta - ((items.find(i=>i.itemId===f.itemId)||{}).cantidad||0))})).filter(x=>x.falta>0);
  if(!confirm(`Llegó:\n\n${llegan.map(i=>`• ${fmtNum(i.cantidad)} ${i.unidad} ${i.itemNombre}`).join('\n')}${quedan.length?`\n\n⏳ Seguirá pendiente:\n${quedan.map(x=>`• ${fmtNum(x.falta)} ${x.f.unidad} ${x.f.itemNombre}`).join('\n')}`:'\n\n✅ Con esto el pedido queda completo.'}\n\n¿Guardar?`)) return;
  try{
    const estado = estadoNuevoMovimiento();
    const loteId = cryptoId(), creadoPor = getCurrentUserEmail?getCurrentUserEmail():'', fecha = new Date().toISOString();
    const nEntrega = r0.recs.length + 1;
    const notaMov = `Pedido${p.proveedor?' de '+p.proveedor:''}${nEntrega>1?' · entrega '+nEntrega:''}${nota?' · '+nota:''}`;
    for(const i of llegan){
      const nf = (fotosTmp.rec||[]).length;
      await db.collection('movimientos').doc(cryptoId()).set({modulo:p.modulo, itemId:i.itemId, itemNombre:i.itemNombre, tipo:'entrada', cantidad:i.cantidad, nota:notaMov, fecha, estado, loteId, pedidoId:p.id, creadoPor, ...(nf?{fotos:nf, fotosRef:loteId}:{})});
    }
    const nFotosRec = await guardarFotos('rec', 'pedido', loteId, p.modulo);
    const recepciones = recepcionesDe(p).concat([{fecha, por:creadoPor, items, nota, loteId, fotos:nFotosRec||0}]);
    await db.collection('pedidos').doc(p.id).update({recepciones, recibido:null, estado: quedan.length ? 'enCamino' : 'recibido'});
    pedRecibiendo = null; pedSub = quedan.length ? 'camino' : 'recibidos';
    toast(quedan.length ? '✅ Guardado. Lo que falta sigue en camino.' : (estado==='pendiente' ? '✅ Guardado. Dirección lo revisa y lo suma al inventario.' : '✅ Recibido y sumado al inventario.'));
    renderPed();
  }catch(e){ alert('Error: '+e.message); }
}
async function aprobarRecepcion(id, idx){ const p=pedidos.find(x=>x.id===id); const r=p&&recepcionesDe(p)[idx]; if(!r) return; try{ await cambiarEstadoLote(r.loteId,'aprobado'); toast('✅ Sumado al inventario de '+p.modulo+'.'); renderPed(); }catch(e){ alert('Error: '+e.message); } }
async function rechazarRecepcion(id, idx){ const p=pedidos.find(x=>x.id===id); const r=p&&recepcionesDe(p)[idx]; if(!r) return; if(!confirm('¿Rechazar esta entrega? No se sumará al inventario y esas cantidades vuelven a quedar pendientes.')) return; try{ await cambiarEstadoLote(r.loteId,'rechazado'); if(p.estado==='recibido') await db.collection('pedidos').doc(p.id).update({estado:'enCamino'}); renderPed(); }catch(e){ alert('Error: '+e.message); } }
async function cerrarPedido(id){
  const p=pedidos.find(x=>x.id===id); if(!p) return; const r=resumenPedido(p);
  if(!confirm(`¿Cerrar este pedido? Lo que falta ya no se esperará:\n\n${r.faltan.map(f=>`• ${fmtNum(f.falta)} ${f.unidad} ${f.itemNombre}`).join('\n')}`)) return;
  try{ await db.collection('pedidos').doc(id).update({estado:'cerrado', cerradoEn:new Date().toISOString(), faltanteAlCerrar:r.faltan.map(f=>({itemId:f.itemId, itemNombre:f.itemNombre, cantidad:f.falta}))}); pedSub='recibidos'; renderPed(); }catch(e){ alert('Error: '+e.message); }
}
// Reporte (confirmado por el usuario): qué material le falta por llegar a cada módulo.
function faltantesPorModulo(lista){
  const out = {};
  lista.forEach(p=>resumenPedido(p).faltan.forEach(f=>{ const m=(out[p.modulo]=out[p.modulo]||{}); const k=f.itemId;
    m[k] = m[k] || {itemNombre:f.itemNombre, unidad:f.unidad||'', falta:0, pedidos:[]};
    m[k].falta = fmtNum(m[k].falta + Number(f.falta)); m[k].pedidos.push(`${p.proveedor||'Pedido'} (${fechaCorta(p.fecha)}${p.fechaEstimada?', llega aprox. '+fechaCorta(p.fechaEstimada):''})`); }));
  return out;
}
function pedFaltanHtml(lista){
  const fm = faltantesPorModulo(lista);
  const mods = MODULOS.map(m=>m.nombre).filter(m=>fm[m]);
  return `<div class="card"><strong>📋 Lo que falta por entregar</strong>
      <p class="hint">Todo lo que se pidió y todavía no llega, por módulo (incluye lo que llegó incompleto).</p>
      <button class="btn small" onclick="descargarFaltanCSV()">📊 Descargar Excel</button></div>
    ${mods.length ? mods.map(m=>`<div class="card"><strong>📍 ${m}</strong>
      <div class="wrap-x" style="margin-top:6px"><table><tr><th>Artículo</th><th style="text-align:right">Falta</th><th>De qué pedido</th></tr>
      ${Object.values(fm[m]).sort((a,b)=>a.itemNombre.localeCompare(b.itemNombre)).map(x=>`<tr><td>${x.itemNombre}</td><td style="text-align:right;white-space:nowrap"><strong>${fmtNum(x.falta)}</strong> ${x.unidad}</td><td class="hint" style="margin:0">${x.pedidos.join('<br>')}</td></tr>`).join('')}
      </table></div></div>`).join('') : '<div class="card hint">No falta nada por entregar. 🎉</div>'}`;
}
function descargarFaltanCSV(){
  const lista = pedidos.filter(p=>p.estado!=='cancelado' && (esSoloLectura() || p.modulo===modulo()) && pedidoEnCamino(p));
  const fm = faltantesPorModulo(lista);
  const filas = [['Módulo','Artículo','Unidad','Falta por llegar','Pedido(s)']];
  MODULOS.forEach(({nombre})=>Object.values(fm[nombre]||{}).forEach(x=>filas.push([nombre, x.itemNombre, x.unidad, fmtNum(x.falta), x.pedidos.join(' | ')])));
  descargarCSV(`falta-por-entregar-${fechaHoyLocal()}.csv`, filas);
}
async function cancelarPedido(id){ if(!confirm('¿Cancelar este pedido? Ya no aparecerá como en camino.')) return; try{ await db.collection('pedidos').doc(id).update({estado:'cancelado', canceladoEn:new Date().toISOString()}); renderPed(); }catch(e){ alert('Error: '+e.message); } }

// ===== Panel de usuarios (solo admin) =====
// Usa la Edge Function 'admin-usuarios' (ver auth.js / supabase/functions/admin-usuarios) para
// crear cuentas, cambiar rol/módulo/contraseña, o eliminar usuarios. La app nunca ve ni guarda
// la llave maestra de Supabase; solo manda el token de la sesión de quien ya inició sesión aquí.
let usuariosCache = [];
async function renderUsuarios(){
  if(!esAdmin()){ $('#main').innerHTML = '<div class="card">Esta sección es solo para el administrador.</div>'; return; }
  $('#main').innerHTML = '<div class="card">Cargando usuarios…</div>';
  try{ usuariosCache = (await listarUsuarios()).perfiles || []; }
  catch(e){ $('#main').innerHTML = `<div class="card">No se pudo cargar la lista de usuarios: ${e.message}<p class="hint">Si el error dice "Failed to fetch" o "404", probablemente la función 'admin-usuarios' todavía no está pegada en tu proyecto de Supabase — dile a Claude que te pase esa parte del README.</p></div>`; return; }

  const rolOpts = (sel)=>['admin','administracion','coordinador','supervisor','gerente'].map(r=>`<option value="${r}" ${r===sel?'selected':''}>${ROL_LABELS[r]}</option>`).join('');
  const moduloOpts = (sel)=>`<option value="">(sin módulo)</option>`+MODULOS.map(m=>`<option value="${m.nombre}" ${m.nombre===sel?'selected':''}>${m.nombre}</option>`).join('');

  let html = `<div class="card">
    <strong>Crear usuario</strong>
    <p class="hint">Crea la cuenta completa (correo + contraseña) y le asigna rol y módulo de una vez. La persona ya puede entrar con esos datos.</p>
    <div class="grid2" style="margin-top:8px">
      <input id="uu-email" type="email" placeholder="correo">
      <input id="uu-pass" type="password" placeholder="contraseña temporal (mín. 6)">
    </div>
    <div class="grid2" style="margin-top:8px">
      <select id="uu-rol" onchange="toggleUuModulo()">${rolOpts('coordinador')}</select>
      <select id="uu-modulo">${moduloOpts('')}</select>
    </div>
    <button class="btn" style="margin-top:10px" onclick="crearUsuarioUI()">Crear usuario</button>
  </div>`;

  html += `<div class="card"><h3>Usuarios (${usuariosCache.length})</h3>
    <div class="wrap-x"><table><tr><th>Correo</th><th>Rol</th><th>Módulo</th><th></th></tr>
    ${usuariosCache.map(u=>`<tr>
      <td>${u.email||'(sin correo)'}</td>
      <td><select id="uu-rol-${u.user_id}">${rolOpts(u.rol)}</select></td>
      <td><select id="uu-mod-${u.user_id}">${moduloOpts(u.modulo)}</select></td>
      <td style="white-space:nowrap">
        <button class="btn small" onclick="guardarPerfilUsuario('${u.user_id}')">Guardar</button>
        <button class="btn small" style="background:transparent;border:1px solid var(--line)" onclick="cambiarPasswordUsuarioUI('${u.user_id}')">Contraseña</button>
        <button class="btn small" style="background:transparent;color:var(--bad);border:1px solid var(--line)" onclick="eliminarUsuarioUI('${u.user_id}','${(u.email||'').replace(/'/g,"")}')">Eliminar</button>
      </td>
    </tr>`).join('')}
    </table></div>
    <p class="hint">"Guardar" aplica el rol y módulo elegidos en esa fila. "Eliminar" borra la cuenta por completo (no se puede deshacer).</p>
  </div>`;

  $('#main').innerHTML = html;
}
function toggleUuModulo(){ /* placeholder por si luego se quiere ocultar el módulo cuando el rol no es coordinador */ }

async function crearUsuarioUI(){
  const email = $('#uu-email').value.trim();
  const pass = $('#uu-pass').value;
  const rol = $('#uu-rol').value;
  const modulo = $('#uu-modulo').value || null;
  if(!email || !pass) return alert('Captura correo y contraseña.');
  if(pass.length<6) return alert('La contraseña debe tener al menos 6 caracteres.');
  try{
    await crearUsuario(email, pass, rol, modulo);
    alert('Usuario creado. Ya puede iniciar sesión con ese correo y contraseña.');
    renderUsuarios();
  }catch(e){ alert('Error: '+e.message); }
}
async function guardarPerfilUsuario(userId){
  const rol = document.getElementById('uu-rol-'+userId).value;
  const modulo = document.getElementById('uu-mod-'+userId).value || null;
  try{ await actualizarPerfilUsuario(userId, rol, modulo); alert('Perfil actualizado.'); renderUsuarios(); }
  catch(e){ alert('Error: '+e.message); }
}
async function cambiarPasswordUsuarioUI(userId){
  const pass = prompt('Nueva contraseña para este usuario (mín. 6 caracteres):');
  if(pass===null) return;
  if(pass.length<6) return alert('La contraseña debe tener al menos 6 caracteres.');
  try{ await cambiarPasswordUsuario(userId, pass); alert('Contraseña actualizada.'); }
  catch(e){ alert('Error: '+e.message); }
}
async function eliminarUsuarioUI(userId, email){
  if(!confirm('¿Eliminar la cuenta de '+(email||userId)+'? No se puede deshacer.')) return;
  try{ await eliminarUsuario(userId); alert('Usuario eliminado.'); renderUsuarios(); }
  catch(e){ alert('Error: '+e.message); }
}

// ===== Respaldo manual: exporta toda la base local a un archivo JSON descargable =====
// ===== Borrar datos de prueba (confirmado por el usuario) =====
// Deja los módulos elegidos en blanco, como recién instalados. Se borra con la misma marca de
// "borrado" que usa la sincronización, así también desaparece en la nube y en los demás celulares.
const COLECCIONES_MODULO = ['movimientos','inicial','inicialHist','resets','auditorias','deudasAuditoria','garantiasLog','instalacionesLog','instalacionesPuertas','conteoAbierto','pedidos','fotos','sobrantes'];
async function borrarDatosModulo(mods){
  if(!esAdmin()) return alert('Solo Dirección puede borrar datos.');
  const nombre = mods.length>1 ? 'LOS 5 MÓDULOS' : mods[0];
  const pin = prompt(`🗑️ Vas a BORRAR TODO de ${nombre}.\n\nEscribe el PIN de Dirección:`);
  if(pin===null) return;
  if(pin!==(await getPinCero())) return alert('PIN incorrecto. No se borró nada.');
  // Contar primero lo que se va a borrar
  const aBorrar = [];
  for(const col of COLECCIONES_MODULO){
    try{
      const snap = await db.collection(col).get();
      snap.docs.forEach(d=>{ const x=d.data()||{}; const m = x.modulo || (col==='resets'||col==='conteoAbierto' ? d.id : null); if(mods.includes(m)) aBorrar.push([col,d.id]); });
    }catch(e){}
  }
  try{
    const snap = await db.collection('prestamos').get();
    snap.docs.forEach(d=>{ const x=d.data()||{}; if(mods.includes(x.origen)||mods.includes(x.destino)) aBorrar.push(['prestamos',d.id]); });
  }catch(e){}
  const porCol = {}; aBorrar.forEach(([c])=>porCol[c]=(porCol[c]||0)+1);
  const nombres = {movimientos:'movimientos (entradas, salidas, cortes, instalaciones, garantías…)', inicial:'stock inicial', inicialHist:'historial del stock inicial', resets:'puestas en cero', auditorias:'auditorías y conteos', deudasAuditoria:'faltantes (deuda)', garantiasLog:'garantías', instalacionesLog:'instalaciones', instalacionesPuertas:'instalaciones de puertas', conteoAbierto:'conteos abiertos', prestamos:'traspasos / préstamos', pedidos:'pedidos por llegar', fotos:'fotos de evidencia', sobrantes:'sobrantes'};
  if(!aBorrar.length) return alert(`${nombre} ya está en blanco. No hay nada que borrar.`);
  const detalle = Object.keys(porCol).map(c=>`• ${porCol[c]} ${nombres[c]||c}`).join('\n');
  const aviso = mods.length===1 ? `\n\nOjo: los traspasos de ${mods[0]} con otros módulos también se borran, pero la entrada o salida que quedó en el OTRO módulo se queda allá.` : '';
  const conf = prompt(`Se va a borrar de ${nombre}:\n\n${detalle}${aviso}\n\nNO se puede deshacer. Para confirmar escribe: BORRAR`);
  if(conf===null) return;
  if(conf.trim().toUpperCase()!=='BORRAR') return alert('No escribiste BORRAR. No se borró nada.');
  try{
    toast('Borrando… no cierres la app.');
    for(const [col,id] of aBorrar){ await db.collection(col).doc(id).delete(); }
    mods.forEach(m=>{ try{ localStorage.removeItem('borradorAud_'+m); }catch(e){} });
    auditCapturas={}; auditPiezas={}; auditArmados=[];
    alert(`✅ Listo: se borraron ${aBorrar.length} registro(s). ${nombre} quedó en blanco.\n\nSi otros celulares tenían la app abierta, se limpian solos al sincronizar.`);
    setView('home');
  }catch(e){ alert('Error al borrar: '+e.message+'\n\nVuelve a intentarlo; lo que ya se borró no regresa.'); }
}

async function exportarRespaldo(){
  const COLLECTIONS = ['inicial','movimientos','resets','auditorias','instalacionesLog','instalacionesPuertas','prestamos','config'];
  const data = {};
  for(const c of COLLECTIONS){
    const snap = await db.collection(c).get();
    data[c] = snap.docs.map(d=>({id:d.id, ...d.data()}));
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
  a.href = url; a.download = `respaldo-auditoriamodulos-${stamp}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

// ===== Cerrar inventario diario: genera un PDF con el inventario completo del módulo =====
async function cerrarInventarioDiarioUI(modo){
  if(!(window.jspdf && window.jspdf.jsPDF)){
    alert('No se pudo cargar el generador de PDF. Revisa tu conexión a internet e intenta de nuevo.');
    return;
  }
  try{ await generarReporteDiarioPDF(modo||'completo'); }
  catch(e){ alert('No se pudo generar el reporte: '+e.message); }
}

// modo 'completo' = inventario completo; modo 'sincortar' = solo la hoja de hojas enteras.
// Reporte diario con colores por material y hoja final de hojas enteras (confirmado por el usuario).
const PDF_CAT_COLOR = {
  'Melamina':[35,72,181], 'MDF':[138,90,43], 'Cintilla':[13,116,104], 'PVC':[74,59,143],
  'Pegamento':[194,65,12], 'Stickers':[190,24,93], 'Herrajes':[55,65,81]
};
const PDF_SWATCH_RGB = {'Blanco':[247,247,244],'Cenizo':[185,178,166],'Beige':[227,211,181],'Durango':[155,107,67],'Gris':[141,145,150],'Lino':[216,207,192],'Bco Mármol':[236,236,236],'Neg Mármol':[45,45,45],'Monarca':[110,74,47],'Negro':[29,29,31],'Nogal':[90,59,38],'Polar':[232,236,239],'Rioja':[138,75,50],'Roble':[179,132,82],'Roble Santana':[166,120,74],'Choco':[74,46,34]};
function pdfTinte(rgb, t){ return rgb.map(v=>Math.round(v+(255-v)*t)); }
async function generarReporteDiarioPDF(modo){
  modo = modo || 'completo';
  const soloSinCortar = modo==='sincortar';
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const mod = modulo();
  const ahora = new Date();
  const fechaStr = ahora.toLocaleDateString('es-MX', {year:'numeric', month:'long', day:'numeric'});
  const horaStr = ahora.toLocaleTimeString('es-MX', {hour:'numeric', minute:'2-digit'});
  const marginL = 14, W = 182;
  const pageH = doc.internal.pageSize.getHeight();
  const COLS_NORMAL = [
    {label:'Artículo', w:54}, {label:'Inicial', w:16}, {label:'Entr.', w:16}, {label:'Sal.', w:16},
    {label:'Instal.', w:16}, {label:'Garant.', w:16}, {label:'Mermas', w:16}, {label:'Ajuste', w:16}, {label:'Final', w:16, k:'final'}
  ];
  const COLS_HOJA = [
    {label:'Artículo', w:38}, {label:'Inicial', w:13.1}, {label:'Entr.', w:13.1}, {label:'Sal.', w:13.1},
    {label:'Corte', w:13.1}, {label:'Instal.', w:13.1}, {label:'Garant.', w:13.1}, {label:'Mermas', w:13.1}, {label:'Ajuste', w:13.1},
    {label:'Compl.', w:13.1, k:'compl'}, {label:'Cortado', w:13.1, k:'cort'}, {label:'Final', w:13.1, k:'final'}
  ];
  let cols = COLS_NORMAL, color = [35,72,181];
  const tableW = () => cols.reduce((s,c)=>s+c.w,0);
  const colX = i => { let x=marginL; for(let k=0;k<i;k++) x+=cols[k].w; return x; };
  let y = 0;

  // Encabezado con franja de marca
  const encabezado = (titulo, sub) => {
    doc.setFillColor(35,72,181); doc.rect(0,0,210,24,'F');
    doc.setFillColor(255,211,77); doc.rect(0,24,210,1.6,'F');
    doc.setTextColor(255,255,255); doc.setFont(undefined,'bold'); doc.setFontSize(15);
    doc.text(titulo, marginL, 11);
    doc.setFont(undefined,'normal'); doc.setFontSize(9.5);
    doc.text(sub, marginL, 18);
    doc.setTextColor(0,0,0);
    y = 33;
  };
  const correo = (typeof getCurrentUserEmail==='function' ? getCurrentUserEmail() : '') || '';
  if(!soloSinCortar){
  encabezado('Closets Vera · Inventario diario', `Módulo ${mod}  ·  ${fechaStr}, ${horaStr}${correo?'  ·  '+correo:''}`);

  // Tarjetas de resumen: completas / cortado / total por tipo de hoja
  const resumen = ['Melamina','MDF'].map(cat=>{
    const t = CATALOGO.filter(i=>i.cat===cat).reduce((s,it)=>{ const f=calcFormula(it.id); s.c+=f.completas; s.k+=f.cortado; s.t+=f.final; s.a+=f.autoCortes; return s; },{c:0,k:0,t:0,a:0});
    return {cat, ...t};
  });
  resumen.forEach((r,i)=>{
    const c = PDF_CAT_COLOR[r.cat], x = marginL + i*(W/2+2), w = W/2-2;
    doc.setFillColor(...pdfTinte(c,.9)); doc.rect(x, y, w, 22, 'F');
    doc.setFillColor(...c); doc.rect(x, y, 1.6, 22, 'F');
    doc.setFont(undefined,'bold'); doc.setFontSize(10); doc.setTextColor(...c); doc.text(r.cat, x+4, y+5.5);
    const box = (lbl, val, bx, rgb) => { doc.setFontSize(7.5); doc.setFont(undefined,'normal'); doc.setTextColor(90,96,112); doc.text(lbl, bx, y+11.5); doc.setFontSize(13); doc.setFont(undefined,'bold'); doc.setTextColor(...rgb); doc.text(fmtNum(val)+'', bx, y+18.5); };
    box('Completas', r.c, x+4, [35,72,181]); box('Cortado', r.k, x+30, [214,69,69]); box('Total', r.t, x+56, [22,26,43]);
    doc.setTextColor(0,0,0); doc.setFont(undefined,'normal');
  });
  y += 28;
  // Leyenda de colores de columnas
  doc.setFontSize(7.5); doc.setTextColor(90,96,112);
  doc.setFillColor(...pdfTinte([35,72,181],.82)); doc.rect(marginL, y-2.6, 3.5, 3.5, 'F'); doc.text('Completas', marginL+5, y);
  doc.setFillColor(...pdfTinte([214,69,69],.82)); doc.rect(marginL+24, y-2.6, 3.5, 3.5, 'F'); doc.text('Cortado', marginL+29, y);
  doc.setFont(undefined,'bold'); doc.text('Final en negritas', marginL+46, y); doc.setFont(undefined,'normal');
  doc.text('·  números en rojo = negativo  ·  "–" = sin movimiento', marginL+72, y);
  doc.setTextColor(0,0,0); y += 6;

  function drawHeaderRow(){
    doc.setFillColor(...color); doc.rect(marginL, y, tableW(), 6, 'F');
    doc.setTextColor(255,255,255); doc.setFontSize(7.5); doc.setFont(undefined,'bold');
    cols.forEach((c,i)=> i===0 ? doc.text(c.label, colX(i)+1.5, y+4.2) : doc.text(c.label, colX(i)+c.w-1.5, y+4.2, {align:'right'}));
    doc.setFont(undefined,'normal'); doc.setTextColor(0,0,0);
    y += 6;
  }
  function tituloCat(cat){
    doc.setFillColor(...pdfTinte(color,.88)); doc.rect(marginL, y, tableW(), 7, 'F');
    doc.setFillColor(...color); doc.rect(marginL, y, 1.6, 7, 'F');
    doc.setFontSize(10.5); doc.setFont(undefined,'bold'); doc.setTextColor(...color);
    doc.text(cat, marginL+4, y+5);
    doc.setFont(undefined,'normal'); doc.setTextColor(0,0,0);
    y += 7;
  }
  const cats = [...new Set(CATALOGO.map(i=>i.cat))];
  cats.forEach(cat=>{
    const items = CATALOGO.filter(i=>i.cat===cat);
    const catHoja = items.length>0 && esHoja(items[0]);
    cols = catHoja ? COLS_HOJA : COLS_NORMAL; color = PDF_CAT_COLOR[cat] || [55,65,81];
    if(y > pageH-34){ doc.addPage(); y=15; }
    tituloCat(cat); drawHeaderRow();
    items.forEach((it,idx)=>{
      if(y > pageH-15){ doc.addPage(); y=15; tituloCat(cat+' (continúa)'); drawHeaderRow(); }
      const f = calcFormula(it.id);
      const vals = catHoja
        ? [it.nombre, f.inicial, f.entradas, f.salidas, f.cortes+f.autoCortes, f.instalaciones, f.garantias, f.mermas, f.ajustes, f.completas, f.cortado, f.final]
        : [it.nombre, f.inicial, f.entradas, f.salidas, f.instalaciones, f.garantias, f.mermas, f.ajustes, f.final];
      if(idx%2===1){ doc.setFillColor(...pdfTinte(color,.94)); doc.rect(marginL, y, tableW(), 5, 'F'); }
      cols.forEach((c,i)=>{ if(c.k==='compl'){ doc.setFillColor(...pdfTinte([35,72,181], idx%2? .78:.84)); doc.rect(colX(i), y, c.w, 5, 'F'); }
        if(c.k==='cort'){ doc.setFillColor(...pdfTinte([214,69,69], idx%2? .78:.84)); doc.rect(colX(i), y, c.w, 5, 'F'); } });
      doc.setFontSize(8);
      vals.forEach((v,i)=>{
        if(i===0){ let t=String(v); const max = catHoja?22:32; if(t.length>max) t=t.slice(0,max-2)+'…'; doc.text(t, colX(0)+1.5, y+3.6); return; }
        const n = Number(v)||0, c = cols[i];
        if(Math.abs(n)<0.0005 && c.k!=='final' && c.k!=='compl' && c.k!=='cort'){ doc.setTextColor(170,175,188); doc.text('–', colX(i)+c.w-1.5, y+3.6, {align:'right'}); doc.setTextColor(0,0,0); return; }
        if(n<0) doc.setTextColor(214,69,69);
        if(c.k==='final') doc.setFont(undefined,'bold');
        doc.text(String(fmtNum(n)), colX(i)+c.w-1.5, y+3.6, {align:'right'});
        doc.setFont(undefined,'normal'); doc.setTextColor(0,0,0);
      });
      y += 5;
    });
    y += 6;
  });

  // Correderas al final de las tablas (antes de la hoja de hojas enteras)
  {
    const corrHoy = correderasHoy();
    if(corrHoy.length){
      if(y > pageH-30){ doc.addPage(); y=15; }
      color=[55,65,81]; cols = [ {label:'Correderas (inventario de hoy)', w:62}, {label:'Juegos completos', w:40, k:'final'}, {label:'Hembras sin macho', w:40}, {label:'Machos sin hembra', w:40} ];
      tituloCat('Correderas'); drawHeaderRow();
      corrHoy.forEach((bc,idx)=>{ if(idx%2===1){ doc.setFillColor(...pdfTinte(color,.94)); doc.rect(marginL, y, tableW(), 5.5, 'F'); }
        doc.setFontSize(8.5); doc.text(bc.etiqueta, colX(0)+1.5, y+4);
        [bc.juegos,bc.hembras,bc.machos].forEach((v,i)=>{ if(i===0) doc.setFont(undefined,'bold'); doc.text(String(fmtNum(v)), colX(i+1)+cols[i+1].w-1.5, y+4, {align:'right'}); doc.setFont(undefined,'normal'); });
        y += 5.5; });
    }
  }

  } // fin de la parte de tablas
  // Hoja final (confirmado por el usuario): SOLO hojas enteras de Melamina y MDF (3 y 5 mm).
  {
    if(!soloSinCortar) doc.addPage();
    encabezado('Hojas enteras', `Lo que hay sin cortar  ·  Módulo ${mod}  ·  ${fechaStr}, ${horaStr}`);
    // Diseño sencillo como las demás tablas, con resaltes (confirmado por el usuario).
    const hdr = () => {
      doc.setFillColor(...color); doc.rect(marginL, y, tableW(), 6, 'F');
      doc.setTextColor(255,255,255); doc.setFontSize(7.5); doc.setFont(undefined,'bold');
      cols.forEach((c,i)=> i===0 ? doc.text(c.label, colX(i)+1.5, y+4.2) : doc.text(c.label, colX(i)+c.w-2, y+4.2, {align:'right'}));
      doc.setFont(undefined,'normal'); doc.setTextColor(0,0,0); y += 6;
    };
    const tablaEnteras = (cat, titulo) => {
      const datos = CATALOGO.filter(i=>i.cat===cat).map(it=>({it, n:calcFormula(it.id).completas}));
      if(!datos.length) return;
      color = PDF_CAT_COLOR[cat];
      const tot = datos.reduce((s2,x)=>s2+x.n,0);
      cols = [ {label: cat==='MDF'?'Espesor':'Color', w:122}, {label:'Hojas enteras', w:60, k:'compl'} ];
      if(y > pageH-40){ doc.addPage(); y=15; }
      // Título con el total a la derecha
      doc.setFillColor(...pdfTinte(color,.88)); doc.rect(marginL, y, tableW(), 8, 'F');
      doc.setFillColor(...color); doc.rect(marginL, y, 1.6, 8, 'F');
      doc.setFontSize(11); doc.setFont(undefined,'bold'); doc.setTextColor(...color);
      doc.text(titulo, marginL+4, y+5.6); doc.text(`Total: ${fmtNum(tot)} hojas`, marginL+tableW()-2, y+5.6, {align:'right'});
      doc.setFont(undefined,'normal'); doc.setTextColor(0,0,0); y += 8;
      hdr();
      datos.forEach((x,idx)=>{
        if(y > pageH-15){ doc.addPage(); y=15; hdr(); }
        const cero = x.n<0.0005, poco = !cero && x.n<=4+1e-9, rh = 6;
        if(idx%2===1){ doc.setFillColor(...pdfTinte(color,.95)); doc.rect(marginL, y, tableW(), rh, 'F'); }
        // Resaltes: 0 en rojo, 4 o menos en amarillo, lo demás en el color del material.
        doc.setFillColor(...(cero?[253,226,226]:(poco?[255,243,196]:pdfTinte(color, idx%2? .80:.86)))); doc.rect(colX(1), y, cols[1].w, rh, 'F');
        doc.setFontSize(9); doc.setTextColor(22,26,43);
        doc.text(x.it.nombre==='MDF 5mm' ? 'MDF 5mm Blanco' : x.it.nombre, marginL+1.5, y+4.2);
        doc.setFont(undefined,'bold'); doc.setFontSize(10);
        doc.setTextColor(...(cero?[200,40,40]:(poco?[146,96,0]:color)));
        doc.text(String(fmtNum(x.n)), colX(1)+cols[1].w-2, y+4.3, {align:'right'});
        doc.setFont(undefined,'normal'); doc.setTextColor(0,0,0);
        y += rh;
      });
      y += 8;
    };
    tablaEnteras('Melamina','Melamina');
    tablaEnteras('MDF','MDF (3 y 5 mm)');
    doc.setFontSize(8); doc.setTextColor(110,116,132);
    doc.text('Solo hojas completas, sin contar lo ya cortado.  Rojo = 0 hojas  ·  Amarillo = 4 o menos.', marginL, y);
    doc.setTextColor(0,0,0);
  }

  const stamp = ahora.toISOString().slice(0,10);
  const filename = `${soloSinCortar?'hojas-enteras':'inventario'}-${mod.replace(/\s+/g,'_')}-${stamp}.pdf`;
  const blob = doc.output('blob');
  if(navigator.canShare && navigator.canShare({ files:[new File([blob], filename, {type:'application/pdf'})] })){
    try{
      await navigator.share({ files:[new File([blob], filename, {type:'application/pdf'})], title: soloSinCortar?'Hojas enteras':'Inventario diario', text:`${soloSinCortar?'Hojas enteras':'Inventario diario'} · ${mod} · ${fechaStr}` });
      return;
    }catch(e){ /* si cancela o falla compartir, cae a la descarga normal */ }
  }
  doc.save(filename);
}
window.exportarRespaldo = exportarRespaldo;

// ===== Arranque: primero resolvemos sesión (si Supabase está configurado), luego init() =====
(async function boot(){
  if(authAvailable()){
    const user = await getSession();
    if(!user){
      renderLogin(document.getElementById('main'), () => { document.getElementById('nav').style.display='none'; boot(); });
      document.getElementById('nav').style.display='none';
      return;
    }
    miPerfil = await getMyProfile();
    const rolLabel = miPerfil ? (ROL_LABELS[miPerfil.rol] || miPerfil.rol) : '';
    document.getElementById('whoami').textContent = user.email + (rolLabel? ' · '+rolLabel : '');
  } else {
    document.getElementById('whoami').textContent = 'modo local';
  }
  init();
})();
