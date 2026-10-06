// Логика Штаба. Данные идут через window.claude.use('db'|'user') — см. src/main.js

(() => {
// ---------- справочники ----------
const DIRS = [
  {k:'sellerator', name:'Sellerator', short:'Sellerator'},
  {k:'agency', name:'Агентство ITIS', short:'ITIS'},
  {k:'courses', name:'Курсы', short:'Курсы'},
];
const ALLDIR = {...Object.fromEntries(DIRS.map(d=>[d.k,d])), life:{k:'life',name:'Личное',short:'Личное'}, all:{k:'all',name:'Все',short:'Все'}};
const ROUTES = [['overview','Пульт'],['rhythm','Ритм'],['plan','Планирование'],['sellerator','Sellerator'],['agency','Агентство ITIS'],['courses','Курсы'],['life','Личное'],['finplan','Финплан'],['sources','Источники данных']];
const OWNERS = ['Марат','Вячеслав','Артём','Владимир'];
const CATS = ['Продажи','Ключевые клиенты','Действующие клиенты','Продукт','Аналитика','Маркетинг','Доп'];
const METRICS = [['','Вручную'],['leads','Заявки (из метрик недели)'],['meetings','Встречи (из метрик недели)'],['deals','Продажи (из метрик недели)'],['newRev','Новая выручка (из метрик недели)'],['clients','Клиентов на конец периода'],['revenue','Выручка / MRR на конец периода']];
const FLOW = ['leads','meetings','deals','newRev'];
const HZ = [['year','Год'],['quarter','Квартал'],['month','Месяц'],['week','Неделя'],['day','День']];
const HZN = {year:'Год',quarter:'Квартал',month:'Месяц',week:'Неделя',day:'День'};
const INCOME_SRC = [['sellerator','Sellerator'],['agency','Агентство ITIS'],['courses','Курсы'],['ip','ИП и преподавание'],['other','Прочее']];
const EXP_CAT = ['Жильё','Семья и дети','Продукты и быт','Транспорт','Связь и подписки','Здоровье и спорт','Образование','Отдых и путешествия','Подарки','Кредиты','Прочее'];
const ASSET_CLS = ['Депозиты и накопительные счета','Облигации','Акции','Фонды','Недвижимость в аренду','Доли в бизнесе','Криптовалюта','Прочие инвестиции','Жильё для себя','Автомобиль','Деньги на счетах','Прочее имущество'];
const NONINV = ['Жильё для себя','Автомобиль','Деньги на счетах','Прочее имущество'];
const LIAB_CLS = ['Ипотека','Потребительский кредит','Автокредит','Кредитная карта','Рассрочка','Долг частному лицу','Прочее'];
const MONTHS = ['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'];
const MONTHS_G = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
const WD = ['вс','пн','вт','ср','чт','пт','сб'];
const dc = k => `var(--c-${k in ALLDIR && k!=='all' ? k : 'sellerator'})`;

// ---------- состояние ----------
const S = {dirs:{}, goals:[], tasks:[], weeks:[], decisions:[], assistants:[], life:null, entries:[], budget:{}, lgoals:[], assets:[], snaps:[], team:null, sources:[], srcCfg:null, dbState:'wait', owner:null};
const UI = load() || {route:'overview', hz:'week', cur:null, dir:'all', month:null};
UI.route = (location.hash||'').slice(1) || UI.route || 'overview';
if(!ROUTES.some(r=>r[0]===UI.route)) UI.route='overview';
let db = null;

function load(){ try{ return JSON.parse(localStorage.getItem('shtab-ui')||'null') }catch(e){ return null } }
function persist(){ try{ localStorage.setItem('shtab-ui', JSON.stringify(UI)) }catch(e){} }

// ---------- даты ----------
const pad = n => String(n).padStart(2,'0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const parse = s => { const [y,m,d]=s.split('-').map(Number); return new Date(y,(m||1)-1,d||1) };
const monday = d => { const x=new Date(d); const w=(x.getDay()+6)%7; x.setDate(x.getDate()-w); x.setHours(0,0,0,0); return x };
const today = () => { const d=new Date(); d.setHours(0,0,0,0); return d };
const monthKey = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}`;
function pkey(h,d){
  if(h==='year') return `${d.getFullYear()}`;
  if(h==='quarter') return `${d.getFullYear()}-Q${Math.floor(d.getMonth()/3)+1}`;
  if(h==='month') return monthKey(d);
  if(h==='week') return iso(monday(d));
  return iso(d);
}
function plabel(h,d){
  if(h==='year') return `${d.getFullYear()} год`;
  if(h==='quarter') return `${['I','II','III','IV'][Math.floor(d.getMonth()/3)]} квартал ${d.getFullYear()}`;
  if(h==='month') return `${cap(MONTHS[d.getMonth()])} ${d.getFullYear()}`;
  if(h==='week'){ const m=monday(d), e=new Date(m); e.setDate(m.getDate()+6);
    return m.getMonth()===e.getMonth() ? `${m.getDate()}–${e.getDate()} ${MONTHS_G[e.getMonth()]}` : `${m.getDate()} ${MONTHS_G[m.getMonth()]} – ${e.getDate()} ${MONTHS_G[e.getMonth()]}` }
  return `${WD[d.getDay()]}, ${d.getDate()} ${MONTHS_G[d.getMonth()]}`;
}
function shift(h,d,n){ const x=new Date(d);
  if(h==='year') x.setFullYear(x.getFullYear()+n);
  else if(h==='quarter') x.setMonth(x.getMonth()+3*n,1);
  else if(h==='month') x.setMonth(x.getMonth()+n,1);
  else if(h==='week') x.setDate(x.getDate()+7*n);
  else x.setDate(x.getDate()+n);
  return x }
function prange(h,d){
  let a, b;
  if(h==='year'){ a=new Date(d.getFullYear(),0,1); b=new Date(d.getFullYear()+1,0,1) }
  else if(h==='quarter'){ const q=Math.floor(d.getMonth()/3)*3; a=new Date(d.getFullYear(),q,1); b=new Date(d.getFullYear(),q+3,1) }
  else if(h==='month'){ a=new Date(d.getFullYear(),d.getMonth(),1); b=new Date(d.getFullYear(),d.getMonth()+1,1) }
  else if(h==='week'){ a=monday(d); b=new Date(a); b.setDate(a.getDate()+7) }
  else { a=new Date(d); a.setHours(0,0,0,0); b=new Date(a); b.setDate(a.getDate()+1) }
  return [a,b];
}
function elapsed(h,d){ const [a,b]=prange(h,d); const n=new Date(); return clamp((n-a)/(b-a)) }
const teamHours = () => (S.team && S.team.hours) || {'Марат':20,'Вячеслав':40,'Артём':20,'Владимир':10};
const workDays = () => (S.team && isNum(S.team.days) && S.team.days>0) ? S.team.days : 5;
const dayBudget = o => { const h=teamHours(); return o==='all' ? Object.values(h).reduce((a,b)=>a+(b||0),0)/workDays() : (h[o]||0)/workDays() };
const estOf = t => isNum(t.est) ? t.est : 0;
const hrs = v => isNum(v) ? (Math.round(v*10)/10).toLocaleString('ru-RU')+' ч' : '—';
const cur = () => UI.cur ? parse(UI.cur) : today();
const fmtDate = s => { if(!s) return '—'; const d=parse(s); return `${d.getDate()} ${MONTHS_G[d.getMonth()]} ${d.getFullYear()}` };

// ---------- формат ----------
const nf = new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0});
const isNum = v => typeof v==='number' && isFinite(v);
const rub = v => isNum(v) ? nf.format(v)+' ₽' : '—';
const rubS = v => !isNum(v) ? '—' : Math.abs(v)>=1e6 ? (v/1e6).toLocaleString('ru-RU',{maximumFractionDigits:2})+' млн ₽' : Math.abs(v)>=1e4 ? (v/1e3).toLocaleString('ru-RU',{maximumFractionDigits:0})+' тыс. ₽' : rub(v);
const usdS = v => !isNum(v) ? '—' : (v/1e6).toLocaleString('ru-RU',{maximumFractionDigits:2})+' млн $';
const pct = v => isNum(v) ? Math.round(v*100)+'%' : '—';
const num = v => isNum(v) ? nf.format(v) : '—';
const cap = s => s.charAt(0).toUpperCase()+s.slice(1);
const esc = s => String(s??'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clamp = v => Math.max(0, Math.min(1, v));
const frac = (a,b) => isNum(a)&&isNum(b)&&b>0 ? a/b : null;
const fmtU = (v,u) => u==='₽' ? rub(v) : u==='%' ? pct(v) : isNum(v) ? nf.format(v)+(u?' '+u:'') : '—';
const bar = (f,k) => `<div class="bar" style="--dc:${dc(k)}"><i style="width:${f==null?0:Math.round(clamp(f)*100)}%"></i></div>`;
const chip = k => k && ALLDIR[k] ? `<span class="chip"><span class="dot" style="background:${dc(k)}"></span>${esc(ALLDIR[k].short)}</span>` : '';
const newId = () => Date.now().toString(36)+Math.random().toString(36).slice(2,7);

// ---------- база ----------
async function put(path, data){
  if(!db){ toast('База недоступна в этом просмотре. Откройте страницу в claude.ai под своим аккаунтом.'); return false }
  try{ await db.doc(path).set(data); return true }catch(e){ toast(dbErr(e)); return false }
}
async function patch(path, data){
  if(!db){ toast('База недоступна в этом просмотре.'); return false }
  try{ await db.doc(path).update(data); return true }catch(e){ toast(dbErr(e)); return false }
}
async function del(path){
  if(!db) return false;
  try{ await db.doc(path).delete(); return true }catch(e){ toast(dbErr(e)); return false }
}
function dbErr(e){
  const c = e && e.code;
  if(c==='invalid_argument') return 'Не сохранилось: у вас нет прав на изменение этого раздела.';
  if(c==='quota_exceeded') return 'Не сохранилось: база заполнена. Удалите старые записи.';
  if(c==='resource_exhausted') return 'Слишком много изменений подряд. Подождите пару секунд.';
  return 'Не сохранилось: связь с базой прервалась. Попробуйте ещё раз.';
}
function sub(ref, fn){ ref.onSnapshot(fn, e => { if(e && e.code!=='revoked') toast('Обновления из базы остановились. Перезагрузите страницу.') }) }
const docs = s => s.docs.map(d => ({id:d.id, ...d.data()}));

async function boot(){
  render();
  const c = window.claude;
  if(!c || !c.use){ S.dbState='off'; render(); return }
  const [d, u] = await Promise.all([c.use('db').catch(()=>null), c.use('user').catch(()=>null)]);
  if(u){ try{ S.owner = await u.isOwner() }catch(e){ S.owner=null } }
  if(!d){ S.dbState='off'; render(); return }
  db = d; S.dbState='on';
  sub(db.collection('dirs'), s=>{ S.dirs={}; docs(s).forEach(x=>S.dirs[x.id]=x); render() });
  sub(db.collection('goals'), s=>{ S.goals=docs(s); render() });
  sub(db.collection('tasks'), s=>{ S.tasks=docs(s); render() });
  sub(db.doc('settings/team'), s=>{ S.team = s.exists ? s.data() : null; render() });
  sub(db.collection('sources'), s=>{ S.sources=docs(s); render() });
  sub(db.doc('settings/sources'), s=>{ S.srcCfg = s.exists ? s.data() : null; render() });
  sub(db.collection('weeks'), s=>{ S.weeks=docs(s); render() });
  sub(db.collection('decisions'), s=>{ S.decisions=docs(s); render() });
  sub(db.collection('assistants'), s=>{ S.assistants=docs(s); render() });
  sub(db.doc('life/main'), s=>{ S.life = s.exists ? s.data() : null; render() });
  sub(db.collection('life/main/entries'), s=>{ S.entries=docs(s); render() });
  sub(db.collection('life/main/budget'), s=>{ S.budget={}; docs(s).forEach(x=>S.budget[x.id]=x); render() });
  sub(db.collection('life/main/goals'), s=>{ S.lgoals=docs(s); render() });
  sub(db.collection('life/main/assets'), s=>{ S.assets=docs(s); render() });
  sub(db.collection('life/main/snapshots'), s=>{ S.snaps=docs(s); render() });
  render();
}

// ---------- рендер ----------
let pending = false;
function render(){
  const a = document.activeElement;
  if(a && document.getElementById('main').contains(a) && a.matches('input,textarea,select')){ pending=true; return }
  pending=false;
  document.getElementById('nav').innerHTML = ROUTES.map(([k,n],i)=>
    (k==='sellerator'?'<div class="navsep">Направления</div>':'')+(k==='life'?'<div class="navsep">Жизнь</div>':'')+(k==='sources'?'<div class="navsep">Система</div>':'')+
    `<a href="#${k}" ${UI.route===k?'aria-current="page"':''}><span class="dot" style="background:${['overview','plan','rhythm','sources'].includes(k)?'var(--ink)':dc(k==='finplan'?'life':k)}"></span>${n}</a>`).join('');
  document.getElementById('dbstatus').textContent = S.dbState==='on' ? 'База подключена · изменения сохраняются' : S.dbState==='off' ? 'База недоступна в этом просмотре' : 'Подключаю базу…';
  const v = {overview:vOverview, rhythm:vRhythm, plan:vPlan, sellerator:()=>vDir('sellerator'), agency:()=>vDir('agency'), courses:()=>vDir('courses'), life:vLife, finplan:vFin, sources:vSources}[UI.route] || vOverview;
  document.getElementById('main').innerHTML = v();
}
document.addEventListener('focusout', ()=>{ if(pending) setTimeout(()=>{ if(pending) render() }, 0) });

// расчёты по направлению
function dirCalc(k){
  const d = S.dirs[k] || {};
  const revenue = isNum(d.revenue) ? d.revenue : (isNum(d.clients)&&isNum(d.check) ? d.clients*d.check : null);
  const tRevenue = isNum(d.tRevenue) ? d.tRevenue : (isNum(d.tClients)&&isNum(d.tCheck) ? d.tClients*d.tCheck : null);
  let weeksLeft = null;
  if(d.tDeadline){ weeksLeft = Math.max(0,(parse(d.tDeadline)-today())/(7*864e5)) }
  const needClients = isNum(d.tClients)&&isNum(d.clients) ? d.tClients-d.clients : null;
  const needRev = isNum(tRevenue)&&isNum(revenue) ? tRevenue-revenue : null;
  const costs = isNum(d.costs) ? d.costs : null;
  const profit = costs!=null && revenue!=null ? revenue-costs : null;
  const margin = isNum(d.margin) ? d.margin : (profit!=null && revenue>0 ? profit/revenue : null);
  return {d, revenue, tRevenue, weeksLeft, needClients, needRev, costs, profit, margin};
}

function dirMetrics(k, compact){
  const {d, revenue, tRevenue} = dirCalc(k);
  const rows = [
    ['Клиенты', num(d.clients), num(d.tClients), frac(d.clients,d.tClients)],
    [d.revLabel||'Выручка в месяц', rubS(revenue), rubS(tRevenue), frac(revenue,tRevenue)],
  ];
  if(!compact) rows.push(['Средний чек', rub(d.check), rub(d.tCheck), frac(d.check,d.tCheck)]);
  const mg = dirCalc(k).margin;
  if(isNum(d.tMargin)) rows.push(['Маржинальность', pct(mg), pct(d.tMargin), frac(mg,d.tMargin)]);
  return rows.map(([l,a,b,f])=>`<div class="metric"><div class="mline"><span>${l}</span><span class="num">${a} <span class="sub">/ ${b}</span></span></div>${bar(f,k)}</div>`).join('');
}

// ---------- ПУЛЬТ ----------
function vOverview(){
  const L = S.life || {};
  const sel = dirCalc('sellerator');
  const lowR = isNum(L.exitLow)&&isNum(L.usdRate)&&isNum(L.exitShare) ? L.exitLow*L.usdRate*L.exitShare : null;
  const highR = isNum(L.exitHigh)&&isNum(L.usdRate)&&isNum(L.exitShare) ? L.exitHigh*L.usdRate*L.exitShare : null;
  const m = monthKey(today());
  const fin = finMonth(m);
  const wk = pkey('week', today());
  const tasks = S.tasks.filter(t=>t.horizon==='week' && t.date===wk).sort(byOwner);
  const done = tasks.filter(t=>t.done).length;
  const totRev = DIRS.reduce((s,x)=>s+(dirCalc(x.k).revenue||0),0);
  const totT = DIRS.reduce((s,x)=>s+(dirCalc(x.k).tRevenue||0),0);
  const lifeVisible = S.owner!==false;
  return `
  <div class="head"><div><h1>Пульт</h1><p class="lede">Бизнес-цели и личные цели в одной системе: каждое направление работает на капитал и образ жизни основателя.</p></div>
  <span class="status">${cap(plabel('day',today()))}</span></div>
  <div class="stack">
   <section class="north">
    <div class="card"><div class="label">Северная звезда · бизнес</div>
      <div class="big">Продажа Sellerator за ${isNum(L.exitLow)&&isNum(L.exitHigh)?(L.exitLow/1e6).toLocaleString('ru-RU')+'–'+(L.exitHigh/1e6).toLocaleString('ru-RU'):'10–15'} млн $</div>
      <div class="sub">${lowR!=null?`Ваша доля ${pct(L.exitShare)} ≈ ${rubS(lowR)} – ${rubS(highR)}`:'Доля основателя 75%'}</div>
      <div class="sub" style="margin-top:8px">Сейчас ${rubS(sel.revenue)} MRR · нужно 15–37 млн ₽ MRR к сделке</div>
    </div>
    <div class="card"><div class="label">Северная звезда · жизнь</div>
      ${L.vision?`<div class="vision">${esc(L.vision)}</div>`:`<div class="vision" style="opacity:.75">Опишите, ради чего всё это: образ жизни, капитал, семья, сроки. Эта цель задаёт планку личного дохода и сбережений.</div>`}
      ${lifeVisible?`<div class="row" style="margin-top:10px"><button class="btn" data-act="editLife" style="background:transparent;color:inherit;border-color:currentColor">Изменить</button></div>`:''}
    </div>
   </section>

   <section class="sec">
    <div class="sec-h"><h2>Направления</h2><span class="sub num">Сумма выручки ${rubS(totRev)} / цель ${rubS(totT)} в месяц</span></div>
    <div class="grid">
     ${DIRS.map(x=>{ const c=dirCalc(x.k); return `<a class="card dir" href="#${x.k}" style="--dc:${dc(x.k)};text-decoration:none;color:inherit">
       <div class="row" style="justify-content:space-between"><h3>${x.name}</h3><span class="sub">${c.d.tDeadline?'до '+fmtDate(c.d.tDeadline):''}</span></div>
       <div style="margin-top:12px">${dirMetrics(x.k,true)}</div>
       ${c.weeksLeft!=null&&c.needClients>0?`<div class="sub" style="margin-top:10px">Нужно +${num(c.needClients)} клиентов · ≈${(c.needClients/Math.max(c.weeksLeft,1)).toLocaleString('ru-RU',{maximumFractionDigits:1})} в неделю</div>`:''}
     </a>`}).join('')}
     ${lifeVisible?`<a class="card dir" href="#life" style="--dc:${dc('life')};text-decoration:none;color:inherit">
       <div class="row" style="justify-content:space-between"><h3>Личные финансы</h3><span class="sub">${cap(MONTHS[today().getMonth()])}</span></div>
       <div style="margin-top:12px">
        <div class="metric"><div class="mline"><span>Доход за месяц</span><span class="num">${rubS(fin.inF)} <span class="sub">/ ${rubS(isNum(L.incomeTarget)?L.incomeTarget:fin.inP||null)}</span></span></div>${bar(frac(fin.inF,isNum(L.incomeTarget)?L.incomeTarget:fin.inP),'life')}</div>
        <div class="metric"><div class="mline"><span>Расходы</span><span class="num">${rubS(fin.outF)} <span class="sub">/ ${rubS(fin.outP||null)}</span></span></div>${bar(frac(fin.outF,fin.outP),'life')}</div>
        <div class="metric"><div class="mline"><span>Пассивный доход</span><span class="num">${rubS(finCalc().passive)} <span class="sub">/ ${rubS(L.passiveTarget)}</span></span></div>${bar(frac(finCalc().passive,L.passiveTarget),'life')}</div>
        <div class="metric"><div class="mline"><span>Норма сбережений</span><span class="num">${fin.inF>0?pct((fin.inF-fin.outF)/fin.inF):'—'} <span class="sub">/ ${pct(L.savingsTarget)}</span></span></div></div>
       </div></a>`:''}
    </div>
   </section>

   <section class="sec">
    <div class="sec-h"><h2>Эта неделя · ${plabel('week',today())}</h2>
      <div class="row"><span class="sub num">${done} из ${tasks.length} сделано</span><a class="btn" href="#plan" data-act="gotoWeek">Открыть планирование</a></div></div>
    ${tasks.length?`<div class="list">${tasks.map(taskRow).join('')}</div>`:emptyBox('На эту неделю задач нет. Добавьте 3–5 приоритетов, привязанных к целям квартала.','addTask',{hz:'week',date:wk})}
   </section>

   <section class="sec">
    <div class="sec-h"><h2>Последние решения</h2><button class="btn" data-act="addDecision">Добавить решение</button></div>
    ${decisionsTable(S.decisions.slice().sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,5))}
   </section>
  </div>`;
}

function emptyBox(text, act, data){
  const attrs = data ? Object.entries(data).map(([k,v])=>`data-${k}="${esc(v)}"`).join(' ') : '';
  return `<div class="empty"><span>${text}</span>${act?`<button class="btn primary" data-act="${act}" ${attrs}>Добавить</button>`:''}</div>`;
}
const byPrio = (a,b) => (a.done?1:0)-(b.done?1:0) || (Number(a.prio)||9)-(Number(b.prio)||9) || (a.title||'').localeCompare(b.title||'');
const byOwner = (a,b) => (OWNERS.indexOf(a.owner)+99*(OWNERS.indexOf(a.owner)<0)) - (OWNERS.indexOf(b.owner)+99*(OWNERS.indexOf(b.owner)<0)) || (a.title||'').localeCompare(b.title||'');

function taskRow(t){
  return `<div class="item ${t.done?'done':''}">
    <input type="checkbox" ${t.done?'checked':''} data-act="toggleTask" data-id="${t.id}" aria-label="Сделано">
    <div class="grow"><div class="t">${esc(t.title)}</div>
      <div class="row sub" style="margin-top:2px">${t.prio?`<span class="pill ${t.prio==1?'bad':'mute'}">P${t.prio}</span>`:''}${t.cat&&UI.group!=='cat'?`<span>${esc(t.cat)}</span>`:''}${chip(t.dir)}${t.owner?`<span>${esc(t.owner)}</span>`:''}${isNum(t.est)?`<span class="num">≈${hrs(t.est)}</span>`:''}${t.goal?`<span>→ ${esc(t.goal)}</span>`:''}${t.day&&t.horizon==='week'?`<span>на ${fmtDate(t.day).replace(/ \d{4}$/,'')}</span>`:''}</div></div>
    ${t.horizon==='week'&&!t.done&&t.day!==iso(today())?`<button class="btn ghost" data-act="pickToday" data-id="${t.id}">На сегодня</button>`:''}
    <button class="btn ghost" data-act="editTask" data-id="${t.id}" aria-label="Изменить">Изменить</button>
  </div>`;
}

function decisionsTable(list){
  if(!list.length) return emptyBox('Решений пока нет. Записывайте сюда каждое решение с причиной и датой пересмотра.','addDecision');
  return `<div class="tablewrap"><table><thead><tr><th>Дата</th><th>Направление</th><th>Решение</th><th>Почему</th><th>Пересмотр</th><th></th></tr></thead><tbody>
  ${list.map(r=>`<tr><td class="num" style="white-space:nowrap">${esc(r.date?r.date.split('-').reverse().join('.'):'')}</td><td>${chip(r.dir)}</td><td>${esc(r.text)}</td><td class="sub">${esc(r.why)}</td><td class="sub">${esc(r.review)}</td><td><button class="btn ghost" data-act="editDecision" data-id="${r.id}">Изменить</button></td></tr>`).join('')}
  </tbody></table></div>`;
}


// ---------- РИТМ ----------
function vRhythm(){
  const dirF = UI.dir||'all';
  const inDir = x => dirF==='all' || x.dir===dirF;
  const now = today();
  const sec = h => {
    const key = pkey(h, now), e = elapsed(h, now);
    const gs = S.goals.filter(g=>g.horizon===h && g.period===key && inDir(g)).sort((a,b)=>(a.okr||'').localeCompare(b.okr||'')||(a.title||'').localeCompare(b.title||''));
    const st = gs.map(g=>paceStatus(g,e)[0]);
    const cnt = k => st.filter(x=>x===k).length;
    let extra = '';
    if(h==='week'){ const ts=S.tasks.filter(t=>t.horizon==='week'&&t.date===key&&inDir(t)); const p1=ts.filter(t=>t.prio==1);
      extra = `<div class="mline" style="margin-top:4px"><span>Задачи недели</span><span class="num">${ts.filter(t=>t.done).length}/${ts.length}${p1.length?` · P1 ${p1.filter(t=>t.done).length}/${p1.length}`:''}</span></div>` }
    return `<div class="card">
      <div class="row" style="justify-content:space-between"><div><div class="label">${HZN[h]}</div><h3 style="margin-top:2px">${cap(plabel(h,now))}</h3></div>
        <div class="row">${gs.length?`<span class="pill good">${cnt('good')}</span><span class="pill warn">${cnt('warn')}</span><span class="pill bad">${cnt('bad')}</span>`:''}<button class="btn ghost" data-act="addGoal" data-hz="${h}" data-period="${key}">+ цель</button></div></div>
      <div class="mline" style="margin-top:10px"><span class="sub">Прошло периода</span><span class="num sub">${pct(e)}</span></div>
      <div class="bar" style="--dc:var(--muted)"><i style="width:${Math.round(e*100)}%"></i></div>
      ${extra}
      <div style="display:flex;flex-direction:column;gap:12px;margin-top:14px">
      ${gs.length?gs.map(g=>{ const f=goalFact(g), p=goalProgress(g), [cls,txt]=paceStatus(g,e);
        return `<div><div class="mline"><span style="min-width:0">${dirF==='all'?chip(g.dir)+' ':''}${esc(g.title)}${!isNum(g.fact)&&g.metric?' <span class="sub">· авто</span>':''}</span>
          <span class="num" style="white-space:nowrap">${fmtU(f,g.unit)} <span class="sub">/ ${fmtU(g.target,g.unit)}</span></span></div>
          <div class="row" style="gap:8px;flex-wrap:nowrap"><div style="flex:1;min-width:0">${bar(p,g.dir)}</div><span class="pill ${cls}" style="margin-top:6px">${txt}</span>
          <button class="btn ghost" data-act="editGoal" data-id="${g.id}" style="margin-top:6px">Изменить</button></div></div>` }).join('')
        : `<div class="sub">Целей в цифрах на этот период нет.</div>`}
      </div></div>`;
  };
  return `
  <div class="head"><div><h1>Ритм</h1><p class="lede">Неделя, месяц, квартал и год в цифрах. Статус сравнивает выполнение с долей прошедшего времени: если прошло 60% месяца, а цель выполнена на 30% — цель отстаёт.</p></div>
   <div class="row"><button class="btn ghost" data-act="tgRhythmView">Посмотреть текст</button><button class="btn primary" data-act="tgRhythm">Скопировать для Telegram</button></div></div>
  <div class="stack">
   <div class="seg" role="group" aria-label="Направление" style="align-self:flex-start;max-width:100%;overflow-x:auto">${['all',...DIRS.map(x=>x.k)].map(k=>`<button data-act="dirf" data-v="${k}" aria-pressed="${dirF===k}">${ALLDIR[k].short}</button>`).join('')}</div>
   <div class="grid g2">${['week','month','quarter','year'].map(sec).join('')}</div>
   <p class="sub" style="margin:0">Цели с пометкой «авто» берут факт из недельных метрик (раздел направления → «Внести неделю»). Ручной факт вносится в «Планировании» или через «Изменить».</p>
  </div>`;
}

// ---------- ПЛАНИРОВАНИЕ ----------
function vPlan(){
  const h = UI.hz, d = cur(), key = pkey(h,d);
  const dirF = UI.dir||'all';
  const inDir = x => dirF==='all' || x.dir===dirF;
  let body='';
  if(['year','quarter','month'].includes(h)){
    const gs = S.goals.filter(g=>g.horizon===h && g.period===key && inDir(g));
    body = gs.length ? goalsBlock(gs) : emptyBox(`Целей на ${plabel(h,d).toLowerCase()} нет.${h==='month'?' Месячные вехи выводятся из квартальных OKR.':''}`,'addGoal',{hz:h,period:key});
    if(gs.length) body += `<div><button class="btn" data-act="addGoal" data-hz="${h}" data-period="${key}">Добавить цель</button></div>`;
  } else if(h==='week'){
    const ts = S.tasks.filter(t=>t.horizon==='week' && t.date===key && inDir(t)).sort(byPrio);
    const gk = UI.group==='owner' ? (t=>t.owner||'Без исполнителя') : (t=>t.cat||'Без категории');
    const order = UI.group==='owner' ? OWNERS : CATS;
    const groups = [...new Set(ts.map(gk))].sort((a,b)=>((order.indexOf(a)+1)||99)-((order.indexOf(b)+1)||99));
    const wg = S.goals.filter(g=>g.horizon==='week' && g.period===key && inDir(g));
    body = `<div class="sec"><div class="sec-h"><h3>Цели недели в цифрах</h3><button class="btn" data-act="addGoal" data-hz="week" data-period="${key}">Добавить цель недели</button></div>
      ${wg.length?goalsBlock(wg):'<div class="sub">Задайте 3–6 чисел на неделю: заявки, встречи, договоры, оплаты. Цели с источником «из метрик недели» заполняются сами.</div>'}</div>
      <div class="row" style="justify-content:space-between"><div class="row"><h3>Задачи недели</h3><button class="btn" data-act="tgWeek" data-week="${key}" data-dir="${dirF}">Скопировать для Telegram</button><button class="btn ghost" data-act="tgWeekView" data-week="${key}" data-dir="${dirF}">Посмотреть текст</button></div><div class="seg" role="group" aria-label="Группировка"><button data-act="group" data-v="cat" aria-pressed="${UI.group!=='owner'}">По разделам</button><button data-act="group" data-v="owner" aria-pressed="${UI.group==='owner'}">По людям</button></div></div>`;
    body += ts.length ? groups.map(o=>{ const l=ts.filter(t=>gk(t)===o); const eh=l.reduce((a,t)=>a+estOf(t),0), wh=teamHours()[o];
      const hInfo = UI.group==='owner' && isNum(wh) ? ` · оценка ${hrs(eh)} из ${hrs(wh)}${eh>wh?' <span class="pill bad">перегруз</span>':''}` : '';
      return `<div class="sec"><div class="sec-h"><h3>${esc(o)}</h3><span class="sub num">${l.filter(t=>t.done).length}/${l.length}${hInfo}</span></div><div class="list">${l.map(taskRow).join('')}</div></div>`}).join('')
      : emptyBox('На эту неделю задач нет. Правило: 3–5 приоритетов, каждый привязан к цели квартала.','addTask',{hz:'week',date:key});
    if(ts.length) body += `<div><button class="btn" data-act="addTask" data-hz="week" data-date="${key}">Добавить задачу</button></div>`;
    body += weekMetricsSummary(key, dirF);
  } else {
    const wk = pkey('week',d);
    const own = UI.dayOwner || 'Марат';
    const byOwn = t => own==='all' || (t.owner||'')===own;
    const inDay = S.tasks.filter(t=>((t.horizon==='day'&&t.date===key)||(t.horizon==='week'&&t.day===key)) && inDir(t) && byOwn(t)).sort(byPrio);
    const pool = S.tasks.filter(t=>t.horizon==='week'&&t.date===wk&&!t.done&&t.day!==key&&inDir(t)&&byOwn(t)).sort(byPrio);
    const budget = dayBudget(own);
    const total = inDay.reduce((a,t)=>a+estOf(t),0);
    const doneH = inDay.filter(t=>t.done).reduce((a,t)=>a+estOf(t),0);
    const left = budget - total;
    const noEst = inDay.filter(t=>!isNum(t.est)).length;
    const over = total > budget + 1e-9;
    const fill = budget>0 ? Math.min(1,total/budget) : 0;
    body = `
    <div class="row" style="justify-content:space-between;gap:12px">
      <div class="seg" role="group" aria-label="Исполнитель">${[...OWNERS,'all'].map(o=>`<button data-act="dayOwner" data-v="${o}" aria-pressed="${own===o}">${o==='all'?'Все':o}</button>`).join('')}</div>
      <button class="btn ghost" data-act="editTeam">Часы команды</button>
    </div>
    <div class="card">
      <div class="row" style="justify-content:space-between"><div><div class="label">Бюджет дня${own==='all'?' · вся команда':' · '+esc(own)}</div>
        <div class="big">${hrs(total)} <span class="sub">из ${hrs(budget)}</span></div></div>
        <div style="text-align:right"><span class="pill ${over?'bad':left<0.5?'warn':'good'}">${over?'перегруз '+hrs(total-budget):'свободно '+hrs(left)}</span>
        <div class="sub num" style="margin-top:6px">сделано ${hrs(doneH)}</div></div></div>
      <div class="bar" style="--dc:${over?'var(--bad)':'var(--accent)'};height:10px"><i style="width:${Math.round(fill*100)}%"></i></div>
      ${noEst?`<div class="sub" style="margin-top:8px">${noEst} ${noEst===1?'задача':'задачи'} без оценки — поставьте часы, чтобы бюджет был точным.</div>`:''}
      ${over?`<div class="warnbox" style="margin-top:10px;border-color:var(--bad)">План дня больше бюджета на ${hrs(total-budget)}. Уберите P2–P3 или перенесите их на завтра.</div>`:''}
    </div>
    <div class="grid g2">
      <div class="sec"><div class="sec-h"><h3>План дня</h3><button class="btn" data-act="addTask" data-hz="day" data-date="${key}">Новая задача</button></div>
        ${inDay.length?`<div class="list">${inDay.map(t=>dayRow(t,key,true,left)).join('')}</div>`:'<div class="empty">Пока пусто. Добавьте 1–3 задачи из недельного плана справа — начните с P1.</div>'}</div>
      <div class="sec"><div class="sec-h"><h3>Из недельного плана</h3><span class="sub">${plabel('week',d)} · открыто ${pool.length}</span></div>
        ${pool.length?`<div class="list">${pool.map(t=>dayRow(t,key,false,left)).join('')}</div>`:'<div class="sub">Открытых задач недели нет.</div>'}</div>
    </div>`;
  }
  return `
  <div class="head"><div><h1>Планирование</h1><p class="lede">Каскад: год → квартал → месяц → неделя → день. Каждая задача недели ведёт к цели квартала.</p></div></div>
  <div class="stack">
   <div class="row" style="justify-content:space-between;gap:12px">
     <div class="seg" role="group" aria-label="Горизонт">${HZ.map(([k,n])=>`<button data-act="hz" data-v="${k}" aria-pressed="${h===k}">${n}</button>`).join('')}</div>
     <div class="pager"><button class="btn ghost" data-act="prev" aria-label="Назад">←</button><b>${cap(plabel(h,d))}</b><button class="btn ghost" data-act="next" aria-label="Вперёд">→</button><button class="btn ghost" data-act="now">Сейчас</button></div>
   </div>
   <div class="seg" role="group" aria-label="Направление" style="align-self:flex-start;max-width:100%;overflow-x:auto">${['all',...DIRS.map(x=>x.k)].map(k=>`<button data-act="dirf" data-v="${k}" aria-pressed="${dirF===k}">${ALLDIR[k].short}</button>`).join('')}</div>
   ${body}
  </div>`;
}

function autoFact(g){
  if(!g.metric) return null;
  const ws = S.weeks.filter(w=>w.dir===g.dir && w.week && pkey(g.horizon, parse(w.week))===g.period && isNum(w[g.metric]));
  if(!ws.length) return null;
  if(FLOW.includes(g.metric)) return ws.reduce((s,w)=>s+w[g.metric],0);
  return ws.sort((a,b)=>b.week.localeCompare(a.week))[0][g.metric];
}
const goalFact = g => isNum(g.fact) ? g.fact : autoFact(g);
function goalProgress(g){
  const f = goalFact(g);
  if(!isNum(f) || !isNum(g.target)) return null;
  const b = isNum(g.base)?g.base:0;
  if(g.target===b) return f<=g.target?1:0;
  return clamp((f-b)/(g.target-b));
}
function paceStatus(g, e){
  const p = goalProgress(g);
  if(p==null) return ['mute','нет факта'];
  if(p>=1) return ['good','выполнено'];
  const b = isNum(g.base)?g.base:0;
  if(g.target===b) return ['bad','не выполнено'];
  if(p>=e-0.1) return ['good','в темпе'];
  if(p>=e-0.25) return ['warn','отстаёт'];
  return ['bad','сильно отстаёт'];
}
function goalsBlock(gs){
  const byDir = {};
  gs.forEach(g=>{ (byDir[g.dir||'all'] ||= []).push(g) });
  return Object.entries(byDir).map(([k,list])=>{
    const groups = {};
    list.forEach(g=>{ (groups[g.okr||''] ||= []).push(g) });
    return `<div class="card dir" style="--dc:${dc(k)}"><div class="row" style="justify-content:space-between;margin-bottom:10px">${chip(k)}</div>
     <div class="stack" style="gap:16px">${Object.entries(groups).map(([o,l])=>`<div class="sec" style="gap:10px">${o?`<h3>${esc(o)}</h3>`:''}
       ${l.sort((a,b)=>(a.title||'').localeCompare(b.title||'')).map(goalRow).join('')}</div>`).join('')}</div></div>`;
  }).join('');
}
function goalRow(g){
  const p = goalProgress(g);
  const unitIn = g.unit==='%' ? (isNum(g.fact)?Math.round(g.fact*100):'') : (isNum(g.fact)?g.fact:'');
  const af = !isNum(g.fact) ? autoFact(g) : null;
  return `<div class="kr">
    <div style="min-width:0"><div>${esc(g.title)}</div>
      <div class="sub num">База ${fmtU(g.base,g.unit)} → цель ${fmtU(g.target,g.unit)}${g.owner?` · ${esc(g.owner)}`:''}${g.deadline?` · до ${esc(g.deadline)}`:''}</div>
      ${bar(p,g.dir)}</div>
    <div class="row" style="justify-content:flex-end">
      <input class="factin" inputmode="decimal" aria-label="Факт" placeholder="${af!=null?(g.unit==='%'?Math.round(af*100):af)+' авто':(g.metric?'авто':'факт')}" value="${unitIn}" data-fact="${g.id}" data-unit="${esc(g.unit||'')}">
      <span class="pill ${p==null?'mute':p>=1?'good':p>=.7?'warn':'mute'}">${p==null?'нет факта':Math.round(p*100)+'%'}</span>
      <button class="btn ghost" data-act="editGoal" data-id="${g.id}">Изменить</button>
    </div></div>`;
}

function weekMetricsSummary(key, dirF){
  const ws = S.weeks.filter(w=>w.week===key && (dirF==='all'||w.dir===dirF));
  return `<div class="sec"><div class="sec-h"><h3>Метрики недели</h3><button class="btn" data-act="addWeek" data-dir="${dirF==='all'?'sellerator':dirF}" data-week="${key}">Внести метрики</button></div>
   ${ws.length?weeksTable(ws,true):'<div class="sub">Метрик за эту неделю нет. Их вносят в пятницу на ретро.</div>'}</div>`;
}

// ---------- НАПРАВЛЕНИЕ ----------
function vDir(k){
  const X = ALLDIR[k];
  const c = dirCalc(k), d = c.d;
  const q = pkey('quarter',today()), y = pkey('year',today());
  const qGoals = S.goals.filter(g=>g.dir===k&&g.horizon==='quarter'&&g.period===q);
  const yGoals = S.goals.filter(g=>g.dir===k&&g.horizon==='year');
  const ws = S.weeks.filter(w=>w.dir===k).sort((a,b)=>b.week.localeCompare(a.week)).slice(0,12);
  const as = S.assistants.filter(a=>(a.dir||'sellerator')===k);
  const ds = S.decisions.filter(r=>r.dir===k).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  const filled = Object.keys(d).length>0;
  const paceTxt = c.weeksLeft!=null ? [
    c.needClients>0?`+${num(c.needClients)} клиентов (≈${(c.needClients/Math.max(c.weeksLeft,1)).toLocaleString('ru-RU',{maximumFractionDigits:1})} в неделю)`:null,
    c.needRev>0?`+${rubS(c.needRev)} выручки в месяц`:null,
    isNum(d.tMargin)&&isNum(c.margin)&&c.margin<d.tMargin?`маржинальность с ${pct(c.margin)} до ${pct(d.tMargin)}`:null
  ].filter(Boolean) : [];
  return `
  <div class="head"><div><h1 style="color:${dc(k)}">${X.name}</h1>${d.north?`<p class="lede">${esc(d.north)}</p>`:''}</div>
   <button class="btn" data-act="editDir" data-k="${k}">Показатели и цели</button></div>
  <div class="stack">
   ${!filled?emptyBox('Показатели направления ещё не заданы.','editDir',{k}):`
   <section class="grid">
     ${tile('Клиенты', num(d.clients), `цель ${num(d.tClients)}`, frac(d.clients,d.tClients), k)}
     ${tile(d.revLabel||'Выручка в месяц', rubS(c.revenue), `цель ${rubS(c.tRevenue)}`, frac(c.revenue,c.tRevenue), k)}
     ${tile('Средний чек', rub(d.check), `цель ${rub(d.tCheck)}`, frac(d.check,d.tCheck), k)}
     ${isNum(d.tMargin)?tile('Маржинальность', pct(c.margin), `цель ${pct(d.tMargin)}`, frac(c.margin,d.tMargin), k):''}
     ${c.costs!=null?`<div class="card dir" style="--dc:${dc(k)}"><div class="label">Прибыль в месяц</div><div class="big" style="color:${c.profit<0?'var(--bad)':'var(--ink)'}">${rubS(c.profit)}</div><div class="sub num">расходы ${rubS(c.costs)}${!isNum(d.tMargin)&&c.margin!=null?' · маржа '+pct(c.margin):''}</div></div>`:''}
     ${isNum(d.share)?`<div class="card dir" style="--dc:${dc(k)}"><div class="label">Ваша доля</div><div class="big">${pct(d.share)}</div><div class="sub num">${c.profit!=null?'от прибыли ≈ '+rubS(c.profit*d.share):'от бизнеса'}</div></div>`:''}
   </section>
   ${paceTxt.length?`<div class="warnbox">До ${fmtDate(d.tDeadline)} осталось ${Math.round(c.weeksLeft)} нед. Нужно: ${paceTxt.join('; ')}.</div>`:''}
   ${d.note?`<div class="sub">${esc(d.note)}</div>`:''}`}

   ${weekPanel(k)}

   <section class="sec"><div class="sec-h"><h2>Цели квартала · ${plabel('quarter',today())}</h2><button class="btn" data-act="addGoal" data-hz="quarter" data-period="${q}" data-dir="${k}">Добавить цель</button></div>
     ${qGoals.length?goalsBlock(qGoals):emptyBox('OKR на квартал не заданы.','addGoal',{hz:'quarter',period:q,dir:k})}</section>

   <section class="sec"><div class="sec-h"><h2>Годовые цели</h2><button class="btn" data-act="addGoal" data-hz="year" data-period="${y}" data-dir="${k}">Добавить цель</button></div>
     ${yGoals.length?goalsBlock(yGoals.sort((a,b)=>a.period.localeCompare(b.period))):emptyBox('Годовых целей нет.','addGoal',{hz:'year',period:y,dir:k})}</section>

   <section class="sec"><div class="sec-h"><h2>Недельные метрики</h2><button class="btn" data-act="addWeek" data-dir="${k}" data-week="${pkey('week',today())}">Внести неделю</button></div>
     ${ws.length?weeksTable(ws):emptyBox('Метрик пока нет. Каждую пятницу вносите заявки, встречи, сделки и выручку — так видно, где проседает воронка.','addWeek',{dir:k,week:pkey('week',today())})}</section>

   <section class="sec"><div class="sec-h"><h2>ИИ-ассистенты</h2><button class="btn" data-act="addAssistant" data-dir="${k}">Добавить ассистента</button></div>
     <p class="sub" style="margin:0">Повторяющаяся задача больше часа в неделю — кандидат в ассистенты.</p>
     ${as.length?assistantsTable(as):emptyBox('Ассистентов пока нет. Начните с самой частой рутины в продажах или отчётности.','addAssistant',{dir:k})}</section>

   <section class="sec"><div class="sec-h"><h2>Решения</h2><button class="btn" data-act="addDecision" data-dir="${k}">Добавить решение</button></div>${decisionsTable(ds)}</section>
  </div>`;
}


function dayRow(t, key, inDay, left){
  const e = isNum(t.est) ? t.est : '';
  const tooBig = !inDay && isNum(t.est) && t.est > left + 1e-9;
  return `<div class="item ${t.done?'done':''}">
    ${inDay?`<input type="checkbox" ${t.done?'checked':''} data-act="toggleTask" data-id="${t.id}" aria-label="Сделано">`:''}
    <div class="grow"><div class="t">${esc(t.title)}</div>
      <div class="row sub" style="margin-top:2px">${t.prio?`<span class="pill ${t.prio==1?'bad':'mute'}">P${t.prio}</span>`:''}${t.cat?`<span>${esc(t.cat)}</span>`:''}${UI.dayOwner==='all'&&t.owner?`<span>${esc(t.owner)}</span>`:''}${t.day&&t.day!==key&&!inDay?`<span>в плане на ${fmtDate(t.day).replace(/ \d{4}$/,'')}</span>`:''}</div></div>
    <label class="row sub" style="gap:4px;flex-wrap:nowrap"><input class="factin" style="width:64px" inputmode="decimal" placeholder="ч" value="${e}" data-est="${t.id}" aria-label="Оценка в часах"> ч</label>
    ${inDay ? (t.horizon==='week'?`<button class="btn ghost" data-act="fromDay" data-id="${t.id}">Убрать</button>`:`<button class="btn ghost" data-act="editTask" data-id="${t.id}">Изменить</button>`)
            : `<button class="btn ${tooBig?'danger':''}" data-act="toDay" data-id="${t.id}" data-day="${key}" title="${tooBig?'Не помещается в остаток бюджета':''}">+ в день</button>`}
  </div>`;
}

function weekPanel(k){
  const wd = UI.dwk ? parse(UI.dwk) : today();
  const key = pkey('week', wd), e = elapsed('week', wd);
  const gs = S.goals.filter(g=>g.dir===k && g.horizon==='week' && g.period===key).sort((a,b)=>(a.okr||'').localeCompare(b.okr||'')||(a.title||'').localeCompare(b.title||''));
  const ts = S.tasks.filter(t=>t.dir===k && t.horizon==='week' && t.date===key);
  const w = S.weeks.find(x=>x.dir===k && x.week===key);
  const cats = [...new Set(ts.map(t=>t.cat||'Без категории'))].sort((a,b)=>((CATS.indexOf(a)+1)||99)-((CATS.indexOf(b)+1)||99));
  const p1open = ts.filter(t=>t.prio==1 && !t.done).sort(byOwner);
  const done = ts.filter(t=>t.done).length;
  const nowWeek = key===pkey('week',today());
  return `<section class="sec">
   <div class="sec-h"><h2>Неделя: план и факт</h2>
    <div class="row"><div class="pager"><button class="btn ghost" data-act="dwk" data-n="-1" aria-label="Предыдущая неделя">←</button><b style="min-width:150px">${plabel('week',wd)}</b><button class="btn ghost" data-act="dwk" data-n="1" aria-label="Следующая неделя">→</button>${nowWeek?'':'<button class="btn ghost" data-act="dwk" data-n="0">Эта неделя</button>'}</div>
    <button class="btn" data-act="tgWeek" data-week="${key}" data-dir="${k}">Скопировать для Telegram</button>
    <button class="btn" data-act="addWeek" data-dir="${k}" data-week="${key}">Внести метрики</button></div></div>
   <div class="grid g2">
    <div class="sec" style="gap:8px"><div class="mline"><h3>Цели недели в цифрах</h3><span class="sub num">прошло ${pct(e)} недели</span></div>
     ${gs.length?`<div class="tablewrap"><table><thead><tr><th>Цель</th><th class="n">План</th><th class="n">Факт</th><th class="n">%</th><th>Статус</th></tr></thead><tbody>
      ${gs.map(g=>{ const f=goalFact(g), p=goalProgress(g), [cls,txt]=paceStatus(g,e);
        return `<tr><td>${esc(g.title)}${!isNum(g.fact)&&g.metric?' <span class="sub">· авто</span>':''}</td><td class="n">${fmtU(g.target,g.unit)}</td><td class="n">${fmtU(f,g.unit)}</td><td class="n">${p==null?'—':Math.round(p*100)+'%'}</td><td><span class="pill ${cls}">${txt}</span> <button class="btn ghost" data-act="editGoal" data-id="${g.id}">Факт</button></td></tr>` }).join('')}
     </tbody></table></div>`:emptyBox('Цифр на эту неделю нет: заявки, встречи, договоры, оплаты.','addGoal',{hz:'week',period:key,dir:k})}
     ${w?`<div class="row sub num" style="gap:6px 16px">Воронка: <span>заявки ${num(w.leads)}</span><span>встречи ${num(w.meetings)}</span><span>сделки ${num(w.deals)}${isNum(w.dealsPlan)?' из '+num(w.dealsPlan):''}</span><span>новая выручка ${rubS(w.newRev)}</span>${isNum(w.adCost)?`<span>реклама ${rubS(w.adCost)}${w.leads>0?' · заявка '+rub(w.adCost/w.leads):''}</span>`:''}</div>`:'<div class="sub">Метрики воронки за неделю не внесены — авто-цели пока без факта.</div>'}
    </div>
    <div class="sec" style="gap:8px"><div class="mline"><h3>Задачи недели</h3><span class="sub num">${done} из ${ts.length} · ${ts.length?Math.round(done/ts.length*100):0}%</span></div>
     ${ts.length?`<div class="tablewrap"><table><thead><tr><th>Раздел</th><th class="n">Сделано</th><th class="n">P1</th><th style="width:30%"></th></tr></thead><tbody>
      ${cats.map(c=>{ const l=ts.filter(t=>(t.cat||'Без категории')===c), d1=l.filter(t=>t.done).length, p=l.filter(t=>t.prio==1);
        return `<tr><td>${esc(c)}</td><td class="n">${d1}/${l.length}</td><td class="n">${p.length?p.filter(t=>t.done).length+'/'+p.length:'—'}</td><td>${bar(d1/l.length,k)}</td></tr>` }).join('')}
     </tbody></table></div>
     ${p1open.length?`<div class="label" style="margin-top:4px">Открытые P1</div><div class="list">${p1open.map(taskRow).join('')}</div>`:'<div class="sub">Все P1 закрыты.</div>'}
     <div><a class="btn ghost" href="#plan" data-act="gotoWeekOf" data-week="${key}">Весь план недели →</a></div>`
     :emptyBox('Задач на эту неделю нет.','addTask',{hz:'week',date:key})}
    </div>
   </div>
  </section>`;
}

function tile(l,v,s,f,k){ return `<div class="card dir" style="--dc:${dc(k)}"><div class="label">${l}</div><div class="big">${v}</div><div class="sub num">${s}</div>${bar(f,k)}</div>` }

function weeksTable(ws, withDir){
  return `<div class="tablewrap"><table><thead><tr><th>Неделя</th>${withDir?'<th>Направление</th>':''}<th class="n">Заявки</th><th class="n">Встречи</th><th class="n">Сделки план</th><th class="n">Сделки факт</th><th class="n">Новая выручка</th><th class="n">Клиентов</th><th class="n">Выручка / MRR</th><th class="n">Реклама</th><th class="n">Цена заявки</th><th class="n">Цена клиента</th><th>Заметка</th><th></th></tr></thead><tbody>
   ${ws.map(w=>{ const ok = isNum(w.dealsPlan)&&isNum(w.deals) ? (w.deals>=w.dealsPlan?'good':'bad') : '';
     return `<tr><td style="white-space:nowrap">${plabel('week',parse(w.week))}</td>${withDir?`<td>${chip(w.dir)}</td>`:''}<td class="n">${num(w.leads)}</td><td class="n">${num(w.meetings)}</td><td class="n">${num(w.dealsPlan)}</td><td class="n">${ok?`<span class="pill ${ok}">${num(w.deals)}</span>`:num(w.deals)}</td><td class="n">${rub(w.newRev)}</td><td class="n">${num(w.clients)}</td><td class="n">${rub(w.revenue)}</td><td class="n">${rub(w.adCost)}</td><td class="n">${isNum(w.adCost)&&w.leads>0?rub(w.adCost/w.leads):'—'}</td><td class="n">${isNum(w.adCost)&&w.deals>0?rub(w.adCost/w.deals):'—'}</td><td class="sub">${esc(w.note)}${w.src?` <span class="chip">${esc(w.src)}</span>`:''}</td><td><button class="btn ghost" data-act="editWeek" data-id="${w.id}">Изменить</button></td></tr>`}).join('')}
   </tbody></table></div>`;
}
function assistantsTable(as){
  const st = s => s==='В работе'?'good':s==='Сборка'?'warn':'mute';
  return `<div class="tablewrap"><table><thead><tr><th>Ассистент</th><th>Что делает</th><th>Волна</th><th class="n">Сборка, ч</th><th class="n">Экономит, ч/нед</th><th>Владелец</th><th>Срок</th><th>Статус</th><th></th></tr></thead><tbody>
  ${as.sort((a,b)=>(a.wave||'').localeCompare(b.wave||'')||(a.deadline||'').localeCompare(b.deadline||'')).map(a=>`<tr><td><b>${esc(a.name)}</b><div class="sub">${esc(a.stage)}</div></td><td class="sub" style="min-width:220px">${esc(a.does)}</td><td style="white-space:nowrap">${esc(a.wave)}</td><td class="n">${num(a.buildH)}</td><td class="n">${num(a.saveH)}</td><td>${esc(a.owner)}</td><td style="white-space:nowrap">${fmtDate(a.deadline)}</td><td><span class="pill ${st(a.status)}">${esc(a.status||'Не начат')}</span></td><td><button class="btn ghost" data-act="editAssistant" data-id="${a.id}">Изменить</button></td></tr>`).join('')}
  </tbody></table></div>`;
}

// ---------- ЛИЧНОЕ ----------
function finMonth(m){
  const es = S.entries.filter(e=>(e.date||'').startsWith(m));
  const b = S.budget[m] || {};
  const inF = es.filter(e=>e.type==='in').reduce((s,e)=>s+(e.amount||0),0);
  const outF = es.filter(e=>e.type==='out').reduce((s,e)=>s+(e.amount||0),0);
  const inP = Object.values(b.income||{}).reduce((s,v)=>s+(v||0),0);
  const outP = Object.values(b.expense||{}).reduce((s,v)=>s+(v||0),0);
  return {es, b, inF, outF, inP, outP};
}
function vLife(){
  if(S.owner===false) return `<div class="head"><div><h1>Личное</h1></div></div>${emptyBox('Этот раздел виден только владельцу офиса.')}`;
  const L = S.life || {};
  const m = UI.month || monthKey(today());
  const md = parse(m+'-01');
  const f = finMonth(m);
  const bal = f.inF - f.outF;
  const rate = f.inF>0 ? bal/f.inF : null;
  const srcRows = INCOME_SRC.map(([k,n])=>{ const fact=f.es.filter(e=>e.type==='in'&&(e.src||'other')===k).reduce((s,e)=>s+(e.amount||0),0); const plan=(f.b.income||{})[k]; return {k,n,fact,plan} });
  const catRows = EXP_CAT.map(c=>{ const fact=f.es.filter(e=>e.type==='out'&&e.cat===c).reduce((s,e)=>s+(e.amount||0),0); const plan=(f.b.expense||{})[c]; return {c,fact,plan} }).filter(r=>r.fact||r.plan);
  const lowR = isNum(L.exitLow)&&isNum(L.usdRate)&&isNum(L.exitShare) ? L.exitLow*L.usdRate*L.exitShare : null;
  const highR = isNum(L.exitHigh)&&isNum(L.usdRate)&&isNum(L.exitShare) ? L.exitHigh*L.usdRate*L.exitShare : null;
  const es = f.es.slice().sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,40);
  return `
  <div class="head"><div><h1 style="color:${dc('life')}">Личное</h1><p class="lede">Доходы из каждого бизнеса, расходы, сбережения и личные цели. Раздел виден только вам.</p></div>
   <div class="row"><a class="btn" href="#finplan">Финплан</a><button class="btn" data-act="editLife">Цели жизни</button><button class="btn primary" data-act="addEntry">Добавить операцию</button></div></div>
  <div class="stack">
   <div class="row" style="justify-content:space-between">
     <div class="pager"><button class="btn ghost" data-act="mprev" aria-label="Предыдущий месяц">←</button><b>${cap(MONTHS[md.getMonth()])} ${md.getFullYear()}</b><button class="btn ghost" data-act="mnext" aria-label="Следующий месяц">→</button></div>
     <button class="btn" data-act="editBudget" data-m="${m}">План месяца</button>
   </div>
   <section class="grid">
     ${tile('Доходы', rubS(f.inF), `план ${rubS(f.inP||null)}${isNum(L.incomeTarget)?' · цель '+rubS(L.incomeTarget):''}`, frac(f.inF, isNum(L.incomeTarget)?L.incomeTarget:f.inP), 'life')}
     ${tile('Расходы', rubS(f.outF), `план ${rubS(f.outP||null)}`, frac(f.outF,f.outP), 'life')}
     ${tile('Сальдо месяца', rubS(bal), bal<0?'расходы больше доходов':'остаётся на цели и капитал', null, 'life')}
     ${tile('Норма сбережений', pct(rate), `цель ${pct(L.savingsTarget)}`, frac(rate,L.savingsTarget), 'life')}
   </section>
   ${!f.es.length&&!f.inP&&!f.outP?`<div class="warnbox">За этот месяц нет ни плана, ни операций. Начните с «Плана месяца»: сколько ждёте от каждого бизнеса и сколько закладываете на расходы.</div>`:''}

   <section class="grid g2">
    <div class="sec"><div class="sec-h"><h2>Доход по источникам</h2></div>
     <div class="tablewrap"><table><thead><tr><th>Источник</th><th class="n">План</th><th class="n">Факт</th><th class="n">%</th></tr></thead><tbody>
      ${srcRows.map(r=>`<tr><td>${ALLDIR[r.k]?chip(r.k):esc(r.n)}</td><td class="n">${rub(r.plan)}</td><td class="n">${rub(r.fact||0)}</td><td class="n">${pct(frac(r.fact,r.plan))}</td></tr>`).join('')}
     </tbody></table></div>
     <p class="sub" style="margin:0">Личный доход из бизнеса = то, что направление может отдать без ущерба для роста. Если план личного дохода выше — бизнес-цель нужно поднимать.</p></div>
    <div class="sec"><div class="sec-h"><h2>Расходы по категориям</h2></div>
     ${catRows.length?`<div class="tablewrap"><table><thead><tr><th>Категория</th><th class="n">План</th><th class="n">Факт</th><th></th></tr></thead><tbody>
      ${catRows.map(r=>{ const over = isNum(r.plan)&&r.fact>r.plan; return `<tr><td>${esc(r.c)}</td><td class="n">${rub(r.plan)}</td><td class="n">${rub(r.fact)}</td><td>${over?'<span class="pill bad">перерасход</span>':''}</td></tr>`}).join('')}
     </tbody></table></div>`:'<div class="sub">Расходов и плана по категориям пока нет.</div>'}</div>
   </section>

   <section class="sec"><div class="sec-h"><h2>Личные цели</h2><button class="btn" data-act="addLGoal">Добавить цель</button></div>
    <div class="grid">
     <div class="card dir" style="--dc:${dc('sellerator')}"><div class="label">Капитал от продажи Sellerator</div><div class="big">${lowR!=null?rubS(lowR):'—'}</div><div class="sub">${highR!=null?'до '+rubS(highR)+' · доля '+pct(L.exitShare):'задайте параметры сделки'}</div><div class="sub" style="margin-top:6px">Связано с целью направления Sellerator</div></div>
     ${S.lgoals.sort((a,b)=>(a.deadline||'').localeCompare(b.deadline||'')).map(g=>{ const left = isNum(g.target)&&isNum(g.saved)?g.target-g.saved:null;
       const months = g.deadline ? Math.max(1, Math.round((parse(g.deadline)-today())/(30.4*864e5))) : null;
       return `<div class="card dir" style="--dc:${dc('life')}"><div class="row" style="justify-content:space-between"><div class="label">${esc(g.kind||'Цель')}</div><button class="btn ghost" data-act="editLGoal" data-id="${g.id}">Изменить</button></div>
        <h3 style="margin-top:4px">${esc(g.title)}</h3><div class="big">${rubS(g.saved||0)} <span class="sub">/ ${rubS(g.target)}</span></div>${bar(frac(g.saved,g.target),'life')}
        <div class="sub" style="margin-top:6px">${g.deadline?'до '+fmtDate(g.deadline):''}${left>0&&months?` · откладывать ≈${rubS(left/months)} в месяц`:''}</div></div>`}).join('')}
    </div>
    ${!S.lgoals.length?'<div class="sub">Добавьте цели: подушка безопасности, жильё, образование детей, пассивный доход. Для каждой посчитается, сколько откладывать в месяц.</div>':''}
   </section>

   <section class="sec"><div class="sec-h"><h2>Операции за месяц</h2><button class="btn" data-act="addEntry">Добавить операцию</button></div>
    ${es.length?`<div class="tablewrap"><table><thead><tr><th>Дата</th><th>Тип</th><th>Источник / категория</th><th class="n">Сумма</th><th>Комментарий</th><th></th></tr></thead><tbody>
     ${es.map(e=>`<tr><td class="num">${esc((e.date||'').split('-').reverse().join('.'))}</td><td>${e.type==='in'?'<span class="pill good">доход</span>':'<span class="pill mute">расход</span>'}</td><td>${e.type==='in'?(ALLDIR[e.src]?chip(e.src):esc((INCOME_SRC.find(x=>x[0]===e.src)||[,'Прочее'])[1])):esc(e.cat)}</td><td class="n">${rub(e.amount)}</td><td class="sub">${esc(e.note)}</td><td><button class="btn ghost" data-act="editEntry" data-id="${e.id}">Изменить</button></td></tr>`).join('')}
    </tbody></table></div>`:emptyBox('Операций за месяц нет. Вносите крупные доходы и расходы — достаточно раз в неделю.','addEntry')}
   </section>
  </div>`;
}


// ---------- ФИНПЛАН ----------
function assetIncome(a){ if(isNum(a.income)) return a.income; if(isNum(a.rate)&&isNum(a.value)) return a.value*a.rate/12; return 0 }
function finCalc(){
  const L = S.life || {};
  const A = S.assets.filter(a=>a.kind!=='liab'), Lb = S.assets.filter(a=>a.kind==='liab');
  const assets = A.reduce((s,a)=>s+(a.value||0),0);
  const liabs = Lb.reduce((s,a)=>s+(a.value||0),0);
  const inv = A.filter(a=>a.invest!==false);
  const invest = inv.reduce((s,a)=>s+(a.value||0),0);
  const passive = A.reduce((s,a)=>s+assetIncome(a),0);
  const payments = Lb.reduce((s,a)=>s+(a.payment||0),0);
  const wd = isNum(L.wdRate)&&L.wdRate>0 ? L.wdRate : null;
  const need = isNum(L.passiveTarget)&&wd ? L.passiveTarget*12/wd : null;
  const ret = isNum(L.expReturn) ? L.expReturn : wd;
  const P = isNum(L.monthlyInvest) ? L.monthlyInvest : 0;
  let reachMonths = null;
  if(need!=null){ if(invest>=need) reachMonths=0; else if(ret!=null && (P>0||ret>0)){ let c=invest, r=ret/12; for(let m=1;m<=600;m++){ c=c*(1+r)+P; if(c>=need){ reachMonths=m; break } } } }
  let needP = null, monthsLeft = null;
  if(need!=null && L.passiveDeadline){ monthsLeft = Math.max(1, Math.round((parse(L.passiveDeadline)-today())/(30.44*864e5)));
    const r=(ret||0)/12, g=Math.pow(1+r,monthsLeft); const gap = need - invest*g; needP = gap<=0 ? 0 : (r>0 ? gap*r/(g-1) : gap/monthsLeft) }
  return {L, A, Lb, assets, liabs, net:assets-liabs, invest, passive, payments, wd, need, ret, P, reachMonths, needP, monthsLeft};
}
function addMonths(n){ const d=today(); d.setMonth(d.getMonth()+n); return `${MONTHS[d.getMonth()]} ${d.getFullYear()}` }

function vFin(){
  if(S.owner===false) return `<div class="head"><div><h1>Финплан</h1></div></div>${emptyBox('Этот раздел виден только владельцу офиса.')}`;
  const c = finCalc(), L = c.L;
  const fP = frac(c.passive, L.passiveTarget), fC = frac(c.invest, c.need);
  const byCls = {};
  c.A.forEach(a=>{ const k=a.cls||'Прочее'; const o=(byCls[k] ||= {v:0,i:0,inv:a.invest!==false}); o.v+=a.value||0; o.i+=assetIncome(a) });
  const clsRows = Object.entries(byCls).sort((a,b)=>b[1].v-a[1].v);
  const snaps = S.snaps.slice().sort((a,b)=>a.id.localeCompare(b.id));
  const goalTxt = !isNum(L.passiveTarget) ? null : [
    `Цель — ${rub(L.passiveTarget)} пассивного дохода в месяц${L.passiveDeadline?' к '+fmtDate(L.passiveDeadline):''}.`,
    c.need!=null ? `При доходности капитала ${pct(c.wd)} годовых для этого нужен капитал ${rubS(c.need)}; сейчас в инвестициях ${rubS(c.invest)} (${pct(fC)}).` : 'Задайте доходность капитала, чтобы посчитать нужный капитал.',
    c.reachMonths===0 ? 'Капитала уже достаточно.' : c.reachMonths!=null ? `При взносах ${rubS(c.P)} в месяц и доходности ${pct(c.ret)} цель достигается примерно в ${addMonths(c.reachMonths)}.` : (c.need!=null?'При текущих взносах цель не достигается за 50 лет — увеличьте взносы или доходность.':''),
    c.needP!=null ? (c.needP===0 ? 'К сроку цель достигается и без новых взносов.' : `Чтобы успеть к сроку, нужно инвестировать ≈${rubS(c.needP)} в месяц${c.P?` (сейчас в плане ${rubS(c.P)})`:''}.`) : ''
  ].filter(Boolean).join(' ');
  return `
  <div class="head"><div><h1 style="color:${dc('life')}">Финансовый план</h1><p class="lede">Активы, обязательства и путь к пассивному доходу, который покрывает выбранный образ жизни. Раздел виден только вам.</p></div>
   <div class="row"><button class="btn" data-act="editFP">Цель и параметры</button><button class="btn" data-act="addLiab">Добавить обязательство</button><button class="btn primary" data-act="addAsset">Добавить актив</button></div></div>
  <div class="stack">
   <section class="grid">
     ${tile('Пассивный доход в месяц', rubS(c.passive), `цель ${rubS(L.passiveTarget)} · выполнено ${pct(fP)}`, fP, 'life')}
     ${tile('Капитал для цели', rubS(c.invest), `нужно ${rubS(c.need)} · выполнено ${pct(fC)}`, fC, 'life')}
     ${tile('Чистый капитал', rubS(c.net), `активы ${rubS(c.assets)} − долги ${rubS(c.liabs)}`, null, 'life')}
     ${tile('Платежи по долгам', rubS(c.payments), c.assets>0?`долги к активам ${pct(c.liabs/c.assets)}`:'в месяц', null, 'life')}
   </section>
   ${goalTxt?`<div class="warnbox" style="border-color:${dc('life')}">${goalTxt}</div>`:`<div class="warnbox">Цель по пассивному доходу не задана. Нажмите «Цель и параметры»: сумма в месяц, срок и доходность капитала — от них считается нужный капитал и ежемесячный взнос.</div>`}
   ${L.fpNote?`<div class="card"><div class="label">Стратегия</div><div class="vision">${esc(L.fpNote)}</div></div>`:''}

   <section class="sec"><div class="sec-h"><h2>Инвестиции по классам</h2><span class="sub">«Капитал для цели» — только активы с отметкой «учитывать»</span></div>
    ${clsRows.length?`<div class="tablewrap"><table><thead><tr><th>Класс</th><th class="n">Стоимость</th><th class="n">Доля</th><th class="n">Доход в месяц</th><th class="n">Доходность</th></tr></thead><tbody>
     ${clsRows.map(([k,o])=>`<tr><td>${esc(k)}</td><td class="n">${rub(o.v)}</td><td class="n">${pct(frac(o.v,c.assets))}</td><td class="n">${rub(o.i)}</td><td class="n">${o.v>0&&o.i>0?pct(o.i*12/o.v):'—'}</td></tr>`).join('')}
     <tr><td><b>Итого</b></td><td class="n"><b>${rub(c.assets)}</b></td><td class="n">100%</td><td class="n"><b>${rub(c.passive)}</b></td><td class="n">${c.assets>0&&c.passive>0?pct(c.passive*12/c.assets):'—'}</td></tr>
    </tbody></table></div>`:emptyBox('Активов пока нет. Внесите вклады, облигации, акции, фонды, недвижимость, доли в бизнесе — со стоимостью и доходом в месяц.','addAsset')}
   </section>

   ${c.A.length?`<section class="sec"><div class="sec-h"><h2>Активы</h2><button class="btn" data-act="addAsset">Добавить актив</button></div>
    <div class="tablewrap"><table><thead><tr><th>Актив</th><th>Класс</th><th class="n">Стоимость</th><th class="n">Доход в месяц</th><th class="n">Доходность</th><th>В капитале цели</th><th>Обновлено</th><th></th></tr></thead><tbody>
    ${c.A.sort((a,b)=>(b.value||0)-(a.value||0)).map(a=>`<tr><td><b>${esc(a.name)}</b>${a.note?`<div class="sub">${esc(a.note)}</div>`:''}</td><td class="sub">${esc(a.cls)}</td><td class="n">${rub(a.value)}</td><td class="n">${rub(assetIncome(a))}</td><td class="n">${isNum(a.rate)?pct(a.rate):(a.value>0&&assetIncome(a)>0?pct(assetIncome(a)*12/a.value):'—')}</td><td>${a.invest!==false?'<span class="pill good">да</span>':'<span class="pill mute">нет</span>'}</td><td class="sub" style="white-space:nowrap">${fmtDate(a.updated)}</td><td><button class="btn ghost" data-act="editAsset" data-id="${a.id}">Изменить</button></td></tr>`).join('')}
    </tbody></table></div></section>`:''}

   <section class="sec"><div class="sec-h"><h2>Обязательства</h2><button class="btn" data-act="addLiab">Добавить обязательство</button></div>
    ${c.Lb.length?`<div class="tablewrap"><table><thead><tr><th>Обязательство</th><th>Тип</th><th class="n">Остаток</th><th class="n">Ставка</th><th class="n">Платёж в месяц</th><th>Погашение</th><th></th></tr></thead><tbody>
    ${c.Lb.sort((a,b)=>(b.rate||0)-(a.rate||0)).map(a=>`<tr><td><b>${esc(a.name)}</b>${a.note?`<div class="sub">${esc(a.note)}</div>`:''}</td><td class="sub">${esc(a.cls)}</td><td class="n">${rub(a.value)}</td><td class="n">${pct(a.rate)}</td><td class="n">${rub(a.payment)}</td><td class="sub" style="white-space:nowrap">${fmtDate(a.until)}</td><td><button class="btn ghost" data-act="editLiab" data-id="${a.id}">Изменить</button></td></tr>`).join('')}
    </tbody></table></div><p class="sub" style="margin:0">Долги отсортированы по ставке: досрочно гасить выгоднее сверху вниз, если ставка выше доходности инвестиций.</p>`:'<div class="sub">Обязательств нет или они не внесены.</div>'}
   </section>

   <section class="sec"><div class="sec-h"><h2>Динамика по месяцам</h2><button class="btn" data-act="snap">Зафиксировать ${MONTHS[today().getMonth()]}</button></div>
    ${snaps.length>=2?`<div class="grid g2">${spark(snaps,'net','Чистый капитал')}${spark(snaps,'passive','Пассивный доход в месяц')}</div>`:
      `<div class="sub">${snaps.length?'Зафиксирован 1 месяц. График появится со второго.':'Раз в месяц фиксируйте положение дел — здесь появится график чистого капитала и пассивного дохода.'}</div>`}
   </section>
  </div>`;
}
function spark(rows, key, label){
  const W=520,H=150,pl=8,pr=8,pt=24,pb=26;
  const vals=rows.map(r=>r[key]||0), mn=Math.min(0,...vals), mx=Math.max(...vals,1);
  const x=i=>pl+(rows.length===1?0:i*(W-pl-pr)/(rows.length-1)), y=v=>pt+(H-pt-pb)*(1-(v-mn)/(mx-mn||1));
  const pts=vals.map((v,i)=>`${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const last=vals[vals.length-1], first=rows[0].id, lastId=rows[rows.length-1].id;
  const ml = id => { const d=parse(id+'-01'); return MONTHS[d.getMonth()].slice(0,3)+' '+String(d.getFullYear()).slice(2) };
  return `<div class="card"><div class="label">${label}</div><div class="big">${rubS(last)}</div>
   <svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${label} по месяцам" style="display:block;margin-top:6px">
    <line x1="${pl}" x2="${W-pr}" y1="${y(mn)}" y2="${y(mn)}" stroke="var(--line)" />
    <polygon points="${x(0)},${y(mn)} ${pts} ${x(vals.length-1)},${y(mn)}" fill="var(--c-life)" fill-opacity=".12" />
    <polyline points="${pts}" fill="none" stroke="var(--c-life)" stroke-width="2" />
    <circle cx="${x(vals.length-1)}" cy="${y(last)}" r="4" fill="var(--c-life)" />
    <text x="${pl}" y="${H-6}" font-size="12" fill="var(--muted)">${ml(first)}</text>
    <text x="${W-pr}" y="${H-6}" font-size="12" fill="var(--muted)" text-anchor="end">${ml(lastId)}</text>
   </svg></div>`;
}



// ---------- ИСТОЧНИКИ ДАННЫХ ----------
const SRC_ST = ['Не подключено','Настройка','Работает','Ошибка'];
const stCls = s => s==='Работает'?'good':s==='Настройка'?'warn':s==='Ошибка'?'bad':'mute';
function fmtTs(t){ if(!t) return '—'; const d=new Date(t); if(isNaN(d)) return esc(t); return `${d.getDate()} ${MONTHS_G[d.getMonth()]}, ${pad(d.getHours())}:${pad(d.getMinutes())}` }
function vSources(){
  const C = S.srcCfg || {};
  const list = S.sources.slice().sort((a,b)=>(a.order||9)-(b.order||9));
  const box = (t,s,cls='') => `<div class="card ${cls}" style="padding:12px"><div style="font-weight:600">${t}</div><div class="sub">${s}</div></div>`;
  const arrow = '<div class="sub" style="align-self:center;text-align:center;font-size:20px" aria-hidden="true">→</div>';
  const recent = S.weeks.filter(w=>w.src).sort((a,b)=>b.week.localeCompare(a.week)).slice(0,6);
  return `
  <div class="head"><div><h1>Источники данных</h1><p class="lede">Откуда Штаб берёт цифры. Все источники сводятся в одну Google-таблицу; каждое утро Claude читает её и обновляет метрики недели, цели «авто» и финансы направлений.</p></div></div>
  <div class="stack">
   <section class="sec"><h2>Как текут данные</h2>
    <div style="overflow-x:auto"><div style="display:grid;grid-template-columns:minmax(170px,1fr) 28px minmax(170px,1fr) 28px minmax(170px,1fr) 28px minmax(170px,1fr);gap:8px;min-width:760px">
     <div class="stack" style="gap:8px">${box('amoCRM','сделки, этапы, источники')}${box('Финучёт','Google Таблица: выручка, расходы')}${box('Яндекс Директ','расход, клики, конверсии')}${box('Яндекс Метрика','визиты, цели, регистрации')}</div>
     ${arrow}
     <div style="align-self:center">${box('Хаб «Штаб · данные»','одна Google-таблица, листы deals, ads_daily, web_daily, finance_monthly')}</div>
     ${arrow}
     <div style="align-self:center">${box('Синхронизация Claude','каждый день 08:40 МСК: читает хаб, считает недели и месяцы')}</div>
     ${arrow}
     <div class="stack" style="gap:8px">${box('Ритм','заявки, встречи, продажи — авто')}${box('Направления','неделя план/факт, реклама, цена заявки и клиента')}${box('Финансы','выручка, расходы, прибыль по месяцам')}</div>
    </div></div>
   </section>

   <section class="grid">
    <div class="card"><div class="label">Хаб данных</div>
      <div style="margin-top:6px">${C.hubUrl?`<a href="${esc(C.hubUrl)}" target="_blank" rel="noopener">Открыть «${esc(C.hubTitle||'Штаб · данные')}»</a>`:'<span class="sub">Ссылка не задана</span>'}</div>
      <div class="sub" style="margin-top:6px">Правила заполнения — на листе README.</div>
      <div style="margin-top:10px"><button class="btn" data-act="editHub">Изменить ссылку</button></div></div>
    <div class="card"><div class="label">Последняя синхронизация</div>
      <div class="big" style="font-size:20px">${fmtTs(C.lastSync)}</div>
      <div class="sub">${esc(C.lastResult||'Ещё не запускалась. Первый запуск — завтра в 08:40 или по просьбе в чате.')}</div></div>
    <div class="card"><div class="label">Подключено источников</div>
      <div class="big">${list.filter(x=>x.status==='Работает').length} <span class="sub">из ${list.length}</span></div>
      <div class="row" style="margin-top:6px">${SRC_ST.map(st=>{ const n=list.filter(x=>(x.status||'Не подключено')===st).length; return n?`<span class="pill ${stCls(st)}">${st}: ${n}</span>`:'' }).join('')}</div></div>
   </section>

   <section class="sec"><h2>Источники</h2>
    ${list.length?`<div class="grid g2">${list.map(srcCard).join('')}</div>`:emptyBox('Источники ещё не описаны.')}
   </section>

   <section class="sec"><h2>Что Штаб считает из этих данных</h2>
    <div class="tablewrap"><table><thead><tr><th>Показатель</th><th>Как считается</th><th>Источник</th><th>Где виден</th></tr></thead><tbody>
     <tr><td>Заявки, встречи, продажи за неделю</td><td>сделки по дате создания, дате встречи и дате оплаты</td><td>amoCRM → deals</td><td>Ритм, неделя направления</td></tr>
     <tr><td>Новая выручка</td><td>сумма чеков выигранных за неделю сделок</td><td>amoCRM → deals</td><td>метрики недели</td></tr>
     <tr><td>Конверсия заявка → встреча → оплата</td><td>встречи ÷ заявки, продажи ÷ встречи</td><td>amoCRM</td><td>пятничное ретро</td></tr>
     <tr><td>Цена заявки (CPL)</td><td>расход Директа ÷ заявки</td><td>Директ + amoCRM</td><td>метрики недели</td></tr>
     <tr><td>Цена клиента (CAC)</td><td>расход Директа ÷ продажи</td><td>Директ + amoCRM</td><td>метрики недели</td></tr>
     <tr><td>Конверсия сайта, регистрации</td><td>цели ÷ визиты</td><td>Метрика</td><td>метрики недели, тест прямой регистрации</td></tr>
     <tr><td>Выручка, расходы, прибыль, маржа</td><td>помесячно по направлениям</td><td>Финучёт → finance_monthly</td><td>плитки направлений</td></tr>
    </tbody></table></div>
    <p class="sub" style="margin:0">Синхронизация не трогает то, что внесено руками: план сделок, заметки и ручной факт целей остаются. Метрики, пришедшие из хаба, помечены в таблице недель меткой «хаб».</p>
   </section>

   ${recent.length?`<section class="sec"><h2>Последние недели из хаба</h2>${weeksTable(recent,true)}</section>`:''}
  </div>`;
}
function srcCard(x){
  const steps = Array.isArray(x.steps) ? x.steps : [];
  const done = x.done || {};
  const n = steps.filter((_,i)=>done[i]).length;
  return `<div class="card">
    <div class="row" style="justify-content:space-between"><h3>${esc(x.name)}</h3><span class="pill ${stCls(x.status)}">${esc(x.status||'Не подключено')}</span></div>
    <div class="sub" style="margin-top:4px">${esc(x.gives)}</div>
    <div class="kv" style="margin-top:10px;font-size:14px">
      <span class="sub">Питает</span><span>${esc(x.feeds)}</span>
      <span class="sub">Сейчас</span><span>${esc(x.methodNow)}</span>
      <span class="sub">Потом</span><span>${esc(x.methodNext)}</span>
      <span class="sub">Отвечает</span><span>${esc(x.owner||'—')}</span>
      <span class="sub">Данные</span><span>${x.lastSync?fmtTs(x.lastSync):'ещё не поступали'}</span>
    </div>
    <div class="mline" style="margin-top:12px"><span class="label">Шаги подключения</span><span class="sub num">${n}/${steps.length}</span></div>
    ${bar(steps.length?n/steps.length:0,'sellerator')}
    <div style="display:flex;flex-direction:column;gap:6px;margin-top:8px">
     ${steps.map((st,i)=>`<label class="row" style="gap:8px;flex-wrap:nowrap;align-items:flex-start;font-size:14px"><input type="checkbox" ${done[i]?'checked':''} data-act="srcStep" data-id="${x.id}" data-i="${i}" style="margin-top:3px"><span style="${done[i]?'color:var(--muted);text-decoration:line-through':''}">${esc(st)}</span></label>`).join('')}
    </div>
    ${x.note?`<div class="sub" style="margin-top:8px">${esc(x.note)}</div>`:''}
    <div class="row" style="margin-top:10px"><button class="btn ghost" data-act="editSrc" data-id="${x.id}">Статус и заметка</button></div>
  </div>`;
}

// ---------- текст для Telegram ----------
function goalLine(g, withFact){
  const f = goalFact(g), p = goalProgress(g);
  return `• ${g.title} — ${fmtU(g.target,g.unit)}` + (withFact && f!=null ? ` (факт ${fmtU(f,g.unit)}${p!=null?', '+Math.round(p*100)+'%':''})` : '') + (g.owner?` · ${g.owner}`:'');
}
function weekText(key, dirF, group){
  const inDir = x => dirF==='all' || x.dir===dirF;
  const d = parse(key);
  const started = today() >= d;
  const gs = S.goals.filter(g=>g.horizon==='week'&&g.period===key&&inDir(g)).sort((a,b)=>(a.dir||'').localeCompare(b.dir||'')||(a.okr||'').localeCompare(b.okr||''));
  const ts = S.tasks.filter(t=>t.horizon==='week'&&t.date===key&&inDir(t)).sort(byPrio);
  const L = [`📋 План недели ${plabel('week',d)}${dirF!=='all'?' · '+ALLDIR[dirF].name:''}`];
  if(gs.length){ L.push('', '🎯 Цели недели:'); gs.forEach(g=>L.push((dirF==='all'?`[${ALLDIR[g.dir]?ALLDIR[g.dir].short:''}] `:'')+goalLine(g, started))) }
  if(ts.length){
    const gk = group==='owner' ? (t=>t.owner||'Без исполнителя') : (t=>t.cat||'Без категории');
    const order = group==='owner' ? OWNERS : CATS;
    [...new Set(ts.map(gk))].sort((a,b)=>((order.indexOf(a)+1)||99)-((order.indexOf(b)+1)||99)).forEach(gname=>{
      L.push('', `▸ ${gname}:`);
      ts.filter(t=>gk(t)===gname).forEach(t=>L.push(`${t.done?'✅':'☐'} ${t.prio==1?'[P1] ':''}${t.title}${group!=='owner'&&t.owner?' — '+t.owner:''}${group==='owner'&&t.cat?' ('+t.cat+')':''}`));
    });
    const dn = ts.filter(t=>t.done).length, p1 = ts.filter(t=>t.prio==1);
    if(started) L.push('', `Сделано ${dn} из ${ts.length}${p1.length?` · P1: ${p1.filter(t=>t.done).length} из ${p1.length}`:''}`);
  }
  if(!gs.length && !ts.length) L.push('', 'План на неделю пока не заполнен.');
  return L.join('\n');
}
function rhythmText(dirF){
  const inDir = x => dirF==='all' || x.dir===dirF;
  const now = today();
  const L = [`📊 Ритм на ${plabel('day',now)}${dirF!=='all'?' · '+ALLDIR[dirF].name:''}`];
  ['week','month','quarter','year'].forEach(h=>{
    const key = pkey(h,now), e = elapsed(h,now);
    const gs = S.goals.filter(g=>g.horizon===h&&g.period===key&&inDir(g)).sort((a,b)=>(a.dir||'').localeCompare(b.dir||'')||(a.okr||'').localeCompare(b.okr||''));
    if(!gs.length) return;
    L.push('', `${HZN[h]} · ${plabel(h,now)} (прошло ${pct(e)}):`);
    gs.forEach(g=>{ const [cls,txt]=paceStatus(g,e); const ic = cls==='good'?'🟢':cls==='warn'?'🟡':cls==='bad'?'🔴':'⚪';
      L.push(`${ic} ${dirF==='all'&&ALLDIR[g.dir]?'['+ALLDIR[g.dir].short+'] ':''}${g.title}: ${fmtU(goalFact(g),g.unit)} из ${fmtU(g.target,g.unit)} — ${txt}`) });
  });
  if(L.length===1) L.push('', 'Целей в цифрах пока нет.');
  return L.join('\n');
}
function copyText(title, text){
  const fallback = () => showText(title, text, 'Не удалось скопировать автоматически. Текст выделен — нажмите Ctrl+C или «Копировать» в меню.');
  try{
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(()=>toast('Скопировано — вставьте в Telegram'), fallback);
    } else fallback();
  }catch(e){ fallback() }
}
function showText(title, text, note){
  const root = document.getElementById('modalroot');
  root.innerHTML = `<div class="overlay" data-close="1"><div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="row" style="justify-content:space-between"><h2>${esc(title)}</h2><button type="button" class="btn ghost" data-close="1">Закрыть</button></div>
    ${note?`<div class="sub">${esc(note)}</div>`:''}
    <textarea id="tgtext" readonly style="width:100%;min-height:320px;border:1px solid var(--line);border-radius:8px;padding:10px;background:var(--bg);font-family:var(--f-body);font-size:14px">${esc(text)}</textarea>
    <div class="row" style="justify-content:flex-end"><button type="button" class="btn primary" id="tgcopy">Скопировать</button></div></div></div>`;
  const ta = root.querySelector('#tgtext'); ta.focus(); ta.select();
  root.querySelector('.overlay').addEventListener('click', e=>{ if(e.target.dataset.close) root.innerHTML='' });
  root.querySelector('#tgcopy').addEventListener('click', ()=>{
    ta.select();
    try{ navigator.clipboard.writeText(text).then(()=>{ toast('Скопировано — вставьте в Telegram'); root.innerHTML='' }, ()=>{ try{ document.execCommand('copy'); toast('Скопировано') }catch(e){ toast('Выделите текст и скопируйте вручную') } }) }
    catch(e){ try{ document.execCommand('copy'); toast('Скопировано') }catch(_){ toast('Выделите текст и скопируйте вручную') } }
  });
}

