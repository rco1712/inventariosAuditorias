// ===== AuditoriaModulos · Clóset Vera =====
// App independiente (PWA) — funciona con o sin internet. Las lecturas/escrituras van
// primero a IndexedDB (ver src/db.js) y se sincronizan con Supabase en cuanto hay señal.
// NOTA: este archivo es un script clásico (no type="module") a propósito: toda la UI usa
// atributos onclick="..." inline en el HTML generado, y esos solo pueden llamar funciones
// que cuelguen de `window` — lo que Un script clásico hace automáticamente con cada
// `function nombre(){}` de nivel superior. db/initSync/auth, etc. los expone src/bootstrap.js
// (un módulo aparte) como variables globales ANTES de insertar este script; ver index.html.


const $=s=>document.querySelector(s);
let inicialMap={}, movs=[], resetMap={}, auditorias=[], current='inv';
let auditCat=null, auditCapturas={};
let moduloActual = localStorage.getItem('am_modulo') || null;
// Perfil del usuario (rol + módulo asignado). Lo llena boot() con getMyProfile() antes de
// llamar a init(). rol: 'admin' (ve/edita todo) | 'coordinador' (solo su módulo) |
// 'supervisor' (ve todo, sin poder capturar nada). Sin Supabase configurado, queda null y
// la app se comporta como antes (un solo usuario local, sin restricciones).
let miPerfil = null;
function puedeEscribir(){ return !miPerfil || miPerfil.rol==='admin' || miPerfil.rol==='coordinador'; }
function esAdmin(){ return !miPerfil || miPerfil.rol==='admin'; }
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
  cajonera_max: 'Cajonera Max (pendiente)',
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
  {value:'cajonera_max', label:'Cajonera Max (pendiente)'},
  {value:'cajonera_otra', label:'Cajonera (otra cantidad)'}
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
  const ocultarTabs = miPerfil.rol==='supervisor' ? ['mov','aud','inst','trasp'] : (miPerfil.rol==='coordinador' ? ['trasp'] : []);
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
  setView('inv');
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
  setView('inv');
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
      inicialMap={}; snap.docs.forEach(d=>{ inicialMap[d.data().itemId]=d.data().cantidad; });
      if(current==='inv') renderInv();
    });
  }catch(e){}
  try{
    db.collection('movimientos').onSnapshot(snap=>{
      movs = snap.docs.map(d=>({id:d.id,...d.data()})).filter(m=>m.modulo===modulo()).sort((a,b)=>(b.fecha||'').localeCompare(a.fecha||''));
      if(current==='inv') renderInv(); if(current==='mov') renderMov();
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
}

// Calcula {inicial, entradas, salidas, instalaciones, mermas, final} para un artículo
function calcFormula(itemId){
  const resetFecha = resetMap[modulo()];
  const inicial = resetFecha ? 0 : (inicialMap[itemId] ?? 0);
  let entradas=0, salidas=0, instalaciones=0, mermas=0;
  movs.filter(m=>m.itemId===itemId && (!resetFecha || m.fecha>resetFecha)).forEach(m=>{
    if(m.tipo==='entrada') entradas+=m.cantidad;
    else if(m.tipo==='salida') salidas+=m.cantidad;
    else if(m.tipo==='instalacion') instalaciones+=m.cantidad;
    else if(m.tipo==='merma') mermas+=m.cantidad;
  });
  const final = inicial+entradas-salidas-instalaciones-mermas;
  return {inicial,entradas,salidas,instalaciones,mermas,final};
}

async function ceroModulo(){
  if(!puedeEscribir()) return alert('Tu cuenta es de solo lectura; no puedes poner en cero el inventario.');
  if(!confirm('¿Poner en CERO el inventario de '+modulo()+'? Esto no borra el historial, pero el stock actual de este módulo partirá de 0. Los demás módulos no se afectan.')) return;
  try{ await db.collection('resets').doc(modulo()).set({fecha:new Date().toISOString()}); alert('Inventario de '+modulo()+' reiniciado a cero.'); }
  catch(e){ alert('Error: '+e.message); }
}

async function editInicial(itemId){
  if(!puedeEscribir()) return alert('Tu cuenta es de solo lectura; no puedes cambiar el inicial.');
  const actual = inicialMap[itemId] ?? 0;
  const val = prompt('Stock inicial (línea base) para este artículo en '+modulo(), actual);
  if(val===null || isNaN(Number(val))) return;
  try{ await db.collection('inicial').doc(inicialKey(modulo(),itemId)).set({modulo:modulo(),itemId,cantidad:Number(val)}); }
  catch(e){ alert('Error: '+e.message); }
}

function setView(v){
  current=v;
  document.querySelectorAll('#nav button[data-v]').forEach(b=>b.classList.toggle('active',b.dataset.v===v));
  if(v==='inv') renderInv(); if(v==='mov') renderMov(); if(v==='aud') renderAud(); if(v==='hist') renderHist();
  if(v==='cat') renderCat(); if(v==='desp') renderDesp(); if(v==='inst'){ instPreview=null; renderInst(); }
  if(v==='trasp') renderTrasp(); if(v==='rep') renderRep();
}

let invCat = null;
function renderInv(){
  const cats = [...new Set(CATALOGO.map(i=>i.cat))];
  if(!invCat) invCat = cats[0];
  const catsHtml = cats.map(c=>
    `<button class="btn small" style="background:${c===invCat?'var(--brand)':'transparent'};color:${c===invCat?'var(--brand-ink)':'var(--ink)'};border:1px solid var(--line);margin:2px" onclick="invCat='${c}';renderInv()">${c}</button>`
  ).join('');
  let html = `<div class="card"><div class="row" style="justify-content:space-between">
      <strong>Inventario · ${modulo()}</strong>
      ${puedeEscribir()?`<button class="btn" style="background:transparent;color:var(--bad);border:1px solid var(--line)" onclick="ceroModulo()">Poner en cero</button>`:''}
    </div>
    <p class="hint">Fórmula: Inicial + Entradas − Salidas − Instalaciones − Mermas = Final. Toca "Inicial" para fijar la línea base tras un conteo físico.</p>
    <div style="margin-top:6px">${catsHtml}</div>
  </div>`;
  const rows = CATALOGO.filter(i=>i.cat===invCat);
  html += `<div class="card"><h3>${invCat}</h3><div class="wrap-x"><table>
      <tr><th>Artículo</th><th>Inicial</th><th>Entr.</th><th>Sal.</th><th>Instal.</th><th>Mermas</th><th>Final</th></tr>
      ${rows.map(it=>{ const f=calcFormula(it.id);
        return `<tr>
          <td>${it.nombre}<div class="tag">${it.unidad}</div></td>
          <td>${puedeEscribir()?`<a href="#" onclick="editInicial('${it.id}');return false;">${f.inicial}</a>`:f.inicial}</td>
          <td class="pos">${f.entradas}</td>
          <td class="neg">${f.salidas}</td>
          <td class="neg">${f.instalaciones}</td>
          <td class="neg">${f.mermas}</td>
          <td><strong>${f.final}</strong></td>
        </tr>`; }).join('')}
      </table></div></div>`;
  $('#main').innerHTML = html;
}

let movCat = null;
function renderMov(){
  const cats = [...new Set(CATALOGO.map(i=>i.cat))];
  if(!movCat) movCat = cats[0];
  const catsHtml = cats.map(c=>
    `<button class="btn small" style="background:${c===movCat?'var(--brand)':'transparent'};color:${c===movCat?'var(--brand-ink)':'var(--ink)'};border:1px solid var(--line);margin:2px" onclick="movCat='${c}';renderMov()">${c}</button>`
  ).join('');
  const items = CATALOGO.filter(i=>i.cat===movCat);
  $('#main').innerHTML = `
  <div class="card">
    <strong>Entradas / Salidas · ${modulo()}</strong>
    <p class="hint">Elige la categoría; se despliegan todos sus artículos para capturar varias cantidades a la vez, sin ir uno por uno.</p>
    <div style="margin-top:6px">${catsHtml}</div>
  </div>
  <div class="card">
    <div class="grid2">
      <select id="mv-tipo"><option value="entrada">Entrada</option><option value="salida">Salida</option><option value="instalacion">Instalación</option><option value="merma">Merma</option></select>
      <input id="mv-nota" placeholder="Nota (opcional, aplica a todos)">
    </div>
    <h3 style="margin-top:10px">${movCat}</h3>
    <div class="wrap-x"><table><tr><th>Artículo</th><th>Stock final</th><th>Cantidad</th></tr>
      ${items.map(it=>{ const f=calcFormula(it.id);
        return `<tr><td>${it.nombre}</td><td>${f.final} ${it.unidad}</td><td><input type="number" min="0" id="mv-${it.id}" placeholder="0"></td></tr>`;
      }).join('')}
    </table></div>
    <button class="btn" style="margin-top:10px" onclick="registrarMovLote()">Registrar movimientos de ${movCat}</button>
    <p class="hint">Las salidas, instalaciones y mermas no pueden dejar ningún artículo en negativo; se valida todo antes de guardar.</p>
  </div>
  <div class="card">
    <strong>Movimientos recientes</strong>
    <div class="wrap-x"><table><tr><th>Fecha</th><th>Artículo</th><th>Tipo</th><th>Cant.</th><th>Nota</th></tr>
    ${movs.slice(0,30).map(m=>`<tr><td>${new Date(m.fecha).toLocaleString()}</td><td>${m.itemNombre}</td>
      <td class="${m.tipo==='entrada'?'pos':'neg'}">${m.tipo}</td><td>${m.cantidad} ${item2unidad(m.itemId)}</td><td>${m.nota||''}</td></tr>`).join('')}
    </table></div>
  </div>`;
}

async function registrarMovLote(){
  const tipo = $('#mv-tipo').value;
  const nota = ($('#mv-nota').value||'').trim();
  const items = CATALOGO.filter(i=>i.cat===movCat);
  const decrece = tipo!=='entrada';
  const mod = modulo();
  const aplicar = [];
  for(const it of items){
    const el = document.getElementById('mv-'+it.id);
    const cantidad = Number(el.value);
    if(!cantidad || cantidad<=0) continue;
    const f = calcFormula(it.id);
    const nuevoFinal = decrece ? f.final - cantidad : f.final + cantidad;
    if(decrece && nuevoFinal<0){ alert('No hay stock suficiente para "'+it.nombre+'" (disponible: '+f.final+', pediste: '+cantidad+'). No se registró nada de este lote.'); return; }
    aplicar.push({itemId:it.id, itemNombre:it.nombre, cantidad});
  }
  if(aplicar.length===0) return alert('No capturaste ninguna cantidad.');
  try{
    for(const a of aplicar){
      await db.collection('movimientos').doc(cryptoId()).set({modulo:mod,itemId:a.itemId,itemNombre:a.itemNombre,tipo,cantidad:a.cantidad,nota,fecha:new Date().toISOString()});
    }
    alert(aplicar.length+' movimiento(s) registrado(s) en '+movCat+'.');
    renderMov();
  }catch(e){ alert('Error: '+e.message); }
}

function renderAud(){
  const cats = [...new Set(CATALOGO.map(i=>i.cat))];
  if(!auditCat) auditCat = cats[0];
  const capturadas = Object.keys(auditCapturas).length;
  const catsHtml = cats.map(c=>{
    const capturadosEnCat = CATALOGO.filter(i=>i.cat===c && auditCapturas[i.id]!==undefined).length;
    return `<button class="btn small" style="background:${c===auditCat?'var(--brand)':'transparent'};color:${c===auditCat?'var(--brand-ink)':'var(--ink)'};border:1px solid var(--line);margin:2px" onclick="selectAuditCat('${c}')">${c} ${capturadosEnCat?('✓'+capturadosEnCat):''}</button>`;
  }).join('');
  const items = CATALOGO.filter(i=>i.cat===auditCat);
  $('#main').innerHTML = `
  <div class="card">
    <strong>Auditoría física · ${modulo()}</strong>
    <p class="hint">Cuenta lo que existe físicamente ahora mismo. No desarmes mentalmente conjuntos armados: cuenta cada cosa tal como está.</p>
    <div class="grid2">
      <select id="aud-tipo"><option value="inicial">Auditoría inicial</option><option value="seguimiento">Auditoría de seguimiento</option></select>
      <input id="aud-auditor" placeholder="Nombre del auditor">
    </div>
  </div>
  <div class="card"><div>${catsHtml}</div></div>
  <div class="card">
    <h3>${auditCat}</h3>
    <div class="wrap-x"><table><tr><th>Artículo</th><th>Teórico</th><th>Físico contado</th></tr>
      ${items.map(it=>{ const f=calcFormula(it.id);
        return `<tr><td>${it.nombre}<div class="tag">${it.unidad}</div></td><td>${f.final}</td>
          <td><input type="number" value="${auditCapturas[it.id]??''}" oninput="auditCapturas['${it.id}']=this.value===''?undefined:Number(this.value)"></td></tr>`;
      }).join('')}
    </table></div>
  </div>
  <div class="card row" style="justify-content:space-between">
    <span class="hint">${capturadas} artículo(s) capturados en total.</span>
    <button class="btn" onclick="saveAudit()">Finalizar y guardar auditoría</button>
  </div>`;
}
function selectAuditCat(c){ auditCat=c; renderAud(); }

async function saveAudit(){
  const tipo = $('#aud-tipo').value;
  const auditor = $('#aud-auditor').value.trim() || 'Sin nombre';
  const resultados=[]; let totalDiff=0;
  Object.keys(auditCapturas).forEach(itemId=>{
    if(auditCapturas[itemId]===undefined) return;
    const it = CATALOGO.find(i=>i.id===itemId);
    const f = calcFormula(itemId);
    const fisico = auditCapturas[itemId];
    const diff = fisico - f.final;
    if(diff!==0) totalDiff++;
    resultados.push({itemId, nombre:it.nombre, teorico:f.final, fisico, diff});
  });
  if(resultados.length===0) return alert('No has capturado ningún artículo todavía.');
  try{
    await db.collection('auditorias').doc(cryptoId()).set({modulo:modulo(),tipo,auditor,fecha:new Date().toISOString(),resultados,totalDiff});
    auditCapturas={};
    alert('Auditoría guardada.');
    setView('hist');
  }catch(e){ alert('Error: '+e.message); }
}

function renderHist(){
  if(auditorias.length===0){ $('#main').innerHTML='<div class="card">Aún no hay auditorías registradas para '+modulo()+'.</div>'; return; }
  $('#main').innerHTML = auditorias.map(a=>`
    <div class="card">
      <div class="row" style="justify-content:space-between;cursor:pointer" onclick="toggleAud('${a.id}')">
        <div><strong>${new Date(a.fecha).toLocaleString()}</strong><div class="tag">${a.tipo}</div> <div class="tag">Auditor: ${a.auditor}</div></div>
        <div class="${a.totalDiff?'neg':'pos'}" style="font-weight:700">${a.totalDiff} discrepancia(s)</div>
      </div>
      <div id="ad-${a.id}" style="display:none;margin-top:8px" class="wrap-x">
        <table><tr><th>Artículo</th><th>Teórico</th><th>Físico</th><th>Dif.</th></tr>
        ${a.resultados.map(r=>`<tr><td>${r.nombre}</td><td>${r.teorico}</td><td>${r.fisico}</td><td class="${r.diff?'neg':'pos'}">${r.diff>0?'+':''}${r.diff}</td></tr>`).join('')}
        </table>
      </div>
    </div>`).join('');
}
function toggleAud(id){ const el=document.getElementById('ad-'+id); el.style.display = el.style.display==='none'?'block':'none'; }

const FAMILIAS_CAT = {
  'Lateral (4 modelos)': ['Lateral Sencillo','Lateral 3 Cajones','Lateral 5 Cajones','Lateral Espejo'],
  'Central (4 modelos)': ['Central Sencillo','Central 3 Cajones','Central 5 Cajones','Central Espejo'],
  'Doble (9 modelos)': ['Doble Sencillo','Doble 3 Cajones','Doble 5 Cajones','Doble 6 Cajones','Doble 10 Cajones','Doble Espejo','Doble 3 Cajones con Espejo','Doble 5 Cajones con Espejo','Doble Especial'],
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
  {nombre:'Doble Especial', fam:'Doble Especial', cajones:0, espejos:0, nota:'Misma estructura que Doble; solo cambia en herrajes (4 tubos/4 bridas en vez de 2/2). Este catálogo aún solo trae la variante Sencilla de Doble Especial; si hay variantes con cajones/espejo, dime el nombre exacto para agregarlas'},
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

// ===== Motor de despiece compartido por Despiece e Instalaciones =====
// Devuelve { piezas:[{nombre,cantidad,dim,colorDestino,estado,nota}], maxNota }
// Actualizado con el recetario confirmado por modelo (paredes/maleteros/cajonera/piezas de cajón/espejos/herrajes).
function buildDespiece(fam, cajones, espejos, color, todoColor, maxOn, colorCajonera){
  const estructuraColor = todoColor ? color : 'Blanco';
  // Color de la cajonera: independiente del frente y de "todo un color" (confirmado por el
  // usuario: "la cajonera puede ser de cualquier color y el frente también puede ser de
  // cualquier color"). Si no se especifica, cae en la estructuraColor de siempre.
  const colorCaj = colorCajonera || estructuraColor;
  const piezas = [];
  const add=(nombre,cantidad,dim,colorDestino,estado,nota)=>piezas.push({nombre,cantidad,dim,colorDestino,estado,nota:nota||''});
  let maxNota = '';

  {
    // Base por familia (paredes/maleteros).
    // IMPORTANTE: las paredes de la familia son el TOTAL del mueble (ya incluyen las
    // paredes de cada "mueble" interno — entrepañera, cajonera o espejo, los tres usan 2
    // paredes); NUNCA cambian según qué ocupa cada mueble.
    // Confirmado por el usuario: "Lateral Sencillo = 1 maletero chico (que es una pared) +
    // 2 paredes + 5 entrepaños + 2 zócalos" = 3 paredes en total, con o sin cajones.
    if(fam==='Lateral') add('Pared',3,'191×40 cm',estructuraColor,'ok','Incluye la pared del "maletero chico" + las 2 paredes de la entrepañera base (3 en total, fijo)');
    if(fam==='Central'){ add('Pared',2,'191×40 cm',estructuraColor,'ok'); add('Maletero normal',1,'40×244 cm',estructuraColor,'ok'); }
    if(fam==='Doble'){ add('Pared',4,'191×40 cm',estructuraColor,'ok'); add('Maletero normal',1,'40×244 cm',estructuraColor,'ok'); }
    if(fam==='Doble Especial'){ add('Pared',4,'191×40 cm',estructuraColor,'ok','Confirmado: Doble Especial tiene la misma estructura que Doble; solo cambia en herrajes (4 tubos/4 bridas en vez de 2/2)'); add('Maletero normal',1,'40×244 cm',estructuraColor,'ok'); }
    if(fam==='Triple'){ add('Pared',6,'191×40 cm',estructuraColor,'ok'); add('Maletero normal',2,'40×244 cm',estructuraColor,'ok'); }
    if(fam==='King'){
      add('Pared',4,'191×40 cm',estructuraColor,'ok');
      if(maxOn){
        add('Maletero normal (Max)',2,'40×244 cm',estructuraColor,'ok','Max sustituye "1 maletero chico + 1 maletero grande" por 2 maleteros normales; no se duplica');
        maxNota = 'King Max: se sustituyó "1 maletero chico + 1 maletero grande" por "2 maleteros normales". No se suman ambos.';
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
      const notaBase = fam==='Central'
        ? 'Asumido igual que Lateral (1 mueble = 1 entrepañera); no confirmado explícitamente para Central'
        : numMuebles+' mueble(s) = entrepañera(s) = '+(numMuebles*5)+' entrepaños (confirmado por el usuario)';
      add('Entrepaño', numMuebles*5, '52×40 cm', estructuraColor, 'ok', notaBase);
    } else if(cajones>0 && MUEBLES_CAJONERA[cajones]===undefined){
      add('Entrepaño','Pendiente','—','—','pendiente','La cantidad de entrepaños/muebles que ocupa la cajonera de '+cajones+' cajones no está confirmada; no se inventa');
    } else {
      const mueblesCajonera = cajones>0 ? MUEBLES_CAJONERA[cajones] : 0;
      const mueblesUsados = mueblesCajonera + espejos;
      const restantes = numMuebles - mueblesUsados;
      if(restantes < 0){
        add('Entrepaño','Pendiente','—','—','pendiente','La cajonera de '+cajones+' cajones + '+espejos+' espejo(s) ocupan más muebles ('+mueblesUsados+') de los que tiene '+fam+' ('+numMuebles+'); revisar el modelo, no se inventa');
      } else {
        if(cajones>0) add('Entrepaño', CAJONERA_ENTREPANOS[cajones], '40×52 cm', colorCaj, 'ok', 'Cajonera de '+cajones+' cajones ('+mueblesCajonera+' mueble(s)). Color de cajonera independiente del frente.');
        if(espejos>0) add('Entrepaño', espejos*5, '52×40 cm', colorCaj, 'ok', espejos+' espejo(s) = '+espejos+' mueble(s) tipo "cajonera de espejo" (5 entrepaños cada uno, confirmado por el usuario)');
        if(restantes>0) add('Entrepaño', restantes*5, '52×40 cm', estructuraColor, 'ok', restantes+' mueble(s) restante(s) = entrepañera(s) (confirmado: los muebles no usados por cajonera/espejo son entrepañeras)');
      }
    }
  }

  // Piezas de cajón: confirmadas para cualquier cantidad de cajones (regla general del recetario)
  if(cajones>0){
    add('Frente',cajones,'18×54 cm',color,'ok');
    add('Pieza chica de cajón',cajones*2,'33×16.5 cm',estructuraColor,'ok','Medida tomada del despiece confirmado de Doble 5 Cajones (única con medida documentada; aplicada como regla general de pieza de cajón)');
    add('Pieza grande de cajón',cajones*2,'46.4×16.5 cm',estructuraColor,'ok','Medida tomada del despiece confirmado de Doble 5 Cajones (única con medida documentada; aplicada como regla general de pieza de cajón)');
    if(maxOn){
      add('Fondo de cajón (MDF 5mm, Max)',cajones,'49.4×33 cm','—','ok','Los cajones de cajoneras Max usan fondo de MDF 5mm (rendimiento: 12 por hoja) en vez de MDF 3mm');
    } else {
      add('Fondo de cajón (MDF 3mm)',cajones,'49.4×33 cm','—','ok');
    }
    add('Juego de corredera',cajones,'—','—','ok','1 por cajón. Cada juego = 2 correderas macho (1 izq + 1 der, van en el cajón) + 2 correderas hembra (1 izq + 1 der, van en la cajonera). Se sigue descontando 1 "Juego de corredera" del catálogo; macho/hembra es informativo, no son artículos separados en inventario');
    add('Jaladera (por cajón)',cajones,'—',color,'ok','1 por cajón');
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
    add('Fondo cajonera con espejo (MDF 3mm)',espejos,'55×122 cm','—','ok','1 por espejo. Rendimiento confirmado: 4 fondos de cajonera por hoja de MDF 3mm');
    add('Zócalo especial',espejos,'18×52 cm',colorZocalo,'ok','1 por espejo (confirmado por el usuario)'+(cajones>0?'; color del frente (zócalos de cajonera dependen del color de frente, confirmado por el usuario)':''));
    add('Zócalo especial',espejos,'16×52 cm',colorZocalo,'ok','1 por espejo (confirmado por el usuario)');
  } else {
    add('Zócalo normal',2,'10×52 cm',colorZocalo,'ok', cajones>0?'Color del frente (zócalos de cajonera dependen del color de frente, confirmado por el usuario)':'');
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
function buildAdicionalPiezas(tipo, cajones, color){
  const piezas = [];
  const add=(nombre,cantidad,dim,colorDestino,estado,nota)=>piezas.push({nombre,cantidad,dim,colorDestino,estado,nota:nota||''});
  const CAJONERA_ENTREPANOS = {3:5, 5:4, 6:10, 8:9, 10:8};
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
    add('Juego de corredera',cajones,'—','—','ok','1 por cajón');
    add('Jaladera (por cajón)',cajones,'—',color,'ok');
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
  } else if(tipo==='cajonera_espejo'){
    add('Pared',2,'191×40 cm',color,'ok','Adicional: cajonera de espejo');
    add('Entrepaño',5,'52×40 cm',color,'ok');
    add('Fondo cajonera con espejo (MDF 3mm)',1,'55×122 cm','—','ok','Rendimiento confirmado: 4 fondos de cajonera por hoja de MDF 3mm');
    add('Zócalo especial',1,'18×52 cm',color,'ok');
    add('Zócalo especial',1,'16×52 cm',color,'ok');
    add('Espejo',1,'—','—','ok','1 "Espejos closet"');
    add('Jaladera (por espejo)',1,'—',color,'ok');
    add('Bisagra (por espejo)',1.5,'—','—','ok');
  } else if(tipo==='cajonera_max'){
    add('Cajonera Max',1,'—','—','pendiente','Composición de la cajonera Max no confirmada todavía; no se inventa. Dile a Claude su receta para agregarla.');
  } else if(tipo==='zapatera'){
    add('Zapatera',1,'—','—','pendiente','Composición de la zapatera no confirmada todavía; no se inventa. Dile a Claude las medidas/materiales para agregarla.');
  } else if(tipo==='repisa'){
    add('Repisa',1,'—','—','pendiente','Medida/composición de la repisa no confirmada todavía; no se inventa. Dile a Claude las medidas/materiales para agregarla.');
  }
  return piezas;
}

// Traduce el valor del selector "por muebles" (MUEBLE_TIPO_OPCIONES) a buildAdicionalPiezas
function buildMueblePiezasComp(value, cajonesManual, color){
  if(value==='cajonera_3') return buildAdicionalPiezas('cajonera', 3, color);
  if(value==='cajonera_5') return buildAdicionalPiezas('cajonera', 5, color);
  if(value==='cajonera_otra') return buildAdicionalPiezas('cajonera', cajonesManual, color);
  return buildAdicionalPiezas(value, cajonesManual, color); // entrepanera, cajonera_emma, cajonera_espejo, cajonera_max
}

// Arma la composición completa de una familia eligiendo qué es cada uno de sus muebles fijos
// (en vez de un modelo con nombre). Las paredes/maleteros/herrajes de la familia se toman de
// buildDespiece con cajones=0/espejos=0 (son fijos, no cambian según qué ocupa cada mueble);
// se descarta su entrepaño "base sencillo" porque aquí lo da la combinación elegida.
function buildComposicion(fam, muebles, color, todoColor, maxOn, colorCajonera){
  const estructuraColor = todoColor ? color : 'Blanco';
  const colorCaj = colorCajonera || estructuraColor;
  const base = buildDespiece(fam, 0, 0, color, todoColor, maxOn, colorCajonera);
  const piezasFijas = base.piezas.filter(p=>p.nombre!=='Entrepaño');
  const hayCajonera = muebles.some(m=>m.value!=='entrepanera');
  if(hayCajonera) piezasFijas.forEach(p=>{ if(p.nombre==='Zócalo normal') p.colorDestino = color; });
  const piezasMuebles = muebles.flatMap(m=>buildMueblePiezasComp(m.value, m.cajones, colorCaj));
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

  // Frentes: 24 por hoja, color solicitado por el cliente
  const frentes = piezas.filter(p=>p.nombre==='Frente' && p.estado==='ok').reduce((s,p)=>s+(typeof p.cantidad==='number'?p.cantidad:0),0);
  if(frentes>0) addConsumo('Melamina '+color, frentes/24);

  // Piezas de cajón: cortas 49/hoja, largas 35/hoja
  const cortasPorColor = {}, largasPorColor = {};
  piezas.forEach(p=>{
    if(p.estado!=='ok' || typeof p.cantidad!=='number') return;
    if(p.nombre==='Pieza chica de cajón') cortasPorColor[p.colorDestino]=(cortasPorColor[p.colorDestino]||0)+p.cantidad;
    if(p.nombre==='Pieza grande de cajón') largasPorColor[p.colorDestino]=(largasPorColor[p.colorDestino]||0)+p.cantidad;
  });
  Object.keys(cortasPorColor).forEach(c=>addConsumo('Melamina '+c, cortasPorColor[c]/49));
  Object.keys(largasPorColor).forEach(c=>addConsumo('Melamina '+c, largasPorColor[c]/35));

  // Fondos MDF: cajón normal (14/hoja MDF3mm), cajón Max (12/hoja MDF5mm), cajonera con espejo (4/hoja MDF3mm)
  const fondosCajon3 = piezas.filter(p=>p.nombre==='Fondo de cajón (MDF 3mm)' && p.estado==='ok').reduce((s,p)=>s+(typeof p.cantidad==='number'?p.cantidad:0),0);
  if(fondosCajon3>0) addConsumo('MDF 3mm', fondosCajon3/14);
  const fondosCajon5Max = piezas.filter(p=>p.nombre==='Fondo de cajón (MDF 5mm, Max)' && p.estado==='ok').reduce((s,p)=>s+(typeof p.cantidad==='number'?p.cantidad:0),0);
  if(fondosCajon5Max>0) addConsumo('MDF 5mm', fondosCajon5Max/12);
  const fondosCajonera = piezas.filter(p=>p.nombre.startsWith('Fondo cajonera con espejo') && p.estado==='ok').reduce((s,p)=>s+(typeof p.cantidad==='number'?p.cantidad:0),0);
  if(fondosCajonera>0) addConsumo('MDF 3mm', fondosCajonera/4);

  // Herrajes
  piezas.forEach(p=>{
    if(p.estado!=='ok') return;
    if(typeof p.cantidad!=='number') return;
    if(p.nombre==='Tubo') addConsumo('Tubos 1.5 m', p.cantidad);
    if(p.nombre==='Juego de bridas') addConsumo('Juegos de bridas', p.cantidad);
    if(p.nombre==='Juego de corredera') addConsumo('Juego de corredera', p.cantidad);
    if(p.nombre.startsWith('Jaladera')) addConsumo('Jaladeras', p.cantidad);
    if(p.nombre.startsWith('Bisagra')) addConsumo('Bisagras', p.cantidad);
    if(p.nombre==='Espejo') addConsumo('Espejos closet', p.cantidad);
  });

  return Object.keys(consumoMap).map(itemId=>({itemId, cantidad:Math.round(consumoMap[itemId]*1000)/1000}));
}

// ===== Adicionales: UI compartida entre Despiece ('d') e Instalación de mueble ('i') =====
function renderAdicBox(prefix){
  const box = document.getElementById(prefix+'-adic-box');
  if(!box) return;
  const list = prefix==='d' ? dAdicionales : iAdicionales;
  const rows = list.map((a,idx)=>`<tr>
      <td>${TIPOS_ADICIONAL[a.tipo]}${a.tipo==='cajonera'?(' ('+a.cajones+' cajones)'):''}</td>
      <td>${a.color}</td>
      <td><button class="btn small" style="background:transparent;color:var(--bad);border:1px solid var(--line)" onclick="quitarAdicional('${prefix}',${idx})">Quitar</button></td>
    </tr>`).join('');
  box.innerHTML = `<div class="card">
    <strong>Adicionales</strong>
    <p class="hint">Cajonera, entrepañera, cajonera de espejo, zapatera o repisa que se agregan aparte del modelo — no cuentan como uno de sus muebles fijos.</p>
    ${list.length? `<div class="wrap-x"><table><tr><th>Adicional</th><th>Color</th><th></th></tr>${rows}</table></div>` : '<p class="hint">Sin adicionales.</p>'}
    <div class="grid2" style="margin-top:8px">
      <select id="${prefix}-adic-tipo" onchange="toggleAdicionalCajones('${prefix}')">${Object.keys(TIPOS_ADICIONAL).map(k=>`<option value="${k}">${TIPOS_ADICIONAL[k]}</option>`).join('')}</select>
      <select id="${prefix}-adic-color">${MEL_COLORES.map(c=>`<option>${c}</option>`).join('')}</select>
    </div>
    <div id="${prefix}-adic-cajones-wrap"></div>
    <button class="btn small" style="margin-top:8px" onclick="agregarAdicional('${prefix}')">+ Agregar adicional</button>
  </div>`;
  toggleAdicionalCajones(prefix);
}
function toggleAdicionalCajones(prefix){
  const sel = document.getElementById(prefix+'-adic-tipo');
  const wrap = document.getElementById(prefix+'-adic-cajones-wrap');
  if(!sel || !wrap) return;
  wrap.innerHTML = sel.value==='cajonera'
    ? `<label class="hint" style="display:block;margin-top:8px">Cantidad de cajones</label><input type="number" min="1" id="${prefix}-adic-cajones" placeholder="ej. 3">`
    : '';
}
function agregarAdicional(prefix){
  const tipo = document.getElementById(prefix+'-adic-tipo').value;
  const color = document.getElementById(prefix+'-adic-color').value;
  let cajones = null;
  if(tipo==='cajonera'){
    const el = document.getElementById(prefix+'-adic-cajones');
    cajones = Number(el && el.value);
    if(!cajones || cajones<=0) return alert('Captura la cantidad de cajones del adicional.');
  }
  (prefix==='d' ? dAdicionales : iAdicionales).push({tipo, cajones, color});
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
          ${m.value==='cajonera_otra'?`<input type="number" min="1" placeholder="Cantidad de cajones" value="${m.cajones||''}" oninput="dMueblesComp[${i}].cajones=Number(this.value)">`:'<div></div>'}
        </div>`).join('')}
      ${dFamiliaComp==='King'?`<label class="hint" style="display:flex;align-items:center;gap:6px;margin-top:8px"><input type="checkbox" id="d-max-comp" style="width:auto"> Es variante Max (maleteros)</label>`:''}
    `;
  } else {
    wrap.innerHTML = `<select id="d-modelo" onchange="renderDespMaxToggle()">${modeloOptionsHtml()}</select><div id="d-max-wrap"></div>`;
    renderDespMaxToggle();
  }
}

function renderDespMaxToggle(){
  const m = MODELOS.find(x=>x.nombre===$('#d-modelo').value);
  const wrap = document.getElementById('d-max-wrap');
  if(wrap) wrap.innerHTML = m.maxDisponible
    ? `<label class="hint" style="display:flex;align-items:center;gap:6px;margin-top:4px"><input type="checkbox" id="d-max" style="width:auto"> Es variante Max (sustituye componentes, no los suma)</label>`
    : '';
}

function calcDespiece(){
  const color = $('#d-color').value;
  const todoColor = $('#d-todocolor').checked;
  const colorCajonera = $('#d-color-cajonera').value;
  let piezasModelo, maxNota, titulo, notaModelo=null;
  if(dModoComp){
    const maxOn = dFamiliaComp==='King' && document.getElementById('d-max-comp') ? document.getElementById('d-max-comp').checked : false;
    const incompletos = dMueblesComp.filter(m=>m.value==='cajonera_otra' && !m.cajones);
    if(incompletos.length) return alert('Captura la cantidad de cajones en los muebles "Cajonera (otra cantidad)".');
    const r = buildComposicion(dFamiliaComp, dMueblesComp, color, todoColor, maxOn, colorCajonera);
    piezasModelo = r.piezas; maxNota = r.maxNota;
    titulo = dFamiliaComp+' — combinación: '+dMueblesComp.map(m=>MUEBLE_TIPO_OPCIONES.find(o=>o.value===m.value).label).join(' + ');
  } else {
    const modelo = MODELOS.find(x=>x.nombre===$('#d-modelo').value);
    const maxOn = modelo.maxDisponible && document.getElementById('d-max') ? document.getElementById('d-max').checked : false;
    const r = buildDespiece(modelo.fam, modelo.cajones, modelo.espejos, color, todoColor, maxOn, colorCajonera);
    piezasModelo = r.piezas; maxNota = r.maxNota;
    titulo = modelo.nombre; notaModelo = modelo.nota;
  }
  const piezasAdic = dAdicionales.flatMap(a=>buildAdicionalPiezas(a.tipo, a.cajones, a.color));
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
  $('#main').innerHTML = `
    <div class="card"><div class="subtabs">
      <button class="${instSub==='mueble'?'active':''}" onclick="instSub='mueble';renderInst()">Instalación de mueble</button>
      <button class="${instSub==='puertas'?'active':''}" onclick="instSub='puertas';renderInst()">Puertas</button>
      <button class="${instSub==='historial'?'active':''}" onclick="instSub='historial';renderInst()">Historial por día</button>
    </div></div>
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
      <div class="wrap-x" style="margin-top:6px"><table><tr><th>Tipo</th><th>Detalle</th><th>Nota</th><th>Hora</th></tr>
      ${porDia[dia].map(x=>`<tr><td>${x.categoria}</td><td>${x.descripcion}</td><td>${x.nota||''}</td><td>${new Date(x.fecha).toLocaleTimeString()}</td></tr>`).join('')}
      </table></div>
    </div>`).join('');
}

function renderInstMueble(){
  $('#inst-body').innerHTML = `
  <div class="card">
    <strong>Instalación de mueble · ${modulo()}</strong>
    <p class="hint">Elige el modelo exacto instalado, o arma tu propia combinación de muebles por familia. El sistema calcula el consumo real y valida existencias antes de descontar. Si la receta está incompleta, el descuento se bloquea (no se inventa material).</p>
    <label class="hint" style="display:flex;align-items:center;gap:6px;margin-top:8px">
      <input type="checkbox" id="i-modo-comp" ${iModoComp?'checked':''} onchange="iModoComp=document.getElementById('i-modo-comp').checked; renderISelector();"> Armar por combinación de muebles (entrepañera / cajonera / Emma / espejo / Max)
    </label>
    <div id="i-selector-wrap" style="margin-top:8px"></div>
    <div class="grid2" style="margin-top:8px">
      <select id="i-color">${MEL_COLORES.map(c=>`<option>${c}</option>`).join('')}</select>
    </div>
    <label class="hint" style="display:flex;align-items:center;gap:6px;margin-top:8px">
      <input type="checkbox" id="i-todocolor" style="width:auto"> Cliente pidió "todo de un solo color"
    </label>
    <div id="i-max-wrap"></div>
    <div id="i-cajcolor-wrap"></div>
    <div class="grid2" style="margin-top:8px">
      <input id="i-fecha" type="date" value="${new Date().toISOString().slice(0,10)}">
      <input id="i-nota" placeholder="Referencia / cliente (opcional)">
    </div>
    <button class="btn" style="margin-top:10px" onclick="previewInst()">Calcular y validar</button>
  </div>
  <div id="i-adic-box"></div>
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
          ${m.value==='cajonera_otra'?`<input type="number" min="1" placeholder="Cantidad de cajones" value="${m.cajones||''}" oninput="iMueblesComp[${i}].cajones=Number(this.value)">`:'<div></div>'}
        </div>`).join('')}
      ${iFamiliaComp==='King'?`<label class="hint" style="display:flex;align-items:center;gap:6px;margin-top:8px"><input type="checkbox" id="i-max-comp" style="width:auto"> Es variante Max (maleteros)</label>`:''}
      <label class="hint" style="display:block;margin-top:8px">Color de la cajonera / cajonera de espejo (independiente del frente)</label><select id="i-color-cajonera-comp">${MEL_COLORES.map(c=>`<option>${c}</option>`).join('')}</select>
    `;
  } else {
    wrap.innerHTML = `<select id="i-modelo" onchange="renderInstMaxToggle()">${modeloOptionsHtml()}</select>`;
    renderInstMaxToggle();
  }
}

function renderInstMaxToggle(){
  const sel = document.getElementById('i-modelo');
  const wrapMax = document.getElementById('i-max-wrap');
  const wrapCaj = document.getElementById('i-cajcolor-wrap');
  if(!sel || !wrapMax || !wrapCaj) return;
  const m = MODELOS.find(x=>x.nombre===sel.value);
  wrapMax.innerHTML = m.maxDisponible
    ? `<label class="hint" style="display:flex;align-items:center;gap:6px;margin-top:4px"><input type="checkbox" id="i-max" style="width:auto"> Es variante Max (sustituye componentes, no los suma)</label>`
    : '';
  wrapCaj.innerHTML = (m.cajones>0 || m.espejos>0)
    ? `<label class="hint" style="display:block;margin-top:8px">Color de la cajonera${m.espejos>0?' / cajonera de espejo':''} (independiente del frente)</label><select id="i-color-cajonera">${MEL_COLORES.map(c=>`<option>${c}</option>`).join('')}</select>`
    : '';
}

function previewInst(){
  const color = $('#i-color').value;
  const todoColor = $('#i-todocolor').checked;
  let piezasModelo, maxNota, titulo, notaModelo=null, colorCajonera;
  if(iModoComp){
    const maxOn = iFamiliaComp==='King' && document.getElementById('i-max-comp') ? document.getElementById('i-max-comp').checked : false;
    const incompletos = iMueblesComp.filter(m=>m.value==='cajonera_otra' && !m.cajones);
    if(incompletos.length){ alert('Captura la cantidad de cajones en los muebles "Cajonera (otra cantidad)".'); return; }
    colorCajonera = document.getElementById('i-color-cajonera-comp') ? document.getElementById('i-color-cajonera-comp').value : null;
    const r = buildComposicion(iFamiliaComp, iMueblesComp, color, todoColor, maxOn, colorCajonera);
    piezasModelo = r.piezas; maxNota = r.maxNota;
    titulo = iFamiliaComp+' — combinación: '+iMueblesComp.map(m=>MUEBLE_TIPO_OPCIONES.find(o=>o.value===m.value).label).join(' + ');
  } else {
    const modeloSel = MODELOS.find(x=>x.nombre===$('#i-modelo').value);
    const fam = modeloSel.fam, cajones = modeloSel.cajones, espejos = modeloSel.espejos;
    const maxOn = modeloSel.maxDisponible && document.getElementById('i-max') ? document.getElementById('i-max').checked : false;
    colorCajonera = (cajones>0 || espejos>0) && document.getElementById('i-color-cajonera') ? document.getElementById('i-color-cajonera').value : null;
    const r = buildDespiece(fam, cajones, espejos, color, todoColor, maxOn, colorCajonera);
    piezasModelo = r.piezas; maxNota = r.maxNota;
    titulo = modeloSel.nombre; notaModelo = modeloSel.nota;
  }
  const piezasAdic = iAdicionales.flatMap(a=>buildAdicionalPiezas(a.tipo, a.cajones, a.color));
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

  let html = `<div class="card"><h3>Vista previa · ${titulo}${iAdicionales.length?' + '+iAdicionales.length+' adicional(es)':''}</h3>
    ${notaModelo? `<div class="warn">${notaModelo}</div>`:''}
    ${maxNota? `<div class="warn">${maxNota}</div>`:''}
    <div class="wrap-x"><table><tr><th>Artículo a descontar</th><th>Cantidad</th><th>Disponible</th></tr>
    ${consumo.map(c=>{ const f=calcFormula(c.itemId); const insuf = f.final-c.cantidad<0;
      return `<tr><td>${CATALOGO.find(i=>i.id===c.itemId).nombre}</td><td class="${insuf?'neg':''}">${c.cantidad} ${item2unidad(c.itemId)}</td><td>${f.final}</td></tr>`;
    }).join('')}
    </table></div>
  </div>`;

  if(bloqueadoPorReceta){
    html += `<div class="card"><div class="warn"><strong>Descuento bloqueado — receta incompleta.</strong>
      Los siguientes componentes no tienen cantidad/medida confirmada, así que la app no puede calcular ni descontar material inventado:
      <ul style="margin:6px 0 0 18px;padding:0">${pendientes.map(p=>`<li>${p.nombre}: ${p.nota}</li>`).join('')}</ul>
      Confirma estos datos para poder registrar esta instalación.</div></div>`;
  } else if(bloqueadoPorStock){
    html += `<div class="card"><div class="warn"><strong>Descuento bloqueado — existencia insuficiente en ${modulo()}.</strong>
      <ul style="margin:6px 0 0 18px;padding:0">${faltantes.map(f=>`<li>${f.nombre}: disponible ${f.disponible}, se requieren ${f.requerido}</li>`).join('')}</ul>
      No se aplicó ningún descuento parcial.</div></div>`;
  } else {
    html += `<div class="card row" style="justify-content:space-between">
      <span class="pos">Receta completa y existencia suficiente.</span>
      <button class="btn" onclick="confirmarInst()">Confirmar y descontar</button>
    </div>`;
  }
  $('#i-result').innerHTML = html;
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
    for(const c of instPreview.consumo){
      const item = CATALOGO.find(i=>i.id===c.itemId);
      await db.collection('movimientos').doc(cryptoId()).set({modulo:mod,itemId:c.itemId,itemNombre:item.nombre,tipo:'instalacion',cantidad:c.cantidad,nota:`${desc}${nota?(' · '+nota):''}`,fecha:new Date().toISOString()});
    }
    // Registro consolidado para el historial por día del módulo
    await db.collection('instalacionesLog').doc(cryptoId()).set({
      modulo:mod, categoria:'Mueble', descripcion:desc, nota, fechaDia,
      consumo:instPreview.consumo, fecha:new Date().toISOString()
    });
    alert('Instalación registrada. Se descontaron '+instPreview.consumo.length+' artículo(s) y quedó en el historial de '+fechaDia+'.');
    instPreview=null;
    iAdicionales=[];
    renderInstMueble();
  }catch(e){ alert('Error al registrar: '+e.message); }
}

// ---- Puertas (modelos de instalación, NO ferretería) ----
const TIPOS_PUERTA = {
  'Normal': 'Composición: 1 par de puertas, 3 marcos, 1 fijo.',
  'Con pared falsa': 'Composición: 1 par de puertas, 1 pared falsa, 2 marcos, 1 fijo.',
  'Con cubos a los lados': 'Composición: 1 par de puertas, 1 fijo o 2 fijos según medida, 9 marcos.',
  'Con cubo al centro': 'Composición: 2 pares de puertas, 2 fijos, 8 marcos.'
};
function renderInstPuertas(){
  $('#inst-body').innerHTML = `
  <div class="card">
    <strong>Puertas · ${modulo()}</strong>
    <p class="hint">Las puertas son modelos de instalación, no productos de ferretería: no aparecen ni se descuentan en Inventario/Entradas-Salidas/Mermas.</p>
    <div class="grid2" style="margin-top:8px">
      <select id="p-tipo">${Object.keys(TIPOS_PUERTA).map(t=>`<option>${t}</option>`).join('')}</select>
      <input id="p-alto" type="number" placeholder="Alto total (cm)">
      <input id="p-ancho" type="number" placeholder="Ancho total (cm)">
      <input id="p-fecha" type="date" value="${new Date().toISOString().slice(0,10)}">
      <input id="p-nota" placeholder="Cliente / referencia">
    </div>
    <button class="btn" style="margin-top:10px" onclick="calcPuerta()">Calcular medidas</button>
  </div>
  <div id="p-result"></div>`;
}

function calcPuerta(){
  const tipo = $('#p-tipo').value;
  const alto = Number($('#p-alto').value);
  const ancho = Number($('#p-ancho').value);
  if(!alto || !ancho) return alert('Captura alto y ancho');
  const piezas = [];
  const add=(n,v,nota)=>piezas.push({n,v,nota:nota||''});

  add('Composición', TIPOS_PUERTA[tipo]);

  if(tipo==='Con pared falsa'){
    const altoParedFalsa = alto-2;
    const altoMarcos = alto-4;
    const altoPuertas = altoMarcos-7.5;
    const anchoPuertas = (ancho-1.5)/2+5;
    const anchoFijo = ancho+2;
    const altoFijo = alto-altoMarcos+17;
    add('Alto pared falsa', altoParedFalsa.toFixed(1)+' cm', 'Alto total − 2');
    add('Ancho pared falsa', '60 cm', 'Siempre 60 cm');
    add('Alto de marcos', altoMarcos.toFixed(1)+' cm', 'Alto total − 4');
    add('Alto de puertas', altoPuertas.toFixed(1)+' cm', 'Alto de marcos − 7.5');
    add('Ancho de puertas (c/u del par)', anchoPuertas.toFixed(1)+' cm', '(Ancho total − 1.5) ÷ 2 + 5');
    add('Ancho del fijo', anchoFijo.toFixed(1)+' cm', 'Ancho total + 2');
    add('Alto del fijo', altoFijo.toFixed(1)+' cm', 'Alto total − alto de marcos + 17');
  } else {
    // Reglas generales documentadas (normal / cubos): ancho de par y tope de 244
    const anchoPuertas = (ancho-3)/2+5;
    add('Ancho de puertas (c/u del par)', anchoPuertas.toFixed(1)+' cm', '(Ancho total − 3) ÷ 2 + 5');
    if(alto<250){
      add('Alto de puertas/marcos', (alto-6).toFixed(1)+' cm', 'Menor a 250 cm: alto total − 6');
    } else {
      add('Alto de marcos', '244 cm', 'Tope de hoja: mayor a 250 cm, marcos van a 244 cm');
      add('Alto del fijo', 'Pendiente', 'El fijo absorbe el incremento sobre 244, pero la fórmula exacta para este tipo no está documentada');
    }
    if(tipo==='Con cubos a los lados'){
      add('Fijos', 'Pendiente (1 o 2 según medida)', 'Regla exacta de cuándo usar 1 o 2 fijos no está documentada');
    }
  }

  let html = `<div class="card"><h3>${tipo}</h3>
    <div class="wrap-x"><table><tr><th>Dato</th><th>Valor</th><th>Regla</th></tr>
    ${piezas.map(p=>`<tr><td>${p.n}</td><td>${p.v}</td><td class="hint">${p.nota}</td></tr>`).join('')}
    </table></div>
    <div class="warn">El consumo de melamina/MDF por puerta no está documentado con un rendimiento por hoja confirmado, así que esta calculadora solo obtiene medidas de corte; no descuenta ferretería automáticamente. Registra el material real usado como "Instalación" en Entradas/Salidas si es necesario.</div>
  </div>
  <div class="card row" style="justify-content:space-between">
    <span class="hint">Esta instalación de puertas quedará en el registro de instalaciones (no en inventario de ferretería).</span>
    <button class="btn" onclick="registrarPuerta('${tipo}',${alto},${ancho})">Registrar instalación de puertas</button>
  </div>`;
  $('#p-result').innerHTML = html;
}

async function registrarPuerta(tipo, alto, ancho){
  const nota = ($('#p-nota').value||'').trim();
  const fechaDia = $('#p-fecha').value || new Date().toISOString().slice(0,10);
  try{
    await db.collection('instalacionesPuertas').doc(cryptoId()).set({modulo:modulo(),tipo,alto,ancho,nota,fechaDia,fecha:new Date().toISOString()});
    await db.collection('instalacionesLog').doc(cryptoId()).set({
      modulo:modulo(), categoria:'Puerta', descripcion:`${tipo} · ${alto}×${ancho} cm`, nota, fechaDia,
      consumo:[], fecha:new Date().toISOString()
    });
    alert('Instalación de puertas registrada en el historial de '+fechaDia+' (no afecta el inventario de ferretería).');
  }catch(e){ alert('Error: '+e.message); }
}

// ===== Capa 5: Traspasos entre módulos =====
// Calcula la fórmula para CUALQUIER módulo (no solo el activo), consultando Supabase/DB directamente.
async function calcFormulaForModulo(mod, itemId){
  let inicial=0, entradas=0, salidas=0, instalaciones=0, mermas=0, resetFecha=null;
  try{ const r = await db.collection('resets').doc(mod).get(); if(r && r.data) resetFecha = r.data().fecha; }catch(e){}
  try{
    const d = await db.collection('inicial').doc(inicialKey(mod,itemId)).get();
    if(d && d.data) inicial = resetFecha? 0 : (d.data().cantidad||0);
  }catch(e){}
  try{
    const snap = await db.collection('movimientos').get();
    snap.docs.forEach(doc=>{
      const m = doc.data();
      if(m.modulo!==mod || m.itemId!==itemId) return;
      if(resetFecha && m.fecha<=resetFecha) return;
      if(m.tipo==='entrada') entradas+=m.cantidad;
      else if(m.tipo==='salida') salidas+=m.cantidad;
      else if(m.tipo==='instalacion') instalaciones+=m.cantidad;
      else if(m.tipo==='merma') mermas+=m.cantidad;
    });
  }catch(e){}
  const final = inicial+entradas-salidas-instalaciones-mermas;
  return {inicial,entradas,salidas,instalaciones,mermas,final};
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
      <div><label class="hint">Módulo origen</label><select id="t-origen" onchange="traspOrigen=this.value;renderTraspNuevo()">${MODULOS.map(m=>`<option ${m.nombre===traspOrigen?'selected':''}>${m.nombre}</option>`).join('')}</select></div>
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
    if(el) el.textContent = f.final+' '+it.unidad;
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
    if(f.final - e.cantidad < 0) faltantes.push({...e, disponible:f.final});
  }
  traspPreview = {origen:traspOrigen, destino:traspDestino, elegidos, nota:($('#t-nota').value||'').trim(), bloqueado: faltantes.length>0, faltantes};
  let html = `<div class="card"><h3>${traspOrigen} → ${traspDestino}</h3>
    <div class="wrap-x"><table><tr><th>Artículo</th><th>Cantidad</th></tr>
    ${elegidos.map(e=>`<tr><td>${e.itemNombre}</td><td>${e.cantidad} ${e.unidad}</td></tr>`).join('')}
    </table></div>
  </div>`;
  if(faltantes.length>0){
    html += `<div class="card"><div class="warn"><strong>Traspaso bloqueado — existencia insuficiente en ${traspOrigen}.</strong>
      <ul style="margin:6px 0 0 18px;padding:0">${faltantes.map(f=>`<li>${f.itemNombre}: disponible ${f.disponible}, se pidieron ${f.cantidad}</li>`).join('')}</ul>
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
    for(const e of elegidos){
      const notaTxt = `Traspaso ${origen} → ${destino}${nota?(' · '+nota):''}`;
      await db.collection('movimientos').doc(cryptoId()).set({modulo:origen,itemId:e.itemId,itemNombre:e.itemNombre,tipo:'salida',cantidad:e.cantidad,nota:notaTxt,fecha:new Date().toISOString()});
      await db.collection('movimientos').doc(cryptoId()).set({modulo:destino,itemId:e.itemId,itemNombre:e.itemNombre,tipo:'entrada',cantidad:e.cantidad,nota:notaTxt,fecha:new Date().toISOString()});
      // Registro de préstamo: cada artículo lleva su propia deuda.
      await db.collection('prestamos').doc(cryptoId()).set({
        origen, destino, itemId:e.itemId, itemNombre:e.itemNombre, categoria:CATALOGO.find(i=>i.id===e.itemId).cat, unidad:e.unidad,
        esMelamina: esMelaminaId(e.itemId), cantidad:e.cantidad, devuelto:0, pendiente:e.cantidad, estado:'pendiente',
        nota, fecha:new Date().toISOString(), devoluciones:[]
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
      <p class="hint" style="margin:6px 0">${p.itemNombre}${p.esMelamina?' (hoja de melamina — cualquier color cuenta igual para la deuda)':''} · Prestado: ${p.cantidad} ${p.unidad} · Devuelto: ${p.devuelto} · Pendiente: <strong>${p.pendiente} ${p.unidad}</strong></p>
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
        <input id="dev-cant-${prestamoId}" type="number" min="0" max="${p.pendiente}" placeholder="Cantidad a devolver (máx. ${p.pendiente})">
      </div>
      <button class="btn small" style="margin-top:8px" onclick="registrarDevolucion('${prestamoId}')">Confirmar devolución</button>
    </div>`;
}

async function registrarDevolucion(prestamoId){
  const p = prestamos.find(x=>x.id===prestamoId);
  const itemId = document.getElementById('dev-item-'+prestamoId).value;
  const cantidad = Number(document.getElementById('dev-cant-'+prestamoId).value);
  if(!cantidad || cantidad<=0) return alert('Cantidad inválida');
  if(cantidad > p.pendiente) return alert('No puedes devolver más de lo pendiente ('+p.pendiente+' '+p.unidad+').');
  const item = CATALOGO.find(i=>i.id===itemId);
  // Quien devuelve es el destino original del préstamo; el material regresa al origen original.
  const fDestino = await calcFormulaForModulo(p.destino, itemId);
  if(fDestino.final - cantidad < 0) return alert(p.destino+' no tiene suficiente "'+item.nombre+'" para devolver ('+fDestino.final+' disponibles).');
  try{
    const notaTxt = `Devolución de préstamo ${p.destino} → ${p.origen} (${p.itemNombre})`;
    await db.collection('movimientos').doc(cryptoId()).set({modulo:p.destino,itemId,itemNombre:item.nombre,tipo:'salida',cantidad,nota:notaTxt,fecha:new Date().toISOString()});
    await db.collection('movimientos').doc(cryptoId()).set({modulo:p.origen,itemId,itemNombre:item.nombre,tipo:'entrada',cantidad,nota:notaTxt,fecha:new Date().toISOString()});
    const nuevoDevuelto = p.devuelto + cantidad;
    const nuevoPendiente = p.cantidad - nuevoDevuelto;
    const nuevoEstado = nuevoPendiente<=0 ? 'cerrado' : (nuevoDevuelto>0 ? 'parcial' : 'pendiente');
    await db.collection('prestamos').doc(prestamoId).update({
      devuelto: nuevoDevuelto, pendiente: Math.max(0,nuevoPendiente), estado: nuevoEstado,
      devoluciones: [...(p.devoluciones||[]), {fecha:new Date().toISOString(), cantidad, itemId, itemNombre:item.nombre}]
    });
    alert('Devolución registrada.'+(nuevoEstado==='cerrado'? ' Préstamo CERRADO.':' Pendiente: '+Math.max(0,nuevoPendiente)+' '+p.unidad+'.'));
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
        <ul style="margin:6px 0 0 18px;padding:0">${items.map(g=>`<li>${g.pendiente} ${g.unidad} de ${g.etiqueta}</li>`).join('')}</ul>
      </div>`;
    }).join('');
}

// ===== Capa 5: Reportes =====
function renderRep(){
  const cats = [...new Set(CATALOGO.map(i=>i.cat))];
  const conMovimiento = CATALOGO.filter(it=>{ const f=calcFormula(it.id); return f.inicial||f.entradas||f.salidas||f.instalaciones||f.mermas; });
  const ultimaAud = auditorias[0];

  let html = `<div class="card">
    <strong>Reporte · ${modulo()}</strong>
    <p class="hint">Comprobación matemática: Inicial + Entradas − Salidas − Instalaciones − Mermas = Final, artículo por artículo.</p>
  </div>`;

  html += `<div class="card row" style="justify-content:space-between">
    <div><strong>Respaldo manual</strong><p class="hint" style="margin:2px 0 0">Descarga toda la base (de todos los módulos) en un archivo .json, como respaldo extra al de Supabase.</p></div>
    <button class="btn small" onclick="exportarRespaldo()">Descargar respaldo</button>
  </div>`;

  html += `<div class="card"><h3>Inventario (solo artículos con movimiento)</h3>
    <div class="wrap-x"><table><tr><th>Artículo</th><th>Inicial</th><th>Entr.</th><th>Sal.</th><th>Instal.</th><th>Mermas</th><th>Final</th></tr>
    ${conMovimiento.map(it=>{ const f=calcFormula(it.id);
      return `<tr><td>${it.nombre}</td><td>${f.inicial}</td><td class="pos">${f.entradas}</td><td class="neg">${f.salidas}</td><td class="neg">${f.instalaciones}</td><td class="neg">${f.mermas}</td><td><strong>${f.final}</strong></td></tr>`;
    }).join('')}
    </table></div>
    ${conMovimiento.length===0? '<p class="hint">Aún no hay movimientos registrados en este módulo.</p>':''}
  </div>`;

  html += `<div class="card"><h3>Consumo por instalaciones (acumulado)</h3>
    <div class="wrap-x"><table><tr><th>Artículo</th><th>Total consumido</th></tr>
    ${CATALOGO.filter(it=>calcFormula(it.id).instalaciones>0).map(it=>{ const f=calcFormula(it.id);
      return `<tr><td>${it.nombre}</td><td>${f.instalaciones} ${it.unidad}</td></tr>`;
    }).join('') || '<tr><td colspan="2" class="hint">Sin consumo por instalaciones todavía.</td></tr>'}
    </table></div>
  </div>`;

  html += `<div class="card"><h3>Última auditoría vs. teórico</h3>`;
  if(!ultimaAud){
    html += `<p class="hint">Aún no hay auditorías guardadas en ${modulo()}. Ve a "Auditoría física" para levantar la primera.</p>`;
  } else {
    html += `<p class="hint">${new Date(ultimaAud.fecha).toLocaleString()} · ${ultimaAud.tipo} · Auditor: ${ultimaAud.auditor} · <strong class="${ultimaAud.totalDiff?'neg':'pos'}">${ultimaAud.totalDiff} discrepancia(s)</strong></p>
    <div class="wrap-x"><table><tr><th>Artículo</th><th>Teórico</th><th>Físico</th><th>Dif.</th></tr>
    ${ultimaAud.resultados.map(r=>`<tr><td>${r.nombre}</td><td>${r.teorico}</td><td>${r.fisico}</td><td class="${r.diff?'neg':'pos'}">${r.diff>0?'+':''}${r.diff}</td></tr>`).join('')}
    </table></div>`;
  }
  html += `</div>`;

  $('#main').innerHTML = html;
}

// ===== Respaldo manual: exporta toda la base local a un archivo JSON descargable =====
async function exportarRespaldo(){
  const COLLECTIONS = ['inicial','movimientos','resets','auditorias','instalacionesLog','instalacionesPuertas','prestamos'];
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
    const rolLabel = miPerfil ? ({admin:'admin', coordinador:'coordinador', supervisor:'supervisor'}[miPerfil.rol] || miPerfil.rol) : '';
    document.getElementById('whoami').textContent = user.email + (rolLabel? ' · '+rolLabel : '');
  } else {
    document.getElementById('whoami').textContent = 'modo local';
  }
  init();
})();
