// ===== AuditoriaModulos · Clóset Vera =====
// App independiente (PWA) — funciona con o sin internet. Las lecturas/escrituras van
// primero a IndexedDB (ver src/db.js) y se sincronizan con Supabase en cuanto hay señal.
// NOTA: este archivo es un script clásico (no type="module") a propósito: toda la UI usa
// atributos onclick="..." inline en el HTML generado, y esos solo pueden llamar funciones
// que cuelguen de `window` — lo que Un script clásico hace automáticamente con cada
// `function nombre(){}` de nivel superior. db/initSync/auth, etc. los expone src/bootstrap.js
// (un módulo aparte) como variables globales ANTES de insertar este script; ver index.html.


const $=s=>document.querySelector(s);
let inicialMap={}, inicialCortadoMap={}, inicialFechaMap={}, movs=[], resetMap={}, auditorias=[], deudas=[], histTab='aud', current='inv';
let auditCat=null, auditCapturas={};
// Piezas cortadas contadas en la auditoría: { 'Blanco': {pared:3, ...}, 'MDF': {fondocajon:10} }
let auditPiezas={}, auditPiezaGrupo=null, audTipo='inicial', audAuditor='';
// Armados contados (cajoneras sin cajones, cajones completos, cuadros de cajón)
let auditArmados=[], auditArmadoForm={tipo:'cajonera', variante:'3', color:'Blanco', colorCuadro:'Blanco', ext:false, puertitas:false, cantidad:''};
let moduloActual = localStorage.getItem('am_modulo') || null;
// Perfil del usuario (rol + módulo asignado). Lo llena boot() con getMyProfile() antes de
// llamar a init(). rol guardado en la base (nunca cambia, lo usan los permisos/RLS): 'admin'
// (ve/edita todo) | 'coordinador' (solo su módulo) | 'supervisor' (ve todo, sin capturar) |
// 'gerente' (igual que supervisor: ve todo, sin capturar; es solo otra etiqueta). ROL_LABELS
// es nada más el nombre que se muestra en pantalla (p.ej. 'admin' se ve como "Dirección"
// para no decir "dueño"); el valor guardado en la base no cambia. Sin Supabase configurado,
// miPerfil queda null y la app se comporta como antes (un solo usuario local, sin restricciones).
let miPerfil = null;
const ROL_LABELS = { admin:'Dirección', coordinador:'Coordinador', supervisor:'Supervisor', gerente:'Gerente' };
function puedeEscribir(){ return !miPerfil || miPerfil.rol==='admin' || miPerfil.rol==='coordinador'; }
function esAdmin(){ return !miPerfil || miPerfil.rol==='admin'; }
// Lo que capture un coordinador queda "pendiente" hasta que Dirección lo apruebe; lo de
// Dirección (o traspasos, que siempre son inmediatos) se guarda ya "aprobado".
function estadoNuevoMovimiento(){ return esAdmin() ? 'aprobado' : 'pendiente'; }
let instSub = 'mueble';
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
  cajonera_max: 'Cajonera Max (4 cajones)',
  zapatera: 'Zapatera',
  repisa: 'Repisa'
};

// ===== Composición por muebles: en vez de elegir un modelo con nombre, se arma la familia
// mueble por mueble (entrepañera / cajonera / Emma / espejo / Max), confirmado por el usuario:
// "las cajoneras Emma y Max sustituyen los muebles... esto aplica para todos los modelos".
const NUM_MUEBLES_FAM = {Lateral:1, Central:1, Doble:2, King:2, Triple:3, 'Doble Especial':2};
const FAMILIAS_COMP = Object.keys(NUM_MUEBLES_FAM);
const MUEBLE_TIPO_OPCIONES = [
  {value:'entrepanera', label:'Entrepañera'},
  {value:'cajonera_3', label:'Cajonera de 3 cajones'},
  {value:'cajonera_5', label:'Cajonera de 5 cajones'},
  {value:'cajonera_emma', label:'Cajonera Emma (4 cajones)'},
  {value:'cajonera_espejo', label:'Cajonera de espejo'},
  {value:'cajonera_max', label:'Cajonera Max (4 cajones)'},
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

const CATALOGO = [];
(function build(){
  const melColores=['Blanco','Cenizo','Beige','Durango','Gris','Lino','Bco Mármol','Neg Mármol','Monarca','Negro','Nogal','Polar','Rioja','Roble','Roble Santana','Choco'];
  melColores.forEach(c=>CATALOGO.push({cat:'Melamina',nombre:'Melamina '+c,unidad:'hojas'}));
  ['MDF 3mm','MDF 5mm'].forEach(n=>CATALOGO.push({cat:'MDF',nombre:n,unidad:'hojas'}));
  const cintillaPvcColores=['Blanco','Durango','Ébano Indi','Wengue','Nogal','Chardonnay','Ceniza','Lino','Roble Santana','Negro','Bco. Mármol','Negro Mármol','Roble','Polar','Rioja','Monarca'];
  cintillaPvcColores.forEach(c=>CATALOGO.push({cat:'Cintilla',nombre:'Cintilla '+c,unidad:'metros'}));
  cintillaPvcColores.forEach(c=>CATALOGO.push({cat:'PVC',nombre:'PVC '+c,unidad:'metros'}));
  ['Pegamento amarillo','Pegamento granulado'].forEach(n=>CATALOGO.push({cat:'Pegamento',nombre:n,unidad:'kg'}));
  CATALOGO.push({cat:'Stickers',nombre:'Stickers (colores por definir)',unidad:'pza'});
  ['Aros colgadores','Bastidores','Bisagras','Clavo 25','Clavo 30','Emplaye','Escuadras','Espejos closet','Espejos 60x160','Jaladeras','Juego de corredera','Lambrín por caja','Pijas 1','Pijas 2','Pijas 3/4','Pijas 5/8','Pintura blanca','Pintura choco','Pintura de colores','Pintura negra','Resbalones','Rieles','Sistemas','Taquetes','Tarugos','Tornillos recortables','Tubos 1.5 m','Correderas de extensión','Jaladera plana','Push']
    .forEach(n=>CATALOGO.push({cat:'Herrajes',nombre:n,unidad:'pza'}));
  CATALOGO.push({cat:'Herrajes',nombre:'Juegos de bridas',unidad:'juego'});
  CATALOGO.forEach(it=>it.id = slug(it.nombre));
})();
function slug(s){return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'_');}
function cryptoId(){return 'm'+Math.random().toString(36).slice(2,10);}
function item2unidad(itemId){ const it=CATALOGO.find(i=>i.id===itemId); return it? it.unidad:''; }
function itemByName(nombre){ return CATALOGO.find(i=>i.nombre===nombre); }
function modulo(){return moduloActual;}
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
  const ocultarTabs = (miPerfil.rol==='supervisor'||miPerfil.rol==='gerente') ? ['mov','aud','inst','trasp','usr','apr'] : (miPerfil.rol==='coordinador' ? ['aud','usr','apr','cat','hist'] : []);
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
  renderModBar();
  await loadStock();
  setView('home');
}

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
  await loadStock();
  setView('home');
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

