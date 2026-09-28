// طبقة البيانات: وضع حقيقي (Supabase + /api) أو وضع تجريبي عند عدم الإعداد
import { DEMO_VIDEOS, DEMO_CATEGORIES, DEMO_USERS } from './demo.js';

let sb = null;
let mode = 'demo';
let session = null;
let profile = null;
let setupInfo = null;

async function api(path, body, method = 'POST') {
  const headers = { 'Content-Type': 'application/json' };
  if (session?.access_token) headers.Authorization = 'Bearer ' + session.access_token;
  const r = await fetch('/api/' + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = {};
  try { data = await r.json(); } catch { /* */ }
  if (!r.ok) { const e = new Error(data.error || `خطأ ${r.status}`); e.code = data.code; throw e; }
  return data;
}

function chk({ data, error }) {
  if (error) throw new Error(translateErr(error.message));
  return data;
}

function translateErr(m = '') {
  if (/Invalid login credentials/i.test(m)) return 'البريد أو كلمة المرور غير صحيحة';
  if (/Email not confirmed/i.test(m)) return 'أكّد بريدك الإلكتروني أولاً من الرسالة التي وصلتك';
  if (/already registered/i.test(m)) return 'هذا البريد مسجّل مسبقاً، سجّل الدخول';
  if (/Password should be/i.test(m)) return 'كلمة المرور قصيرة (6 أحرف على الأقل)';
  if (/rate limit/i.test(m)) return 'محاولات كثيرة، انتظر قليلاً ثم أعد المحاولة';
  if (/relation .* does not exist/i.test(m)) return 'قاعدة البيانات غير مُعدّة: شغّل ملف schema.sql في Supabase';
  return m;
}

// ================================================================ التهيئة
export async function init() {
  try {
    const r = await fetch('/api/config', { cache: 'no-store' });
    if (r.ok) setupInfo = await r.json();
  } catch { /* لا يوجد خادم (معاينة محلية) */ }

  if (setupInfo?.supabaseUrl && setupInfo?.supabaseAnonKey) {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    sb = createClient(setupInfo.supabaseUrl, setupInfo.supabaseAnonKey, { auth: { persistSession: true, detectSessionInUrl: true } });
    mode = 'live';
    const { data } = await sb.auth.getSession();
    session = data.session;
    sb.auth.onAuthStateChange((_e, s) => { session = s; });
    if (session) await loadProfile();
  } else {
    mode = 'demo';
    if (safeGet('m512-demo')) { session = { demo: true }; profile = demoState.users[0]; }
  }
  return { mode, setupInfo };
}

export const getMode = () => mode;
export const getSession = () => session;
export const getProfile = () => profile;
export const isAdmin = () => profile?.role === 'admin' && profile?.status === 'active';

async function loadProfile() {
  const { data, error } = await sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
  if (error) throw new Error(translateErr(error.message));
  profile = data;
  return profile;
}

// ================================================================ الحساب
export async function signIn(email, password) {
  if (mode === 'demo') { session = { demo: true }; profile = demoState.users[0]; try { sessionStorage.setItem('m512-demo', '1'); } catch { /* */ } return; }
  const data = chk(await sb.auth.signInWithPassword({ email, password }));
  session = data.session;
  await loadProfile();
}

export async function signUp(email, password, full_name) {
  if (mode === 'demo') return { needsConfirm: false };
  const data = chk(await sb.auth.signUp({ email, password, options: { data: { full_name }, emailRedirectTo: location.origin } }));
  session = data.session;
  if (session) await loadProfile();
  return { needsConfirm: !data.session };
}

export async function resetPassword(email) {
  if (mode === 'demo') return;
  chk(await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + '/#/settings' }));
}

export async function updatePassword(pw) {
  if (mode === 'demo') return;
  chk(await sb.auth.updateUser({ password: pw }));
}

export async function signOut() {
  if (mode === 'demo') { try { sessionStorage.removeItem('m512-demo'); } catch { /* */ } session = null; profile = null; return; }
  await sb.auth.signOut();
  session = null; profile = null;
}

export async function refreshProfile() { if (mode === 'live' && session) await loadProfile(); return profile; }

export async function updateMyName(name) {
  if (mode === 'demo') { profile.full_name = name; return; }
  chk(await sb.rpc('update_my_name', { new_name: name }));
  profile.full_name = name;
}

export async function regenerateToken() {
  if (mode === 'demo') { profile.ext_token = crypto.randomUUID(); return profile.ext_token; }
  const t = chk(await sb.rpc('regenerate_ext_token'));
  profile.ext_token = t;
  return t;
}

