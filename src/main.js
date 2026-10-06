import { createClient } from '@supabase/supabase-js';
import { createDb } from './db.js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
const sb = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });

const $ = id => document.getElementById(id);
let started = false;

function showLogin(msg) {
  $('shell').hidden = true;
  $('login').hidden = false;
  if (msg) $('loginMsg').textContent = msg;
}

$('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const email = $('email').value.trim().toLowerCase();
  const btn = e.target.querySelector('button');
  btn.disabled = true;
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin } });
  btn.disabled = false;
  $('loginMsg').textContent = error ? 'Не получилось отправить ссылку: ' + error.message : 'Ссылка отправлена на ' + email + '. Откройте письмо на этом устройстве.';
});

async function start(session) {
  if (started) return;
  const email = (session.user.email || '').toLowerCase();
  const { data: member, error } = await sb.from('shtab_members').select('role,name').eq('email', email).maybeSingle();
  if (error || !member) {
    showLogin('У ' + email + ' нет доступа к Штабу. Попросите владельца добавить вас.');
    await sb.auth.signOut();
    return;
  }
  started = true;
  const db = createDb(sb);
  const user = {
    isOwner: async () => member.role === 'owner',
    canEdit: async () => true,
    can: async () => true,
    id: async () => session.user.id,
    me: async () => ({ id: session.user.id, name: member.name || email }),
    profiles: async () => ({}),
  };
  window.claude = { use: async name => (name === 'db' ? db : name === 'user' ? user : null) };
  $('login').hidden = true;
  $('shell').hidden = false;
  const foot = document.querySelector('.side .foot');
  if (foot) {
    const bar = document.createElement('div');
    bar.className = 'userbar';
    bar.innerHTML = `<span></span><button class="btn ghost" type="button">Выйти</button>`;
    bar.querySelector('span').textContent = member.name || email;
    bar.querySelector('button').addEventListener('click', async () => { await sb.auth.signOut(); location.reload(); });
    foot.after(bar);
  }
  await import('./app.js');
}

sb.auth.getSession().then(({ data }) => { if (data.session) start(data.session); else showLogin(); });
sb.auth.onAuthStateChange((evt, session) => { if (session && !started) start(session); });
