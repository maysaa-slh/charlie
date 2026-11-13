'use strict';
/* Charlie Focus : une petite appli qui dit quoi faire, sans pression. */

const KEY = 'charlie.v1';
const APP_VERSION = 9;
const SPEED = Number(new URLSearchParams(location.search).get('speed')) || 1;

/* ---------- Données ---------- */
function defaults() {
  return { v: 1, name: '', fan: 'Jungkook', helmet: 0, accent: 'red', pieces: 0, tasks: [], plan: { date: '', ids: [], bonus: false, locked: false }, sessions: [], adapt: [true, true, true] };
}
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return Object.assign(defaults(), JSON.parse(raw));
  } catch (e) {}
  return defaults();
}
let S = load();
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
}
let UI = { route: 'today', cur: 0, sheet: false, week: 0, drafts: {}, listening: false, micMsg: '', od: { phase: 'input', text: '', items: [], restOpen: false, speaking: false }, dump: { last: null }, when: { mode: 'auto', date: '' }, resetAsk: false, flash: 0 };
let F = null; // session de focus en cours
let REC = null;

/* ---------- Dates ---------- */
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const today = () => ymd(new Date());
const utc = (s) => { const p = s.split('-').map(Number); return Date.UTC(p[0], p[1] - 1, p[2]); };
const addDays = (s, n) => { const p = s.split('-').map(Number); return ymd(new Date(p[0], p[1] - 1, p[2] + n)); };
const diffDays = (a, b) => Math.round((utc(b) - utc(a)) / 864e5);
const WD = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const WD3 = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const wdOf = (s) => { const p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]).getDay(); };
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const byId = (id) => S.tasks.find((t) => t.id === id);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const nameShown = () => (S.name || 'toi');
const nameUp = () => (S.name ? S.name.toUpperCase() : 'TOI');