// ================================================================ الفيديوهات
const COLS = 'id,platform,external_id,url,title,thumbnail_url,channel_name,channel_followers,language,category,views,likes,comments,shares,duration_sec,published_at,score,score_parts,analysis_status,analysis_mode,analysis->viral_reasons,analysis->summary,created_at';

export async function listVideos({ platform, limit = 600 } = {}) {
  if (mode === 'demo') return demoState.videos.filter((v) => !platform || v.platform === platform).map(slim);
  let q = sb.from('videos').select(COLS).order('score', { ascending: false }).limit(limit);
  if (platform) q = q.eq('platform', platform);
  return chk(await q);
}

function slim(v) { return { ...v, viral_reasons: v.analysis?.viral_reasons, summary: v.analysis?.summary }; }

export async function getVideo(id) {
  if (mode === 'demo') return demoState.videos.find((v) => v.id === id) || null;
  return chk(await sb.from('videos').select('*').eq('id', id).maybeSingle());
}

export async function search(params) {
  if (mode === 'demo') {
    await wait(700);
    const q = (params.query || params.category || '').trim();
    let vids = demoState.videos.filter((v) => v.platform === params.platform);
    if (q) {
      const hit = vids.filter((v) => (v.category || '').includes(q) || (v.title || '').includes(q));
      if (hit.length) vids = hit;
    }
    return { videos: vids.map(slim), cached: false, units: params.mode === 'trending' ? 3 : 102 };
  }
  const r = await api('search', params);
  r.videos = r.videos.map(slim);
  return r;
}

export async function ingest(body) {
  if (mode === 'demo') {
    await wait(900);
    throw Object.assign(new Error('الإضافة بالرابط تعمل بعد ربط المنصة بـ Supabase و Vercel. هذه نسخة عرض فقط'), { code: 'demo' });
  }
  return api('ingest', body);
}

export async function analyze(id, force = false) {
  if (mode === 'demo') {
    await wait(1400);
    const v = demoState.videos.find((x) => x.id === id);
    if (!v.analysis) { v.analysis = DEMO_VIDEOS[0].analysis; v.analysis_status = 'done'; v.analysis_mode = 'video'; }
    return { video: v };
  }
  return api('analyze', { video_id: id, force });
}

export async function updateVideo(id, patch) {
  if (mode === 'demo') { Object.assign(demoState.videos.find((v) => v.id === id), patch); return; }
  chk(await sb.from('videos').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id));
}

export async function deleteVideo(id) {
  if (mode === 'demo') { demoState.videos = demoState.videos.filter((v) => v.id !== id); return; }
  chk(await sb.from('videos').delete().eq('id', id));
}

// ================================================================ المفضلة
export async function favoriteIds() {
  if (mode === 'demo') return new Set(demoState.favs);
  const rows = chk(await sb.from('favorites').select('video_id').eq('user_id', session.user.id));
  return new Set(rows.map((r) => r.video_id));
}

export async function listFavorites() {
  if (mode === 'demo') return demoState.videos.filter((v) => demoState.favs.has(v.id)).map(slim);
  const rows = chk(await sb.from('favorites').select(`created_at, videos(${COLS})`).eq('user_id', session.user.id).order('created_at', { ascending: false }));
  return rows.map((r) => r.videos).filter(Boolean);
}

export async function toggleFavorite(id, on) {
  if (mode === 'demo') { on ? demoState.favs.add(id) : demoState.favs.delete(id); return; }
  if (on) chk(await sb.from('favorites').upsert({ user_id: session.user.id, video_id: id }));
  else chk(await sb.from('favorites').delete().eq('user_id', session.user.id).eq('video_id', id));
}

// ================================================================ التصنيفات والإعدادات
export async function categories() {
  if (mode === 'demo') return demoState.categories;
  return chk(await sb.from('categories').select('*').order('sort'));
}

export async function addCategory(c) {
  if (mode === 'demo') { demoState.categories.push({ id: Date.now(), ...c }); return; }
  chk(await sb.from('categories').insert(c));
}

export async function deleteCategory(id) {
  if (mode === 'demo') { demoState.categories = demoState.categories.filter((c) => c.id !== id); return; }
  chk(await sb.from('categories').delete().eq('id', id));
}

