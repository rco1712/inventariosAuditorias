// ===== Capa de datos local-first =====
// Expone la MISMA api tipo-Firestore que ya usaba el Artifact original
// (db.collection(x).doc(id).set(...), .where(...).onSnapshot(...), etc.)
// pero respaldada por IndexedDB (Dexie) como fuente de verdad local, con una
// cola de sincronización hacia Supabase. Así la pantalla SIEMPRE lee/escribe
// contra el disco local (funciona sin internet) y, cuando hay conexión, los
// cambios (propios y de otros usuarios/módulos) se sincronizan en segundo plano.
import { getSupabase, supabaseReady } from './supabase.js';

const COLLECTIONS_V1 = ['inicial','movimientos','resets','auditorias','instalacionesLog','instalacionesPuertas','prestamos','config'];
// v2: tablas nuevas (faltantes/deuda, garantías, conteo del almacén, historial del stock inicial).
const COLLECTIONS = [...COLLECTIONS_V1, 'deudasAuditoria','garantiasLog','conteoAbierto','inicialHist'];

const ddb = new Dexie('auditoriamodulos');
const storesDe = list => { const st = {}; list.forEach(c => { st[c] = 'id, modulo, _dirty, _updatedAt'; }); st['_meta'] = 'key'; return st; };
ddb.version(1).stores(storesDe(COLLECTIONS_V1));
ddb.version(2).stores(storesDe(COLLECTIONS));

const listeners = {}; // collection -> [{where:[field,op,val]|null, cb}]

function stripMeta(row){
  const { _dirty, _updatedAt, _deleted, _synced, ...rest } = row;
  return rest;
}

async function emit(name, listener){
  let rows = (await ddb.table(name).toArray()).filter(r => !r._deleted);
  if (listener.where) {
    const [field, , val] = listener.where;
    rows = rows.filter(r => r[field] === val);
  }
  listener.cb({ docs: rows.map(r => ({ id: r.id, data: () => stripMeta(r) })) });
}

function notify(name){
  (listeners[name] || []).forEach(l => emit(name, l));
}

function makeDocRef(name, id){
  return {
    id,
    async set(data, opts){
      const existing = await ddb.table(name).get(id);
      const merged = (opts && opts.merge) ? { ...(existing || {}), ...data } : { ...data };
      const row = { ...merged, id, modulo: merged.modulo ?? existing?.modulo ?? null, _dirty: true, _updatedAt: new Date().toISOString(), _deleted: false };
      await ddb.table(name).put(row);
      notify(name);
      kickSync();
    },
    async update(data){
      const existing = (await ddb.table(name).get(id)) || {};
      const row = { ...existing, ...data, id, _dirty: true, _updatedAt: new Date().toISOString() };
      await ddb.table(name).put(row);
      notify(name);
      kickSync();
    },
    async get(){
      // OJO: si el documento no existe se regresa { id, exists:false } SIN propiedad `data`
      // (a propósito) — el código de la app usa el patrón `if(r && r.data) r.data()...`,
      // igual que el wrapper original, así que `data` debe faltar por completo cuando no hay doc.
      const row = await ddb.table(name).get(id);
      if (!row || row._deleted) return { id, exists: false };
      return { id, exists: true, data: () => stripMeta(row) };
    },
    async delete(){
      const existing = await ddb.table(name).get(id);
      if (existing) {
        await ddb.table(name).put({ ...existing, _deleted: true, _dirty: true, _updatedAt: new Date().toISOString() });
        notify(name);
        kickSync();
      }
    }
  };
}

function makeCollectionRef(name){
  return {
    doc(id){ return makeDocRef(name, id); },
    where(field, op, val){
      return {
        async get(){
          const rows = (await ddb.table(name).toArray()).filter(r => !r._deleted && r[field] === val);
          return { docs: rows.map(r => ({ id: r.id, data: () => stripMeta(r) })) };
        },
        onSnapshot(cb){
          listeners[name] = listeners[name] || [];
          const l = { where: [field, op, val], cb };
          listeners[name].push(l);
          emit(name, l);
          return () => { listeners[name] = listeners[name].filter(x => x !== l); };
        }
      };
    },
    async get(){
      const rows = (await ddb.table(name).toArray()).filter(r => !r._deleted);
      return { docs: rows.map(r => ({ id: r.id, data: () => stripMeta(r) })) };
    },
    onSnapshot(cb){
      listeners[name] = listeners[name] || [];
      const l = { where: null, cb };
      listeners[name].push(l);
      emit(name, l);
      return () => { listeners[name] = listeners[name].filter(x => x !== l); };
    }
  };
}