async function loadStock(){
  try{
    db.collection('inicial').where('modulo','==',modulo()).onSnapshot(snap=>{
      inicialMap={}; inicialCortadoMap={}; inicialFechaMap={};
      snap.docs.forEach(d=>{ const x=d.data(); inicialMap[x.itemId]=x.cantidad; if(x.cortado) inicialCortadoMap[x.itemId]=x.cortado; if(x.fecha) inicialFechaMap[x.itemId]=x.fecha; });
      if(current==='home') renderHome();
      if(current==='inv') renderInv();
    });
  }catch(e){}
  try{
    db.collection('movimientos').onSnapshot(snap=>{
      movs = snap.docs.map(d=>({id:d.id,...d.data()})).filter(m=>m.modulo===modulo()).sort((a,b)=>(b.fecha||'').localeCompare(a.fecha||''));
      if(current==='inv') renderInv(); if(current==='mov') renderMov(); if(current==='home') renderHome();
    });
  }catch(e){}
  try{
    db.collection('resets').onSnapshot(snap=>{
      resetMap={}; snap.docs.forEach(d=>{ resetMap[d.id]=d.data().fecha; });
      if(current==='inv') renderInv();
    });
  }catch(e){}
  try{
    db.collection('auditorias').onSnapshot(snap=>{
      auditorias = snap.docs.map(d=>({id:d.id,...d.data()})).filter(a=>a.modulo===modulo()).sort((a,b)=>(b.fecha||'').localeCompare(a.fecha||''));
      if(current==='hist') renderHist();
    });
  }catch(e){}
  try{
    // Deuda por faltantes de auditoría (se conserva aparte aunque el inventario se ajuste)
    db.collection('deudasAuditoria').onSnapshot(snap=>{
      deudas = snap.docs.map(d=>({id:d.id,...d.data()})).filter(x=>x.modulo===modulo()).sort((a,b)=>(b.fechaAuditoria||'').localeCompare(a.fechaAuditoria||''));
      if(current==='hist') renderHist();
      if(current==='rep') renderRep();
    });
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

async function ceroModulo(){
  if(!esAdmin()) return alert('Solo el administrador puede poner el inventario en cero.');
  const pin = prompt('Ingresa el PIN de administrador para confirmar:');
  if(pin===null) return;
  const pinGuardado = await getPinCero();
  if(pin!==pinGuardado) return alert('PIN incorrecto. No se puso en cero el inventario.');
  if(!confirm('¿Poner en CERO el inventario de '+modulo()+'? Esto no borra el historial, pero el stock actual de este módulo partirá de 0. Los demás módulos no se afectan.')) return;
  try{ await db.collection('resets').doc(modulo()).set({fecha:new Date().toISOString()}); alert('Inventario de '+modulo()+' reiniciado a cero.'); }
  catch(e){ alert('Error: '+e.message); }
}

async function editInicial(itemId){
  if(!puedeEscribir()) return alert('Tu cuenta es de solo lectura; no puedes cambiar el inicial.');
  const actual = inicialMap[itemId] ?? 0;
  if(esHojaId(itemId)){
    // Hojas: la línea base se captura separada en completas y cortado/armado.
    const cortActual = inicialCortadoMap[itemId] ?? 0;
    const vComp = prompt('Stock inicial en '+modulo()+'\n\n1 de 2 · Hojas COMPLETAS:', fmtNum(actual - cortActual));
    if(vComp===null || vComp.trim()==='' || isNaN(Number(vComp)) || Number(vComp)<0) return;
    const vCort = prompt('Stock inicial en '+modulo()+'\n\n2 de 2 · Material CORTADO o armado (en hojas equivalentes, 0 si no hay):', fmtNum(cortActual));
    if(vCort===null || vCort.trim()==='' || isNaN(Number(vCort)) || Number(vCort)<0) return;
    const comp = Number(vComp), cort = Number(vCort);
    try{ await db.collection('inicial').doc(inicialKey(modulo(),itemId)).set({modulo:modulo(),itemId,cantidad:fmtNum(comp+cort),cortado:cort,fecha:new Date().toISOString(),creadoPor:getCurrentUserEmail?getCurrentUserEmail():''}); }
    catch(e){ alert('Error: '+e.message); }
    return;
  }
  const val = prompt('Stock inicial (línea base) para este artículo en '+modulo(), actual);
  if(val===null || isNaN(Number(val))) return;
  try{ await db.collection('inicial').doc(inicialKey(modulo(),itemId)).set({modulo:modulo(),itemId,cantidad:Number(val),fecha:new Date().toISOString(),creadoPor:getCurrentUserEmail?getCurrentUserEmail():''}); }
  catch(e){ alert('Error: '+e.message); }
}

function setView(v){
  current=v;
  document.querySelectorAll('#nav button[data-v]').forEach(b=>b.classList.toggle('active',b.dataset.v===v));
  if(v==='home') renderHome();
  if(v==='gar') renderGar();
  if(v==='ini') renderIni();
  if(v==='inv') renderInv(); if(v==='mov') renderMov(); if(v==='aud') renderAud(); if(v==='hist') renderHist();
  if(v==='cat') renderCat(); if(v==='desp') renderDesp(); if(v==='inst'){ instPreview=null; renderInst(); }
  if(v==='trasp') renderTrasp(); if(v==='rep') renderRep(); if(v==='usr') renderUsuarios(); if(v==='apr') renderAprobaciones();
}

let invCat = null, invDetalle = false;
// Hojas que todavía no tienen un corte registrado (se tomaron provisionalmente), de todo el catálogo.
function cortesPendientes(){
  return CATALOGO.filter(it=>esHoja(it)).map(it=>({it, f:calcFormula(it.id)})).filter(x=>x.f.autoCortes>0);
}
function avisoCortePendienteHtml(lista){
  if(!lista.length || !puedeEscribir() || (miPerfil && (miPerfil.rol==='supervisor'||miPerfil.rol==='gerente'))) return '';
  return `<div class="card aviso">
    <div style="font-size:15px;font-weight:800">✂️ Falta registrar el corte de hoy</div>
    <p style="margin:6px 0 10px;line-height:1.5">Se usaron hojas en instalaciones, pero todavía no se anotó el corte de:</p>
    <ul style="margin:0 0 10px 18px;padding:0;line-height:1.7">${lista.map(x=>`<li><strong>${fmtNum(x.f.autoCortes)} hoja(s)</strong> de ${x.it.nombre}</li>`).join('')}</ul>
    <button class="btn" style="width:100%" onclick="irA('mov',{tipo:'corte',cat:'${lista[0].it.cat}'})">Registrar corte ahora</button>
  </div>`;
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
    ${puedeEscribir() && !esSoloLectura() ? `<button class="btn" style="margin-top:10px;width:100%" onclick="irA('ini')">✏️ Capturar stock inicial</button>` : ''}
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
        <div style="min-width:0"><div class="invname">${it.nombre}</div>
          ${catHoja && !vacio ? `<div class="hint" style="margin:2px 0 0">${fmtNum(f.completas)} completas · ${fmtNum(f.cortado)} ya cortadas</div>` : ''}</div>
        <div class="invqty ${f.final<0?'neg':''}">${fmtNum(f.final)}<span>${it.unidad}</span></div>
      </div>`; }).join('')}</div>`;
  } else {
    html += `<div class="card">
      <p class="hint" style="margin-top:0">Fórmula: Inicial + Entradas − Salidas − Instalaciones − Garantías − Mermas ± Ajustes = Final.${catHoja?' En hojas: Completas + Cortado = Final. "Sin corte" = hojas usadas antes de anotar el corte del día (se quita al registrar el corte).':''} ${puedeEscribir()?'Toca el número de "Inicial" para fijar la línea base.':''}</p>
      <div class="wrap-x"><table>
      <tr><th>Artículo</th><th>Inicial</th><th>Entr.</th><th>Sal.</th>${catHoja?'<th>Corte</th>':''}<th>Instal.</th><th>Garant.</th><th>Mermas</th><th>Ajuste</th>${catHoja?'<th>Compl.</th><th>Cortado</th>':''}<th>Final</th></tr>
      ${rows.map(it=>{ const f=calcFormula(it.id);
        return `<tr>
          <td>${it.nombre}<div class="tag">${it.unidad}</div></td>
          <td>${puedeEscribir()?`<a href="#" onclick="editInicial('${it.id}');return false;">${fmtNum(f.inicial)}</a>`:fmtNum(f.inicial)}${catHoja&&f.inicialCortado?`<div class="hint" style="margin:2px 0 0">${fmtNum(f.inicialCortado)} cort.</div>`:''}</td>
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

// ===== Capturar stock inicial (pantalla sencilla, confirmado por el usuario) =====
// "Stock inicial" = lo que hay HOY: la cantidad capturada queda como el stock de ese artículo a
// partir de este momento; lo que se anote después se suma/resta desde aquí.
let iniCat = null, iniVals = {};
function renderIni(){
  if(!puedeEscribir()){ $('#main').innerHTML='<div class="card">Tu cuenta es de solo lectura.</div>'; return; }
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
  if(!confirm(`Vas a fijar el stock de HOY de ${ids.length} artículo(s) en ${modulo()}:\n\n${lineas.slice(0,20).map(l=>l.txt).join('\n')}${lineas.length>20?'\n… y '+(lineas.length-20)+' más':''}\n\n¿Todo bien?`)) return;
  try{
    const fecha = new Date().toISOString(), creadoPor = getCurrentUserEmail?getCurrentUserEmail():'';
    for(const l of lineas){
      const docIni = {modulo:modulo(), itemId:l.it.id, cantidad:fmtNum(l.c + l.k), fecha, creadoPor};
      if(esHoja(l.it)) docIni.cortado = fmtNum(l.k);
      await db.collection('inicial').doc(inicialKey(modulo(), l.it.id)).set(docIni);
    }
    iniVals = {};
    toast('✅ Stock inicial guardado ('+lineas.length+' artículo(s)).');
    setView('inv');
  }catch(e){ alert('Error: '+e.message); }
}

// ===== Inicio: botones grandes según el rol =====
const ICONO_CAT = {Melamina:'🟫', MDF:'🟤', Cintilla:'🎞️', PVC:'📏', Pegamento:'🧴', Stickers:'🏷️', Herrajes:'🔩'};
function esSoloLectura(){ return miPerfil && (miPerfil.rol==='supervisor' || miPerfil.rol==='gerente'); }
function esCoordinador(){ return miPerfil && miPerfil.rol==='coordinador'; }
// Abre una pantalla con opciones ya elegidas (p. ej. Entradas/Salidas en "Corte" de Melamina).
function irA(v, opts){
  opts = opts||{};
  if(v==='mov'){ if(opts.tipo) movTipo=opts.tipo; if(opts.cat) movCat=opts.cat; else if(opts.tipo==='corte' && !esHoja(CATALOGO.find(i=>i.cat===movCat))) movCat='Melamina'; }
  if(v==='hist' && opts.tab) histTab=opts.tab;
  setView(v);
  window.scrollTo(0,0);
}
function renderHome(){
  const tiles = [];
  const t = (icon, titulo, sub, js, color) => tiles.push(`<button class="tile" style="--tc:${color||'var(--brand)'}" onclick="${js}"><span class="tile-ic">${icon}</span><span class="tile-t">${titulo}</span><span class="tile-s">${sub}</span></button>`);
  if(!esSoloLectura()){
    t('📥','Llegó material','Anotar hojas, herrajes, etc. que entraron',"irA('mov',{tipo:'entrada'})",'#1f9d55');
    t('✂️','Corte del día','Hojas que se cortaron hoy',"irA('mov',{tipo:'corte',cat:'Melamina'})",'#FF6B6A');
    t('🔧','Instalación','Registrar un clóset o puerta instalada',"irA('inst')",'#3E5CDE');
    t('🔄','Traspaso','Enviar material a otro módulo',"irA('trasp')",'#7a4fb5');
    t('📤','Salida o merma','Material que salió o se dañó',"irA('mov',{tipo:'salida'})",'#e0791a');
    t('🛡️','Garantía','Material que se da en garantía',"irA('gar')",'#b3742c');
  }
  t('📦','Ver inventario','Cuánto hay de cada cosa',"irA('inv')",'#2c46b8');
  if(esAdmin()){
    t('✏️','Stock inicial','Capturar lo que hay hoy',"irA('ini')",'#2c46b8');
    t('✅','Aprobaciones','Revisar lo que capturaron',"irA('apr')",'#1f9d55');
    t('📋','Auditoría','Contar lo que hay físicamente',"irA('aud')",'#b3742c');
  }
  if(esAdmin() || esSoloLectura()) t('🗂️','Historial','Auditorías y faltantes',"irA('hist')",'#6b7280');
  t('📊','Reportes','Reporte del día en PDF',"irA('rep')",'#3E5CDE');
  if(esAdmin()) t('👥','Usuarios','Dar de alta al personal',"irA('usr')",'#6b7280');

  const pend = [];
  const cp = cortesPendientes();
  if(cp.length && !esSoloLectura()) pend.push(`<div class="pend"><div>✂️ <strong>Falta registrar el corte</strong> de ${cp.map(x=>`${fmtNum(x.f.autoCortes)} hoja(s) de ${x.it.nombre.replace('Melamina ','')}`).join(', ')}.</div><button class="btn small" onclick="irA('mov',{tipo:'corte',cat:'${cp[0].it.cat}'})">Registrar</button></div>`);
  const misPend = movs.filter(m=>m.estado==='pendiente').length;
  if(misPend && esCoordinador()) pend.push(`<div class="pend"><div>⏳ Tienes <strong>${misPend}</strong> movimiento(s) esperando que Dirección los apruebe.</div></div>`);
  const deudaPend = deudas.filter(d=>d.estado!=='saldada').length;
  if(deudaPend && (esAdmin()||esSoloLectura())) pend.push(`<div class="pend"><div>📉 Hay <strong>${deudaPend}</strong> faltante(s) de auditoría sin saldar.</div><button class="btn small" onclick="irA('hist',{tab:'deuda'})">Ver</button></div>`);

  const nombre = (getCurrentUserEmail?getCurrentUserEmail():'').split('@')[0];
  $('#main').innerHTML = `
    <div class="hello">Hola${nombre?' '+nombre:''} 👋<div class="hint" style="margin:2px 0 0;font-size:14px">¿Qué quieres hacer en <strong>${modulo()}</strong>?</div></div>
    ${pend.length?`<div class="card" style="padding:12px">${pend.join('')}</div>`:''}
    <div id="home-apr"></div>
    <div class="tiles">${tiles.join('')}</div>`;
  if(esAdmin()) contarAprobacionesPendientes();
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
let movTipo='entrada', movLado='completas';
const TIPO_LABEL = {entrada:'Entrada', salida:'Salida', instalacion:'Instalación', merma:'Merma', corte:'Corte', ajuste:'Ajuste auditoría', garantia:'Garantía'};
function etiquetaTipoMov(m){ return (TIPO_LABEL[m.tipo]||m.tipo) + (m.tipo==='merma' && m.lado==='cortado' ? ' (de cortado)' : ''); }
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
  const catHoja = items.length>0 && esHoja(items[0]);
  const info = TIPO_INFO[movTipo];
  const tiposBtns = Object.keys(TIPO_INFO).map(k=>{ const x=TIPO_INFO[k];
    return `<button class="tipobtn ${k===movTipo?'on':''} ${k==='instalacion'?'menor':''}" onclick="movTipo='${k}';renderMov()"><span class="tipo-ic">${x.ic}</span><span><strong>${x.t}</strong><br><small>${x.s}</small></span></button>`; }).join('');
  const catsHtml = cats.map(c=>`<button class="chip ${c===movCat?'on':''}" onclick="movCat='${c}';renderMov()">${ICONO_CAT[c]||''} ${c}</button>`).join('');
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
  </div>
  <div class="card">
    <div class="paso">2</div><strong>¿De qué material?</strong>
    <div class="chips" style="margin-top:10px">${catsHtml}</div>
  </div>
  <div class="card">
    <div class="paso">3</div><strong>${info.ic} ${pregunta}</strong>
    ${ayuda?`<p class="hint">${ayuda}</p>`:''}
    ${catHoja && movTipo==='merma' ? `<div style="margin-top:8px"><label class="hint">¿Qué se dañó?</label>
      <select id="mv-lado" style="margin-top:4px" onchange="movLado=this.value;renderMov()"><option value="completas" ${movLado==='completas'?'selected':''}>Hojas completas</option><option value="cortado" ${movLado==='cortado'?'selected':''}>Material ya cortado o armado</option></select></div>` : ''}
    <p class="hint">Escribe la cantidad solo en lo que aplique. Lo que dejes vacío no se toca.</p>
    <div class="movlist">
      ${items.map(it=>{ const f=calcFormula(it.id);
        const hay = f.esHoja ? (movTipo==='corte'||movTipo==='salida'||(movTipo==='merma'&&movLado!=='cortado') ? `${fmtNum(f.completas)} completas` : (movTipo==='merma' ? `${fmtNum(f.cortado)} ya cortadas` : `${fmtNum(f.final)} ${it.unidad}`)) : `${fmtNum(f.final)} ${it.unidad}`;
        return `<label class="movitem"><span style="min-width:0"><span class="invname">${it.nombre}</span><span class="hint" style="display:block;margin:2px 0 0">Hay: ${hay}</span></span>
          <input type="number" min="0" inputmode="decimal" id="mv-${it.id}" placeholder="—"></label>`;
      }).join('')}
    </div>
    <input id="mv-nota" placeholder="Nota (opcional)" style="margin-top:12px">
    <button class="btn" style="margin-top:12px;width:100%;min-height:54px;font-size:16px" onclick="registrarMovLote()">Revisar y guardar</button>
  </div>
  <details class="card">
    <summary><strong>Ver lo último que se anotó</strong></summary>
    <div class="wrap-x" style="margin-top:8px"><table><tr><th>Fecha</th><th>Artículo</th><th>Tipo</th><th>Cant.</th><th>Nota</th><th>Estado</th></tr>
    ${movs.slice(0,30).map(m=>`<tr><td>${new Date(m.fecha).toLocaleString()}</td><td>${m.itemNombre}</td>
      <td class="${m.tipo==='entrada'||(m.tipo==='ajuste'&&m.cantidad>0)?'pos':(m.tipo==='corte'?'':'neg')}">${etiquetaTipoMov(m)}</td><td>${m.tipo==='ajuste'&&m.cantidad>0?'+':''}${fmtNum(m.cantidad)} ${item2unidad(m.itemId)}</td><td>${m.nota||''}</td><td>${badgeEstado(m.estado)}</td></tr>`).join('')}
    </table></div>
  </details>`;
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
  const items = CATALOGO.filter(i=>i.cat===movCat);
  const decrece = tipo!=='entrada';
  const mod = modulo();
  const aplicar = [];
  const avisosAuto = [];
  for(const it of items){
    const el = document.getElementById('mv-'+it.id);
    const cantidad = Number(el.value);
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
    const estado = estadoNuevoMovimiento();
    const loteId = cryptoId();
    const creadoPor = getCurrentUserEmail?getCurrentUserEmail():'';
    for(const a of aplicar){
      const doc = {modulo:mod,itemId:a.itemId,itemNombre:a.itemNombre,tipo,cantidad:a.cantidad,nota,fecha:new Date().toISOString(),estado,loteId,creadoPor};
      if(a.lado) doc.lado = a.lado;
      await db.collection('movimientos').doc(cryptoId()).set(doc);
    }
    toast(estado==='pendiente'
      ? '✅ Guardado. <br><small>Dirección lo tiene que aprobar para que cuente en el inventario.</small>'
      : '✅ Guardado: '+aplicar.length+' artículo(s).');
    renderMov();
  }catch(e){ alert('Error: '+e.message); }
}

function renderAud(){
  if(miPerfil && miPerfil.rol==='coordinador'){ $('#main').innerHTML = '<div class="card">Esta sección no está disponible para coordinadores.</div>'; return; }
  const cats = [...new Set(CATALOGO.map(i=>i.cat))];
  if(!auditCat) auditCat = cats[0];
  const catsHtml = cats.map(c=>{
    const capturadosEnCat = CATALOGO.filter(i=>i.cat===c && auditCapturas[i.id]!==undefined).length;
    return `<button class="btn small" style="background:${c===auditCat?'var(--brand)':'transparent'};color:${c===auditCat?'var(--brand-ink)':'var(--ink)'};border:1px solid var(--line);margin:2px" onclick="selectAuditCat('${c}')">${c} ${capturadosEnCat?('✓'+capturadosEnCat):''}</button>`;
  }).join('') + [['__piezas','✂️ Piezas cortadas',contarPiezasSueltas()],['__armados','📦 Armados',auditArmados.length]].map(([k,label,n])=>
    `<button class="btn small" style="background:${auditCat===k?'var(--accent)':'transparent'};color:${auditCat===k?'#fff':'var(--ink)'};border:1px solid ${auditCat===k?'var(--accent)':'var(--line)'};margin:2px" onclick="selectAuditCat('${k}')">${label} ${n?('✓'+n):''}</button>`).join('');

  let cuerpo;
  if(auditCat==='__piezas'){
    cuerpo = renderAudPiezasHtml();
  } else if(auditCat==='__armados'){
    cuerpo = renderAudArmadosHtml();
  } else {
    const items = CATALOGO.filter(i=>i.cat===auditCat);
    const eq = piezasAuditAHojas();
    const catHoja = items.length>0 && esHoja(items[0]);
    cuerpo = `<div class="card">
    <h3>${auditCat}</h3>
    ${catHoja?'<p class="hint">Aquí captura solo las <strong>hojas completas</strong>. Lo cortado o armado va en ✂️ Piezas cortadas y 📦 Armados.</p>':''}
    <div class="wrap-x"><table><tr><th>Artículo</th><th>Teórico</th><th>${catHoja?'Hojas completas contadas':'Físico contado'}</th></tr>
      ${items.map(it=>{ const f=calcFormula(it.id);
        const extra = eq[it.id] ? `<div class="hint" style="margin-top:3px">+ ${fmtNum(eq[it.id])} ${it.unidad||''} en piezas/armados</div>` : '';
        return `<tr><td>${it.nombre}<div class="tag">${it.unidad}</div></td><td>${fmtNum(f.final)}${f.esHoja?`<div class="hint" style="margin-top:2px">${fmtNum(f.completas)} compl. · ${fmtNum(f.cortado)} cort.</div>`:''}</td>
          <td><input type="number" inputmode="decimal" value="${auditCapturas[it.id]??''}" oninput="auditCapturas['${it.id}']=this.value===''?undefined:Number(this.value)">${extra}</td></tr>`;
      }).join('')}
    </table></div>
  </div>`;
  }

  $('#main').innerHTML = `
  <div class="card">
    <strong>Auditoría física · ${modulo()}</strong>
    <p class="hint">Cuenta lo que existe físicamente ahora mismo, tal como está. Las hojas completas y herrajes sueltos se capturan en su categoría; las piezas ya cortadas en <strong>✂️ Piezas cortadas</strong>, y las cajoneras, cajones y cuadros armados en <strong>📦 Armados</strong>. La app convierte todo a hojas y herrajes.</p>
    <div class="grid2">
      <select id="aud-tipo" onchange="audTipo=this.value"><option value="inicial" ${audTipo==='inicial'?'selected':''}>Auditoría inicial</option><option value="seguimiento" ${audTipo==='seguimiento'?'selected':''}>Auditoría de seguimiento</option></select>
      <input id="aud-auditor" placeholder="Nombre del auditor" value="${String(audAuditor).replace(/"/g,'&quot;')}" oninput="audAuditor=this.value">
    </div>
  </div>
  <div class="card"><div>${catsHtml}</div></div>
  ${cuerpo}
  <div class="card row" style="justify-content:space-between">
    <span class="hint" id="aud-contador">${textoContadorAudit()}</span>
    <button class="btn" onclick="saveAudit()">Finalizar y guardar auditoría</button>
  </div>`;
}
function selectAuditCat(c){ auditCat=c; renderAud(); }

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
  const porColor = {};
  pool.forEach(p=>{ (porColor[p.colorDestino] = porColor[p.colorDestino]||[]).push(p); });
  const out = {};
  Object.keys(porColor).forEach(c=>{
    piezasAConsumo(porColor[c], c).forEach(r=>{ out[r.itemId]=(out[r.itemId]||0)+r.cantidad; });
  });
  // Correderas: solo cuentan los JUEGOS COMPLETOS (hembra + macho)
  balanceCorrederas(pool).forEach(b=>{
    if(b.pares>0){ const it=itemByName(b.item); if(it) out[it.id]=(out[it.id]||0)+b.pares; }
  });
  return out;
}
// Junta hembras (de cajoneras) y machos (de cajones) en parejas. Devuelve por tipo de corredera:
// {item, etiqueta, hembras, machos, pares, hembrasSinPareja, machosSinPareja}
function balanceCorrederas(pool){
  if(!pool){ pool=[]; auditArmados.forEach(a=>piezasDeArmado(a).forEach(p=>pool.push(p))); }
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
    ${b.hembrasSinPareja?`<br>⚠️ ${fmtNum(b.hembrasSinPareja)} hembra(s) sin su macho (no cuentan como juego).`:''}
    ${b.machosSinPareja?`<br>⚠️ ${fmtNum(b.machosSinPareja)} macho(s) sin su hembra (no cuentan como juego).`:''}
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
  </div>`;
}

// ----- Armados (auditoría) -----
function renderAudArmadosHtml(){
  const f = auditArmadoForm;
  const esCajonera = f.tipo==='cajonera';
  const esCorr = f.tipo==='corredera';
  const variantes = esCajonera ? ARMADO_CAJONERAS : (esCorr ? ARMADO_CORREDERA : {normal:'Normal', max:'Max'});
  if(!variantes[f.variante]) f.variante = Object.keys(variantes)[0];
  const colorOpts = sel => MEL_COLORES.map(c=>`<option value="${c}" ${c===sel?'selected':''}>${c}</option>`).join('');
  const labelColor = esCajonera ? 'Color de la cajonera' : (f.tipo==='cajon' ? 'Color del frente' : 'Color del cuadro');
  const usaCorredera = armadoUsaCorredera(f);
  const puedePuertitas = esCajonera && armadoTienePuertitas(f.variante);
  const set = (campo, rerender=true) => `auditArmadoForm.${campo}=this.${campo==='ext'||campo==='puertitas'?'checked':'value'};${rerender?'renderAud()':''}`;
  const preview = Number(f.cantidad)>0 ? describirArmado(f) : '';
  return `<div class="card">
    <h3>📦 Armados</h3>
    <p class="hint">Cajoneras armadas sin cajones, cajones completos, cuadros de cajón y correderas sueltas. Las cajoneras traen la corredera <strong>hembra</strong> y los cajones la <strong>macho</strong>: solo se cuenta un juego cuando hay pareja.</p>
    <label class="hint">¿Qué encontraste?</label>
    <select style="margin-top:4px" onchange="${set('tipo')}">${Object.keys(ARMADO_TIPOS).map(k=>`<option value="${k}" ${k===f.tipo?'selected':''}>${ARMADO_TIPOS[k]}</option>`).join('')}</select>
    <div class="grid2" style="margin-top:10px">
      <div><label class="hint">Tipo</label><select style="margin-top:4px" onchange="${set('variante')}">${Object.keys(variantes).map(k=>`<option value="${k}" ${k===f.variante?'selected':''}>${variantes[k]}</option>`).join('')}</select></div>
      ${esCorr?'':`<div><label class="hint">${labelColor}</label><select style="margin-top:4px" onchange="${set('color')}">${colorOpts(f.color)}</select></div>`}
      ${f.tipo==='cajon'?`<div><label class="hint">Color del cuadro</label><select style="margin-top:4px" onchange="${set('colorCuadro')}">${colorOpts(f.colorCuadro)}</select></div>`:''}
      <div><label class="hint">Cantidad</label><input type="number" min="0" inputmode="numeric" style="margin-top:4px" value="${f.cantidad}" oninput="auditArmadoForm.cantidad=this.value"></div>
    </div>
    ${usaCorredera?`<label class="row" style="margin-top:10px;gap:8px;font-size:14px"><input type="checkbox" style="width:auto;min-height:0" ${f.ext?'checked':''} onchange="${set('ext')}"> ${esCorr?'Es corredera de extensión':'Lleva corredera de extensión (si no, corredera normal)'}</label>`:''}
    ${f.variante==='max' && f.tipo!=='cuadro_fondo' && f.tipo!=='cuadro_sin'?`<p class="hint">Max: siempre lleva corredera de extensión${f.tipo==='cajon'?' y no lleva jaladera':''}.</p>`:''}
    ${puedePuertitas?`<label class="row" style="margin-top:10px;gap:8px;font-size:14px"><input type="checkbox" style="width:auto;min-height:0" ${f.puertitas?'checked':''} onchange="${set('puertitas')}"> Trae sus puertitas puestas (con bisagras y ${f.variante==='max'?'push':'jaladeras'})</label>`:''}
    ${esCajonera && !armadoTienePuertitas(f.variante)?`<p class="hint">La cajonera ${ARMADO_CAJONERAS[f.variante].toLowerCase()} todavía no tiene medida de puertita confirmada.</p>`:''}
    <button class="btn" style="margin-top:12px;width:100%" onclick="agregarArmado()">Agregar</button>
  </div>
  <div class="card">
    <h3>Armados capturados (${auditArmados.length})</h3>
    ${auditArmados.length? `<div class="wrap-x"><table><tr><th>Descripción</th><th>Cant.</th><th></th></tr>
      ${auditArmados.map((a,i)=>`<tr><td>${describirArmado(a)}</td><td>${a.cantidad}</td><td><button class="btn small" style="background:transparent;color:var(--bad);border:1px solid var(--line);box-shadow:none" onclick="quitarArmado(${i})">Quitar</button></td></tr>`).join('')}
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
  if(armadoUsaCorredera(f)) a.ext = !!f.ext;
  if(f.tipo==='cajonera' && armadoTienePuertitas(f.variante)) a.puertitas = !!f.puertitas;
  auditArmados.push(a);
  f.cantidad = '';
  renderAud();
}
function quitarArmado(i){ auditArmados.splice(i,1); renderAud(); }
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
    <label class="hint">Color / material</label>
    <select onchange="auditPiezaGrupo=this.value;renderAud()" style="margin-top:4px">${opciones}</select>
    <div class="wrap-x" style="margin-top:10px"><table><tr><th>Pieza</th><th>Rinde</th><th>Cantidad</th></tr>
      ${lista.map(p=>`<tr>
        <td>${p.label}<div class="tag">${p.dim}</div></td>
        <td class="hint" style="margin:0">${p.rinde}</td>
        <td><input type="number" min="0" inputmode="numeric" style="min-width:80px" value="${counts[p.key]??''}" oninput="setAuditPieza('${auditPiezaGrupo}','${p.key}',this.value)"></td>
      </tr>`).join('')}
    </table></div>
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
  const noContados = CATALOGO.filter(it=>auditCapturas[it.id]===undefined && !eq[it.id] && Math.abs(calcFormula(it.id).final)>0.005);
  if(noContados.length && !confirm(`Hay ${noContados.length} artículo(s) que según el inventario SÍ hay, pero no los contaste:\n\n${noContados.slice(0,15).map(it=>'• '+it.nombre+' (debería haber '+fmtNum(calcFormula(it.id).final)+')').join('\n')}${noContados.length>15?'\n… y '+(noContados.length-15)+' más':''}\n\nSi guardas así, se toman como 0 (faltante). ¿Guardar de todos modos?\n\n(Cancelar = regresar a contarlos)`)) return;
  CATALOGO.forEach(it=>{
    const itemId = it.id;
    const f = calcFormula(itemId);
    const hojasCompletas = auditCapturas[itemId]!==undefined ? auditCapturas[itemId] : 0;
    const hojasEnPiezas = fmtNum(eq[itemId]||0);
    const fisico = fmtNum(hojasCompletas + hojasEnPiezas);
    const diff = fmtNum(fisico - f.final);
    if(diff!==0) totalDiff++;
    const r = {itemId, nombre:it.nombre, cat:it.cat, unidad:it.unidad, teorico:fmtNum(f.final), fisico, diff, capturado: auditCapturas[itemId]!==undefined || !!eq[itemId]};
    if(hojasEnPiezas){ r.hojasCompletas = hojasCompletas; r.hojasEnPiezas = hojasEnPiezas; }
    if(f.esHoja){
      // Comparación por lado: hojas completas contadas vs. teóricas, y cortado/armado contado
      // vs. teórico (la diferencia en cortado es desperdicio o piezas perdidas).
      r.teoricoCompletas = fmtNum(f.completas); r.teoricoCortado = fmtNum(f.cortado);
      r.fisicoCompletas = fmtNum(hojasCompletas); r.fisicoCortado = hojasEnPiezas;
      r.diffCompletas = fmtNum(hojasCompletas - f.completas); r.diffCortado = fmtNum(hojasEnPiezas - f.cortado);
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
    const doc = {modulo:modulo(),tipo,auditor,fecha:new Date().toISOString(),resultados,totalDiff,completa:true};
    if(piezasContadas.length) doc.piezasContadas = piezasContadas;
    if(auditArmados.length) doc.armadosContados = auditArmados.map(a=>({descripcion:describirArmado(a), cantidad:a.cantidad, ...a}));
    const bc = balanceCorrederas();
    if(bc.length) doc.correderas = bc;
    const audId = cryptoId();
    await db.collection('auditorias').doc(audId).set(doc);
    auditCapturas={}; auditPiezas={}; auditArmados=[]; audAuditor='';
    toast('✅ Auditoría guardada.');
    histTab='aud';
    setView('hist');
    if(confirm('¿Quieres descargar el REPORTE DE AUDITORÍA en PDF (teórico vs. físico de cada artículo)?')){
      try{ await generarReporteAuditoriaPDF({...doc, id:audId}); }catch(e){ alert('No se pudo generar el PDF: '+e.message); }
    }
    if(esAdmin() && confirm('¿Aplicar esta auditoría al inventario ahora?\n\nEl inventario quedará igual a lo contado y lo que haya faltado se guarda como DEUDA en Historial → Faltantes (deuda).\n\nTambién puedes aplicarla después desde el Historial.')){
      await aplicarAuditoria(audId, {...doc, id:audId});
    }
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
        <div><strong>${new Date(a.fecha).toLocaleString()}</strong><div class="tag">${a.tipo}</div> <div class="tag">Auditor: ${a.auditor}</div>
          ${a.aplicada?`<div class="tag pos" style="border-color:var(--ok)">✓ Aplicada al inventario</div>`:`<div class="tag" style="color:#b3742c;border-color:#b3742c">Sin aplicar</div>`}</div>
        <div class="${a.totalDiff?'neg':'pos'}" style="font-weight:700">${a.totalDiff} discrepancia(s)</div>
      </div>
      <div class="row" style="justify-content:flex-end;margin-top:8px;gap:8px">
        <button class="btn small" style="background:transparent;color:var(--brand);border:1px solid var(--line);box-shadow:none" onclick="reporteAuditoriaUI('${a.id}')">📄 Reporte PDF</button>
        ${!a.aplicada && esAdmin() ? `<button class="btn small" onclick="aplicarAuditoriaUI('${a.id}')">Aplicar al inventario</button>` : ''}
        ${esAdmin() ? `<button class="btn small" style="background:transparent;color:var(--bad);border:1px solid var(--line);box-shadow:none" onclick="borrarAuditoria('${a.id}')">🗑️ Borrar</button>` : ''}
      </div>
      ${a.aplicada ? `<p class="hint" style="margin:6px 0 0">Aplicada el ${new Date(a.fechaAplicada).toLocaleString()}${a.aplicadaPor?' por '+a.aplicadaPor:''}${a.deudasCreadas?` · ${a.deudasCreadas} faltante(s) pasaron a deuda`:''}.</p>` : ''}
      <div id="ad-${a.id}" style="display:none;margin-top:8px" class="wrap-x">
        ${(()=>{ const fila = r=>`<tr><td>${r.nombre}${r.capturado===false&&Math.abs(Number(r.teorico))>0.005?' <span class="tag">no contado</span>':''}</td><td>${fmtNum(r.teorico)}</td><td>${fmtNum(r.fisico)}${r.hojasEnPiezas&&r.teoricoCompletas===undefined?`<div class="hint" style="margin-top:3px">${fmtNum(r.hojasCompletas)} sueltas/completas + ${fmtNum(r.hojasEnPiezas)} en piezas/armados</div>`:''}</td><td class="${r.diff<0?'neg':(r.diff>0?'pos':'')}">${r.diff>0?'+':''}${fmtNum(r.diff)}</td></tr>${detalleLadosHtml(r)}`;
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
  doc.text(`Auditor: ${a.auditor||'—'} · Tipo: ${a.tipo||'—'} · ${a.aplicada?'Aplicada al inventario':'Todavía NO aplicada al inventario'}`, marginL, y); y+=7;
  // Resumen
  doc.setFillColor(238,242,255); doc.rect(marginL, y, W, 17, 'F');
  doc.setFontSize(10); doc.setFont(undefined,'bold');
  doc.text(`${res.length} artículo(s) revisados · ${conDif.length} con diferencia`, marginL+2, y+6);
  doc.setFont(undefined,'normal'); doc.setFontSize(9);
  doc.text(`Faltan: ${faltan} artículo(s) · Sobran: ${sobran} artículo(s) · Cuadran: ${res.length-conDif.length}`, marginL+2, y+11.5);
  doc.text('Teórico = lo que decía el inventario ese día. Diferencia = Físico − Teórico ( − falta, + sobra ).', marginL+2, y+15.5);
  y += 23;

  const cats = [...new Set(CATALOGO.map(i=>i.cat))].filter(c=>res.some(r=>r.cat===c));
  if(res.some(r=>!cats.includes(r.cat))) cats.push(...new Set(res.filter(r=>!cats.includes(r.cat)).map(r=>r.cat)));
  cats.forEach(cat=>{
    const filas = res.filter(r=>r.cat===cat);
    const hoja = filas.some(r=>r.teoricoCompletas!==undefined);
    cols = hoja
      ? [{label:'Artículo',w:62},{label:'Teórico',w:20},{label:'Físico',w:20},{label:'Diferencia',w:24},{label:'Dif. completas',w:28},{label:'Dif. cortado',w:28}]
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
      const maxLen = hoja ? 36 : 55; if(nom.length>maxLen) nom = nom.slice(0,maxLen-2)+'…';
      const vals = [nom, fmtNum(r.teorico), fmtNum(r.fisico), sgn(d)];
      if(hoja) vals.push(r.teoricoCompletas!==undefined ? sgn(Number(r.diffCompletas)||0) : '', r.teoricoCompletas!==undefined ? sgn(Number(r.diffCortado)||0) : '');
      vals.forEach((v,i)=>{
        const esDif = i>=3 && typeof v==='string' && v!=='' && v!=='0';
        if(esDif) doc.setTextColor(v.startsWith('-')?200:31, v.startsWith('-')?40:130, v.startsWith('-')?40:70);
        doc.text(String(v), colX(i)+1.5, y+3.6);
        doc.setTextColor(0,0,0);
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
      if(dC||dK) ajustes.push({it, completasDelta:dC, cortadoDelta:dK, total:fmtNum(dC+dK), limpiarDeuda:ajustarCortado});
      else if(ajustarCortado && calcFormula(it.id).autoCortes>0) ajustes.push({it, completasDelta:0, cortadoDelta:0, total:0, limpiarDeuda:true}); // solo para quitar hojas "sin corte" pendientes
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
  if(hayHojaConCortado && !contoCortado){
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
      <td>${conBoton && esAdmin() ? `<button class="btn small" onclick="saldarDeuda('${d.id}')">Saldar</button>` : (d.estado==='saldada' ? `<div class="hint" style="margin:0">${d.notaSaldo||'Saldada'}<br>${d.fechaSaldo?new Date(d.fechaSaldo).toLocaleDateString('es-MX'):''}</div>` : '')}</td>
    </tr>`).join('');
  return `<div class="card">
      <strong>Faltantes de auditoría (deuda) · ${modulo()}</strong>
      <p class="hint">Cuando una auditoría se aplica, el inventario queda igual a lo contado, pero lo que faltó se guarda aquí para darle seguimiento (a quién se cobra, si apareció, etc.). Saldar una deuda solo la cierra: si el material aparece, regístralo como Entrada.</p>
    </div>
    ${secciones.length ? secciones.map(cat=>`<div class="card"><h3>${cat} · pendiente</h3>
      <div class="wrap-x"><table><tr><th>Artículo</th><th>Lado</th><th>Total pendiente</th></tr>
        ${Object.values(tot).filter(t=>t.cat===cat).map(t=>`<tr><td>${t.nombre}</td><td>${etiquetaLado(t.lado)}</td><td class="neg"><strong>${fmtNum(t.cantidad)}</strong> ${t.unidad||''}</td></tr>`).join('')}
      </table></div></div>`).join('') : '<div class="card"><p class="hint" style="margin:0">No hay deuda pendiente. 🎉</p></div>'}
    ${pend.length?`<div class="card"><h3>Detalle pendiente (${pend.length})</h3><div class="wrap-x"><table><tr><th>Artículo</th><th>Faltó</th><th>Auditoría</th><th></th></tr>${filas(pend,true)}</table></div></div>`:''}
    ${sald.length?`<div class="card"><h3>Saldadas (${sald.length})</h3><div class="wrap-x"><table><tr><th>Artículo</th><th>Faltó</th><th>Auditoría</th><th>Cierre</th></tr>${filas(sald,false)}</table></div></div>`:''}`;
}
async function saldarDeuda(id){
  if(!esAdmin()) return alert('Solo Dirección puede saldar una deuda.');
  const d = deudas.find(x=>x.id===id); if(!d) return;
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
  add('Zócalo Max', 4*unidades, '12×58 cm', colorCaj, 'ok', 'Cajonera Max');
  add('Fondo de cajonera (MDF 3mm)', unidades, '55×122 cm', '—', 'ok', '1 por cajonera Max (misma regla que cualquier cajonera)');
  add('Melamina (cajonera Max)', unidades, '—', colorCaj, 'ok', 'Confirmado: 1 hoja de melamina por cajonera Max, misma melamina que el resto de los muebles (no es un artículo de catálogo aparte)');
}
function piezasEntrepaneraMax(add, color, unidades){
  add('Pared Max', 2*unidades, '40×185 cm', color, 'ok', 'Entrepañera Max (confirmado por el usuario)');
  add('Entrepaño Max largo', 5*unidades, '40×58 cm', color, 'ok', 'Entrepañera Max');
  add('Zócalo Max', 2*unidades, '12×58 cm', color, 'ok', 'Entrepañera Max');
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
  const colorCaj = colorCajonera || estructuraColor;
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
    // 2 paredes + 5 entrepaños + 2 zócalos" = 3 paredes en total, con o sin cajones.
    // Nota general (confirmado por el usuario): cuando un modelo es Max, sus paredes ya no
    // salen de aquí — cada cajonera/entrepañera Max aporta sus propias "Pared Max" (ver
    // piezasCajoneraMax/piezasEntrepaneraMax), y sumar también la "Pared" plana de la familia
    // duplicaría el material. Por eso cada bloque de familia condiciona su "Pared" a `!maxOn`.
    if(fam==='Lateral'){
      if(!maxOn) add('Pared',2,'191×40 cm',estructuraColor,'ok','2 paredes de la entrepañera/cajonera base');
      add('Maletero chico',1,'191×40 cm',estructuraColor,'ok','Maletero chico (mide igual que una Pared, 191×40 cm) — con o sin cajones');
    }
    if(fam==='Central'){ if(!maxOn) add('Pared',2,'191×40 cm',estructuraColor,'ok'); add('Maletero normal',1,'40×244 cm',estructuraColor,'ok'); }
    if(fam==='Doble'){ if(!maxOn) add('Pared',4,'191×40 cm',estructuraColor,'ok'); add('Maletero normal',1,'40×244 cm',estructuraColor,'ok'); }
    if(fam==='Doble Especial'){
      if(!maxOn) add('Pared',4,'191×40 cm',estructuraColor,'ok','Confirmado: Doble Especial tiene la misma estructura que Doble; solo cambia en herrajes (4 tubos/4 bridas en vez de 2/2)');
      add('Maletero normal',1,'40×244 cm',estructuraColor,'ok');
      if(especial3m) add('Maletero chico',1,'191×40 cm',estructuraColor,'ok','Variante a 3 metros: se agrega 1 maletero chico extra (una pared), confirmado por el usuario');
    }
    if(fam==='Triple'){ if(!maxOn) add('Pared',6,'191×40 cm',estructuraColor,'ok'); add('Maletero normal',2,'40×244 cm',estructuraColor,'ok'); }
    if(fam==='King'){
      if(!maxOn) add('Pared',4,'191×40 cm',estructuraColor,'ok');
      if(maxOn){
        // Confirmado por el usuario: en Max el maletero chico (191×40) se sustituye por uno
        // normal (244×40); el maletero grande que ya tenía el modelo se queda igual (toda
        // variante Max lleva maleteros grandes). No se duplica ninguno. Las 4 "Pared" del King
        // tampoco se suman aquí: las aportan las 2 unidades de cajonera/entrepañera Max
        // (2 "Pared Max" por unidad = 4 en total), así que sumarlas de las dos formas
        // duplicaría el material — mismo principio que en las combinaciones "por muebles".
        add('Maletero normal (Max)',1,'40×244 cm',estructuraColor,'ok','Max sustituye el maletero chico (191×40) por uno normal (244×40)');
        add('Maletero grande',1,'40×244 cm',estructuraColor,'ok','El maletero grande del King se queda igual en la variante Max (no se sustituye)');
        maxNota = 'King Max: las 4 "Pared" las aportan las 2 unidades de cajonera/entrepañera Max (no se suman aparte). El maletero chico se sustituyó por uno normal (244×40); el maletero grande se queda igual.';
      } else {
        add('Maletero chico',1,'191×40 cm',estructuraColor,'ok','Confirmado: la medida del maletero chico es la misma que una Pared (191×40 cm); se agrupa con las paredes para el cálculo de hojas');
        add('Maletero grande',1,'40×244 cm',estructuraColor,'ok','Confirmado: mismo tamaño que el maletero normal (rendimiento: 3 por hoja)');
      }
    }

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
    const CAJONERA_ENTREPANOS = {3:5, 5:4, 6:10, 8:9, 10:8};
    const MUEBLES_CAJONERA = {3:1, 5:1, 6:2, 8:2, 10:2};

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
        if(espejos>0) add('Entrepaño', espejos*5, '52×40 cm', colorCaj, 'ok', espejos+' espejo(s) = '+espejos+' mueble(s) tipo "cajonera de espejo" (5 entrepaños cada uno, confirmado por el usuario)');
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

  // Zócalos: si el modelo lleva cajonera, sus zócalos dependen del color del FRENTE (confirmado
  // por el usuario: "los zócalos dependen del frente del color"), no del color de la cajonera
  // ni de la estructura. Sin cajonera, se quedan con el color de estructura de siempre.
  const colorZocalo = cajones>0 ? color : estructuraColor;

  // Espejos: el espejo ocupa un "mueble" completo (mismas 2 paredes + 5 entrepaños que una
  // entrepañera — ya contabilizado arriba en paredes/entrepaños, no se vuelve a sumar aquí),
  // más su propio "fondo de cajonera de espejo" + 2 zócalos + jaladera + bisagra + el espejo
  // en sí (confirmado por el usuario).
  if(espejos>0){
    add('Jaladera (por espejo)',espejos,'—',color,'ok','1 jaladera por espejo (confirmado por el usuario)');
    add('Bisagra (por espejo)',espejos*1.5,'—','—','ok','1.5 bisagras por espejo (confirmado por el usuario); no lleva correderas ni tubos/bridas extra por el espejo');
    if(fam==='King'){
      add('Entrepaña con espejo',espejos,'—','—','ok','Pieza estructural del mueble de espejo; el espejo de closet se descuenta aparte (ver "Espejo" abajo)');
      if(espejos===1) add('Entrepaña normal',1,'—','—','ok','King con 1 espejo = 1 entrepaña normal + 1 entrepaña con espejo');
    }
    add('Espejo',espejos,'—','—','ok','1 "Espejos closet" por espejo (confirmado por el usuario, incluido King: "el espejo es espejo de clóset... aplica para todas las variantes de los modelos")');
    add('Zócalo especial',espejos,'18×52 cm',colorZocalo,'ok','1 por espejo (confirmado por el usuario)'+(cajones>0?'; color del frente (zócalos de cajonera dependen del color de frente, confirmado por el usuario)':''));
    add('Zócalo especial',espejos,'16×52 cm',colorZocalo,'ok','1 por espejo (confirmado por el usuario)');
  } else {
    add('Zócalo normal',2,'10×52 cm',colorZocalo,'ok', cajones>0?'Color del frente (zócalos de cajonera dependen del color de frente, confirmado por el usuario)':'');
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
const PIEZAS_AUDIT = [
  {key:'pared',       tipo:'mel', nombre:'Pared',                    dim:'191×40 cm',   label:'Pared (o maletero chico)', rinde:'3 por hoja (junto con 3 entrepaños)'},
  {key:'entrepano',   tipo:'mel', nombre:'Entrepaño',                dim:'52×40 cm',    label:'Entrepaño',                rinde:'Van con las paredes (3+3); los que sobren, 14 por hoja'},
  {key:'maletero',    tipo:'mel', nombre:'Maletero grande',          dim:'40×244 cm',   label:'Maletero (normal o grande)', rinde:'3 por hoja'},
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
  corredera:    'Corredera suelta (hembra o macho)'
};
const ARMADO_CORREDERA = {hembra:'Hembra (la que va en la cajonera)', macho:'Macho (la que va en el cajón)'};
const ARMADO_CAJONERAS = {'3':'De 3 cajones','5':'De 5 cajones','6':'De 6 cajones','8':'De 8 cajones','10':'De 10 cajones','emma':'Emma (4 cajones)','max':'Max (4 cajones)'};
const PIEZAS_DE_CAJON = ['Frente','Frente Max','Pieza chica de cajón','Pieza grande de cajón','Pieza chica de cajón Max','Pieza grande de cajón Max','Fondo de cajón (MDF 3mm)','Fondo de cajón (MDF 5mm, Max)','Jaladera (por cajón)','Juego de corredera','Correderas de extensión'];
function armadoTienePuertitas(variante){ return ['3','5','emma','max'].includes(variante); }
function armadoUsaCorredera(a){ return (a.tipo==='cajonera' || a.tipo==='cajon' || a.tipo==='corredera') && a.variante!=='max'; }

// Devuelve las piezas (formato del despiece) de un armado, ya multiplicadas por su cantidad.
function piezasDeArmado(a){
  const n = Number(a.cantidad)||0;
  const piezas = [];
  const add = (nombre,cantidad,dim,colorDestino,estado)=>piezas.push({nombre, cantidad: typeof cantidad==='number'? cantidad*n : cantidad, dim, colorDestino, estado:estado||'ok'});
  // Medias correderas: 'Corredera hembra' / 'Corredera macho' (+ ' (extensión)'). No se descuentan
  // solas: piezasAuditAHojas las junta en parejas para formar juegos completos.
  const sufCorr = (a.variante==='max' || a.ext) ? ' (extensión)' : '';
  const esMax = a.variante==='max';
  if(a.tipo==='cajonera'){
    const tipoAdic = esMax ? 'cajonera_max' : (a.variante==='emma' ? 'cajonera_emma' : 'cajonera');
    const cajones = (esMax || a.variante==='emma') ? 4 : Number(a.variante);
    const conPuerta = !!a.puertitas && armadoTienePuertitas(a.variante);
    buildAdicionalPiezas(tipoAdic, cajones, a.color, !!a.ext, conPuerta)
      .filter(p=>p.estado==='ok' && !PIEZAS_DE_CAJON.includes(p.nombre))
      .forEach(p=>add(p.nombre, p.cantidad, p.dim, p.colorDestino));
    add('Corredera hembra'+sufCorr, cajones, '—', '—');
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
  else if(a.tipo==='cajonera') d = 'Cajonera sin cajones '+ARMADO_CAJONERAS[a.variante].toLowerCase()+' · '+a.color;
  else if(a.tipo==='cajon') d = 'Cajón completo'+(a.variante==='max'?' Max':'')+' · frente '+a.color+' / cuadro '+a.colorCuadro;
  else d = ARMADO_TIPOS[a.tipo]+(a.variante==='max'?' Max':'')+' · '+a.color;
  if(armadoUsaCorredera(a)) d += a.ext ? ' · corredera de extensión' : ' · corredera normal';
  if(a.tipo==='cajonera' && a.puertitas && armadoTienePuertitas(a.variante)) d += ' · con puertitas';
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

function buildAdicionalPiezas(tipo, cajones, color, correderaExt, conPuerta, extra){
  const piezas = [];
  const add=(nombre,cantidad,dim,colorDestino,estado,nota)=>piezas.push({nombre,cantidad,dim,colorDestino,estado,nota:nota||''});
  const CAJONERA_ENTREPANOS = {3:5, 5:4, 6:10, 8:9, 10:8};
  const MUEBLES_CAJONERA = {3:1, 5:1, 6:2, 8:2, 10:2};
  if(tipo==='entrepanera'){
    add('Pared',2,'191×40 cm',color,'ok','Adicional: entrepañera (2 paredes + 5 entrepaños + 2 zócalos)');
    add('Entrepaño',5,'52×40 cm',color,'ok');
    add('Zócalo normal',2,'10×52 cm',color,'ok');
  } else if(tipo==='cajonera'){
    add('Pared',2,'191×40 cm',color,'ok','Adicional: cajonera de '+cajones+' cajones');
    if(CAJONERA_ENTREPANOS[cajones]) add('Entrepaño',CAJONERA_ENTREPANOS[cajones],'40×52 cm',color,'ok');
    else add('Entrepaño','Pendiente','—','—','pendiente','Cantidad de entrepaños de cajonera de '+cajones+' cajones no confirmada; no se inventa');
    add('Zócalo normal',2,'10×52 cm',color,'ok');
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
  } else if(tipo==='cajonera_max'){
    // Confirmado por el usuario: receta completa de la Cajonera Max (ver piezasCajoneraMax /
    // piezasCajonesMax). Como adicional cuenta como 1 sola unidad. Confirmado: la Cajonera Max
    // SIEMPRE lleva 4 cajones (medida fija, no la elige el cliente ni varía por modelo).
    piezasCajoneraMax(add, color, 1);
    piezasCajonesMax(add, 4, color, color);
    if(conPuerta) piezasPuertitaCajonera(add, color, 'max', 'cajonera Max');
  } else if(tipo==='cajonera_emma'){
    add('Pared',2,'191×40 cm',color,'ok','Cajonera Emma: 2 paredes + 4 entrepaños + 5 zócalos de 10×52 + 4 cajones (confirmado por el usuario)');
    add('Entrepaño',4,'52×40 cm',color,'ok');
    add('Zócalo normal',5,'10×52 cm',color,'ok','Emma lleva 5 zócalos de 10×52 (confirmado por el usuario; distinto de los 2 de una cajonera/entrepañera normal)');
    add('Frente',4,'18×54 cm',color,'ok');
    add('Pieza chica de cajón',4*2,'33×16.5 cm',color,'ok');
    add('Pieza grande de cajón',4*2,'46.4×16.5 cm',color,'ok');
    add('Fondo de cajón (MDF 3mm)',4,'49.4×33 cm','—','ok');
    add('Juego de corredera',4,'—','—','ok','1 por cajón');
    add('Jaladera (por cajón)',4,'—',color,'ok');
    add('Fondo de cajonera (MDF 3mm)',1,'55×122 cm','—','ok','Emma ocupa 1 mueble = 1 fondo de cajonera (confirmado por el usuario)');
    // Confirmado por el usuario: la puertita de la cajonera Emma es la misma que la de la
    // cajonera de 5 cajones (80×27.3 cm).
    if(conPuerta) piezasPuertitaCajonera(add, color, '5', 'cajonera de 5 cajones (la misma que usa Emma)');
  } else if(tipo==='cajonera_espejo'){
    add('Pared',2,'191×40 cm',color,'ok','Adicional: cajonera de espejo');
    add('Entrepaño',5,'52×40 cm',color,'ok');
    add('Fondo de cajonera (MDF 3mm)',1,'55×122 cm','—','ok','Rendimiento confirmado: 4 fondos de cajonera por hoja de MDF 3mm');
    add('Zócalo especial',1,'18×52 cm',color,'ok');
    add('Zócalo especial',1,'16×52 cm',color,'ok');
    add('Espejo',1,'—','—','ok','1 "Espejos closet"');
    add('Jaladera (por espejo)',1,'—',color,'ok');
    add('Bisagra (por espejo)',1.5,'—','—','ok');
  } else if(tipo==='zapatera'){
    // Confirmado por el usuario: 2 paredes (191×40, iguales a las normales) + 8 entrepaños
    // (7 de 27×40 + 1 de 30×40, 24 por hoja) + 2 zócalos de 27×10. Aplica solo como opción de
    // mueble en Lateral y Central (en vez de entrepañera).
    add('Pared',2,'191×40 cm',color,'ok','Adicional: zapatera (2 paredes + 8 entrepaños + 2 zócalos)');
    add('Entrepaño zapatera',7,'27×40 cm',color,'ok','Confirmado: entrepaños de zapatera, 24 por hoja');
    add('Entrepaño zapatera',1,'30×40 cm',color,'ok','Confirmado: mismo rendimiento que el de 27×40 (24 por hoja)');
    add('Zócalo zapatera',2,'27×10 cm',color,'ok','Confirmado por el usuario');
    if(conPuerta){
      // Confirmado por el usuario: "zapatera con puerta" agrega 1 zócalo extra de 12×27 y la
      // puerta en sí (172×30, 1.5 bisagras, 1 jaladera).
      add('Zócalo zapatera',1,'12×27 cm',color,'ok','Zócalo extra cuando la zapatera lleva puerta (confirmado por el usuario)');
      add('Puerta de zapatera',1,'172×30 cm',color,'ok','Confirmado por el usuario: 172×30 cm');
      add('Bisagra (zapatera)',1.5,'—','—','ok','Confirmado por el usuario');
      add('Jaladera (zapatera)',1,'—',color,'ok','Confirmado por el usuario');
    }
  } else if(tipo==='repisa'){
    // Confirmado por el usuario: la repisa lleva su medida (largo × fondo) y pueden ser 1, 2 o 3.
    // Se descuenta el PROPORCIONAL de la hoja (ver piezasAConsumo), no la hoja completa.
    const largo = extra && Number(extra.largo), fondo = extra && Number(extra.fondo), cant = (extra && Number(extra.cantidad)) || 1;
    if(largo>0 && fondo>0) add('Repisa', cant, `${fmtNum(largo)}×${fmtNum(fondo)} cm`, color, 'ok', `${cant} repisa(s) de ${fmtNum(largo)}×${fmtNum(fondo)} cm; se descuenta la parte proporcional de la hoja`);
    else add('Repisa','Pendiente','—','—','pendiente','Falta capturar la medida de la repisa (largo × fondo).');
  }
  return piezas;
}

// Traduce el valor del selector "por muebles" (MUEBLE_TIPO_OPCIONES) a buildAdicionalPiezas
function buildMueblePiezasComp(value, cajonesManual, color, correderaExt){
  if(value==='cajonera_3') return buildAdicionalPiezas('cajonera', 3, color, correderaExt);
  if(value==='cajonera_5') return buildAdicionalPiezas('cajonera', 5, color, correderaExt);
  if(value==='cajonera_otra') return buildAdicionalPiezas('cajonera', cajonesManual, color, correderaExt);
  return buildAdicionalPiezas(value, cajonesManual, color); // entrepanera, cajonera_emma, cajonera_espejo, cajonera_max
}

// ===== Composición "por muebles" (combinaciones) =====
// Principio confirmado por el usuario y aplicado de forma general a TODOS los modelos/variantes:
// cada "mueble" de una familia (entrepañera, cajonera normal, Cajonera Max, Cajonera Emma o
// cajonera de espejo) trae sus PROPIAS paredes y zócalos — ver buildAdicionalPiezas: cada tipo
// ya suma sus 2 paredes (o las que le tocan) y sus zócalos, sean "Zócalo normal", "Zócalo Max"
// o "Zócalo especial". Por eso, al armar una combinación, el mueble SUSTITUYE su parte del
// total de la familia — no se le agrega aparte lo que ya trae. En la práctica esto significa
// que las piezas "Pared" y "Zócalo normal" del total plano de la familia (el que usa
// buildDespiece para los modelos con nombre) nunca se cuentan en una combinación: siempre
// vienen, completas, de la suma de los muebles elegidos. Esta regla es la misma sin importar
// si el mueble es normal, Emma, Max o espejo, así que no hace falta un caso especial por tipo.

// Deja solo las piezas de la familia que NO pertenecen a ningún mueble en particular: maleteros
// extra y herrajes (tubos/bridas). "Pared" y "Zócalo normal" se descartan porque cada mueble ya
// aporta los suyos (ver nota arriba); "Entrepaño" se descarta porque lo define la combinación.
function piezasFijasDeFamilia(base){
  return base.piezas.filter(p => p.nombre!=='Entrepaño' && p.nombre!=='Pared' && p.nombre!=='Zócalo normal');
}

// Confirmado por el usuario: toda variante Max lleva maleteros grandes; el maletero chico
// (191×40, mide igual que una Pared) se sustituye por uno normal (244×40). Si la familia ya
// tenía su propio maletero normal aparte (p.ej. Doble Especial a 3 metros), el chico sube a
// "grande" en vez de duplicar el normal.
function sustituirMaleteroPorMax(piezasFijas){
  const yaTeniaNormal = piezasFijas.some(p=>p.nombre==='Maletero normal');
  return piezasFijas.map(p=>{
    if(p.nombre!=='Maletero chico') return p;
    return yaTeniaNormal
      ? Object.assign({}, p, {nombre:'Maletero grande', dim:'40×244 cm', nota:'Ya había un maletero normal en la familia; el chico se sube a grande en vez de duplicar el normal (confirmado por el usuario)'})
      : Object.assign({}, p, {nombre:'Maletero normal (Max)', dim:'40×244 cm', nota:'Max sustituye el maletero chico (191×40) por uno normal (244×40)'});
  });
}

// Arma la composición completa de una familia eligiendo qué es cada uno de sus muebles fijos
// (en vez de un modelo con nombre). Los maleteros extra y herrajes de la familia se toman de
// buildDespiece con cajones=0/espejos=0 (son fijos, no cambian según qué ocupa cada mueble);
// las paredes/zócalos/entrepaños los aporta cada mueble elegido (ver piezasFijasDeFamilia).
function buildComposicion(fam, muebles, color, todoColor, maxOn, colorCajonera, especial3m, correderaExt){
  const estructuraColor = todoColor ? color : 'Blanco';
  const colorCaj = colorCajonera || estructuraColor;
  const base = buildDespiece(fam, 0, 0, color, todoColor, maxOn, colorCajonera, especial3m, correderaExt);
  let piezasFijas = piezasFijasDeFamilia(base);

  const numMueblesMax = muebles.filter(m=>m.value==='cajonera_max').length;
  if(numMueblesMax>0) piezasFijas = sustituirMaleteroPorMax(piezasFijas);

  const piezasMuebles = muebles.flatMap(m=>buildMueblePiezasComp(m.value, m.cajones, colorCaj, correderaExt));
  // Confirmado por el usuario: los zócalos de una cajonera dependen del color del FRENTE, no
  // del color de la cajonera. Se corrige aquí (una sola vez, sobre lo que aportó cada mueble)
  // en vez de duplicar esta regla dentro de cada tipo de mueble en buildAdicionalPiezas.
  const hayCajonera = muebles.some(m=>m.value!=='entrepanera');
  if(hayCajonera) piezasMuebles.forEach(p=>{ if(p.nombre==='Zócalo normal') p.colorDestino = color; });

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
    const hojasPorParedes = paredes/3;
    const entrepanosDeRegalo = hojasPorParedes*3;
    const entrepanosExtra = Math.max(0, entrepanos - entrepanosDeRegalo);
    const hojasExtra = entrepanosExtra/14;
    resultado.push({color, hojas: hojasPorParedes + hojasExtra});
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
    if(p.nombre==='Melamina (cajonera Max)' || p.nombre==='Melamina (entrepañera Max)'){
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
      <td>${TIPOS_ADICIONAL[a.tipo]}${a.tipo==='cajonera'?(' ('+a.cajones+' cajones)'):''}${a.tipo==='repisa'?(' ('+a.cantidad+' de '+fmtNum(a.largo)+'×'+fmtNum(a.fondo)+' cm)'):''}${a.conPuerta?(a.tipo==='zapatera'?' + puerta':' + puertitas'):''}</td>
      <td>${a.color}</td>
      <td><button class="btn small" style="background:transparent;color:var(--bad);border:1px solid var(--line)" onclick="quitarAdicional('${prefix}',${idx})">Quitar</button></td>
    </tr>`).join('');
  box.innerHTML = `<div class="card">
    ${prefix==='d'?`<strong>Adicionales</strong>
    <p class="hint">Cajonera, entrepañera, cajonera de espejo, zapatera o repisa que se agregan aparte del modelo — no cuentan como uno de sus muebles fijos.</p>`:''}
    ${list.length? `<div class="wrap-x"><table><tr><th>Extra</th><th>Color</th><th></th></tr>${rows}</table></div>` : (prefix==='d'?'<p class="hint">Sin adicionales.</p>':'')}
    <div class="grid2" style="margin-top:8px">
      <div><label class="hint">¿Qué es?</label><select id="${prefix}-adic-tipo" style="margin-top:4px" onchange="toggleAdicionalCajones('${prefix}')">${Object.keys(TIPOS_ADICIONAL).map(k=>`<option value="${k}">${TIPOS_ADICIONAL[k]}</option>`).join('')}</select></div>
      <div><label class="hint">Color</label><select id="${prefix}-adic-color" style="margin-top:4px">${MEL_COLORES.map(c=>`<option>${c}</option>`).join('')}</select></div>
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
    ? `<label class="hint" style="display:block;margin-top:8px">Cantidad de cajones</label><input type="number" min="1" id="${prefix}-adic-cajones" placeholder="ej. 3">`
    : (sel.value==='cajonera_max' ? `<p class="hint" style="margin-top:8px">La Cajonera Max siempre lleva 4 cajones (confirmado; no se captura cantidad).</p>` : '');
  if(sel.value==='repisa'){
    html = `<div class="grid2" style="margin-top:8px">
        <div><label class="hint">Largo (cm)</label><input type="number" min="1" inputmode="decimal" id="${prefix}-adic-largo" placeholder="ej. 90" style="margin-top:4px"></div>
        <div><label class="hint">Fondo (cm)</label><input type="number" min="1" inputmode="decimal" id="${prefix}-adic-fondo" placeholder="ej. 30" style="margin-top:4px"></div>
      </div>
      <label class="hint" style="display:block;margin-top:8px">¿Cuántas repisas?</label>
      <div class="chips" style="margin-top:4px" id="${prefix}-adic-cant-wrap">${[1,2,3].map(n=>`<button type="button" class="chip ${n===1?'on':''}" data-n="${n}" onclick="this.parentNode.querySelectorAll('.chip').forEach(b=>b.classList.remove('on'));this.classList.add('on')">${n}</button>`).join('')}</div>
      <p class="hint">Se descuenta solo la parte de la hoja que usan las repisas, no la hoja completa.</p>`;
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
      <select id="d-color">${MEL_COLORES.map(c=>`<option>${c}</option>`).join('')}</select>
      <select id="d-color-cajonera">${MEL_COLORES.map(c=>`<option>${c}</option>`).join('')}</select>
    </div>
    <p class="hint" style="margin:2px 0 0">El segundo color es para cajonera(s)/cajonera de espejo, independiente del frente.</p>
    <label class="hint" style="display:flex;align-items:center;gap:6px;margin-top:8px">
      <input type="checkbox" id="d-todocolor" style="width:auto"> Cliente pidió "todo de un solo color"
    </label>
    <label class="hint" style="display:flex;align-items:center;gap:6px;margin-top:8px">
      <input type="checkbox" id="d-corredera-ext" style="width:auto"> Usar corredera de extensión (sustituye la corredera normal en las cajoneras; no aplica a Cajonera Max, que siempre lleva extensión)
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
      ${dFamiliaComp==='King'?`<label class="hint" style="display:flex;align-items:center;gap:6px;margin-top:8px"><input type="checkbox" id="d-max-comp" style="width:auto"> Es variante Max (maleteros)</label>`:''}
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
  if(m.maxDisponible) wrap.innerHTML = `<label class="hint" style="display:flex;align-items:center;gap:6px;margin-top:4px"><input type="checkbox" id="d-max" style="width:auto"> Es variante Max (sustituye componentes, no los suma)</label>`;
  else if(m.especial3mDisponible) wrap.innerHTML = `<label class="hint" style="display:flex;align-items:center;gap:6px;margin-top:4px"><input type="checkbox" id="d-especial3m" style="width:auto"> Es variante a 3 metros (maletero chico extra)</label>`;
  else wrap.innerHTML = '';
}

function calcDespiece(){
  const color = $('#d-color').value;
  const todoColor = $('#d-todocolor').checked;
  const colorCajonera = $('#d-color-cajonera').value;
  const correderaExt = document.getElementById('d-corredera-ext') ? document.getElementById('d-corredera-ext').checked : false;
  let piezasModelo, maxNota, titulo, notaModelo=null;
  if(dModoComp){
    const maxOn = dFamiliaComp==='King' && document.getElementById('d-max-comp') ? document.getElementById('d-max-comp').checked : false;
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
  const piezasAdic = dAdicionales.flatMap(a=>buildAdicionalPiezas(a.tipo, a.cajones, a.color, correderaExt, a.conPuerta, a));
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
  const op = (k, ic, t, sub) => `<button class="tipobtn ${instSub===k?'on':''}" onclick="instSub='${k}';instPreview=null;renderInst()"><span class="tipo-ic">${ic}</span><span><strong>${t}</strong><br><small>${sub}</small></span></button>`;
  $('#main').innerHTML = `
    <div class="card">
      <div style="font-size:17px;font-weight:800;margin-bottom:10px">🔧 ¿Qué se instaló?</div>
      <div class="tipos">
        ${op('mueble','🗄️','Clóset','Un modelo o muebles')}
        ${op('puertas','🚪','Puertas','Puertas corredizas')}
      </div>
      <button class="btn small" style="margin-top:10px;width:100%;background:transparent;color:var(--brand);border:1px solid var(--line);box-shadow:none" onclick="instSub='historial';renderInst()">📅 Ver instalaciones anteriores</button>
    </div>
    <div id="inst-body"></div>`;
  if(instSub==='mueble') renderInstMueble();
  else if(instSub==='puertas') renderInstPuertas();
  else renderInstHistorial();
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
  if(instLog.length===0){ $('#inst-body').innerHTML = `<div class="card">Aún no hay instalaciones registradas en ${modulo()}.</div>`; return; }
  const porDia = {};
  instLog.forEach(x=>{ (porDia[x.fechaDia] = porDia[x.fechaDia]||[]).push(x); });
  const dias = Object.keys(porDia).sort((a,b)=>b.localeCompare(a));
  $('#inst-body').innerHTML = dias.map(dia=>`
    <div class="card">
      <strong>${new Date(dia+'T00:00:00').toLocaleDateString('es-MX',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</strong>
      <div class="tag">${porDia[dia].length} instalación(es)</div>
      <div class="wrap-x" style="margin-top:6px"><table><tr><th>Tipo</th><th>Detalle</th><th>Nota</th><th>Hora</th><th>Estado</th></tr>
      ${porDia[dia].map(x=>`<tr><td>${x.categoria}</td><td>${x.descripcion}</td><td>${x.nota||''}</td><td>${new Date(x.fecha).toLocaleTimeString()}</td><td>${badgeEstado(x.estado)}</td></tr>`).join('')}
      </table></div>
    </div>`).join('');
}

let iFamSel = null; // familia elegida (para no mostrar todos los modelos juntos)
function renderInstMueble(){
  const hoy = new Date(); const hoyStr = new Date(hoy.getTime()-hoy.getTimezoneOffset()*60000).toISOString().slice(0,10);
  $('#inst-body').innerHTML = `
  <div class="card">
    <div class="paso">1</div><strong>¿Qué modelo se instaló?</strong>
    <div id="i-selector-wrap" style="margin-top:10px"></div>
    <div id="i-max-wrap"></div>
    <button class="btn small" style="margin-top:10px;background:transparent;color:var(--brand);border:1px solid var(--line);box-shadow:none" onclick="iModoComp=!iModoComp;renderInstMueble()">${iModoComp?'← Elegir de la lista de modelos':'¿No está el modelo? Ármalo mueble por mueble'}</button>
  </div>
  <div class="card">
    <div class="paso">2</div><strong>¿De qué color?</strong>
    <label class="hint" style="display:block;margin-top:10px">Color de los frentes</label>
    <select id="i-color" style="margin-top:4px">${MEL_COLORES.map(c=>`<option>${c}</option>`).join('')}</select>
    <div id="i-cajcolor-wrap"></div>
    <label class="row" style="margin-top:12px;gap:10px;font-size:14px;flex-wrap:nowrap"><input type="checkbox" id="i-todocolor" style="width:22px;min-height:22px;flex:0 0 22px"> El cliente pidió todo del mismo color (también el interior)</label>
  </div>
  <details class="card" ${iAdicionales.length?'open':''}>
    <summary><span class="paso">3</span><strong>¿Lleva algo extra?</strong> <span class="hint" style="margin:0 0 0 6px">(opcional)</span></summary>
    <p class="hint">Cajoneras, zapateras, repisas u otros muebles que se agregaron aparte del modelo.</p>
    <div id="i-adic-box" class="subcard"></div>
    <label class="row" style="margin-top:10px;gap:10px;font-size:14px;flex-wrap:nowrap"><input type="checkbox" id="i-corredera-ext" style="width:22px;min-height:22px;flex:0 0 22px"> Las cajoneras llevan corredera de extensión</label>
  </details>
  <div class="card">
    <div class="paso">4</div><strong>Datos de la instalación</strong>
    <div class="grid2" style="margin-top:10px">
      <div><label class="hint">Fecha</label><input id="i-fecha" type="date" value="${hoyStr}" style="margin-top:4px"></div>
      <div><label class="hint">Cliente (opcional)</label><input id="i-nota" placeholder="Nombre o referencia" style="margin-top:4px"></div>
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
      ${iFamiliaComp==='King'?`<label class="hint" style="display:flex;align-items:center;gap:6px;margin-top:8px"><input type="checkbox" id="i-max-comp" style="width:auto"> Es variante Max (maleteros)</label>`:''}
      ${iFamiliaComp==='Doble Especial'?`<label class="hint" style="display:flex;align-items:center;gap:6px;margin-top:8px"><input type="checkbox" id="i-especial3m-comp" style="width:auto"> Es variante a 3 metros (maletero chico extra)</label>`:''}
      <label class="hint" style="display:block;margin-top:8px">Color de la cajonera / cajonera de espejo (independiente del frente)</label><select id="i-color-cajonera-comp">${MEL_COLORES.map(c=>`<option>${c}</option>`).join('')}</select>
    `;
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
  if(m.maxDisponible) wrapMax.innerHTML = `<label class="row" style="margin-top:10px;gap:10px;font-size:14px;flex-wrap:nowrap"><input type="checkbox" id="i-max" style="width:22px;min-height:22px;flex:0 0 22px"> Es versión <strong>Max</strong></label>`;
  else if(m.especial3mDisponible) wrapMax.innerHTML = `<label class="row" style="margin-top:10px;gap:10px;font-size:14px;flex-wrap:nowrap"><input type="checkbox" id="i-especial3m" style="width:22px;min-height:22px;flex:0 0 22px"> Es de <strong>3 metros</strong> (lleva maletero chico extra)</label>`;
  else wrapMax.innerHTML = '';
  wrapCaj.innerHTML = (m.cajones>0 || m.espejos>0)
    ? `<label class="hint" style="display:block;margin-top:10px">Color de la cajonera${m.espejos>0?' y del mueble de espejo':''}</label><select id="i-color-cajonera" style="margin-top:4px">${MEL_COLORES.map(c=>`<option>${c}</option>`).join('')}</select>`
    : '';
}

function previewInst(){
  const color = $('#i-color').value;
  const todoColor = $('#i-todocolor').checked;
  const correderaExt = document.getElementById('i-corredera-ext') ? document.getElementById('i-corredera-ext').checked : false;
  let piezasModelo, maxNota, titulo, notaModelo=null, colorCajonera;
  if(iModoComp){
    const maxOn = iFamiliaComp==='King' && document.getElementById('i-max-comp') ? document.getElementById('i-max-comp').checked : false;
    const especial3m = iFamiliaComp==='Doble Especial' && document.getElementById('i-especial3m-comp') ? document.getElementById('i-especial3m-comp').checked : false;
    const incompletos = iMueblesComp.filter(m=>m.value==='cajonera_otra' && !m.cajones);
    if(incompletos.length){ alert('Captura la cantidad de cajones en los muebles "Cajonera (otra cantidad)".'); return; }
    colorCajonera = document.getElementById('i-color-cajonera-comp') ? document.getElementById('i-color-cajonera-comp').value : null;
    const r = buildComposicion(iFamiliaComp, iMueblesComp, color, todoColor, maxOn, colorCajonera, especial3m, correderaExt);
    piezasModelo = r.piezas; maxNota = r.maxNota;
    titulo = iFamiliaComp+' — combinación: '+iMueblesComp.map(m=>MUEBLE_TIPO_OPCIONES.find(o=>o.value===m.value).label).join(' + ')+(especial3m?' · a 3 metros':'');
  } else {
    const modeloSel = MODELOS.find(x=>x.nombre===$('#i-modelo').value);
    const fam = modeloSel.fam, cajones = modeloSel.cajones, espejos = modeloSel.espejos;
    const maxOn = modeloSel.maxDisponible && document.getElementById('i-max') ? document.getElementById('i-max').checked : false;
    const especial3m = modeloSel.especial3mDisponible && document.getElementById('i-especial3m') ? document.getElementById('i-especial3m').checked : false;
    colorCajonera = (cajones>0 || espejos>0) && document.getElementById('i-color-cajonera') ? document.getElementById('i-color-cajonera').value : null;
    const r = buildDespiece(fam, cajones, espejos, color, todoColor, maxOn, colorCajonera, especial3m, correderaExt);
    piezasModelo = r.piezas; maxNota = r.maxNota;
    titulo = modeloSel.nombre+(especial3m?' · a 3 metros':''); notaModelo = modeloSel.nota;
  }
  const piezasAdic = iAdicionales.flatMap(a=>buildAdicionalPiezas(a.tipo, a.cajones, a.color, correderaExt, a.conPuerta, a));
  const piezas = piezasModelo.concat(piezasAdic);
  const pendientes = piezas.filter(p=>p.estado==='pendiente');
  const consumo = piezasAConsumo(piezas, color);

  // Validar existencias de cada artículo a consumir
  const faltantes = [];
  consumo.forEach(c=>{
    const f = calcFormula(c.itemId);
    if(f.final - c.cantidad < 0){
      faltantes.push({nombre:CATALOGO.find(i=>i.id===c.itemId).nombre, disponible:f.final, requerido:c.cantidad});
    }
  });

  const bloqueadoPorReceta = pendientes.length>0;
  const bloqueadoPorStock = faltantes.length>0;
  instPreview = {modeloNombre:titulo,color,colorCajonera,piezas,consumo,pendientes,faltantes,bloqueado: bloqueadoPorReceta||bloqueadoPorStock};

  let html = `<div class="card" id="i-preview-card">
    <div style="font-size:16px;font-weight:800">📋 Esto se va a descontar</div>
    <p class="hint" style="margin-top:4px"><strong>${titulo}</strong> · ${color}${colorCajonera?' · cajonera '+colorCajonera:''}${iAdicionales.length?' · + '+iAdicionales.length+' extra(s)':''}</p>
    ${notaModelo? `<div class="warn">${notaModelo}</div>`:''}
    ${maxNota? `<div class="warn">${maxNota}</div>`:''}
    <div class="movlist">${consumo.map(c=>{ const f=calcFormula(c.itemId); const insuf = f.final-c.cantidad<0;
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
  } else {
    html += avisoAutoCorteHtml(consumo);
    html += `<div class="card"><button class="btn" style="width:100%;min-height:56px;font-size:16px;background:linear-gradient(135deg,#1f9d55,#178045)" onclick="confirmarInst()">✅ Confirmar instalación</button></div>`;
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
let garLineas = [], garTipo = 'pieza', garSub = 'nueva', garPreview = null;
let garForm = {pieza:'pared', color:'Blanco', cantidad:'', medidaNombre:'Puerta', ancho:'', alto:'', armTipo:'cajon', armVar:'normal', colorCuadro:'Blanco', ext:false, itemId:null,
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
  if(l.tipo==='armado') return `${l.cantidad} × ${describirArmado({tipo:l.armTipo, variante:l.armVar, color:l.color, colorCuadro:l.colorCuadro, ext:l.ext, cantidad:l.cantidad})}`;
  if(l.tipo==='item'){ const it=CATALOGO.find(i=>i.id===l.itemId); return `${l.cantidad} ${it?it.unidad:''} de ${it?it.nombre:l.itemId}`; }
  if(l.tipo==='puertas'){
    const base = `puertas "${l.pTipo}" (hueco ${fmtNum(l.pAlto)} alto × ${fmtNum(l.pAncho)} ancho) · ${l.color}`;
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
function consumoGarantia(lineas){
  const pool = [], medidas = {}, directo = {};
  lineas.forEach(l=>{
    const n = Number(l.cantidad)||0; if(!n) return;
    if(l.tipo==='pieza'){
      const p = PIEZAS_AUDIT.find(x=>x.key===l.pieza); if(!p) return;
      pool.push({nombre:p.nombre, cantidad:n, dim:p.dim, colorDestino: p.tipo==='mel'? l.color : '—', estado:'ok'});
    } else if(l.tipo==='medida'){
      (medidas[l.color] = medidas[l.color]||[]).push({ancho:Number(l.ancho), alto:Number(l.alto), cantidad:n});
    } else if(l.tipo==='armado'){
      // Las medias correderas del armado se entregan como juegos completos (del inventario sale el juego).
      piezasDeArmado({tipo:l.armTipo, variante:l.armVar, color:l.color, colorCuadro:l.colorCuadro, ext:l.ext, cantidad:n}).forEach(p=>{
        if(/^Corredera (hembra|macho)/.test(p.nombre)){
          const juego = itemByName(/extensión/.test(p.nombre) ? 'Correderas de extensión' : 'Juego de corredera');
          if(juego) directo[juego.id] = (directo[juego.id]||0) + p.cantidad;
        } else pool.push(p);
      });
    } else if(l.tipo==='item'){
      directo[l.itemId] = (directo[l.itemId]||0) + n;
    } else if(l.tipo==='puertas'){
      // Mismas fórmulas que Instalación de puertas, a partir de la medida del hueco.
      const r = calcularPuerta(l.pTipo, Number(l.pAlto), Number(l.pAncho), false);
      const lista = (medidas[l.color] = medidas[l.color]||[]);
      if(l.pModo==='completas'){
        r.cortes.forEach(c=>lista.push({ancho:c.ancho, alto:c.alto, cantidad:c.cantidad*n}));
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
  Object.keys(directo).forEach(id=>{ if(id && id!=='undefined') out[id]=(out[id]||0)+directo[id]; });
  return Object.keys(out).map(itemId=>({itemId, cantidad: Math.round(out[itemId]*1000)/1000}));
}

function renderGar(){
  if(esSoloLectura()){ garSub='historial'; }
  const hoy = new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
  const top = `<div class="card">
      <div style="font-size:17px;font-weight:800">🛡️ Garantías · ${modulo()}</div>
      <p class="hint">Material que se entrega en garantía. Se descuenta del inventario al confirmar.</p>
      ${esSoloLectura()?'':`<div class="subtabs" style="margin:8px 0 0"><button class="${garSub==='nueva'?'active':''}" onclick="garSub='nueva';renderGar()">Nueva garantía</button><button class="${garSub==='historial'?'active':''}" onclick="garSub='historial';renderGar()">Garantías anteriores</button></div>`}
    </div>`;
  if(garSub==='historial'){ $('#main').innerHTML = top + '<div id="gar-hist"><div class="card hint">Cargando…</div></div>'; renderGarHistorial(); return; }
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
        <div><label class="hint">Alto del hueco (cm)</label><input type="number" inputmode="decimal" style="margin-top:4px" value="${f.pAlto}" onchange="garForm.pAlto=this.value;renderGar()" placeholder="ej. 240"></div>
        <div><label class="hint">Ancho del hueco (cm)</label><input type="number" inputmode="decimal" style="margin-top:4px" value="${f.pAncho}" onchange="garForm.pAncho=this.value;renderGar()" placeholder="ej. 180"></div>
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
        : '<p class="hint">Escribe primero el alto y el ancho del hueco para ver las piezas.</p>')}
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
        <div><label class="hint">¿Cuántos?</label><input type="number" min="1" inputmode="numeric" style="margin-top:4px" value="${f.cantidad}" oninput="garForm.cantidad=this.value" placeholder="1"></div>
      </div>
      ${(f.armTipo==='cajonera'||f.armTipo==='cajon') && f.armVar!=='max' ? `<label class="row" style="margin-top:10px;gap:10px;font-size:14px;flex-wrap:nowrap"><input type="checkbox" style="width:22px;min-height:22px;flex:0 0 22px" ${f.ext?'checked':''} onchange="garForm.ext=this.checked"> Lleva corredera de extensión</label>`:''}
      ${(f.armTipo==='cajonera'||f.armTipo==='cajon')?'<p class="hint">Incluye sus correderas (se descuenta el juego completo por cada cajón o hueco).</p>':''}`;
  } else {
    if(!f.itemId) f.itemId = (itemByName('Jaladeras')||CATALOGO[0]).id;
    const cats = [...new Set(CATALOGO.map(i=>i.cat))];
    campos = `<label class="hint">¿Qué artículo?</label>
      <select style="margin-top:4px" onchange="garForm.itemId=this.value;renderGar()">${cats.map(c=>`<optgroup label="${c}">${CATALOGO.filter(i=>i.cat===c).map(i=>`<option value="${i.id}" ${i.id===f.itemId?'selected':''}>${i.nombre}</option>`).join('')}</optgroup>`).join('')}</select>
      <label class="hint" style="display:block;margin-top:10px">¿Cuántos? (${item2unidad(f.itemId)})</label>
      <input type="number" min="0" inputmode="decimal" style="margin-top:4px" value="${f.cantidad}" oninput="garForm.cantidad=this.value" placeholder="1">`;
  }
  const lista = garLineas.length ? `<div class="movlist">${garLineas.map((l,i)=>`<div class="movitem"><span style="min-width:0">${describirLineaGar(l)}</span><button class="btn small" style="background:transparent;color:var(--bad);border:1px solid var(--line);box-shadow:none;flex:0 0 auto" onclick="garLineas.splice(${i},1);garPreview=null;renderGar()">Quitar</button></div>`).join('')}</div>` : '<p class="hint">Todavía no agregas nada.</p>';
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
    if(!al || !an) return alert('Escribe el alto y el ancho del hueco en centímetros.');
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
  else if(garTipo==='armado'){ l = {tipo:'armado', armTipo:f.armTipo, armVar:f.armVar, color:f.color, colorCuadro:f.colorCuadro, ext: (f.armTipo==='cajonera'||f.armTipo==='cajon') && f.armVar!=='max' ? !!f.ext : false, cantidad:n}; }
  else { l = {tipo:'item', itemId:f.itemId, cantidad:n}; }
  garLineas.push(l);
  garForm.cantidad=''; garForm.ancho=''; garForm.alto='';
  garPreview = null;
  renderGar();
  toast('Agregado: '+describirLineaGar(l));
}
function previewGar(){
  if(!garLineas.length) return alert('Primero agrega lo que se va a dar en garantía (paso 1).');
  const consumo = consumoGarantia(garLineas);
  const faltantes = consumo.map(c=>({c, f:calcFormula(c.itemId)})).filter(x=>x.f.final - x.c.cantidad < -1e-9)
    .map(x=>({nombre:CATALOGO.find(i=>i.id===x.c.itemId).nombre, disponible:x.f.final, requerido:x.c.cantidad}));
  garPreview = {consumo, bloqueado: faltantes.length>0};
  let html = `<div class="card" id="g-preview-card">
    <div style="font-size:16px;font-weight:800">📋 Esto se va a descontar</div>
    <div class="movlist">${consumo.map(c=>{ const f=calcFormula(c.itemId); const insuf = f.final-c.cantidad<0;
      return `<div class="movitem" style="${insuf?'border-color:var(--bad)':''}"><span style="min-width:0"><span class="invname">${CATALOGO.find(i=>i.id===c.itemId).nombre}</span><span class="hint" style="display:block;margin:2px 0 0">Hay ${fmtNum(f.final)} ${item2unidad(c.itemId)}</span></span>
        <strong class="${insuf?'neg':''}" style="font-size:17px;white-space:nowrap">${fmtNum(c.cantidad)} ${item2unidad(c.itemId)}</strong></div>`; }).join('')}</div>
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
    await db.collection('garantiasLog').doc(logId).set({modulo:mod, fechaDia, cliente, motivo, lineas:garLineas.map(describirLineaGar), consumo:garPreview.consumo, fecha:new Date().toISOString(), estado, creadoPor});
    toast(estado==='pendiente' ? '✅ Garantía guardada.<br><small>Dirección la tiene que aprobar para que se descuente.</small>' : '✅ Garantía registrada.');
    garLineas=[]; garPreview=null;
    renderGar(); window.scrollTo(0,0);
  }catch(e){ alert('Error al registrar: '+e.message); }
}
async function renderGarHistorial(){
  let logs=[];
  try{ const snap = await db.collection('garantiasLog').get(); logs = snap.docs.map(d=>({id:d.id,...d.data()})).filter(x=>x.modulo===modulo()).sort((a,b)=>(b.fecha||'').localeCompare(a.fecha||'')); }catch(e){}
  const el = document.getElementById('gar-hist'); if(!el) return;
  if(!logs.length){ el.innerHTML = '<div class="card">Aún no hay garantías registradas en '+modulo()+'.</div>'; return; }
  // El estado real sale de sus movimientos (se aprueban/rechazan desde Aprobaciones).
  const estadoDe = l => { const ms = movs.filter(m=>m.loteId===l.id); if(!ms.length) return l.estado; if(ms.some(m=>m.estado==='pendiente')) return 'pendiente'; if(ms.every(m=>m.estado==='rechazado')) return 'rechazado'; return 'aprobado'; };
  el.innerHTML = logs.map(l=>`<div class="card">
      <div class="row" style="justify-content:space-between"><strong>${new Date((l.fechaDia||l.fecha.slice(0,10))+'T12:00:00').toLocaleDateString('es-MX',{day:'numeric',month:'long',year:'numeric'})}</strong>${badgeEstado(estadoDe(l))}</div>
      ${l.cliente||l.motivo?`<p class="hint" style="margin:4px 0">${l.cliente?'Cliente: '+l.cliente:''}${l.cliente&&l.motivo?' · ':''}${l.motivo?'Motivo: '+l.motivo:''}</p>`:''}
      <ul style="margin:6px 0 6px 18px;padding:0;line-height:1.6">${(l.lineas||[]).map(x=>`<li>${x}</li>`).join('')}</ul>
      <details><summary class="hint">Material descontado</summary><div class="hint">${(l.consumo||[]).map(c=>{ const it=CATALOGO.find(i=>i.id===c.itemId); return `${it?it.nombre:c.itemId}: ${fmtNum(c.cantidad)} ${it?it.unidad:''}`; }).join('<br>')}</div></details>
    </div>`).join('');
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
      modulo:mod, categoria:'Mueble', descripcion:desc, nota, fechaDia,
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
  $('#inst-body').innerHTML = `
  <div class="card">
    <div class="paso">1</div><strong>¿Qué tipo de puerta?</strong>
    <select id="p-tipo" style="margin-top:10px" onchange="renderPuertaParedFalsaExtra()">${Object.keys(TIPOS_PUERTA).map(t=>`<option>${t}</option>`).join('')}</select>
    <div id="p-pared-falsa-extra-wrap" style="margin-top:8px"></div>
  </div>
  <div class="card">
    <div class="paso">2</div><strong>Medidas del hueco</strong>
    <div class="grid2" style="margin-top:10px">
      <div><label class="hint">Alto total (cm)</label><input id="p-alto" type="number" inputmode="decimal" placeholder="ej. 240" style="margin-top:4px"></div>
      <div><label class="hint">Ancho total (cm)</label><input id="p-ancho" type="number" inputmode="decimal" placeholder="ej. 180" style="margin-top:4px"></div>
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
    <div class="paso">4</div><strong>Datos de la instalación</strong>
    <div class="grid2" style="margin-top:10px">
      <div><label class="hint">Fecha</label><input id="p-fecha" type="date" value="${new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10)}" style="margin-top:4px"></div>
      <div><label class="hint">Cliente (opcional)</label><input id="p-nota" placeholder="Nombre o referencia" style="margin-top:4px"></div>
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
function _colocarPiezaEnLibres(libres, idx, pw, ph){
  const r = libres[idx];
  libres.splice(idx,1);
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
function hojasParaCortesCombinado(cortes, anchoHoja, altoHoja){
  anchoHoja = anchoHoja || 122; altoHoja = altoHoja || 244;
  let items = [];
  cortes.forEach(c=>{ for(let i=0;i<(c.cantidad||0);i++) items.push({ancho:c.ancho, alto:c.alto}); });
  // Piezas más grandes primero: da mejores resultados con este tipo de acomodo "greedy".
  items.sort((a,b)=> Math.max(b.ancho,b.alto)-Math.max(a.ancho,a.alto));

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
  hojas.forEach(hoja=>{
    const obligaHojaCompleta = hoja.items.some(it=>piezasPorHojaIndividual(it.ancho,it.alto,anchoHoja,altoHoja)<=1);
    if(obligaHojaCompleta){
      costo += 1;
    } else {
      hoja.items.forEach(it=>{
        const porHoja = piezasPorHojaIndividual(it.ancho,it.alto,anchoHoja,altoHoja);
        costo += porHoja>0 ? 1/porHoja : 1;
      });
    }
  });

  return {hojas: hojas.length, costo: Math.round(costo*1000)/1000, noCaben};
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
  return {info:piezas, cortes};
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
  const hojasMelamina = empaque.costo;
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
  if(hojasMelamina>0) consumo.push({itemId: itemByName('Melamina '+color).id, cantidad: hojasMelamina});

  const faltantes = [];
  consumo.forEach(c=>{
    const f = calcFormula(c.itemId);
    if(f.final - c.cantidad < 0){
      faltantes.push({nombre:CATALOGO.find(i=>i.id===c.itemId).nombre, disponible:f.final, requerido:c.cantidad});
    }
  });
  const bloqueado = faltantes.length>0;
  puertaPreview = {tipo, color, alto, ancho, consumo, faltantes, bloqueado};

  let html = `<div class="card"><h3>${tipo} · ${color}</h3>
    <div class="wrap-x"><table><tr><th>Dato</th><th>Valor</th><th>Regla</th></tr>
    ${piezas.map(p=>`<tr><td>${p.n}</td><td>${p.v}</td><td class="hint">${p.nota}</td></tr>`).join('')}
    </table></div>
    <div class="hint">Melamina de 15mm (color ${color}): todas las piezas de este corte se acomodan juntas en hojas de 122×244 cm, aprovechando el sobrante entre puertas/marcos/fijos. Se van a cortar <strong>${empaque.hojas} hoja(s) física(s)</strong> del almacén, pero solo se descuenta <strong>${hojasMelamina}</strong> del inventario (lo que realmente ocupan las piezas; el resto queda como sobrante disponible para otro corte).</div>
    <div class="wrap-x" style="margin-top:8px"><table><tr><th>Material/herraje a descontar</th><th>Cantidad</th><th>Disponible</th></tr>
    ${consumo.map(c=>{ const f=calcFormula(c.itemId); const insuf = f.final-c.cantidad<0;
      return `<tr><td>${CATALOGO.find(i=>i.id===c.itemId).nombre}</td><td class="${insuf?'neg':''}">${c.cantidad} ${item2unidad(c.itemId)}</td><td>${fmtNum(f.final)}</td></tr>`;
    }).join('')}
    </table></div>
  </div>`;

  if(bloqueado){
    html += `<div class="card aviso"><strong>⛔ No alcanza el material en ${modulo()}</strong>
      <ul style="margin:6px 0 0 18px;padding:0;line-height:1.7">${faltantes.map(f=>`<li>${f.nombre}: hay <strong>${fmtNum(f.disponible)}</strong> y se necesitan <strong>${fmtNum(f.requerido)}</strong></li>`).join('')}</ul>
      <p class="hint">Revisa las medidas y el color, o que ya se hayan anotado las entradas de material. No se descontó nada.</p></div>`;
  } else {
    html += avisoAutoCorteHtml(consumo);
    html += `<div class="card"><button class="btn" style="width:100%;min-height:56px;font-size:16px;background:linear-gradient(135deg,#1f9d55,#178045)" onclick="registrarPuerta('${tipo}',${alto},${ancho})">✅ Confirmar instalación de puertas</button></div>`;
  }
  $('#p-result').innerHTML = html;
}

async function registrarPuerta(tipo, alto, ancho){
  const colorSel = $('#p-color') ? $('#p-color').value : null;
  if(!puertaPreview || puertaPreview.bloqueado || puertaPreview.tipo!==tipo || puertaPreview.alto!==alto || puertaPreview.ancho!==ancho || puertaPreview.color!==colorSel){
    alert('Vuelve a calcular las medidas antes de registrar (los datos cambiaron o no hay vista previa).');
    return;
  }
  const nota = ($('#p-nota').value||'').trim();
  const fechaDia = $('#p-fecha').value || new Date().toISOString().slice(0,10);
  const desc = `Puerta ${tipo} · ${puertaPreview.color} · ${alto}×${ancho} cm`;
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
      modulo:modulo(), categoria:'Puerta', descripcion:desc, nota, fechaDia,
      consumo:puertaPreview.consumo, fecha:new Date().toISOString(), estado, creadoPor
    });
    toast(estado==='pendiente'
      ? '✅ Puertas guardadas.<br><small>Dirección las tiene que aprobar para que se descuenten.</small>'
      : '✅ Instalación de puertas registrada.');
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

  // Correderas (de la última auditoría que las contó): juegos totales y medias sin pareja
  const audCorr = auditorias.find(x=>x.correderas && x.correderas.length);
  html += `<div class="card"><h3>🔩 Correderas (juegos y desfasadas)</h3>
    ${audCorr ? `<p class="hint">Según la auditoría del ${new Date(audCorr.fecha).toLocaleDateString('es-MX')} (${audCorr.auditor||''}).</p>
    <div class="wrap-x"><table><tr><th>Tipo</th><th>Juegos totales</th><th>Hembras sin macho</th><th>Machos sin hembra</th></tr>
    ${audCorr.correderas.map(b=>`<tr><td>${b.etiqueta}</td><td><strong>${fmtNum(b.totalJuegos!==undefined?b.totalJuegos:b.pares)}</strong></td><td class="${b.hembrasSinPareja?'neg':''}">${fmtNum(b.hembrasSinPareja)}</td><td class="${b.machosSinPareja?'neg':''}">${fmtNum(b.machosSinPareja)}</td></tr>`).join('')}
    </table></div>` : '<p class="hint">Todavía no hay una auditoría que haya contado cajoneras, cajones o correderas sueltas.</p>'}
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
async function renderAprobaciones(){
  if(!esAdmin()){ $('#main').innerHTML = '<div class="card">Esta sección es solo para Dirección.</div>'; return; }
  $('#main').innerHTML = '<div class="card">Cargando pendientes…</div>';
  let todosMovs=[], todosLogs=[];
  try{
    const [snapMov, snapLog] = await Promise.all([db.collection('movimientos').get(), db.collection('instalacionesLog').get()]);
    todosMovs = snapMov.docs.map(d=>({id:d.id,...d.data()}));
    todosLogs = snapLog.docs.map(d=>({id:d.id,...d.data()}));
  }catch(e){ $('#main').innerHTML = `<div class="card">No se pudo cargar: ${e.message}</div>`; return; }

  const logsPendientes = todosLogs.filter(l=>l.estado==='pendiente').sort((a,b)=>(b.fecha||'').localeCompare(a.fecha||''));
  // Movimientos pendientes que NO son de una instalación (esos ya se muestran agrupados arriba
  // por su instalacionesLog) — se agrupan por loteId (una sola captura de Entradas/Salidas).
  const movsSueltosPendientes = todosMovs.filter(m=>m.estado==='pendiente' && m.tipo!=='instalacion');
  const lotes = {};
  movsSueltosPendientes.forEach(m=>{ const key=m.loteId||m.id; (lotes[key]=lotes[key]||[]).push(m); });
  const loteIds = Object.keys(lotes).sort((a,b)=>(lotes[b][0].fecha||'').localeCompare(lotes[a][0].fecha||''));

  if(logsPendientes.length===0 && loteIds.length===0){
    $('#main').innerHTML = '<div class="card">No hay nada pendiente de aprobación. 🎉</div>';
    return;
  }

  let html = `<div class="card"><strong>Aprobaciones</strong><p class="hint">Lo que capturan los coordinadores queda aquí hasta que lo apruebes o rechaces. Los traspasos entre módulos no requieren aprobación (se aplican de inmediato).</p></div>`;

  if(loteIds.length>0){
    html += `<div class="card"><h3>Entradas / Salidas pendientes (${loteIds.length})</h3></div>`;
    html += loteIds.map(key=>{
      const items = lotes[key];
      const m0 = items[0];
      return `<div class="card">
        <div class="row" style="justify-content:space-between">
          <div><strong>${m0.modulo}</strong><div class="tag">${new Date(m0.fecha).toLocaleString()}</div>${m0.creadoPor?`<div class="tag">${m0.creadoPor}</div>`:''}</div>
        </div>
        <div class="wrap-x" style="margin-top:6px"><table><tr><th>Artículo</th><th>Tipo</th><th>Cant.</th><th>Nota</th></tr>
        ${items.map(m=>`<tr><td>${m.itemNombre}</td><td class="${m.tipo==='entrada'?'pos':(m.tipo==='corte'?'':'neg')}">${etiquetaTipoMov(m)}</td><td>${fmtNum(m.cantidad)}</td><td>${m.nota||''}</td></tr>`).join('')}
        </table></div>
        <div class="row" style="justify-content:flex-end;margin-top:8px">
          <button class="btn small" style="background:transparent;color:var(--bad);border:1px solid var(--line)" onclick="rechazarLote('${key}')">Rechazar</button>
          <button class="btn small" onclick="aprobarLote('${key}')">Aprobar</button>
        </div>
      </div>`;
    }).join('');
  }

  if(logsPendientes.length>0){
    html += `<div class="card"><h3>Instalaciones pendientes (${logsPendientes.length})</h3></div>`;
    html += logsPendientes.map(l=>`<div class="card">
        <div class="row" style="justify-content:space-between">
          <div><strong>${l.modulo}</strong><div class="tag">${l.categoria}</div><div class="tag">${l.fechaDia}</div>${l.creadoPor?`<div class="tag">${l.creadoPor}</div>`:''}</div>
        </div>
        <p class="hint" style="margin:6px 0">${l.descripcion}${l.nota?(' · '+l.nota):''}</p>
        <div class="wrap-x"><table><tr><th>Artículo</th><th>Cant.</th></tr>
        ${(l.consumo||[]).map(c=>`<tr><td>${CATALOGO.find(i=>i.id===c.itemId)?.nombre||c.itemId}</td><td>${fmtNum(c.cantidad)}</td></tr>`).join('')}
        </table></div>
        <div class="row" style="justify-content:flex-end;margin-top:8px">
          <button class="btn small" style="background:transparent;color:var(--bad);border:1px solid var(--line)" onclick="rechazarInstalacion('${l.id}')">Rechazar</button>
          <button class="btn small" onclick="aprobarInstalacion('${l.id}')">Aprobar</button>
        </div>
      </div>`).join('');
  }

  $('#main').innerHTML = html;
}

async function cambiarEstadoLote(loteId, nuevoEstado){
  const snap = await db.collection('movimientos').get();
  const docs = snap.docs.filter(d=>{ const m=d.data(); return (m.loteId||d.id)===loteId && m.estado==='pendiente'; });
  for(const d of docs){ await db.collection('movimientos').doc(d.id).update({estado:nuevoEstado}); }
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
async function aprobarInstalacion(logId){
  try{
    await db.collection('instalacionesLog').doc(logId).update({estado:'aprobado'});
    await cambiarEstadoLote(logId,'aprobado');
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

  const rolOpts = (sel)=>['admin','coordinador','supervisor','gerente'].map(r=>`<option value="${r}" ${r===sel?'selected':''}>${ROL_LABELS[r]}</option>`).join('');
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

// modo 'completo' = inventario completo de siempre (en hojas: movimientos, completas, cortado y final).
// modo 'sincortar' = reporte aparte, solo de Melamina: cuántas hojas quedan SIN CORTAR por color.
async function generarReporteDiarioPDF(modo){
  modo = modo || 'completo';
  const soloSinCortar = modo==='sincortar';
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const mod = modulo();
  const ahora = new Date();
  const fechaStr = ahora.toLocaleDateString('es-MX', {year:'numeric', month:'long', day:'numeric'});
  const horaStr = ahora.toLocaleTimeString('es-MX');

  const marginL = 14;
  const pageH = doc.internal.pageSize.getHeight();
  // Columnas normales, y columnas extendidas para hojas (Melamina/MDF): Corte, Completas y Cortado.
  const COLS_NORMAL = [
    {label:'Artículo', w:54}, {label:'Inicial', w:16}, {label:'Entr.', w:16}, {label:'Sal.', w:16},
    {label:'Instal.', w:16}, {label:'Garant.', w:16}, {label:'Mermas', w:16}, {label:'Ajuste', w:16}, {label:'Final', w:16}
  ];
  const COLS_HOJA = soloSinCortar
    ? [ {label:'Artículo', w:120}, {label:'Hojas sin cortar', w:62} ]
    : [
      {label:'Artículo', w:38}, {label:'Inicial', w:13.1}, {label:'Entr.', w:13.1}, {label:'Sal.', w:13.1},
      {label:'Corte', w:13.1}, {label:'Instal.', w:13.1}, {label:'Garant.', w:13.1}, {label:'Mermas', w:13.1}, {label:'Ajuste', w:13.1},
      {label:'Compl.', w:13.1}, {label:'Cortado', w:13.1}, {label:'Final', w:13.1}
    ];
  let cols = COLS_NORMAL;
  const tableW = () => cols.reduce((s,c)=>s+c.w,0);
  function colX(i){ let x=marginL; for(let k=0;k<i;k++) x+=cols[k].w; return x; }

  let y = 15;
  doc.setFontSize(14);
  doc.text(soloSinCortar ? 'Closets Vera · Melamina sin cortar' : 'Closets Vera · Inventario Diario', marginL, y); y+=7;
  doc.setFontSize(10);
  doc.text(`Módulo: ${mod}`, marginL, y); y+=5;
  doc.text(`Cerrado: ${fechaStr}, ${horaStr}`, marginL, y); y+=5;
  const correo = (typeof getCurrentUserEmail==='function' ? getCurrentUserEmail() : '') || '';
  doc.text(`Por: ${correo}`, marginL, y); y+=8;

  // Recuadro de resumen
  const catsResumen = soloSinCortar ? ['Melamina'] : ['Melamina','MDF'];
  const resumenHojas = catsResumen.map(cat=>{
    const t = CATALOGO.filter(i=>i.cat===cat).reduce((s,it)=>{ const f=calcFormula(it.id); s.c+=f.completas; s.k+=f.cortado; s.t+=f.final; s.a+=f.autoCortes; return s; },{c:0,k:0,t:0,a:0});
    return {cat, ...t};
  });
  doc.setFillColor(238,242,255);
  doc.rect(marginL, y, 182, 7+resumenHojas.length*5, 'F');
  doc.setFontSize(9); doc.setFont(undefined,'bold');
  doc.text(soloSinCortar ? 'Total de hojas sin cortar' : 'Hojas completas vs. material cortado/armado', marginL+2, y+5);
  doc.setFont(undefined,'normal');
  resumenHojas.forEach((r,i)=>{
    const txt = soloSinCortar
      ? `${r.cat}: ${fmtNum(r.c)} hojas sin cortar`
      : `${r.cat}: ${fmtNum(r.c)} completas · ${fmtNum(r.k)} cortado/armado · ${fmtNum(r.t)} total${r.a?`  (${fmtNum(r.a)} hoja(s) sin corte registrado)`:''}`;
    doc.text(txt, marginL+2, y+10+i*5);
  });
  y += 7+resumenHojas.length*5+6;

  function drawHeaderRow(){
    doc.setFillColor(62,92,222);
    doc.setTextColor(255,255,255);
    doc.rect(marginL, y, tableW(), 6, 'F');
    doc.setFontSize(8);
    doc.setFont(undefined,'bold');
    cols.forEach((c,i)=> doc.text(c.label, colX(i)+1.5, y+4.2));
    doc.setFont(undefined,'normal');
    doc.setTextColor(0,0,0);
    y += 6;
  }

  const cats = soloSinCortar ? ['Melamina'] : [...new Set(CATALOGO.map(i=>i.cat))];
  cats.forEach(cat=>{
    const items = CATALOGO.filter(i=>i.cat===cat);
    const catHoja = items.length>0 && esHoja(items[0]);
    cols = catHoja ? COLS_HOJA : COLS_NORMAL;
    if(y > pageH-30){ doc.addPage(); y=15; }
    doc.setFontSize(11);
    doc.setFont(undefined,'bold');
    doc.text(cat, marginL, y+4);
    doc.setFont(undefined,'normal');
    y += 7;
    drawHeaderRow();
    doc.setFontSize(8);
    items.forEach((it,idx)=>{
      if(y > pageH-15){ doc.addPage(); y=15; drawHeaderRow(); doc.setFontSize(8); }
      if(idx%2===1){ doc.setFillColor(244,246,251); doc.rect(marginL, y, tableW(), 5, 'F'); }
      const f = calcFormula(it.id);
      const vals = catHoja
        ? (soloSinCortar ? [it.nombre, fmtNum(f.completas)]
           : [it.nombre, fmtNum(f.inicial), fmtNum(f.entradas), fmtNum(f.salidas), fmtNum(f.cortes+f.autoCortes), fmtNum(f.instalaciones), fmtNum(f.garantias), fmtNum(f.mermas), fmtNum(f.ajustes), fmtNum(f.completas), fmtNum(f.cortado), fmtNum(f.final)])
        : [it.nombre, fmtNum(f.inicial), fmtNum(f.entradas), fmtNum(f.salidas), fmtNum(f.instalaciones), fmtNum(f.garantias), fmtNum(f.mermas), fmtNum(f.ajustes), fmtNum(f.final)];
      const maxLen = catHoja ? (soloSinCortar ? 60 : 22) : 32;
      vals.forEach((v,i)=>{
        let text = String(v);
        if(i===0 && text.length>maxLen) text = text.slice(0,maxLen-2)+'…';
        doc.text(text, colX(i)+1.5, y+3.6);
      });
      y += 5;
    });
    y += 6;
  });

  // Segunda parte del MISMO reporte (confirmado por el usuario): hoja aparte con la melamina sin cortar.
  if(!soloSinCortar){
    doc.addPage(); y = 15;
    doc.setFontSize(14);
    doc.text('Melamina sin cortar', marginL, y); y+=7;
    doc.setFontSize(10);
    doc.text(`Módulo: ${mod} · ${fechaStr}, ${horaStr}`, marginL, y); y+=8;
    const itemsMel = CATALOGO.filter(i=>i.cat==='Melamina');
    const totMel = itemsMel.reduce((s,it)=>s+calcFormula(it.id).completas,0);
    doc.setFillColor(238,242,255); doc.rect(marginL, y, 182, 9, 'F');
    doc.setFontSize(11); doc.setFont(undefined,'bold');
    doc.text(`Total: ${fmtNum(totMel)} hojas de melamina sin cortar`, marginL+2, y+6);
    doc.setFont(undefined,'normal');
    y += 15;
    cols = [ {label:'Color', w:120}, {label:'Hojas sin cortar', w:62} ];
    drawHeaderRow();
    doc.setFontSize(9);
    itemsMel.forEach((it,idx)=>{
      if(y > pageH-15){ doc.addPage(); y=15; drawHeaderRow(); doc.setFontSize(9); }
      if(idx%2===1){ doc.setFillColor(244,246,251); doc.rect(marginL, y, tableW(), 5.5, 'F'); }
      doc.text(it.nombre, colX(0)+1.5, y+4);
      doc.text(String(fmtNum(calcFormula(it.id).completas)), colX(1)+1.5, y+4);
      y += 5.5;
    });
  }

  // Correderas según la última auditoría que las contó (juegos totales y medias desfasadas)
  const audCorrPdf = !soloSinCortar ? auditorias.find(x=>x.correderas && x.correderas.length) : null;
  if(audCorrPdf){
    if(y > pageH-50){ doc.addPage(); y=15; } else { y += 10; }
    doc.setFontSize(12); doc.setFont(undefined,'bold');
    doc.text('Correderas (según auditoría del '+new Date(audCorrPdf.fecha).toLocaleDateString('es-MX')+')', marginL, y); y+=6;
    doc.setFont(undefined,'normal');
    cols = [ {label:'Tipo', w:62}, {label:'Juegos totales', w:40}, {label:'Hembras sin macho', w:40}, {label:'Machos sin hembra', w:40} ];
    drawHeaderRow(); doc.setFontSize(9);
    audCorrPdf.correderas.forEach(bc=>{
      doc.text(bc.etiqueta, colX(0)+1.5, y+4);
      doc.text(String(fmtNum(bc.totalJuegos!==undefined?bc.totalJuegos:bc.pares)), colX(1)+1.5, y+4);
      doc.text(String(fmtNum(bc.hembrasSinPareja)), colX(2)+1.5, y+4);
      doc.text(String(fmtNum(bc.machosSinPareja)), colX(3)+1.5, y+4);
      y += 5.5;
    });
  }

  const stamp = ahora.toISOString().slice(0,10);
  const filename = `${soloSinCortar?'melamina-sin-cortar':'inventario'}-${mod.replace(/\s+/g,'_')}-${stamp}.pdf`;
  const blob = doc.output('blob');

  if(navigator.canShare && navigator.canShare({ files:[new File([blob], filename, {type:'application/pdf'})] })){
    try{
      await navigator.share({ files:[new File([blob], filename, {type:'application/pdf'})], title: soloSinCortar?'Melamina sin cortar':'Inventario diario', text:`${soloSinCortar?'Melamina sin cortar':'Inventario diario'} · ${mod} · ${fechaStr}` });
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
