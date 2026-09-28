// M512 Viral Content — إضافة كروم
const $ = (id) => document.getElementById(id);
const PLAT = { youtube: 'يوتيوب', shorts: 'يوتيوب شورتس', tiktok: 'تيك توك', instagram: 'إنستغرام ريلز' };
const TIERS = [[80, 'انفجار فيروسي'], [65, 'فيروسي'], [50, 'ناجح جداً'], [35, 'ناجح'], [0, 'عادي']];
let cfg = {}, tab = null, page = null, platform = null, lastVideo = null;

function show(id) { ['vSettings', 'vNone', 'vAdd', 'vResult'].forEach((v) => $(v).classList.toggle('hidden', v !== id)); }
function msg(el, text, type = 'err') { $(el).innerHTML = text ? `<div class="msg ${type}"></div>` : ''; if (text) $(el).firstChild.textContent = text; }
const compact = (n) => { n = Number(n) || 0; return n >= 1e9 ? (n / 1e9).toFixed(1) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(n); };

function detect(url) {
  try {
    const u = new URL(url), h = u.hostname.replace(/^www\.|^m\./, '');
    if (h === 'youtube.com' && u.pathname.startsWith('/shorts/')) return 'shorts';
    if (h === 'youtube.com' && u.pathname === '/watch' && u.searchParams.get('v')) return 'youtube';
    if (h === 'youtu.be') return 'youtube';
    if (h.endsWith('tiktok.com') && /\/(video|photo)\/\d+/.test(u.pathname)) return 'tiktok';
    if (h.endsWith('instagram.com') && /\/(reel|reels|p|tv)\/[\w-]+/.test(u.pathname)) return 'instagram';
  } catch { /* */ }
  return null;
}