export const db = {
  // Nota: las colecciones deben estar en COLLECTIONS (arriba) para tener tabla local en
  // IndexedDB. Si agregas una colección nueva en app.js, agrégala también a esa lista.
  collection(name){
    return makeCollectionRef(name);
  }
};

// ===== Estado de sincronización (para mostrar en la UI) =====
export const syncState = { pendientes: 0, enLinea: navigator.onLine, sincronizando: false, ultimaSync: null };
const syncListeners = new Set();
export function onSyncStateChange(cb){ syncListeners.add(cb); cb(syncState); return () => syncListeners.delete(cb); }
function touchSyncState(patch){ Object.assign(syncState, patch); syncListeners.forEach(cb => cb(syncState)); }

async function countPendingSafe(){
  let n = 0;
  for (const c of COLLECTIONS) {
    if (!ddb.tables.some(t => t.name === c)) continue;
    const rows = await ddb.table(c).toArray();
    n += rows.filter(r => r._dirty).length;
  }
  return n;
}

let syncTimer = null;
function kickSync(){
  countPendingSafe().then(n => touchSyncState({ pendientes: n }));
  if (!supabaseReady) return;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(syncAll, 600); // agrupa varias escrituras seguidas en una sola sincronización
}

async function pushDirty(){
  const sb = getSupabase();
  if (!sb) return;
  for (const name of COLLECTIONS) {
    if (!ddb.tables.some(t => t.name === name)) continue;
    const rows = await ddb.table(name).toArray();
    const dirty = rows.filter(r => r._dirty);
    for (const row of dirty) {
      const { error } = await sb.from('docs').upsert({
        collection: name,
        id: row.id,
        modulo: row.modulo ?? null,
        payload: stripMeta(row),
        updated_at: row._updatedAt,
        deleted: !!row._deleted
      }, { onConflict: 'collection,id' });
      if (!error) {
        await ddb.table(name).put({ ...row, _dirty: false, _synced: true });
      }
    }
  }
}

async function pullRemote(){
  const sb = getSupabase();
  if (!sb) return;
  const metaKey = 'lastSync';
  const meta = await ddb.table('_meta').get(metaKey);
  const since = meta ? meta.value : '1970-01-01T00:00:00.000Z';
  let query = sb.from('docs').select('*').gt('updated_at', since).order('updated_at', { ascending: true });
  const { data, error } = await query;
  if (error || !data) return;
  const touched = new Set();
  for (const remote of data) {
    if (!COLLECTIONS.includes(remote.collection)) COLLECTIONS.push(remote.collection);
    if (!ddb.tables.some(t => t.name === remote.collection)) continue; // colección desconocida en el schema local, se ignora
    const local = await ddb.table(remote.collection).get(remote.id);
    const remoteNewer = !local || new Date(remote.updated_at) >= new Date(local._updatedAt || 0);
    const localHasUnsyncedChange = local && local._dirty;
    if (remoteNewer && !localHasUnsyncedChange) {
      await ddb.table(remote.collection).put({
        ...remote.payload,
        id: remote.id,
        modulo: remote.modulo,
        _dirty: false,
        _synced: true,
        _deleted: !!remote.deleted,
        _updatedAt: remote.updated_at
      });
      touched.add(remote.collection);
    }
  }
  if (data.length) {
    await ddb.table('_meta').put({ key: metaKey, value: data[data.length - 1].updated_at });
  }
  touched.forEach(notify);
}

let syncing = false;
export async function syncAll(){
  if (!supabaseReady || syncing) return;
  syncing = true;
  touchSyncState({ sincronizando: true });
  try{
    await pushDirty();
    await pullRemote();
    touchSyncState({ ultimaSync: new Date().toISOString() });
  } catch (e) {
    console.warn('Fallo de sincronización (se reintentará):', e.message);
  } finally {
    syncing = false;
    const n = await countPendingSafe();
    touchSyncState({ sincronizando: false, pendientes: n });
  }
}

export function initSync(){
  window.addEventListener('online', () => { touchSyncState({ enLinea: true }); syncAll(); });
  window.addEventListener('offline', () => touchSyncState({ enLinea: false }));
  countPendingSafe().then(n => touchSyncState({ pendientes: n }));
  if (supabaseReady) {
    syncAll();
    setInterval(syncAll, 30000); // respaldo por si se pierde el evento 'online' o el realtime
    try {
      const sb = getSupabase();
      sb.channel('docs-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'docs' }, () => syncAll())
        .subscribe();
    } catch (e) { /* realtime es un extra; si falla, el polling de 30s sigue funcionando */ }
  }
}