// ---------- формы ----------
function openForm({title, fields, data={}, onSave, onDelete}){
  const root = document.getElementById('modalroot');
  const val = f => { let v = data[f.k]; if(f.type==='pct'&&isNum(v)) v=Math.round(v*1000)/10; return v??(f.def??'') };
  root.innerHTML = `<div class="overlay" data-close="1"><form class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="row" style="justify-content:space-between"><h2>${esc(title)}</h2><button type="button" class="btn ghost" data-close="1">Закрыть</button></div>
    <div class="fgrid">${fields.map(f=>{ const id='f_'+f.k; const lab=`<label for="${id}">${esc(f.label)}</label>`; const v=val(f);
      if(f.type==='section') return `<div class="f wide"><div class="label" style="margin-top:6px">${esc(f.label)}</div></div>`;
      if(f.type==='select') return `<div class="f ${f.wide?'wide':''}">${lab}<select id="${id}" name="${f.k}">${f.options.map(o=>{const [ov,on]=Array.isArray(o)?o:[o,o]; return `<option value="${esc(ov)}" ${String(v)===String(ov)?'selected':''}>${esc(on)}</option>`}).join('')}</select></div>`;
      if(f.type==='textarea') return `<div class="f wide">${lab}<textarea id="${id}" name="${f.k}">${esc(v)}</textarea></div>`;
      if(f.type==='check') return `<div class="f"><label><input type="checkbox" id="${id}" name="${f.k}" ${v?'checked':''}> ${esc(f.label)}</label></div>`;
      const t = f.type==='date'?'date':f.type==='month'?'month':'text';
      const im = ['number','pct'].includes(f.type)?'inputmode="decimal"':'';
      return `<div class="f ${f.wide?'wide':''}">${lab}<input id="${id}" name="${f.k}" type="${t}" ${im} value="${esc(v)}" ${f.list?`list="dl_${f.k}"`:''} ${f.req?'required':''}>${f.list?`<datalist id="dl_${f.k}">${f.list.map(o=>`<option value="${esc(o)}">`).join('')}</datalist>`:''}${f.hint?`<span class="sub">${esc(f.hint)}</span>`:''}</div>`;
    }).join('')}</div>
    <div class="row" style="justify-content:space-between">
      <div>${onDelete?'<button type="button" class="btn danger" data-del="1">Удалить</button>':''}</div>
      <div class="row"><button type="button" class="btn" data-close="1">Отмена</button><button type="submit" class="btn primary">Сохранить</button></div>
    </div></form></div>`;
  const form = root.querySelector('form');
  const first = form.querySelector('input,select,textarea'); if(first) first.focus();
  const close = () => { root.innerHTML=''; if(pending) render() };
  root.querySelector('.overlay').addEventListener('click', e=>{ if(e.target.dataset.close) close() });
  root.addEventListener('keydown', e=>{ if(e.key==='Escape') close() }, {once:true});
  const delBtn = form.querySelector('[data-del]');
  if(delBtn) delBtn.addEventListener('click', async ()=>{
    if(!delBtn.dataset.sure){ delBtn.dataset.sure='1'; delBtn.textContent='Точно удалить?'; return }
    if(await onDelete()) { close(); toast('Удалено') }
  });
  form.addEventListener('submit', async e=>{
    e.preventDefault();
    const out = {};
    for(const f of fields){ if(f.type==='section') continue;
      const el = form.elements[f.k];
      if(f.type==='check'){ out[f.k]=el.checked; continue }
      let v = el.value.trim();
      if(f.type==='number'||f.type==='pct'){ v = v==='' ? null : Number(v.replace(/\s/g,'').replace(',','.')); if(v!==null&&!isFinite(v)){ toast(`Поле «${f.label}»: нужно число`); return } if(f.type==='pct'&&v!==null) v=v/100 }
      out[f.k] = v===''?null:v;
    }
    const btn = form.querySelector('[type=submit]'); btn.disabled=true; btn.textContent='Сохраняю…';
    if(await onSave(out)){ close(); toast('Сохранено') } else { btn.disabled=false; btn.textContent='Сохранить' }
  });
}
const clean = o => Object.fromEntries(Object.entries(o).filter(([,v])=>v!==null&&v!==undefined));
const dirOpts = [['sellerator','Sellerator'],['agency','Агентство ITIS'],['courses','Курсы']];

