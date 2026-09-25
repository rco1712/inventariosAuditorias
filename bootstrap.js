// Carga los módulos ES (db.js, supabase.js, auth.js) y los expone como globales, para que
// src/app.js (un script clásico, no un módulo — lo necesita por sus atributos onclick="...")
// pueda usarlos. Después inserta app.js, garantizando que corra DESPUÉS de que todo esto
// ya esté listo.
import { db, initSync, syncAll, onSyncStateChange } from './db.js';
import { supabaseReady } from './supabase.js';
import { authAvailable, getSession, signIn, signUp, signOut, onAuthChange, renderLogin, getMyProfile, getCurrentUserEmail,
  listarUsuarios, crearUsuario, actualizarPerfilUsuario, cambiarPasswordUsuario, eliminarUsuario } from './auth.js';

Object.assign(window, {
  db, initSync, syncAll, onSyncStateChange,
  supabaseReady,
  authAvailable, getSession, signIn, signUp, signOut, onAuthChange, renderLogin, getMyProfile, getCurrentUserEmail,
  listarUsuarios, crearUsuario, actualizarPerfilUsuario, cambiarPasswordUsuario, eliminarUsuario
});

const s = document.createElement('script');
s.src = 'app.js';
document.body.appendChild(s);
