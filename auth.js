// ===== Autenticación multiusuario (Supabase Auth) =====
// Si Supabase todavía no está configurado (ver src/supabase.js), la app sigue funcionando
// en modo "un solo usuario, solo local" para que puedas probarla mientras creas tu proyecto.
import { getSupabase, supabaseReady, SUPABASE_URL } from './supabase.js';

export let currentUser = null; // {id, email}

export function authAvailable(){ return supabaseReady; }
export function getCurrentUserEmail(){ return currentUser ? currentUser.email : ''; }

export async function getSession(){
  if (!supabaseReady) return null;
  const sb = getSupabase();
  const { data } = await sb.auth.getSession();
  currentUser = data?.session?.user || null;
  return currentUser;
}

export async function signIn(email, password){
  const sb = getSupabase();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  currentUser = data.user;
  return currentUser;
}

export async function signUp(email, password){
  const sb = getSupabase();
  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) throw error;
  currentUser = data.user;
  return currentUser;
}

export async function signOut(){
  if (!supabaseReady) return;
  const sb = getSupabase();
  await sb.auth.signOut();
  currentUser = null;
}

// ===== Perfil (rol + módulo asignado) =====
// Se guarda en localStorage como respaldo para que, si se abre la app sin internet,
// se recuerde el último rol/módulo conocido en vez de bloquear al usuario.
const PROFILE_CACHE_KEY = 'am_perfil';

export async function getMyProfile(){
  if (!supabaseReady || !currentUser) return null;
  const sb = getSupabase();
  try {
    const { data, error } = await sb.from('perfiles').select('rol, modulo, email').eq('user_id', currentUser.id).single();
    if (error || !data) throw error || new Error('sin perfil');
    localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(data));
    return data;
  } catch (e) {
    // Sin internet (o el perfil aún no existe): usa el último conocido, si hay.
    const cached = localStorage.getItem(PROFILE_CACHE_KEY);
    return cached ? JSON.parse(cached) : { rol: 'coordinador', modulo: null };
  }
}

// ===== Panel de usuarios (admin) — llama a la Edge Function 'admin-usuarios' =====
// Esa función es la única que tiene la llave maestra de Supabase; aquí solo mandamos el
// token de la sesión actual (nunca la llave) y ella decide si quien llama es admin.
async function llamarAdminUsuarios(payload){
  if (!supabaseReady) throw new Error('Supabase no está configurado.');
  const sb = getSupabase();
  const { data } = await sb.auth.getSession();
  const session = data?.session;
  if (!session) throw new Error('No hay sesión activa.');
  const resp = await fetch(SUPABASE_URL + '/functions/v1/admin-usuarios', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const out = await resp.json().catch(() => ({}));
  if (!resp.ok || out.error) throw new Error(out.error || ('Error ' + resp.status));
  return out;
}
export function listarUsuarios(){ return llamarAdminUsuarios({ accion: 'listar' }); }
export function crearUsuario(email, password, rol, modulo){ return llamarAdminUsuarios({ accion: 'crear', email, password, rol, modulo }); }
export function actualizarPerfilUsuario(user_id, rol, modulo){ return llamarAdminUsuarios({ accion: 'actualizar_perfil', user_id, rol, modulo }); }
export function cambiarPasswordUsuario(user_id, password){ return llamarAdminUsuarios({ accion: 'cambiar_password', user_id, password }); }
export function eliminarUsuario(user_id){ return llamarAdminUsuarios({ accion: 'eliminar', user_id }); }

export function onAuthChange(cb){
  if (!supabaseReady) return () => {};
  const sb = getSupabase();
  const { data } = sb.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user || null;
    cb(currentUser);
  });
  return () => data.subscription.unsubscribe();
}

export function renderLogin(container, onDone){
  let mode = 'signin';
  container.innerHTML = loginHtml();
  wire();
  function loginHtml(){
    return `
    <div style="max-width:360px;margin:14vh auto 0;padding:0 16px">
      <div class="brand" style="justify-content:center;margin-bottom:18px">
        <img class="logo" src="logo-badge.png" alt="Closets Vera">
        <div><div class="brandname" style="color:var(--ink)">CLOSETS VERA</div><div class="brandsub" style="color:var(--sub)">Auditoría de Módulos</div></div>
      </div>
      <div class="card">
        <strong>${mode === 'signin' ? 'Iniciar sesión' : 'Crear cuenta'}</strong>
        <div style="margin-top:10px"><input id="au-email" type="email" placeholder="correo"></div>
        <div style="margin-top:8px"><input id="au-pass" type="password" placeholder="contraseña"></div>
        <div id="au-error" class="hint" style="color:var(--bad)"></div>
        <button class="btn" style="margin-top:10px;width:100%" id="au-submit">${mode === 'signin' ? 'Entrar' : 'Crear cuenta'}</button>
        <p class="hint" style="text-align:center;margin-top:10px">
          ${mode === 'signin' ? '¿No tienes cuenta? <a href="#" id="au-switch">Créala aquí</a>' : '¿Ya tienes cuenta? <a href="#" id="au-switch">Inicia sesión</a>'}
        </p>
      </div>
    </div>`;
  }
  function wire(){
    container.querySelector('#au-switch').onclick = (e) => { e.preventDefault(); mode = mode === 'signin' ? 'signup' : 'signin'; container.innerHTML = loginHtml(); wire(); };
    container.querySelector('#au-submit').onclick = async () => {
      const email = container.querySelector('#au-email').value.trim();
      const pass = container.querySelector('#au-pass').value;
      const errEl = container.querySelector('#au-error');
      errEl.textContent = '';
      if (!email || !pass) { errEl.textContent = 'Captura correo y contraseña.'; return; }
      try {
        if (mode === 'signin') await signIn(email, pass);
        else await signUp(email, pass);
        onDone();
      } catch (e) {
        errEl.textContent = e.message || 'Error al iniciar sesión.';
      }
    };
  }
}