async function api(path, body) {
  const r = await fetch(cfg.site.replace(/\/$/, '') + '/api/' + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', 'X-M512-Token': cfg.token },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await r.json(); } catch { /* */ }
  if (!r.ok) throw new Error(data.error || `تعذّر الاتصال بالمنصة (${r.status})`);
  return data;
}

// تعمل داخل الصفحة المفتوحة: تقرأ البيانات الظاهرة للمستخدم
function extractFromPage() {
  const out = { url: location.href.split('#')[0] };
  const meta = (p) => document.querySelector(`meta[property="${p}"], meta[name="${p}"]`)?.content || '';
  const host = location.hostname;
  const txt = (s) => document.querySelector(s)?.textContent?.trim() || '';

  if (host.includes('tiktok.com')) {
    const id = (location.pathname.match(/\/(?:video|photo)\/(\d+)/) || [])[1];
    try {
      const j = JSON.parse(document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__').textContent);
      const it = j.__DEFAULT_SCOPE__['webapp.video-detail'].itemInfo.itemStruct;
      if (it && String(it.id) === id) {
        Object.assign(out, {
          title: it.desc, description: it.desc, thumbnail_url: it.video?.cover || it.video?.originCover,
          views: it.stats?.playCount, likes: it.stats?.diggCount, comments: it.stats?.commentCount, shares: it.stats?.shareCount,
          duration_sec: it.video?.duration, channel_name: it.author?.nickname || it.author?.uniqueId,
          channel_followers: it.authorStats?.followerCount, published_at: it.createTime ? new Date(it.createTime * 1000).toISOString() : undefined,
        });
      }
    } catch { /* الصفحة تغيّرت دون إعادة تحميل */ }
    if (!out.likes) {
      out.likes = txt('[data-e2e="like-count"]') || txt('[data-e2e="browse-like-count"]');
      out.comments = txt('[data-e2e="comment-count"]') || txt('[data-e2e="browse-comment-count"]');
      out.shares = txt('[data-e2e="share-count"]');
      out.title = out.title || txt('[data-e2e="browse-video-desc"]') || txt('[data-e2e="video-desc"]');
      out.channel_name = out.channel_name || txt('[data-e2e="browse-username"]');
    }
    if (!out.thumbnail_url) { const v = document.querySelector('video'); if (v?.poster) out.thumbnail_url = v.poster; }
  } else if (host.includes('instagram.com')) {
    const code = (location.pathname.match(/\/(?:reel|reels|p|tv)\/([\w-]+)/) || [])[1];
    const ogUrl = meta('og:url');
    if (!ogUrl || ogUrl.includes(code)) {
      const d = meta('og:description') || '';
      const m = d.match(/([\d.,]+[KMkm]?)\s+(?:likes?|إعجاب)[^,]*,\s*([\d.,]+[KMkm]?)\s+(?:comments?|تعليق)/);
      if (m) { out.likes = m[1]; out.comments = m[2]; }
      const cap = d.match(/:\s*["“]([\s\S]+)["”]\s*\.?\s*$/);
      out.title = (cap ? cap[1] : meta('og:title')).split('\n')[0].slice(0, 200);
      out.description = cap ? cap[1] : d;
      out.thumbnail_url = meta('og:image');
      const user = d.match(/-\s*([\w.]+)\s+(?:on|في)\s/);
      if (user) out.channel_name = user[1];
    }
  } else {
    out.title = (document.title || '').replace(/ - YouTube$/, '');
    out.thumbnail_url = meta('og:image');
  }
  Object.keys(out).forEach((k) => (out[k] === '' || out[k] == null) && delete out[k]);
  return out;
}

async function start() {
  cfg = await chrome.storage.local.get(['site', 'token', 'cats', 'name']);
  if (!cfg.site || !cfg.token) { fillSettings(); return show('vSettings'); }
  if (cfg.name) $('who').textContent = 'أهلاً ' + cfg.name;

  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  platform = detect(tab?.url || '');
  if (!platform) return show('vNone');

  page = { url: tab.url };
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractFromPage });
    if (res?.result) page = res.result;
  } catch { /* بعض الصفحات تمنع القراءة، نكمل بالرابط */ }

  $('pPlat').textContent = PLAT[platform];
  $('pTitle').textContent = page.title || 'سنجلب العنوان من المنصة';
  const st = [];
  if (page.views) st.push('👁 ' + (isNaN(page.views) ? page.views : compact(page.views)));
  if (page.likes) st.push('♥ ' + (isNaN(page.likes) ? page.likes : compact(page.likes)));
  if (page.comments) st.push('💬 ' + (isNaN(page.comments) ? page.comments : compact(page.comments)));
  $('pStats').textContent = st.join('   ');
  if (page.thumbnail_url) $('pThumb').src = page.thumbnail_url; else $('pThumb').style.display = 'none';
  document.querySelector('.preview').classList.toggle('wide', platform === 'youtube');
  fillCats(cfg.cats || []);
  show('vAdd');
  api('ext').then((r) => { chrome.storage.local.set({ cats: r.categories, name: r.name }); fillCats(r.categories); $('who').textContent = 'أهلاً ' + (r.name || ''); }).catch((e) => msg('addMsg', e.message));
}

function fillCats(list) {
  const sel = $('cat'), cur = sel.value;
  sel.innerHTML = '<option value="">بدون تصنيف</option>' + list.map((c) => `<option>${c.replace(/</g, '&lt;')}</option>`).join('');
  sel.value = cur;
}

function fillSettings() { $('site').value = cfg.site || ''; $('token').value = cfg.token || ''; }