export async function settings() {
  if (mode === 'demo') return { ...demoState.settings };
  const rows = chk(await sb.from('settings').select('key,value'));
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

const PUBLIC_KEYS = new Set(['youtube_region', 'youtube_period_days', 'youtube_results', 'youtube_duration', 'search_cache_hours',
  'students_can_search', 'shorts_max_seconds', 'tiktok_server_fetch', 'instagram_server_fetch', 'students_can_add',
  'auto_analyze_on_add', 'auto_analyze_on_open', 'tier_thresholds']);

export async function saveSettings(obj) {
  if (mode === 'demo') { Object.assign(demoState.settings, obj); return; }
  const rows = Object.entries(obj).map(([key, value]) => ({ key, value, is_public: PUBLIC_KEYS.has(key), updated_at: new Date().toISOString() }));
  chk(await sb.from('settings').upsert(rows));
}

export async function testKeys() {
  if (mode === 'demo') { await wait(800); return { youtube: { ok: false, message: 'وضع العرض: لا يوجد خادم' }, gemini: { ok: false, message: 'وضع العرض: لا يوجد خادم' }, ytdlp: { ok: false, message: 'وضع العرض' } }; }
  return api('admin', { action: 'test_keys' });
}

// ================================================================ المستخدمون والإحصاءات
export async function users() {
  if (mode === 'demo') return demoState.users;
  return chk(await sb.from('profiles').select('*').order('created_at', { ascending: false }));
}

export async function updateUser(id, patch) {
  if (mode === 'demo') { Object.assign(demoState.users.find((u) => u.id === id), patch); return; }
  chk(await sb.from('profiles').update(patch).eq('id', id));
}

export async function createUser(body) {
  if (mode === 'demo') { demoState.users.push({ id: crypto.randomUUID(), email: body.email, full_name: body.full_name, role: 'student', status: 'active', created_at: new Date().toISOString() }); return; }
  return api('admin', { action: 'create_user', ...body });
}

export async function deleteUser(id) {
  if (mode === 'demo') { demoState.users = demoState.users.filter((u) => u.id !== id); return; }
  return api('admin', { action: 'delete_user', user_id: id });
}

export async function stats() {
  const today = new Date().toISOString().slice(0, 10);
  if (mode === 'demo') {
    const vids = demoState.videos;
    return {
      videos: vids.length, analyzed: vids.filter((v) => v.analysis_status === 'done').length,
      byPlatform: Object.fromEntries(['youtube', 'shorts', 'tiktok', 'instagram'].map((p) => [p, vids.filter((v) => v.platform === p).length])),
      users: demoState.users.length, pending: demoState.users.filter((u) => u.status === 'pending').length,
      usage: { youtube: 1324, gemini: 17 }, keys: { youtube: false, gemini: false },
    };
  }
  const count = async (q) => (await q).count || 0;
  const head = { count: 'exact', head: true };
  const [videos, analyzed, yt, sh, tt, ig, usersN, pending, usage, s] = await Promise.all([
    count(sb.from('videos').select('id', head)),
    count(sb.from('videos').select('id', head).eq('analysis_status', 'done')),
    count(sb.from('videos').select('id', head).eq('platform', 'youtube')),
    count(sb.from('videos').select('id', head).eq('platform', 'shorts')),
    count(sb.from('videos').select('id', head).eq('platform', 'tiktok')),
    count(sb.from('videos').select('id', head).eq('platform', 'instagram')),
    count(sb.from('profiles').select('id', head)),
    count(sb.from('profiles').select('id', head).eq('status', 'pending')),
    sb.from('usage').select('service,units').eq('day', today),
    sb.from('settings').select('key,value').in('key', ['youtube_api_key', 'gemini_api_key']),
  ]);
  const u = Object.fromEntries((usage.data || []).map((r) => [r.service, r.units]));
  const k = Object.fromEntries((s.data || []).map((r) => [r.key, !!r.value]));
  return {
    videos, analyzed, byPlatform: { youtube: yt, shorts: sh, tiktok: tt, instagram: ig },
    users: usersN, pending, usage: { youtube: u.youtube || 0, gemini: u.gemini || 0 },
    keys: { youtube: !!k.youtube_api_key, gemini: !!k.gemini_api_key },
  };
}

// ================================================================ بيانات وضع العرض
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const demoState = {
  videos: DEMO_VIDEOS.map((v) => ({ ...v })),
  categories: DEMO_CATEGORIES.map((c) => ({ ...c })),
  users: DEMO_USERS.map((u) => ({ ...u })),
  favs: new Set([DEMO_VIDEOS[0].id, DEMO_VIDEOS[3].id]),
  settings: {
    youtube_api_key: '', gemini_api_key: '', gemini_model: 'gemini-3.5-flash', gemini_fallback_model: 'gemini-3.5-flash-lite',
    youtube_region: 'SA', youtube_period_days: 30, youtube_results: 25, youtube_duration: 'medium', search_cache_hours: 12,
    students_can_search: true, shorts_max_seconds: 180, tiktok_server_fetch: true, instagram_server_fetch: true,
    students_can_add: true, auto_analyze_on_add: true, auto_analyze_on_open: true,
    tier_thresholds: { mega: 80, viral: 65, hot: 50, good: 35 },
  },
};

function safeGet(k) { try { return sessionStorage.getItem(k); } catch { return null; } }