const F = {
  goal: [
    {k:'title',label:'Цель / ключевой результат',wide:true,req:true},
    {k:'dir',label:'Направление',type:'select',options:dirOpts},
    {k:'okr',label:'Группа (Objective)',list:[]},
    {k:'horizon',label:'Горизонт',type:'select',options:[['year','Год'],['quarter','Квартал'],['month','Месяц'],['week','Неделя']]},
    {k:'period',label:'Период',hint:'2026 · 2026-Q4 · 2026-10 · неделя: дата понедельника 2026-10-05'},
    {k:'metric',label:'Откуда брать факт',type:'select',options:METRICS,wide:true},
    {k:'unit',label:'Единица',type:'select',options:[['','шт.'],['₽','₽'],['%','%']]},
    {k:'owner',label:'Владелец',list:OWNERS},
    {k:'base',label:'База',type:'number'},{k:'target',label:'Цель',type:'number'},
    {k:'fact',label:'Факт',type:'number'},{k:'deadline',label:'Срок',hint:'например 31.12.2026'},
  ],
  task: [
    {k:'title',label:'Задача',wide:true,req:true},
    {k:'dir',label:'Направление',type:'select',options:dirOpts},
    {k:'owner',label:'Исполнитель',list:OWNERS},
    {k:'cat',label:'Раздел',type:'select',options:CATS},{k:'prio',label:'Приоритет',type:'select',options:[['1','P1 — главное'],['2','P2 — важное'],['3','P3 — если успеем']]},
    {k:'est',label:'Оценка, часов',type:'number'},
    {k:'horizon',label:'Горизонт',type:'select',options:[['week','Неделя'],['day','День']]},
    {k:'date',label:'Неделя (понедельник) или день',type:'date'},
    {k:'goal',label:'К какой цели ведёт',wide:true},
    {k:'done',label:'Сделано',type:'check'},
  ],
  week: [
    {k:'dir',label:'Направление',type:'select',options:dirOpts},{k:'week',label:'Неделя (понедельник)',type:'date'},
    {k:'leads',label:'Заявки',type:'number'},{k:'meetings',label:'Встречи / демо',type:'number'},
    {k:'dealsPlan',label:'Сделки — план',type:'number'},{k:'deals',label:'Сделки — факт',type:'number'},
    {k:'newRev',label:'Новая выручка в месяц, ₽',type:'number'},{k:'clients',label:'Клиентов на конец недели',type:'number'},
    {k:'revenue',label:'Выручка / MRR на конец недели, ₽',type:'number'},
    {k:'adCost',label:'Расход на рекламу, ₽',type:'number'},{k:'visits',label:'Визиты на сайт',type:'number'},
    {k:'note',label:'Заметка: что помешало, что меняем',type:'textarea'},
  ],
  decision: [
    {k:'date',label:'Дата',type:'date'},{k:'dir',label:'Направление',type:'select',options:dirOpts},
    {k:'text',label:'Решение',type:'textarea'},{k:'why',label:'Почему',type:'textarea'},{k:'review',label:'Когда пересмотреть',wide:true},
  ],
  assistant: [
    {k:'name',label:'Название',req:true},{k:'dir',label:'Направление',type:'select',options:dirOpts},
    {k:'stage',label:'Этап плана / воронки'},{k:'platform',label:'Платформа'},
    {k:'does',label:'Что делает',type:'textarea'},
    {k:'wave',label:'Волна',list:['Волна 1 (IV кв. 2026)','Волна 2 (I кв. 2027)']},{k:'owner',label:'Владелец',list:OWNERS},
    {k:'buildH',label:'Часов на сборку',type:'number'},{k:'saveH',label:'Экономит, ч/нед',type:'number'},
    {k:'deadline',label:'Срок',type:'date'},{k:'status',label:'Статус',type:'select',options:['Не начат','Сборка','В работе','Отложен']},
  ],
  dir: [
    {k:'north',label:'Стратегическая формула направления',type:'textarea'},
    {type:'section',label:'Сейчас'},
    {k:'clients',label:'Платящих клиентов',type:'number'},{k:'check',label:'Средний чек, ₽',type:'number'},
    {k:'revenue',label:'Выручка в месяц, ₽',type:'number',hint:'пусто = клиенты × чек'},{k:'costs',label:'Расходы в месяц, ₽',type:'number'},
    {k:'margin',label:'Маржинальность, %',type:'pct',hint:'пусто = считается из выручки и расходов'},{k:'share',label:'Ваша доля в бизнесе, %',type:'pct'},
    {type:'section',label:'Цель'},
    {k:'tClients',label:'Клиентов',type:'number'},{k:'tCheck',label:'Средний чек, ₽',type:'number'},
    {k:'tRevenue',label:'Выручка в месяц, ₽',type:'number',hint:'пусто = клиенты × чек'},{k:'tMargin',label:'Маржинальность, %',type:'pct'},
    {k:'tDeadline',label:'Срок цели',type:'date'},{k:'revLabel',label:'Как называть выручку',list:['MRR','Выручка в месяц']},
    {k:'note',label:'Примечание',type:'textarea'},
  ],
  life: [
    {k:'vision',label:'Образ жизни, ради которого всё это',type:'textarea'},
    {k:'incomeTarget',label:'Цель личного дохода в месяц, ₽',type:'number'},{k:'savingsTarget',label:'Цель нормы сбережений, %',type:'pct'},
    {type:'section',label:'Сделка по Sellerator'},
    {k:'exitLow',label:'Оценка, нижняя, $',type:'number'},{k:'exitHigh',label:'Оценка, верхняя, $',type:'number'},
    {k:'exitShare',label:'Ваша доля, %',type:'pct'},{k:'usdRate',label:'Курс, ₽ за $',type:'number'},
  ],
  entry: [
    {k:'type',label:'Тип',type:'select',options:[['out','Расход'],['in','Доход']]},{k:'date',label:'Дата',type:'date'},
    {k:'amount',label:'Сумма, ₽',type:'number',req:true},
    {k:'src',label:'Источник дохода',type:'select',options:INCOME_SRC},
    {k:'cat',label:'Категория расхода',type:'select',options:EXP_CAT},
    {k:'note',label:'Комментарий',wide:true},
  ],
  fp: [
    {k:'passiveTarget',label:'Цель пассивного дохода в месяц, ₽',type:'number'},{k:'passiveDeadline',label:'Срок цели',type:'date'},
    {k:'wdRate',label:'Доходность капитала для расчёта цели, % годовых',type:'pct',hint:'какой % в год капитал отдаёт без проедания'},
    {k:'expReturn',label:'Ожидаемая доходность портфеля, % годовых',type:'pct',hint:'для прогноза роста; пусто = как выше'},
    {k:'monthlyInvest',label:'Плановые инвестиции в месяц, ₽',type:'number'},
    {k:'fpNote',label:'Стратегия: куда инвестируем и почему',type:'textarea'},
  ],
  asset: [
    {k:'name',label:'Название',wide:true,req:true},{k:'cls',label:'Класс',type:'select',options:ASSET_CLS},
    {k:'value',label:'Стоимость сейчас, ₽',type:'number'},{k:'income',label:'Пассивный доход в месяц, ₽',type:'number',hint:'пусто = из доходности'},
    {k:'rate',label:'Доходность, % годовых',type:'pct'},{k:'invest',label:'Учитывать в капитале для пассивного дохода',type:'check',def:true},
    {k:'note',label:'Комментарий',wide:true},
  ],
  liab: [
    {k:'name',label:'Название',wide:true,req:true},{k:'cls',label:'Тип',type:'select',options:LIAB_CLS},
    {k:'value',label:'Остаток долга, ₽',type:'number'},{k:'rate',label:'Ставка, % годовых',type:'pct'},
    {k:'payment',label:'Платёж в месяц, ₽',type:'number'},{k:'until',label:'Дата погашения',type:'date'},
    {k:'note',label:'Комментарий',wide:true},
  ],
  lgoal: [
    {k:'title',label:'Цель',wide:true,req:true},{k:'kind',label:'Тип',list:['Капитал','Безопасность','Жильё','Семья','Образование','Здоровье','Опыт и отдых']},
    {k:'deadline',label:'Срок',type:'date'},{k:'target',label:'Нужная сумма, ₽',type:'number'},{k:'saved',label:'Накоплено, ₽',type:'number'},
    {k:'note',label:'Зачем и как',type:'textarea'},
  ],
};

