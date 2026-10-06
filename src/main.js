import { createClient } from '@supabase/supabase-js';
import { createDb } from './db.js';

// Публичные значения проекта Supabase (anon-ключ предназначен для браузера; данные защищены RLS).
// Переменные окружения, если заданы, имеют приоритет.
const DEFAULT_URL = 'https://qaicsqriuoznwoynfdgs.supabase.co';
const DEFAULT_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFhaWNzcXJpdW96bndveW5mZGdzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM2Mzg5MzQsImV4cCI6MjA3OTIxNDkzNH0.3llSpX7XKAmG3hEgpDyyAAEaGAmkm8jtUoHEZPnVcf4';
const env = import.meta.env;
const url = env.VITE_SUPABASE_URL || DEFAULT_URL;
const key = env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KE || env.VITE_SUPABASE_KEY || DEFAULT_KEY;
const sb = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });

const $ = id => document.getElementById(id);
let started = false;

// ---- Авторизация: вход / регистрация / восстановление пароля ----
let mode = 'in'; // in | up | forgot | newpw
const TXT = { in: 'Войти', up: 'Зарегистрироваться', forgot: 'Отправить ссылку для сброса', newpw: 'Сохранить новый пароль' };
const FIELDS = { in: ['email', 'password'], up: ['name', 'email', 'password', 'password2'], forgot: ['email'], newpw: ['password', 'password2'] };

function msg(text, isErr) {
  const el = $('loginMsg');
  el.textContent = text || '';
  el.classList.toggle('err', !!isErr);
}

function setMode(m) {
  mode = m;
  document.querySelectorAll('.authfld').forEach(f => { f.hidden = !FIELDS[m].includes(f.dataset.for); });
  document.querySelectorAll('.authtab').forEach(t => t.classList.toggle('on', t.dataset.mode === m));
  document.querySelector('.authtabs').hidden = m === 'newpw';
  $('authSubmit').textContent = TXT[m];
  $('forgotBtn').textContent = m === 'forgot' ? '← Назад ко входу' : 'Забыли пароль?';
  $('forgotBtn').hidden = m === 'up' || (m === 'newpw' && !started);
  if (m === 'newpw') $('forgotBtn').textContent = 'Отмена';
  $('password').autocomplete = m === 'in' ? 'current-password' : 'new-password';
  msg('');
}

function showLogin(text, isErr) {
  $('shell').hidden = true;
  $('login').hidden = false;
  if (text) msg(text, isErr);
}

const RU_ERR = {
  'Invalid login credentials': 'Неверный email или пароль.',
  'Email not confirmed': 'Email не подтверждён — откройте письмо со ссылкой подтверждения.',
  'Failed to fetch': 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.',
  'User already registered': 'Такой email уже зарегистрирован — войдите или восстановите пароль.',
};
const ru = e => RU_ERR[e.message] || e.message;

document.querySelectorAll('.authtab').forEach(t => t.addEventListener('click', () => setMode(t.dataset.mode)));
$('forgotBtn').addEventListener('click', () => {
  if (mode === 'newpw' && started) { recovering = false; $('login').hidden = true; $('shell').hidden = false; return; }
  setMode(mode === 'forgot' ? 'in' : 'forgot');
});

$('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const email = $('email').value.trim().toLowerCase();
  const pw = $('password').value;
  const pw2 = $('password2').value;
  const name = $('name').value.trim();
  if (FIELDS[mode].includes('email') && !/^\S+@\S+\.\S+$/.test(email)) return msg('Введите корректный email.', true);
  if (FIELDS[mode].includes('password') && pw.length < 8) return msg('Пароль должен быть не короче 8 символов.', true);
  if (FIELDS[mode].includes('password2') && pw !== pw2) return msg('Пароли не совпадают.', true);
  const btn = $('authSubmit');
  btn.disabled = true;
  msg('…');
  try {
    if (mode === 'in') {
      const { error } = await sb.auth.signInWithPassword({ email, password: pw });
      if (error) throw error;
      msg('');
    } else if (mode === 'up') {
      const { data, error } = await sb.auth.signUp({ email, password: pw, options: { data: { name }, emailRedirectTo: location.origin } });
      if (error) throw error;
      if (!data.session) msg('Аккаунт создан. Подтвердите email по ссылке из письма, затем войдите.');
    } else if (mode === 'forgot') {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin });
      if (error) throw error;
      msg('Если такой аккаунт есть, ссылка для сброса пароля отправлена на ' + email + '.');
    } else if (mode === 'newpw') {
      const { error } = await sb.auth.updateUser({ password: pw });
      if (error) throw error;
      msg('Пароль обновлён.');
      recovering = false;
      const { data } = await sb.auth.getSession();
      if (started) { $('login').hidden = true; $('shell').hidden = false; }
      else if (data.session) start(data.session);
    }
  } catch (err) {
    msg(ru(err), true);
  } finally {
    btn.disabled = false;
  }
});

setMode('in');

async function start(session) {
  if (started) return;
  const email = (session.user.email || '').toLowerCase();
  const { data: member, error } = await sb.from('shtab_members').select('role,name').eq('email', email).maybeSingle();
  if (error || !member) {
    showLogin('Вы вошли как ' + email + ', но доступа к Штабу пока нет. Попросите владельца открыть доступ для этого email.', true);
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
    bar.innerHTML = `<span></span><button class="btn ghost" type="button" data-u="pw">Сменить пароль</button><button class="btn ghost" type="button" data-u="out">Выйти</button>`;
    bar.querySelector('span').textContent = member.name || email;
    bar.querySelector('[data-u=out]').addEventListener('click', async () => { await sb.auth.signOut(); location.reload(); });
    bar.querySelector('[data-u=pw]').addEventListener('click', () => { recovering = true; setMode('newpw'); showLogin(); });
    foot.after(bar);
  }
  await import('./app.js');
}

let recovering = false;
sb.auth.onAuthStateChange((evt, session) => {
  if (evt === 'PASSWORD_RECOVERY') { recovering = true; setMode('newpw'); showLogin('Задайте новый пароль.'); return; }
  if (session && !started && !recovering) start(session);
});
sb.auth.getSession().then(({ data }) => {
  if (recovering) return;
  if (data.session) start(data.session); else showLogin();
});