$('gear').onclick = () => { fillSettings(); show('vSettings'); };
$('saveSet').onclick = async () => {
  let site = $('site').value.trim().replace(/\/+$/, ''), token = $('token').value.trim();
  if (site && !/^https?:\/\//.test(site)) site = 'https://' + site;
  if (!site || !token) return msg('setMsg', 'أدخل رابط المنصة ورمزك الخاص');
  cfg = { site, token };
  $('saveSet').disabled = true;
  try {
    const r = await api('ext');
    await chrome.storage.local.set({ site, token, cats: r.categories, name: r.name });
    msg('setMsg', 'تم الربط بنجاح. أهلاً ' + (r.name || ''), 'ok');
    setTimeout(start, 700);
  } catch (e) { msg('setMsg', e.message); }
  $('saveSet').disabled = false;
};

$('addBtn').onclick = async () => {
  const btn = $('addBtn');
  btn.disabled = true; btn.innerHTML = '<span class="spin"></span>نضيف ونحلل… (حتى دقيقة)';
  msg('addMsg', '');
  try {
    const r = await api('ingest', { url: page.url || tab.url, category: $('cat').value, language: $('lang').value, page_data: page, source: 'extension', analyze: true });
    lastVideo = r.video;
    showResult(r);
  } catch (e) { msg('addMsg', e.message); }
  btn.disabled = false; btn.textContent = 'أضف وحلّل';
};

$('copyLink').onclick = async () => { await navigator.clipboard.writeText(tab.url); msg('addMsg', 'نُسخ الرابط', 'ok'); };

function showResult(r) {
  const v = r.video, a = v.analysis || {};
  $('rScore').textContent = Math.round(v.score || 0);
  $('rTier').textContent = TIERS.find(([t]) => (v.score || 0) >= t)[1];
  $('rSummary').textContent = a.summary || (r.analyzed ? '' : 'أُضيف المقطع. افتح المنصة لتحليله.');
  $('rReasons').innerHTML = '';
  (a.viral_reasons || []).slice(0, 4).forEach((x) => { const li = document.createElement('li'); li.textContent = x; $('rReasons').append(li); });
  $('rWarn').innerHTML = '';
  (r.warnings || []).forEach((w) => { const d = document.createElement('div'); d.className = 'msg err'; d.textContent = w; $('rWarn').append(d); });
  $('rCopy').classList.toggle('hidden', !v.analysis);
  show('vResult');
}

$('rOpen').onclick = () => chrome.tabs.create({ url: `${cfg.site}/#/video/${lastVideo.id}` });
$('openSite').onclick = () => cfg.site && chrome.tabs.create({ url: cfg.site });
document.querySelectorAll('[data-go]').forEach((a) => a.onclick = () => chrome.tabs.update({ url: a.dataset.go }).then(() => window.close()));

$('rCopy').onclick = async () => {
  const v = lastVideo, a = v.analysis || {};
  const text = [
    'اكتب لي سكريبت بمهارة mofeed-script-writing، مستوحى من هذا المقطع الفيروسي (لا تنسخه، استلهم أسباب نجاحه):', '',
    `الرابط: ${v.url}`, `المنصة: ${PLAT[v.platform]}`, `العنوان: ${v.title || ''}`,
    `الأرقام: ${v.views} مشاهدة · ${v.likes} إعجاب · ${v.comments} تعليق · درجة الانتشار ${Math.round(v.score || 0)}/100`, '',
    a.hook ? `الهوك: ${a.hook.moment || ''} (${a.hook.type || ''}) — ${a.hook.why || ''}` : '',
    a.viral_reasons?.length ? 'أسباب الانتشار:\n' + a.viral_reasons.map((x, i) => `${i + 1}. ${x}`).join('\n') : '',
    a.formula ? `القالب: ${a.formula}` : '', '',
    a.transcript ? `النص المنطوق:\n${a.transcript}` : '', '',
    a.scenes?.length ? 'المشاهد:\n' + a.scenes.map((s) => `${s.time} | ${s.visual} | ${s.audio}`).join('\n') : '', '',
    'موضوعي أنا: [اكتب هنا فكرتك أو مجالك]',
  ].filter((l, i, arr) => l !== '' || arr[i - 1] !== '').join('\n');
  await navigator.clipboard.writeText(text);
  $('rCopy').textContent = 'نُسخ ✓ الصقه في Claude';
};

start();