const find = (arr,id) => arr.find(x=>x.id===id);
const ACT = {
  hz: d => { UI.hz=d.v; persist(); render() },
  dwk: d => { const n=Number(d.n); UI.dwk = n===0 ? null : iso(shift('week', UI.dwk?parse(UI.dwk):today(), n)); persist(); render() },
  gotoWeekOf: d => { UI.hz='week'; UI.cur=d.week; persist() },
  tgWeek: d => copyText('План недели для Telegram', weekText(d.week, d.dir||'all', UI.group==='owner'?'owner':'cat')),
  tgWeekView: d => showText('План недели для Telegram', weekText(d.week, d.dir||'all', UI.group==='owner'?'owner':'cat')),
  tgRhythm: () => copyText('Ритм для Telegram', rhythmText(UI.dir||'all')),
  tgRhythmView: () => showText('Ритм для Telegram', rhythmText(UI.dir||'all')),
  dayOwner: d => { UI.dayOwner=d.v; persist(); render() },
  toDay: async d => { const t=find(S.tasks,d.id); if(!t) return;
    const own = UI.dayOwner||'Марат';
    const used = S.tasks.filter(x=>((x.horizon==='day'&&x.date===d.day)||(x.horizon==='week'&&x.day===d.day)) && (own==='all'||x.owner===own)).reduce((a,x)=>a+estOf(x),0);
    if(await patch('tasks/'+t.id,{day:d.day})){
      const b=dayBudget(own); if(used+estOf(t)>b+1e-9) toast(`Добавлено, но день перегружен: ${hrs(used+estOf(t))} из ${hrs(b)}`); else if(!isNum(t.est)) toast('Добавлено. Поставьте оценку в часах'); else toast('Добавлено в план дня') } },
  fromDay: async d => { if(await patch('tasks/'+d.id,{day:null})) toast('Убрано из плана дня') },
  editTeam: () => { const h=teamHours();
    const fields=[{type:'section',label:'Часов в неделю на эту работу'}, ...OWNERS.map(o=>({k:'h_'+o,label:o,type:'number'})), {k:'days',label:'Рабочих дней в неделе',type:'number'}];
    const data={days:workDays()}; OWNERS.forEach(o=>data['h_'+o]=h[o]);
    openForm({title:'Часы команды', fields, data, onSave: v => { const hours={}; OWNERS.forEach(o=>{ if(isNum(v['h_'+o])) hours[o]=v['h_'+o] }); return put('settings/team',{hours, days:isNum(v.days)&&v.days>0?v.days:5}) }}) },
  srcStep: async d => { const x=find(S.sources,d.id); if(!x) return; const done={...(x.done||{})}; done[d.i]=!done[d.i]; await patch('sources/'+x.id,{done}) },
  editSrc: d => { const x=find(S.sources,d.id); if(!x) return;
    openForm({title:x.name, fields:[{k:'status',label:'Статус',type:'select',options:SRC_ST},{k:'owner',label:'Отвечает',list:OWNERS},{k:'note',label:'Заметка',type:'textarea'}], data:x,
      onSave: v => patch('sources/'+x.id, {status:v.status, owner:v.owner||'', note:v.note||''})}) },
  editHub: () => { const C=S.srcCfg||{}; openForm({title:'Хаб данных', fields:[{k:'hubUrl',label:'Ссылка на Google-таблицу',wide:true},{k:'hubTitle',label:'Название',wide:true}], data:C,
      onSave: v => put('settings/sources', clean({...C, ...v}))}) },
  group: d => { UI.group=d.v; persist(); render() },
  dirf: d => { UI.dir=d.v; persist(); render() },
  prev: () => { UI.cur=iso(shift(UI.hz,cur(),-1)); persist(); render() },
  next: () => { UI.cur=iso(shift(UI.hz,cur(),1)); persist(); render() },
  now: () => { UI.cur=null; persist(); render() },
  gotoWeek: () => { UI.hz='week'; UI.cur=null; persist() },
  mprev: () => { UI.month=monthKey(shift('month',parse((UI.month||monthKey(today()))+'-01'),-1)); persist(); render() },
  mnext: () => { UI.month=monthKey(shift('month',parse((UI.month||monthKey(today()))+'-01'),1)); persist(); render() },

  toggleTask: async d => { const t=find(S.tasks,d.id); if(t) await patch('tasks/'+t.id,{done:!t.done}) },
  pickToday: async d => { await patch('tasks/'+d.id,{day:iso(today())}); toast('Задача добавлена в план дня') },
  addTask: d => { const hz=d.hz||(UI.route==='plan'&&UI.hz==='day'?'day':'week');
    openForm({title:'Новая задача', fields:F.task, data:{horizon:hz, date:d.date||pkey(hz,cur()), dir:UI.dir&&UI.dir!=='all'?UI.dir:'sellerator', owner:(hz==='day'&&UI.dayOwner&&UI.dayOwner!=='all')?UI.dayOwner:'Марат', cat:'Продажи', prio:'2'},
      onSave: v => { if(v.horizon==='week'&&v.date) v.date=iso(monday(parse(v.date))); return put('tasks/'+newId(), clean(v)) } }) },
  editTask: d => { const t=find(S.tasks,d.id); if(!t) return;
    openForm({title:'Задача', fields:F.task, data:t, onSave: v => { if(v.horizon==='week'&&v.date) v.date=iso(monday(parse(v.date))); return put('tasks/'+t.id, clean({...t, ...v, id:undefined})) }, onDelete: ()=>del('tasks/'+t.id)}) },

  addGoal: d => { const f = F.goal.map(x=>x.k==='okr'?{...x,list:[...new Set(S.goals.map(g=>g.okr).filter(Boolean))]}:x);
    openForm({title:'Новая цель', fields:f, data:{horizon:d.hz||'quarter', period:d.period||pkey(d.hz||'quarter',cur()), dir:d.dir||(UI.dir!=='all'?UI.dir:'sellerator'), unit:'', base:0},
      onSave: v => put('goals/'+newId(), clean(v))}) },
  editGoal: d => { const g=find(S.goals,d.id); if(!g) return; const f = F.goal.map(x=>x.k==='okr'?{...x,list:[...new Set(S.goals.map(g=>g.okr).filter(Boolean))]}:x);
    const data = {...g}; ['base','target','fact'].forEach(k=>{ if(g.unit==='%'&&isNum(g[k])) data[k]=Math.round(g[k]*1000)/10 });
    openForm({title:'Цель', fields:f, data, onSave: v => { if(v.unit==='%') ['base','target','fact'].forEach(k=>{ if(isNum(v[k])) v[k]=v[k]/100 }); return put('goals/'+g.id, clean(v)) }, onDelete: ()=>del('goals/'+g.id)}) },

  addWeek: d => openForm({title:'Метрики недели', fields:F.week, data:{dir:d.dir||'sellerator', week:d.week||pkey('week',today())},
      onSave: v => { v.week=iso(monday(parse(v.week||iso(today())))); const ex=S.weeks.find(w=>w.dir===v.dir&&w.week===v.week); return put('weeks/'+v.dir+'_'+v.week, clean({...(ex||{}), id:undefined, ...v})) }}),
  editWeek: d => { const w=find(S.weeks,d.id); if(!w) return; openForm({title:'Метрики недели', fields:F.week, data:w, onSave: v => put('weeks/'+w.id, clean({...v, dir:w.dir, week:w.week})), onDelete: ()=>del('weeks/'+w.id)}) },

  addDecision: d => openForm({title:'Новое решение', fields:F.decision, data:{date:iso(today()), dir:d.dir||'sellerator'}, onSave: v => put('decisions/'+newId(), clean(v))}),
  editDecision: d => { const r=find(S.decisions,d.id); if(!r) return; openForm({title:'Решение', fields:F.decision, data:r, onSave: v => put('decisions/'+r.id, clean(v)), onDelete: ()=>del('decisions/'+r.id)}) },

  addAssistant: d => openForm({title:'Новый ИИ-ассистент', fields:F.assistant, data:{dir:d.dir||'sellerator', status:'Не начат'}, onSave: v => put('assistants/'+newId(), clean(v))}),
  editAssistant: d => { const a=find(S.assistants,d.id); if(!a) return; openForm({title:'ИИ-ассистент', fields:F.assistant, data:a, onSave: v => put('assistants/'+a.id, clean(v)), onDelete: ()=>del('assistants/'+a.id)}) },

  editDir: d => { const k=d.k; const cur0 = S.dirs[k]||{};
    openForm({title:ALLDIR[k].name+': показатели и цели', fields:F.dir, data:cur0, onSave: v => put('dirs/'+k, clean({...cur0, id:undefined, ...v, name:ALLDIR[k].name}))}) },
  editLife: () => openForm({title:'Цели жизни', fields:F.life, data:S.life||{exitShare:.75,exitLow:10e6,exitHigh:15e6,usdRate:90}, onSave: v => put('life/main', clean({...(S.life||{}), ...v}))}),

  addEntry: () => { const m=UI.month||monthKey(today()); const dflt = m===monthKey(today())?iso(today()):m+'-01';
    openForm({title:'Новая операция', fields:F.entry, data:{type:'out', date:dflt, src:'sellerator', cat:'Прочее'},
      onSave: v => { if(v.type==='in') delete v.cat; else delete v.src; return put('life/main/entries/'+newId(), clean(v)) }}) },
  editEntry: d => { const e=find(S.entries,d.id); if(!e) return; openForm({title:'Операция', fields:F.entry, data:e,
      onSave: v => { if(v.type==='in') delete v.cat; else delete v.src; return put('life/main/entries/'+e.id, clean(v)) }, onDelete: ()=>del('life/main/entries/'+e.id)}) },
  editBudget: d => { const m=d.m; const b=S.budget[m]||{};
    const fields=[{type:'section',label:'Доходы по источникам'}, ...INCOME_SRC.map(([k,n])=>({k:'in_'+k,label:n,type:'number'})),
      {type:'section',label:'Расходы по категориям'}, ...EXP_CAT.map((c,i)=>({k:'out_'+i,label:c,type:'number'}))];
    const data={}; INCOME_SRC.forEach(([k])=>data['in_'+k]=(b.income||{})[k]); EXP_CAT.forEach((c,i)=>data['out_'+i]=(b.expense||{})[c]);
    openForm({title:'План на '+MONTHS[parse(m+'-01').getMonth()], fields, data, onSave: v => {
      const income={}, expense={}; INCOME_SRC.forEach(([k])=>{ if(isNum(v['in_'+k])) income[k]=v['in_'+k] }); EXP_CAT.forEach((c,i)=>{ if(isNum(v['out_'+i])) expense[c]=v['out_'+i] });
      return put('life/main/budget/'+m, {month:m, income, expense}) }}) },
  editFP: () => openForm({title:'Цель по пассивному доходу', fields:F.fp, data:S.life||{}, onSave: v => put('life/main', clean({...(S.life||{}), ...v}))}),
  addAsset: () => openForm({title:'Новый актив', fields:F.asset, data:{cls:ASSET_CLS[0]}, onSave: v => { return put('life/main/assets/'+newId(), clean({...v, kind:'asset', updated:iso(today())})) }}),
  editAsset: d => { const a=find(S.assets,d.id); if(!a) return; openForm({title:'Актив', fields:F.asset, data:a, onSave: v => put('life/main/assets/'+a.id, clean({...v, kind:'asset', updated:iso(today())})), onDelete: ()=>del('life/main/assets/'+a.id)}) },
  addLiab: () => openForm({title:'Новое обязательство', fields:F.liab, data:{cls:LIAB_CLS[0]}, onSave: v => put('life/main/assets/'+newId(), clean({...v, kind:'liab', updated:iso(today())}))}),
  editLiab: d => { const a=find(S.assets,d.id); if(!a) return; openForm({title:'Обязательство', fields:F.liab, data:a, onSave: v => put('life/main/assets/'+a.id, clean({...v, kind:'liab', updated:iso(today())})), onDelete: ()=>del('life/main/assets/'+a.id)}) },
  snap: async () => { const c=finCalc(); const m=monthKey(today()); if(await put('life/main/snapshots/'+m, {month:m, assets:c.assets, liabs:c.liabs, net:c.net, invest:c.invest, passive:c.passive})) toast('Положение дел за '+MONTHS[today().getMonth()]+' зафиксировано') },
  addLGoal: () => openForm({title:'Новая личная цель', fields:F.lgoal, data:{kind:'Капитал', saved:0}, onSave: v => put('life/main/goals/'+newId(), clean(v))}),
  editLGoal: d => { const g=find(S.lgoals,d.id); if(!g) return; openForm({title:'Личная цель', fields:F.lgoal, data:g, onSave: v => put('life/main/goals/'+g.id, clean(v)), onDelete: ()=>del('life/main/goals/'+g.id)}) },
};