/* ---------- Comprendre ce qu'elle écrit ---------- */
function parseDue(text) {
  const t = text.toLowerCase();
  const td = today();
  if (/apr[eè]s-?demain/.test(t)) return addDays(td, 2);
  if (/demain/.test(t)) return addDays(td, 1);
  if (/aujourd|ce soir|ce matin|cet apr|avant midi|\bmidi\b|tout à l'heure|tout a l'heure/.test(t)) return td;
  const now = wdOf(td);
  for (let i = 0; i < 7; i++) {
    if (new RegExp('\\b' + WD[i] + '\\b').test(t)) return addDays(td, ((i - now + 7) % 7) || 7);
  }
  return null;
}
function guessMin(title) {
  if (/mail|appel|réserv|reserv|répond|repond|rappeler|rdv|rendez/i.test(title)) return 10;
  if (/devis|envoy|payer|facture/i.test(title)) return 15;
  return title.split(/\s+/).length > 5 ? 30 : 20;
}
function isBig(title) {
  return /planifi|f[êe]te|vacances|anniversaire|voyage|s[ée]jour|week-?end|valise|\bcv\b|lettre|pr[ée]par|pr[ée]sentation|rapport|dossier|d[ée]clar|projet|r[ée]organis|d[ée]m[ée]nag|organis|r[ée]dig|[ée]crire|r[ée]vis|m[ée]moire|examen|ranger/i.test(title) || title.trim().split(/\s+/).length >= 7;
}
function subjectOf(title) {
  const t = title.trim();
  const m = t.match(/^([a-zàâçéèêëîïôûùüÿœ'-]+(?:er|ir|re))\s+(.+)$/i);
  const sub = (m ? m[2] : t).replace(/[.!?]+$/, '');
  return sub.charAt(0).toLowerCase() + sub.slice(1);
}
function stepsFor(title) {
  const x = subjectOf(title);
  const T = title.toLowerCase();
  if (/d[iî]ner|d[ée]jeuner|repas|cuisin|g[âa]teau|recette|petit-?d[ée]j/.test(T)) return [
    ['Choisir ce qu\'on mange, simple', 3], ['Vérifier ce qu\'il y a déjà et noter ce qui manque', 5],
    ['Faire les courses si besoin', 20], ['Cuisiner', 30]];
  if (/ranger|m[ée]nage|nettoy|d[ée]sencombr|tri(er)?\b|lessive|vaisselle/.test(T)) return [
    ['Prendre un sac et jeter ce qui est à jeter', 5], ['Regrouper ce qui va ensemble', 5],
    ['Remettre chaque chose à sa place', 15], ['Un petit coup de propre pour finir', 10]];
  if (/d[ée]clar|imp[ôo]t|administr|papier|dossier|formulaire|assurance|mutuelle|caf\b|inscription/.test(T)) return [
    ['Rassembler les documents nécessaires', 10], ['Remplir ce qu\'on sait déjà', 15],
    ['Noter ce qu\'il manque et qui demander', 5], ['Relire et envoyer', 10]];
  if (/r[ée]serv|voyage|vacances|s[ée]jour|week-?end|f[êe]te|anniversaire|soir[ée]e|mariage|cadeau/.test(T)) return [
    ['Fixer la date et un budget approximatif', 5], ['Lister 3 options', 10],
    ['Choisir et réserver', 15], ['Prévenir les personnes concernées', 5]];
  if (/valise|d[ée]m[ée]nag|bagage|partir/.test(T)) return [
    ['Lister ce qu\'il faut emporter', 10], ['Sortir les affaires sur le lit', 10],
    ['Tout mettre dedans', 15], ['Vérifier papiers, clés, chargeurs', 5]];
  if (/course|march[ée]|supermarch[ée]/.test(T)) return [
    ['Faire la liste de ce qui manque', 5], ['Y aller', 30], ['Ranger les courses', 10]];
  if (/r[ée]vis|examen|apprendre|partiel|concours|\bcours\b/.test(T)) return [
    ['Rassembler les cours et les notes', 5], ['Lister les points à revoir', 5],
    ['Revoir un seul point à la fois', 25], ['Se tester sur ce qu\'on a vu', 10]];
  if (/pr[ée]sentation|rapport|m[ée]moire|expos[ée]|[ée]crire|r[ée]dig|article|projet|lettre|cv\b/.test(T)) return [
    ['Ouvrir le fichier ou une page blanche', 2], ['Noter 3 idées pour ' + x, 5],
    ['Faire un premier jet imparfait', 20], ['Relire et finir', 10]];
  return [
    ['Rassembler ce qu\'il faut pour ' + x, 5], ['Noter en vrac ce qu\'il y a à faire', 5],
    ['Faire la première petite partie', 15], ['Terminer et vérifier', 10]];
}
function cleanTitle(s) {
  const fillers = /^(alors|aussi|et|puis|donc|bon|ben|j'ai|je dois|il faut que je|il faut|faut que je|je veux|je voudrais)\s+/i;
  let x = s.trim(), prev = '';
  while (x !== prev) { prev = x; x = x.replace(fillers, '').trim(); }
  return cap(x);
}
function splitItems(text, multi) {
  const parts = multi ? text.split(/\n|[,;]|\.\s| et | puis /i) : text.split(/\n|;/);
  const seen = {};
  return parts.map(cleanTitle).filter((s) => s.length >= 3).filter((s) => (seen[s.toLowerCase()] ? false : (seen[s.toLowerCase()] = true))).slice(0, 12);
}
function makeItem(title) {
  const due = parseDue(title);
  const urgent = /urgent|deadline|échéance|echeance|rdv|rendez/i.test(title) || due === today();
  return { title, due, urgent, min: guessMin(title) };
}
function createTasks(items) {
  const made = [];
  items.forEach((it) => {
    if (isBig(it.title) && it.title.split(/\s+/).length >= 2) {
      const gid = uid();
      stepsFor(it.title).forEach((st, k) => {
        const t = { id: uid(), title: st[0], group: it.title, gid, order: k, min: st[1], due: it.due, pin: it.pin, urgent: it.urgent, done: false, created: Date.now() + k };
        S.tasks.push(t); made.push(t);
      });
    } else {
      const t = { id: uid(), title: it.title, min: it.min, due: it.due, pin: it.pin, urgent: it.urgent, done: false, created: Date.now() };
      S.tasks.push(t); made.push(t);
    }
  });
  return made;
}

/* ---------- Planifier à sa place ---------- */
function score(t) {
  const td = today();
  let s = 0;
  if (t.prio) s += 200;
  if (t.due) { const d = diffDays(td, t.due); s += d <= 0 ? 100 : d === 1 ? 60 : d <= 3 ? 40 : 20; }
  if (t.urgent) s += 30;
  if (t.min <= 10) s += 8;
  s += Math.min(10, Math.floor((Date.now() - t.created) / 864e5));
  return s;
}
function gateOK(t) {
  if (!t.gid) return true;
  return !S.tasks.some((x) => x.gid === t.gid && x.order < t.order && !x.done);
}
function eligible(t, td) {
  return !t.done && (!t.skipUntil || t.skipUntil <= td) && (!t.pin || t.pin <= td) && gateOK(t);
}
function ensurePlan() {
  const td = today();
  if (S.plan.date !== td) S.plan = { date: td, ids: [], bonus: false, locked: false };
  S.plan.ids = S.plan.ids.filter((id) => { const t = byId(id); return t && (t.done || eligible(t, td)); });
  if (!S.plan.locked) {
    while (S.plan.ids.length < 3) {
      const cand = S.tasks.filter((t) => !S.plan.ids.includes(t.id) && eligible(t, td)).sort((a, b) => score(b) - score(a));
      if (!cand.length) break;
      S.plan.ids.push(cand[0].id);
    }
  }
  return S.plan.ids.map(byId);
}
function curIndex(tasks) {
  if (tasks[UI.cur] && !tasks[UI.cur].done) return UI.cur;
  const i = tasks.findIndex((t) => !t.done);
  return i < 0 ? -1 : i;
}
function complete(id) {
  const t = byId(id);
  if (!t || t.done) return { gain: 0, lap: false };
  t.done = true; t.doneAt = Date.now();
  let gain = 1;
  S.pieces += 1;
  ensurePlan();
  const tasks = S.plan.ids.map(byId);
  const lap = tasks.length > 0 && tasks.every((x) => x.done);
  if (lap && !S.plan.bonus) { S.plan.bonus = true; S.pieces += 2; gain += 2; }
  save();
  return { gain, lap };
}
function whenLabel(t) {
  ensurePlan();
  if (S.plan.ids.includes(t.id)) return "aujourd'hui";
  const days = scheduleWeek();
  for (let i = 1; i < 7; i++) if (days[i].includes(t.id)) return i === 1 ? 'demain' : WD[wdOf(addDays(today(), i))];
  return 'bientôt, au bon moment';
}
function scheduleWeek() {
  const td = today();
  ensurePlan();
  const days = [S.plan.ids.slice(), [], [], [], [], [], []];
  const inPlan = new Set(S.plan.ids);
  const lastDay = {};
  S.plan.ids.forEach((id) => { const t = byId(id); if (t && t.gid) lastDay[t.gid] = 0; });
  const queue = S.tasks.filter((t) => !t.done && !inPlan.has(t.id)).sort((a, b) => score(b) - score(a));
  let guard = 0;
  while (queue.length && guard++ < 800) {
    const t = queue.shift();
    if (t.gid && queue.some((x) => x.gid === t.gid && x.order < t.order)) { queue.push(t); continue; }
    const min = Math.max(1, t.pin ? diffDays(td, t.pin) : 1, t.gid && lastDay[t.gid] != null ? lastDay[t.gid] + 1 : 1, t.skipUntil ? diffDays(td, t.skipUntil) : 1);
    const target = t.due ? Math.max(0, diffDays(td, t.due)) : null;
    let d = -1;
    if (target != null) for (let x = Math.min(target, 6); x >= min; x--) if (days[x].length < 3) { d = x; break; }
    if (d < 0) for (let x = min; x < 7; x++) if (days[x].length < 3) { d = x; break; }
    if (d >= 0) { days[d].push(t.id); if (t.gid) lastDay[t.gid] = d; }
  }
  return days;
}

/* ---------- Voiture ---------- */
const ORDER = ['wingF', 'tires', 'body', 'engine', 'brakes', 'wingR'];
const PART_NAMES = { wingF: 'Aileron avant', wingR: 'Aileron arrière', engine: 'Moteur', tires: 'Pneus', brakes: 'Freins', body: 'Châssis' };
function carLevels(pieces) {
  const lv = { wingF: 0, wingR: 0, engine: 0, tires: 0, brakes: 0, body: 0 };
  for (let i = 0; i < pieces; i++) lv[ORDER[i % 6]] = Math.min(3, lv[ORDER[i % 6]] + 1);
  const newest = pieces > 0 ? ORDER[(pieces - 1) % 6] : null;
  return { lv, newest };
}
function carSVG(pieces, hl) {
  const { lv, newest } = carLevels(pieces);
  const tm = team();
  const shades = ['#E4E0EC', tm.mid, tm.main, tm.main];
  const f = (k) => shades[lv[k]];
  const st = (k) => (hl && k === newest ? 'stroke="#17161F" stroke-width="5"' : 'stroke="#17161F" stroke-width="2.5"');
  const tires = lv.tires >= 2 ? '#2B2A39' : '#4A4858';
  return `<svg viewBox="0 0 320 132" width="100%" role="img" aria-label="Ta voiture de course, niveau ${pieces}" style="display:block">
<rect x="0" y="118" width="320" height="6" rx="3" fill="#EEEAF4"/>
<rect x="6" y="94" width="50" height="7" rx="3" fill="${f('wingF')}" ${st('wingF')}/>
<rect x="14" y="86" width="5" height="9" fill="#17161F"/>
<path d="M44 96 L96 66 L186 58 L236 62 L258 80 L262 100 L40 100 Z" fill="${f('body')}" ${st('body')} stroke-linejoin="round"/>
<path d="M120 62 L168 52 L206 56 L196 70 L126 72 Z" fill="${f('engine')}" ${st('engine')} stroke-linejoin="round"/>
<circle cx="150" cy="50" r="7" fill="#17161F"/>
<rect x="268" y="52" width="46" height="8" rx="3" fill="${f('wingR')}" ${st('wingR')}/>
<rect x="286" y="58" width="6" height="30" fill="#17161F"/>
<circle cx="78" cy="102" r="20" fill="${tires}" ${st('tires')}/>
<circle cx="78" cy="102" r="9" fill="${f('brakes')}" ${st('brakes')}/>
<circle cx="236" cy="100" r="22" fill="${tires}" ${st('tires')}/>
<circle cx="236" cy="100" r="10" fill="${f('brakes')}" ${st('brakes')}/>
</svg>`;
}
const HELMETS = [
  { label: 'Équipe rouge', main: '#E0262B', mid: '#F0A3A7', stripe: '#17161F', visor: '#17161F', chip: '#FDE9EA' },
  { label: 'Équipe violette', main: '#7C4DFF', mid: '#C5B0FF', stripe: '#FFFFFF', visor: '#17161F', chip: '#EEE8FF' },
  { label: 'Équipe noir et blanc', main: '#17161F', mid: '#9A98A8', stripe: '#FFFFFF', visor: '#E0262B', chip: '#E8E4F0' }
];
function team() { return HELMETS[S.helmet] || HELMETS[0]; }
function helmetSVG(h, size) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 52 52" role="img" aria-label="${h.label}" style="flex:none">
<path d="M6 31a20 20 0 0 1 40 0v8a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4z" fill="${h.main}" stroke="#17161F" stroke-width="2"/>
<path d="M6 31a20 20 0 0 1 20-20v11H6z" fill="${h.stripe}" stroke="#17161F" stroke-width="2" stroke-linejoin="round"/>
<path d="M22 26h23v9a3 3 0 0 1-3 3H25a3 3 0 0 1-3-3z" fill="${h.visor}" stroke="#17161F" stroke-width="2"/>
<path d="M26 30h11" stroke="#FFFFFF" stroke-width="2.4" stroke-linecap="round" opacity=".75"/></svg>`;
}

/* ---------- Circuit ---------- */
function pt(t) { return [150 + 118 * Math.cos(t), 62 + 38 * Math.sin(t) + 8 * Math.sin(2 * t)]; }
function pathBetween(a, b, n) {
  let d = '';
  for (let i = 0; i <= n; i++) { const p = pt(a + (b - a) * i / n); d += (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1) + ' '; }
  return d;
}
const TAU = Math.PI * 2;

/* ---------- Petits utilitaires d'interface ---------- */
let toastTimer;
function toast(text, ms) {
  const el = document.getElementById('toast');
  el.textContent = text; el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms || 4000);
}
const ICON = {
  sun: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/></svg>',
  cal: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>',
  cloud: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 18a4 4 0 0 1-.5-7.97A5.5 5.5 0 0 1 17 8.5a3.8 3.8 0 0 1 .5 7.5H7z"/></svg>',
  car: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 16l1.6-5.2A2 2 0 0 1 6.5 9.4h11a2 2 0 0 1 1.9 1.4L21 16v2.5H3z"/><circle cx="7.5" cy="18.5" r="1.8"/><circle cx="16.5" cy="18.5" r="1.8"/></svg>',
  mic: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
  plus: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  x: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  back: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  gear: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  speaker: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/></svg>',
  check: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'
};
function nav() {
  const items = [['today', 'Aujourd\'hui', ICON.sun], ['week', 'Semaine', ICON.cal], ['dump', 'Vide-tête', ICON.cloud], ['garage', 'Garage', ICON.car]];
  return `<nav class="nav" aria-label="Navigation">${items.map((i) => `<button data-act="go" data-r="${i[0]}" class="${UI.route === i[0] || (i[0] === 'garage' && UI.route === 'settings') ? 'on' : ''}" ${UI.route === i[0] ? 'aria-current="page"' : ''}>${i[2]}${i[1]}</button>`).join('')}</nav>`;
}
function micButton(inputId) {
  return `<button class="iconbtn ${UI.listening ? 'on' : ''}" data-act="mic" data-input="${inputId}" aria-label="${UI.listening ? 'Arrêter la dictée' : 'Dicter'}" aria-pressed="${UI.listening}">${ICON.mic}</button>`;
}
function micNote() {
  let h = '';
  if (UI.listening) h += `<div class="tint-box row" role="status"><span class="dots"><span></span></span>Je t'écoute. Parle comme ça vient, et touche le micro quand tu as fini.</div>`;
  if (UI.micMsg) h += `<div class="tint-box" role="status" style="background:#fff;border:2px solid var(--line);color:var(--ink2)">${esc(UI.micMsg)}</div>`;
  return h;
}

/* ---------- Écrans ---------- */
function viewOnboarding() {
  return `<main class="screen" style="justify-content:center">
<div class="avatar pop" style="width:56px;height:56px;border-radius:28px;font-size:24px" aria-hidden="true">C</div>
<h1>Salut, moi c'est Charlie.</h1>
<p class="sub">Je te dis quoi faire, une chose à la fois.</p>
<form data-form="onboard" style="display:flex;flex-direction:column;gap:12px">
<label for="nm" class="eyebrow">TON PRÉNOM</label>
<input id="nm" class="input" type="text" autocomplete="given-name" placeholder="Ton prénom" maxlength="24">
<label for="first" class="eyebrow" style="margin-top:4px">UNE CHOSE À FAIRE AUJOURD'HUI ? (SI TU VEUX)</label>
<input id="first" class="input" type="text" placeholder="Ex : appeler le dentiste" enterkeyhint="go">
<button class="btn" type="submit">C'est parti</button>
</form>
</main>`;
}

function circuitToday(tasks) {
  const doneN = tasks.filter((t) => t.done).length;
  const curI = curIndex(tasks);
  const sectors = [0, 1, 2].map((i) => {
    const a = i * TAU / 3, b = (i + 1) * TAU / 3;
    const t = tasks[i];
    const stroke = t && t.done ? 'var(--main)' : i === curI ? 'var(--dark)' : '#C4BDD3';
    const m = pt((a + b) / 2);
    return { path: pathBetween(a, b, 24), stroke, lx: m[0], ly: m[1], done: !!(t && t.done), has: !!t, n: i + 1 };
  });
  const carT = curI >= 0 ? curI * TAU / 3 : 0;
  const car = pt(curI >= 0 ? carT : 0);
  return `<svg viewBox="0 0 300 124" width="100%" role="img" aria-label="Circuit du jour : ${doneN} secteur${doneN > 1 ? 's' : ''} sur 3 bouclé${doneN > 1 ? 's' : ''}" style="display:block">
<path d="${pathBetween(0, TAU, 72)}Z" fill="none" stroke="var(--track)" stroke-width="24" stroke-linejoin="round"/>
${sectors.map((s) => `<path d="${s.path}" fill="none" stroke="${s.stroke}" stroke-width="12"/>`).join('')}
<line x1="254" y1="62" x2="282" y2="62" stroke="#17161F" stroke-width="4" stroke-dasharray="4 4"/>
${sectors.map((s) => `<circle cx="${s.lx.toFixed(1)}" cy="${s.ly.toFixed(1)}" r="11" fill="#fff" stroke="#17161F" stroke-width="2"/>${s.done ? `<path d="M-4.5 0.5l3 3 6-6.5" transform="translate(${s.lx.toFixed(1)} ${s.ly.toFixed(1)})" fill="none" stroke="#17161F" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>` : `<text x="${s.lx.toFixed(1)}" y="${(s.ly + 4.5).toFixed(1)}" text-anchor="middle" font-size="13" font-weight="800" fill="#17161F" opacity="${s.has ? 1 : 0.35}">${s.n}</text>`}`).join('')}
<circle cx="${car[0].toFixed(1)}" cy="${car[1].toFixed(1)}" r="9" fill="var(--dark)" stroke="#fff" stroke-width="3"/>
</svg>`;
}

function viewToday() {
  const tasks = ensurePlan();
  const date = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const head = `<div class="row between">
<div><div class="muted" style="font-size:14px;font-weight:700">${esc(cap(date))}</div>
<h1 style="margin-top:2px">GO ${esc(nameUp())} GO !</h1></div>
<button class="pill row" data-act="go" data-r="garage" aria-label="Ma voiture, niveau ${S.pieces}" style="position:relative;border:none;background:var(--tint);color:var(--dark);gap:6px">${ICON.car}<span>${S.pieces}</span>${UI.flash ? `<span class="pop" style="position:absolute;top:-9px;right:-6px;padding:2px 8px;border-radius:10px;background:#17161F;color:#F7F5FA;font-size:13px">+${UI.flash}</span>` : ''}</button></div>`;
  if (!tasks.length) {
    const hasAny = S.tasks.some((t) => !t.done);
    return `<main class="screen">${head}
<div class="card pop" style="margin-top:6px"><div class="big">${hasAny ? 'Rien pour aujourd\'hui.' : 'Ta journée est libre.'}</div>
<p class="sub">${hasAny ? 'Tout ce que tu as noté est rangé pour les prochains jours. Profite.' : 'Si quelque chose te trotte dans la tête, c\'est le moment de le déposer. Je m\'occupe de le ranger.'}</p>
<button class="btn" data-act="go" data-r="dump">Vider ma tête</button>
<button class="btn text" data-act="demo">Essayer avec un exemple</button></div>
<div class="row" style="justify-content:center"><button class="pill" data-act="go" data-r="overwhelmed">Par quoi commencer ?</button></div></main>${nav()}`;
  }
  const curI = curIndex(tasks);
  const all = curI < 0;
  const cur = all ? null : tasks[curI];
  const hint = cur ? (cur.group ? 'Étape de « ' + cur.group + ' »' : 'Commence juste par 2 minutes, pour voir.') : '';
  const afternoon = S.adapt[0] && afternoonPattern() && new Date().getHours() >= 12 && new Date().getHours() < 18;
  const others = tasks.map((t, i) => ({ t, i })).filter((x) => x.i !== curI);
  const card = all
    ? `<div class="card pop" style="background:var(--ink);color:#F7F5FA"><div class="big">Tour bouclé. Quelle pilote !</div>
<p style="font-size:18px;font-weight:600;line-height:1.4">Tu as fait ce qu'il fallait aujourd'hui. Le reste peut attendre demain.</p>
<button class="btn" data-act="go" data-r="garage">Voir ma voiture</button></div>`
    : `<div class="card pop" style="gap:12px">
<div class="eyebrow" style="color:var(--dark)">${cur.group ? esc(cur.group.toUpperCase()) : 'JUSTE ÇA, POUR L\'INSTANT'}</div>
<div class="big" style="font-size:28px">${esc(cur.title)}</div>
<div class="row" style="flex-wrap:wrap;gap:8px"><span class="chip">Environ ${cur.min} min en tout</span>${cur.due === today() ? '<span class="chip tint">Pour aujourd\'hui</span>' : ''}${afternoon ? '<span class="chip tint">Bon moment pour toi</span>' : ''}</div>
<button class="btn" data-act="focus" data-id="${cur.id}">Je démarre</button>
<p class="muted" style="font-size:14px;font-weight:600;text-align:center;margin-top:-4px">Un tour de chauffe pour te lancer. Ensuite, tu décides.</p>
<div class="row" style="justify-content:center;gap:4px"><button class="btn text" data-act="done" data-id="${cur.id}">C'est fait</button><span class="muted" aria-hidden="true">·</span><button class="btn text" data-act="swap" data-id="${cur.id}">Pas celle-ci</button></div></div>`;
  const rows = others.length ? `<div style="display:flex;flex-direction:column;gap:2px"><div class="eyebrow" style="margin-bottom:4px">ENSUITE</div>${others.map(({ t, i }) => `<div style="display:flex;align-items:center;gap:10px;min-height:40px;font-size:16px;font-weight:700;color:${t.done ? 'var(--ink3)' : 'var(--ink2)'};${t.done ? 'text-decoration:line-through' : ''}"><span style="width:20px;display:flex;justify-content:center;color:var(--main)">${t.done ? ICON.check : '•'}</span>${esc(t.title)}</div>`).join('')}</div>` : '';
  return `<main class="screen">${head}
<div style="max-width:300px;width:100%;margin:0 auto">${circuitToday(tasks)}</div>
${card}
${rows}
<div class="row" style="justify-content:center;margin-top:auto;padding-top:6px"><button class="pill" data-act="go" data-r="overwhelmed">Par quoi commencer ?</button></div>
</main>${nav()}`;
}
function sheetRest() {
  const td = today();
  const doneToday = S.tasks.filter((t) => t.done && t.doneAt && ymd(new Date(t.doneAt)) === td);
  const later = S.tasks.filter((t) => !t.done && !S.plan.ids.includes(t.id));
  return `<div class="sheet-bg" data-act="sheetx"><div class="sheet" role="dialog" aria-label="Le reste" data-stop="1">
<div class="row between"><h2>Charlie garde tout pour toi</h2><button class="iconbtn" style="width:44px;height:44px;border-radius:14px" data-act="sheetx" aria-label="Fermer">${ICON.x}</button></div>
<div class="eyebrow">DÉJÀ FAIT</div>
${doneToday.length ? doneToday.map((t) => `<div class="slot done" style="min-height:48px">${ICON.check}<span>${esc(t.title)}</span></div>`).join('') : '<p class="sub">Rien encore. Ça viendra.</p>'}
<div class="eyebrow" style="margin-top:6px">POUR UN AUTRE JOUR</div>
${later.length ? later.slice(0, 8).map((t) => `<div class="slot" style="min-height:48px;background:var(--bg)"><span style="flex:1">${esc(t.title)}</span></div>`).join('') + (later.length > 8 ? '<p class="sub">Et d\'autres, bien rangées.</p>' : '') : '<p class="sub">Rien d\'autre en attente.</p>'}
</div></div>`;
}

function dayTitle(i) { return i === 0 ? "Aujourd'hui" : i === 1 ? 'Demain' : cap(WD[wdOf(addDays(today(), i))]); }
function viewWeek() {
  const days = scheduleWeek();
  const td = today();
  const sel = Math.min(UI.week, 6);
  const ids = days[sel];
  const tasks = ids.map(byId).filter(Boolean);
  const mins = tasks.filter((t) => !t.done).reduce((a, t) => a + t.min, 0);
  const badge = !tasks.length ? 'Libre' : mins < 60 ? 'Légère' : mins <= 120 ? 'Équilibrée' : 'Bien remplie';
  const chips = [0, 1, 2, 3, 4, 5, 6].map((i) => { const ds = addDays(td, i); return `<button class="day ${i === sel ? 'on' : ''}" data-act="weekday" data-i="${i}" aria-pressed="${i === sel}"><span>${WD3[wdOf(ds)]}</span><b>${Number(ds.slice(8))}</b></button>`; }).join('');
  const rows = tasks.map((t, k) => `<div class="card" style="padding:14px 16px;gap:6px;border-radius:20px">
<div class="row between"><div style="font-size:17px;font-weight:800;line-height:1.2;${t.done ? 'text-decoration:line-through;color:var(--ink3)' : ''}">${esc(t.title)}</div>${k === 0 && !t.done ? '<span class="chip tint">D\'abord</span>' : ''}</div>
<div class="row between"><span class="muted" style="font-size:14px;font-weight:700">Environ ${t.min} min${t.group ? ' · ' + esc(t.group) : ''}</span>${!t.done ? `<button class="btn text" style="min-height:44px" data-act="later" data-id="${t.id}" data-i="${sel}">Demain →</button>` : ''}</div></div>`).join('');
  return `<main class="screen">
<div><h1>Ma semaine</h1><p class="sub" style="margin-top:6px">Tout est organisé. Change quelque chose seulement si tu veux.</p></div>
<div class="days" role="group" aria-label="Jours">${chips}</div>
<div class="row between"><h2>${dayTitle(sel)}</h2><span class="chip tint">${badge}</span></div>
${rows || '<div class="card"><p class="sub">Rien de prévu. Une journée pour respirer.</p></div>'}
<form data-form="weekadd" data-i="${sel}" class="row" style="gap:8px;margin-top:4px"><label for="weekIn" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">Ajouter pour ce jour</label><input id="weekIn" class="input" type="text" data-draft="weekIn" placeholder="Ajouter pour ${sel === 0 ? "aujourd'hui" : dayTitle(sel).toLowerCase()}…" style="flex:1;min-width:0"><button class="iconbtn" type="submit" style="background:var(--main);border-color:var(--main);color:#fff" aria-label="Ajouter">${ICON.plus}</button></form>
</main>${nav()}`;
}

function sheetAll() {
  const days = scheduleWeek();
  const placed = new Set();
  const groups = [];
  for (let i = 0; i < 7; i++) {
    const list = days[i].map(byId).filter((t) => t && !t.done);
    list.forEach((t) => placed.add(t.id));
    if (list.length) groups.push({ title: i === 0 ? "Aujourd'hui" : i === 1 ? 'Demain' : cap(WD[wdOf(addDays(today(), i))]) + ' ' + Number(addDays(today(), i).slice(8)), list });
  }
  const later = S.tasks.filter((t) => !t.done && !placed.has(t.id));
  if (later.length) groups.push({ title: 'Plus tard', list: later });
  return `<div class="sheet-bg" data-act="sheetx"><div class="sheet" role="dialog" aria-label="Tout ce que Charlie garde">
<div class="row between"><h2>Tout ce que Charlie garde</h2><button class="iconbtn" style="width:44px;height:44px;border-radius:14px" data-act="sheetx" aria-label="Fermer">${ICON.x}</button></div>
<p class="sub" style="font-size:15px">Tu n'as pas besoin de regarder ça. C'est juste là, au cas où.</p>
${groups.length ? groups.map((g) => `<div class="eyebrow" style="margin-top:6px">${esc(g.title.toUpperCase())}</div>${g.list.map((t) => `<div class="step"><div style="flex:1"><div class="t">${esc(t.title)}</div><div class="m">${t.group ? esc(t.group) + ' · ' : ''}environ ${t.min} min</div></div><button class="iconbtn" style="width:44px;height:44px;border:none;background:transparent" data-act="rmtask" data-id="${t.id}" aria-label="Supprimer cette tâche">${ICON.x}</button></div>`).join('')}`).join('') : '<p class="sub">Rien en attente. Ta tête est vide, c\'est parfait.</p>'}
</div></div>`;
}
function viewDump() {
  const last = UI.dump.last;
  let result = '';
  if (last && last.length) {
    const first = last[0];
    const steps = last.filter((t) => byId(t.id));
    const t0 = steps.length ? byId(steps[0].id) : null;
    const when = t0 ? (t0.pin ? 'le ' + fmtDate(t0.pin) : whenLabel(t0)) : '';
    const title = first.group || first.title;
    result = `<div class="card pop" style="gap:12px">
<div style="font-size:14px;font-weight:800;color:var(--dark)">C'est noté. Charlie s'en occupe.</div>
<div style="font-size:24px;line-height:1.15;font-weight:800">${esc(title)}</div>
<div style="font-size:15px;font-weight:700;color:var(--dark);line-height:1.35">${first.group ? 'Trop grand d\'un coup : je l\'ai découpée en petits pas.' : 'C\'est déjà petit, je la garde telle quelle.'}</div>
<div class="steps">${steps.map((s) => `<div class="step"><div style="flex:1"><div class="t">${esc(s.title)}</div><div class="m">Environ ${s.min} min</div></div>${steps.length > 1 ? `<button class="iconbtn" style="width:44px;height:44px;border:none;background:transparent" data-act="rmstep" data-id="${s.id}" aria-label="Retirer cette étape">${ICON.x}</button>` : ''}</div>`).join('')}</div>
<div class="tint-box row between" style="gap:10px"><span>Je te la proposerai ${esc(when)}${when === "aujourd'hui" || when === 'demain' || t0.pin ? '' : ', un pas à la fois'}.</span><button class="btn small ghost" style="border-color:var(--dark);color:var(--dark);background:transparent" data-act="undo">Annuler</button></div></div>`;
  } else if (last && last.length === 0) {
    result = `<div class="card pop" style="background:var(--ink);color:#F7F5FA"><div class="big">Annulé.</div><p style="font-size:18px;font-weight:600;line-height:1.4">Rien n'a été ajouté. Tu peux en noter une autre quand tu veux.</p></div>`;
  }
  return `<main class="screen">
<div><h1>Vide-tête</h1><p class="sub" style="margin-top:6px">Écris ce qui te trotte dans la tête. Je découpe, je planifie, je range.</p></div>
<form data-form="dump" class="row" style="gap:8px">
<label for="dumpIn" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">Nouvelle pensée</label>
<input id="dumpIn" class="input" data-draft="dumpIn" type="text" value="${esc(UI.drafts.dumpIn || '')}" placeholder="Ce qui me trotte dans la tête…" style="flex:1;min-width:0" enterkeyhint="done">
${micButton('dumpIn')}
<button class="iconbtn" type="submit" style="background:var(--main);border-color:var(--main);color:#fff" aria-label="Ajouter">${ICON.plus}</button></form>
${micNote()}
<div role="group" aria-label="Pour quand ?" style="display:flex;flex-direction:column;gap:8px"><div class="eyebrow">POUR QUAND ?</div>
<div class="row" style="gap:8px;flex-wrap:wrap">${[['auto', 'Charlie choisit'], ['tomorrow', 'Demain'], ['date', 'Un autre jour']].map((o) => `<button type="button" class="pill ${UI.when.mode === o[0] ? '' : ''}" data-act="when" data-m="${o[0]}" aria-pressed="${UI.when.mode === o[0]}" style="${UI.when.mode === o[0] ? 'background:var(--main);border-color:var(--main);color:#fff' : ''}">${o[1]}</button>`).join('')}</div>
${UI.when.mode === 'date' ? `<label for="whenDate" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">Choisir le jour</label><input id="whenDate" class="input" type="date" min="${addDays(today(), 1)}" value="${esc(UI.when.date)}" data-act-change="whendate">` : ''}</div>
<p class="muted" style="font-size:14px;font-weight:600;line-height:1.4">Astuce : sur iPhone, le micro de ton clavier dicte aussi, et ça marche partout.</p>
${result}
<button class="btn text" style="align-self:flex-start" data-act="sheetall">Voir tout ce que Charlie garde</button>
</main>${nav()}${UI.sheet === 'all' ? sheetAll() : ''}`;
}

function viewGarage() {
  const { lv, newest } = carLevels(S.pieces);
  const parts = Object.keys(PART_NAMES).map((k) => `<div class="part ${k === newest ? 'new' : ''}"><span class="row between" style="gap:6px"><span>${PART_NAMES[k]}</span>${k === newest ? '<span class="chip" style="min-height:24px;padding:0 8px;background:var(--ink);color:#F7F5FA;font-size:12px">Nouveau</span>' : ''}</span><span>${[1, 2, 3].map((n) => `<i class="pip ${lv[n ? k : k] >= n ? 'on' : ''}"></i>`).join('')}</span></div>`).join('');
  const h = HELMETS[S.helmet] || HELMETS[0];
  const msg = S.pieces === 0 ? 'Chaque tâche terminée ajoute une pièce à ta voiture.' : `Nouveau : ${PART_NAMES[newest].toLowerCase()} installé. Chaque tâche terminée ajoute une pièce.`;
  return `<main class="screen">
<div class="row between"><div><div class="muted" style="font-size:14px;font-weight:700">Ta voiture</div><h1>Garage</h1></div>
<div class="row" style="gap:8px"><span class="chip tint" style="min-height:44px;font-size:16px;padding:0 16px;border-radius:22px" role="status">Niveau ${S.pieces}</span><button class="iconbtn" style="width:44px;height:44px;border-radius:14px" data-act="go" data-r="settings" aria-label="Réglages">${ICON.gear}</button></div></div>
<div class="card" style="padding:14px 10px 8px">${carSVG(S.pieces, true)}</div>
<div class="card" style="padding:14px 16px;border-radius:20px;font-size:16px;font-weight:700;line-height:1.35;box-shadow:none">${esc(msg)}</div>
<div class="parts">${parts}</div>
<div class="card row" style="flex-direction:row;padding:14px 16px;border-radius:22px;gap:14px;align-items:center;background:${h.chip}">${helmetSVG(h, 84)}
<div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px"><div style="font-size:17px;font-weight:800">Pilote ${esc(nameShown())}</div>${S.fan ? `<div style="font-size:14px;font-weight:700;color:var(--ink2)">Team ${esc(S.fan)}</div>` : ''}
<div class="row" style="gap:0" role="group" aria-label="Couleur de ton équipe">${HELMETS.map((x, i) => `<button data-act="helmet" data-i="${i}" aria-label="${x.label}" aria-pressed="${S.helmet === i}" style="width:44px;height:44px;border:none;background:transparent;padding:0;display:flex;align-items:center;justify-content:center"><span style="width:30px;height:30px;border-radius:15px;background:${x.main};border:3px solid ${S.helmet === i ? '#17161F' : '#fff'};box-shadow:0 0 0 2px ${S.helmet === i ? x.main : '#E0DCE9'};display:block"></span></button>`).join('')}</div></div></div>
</main>${nav()}`;
}

/* ---------- Ce que Charlie remarque (vraiment, à partir de ses sessions) ---------- */
function recentSessions() { return S.sessions.slice(-20); }
function afternoonPattern() {
  const s = recentSessions();
  if (s.length < 4) return false;
  return s.filter((x) => { const h = new Date(x.at).getHours(); return h >= 12 && h < 18; }).length / s.length >= 0.6;
}
function overrunPattern() {
  const s = recentSessions().filter((x) => x.planned > 120);
  if (s.length < 3) return false;
  return s.filter((x) => x.actual > x.planned * 1.2).length >= 3;
}
function twoMinPattern() { return recentSessions().filter((x) => x.planned === 120).length >= 2; }
function adaptCards() {
  const c = [];
  if (afternoonPattern()) c.push({ i: 0, seen: "Tu te mets plus facilement au travail l'après-midi.", does: 'Je te le signale quand c\'est le bon moment pour une tâche plus longue.' });
  if (overrunPattern()) c.push({ i: 1, seen: 'Tes sessions durent souvent plus longtemps que prévu.', does: 'Je te fais mon repère un peu plus tard, pour ne pas te couper dans ton élan.' });
  if (twoMinPattern()) c.push({ i: 2, seen: 'Le tour de chauffe marche bien pour toi.', does: 'Je te propose toujours un tour de chauffe en premier, sans engagement.' });
  return c;
}
function viewSettings() {
  const cards = adaptCards();
  return `<main class="screen">
<button class="btn text" style="align-self:flex-start;gap:6px;padding:0" data-act="go" data-r="garage">${ICON.back} Retour</button>
<h1>Réglages</h1>
<div class="card"><label class="eyebrow" for="stName">TON PRÉNOM</label><input id="stName" class="input" data-draft="stName" value="${esc(UI.drafts.stName != null ? UI.drafts.stName : S.name)}" maxlength="24">
<label class="eyebrow" for="stFan" style="margin-top:6px">UNE DÉDICACE POUR TON ÉQUIPE</label><input id="stFan" class="input" data-draft="stFan" value="${esc(UI.drafts.stFan != null ? UI.drafts.stFan : S.fan)}" maxlength="24" placeholder="Un nom, un mot…">
<button class="btn small" data-act="savesettings">Enregistrer</button></div>
<div class="card"><div class="eyebrow">AMBIANCE</div><div class="row" style="gap:8px">
<button class="btn small ${S.accent === 'red' ? '' : 'ghost'}" style="flex:1" data-act="accent" data-v="red" aria-pressed="${S.accent === 'red'}">Circuit rouge</button>
<button class="btn small ${S.accent === 'violet' ? '' : 'ghost'}" style="flex:1" data-act="accent" data-v="violet" aria-pressed="${S.accent === 'violet'}">Scène violette</button></div></div>
<div><h2 style="margin-bottom:6px">Charlie s'adapte à toi</h2><p class="sub">Charlie remarque ce qui marche pour toi et l'ajuste tout seul.</p></div>
${cards.length ? cards.map((c) => `<div class="card" style="gap:8px;${S.adapt[c.i] ? '' : 'opacity:.75'}"><div class="eyebrow" style="color:var(--dark)">CHARLIE A REMARQUÉ</div><div style="font-size:17px;font-weight:800;line-height:1.25">${esc(c.seen)}</div><div class="sub" style="font-size:15px">${esc(c.does)}</div>
<div class="row between"><span style="font-size:15px;font-weight:800;color:${S.adapt[c.i] ? 'var(--dark)' : 'var(--ink3)'}">${S.adapt[c.i] ? 'Appliqué' : 'Mis de côté'}</span><button class="btn small ${S.adapt[c.i] ? 'ghost' : ''}" data-act="adapt" data-i="${c.i}">${S.adapt[c.i] ? 'Pas pour moi' : 'Réactiver'}</button></div></div>`).join('') : '<div class="card"><p class="sub">Charlie t\'observe doucement. Quand il aura remarqué des choses utiles, elles apparaîtront ici.</p></div>'}
<div class="tint-box">Charlie regarde seulement comment tu travailles, jamais ce que tu n'as pas fait.</div>
<p class="muted" style="font-size:13px;font-weight:700;text-align:center">Charlie Focus · version ${APP_VERSION}</p>
<div class="card"><div class="eyebrow">DONNÉES</div><button class="btn small ghost" data-act="demo">Charger un exemple de tâches</button>
${UI.resetAsk ? '<p class="sub" style="font-size:15px">Ça efface tes tâches, ta voiture et tes réglages sur ce téléphone.</p><div class="row" style="gap:8px"><button class="btn small" style="flex:1" data-act="reset">Oui, tout effacer</button><button class="btn small ghost" style="flex:1" data-act="resetno">Non, garder</button></div>' : '<button class="btn small ghost" data-act="resetask">Tout effacer</button>'}</div>
</main>${nav()}`;
}

/* ---------- Focus ---------- */
function laps() { return Math.max(1, Math.round(F.planned / 90)); }
function elapsedMs() { return (F.acc + (F.running ? Date.now() - F.startedAt : 0)) * SPEED; }
function elapsedText() {
  const m = Math.round(elapsedMs() / 60000);
  return m < 1 ? "Moins d'une minute" : 'Environ ' + m + ' minute' + (m > 1 ? 's' : '');
}
function infoLine() {
  const N = laps(), p = Math.min(0.999, elapsedMs() / (F.planned * 1000));
  return 'Tour ' + Math.min(N, Math.floor(N * p) + 1) + ' sur ' + N;
}
let TICK = null, WAKE = null;
async function lockScreen() { try { if (navigator.wakeLock) WAKE = await navigator.wakeLock.request('screen'); } catch (e) {} }
function unlockScreen() { try { if (WAKE) WAKE.release(); } catch (e) {} WAKE = null; }
function startRun(sec) {
  F.planned = sec; F.acc = 0; F.startedAt = Date.now(); F.running = true; F.phase = 'run'; F.half = false;
  clearInterval(TICK); TICK = setInterval(tick, 400);
  lockScreen(); render();
}
function logSession() {
  S.sessions.push({ at: F.startedAt0 || Date.now(), planned: F.planned, actual: Math.round(elapsedMs() / 1000) });
  S.sessions = S.sessions.slice(-40);
  save();
}
function stopTick() { clearInterval(TICK); TICK = null; unlockScreen(); }
function endRun() {
  F.acc = elapsedMs() / SPEED; F.running = false;
  stopTick(); logSession();
  F.phase = F.planned === 120 && !F.extended ? 'launched' : 'ended';
  render();
}
function tick() {
  if (!F || F.phase !== 'run' || !F.running) return;
  const p = elapsedMs() / (F.planned * 1000);
  if (p >= 1) { endRun(); return; }
  const car = document.getElementById('fcar');
  if (car) { const q = pt(TAU * laps() * p); car.setAttribute('cx', q[0].toFixed(1)); car.setAttribute('cy', q[1].toFixed(1)); }
  const info = document.getElementById('finfo');
  if (info) info.textContent = infoLine();
  const el = document.getElementById('fel');
  if (el) el.textContent = elapsedText();
  const halfAt = S.adapt[1] && overrunPattern() ? 0.75 : 0.5;
  if (!F.half && F.planned >= 600 && p >= halfAt) { F.half = true; toast(halfAt === 0.5 ? 'Petit repère : tu es à peu près à la moitié. Tout va bien.' : 'Petit repère : ça fait un moment que tu es dedans. Tout va bien.', 7000); }
}
function finishTask() {
  const wasRunning = F.phase === 'run';
  if (wasRunning) { F.acc = elapsedMs() / SPEED; F.running = false; stopTick(); logSession(); }
  const res = complete(F.taskId);
  F.gain = res.gain; F.lap = res.lap;
  const nw = carLevels(S.pieces).newest;
  F.part = nw ? PART_NAMES[nw] : '';
  F.phase = 'done'; UI.flash = res.gain;
  render();
}
function viewFocus() {
  const t = byId(F.taskId);
  const title = t ? t.title : '';
  const back = `<button class="btn text" style="align-self:flex-start;gap:6px;padding:0" data-act="leave">${ICON.back} ${F.phase === 'run' ? 'Quitter' : 'Retour'}</button>`;
  const head = `<div><div class="eyebrow" style="color:var(--dark)">${t && t.group ? esc(t.group.toUpperCase()) : 'TA TÂCHE'}</div><h1 style="margin-top:4px;font-size:26px">${esc(title)}</h1></div>`;
  if (F.phase === 'ready') {
    const opts = [[120, '2 min'], [600, '10 min'], [1500, '25 min']];
    return `<main class="screen">${back}${head}
<p class="sub">Combien de temps tu me donnes ? Commence petit : 2 minutes, juste pour voir. Tu pourras continuer après si ça roule.</p>
<div class="row" style="gap:8px" role="group" aria-label="Durée">${opts.map((o) => `<button class="btn small ${F.planned === o[0] ? '' : 'ghost'}" style="flex:1;min-height:56px;font-size:18px" data-act="dur" data-s="${o[0]}" aria-pressed="${F.planned === o[0]}">${o[1]}</button>`).join('')}</div>
<button class="btn" style="min-height:60px;margin-top:6px" data-act="start">Commencer</button>
<p class="muted" style="font-size:14px;font-weight:600;line-height:1.4">Pas de chrono qui défile. La voiture fait ses tours, tu la regardes si tu veux.</p></main>`;
  }
  if (F.phase === 'run') {
    const q = pt(TAU * laps() * Math.min(0.999, elapsedMs() / (F.planned * 1000)));
    return `<main class="screen">${back}${head}
<div class="card pop" style="padding:12px 10px">
<svg viewBox="0 0 300 124" width="100%" role="img" aria-label="Circuit avec la voiture qui avance" style="display:block">
<path d="${pathBetween(0, TAU, 72)}Z" fill="none" stroke="var(--track)" stroke-width="20" stroke-linejoin="round"/>
<path d="${pathBetween(0, TAU, 72)}Z" fill="none" stroke="#CFC9DB" stroke-width="2" stroke-dasharray="6 8" stroke-linejoin="round"/>
<line x1="254" y1="62" x2="278" y2="62" stroke="#17161F" stroke-width="4" stroke-dasharray="4 4"/>
<circle id="fcar" cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="10" fill="var(--main)" stroke="#fff" stroke-width="3"/>
</svg></div>
<div style="font-size:20px;font-weight:800;text-align:center">${F.running ? 'GO ' + esc(nameUp()) + ' GO !' : 'Pause. Tu reviens quand tu veux.'}</div>
${F.planned === 120 && !F.extended ? '<p class="sub" style="text-align:center;font-size:15px">Tour de chauffe : un seul tour pour te lancer. Après, tu choisis de continuer ou non.</p>' : ''}
<div id="finfo" style="font-size:17px;font-weight:700;text-align:center;color:var(--ink2)">${infoLine()}</div>
<div style="text-align:center">${F.showEl ? `<span id="fel" class="chip tint" style="font-size:15px">${elapsedText()}</span>` : '<button class="btn text" data-act="showel">Depuis combien de temps ?</button>'}</div>
<div class="row" style="gap:8px"><button class="btn ghost" style="flex:1" data-act="pause">${F.running ? 'Pause' : 'Reprendre'}</button><button class="btn" style="flex:1" data-act="finish">J'ai terminé</button></div>
<form data-form="idea" class="row" style="gap:8px"><label for="ideaIn" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">Une idée me vient</label><input id="ideaIn" class="input" type="text" placeholder="Une idée me vient… je la garde" style="flex:1;min-width:0;min-height:48px;font-size:16px"><button class="btn small" type="submit">Garder</button></form>
</main>`;
  }
  if (F.phase === 'launched') {
    return `<main class="screen" style="justify-content:center">
<div class="avatar pop" style="width:56px;height:56px;border-radius:28px" aria-hidden="true">${ICON.check}</div>
<div class="big">YOU GOT THIS !</div>
<p class="sub" style="font-size:18px">Tour de chauffe terminé : te voilà lancée. On continue ?</p>
<button class="btn" data-act="more" data-s="600">Encore 10 minutes</button>
<button class="btn ghost" data-act="more" data-s="1500">Encore 25 minutes</button>
<button class="btn text" data-act="stopnow">Je m'arrête là</button></main>`;
  }
  if (F.phase === 'ended') {
    return `<main class="screen" style="justify-content:center">
<div class="big">La voiture a fini ses tours.</div>
<p class="sub" style="font-size:18px">Où en es-tu ?</p>
<button class="btn" data-act="finish">C'est fait</button>
<button class="btn ghost" data-act="more" data-s="300">Un tour bonus · 5 minutes</button>
<button class="btn text" data-act="stopnow">Reprendre plus tard</button></main>`;
  }
  if (F.phase === 'stopped') {
    return `<main class="screen" style="justify-content:center">
<div class="big">C'est déjà bien.</div>
<p class="sub" style="font-size:18px">Tu as commencé, et c'est le plus dur. La tâche reste là pour plus tard, sans pression.</p>
<button class="btn" data-act="leave">Retour à ma journée</button></main>`;
  }
  return `<main class="screen" style="justify-content:center">
<div class="big pop">BRAVO ${esc(nameUp())} !</div>
<div class="card pop"><div class="eyebrow" style="color:var(--dark)">TA VOITURE S'AMÉLIORE</div>${carSVG(S.pieces, true)}
<p style="font-size:17px;font-weight:700">${F.part ? esc(F.part) + ' : nouvelle pièce, installée toute seule. ' : ''}${F.lap ? 'Et un tour bouclé, bonus !' : ''}</p></div>
<button class="btn" data-act="leave">Retour à ma journée</button>
<button class="btn ghost" data-act="leave" data-to="garage">Voir ma voiture</button></main>`;
}

/* ---------- Je suis dépassée ---------- */
const SAMPLE = "Alors j'ai le devis à envoyer avant midi, les mails clients, la réunion de lundi à préparer, appeler le dentiste, ranger le bureau et réserver le train pour Noël";
function odCompute(text) {
  const td = today();
  const items = splitItems(text, true).map(makeItem);
  let must = items.filter((it) => it.urgent || (it.due && diffDays(td, it.due) <= 1));
  must.sort((a, b) => (a.due ? diffDays(td, a.due) : 9) - (b.due ? diffDays(td, b.due) : 9));
  must = must.slice(0, 3);
  if (!must.length && items.length) must = [items.find((it) => it.min <= 15) || items[0]];
  return { items, must, rest: items.filter((it) => !must.includes(it)) };
}
function odSummary(must) {
  const list = must.map((t, k) => (k === 0 ? "D'abord, " : 'Ensuite, ') + t.title + ', environ ' + t.min + ' minutes.').join(' ');
  return "Voilà par où commencer. " + list + " Le reste peut attendre. Allez, c'est parti !";
}
let SPEAKING = false;
function speak(text) {
  const synth = window.speechSynthesis;
  if (!synth) { toast("La voix n'est pas disponible sur ce téléphone."); return; }
  if (SPEAKING) { synth.cancel(); SPEAKING = false; render(); return; }
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'fr-FR'; u.rate = 0.92;
  const v = (synth.getVoices() || []).find((x) => /^fr/i.test(x.lang));
  if (v) u.voice = v;
  u.onend = u.onerror = () => { SPEAKING = false; if (UI.route === 'overwhelmed') render(); };
  synth.cancel(); synth.speak(u); SPEAKING = true; render();
}
function viewOverwhelmed() {
  const od = UI.od;
  const back = `<button class="btn text" style="align-self:flex-start;gap:6px;padding:0" data-act="odleave">${ICON.back} Retour</button>`;
  const heads = {
    input: ['Par quoi commencer ?', "Liste tout ce que tu as à faire, même en vrac. Je trie et je te dis quoi faire en premier."],
    thinking: ['Je trie…', 'Une seconde.'],
    result: ['Voilà par où commencer.', 'Le reste peut attendre, je le garde pour plus tard.']
  };
  let body = `<div><h1>${heads[od.phase][0]}</h1><p class="sub" style="margin-top:6px">${heads[od.phase][1]}</p></div>`;
  if (od.phase === 'result') {
    const r = odCompute(od.text);
    const reasons = (it, k) => (it.due && diffDays(today(), it.due) <= 1 ? (k === 0 && r.must.length === 1 ? "Elle a une échéance, donc on commence par là." : 'Elle a une échéance proche. Une à la fois.') : "Rien d'urgent aujourd'hui : on commence par une seule, simple.");
    body += `<div class="card pop"><div class="eyebrow" style="color:var(--dark)">À FAIRE EN PREMIER</div>
${r.must.map((t, k) => `<div class="row" style="align-items:flex-start;gap:12px;padding:12px;border-radius:18px;border:2px solid ${k === 0 ? 'var(--main)' : 'transparent'};background:${k === 0 ? '#fff' : 'var(--bg)'}"><div class="avatar" style="width:30px;height:30px;font-size:15px;background:${k === 0 ? 'var(--main)' : '#C9C3D6'};color:${k === 0 ? '#fff' : '#17161F'}">${k + 1}</div><div style="flex:1;display:flex;flex-direction:column;gap:4px"><div style="font-size:17px;font-weight:800;line-height:1.2">${esc(t.title)}</div><div class="muted" style="font-size:14px;font-weight:700">Environ ${t.min} min</div><div style="font-size:14px;font-weight:600;color:var(--ink2);line-height:1.3">${esc(reasons(t, k))}</div></div></div>`).join('')}
<button class="btn ghost" data-act="speak" aria-pressed="${SPEAKING}">${ICON.speaker}${SPEAKING ? 'Arrêter la voix' : 'Écouter le résumé'}</button>
<button class="btn" data-act="odstart">Voir ma journée</button></div>
<p class="muted" style="font-size:15px;font-weight:600;line-height:1.4">Tout est déjà enregistré. Tu n'as rien à retenir ni à valider.</p>
${r.rest.length ? `<button class="btn text" style="align-self:flex-start" data-act="odrest">${od.restOpen ? 'Cacher' : 'Voir ce qui attend, si tu veux'}</button>${od.restOpen ? `<div style="display:flex;flex-direction:column;gap:6px">${r.rest.map((x) => `<div class="slot" style="min-height:44px;background:var(--bg)">${esc(x.title)}</div>`).join('')}</div>` : ''}` : ''}
<button class="btn ghost small" style="align-self:flex-start" data-act="odedit">Ce n'est pas tout à fait ça</button>`;
  }
  const composer = od.phase === 'input' ? `<div style="background:#fff;border-radius:26px 26px 0 0;box-shadow:0 -6px 24px rgba(40,30,70,.08);padding:12px 18px calc(env(safe-area-inset-bottom) + 14px);display:flex;flex-direction:column;gap:10px">
${micNote()}
<label for="odIn" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">Tout ce que tu as à faire</label>
<textarea id="odIn" class="input" data-draft="odIn" placeholder="Ex : devis à envoyer, appeler le dentiste, ranger le bureau…">${esc(UI.drafts.odIn || '')}</textarea>
<div class="row" style="gap:10px">${micButton('odIn')}<button class="btn text" style="flex:1;justify-content:flex-start;padding:0" data-act="odsample">Essayer avec un exemple</button><button class="btn" data-act="odsend">Trouver l'ordre</button></div></div>` : '';
  return `<main class="screen" style="padding-bottom:12px">${back}<div style="display:flex;flex-direction:column;gap:14px">${body}</div></main>${composer}`;
}

/* Applique tout de suite ce qu'elle a dit : rien à valider, rien à perdre. */
function odApply() {
  const r = odCompute(UI.od.text);
  const before = { plan: JSON.parse(JSON.stringify(S.plan)), ids: S.tasks.map((t) => t.id), prio: {} };
  S.tasks.forEach((t) => { before.prio[t.id] = !!t.prio; });
  const exist = (title) => S.tasks.find((t) => !t.done && (t.group || t.title).toLowerCase() === title.toLowerCase());
  r.items.forEach((it) => { if (!exist(it.title)) createTasks([it]); });
  const ids = [];
  r.must.forEach((it) => {
    const grp = S.tasks.filter((t) => !t.done && (t.group || t.title).toLowerCase() === it.title.toLowerCase()).sort((a, b) => (a.order || 0) - (b.order || 0));
    grp.forEach((t) => { t.prio = true; });
    if (grp[0] && !ids.includes(grp[0].id)) ids.push(grp[0].id);
  });
  S.plan = { date: today(), ids, bonus: false, locked: true };
  UI.od.undo = before;
  UI.cur = 0;
  save();
}
function odFinish() { UI.od.restOpen = false; render(); }
function odUndo() {
  const b = UI.od.undo;
  if (!b) return;
  S.tasks = S.tasks.filter((t) => b.ids.includes(t.id));
  S.tasks.forEach((t) => { t.prio = !!b.prio[t.id]; });
  S.plan = b.plan;
  UI.od.undo = null;
  save();
}

/* ---------- Dictée ---------- */
function dictate(inputId, after, prefix) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const kb = "La dictée de l'appli ne marche pas ici. Touche le micro de ton clavier, en bas à droite : ça marche pareil.";
  if (REC) { try { REC.stop(); } catch (e) {} return; }
  if (window.navigator.standalone) {
    UI.micMsg = "Sur iPhone, dans l'appli installée, c'est le micro de ton clavier qui dicte : touche-le, en bas à droite du clavier.";
    render();
    toast(UI.micMsg, 6000);
    const el0 = document.getElementById(inputId);
    if (el0) el0.focus();
    return;
  }
  if (!SR) { UI.micMsg = kb; render(); return; }
  const rec = new SR();
  REC = rec;
  rec.lang = 'fr-FR'; rec.interimResults = true; rec.continuous = true;
  let got = '', err = '';
  rec.onresult = (ev) => {
    let t = '';
    for (let i = 0; i < ev.results.length; i++) t += ev.results[i][0].transcript;
    got = (prefix ? prefix + ' ' : '') + t;
    const el = document.getElementById(inputId);
    if (el) el.value = got;
  };
  rec.onerror = (ev) => {
    err = (ev && ev.error) || 'inconnue';
    UI.micMsg = err === 'no-speech' ? "Je n'ai rien entendu. On réessaie quand tu veux." : kb + ' (code : ' + err + ')';
  };
  rec.onend = () => {
    REC = null; UI.listening = false;
    if (!got.trim() && !UI.micMsg) UI.micMsg = kb + ' (la dictée s\'est arrêtée toute seule)';
    if (got.trim()) after(got.trim());
    else { render(); const el = document.getElementById(inputId); if (el) el.focus(); }
  };
  try { rec.start(); UI.listening = true; UI.micMsg = ''; render(); } catch (e) { REC = null; UI.micMsg = kb; render(); }
}

/* ---------- Actions ---------- */
function go(r) {
  if (REC) { try { REC.abort(); } catch (e) {} REC = null; }
  UI.listening = false; UI.micMsg = ''; UI.route = r; UI.sheet = false;
  if (r === 'dump') UI.dump.last = null;
  if (r === 'overwhelmed') UI.od = { phase: 'input', text: '', items: [], restOpen: false };
  render();
  const sc = document.querySelector('.screen');
  if (sc) sc.scrollTop = 0;
}
function whenDate() {
  const w = UI.when;
  if (w.mode === 'tomorrow') return addDays(today(), 1);
  if (w.mode === 'date' && w.date && w.date > today()) return w.date;
  return null;
}
function fmtDate(ds) {
  const p = ds.split('-').map(Number);
  return new Date(p[0], p[1] - 1, p[2]).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}
function addFromDump(text, forcedDate) {
  const items = splitItems(text, false).map(makeItem);
  if (!items.length) return;
  const date = forcedDate === undefined ? whenDate() : forcedDate;
  if (date) items.forEach((it) => { it.due = date; it.urgent = false; if (date > today()) it.pin = date; });
  const made = createTasks(items);
  ensurePlan();
  // une échéance aujourd'hui passe devant, sans bousculer ce qu'elle a déjà fait
  made.forEach((t) => {
    if (t.due && diffDays(today(), t.due) <= 0 && eligible(t, today()) && !S.plan.ids.includes(t.id) && !S.plan.locked) {
      const k = S.plan.ids.map(byId).reverse().find((x) => !x.done && score(x) < score(t));
      if (k) { S.plan.ids[S.plan.ids.indexOf(k.id)] = t.id; }
    }
  });
  save();
  UI.dump.last = made;
  UI.when = { mode: 'auto', date: '' };
  setDraft('dumpIn', '');
  render();
}
const ACTIONS = {
  go: (d) => go(d.r),
  cur: (d) => { UI.cur = Number(d.i); render(); },
  done: (d) => { const r = complete(d.id); UI.cur = 0; UI.flash = r.gain; if (r.lap) toast('Tour bouclé, quelle pilote !', 3500); render(); },
  swap: (d) => {
    const t = byId(d.id); t.skipUntil = addDays(today(), 1); save(); UI.cur = 0;
    const n = ensurePlan().length; save();
    toast(n < 3 ? 'Pas de souci, je la garde pour demain.' : 'Pas de souci, voici une autre.', 3000);
    render();
  },
  sheet: () => { UI.sheet = true; render(); },
  sheetx: () => { UI.sheet = false; render(); },
  sheetall: () => { UI.sheet = 'all'; render(); },
  rmtask: (d) => { S.tasks = S.tasks.filter((x) => x.id !== d.id); ensurePlan(); save(); render(); },
  weekday: (d) => { UI.week = Number(d.i); render(); },
  later: (d) => { const t = byId(d.id); t.pin = addDays(today(), Number(d.i) + 1); save(); toast('Déplacée au lendemain.', 2500); render(); },
  undo: () => { (UI.dump.last || []).forEach((t) => { S.tasks = S.tasks.filter((x) => x.id !== t.id); }); UI.dump.last = []; ensurePlan(); save(); render(); },
  rmstep: (d) => { S.tasks = S.tasks.filter((x) => x.id !== d.id); UI.dump.last = UI.dump.last.filter((x) => x.id !== d.id); ensurePlan(); save(); render(); },
  mic: (d) => {
    const id = d.input;
    if (id === 'dumpIn') dictate(id, (txt) => { addFromDump(txt); });
    else { const el = document.getElementById('odIn'); const pre = (el ? el.value : '').trim(); dictate(id, (txt) => { setDraft('odIn', txt); render(); }, pre); }
  },
  when: (d) => { UI.when.mode = d.m; if (d.m !== 'date') UI.when.date = ''; render(); },
  helmet: (d) => { S.helmet = Number(d.i); save(); toast(HELMETS[S.helmet].label + ' : ta voiture et ton casque changent de couleur.', 2500); render(); },
  accent: (d) => { S.accent = d.v; save(); render(); },
  adapt: (d) => { S.adapt[Number(d.i)] = !S.adapt[Number(d.i)]; save(); render(); },
  savesettings: () => { const n = (UI.drafts.stName || '').trim(); if (n) S.name = n; S.fan = (UI.drafts.stFan != null ? UI.drafts.stFan : S.fan).trim(); delete UI.drafts.stName; delete UI.drafts.stFan; save(); toast('Enregistré.', 2000); render(); },
  demo: () => {
    createTasks(['Envoyer le devis avant midi', 'Appeler le dentiste', 'Préparer la présentation de lundi', 'Répondre aux mails clients', 'Réserver le train pour Noël', 'Ranger le bureau'].map(makeItem));
    ensurePlan(); save(); toast('Voilà un exemple pour tester.', 2500); go('today');
  },
  resetask: () => { UI.resetAsk = true; render(); },
  resetno: () => { UI.resetAsk = false; render(); },
  reset: () => { const keep = S.name; S = defaults(); S.name = ''; UI.resetAsk = false; save(); go('today'); },
  /* focus */
  focus: (d) => {
    F = { taskId: d.id, phase: 'ready', planned: S.adapt[2] ? 120 : 600, startedAt0: Date.now() };
    UI.route = 'focus'; startRun(F.planned);
  },
  dur: (d) => { F.planned = Number(d.s); render(); },
  start: () => { F.startedAt0 = Date.now(); startRun(F.planned); },
  showel: () => { F.showEl = true; render(); },
  pause: () => {
    if (F.running) { F.acc += (Date.now() - F.startedAt); F.running = false; }
    else { F.startedAt = Date.now(); F.running = true; }
    render();
  },
  finish: () => finishTask(),
  more: (d) => { F.extended = true; startRun(Number(d.s)); },
  stopnow: () => { F.phase = 'stopped'; render(); },
  leave: (d) => { stopTick(); F = null; go(d && d.to ? d.to : 'today'); },
  /* dépassée */
  odleave: () => go('today'),
  odsample: () => { setDraft('odIn', SAMPLE); render(); },
  odsend: () => {
    captureDrafts();
    const text = (UI.drafts.odIn || '').trim();
    if (!text || !splitItems(text, true).length) return;
    UI.od = { phase: 'result', text, restOpen: false };
    odApply();
    setDraft('odIn', '');
    render();
  },
  odedit: () => { odUndo(); UI.drafts.odIn = UI.od.text;  UI.od.phase = 'input'; if (window.speechSynthesis) window.speechSynthesis.cancel(); SPEAKING = false; render(); },
  odrest: () => { UI.od.restOpen = !UI.od.restOpen; render(); },
  speak: () => speak(odSummary(odCompute(UI.od.text).must)),
  odapply: () => { odFinish(); },
  odstart: () => { if (window.speechSynthesis) window.speechSynthesis.cancel(); SPEAKING = false; UI.cur = 0; toast("C'est rangé. Aujourd'hui, juste ça.", 3500); go('today'); }
};

/* ---------- Boucle d'affichage ---------- */
function setDraft(id, v) {
  UI.drafts[id] = v;
  const el = document.getElementById(id);
  if (el) el.value = v;
}
function captureDrafts() {
  document.querySelectorAll('[data-draft]').forEach((el) => { UI.drafts[el.dataset.draft] = el.value; });
}
function render() {
  captureDrafts();
  document.documentElement.dataset.accent = S.accent;
  let html;
  if (!S.name) html = viewOnboarding();
  else if (UI.route === 'focus' && F) html = viewFocus();
  else if (UI.route === 'week') html = viewWeek();
  else if (UI.route === 'dump') html = viewDump();
  else if (UI.route === 'garage') html = viewGarage();
  else if (UI.route === 'settings') html = viewSettings();
  else if (UI.route === 'overwhelmed') html = viewOverwhelmed();
  else { UI.route = 'today'; html = viewToday(); UI.flash = 0; }
  save();
  const appEl = document.getElementById('app');
  appEl.innerHTML = html;
  appEl.className = appEl.querySelector('.nav') ? '' : 'nonav';
  refreshUpdateBanner();
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  if (b.classList.contains('sheet-bg') && e.target !== b) return;
  const fn = ACTIONS[b.dataset.act];
  if (fn) fn(b.dataset);
});
document.addEventListener('change', (e) => {
  if (e.target && e.target.dataset && e.target.dataset.actChange === 'whendate') { UI.when.date = e.target.value; }
});
document.addEventListener('submit', (e) => {
  const f = e.target.closest('[data-form]');
  if (!f) return;
  e.preventDefault();
  const inp = f.querySelector('input');
  const v = inp ? inp.value.trim() : '';
  if (f.dataset.form === 'onboard') {
    if (!v) { inp.focus(); return; }
    S.name = v;
    const first = (document.getElementById('first') || {}).value || '';
    const items = splitItems(first.trim(), false).map(makeItem);
    if (items.length) { items.forEach((it) => { it.due = today(); }); createTasks(items); ensurePlan(); }
    save(); UI.route = 'today'; render();
  } else if (f.dataset.form === 'dump') {
    if (v && UI.when.mode === 'date' && !whenDate()) { toast("Choisis d'abord le jour, juste au-dessus.", 3000); return; }
    if (v) addFromDump(v);
  } else if (f.dataset.form === 'weekadd') {
    if (!v) return;
    const i = Number(f.dataset.i);
    const ds = addDays(today(), i);
    addFromDump(v, ds);
    UI.route = 'week'; UI.week = i;
    toast('Noté pour ' + (i === 0 ? "aujourd'hui" : i === 1 ? 'demain' : 'le ' + fmtDate(ds)) + '.', 2800);
    setDraft('weekIn', ''); render();
  } else if (f.dataset.form === 'idea') {
    if (!v) return;
    createTasks([makeItem(v)]); save(); inp.value = '';
    toast('Noté. Je le garde pour plus tard, tu peux continuer.', 3000);
  }
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && S.name && UI.route === 'today') render();
});
let UPDATE_READY = null;
function refreshUpdateBanner() {
  const el = document.getElementById('update');
  if (el) el.hidden = !(UPDATE_READY && !(F && F.phase === 'run'));
}
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then((reg) => {
      const watch = (w) => w && w.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) { UPDATE_READY = w; refreshUpdateBanner(); }
      });
      if (reg.waiting && navigator.serviceWorker.controller) { UPDATE_READY = reg.waiting; refreshUpdateBanner(); }
      reg.addEventListener('updatefound', () => watch(reg.installing));
      document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
      reg.update().catch(() => {});
    }).catch(() => {});
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloading) return; reloading = true; location.reload(); });
  });
}
document.addEventListener('click', (e) => {
  if (e.target.closest('#update button') && UPDATE_READY) UPDATE_READY.postMessage('skip');
});
window.__charlie = { isBig, stepsFor, tick, go, get S() { return S; }, get UI() { return UI; }, get F() { return F; }, render, ACTIONS, addFromDump, scheduleWeek, ensurePlan, parseDue, splitItems, odCompute };
render();