document.addEventListener('click', e=>{
  const a = e.target.closest('[data-act]'); if(!a) return;
  const fn = ACT[a.dataset.act]; if(!fn) return;
  if(a.tagName!=='A' && a.type!=='checkbox') e.preventDefault();
  fn(a.dataset, e);
});
document.addEventListener('change', async e=>{
  const el = e.target;
  if(el.dataset && el.dataset.est){ const v = el.value.trim()===''?null:Number(el.value.replace(',','.')); if(v!==null&&(!isFinite(v)||v<0)){ toast('Оценка — число часов, например 1,5'); return } await patch('tasks/'+el.dataset.est,{est:v}); return }
  if(!el.dataset || !el.dataset.fact) return;
  const g = find(S.goals, el.dataset.fact); if(!g) return;
  let v = el.value.trim()===''?null:Number(el.value.replace(/\s/g,'').replace(',','.'));
  if(v!==null && !isFinite(v)){ toast('Факт должен быть числом'); return }
  if(v!==null && el.dataset.unit==='%') v=v/100;
  await put('goals/'+g.id, clean({...g, id:undefined, fact:v}));
});
document.addEventListener('keydown', e=>{ if(e.key==='Enter' && e.target.dataset && (e.target.dataset.fact||e.target.dataset.est)) e.target.blur() });
window.addEventListener('hashchange', ()=>{ const r=location.hash.slice(1); if(ROUTES.some(x=>x[0]===r)){ UI.route=r; persist(); render(); window.scrollTo(0,0) } });

let tt;
function toast(msg){ let t=document.querySelector('.toast'); if(!t){ t=document.createElement('div'); t.className='toast'; t.setAttribute('role','status'); document.body.appendChild(t) } t.textContent=msg; clearTimeout(tt); tt=setTimeout(()=>t.remove(), 3500) }

boot();
})();
