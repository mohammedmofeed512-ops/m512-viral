// M512 Viral Content — التطبيق
import * as D from './data.js';
import {
  icon, BOOKMARK, PLATFORMS, TIERS, tierOf, esc, compact, full, duration, ago, toast, copyText, busy, $, $$, initials, fallbackThumb,
} from './ui.js';

const app = document.getElementById('app');
const S = { cats: [], settings: {}, favs: new Set(), prevHash: '#/discover/youtube', libCache: {} };
const th = () => S.settings.tier_thresholds || { mega: 80, viral: 65, hot: 50, good: 35 };

// ================================================================ الإقلاع
(async function boot() {
  try {
    await D.init();
  } catch (e) {
    app.innerHTML = `<div class="center-screen"><div class="panel"><h3>تعذّر التشغيل</h3><p>${esc(e.message)}</p></div></div>`;
    return;
  }
  window.addEventListener('hashchange', route);
  route();
})();

async function loadShared() {
  const [cats, settings, favs] = await Promise.all([
    D.categories().catch(() => []), D.settings().catch(() => ({})), D.favoriteIds().catch(() => new Set()),
  ]);
  S.cats = cats; S.settings = settings; S.favs = favs;
}

let shellReady = false;
async function route() {
  const hash = location.hash || '';
  const session = D.getSession();

  if (/access_token|type=recovery/.test(hash)) { location.hash = '#/settings'; return; }
  if (!session || !D.getProfile()) { shellReady = false; return renderAuth(); }
  const prof = D.getProfile();
  if (prof.status !== 'active') { shellReady = false; return renderPending(prof); }

  if (!shellReady) { await loadShared(); renderShell(); shellReady = true; }

  const parts = hash.replace(/^#\/?/, '').split('/');
  const [page, arg, arg2] = parts;

  if (page === 'video' && arg) {
    if (!$('.main').dataset.page) await renderPage('discover', 'youtube');
    return openVideo(arg);
  }
  closeOverlay(false);
  S.prevHash = hash || '#/discover/youtube';
  await renderPage(page || 'discover', arg, arg2);
}

async function renderPage(page, arg, arg2) {
  const main = $('.main');
  main.dataset.page = page;
  const admin = D.isAdmin();
  const pages = {
    discover: (r) => discover(r, PLATFORMS[arg] ? arg : 'youtube'),
    library: pageLibrary,
    favorites: pageFavorites,
    extension: pageExtension,
    settings: pageMySettings,
    admin: (r) => (!admin ? discover(r, 'youtube') : arg === 'users' ? pageUsers(r) : arg === 'settings' ? pageAdminSettings(r, arg2 || 'youtube') : pageDashboard(r)),
  };
  const fn = pages[page] || pages.discover;
  highlightNav();
  $('.sidebar')?.classList.remove('open'); $('.scrim')?.remove();
  main.scrollTo?.(0, 0); window.scrollTo(0, 0);
  const content = $('#content');
  content.innerHTML = '';
  await fn(content);
}

function highlightNav() {
  const h = location.hash || '#/discover/youtube';
  $$('.nav a').forEach((a) => {
    const href = a.getAttribute('href');
    a.classList.toggle('active', h === href || (href === '#/admin' && h === '#/admin') || (href.startsWith('#/admin/settings') && h.startsWith('#/admin/settings')));
  });
}

// ================================================================ الدخول
function renderAuth() {
  const demo = D.getMode() === 'demo';
  app.innerHTML = `
  <div class="auth">
    <section class="auth-hero">
      <div class="logo">${logoSvg()}</div>
      <div>
        <h1>M512 <span class="dark">Viral</span><br>Content</h1>
        <p>اكتشف المقاطع الفيروسية على يوتيوب وشورتس وتيك توك وإنستغرام، وافهم <b>لماذا انتشرت</b>، ثم حوّلها إلى سكريبت خاص بك.</p>
        <div class="feat">
          <span>${icon('trend')}اكتشاف المحتوى الرائج</span>
          <span>${icon('sparkles')}تحليل أسباب الانتشار</span>
          <span>${icon('pen')}جاهز لكتابة السكريبت</span>
        </div>
      </div>
      <div class="sig">محمد مفيد</div>
    </section>
    <section class="auth-form">
      <div class="auth-card">
        ${demo ? `<div class="demo-banner"><b>نسخة عرض.</b> المنصة غير مربوطة بقاعدة البيانات بعد، ادخل لتتصفح الواجهة ببيانات تجريبية.</div>` : ''}
        <div class="bookmark-mark">${BOOKMARK}</div>
        <h2 id="authTitle">أهلاً بك</h2>
        <p id="authSub">سجّل الدخول لتكمل من حيث توقفت.</p>
        <div class="seg" style="margin-bottom:18px"><button class="on" data-m="in">تسجيل الدخول</button><button data-m="up">حساب جديد</button></div>
        <form id="authForm" novalidate>
          <label class="field hidden" id="nameField"><span>الاسم</span><input class="input" name="name" autocomplete="name" placeholder="اسمك كما يظهر للمدرب"></label>
          <label class="field"><span>البريد الإلكتروني</span><input class="input ltr" name="email" type="email" autocomplete="email" required placeholder="name@email.com" ${demo ? 'value="admin@m512.demo"' : ''}></label>
          <label class="field"><span>كلمة المرور</span><input class="input ltr" name="password" type="password" autocomplete="current-password" required minlength="6" ${demo ? 'value="demo1234"' : ''}></label>
          <div id="authMsg"></div>
          <button class="btn primary block" type="submit">${icon('zap')}<span id="authBtn">دخول</span></button>
          <button class="btn ghost sm" type="button" id="forgot">نسيت كلمة المرور؟</button>
        </form>
      </div>
    </section>
  </div>`;
  let m = 'in';
  const form = $('#authForm');
  $$('.seg button', app).forEach((b) => b.onclick = () => {
    m = b.dataset.m;
    $$('.seg button', app).forEach((x) => x.classList.toggle('on', x === b));
    $('#nameField').classList.toggle('hidden', m === 'in');
    $('#authBtn').textContent = m === 'in' ? 'دخول' : 'إنشاء الحساب';
    $('#authTitle').textContent = m === 'in' ? 'أهلاً بك' : 'انضم إلى المنصة';
    $('#authSub').textContent = m === 'in' ? 'سجّل الدخول لتكمل من حيث توقفت.' : 'بعد التسجيل يفعّل المدرب حسابك، ثم تبدأ مباشرة.';
    $('#authMsg').innerHTML = '';
  });
  $('#forgot').onclick = async () => {
    const email = form.email.value.trim();
    if (!email) return showMsg('اكتب بريدك أولاً ثم اضغط "نسيت كلمة المرور"', 'err');
    try { await D.resetPassword(email); showMsg('أرسلنا رابط تغيير كلمة المرور إلى بريدك', 'ok'); } catch (e) { showMsg(e.message, 'err'); }
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = form.querySelector('[type=submit]');
    const email = form.email.value.trim(), pw = form.password.value, name = form.name.value.trim();
    if (!email || pw.length < 6) return showMsg('أدخل البريد وكلمة مرور من 6 أحرف على الأقل', 'err');
    if (m === 'up' && !name) return showMsg('اكتب اسمك', 'err');
    busy(btn, true);
    try {
      if (m === 'in') { await D.signIn(email, pw); route(); }
      else {
        const r = await D.signUp(email, pw, name);
        if (r.needsConfirm) showMsg('تم إنشاء الحساب. افتح بريدك وأكّد التسجيل، ثم سجّل الدخول', 'ok');
        else route();
      }
    } catch (err) { showMsg(err.message, 'err'); }
    busy(btn, false);
  };
  function showMsg(t, type) { $('#authMsg').innerHTML = `<div class="msg ${type}">${esc(t)}</div>`; }
}

function renderPending(p) {
  app.innerHTML = `<div class="center-screen"><div class="panel" style="max-width:460px">
    <div class="bookmark-mark" style="margin:0 auto 10px">${BOOKMARK}</div>
    <h3>${p.status === 'blocked' ? 'الحساب موقوف' : 'حسابك بانتظار التفعيل'}</h3>
    <p class="muted">${p.status === 'blocked' ? 'تواصل مع المدرب لإعادة تفعيل حسابك.' : `أهلاً ${esc(p.full_name || '')}، وصل طلبك إلى المدرب. بمجرد تفعيله أعد تحميل الصفحة.`}</p>
    <div class="row" style="justify-content:center;margin-top:12px"><button class="btn primary" id="rl">${icon('refresh')}تحديث</button><button class="btn ghost" id="lo">خروج</button></div>
  </div></div>`;
  $('#rl').onclick = async () => { await D.refreshProfile(); route(); };
  $('#lo').onclick = async () => { await D.signOut(); route(); };
}

function logoSvg() { return `<svg viewBox="0 0 548 264" fill="currentColor" role="img" aria-label="512"><use href="#logo512"/></svg>`; }

// ================================================================ الهيكل
function renderShell() {
  const p = D.getProfile();
  const admin = D.isAdmin();
  const nav = (href, ic, label, extra = '') => `<a href="${href}">${icon(ic)}<span>${label}</span>${extra}</a>`;
  app.innerHTML = `
  <div class="shell">
    <aside class="sidebar">
      <a class="brand" href="#/discover/youtube"><span class="logo">${logoSvg()}</span><span class="wordmark"><b>Viral Content</b><small>محمد مفيد</small></span></a>
      <nav class="nav">
        <div class="nav-label">اكتشف</div>
        ${nav('#/discover/youtube', 'youtube', 'يوتيوب')}
        ${nav('#/discover/shorts', 'shorts', 'يوتيوب شورتس')}
        ${nav('#/discover/tiktok', 'tiktok', 'تيك توك')}
        ${nav('#/discover/instagram', 'instagram', 'إنستغرام ريلز')}
        <div class="nav-label">مساحتي</div>
        ${nav('#/library', 'library', 'المكتبة')}
        ${nav('#/favorites', 'bookmark', 'مختاراتي')}
        ${nav('#/extension', 'puzzle', 'إضافة كروم')}
        ${nav('#/settings', 'user', 'إعداداتي')}
        ${admin ? `<div class="nav-label">الإدارة</div>
        ${nav('#/admin', 'dashboard', 'لوحة التحكم')}
        ${nav('#/admin/users', 'users', 'المستخدمون', '<span class="count hidden" id="pendingCount"></span>')}
        ${nav('#/admin/settings/youtube', 'settings', 'الإعدادات')}` : ''}
      </nav>
      <div class="me">
        <div class="avatar">${esc(initials(p.full_name))}</div>
        <div class="who"><b>${esc(p.full_name || p.email)}</b><small>${admin ? 'مدير المنصة' : 'طالب'}</small></div>
        <button class="btn ghost icon" id="logout" title="تسجيل الخروج">${icon('logout')}</button>
      </div>
    </aside>
    <div>
      <header class="topbar">
        <a class="brand" href="#/discover/youtube"><span class="logo">${logoSvg()}</span><span class="wordmark"><b>Viral Content</b></span></a>
        <button class="btn icon" id="menuBtn" aria-label="القائمة">${icon('menu')}</button>
      </header>
      <main class="main">
        ${D.getMode() === 'demo' ? `<div class="demo-banner">${icon('info')}<span><b>نسخة عرض ببيانات تجريبية.</b> بعد ربط Supabase و Vercel تظهر المقاطع الحقيقية ويعمل البحث والتحليل.</span></div>` : ''}
        <div id="content"></div>
      </main>
    </div>
  </div>`;
  $('#logout').onclick = async () => { await D.signOut(); location.hash = ''; route(); };
  $('#menuBtn').onclick = () => {
    $('.sidebar').classList.add('open');
    const s = document.createElement('div'); s.className = 'scrim'; s.onclick = () => { $('.sidebar').classList.remove('open'); s.remove(); };
    document.body.append(s);
  };
  if (admin) D.users().then((u) => { const n = u.filter((x) => x.status === 'pending').length; const c = $('#pendingCount'); if (c && n) { c.textContent = n; c.classList.remove('hidden'); } }).catch(() => {});
}

// ================================================================ بطاقة الفيديو والمتصفح
function card(v, i = 0) {
  const P = PLATFORMS[v.platform] || PLATFORMS.youtube;
  const t = tierOf(v.score, th());
  const why = v.viral_reasons?.[0] || v.summary || '';
  const fav = S.favs.has(v.id);
  return `
  <article class="vcard ${P.vertical ? 'vert' : ''}" data-id="${v.id}" style="animation-delay:${Math.min(i, 12) * 40}ms">
    <div class="thumb">
      <img loading="lazy" src="${esc(v.thumbnail_url || fallbackThumb(v.title, v.platform))}" alt="" data-title="${esc(v.title || '')}" data-plat="${v.platform}" referrerpolicy="no-referrer">
      <div class="top"><span class="badge-plat">${icon(P.icon)}${P.name}</span><button class="fav-btn ${fav ? 'on' : ''}" data-fav="${v.id}" title="${fav ? 'إزالة من مختاراتي' : 'أضف إلى مختاراتي'}">${icon('bookmark')}</button></div>
      <div class="bottom"><div class="score-ring" style="--p:${Math.round(v.score || 0)}" title="درجة الانتشار"><b class="num">${Math.round(v.score || 0)}</b></div>${v.duration_sec ? `<span class="badge-dur">${duration(v.duration_sec)}</span>` : ''}</div>
    </div>
    <div class="body">
      <h4 title="${esc(v.title)}">${esc(v.title || 'بدون عنوان')}</h4>
      <div class="channel">${esc(v.channel_name || '')}${v.published_at ? ` · ${ago(v.published_at)}` : ''}</div>
      <div class="stats">
        <span>${icon('eye')}<span class="num">${compact(v.views)}</span></span>
        <span>${icon('heart')}<span class="num">${compact(v.likes)}</span></span>
        <span>${icon('message')}<span class="num">${compact(v.comments)}</span></span>
      </div>
      ${why ? `<div class="why">${esc(why)}</div>` : ''}
      <div class="foot"><span class="pill tier-${t.key}">${t.name}</span>${v.analysis_status === 'done' ? `<span class="pill outline">${icon('sparkles')}محلَّل</span>` : v.category ? `<span class="pill">${esc(v.category)}</span>` : ''}</div>
    </div>
  </article>`;
}

function bindCards(root) {
  $$('.vcard img', root).forEach((img) => img.addEventListener('error', () => { img.src = fallbackThumb(img.dataset.title, img.dataset.plat); }, { once: true }));
  root.onclick = async (e) => {
    const fav = e.target.closest('[data-fav]');
    if (fav) {
      e.stopPropagation();
      const id = fav.dataset.fav, on = !S.favs.has(id);
      try {
        await D.toggleFavorite(id, on);
        on ? S.favs.add(id) : S.favs.delete(id);
        $$(`[data-fav="${id}"]`).forEach((b) => b.classList.toggle('on', on));
        toast(on ? 'أُضيف إلى مختاراتي' : 'أُزيل من مختاراتي');
      } catch (err) { toast(err.message, 'err'); }
      return;
    }
    const c = e.target.closest('.vcard');
    if (c) location.hash = '#/video/' + c.dataset.id;
  };
}

const PERIODS = [['', 'أي وقت'], ['7', 'آخر أسبوع'], ['30', 'آخر شهر'], ['90', 'آخر 3 أشهر'], ['365', 'آخر سنة']];
const MINVIEWS = [['0', 'أي عدد'], ['100000', '+100 ألف'], ['500000', '+500 ألف'], ['1000000', '+مليون'], ['10000000', '+10 ملايين']];
const SORTS = [['score', 'الأعلى انتشاراً'], ['views', 'الأكثر مشاهدة'], ['velocity', 'الأسرع انتشاراً'], ['engagement', 'الأعلى تفاعلاً'], ['outlier', 'الأكثر تفوقاً على قناته'], ['newest', 'الأحدث']];

function opts(list, sel) { return list.map(([v, l]) => `<option value="${v}" ${String(sel) === v ? 'selected' : ''}>${l}</option>`).join(''); }

/** متصفح مقاطع بفلاتر كاملة */
function browser(container, videos, { showPlatform = false, emptyHtml = '', vertical = false } = {}) {
  const f = { q: '', tiers: new Set(), category: '', language: '', minViews: '0', period: '', sort: 'score', analyzed: false, platform: '' };
  container.innerHTML = `
    <div class="filters">
      <input class="input grow" data-f="q" placeholder="ابحث في العناوين والقنوات…">
      ${showPlatform ? `<select class="input" data-f="platform"><option value="">كل المنصات</option>${Object.entries(PLATFORMS).map(([k, p]) => `<option value="${k}">${p.name}</option>`).join('')}</select>` : ''}
      <select class="input" data-f="category"><option value="">كل الأنواع</option>${[...new Set([...S.cats.map((c) => c.name), ...videos.map((v) => v.category).filter(Boolean)])].map((c) => `<option>${esc(c)}</option>`).join('')}</select>
      <select class="input" data-f="language"><option value="">عربي وأجنبي</option><option value="ar">عربي</option><option value="en">أجنبي</option></select>
      <select class="input" data-f="minViews">${opts(MINVIEWS, '0')}</select>
      <select class="input" data-f="period">${opts(PERIODS, '')}</select>
      <select class="input" data-f="sort">${opts(SORTS, 'score')}</select>
    </div>
    <div class="result-meta">
      <div class="chips" data-tiers>${TIERS.map((t) => `<button class="chip" data-tier="${t.key}">${t.name}</button>`).join('')}<button class="chip" data-analyzed>${'المحلَّلة فقط'}</button></div>
      <span id="count"></span>
    </div>
    <div class="vgrid ${vertical ? 'vertical' : ''}" id="grid"></div>`;
  const grid = $('#grid', container);
  bindCards(grid);

  const apply = () => {
    const now = Date.now();
    let list = videos.filter((v) => {
      if (f.q && !`${v.title} ${v.channel_name} ${v.category}`.toLowerCase().includes(f.q.toLowerCase())) return false;
      if (f.platform && v.platform !== f.platform) return false;
      if (f.category && v.category !== f.category) return false;
      if (f.language === 'ar' && v.language !== 'ar') return false;
      if (f.language === 'en' && v.language === 'ar') return false;
      if (+f.minViews && (v.views || 0) < +f.minViews) return false;
      if (f.period && (!v.published_at || now - new Date(v.published_at) > +f.period * 86400000)) return false;
      if (f.tiers.size && !f.tiers.has(tierOf(v.score, th()).key)) return false;
      if (f.analyzed && v.analysis_status !== 'done') return false;
      return true;
    });
    const key = { score: (v) => +v.score, views: (v) => +v.views, velocity: (v) => v.score_parts?.views_per_day || 0, engagement: (v) => v.score_parts?.engagement_rate || 0, outlier: (v) => v.score_parts?.outlier_ratio || 0, newest: (v) => new Date(v.published_at || 0).getTime() }[f.sort];
    list = list.sort((a, b) => key(b) - key(a));
    $('#count', container).innerHTML = `<span class="num">${list.length}</span> مقطع${list.length !== videos.length ? ` من <span class="num">${videos.length}</span>` : ''}`;
    grid.innerHTML = list.length ? list.map(card).join('') : (videos.length ? emptyState('filter', 'لا توجد نتائج بهذه الفلاتر', 'خفّف الفلاتر أو امسحها لتظهر مقاطع أكثر.') : emptyHtml);
    $$('.vcard img', grid).forEach((img) => img.addEventListener('error', () => { img.src = fallbackThumb(img.dataset.title, img.dataset.plat); }, { once: true }));
  };
  $$('[data-f]', container).forEach((el) => el.addEventListener(el.tagName === 'INPUT' ? 'input' : 'change', () => { f[el.dataset.f] = el.value; apply(); }));
  $$('[data-tier]', container).forEach((b) => b.onclick = () => { const k = b.dataset.tier; f.tiers.has(k) ? f.tiers.delete(k) : f.tiers.add(k); b.classList.toggle('on'); apply(); });
  $('[data-analyzed]', container).onclick = (e) => { f.analyzed = !f.analyzed; e.currentTarget.classList.toggle('on'); apply(); };
  apply();
  return { update(list) { videos = list; apply(); } };
}

function emptyState(ic, title, text, action = '') {
  return `<div class="empty" style="grid-column:1/-1"><div class="ico">${icon(ic === 'filter' ? 'search' : ic)}</div><h3>${title}</h3><p>${text}</p>${action}</div>`;
}

function skeletonGrid(n = 8, vertical = false) {
  return `<div class="vgrid ${vertical ? 'vertical' : ''}">${Array.from({ length: n }, () => `<div class="skeleton" style="aspect-ratio:${vertical ? '9/17' : '4/4.2'}"></div>`).join('')}</div>`;
}

// ================================================================ صفحة الاكتشاف
async function discover(root, platform) {
  const P = PLATFORMS[platform];
  const admin = D.isAdmin();
  const isYT = platform === 'youtube' || platform === 'shorts';
  const canSearch = admin || S.settings.students_can_search !== false;
  const canAdd = admin || S.settings.students_can_add !== false;
  const cats = S.cats.map((c) => c.name);

  root.innerHTML = `
    <div class="page-head">
      <div>
        <div class="eyebrow">${icon(P.icon)}${P.en}</div>
        <h1>اكتشف الفيروسي على <span class="tone">${P.name}</span></h1>
        <p>${isYT ? 'اكتب نوع الفيديو الذي تبحث عنه، وسنجلب لك الأكثر انتشاراً مع سبب نجاح كل مقطع.' : `ابحث في ${P.name} مباشرة، ثم أضف المقاطع الناجحة بالرابط أو بإضافة كروم لتُحلَّل تلقائياً.`}</p>
      </div>
      ${admin ? `<a class="btn" href="#/admin/settings/${platform}">${icon('settings')}إعدادات ${P.name}</a>` : ''}
    </div>
    <div id="tools"></div>
    <div class="tabs" id="resTabs"></div>
    <div id="results"></div>`;

  const tools = $('#tools', root);
  if (isYT) {
    tools.innerHTML = `
    <section class="search-panel">
      <div class="row between" style="margin-bottom:14px">
        <div class="seg" id="modeSeg"><button class="on" data-mode="search">${icon('search')}بحث بالنوع</button><button data-mode="trending">${icon('trend')}الرائج الآن</button></div>
        <span class="faint" style="font-size:.8rem" id="quotaNote">كل بحث = 100 وحدة من 10,000 يومياً · الرائج = وحدة واحدة</span>
      </div>
      <form class="search-main" id="sForm">
        <input class="input" name="q" placeholder="نوع الفيديو: رياضة، تعليم، ألعاب، فلوق… أو أي كلمة" autocomplete="off">
        <button class="btn primary" type="submit" ${canSearch ? '' : 'disabled'}>${icon('search')}<span>ابحث</span></button>
      </form>
      <div class="chips" style="margin-top:12px" id="catChips">${cats.map((c) => `<button type="button" class="chip" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}</div>
      <div class="search-opts">
        <label class="field"><span>اللغة</span><select class="input" id="oLang"><option value="all">عربي وأجنبي</option><option value="ar" selected>عربي</option><option value="en">أجنبي</option></select></label>
        <label class="field"><span>فترة النشر</span><select class="input" id="oPeriod">${opts([['7', 'آخر أسبوع'], ['30', 'آخر شهر'], ['90', 'آخر 3 أشهر'], ['365', 'آخر سنة'], ['0', 'أي وقت']], String(S.settings.youtube_period_days ?? 30))}</select></label>
        <label class="field"><span>الدولة</span><select class="input" id="oRegion">${opts(REGIONS, S.settings.youtube_region || 'SA')}</select></label>
        ${platform === 'youtube' ? `<label class="field"><span>مدة الفيديو</span><select class="input" id="oDur">${opts([['medium', 'متوسط 4-20 دقيقة'], ['long', 'طويل +20 دقيقة'], ['any', 'الكل']], S.settings.youtube_duration || 'medium')}</select></label>` : ''}
        <label class="field"><span>ترتيب يوتيوب</span><select class="input" id="oOrder"><option value="viewCount">الأكثر مشاهدة</option><option value="relevance">الأكثر صلة</option></select></label>
      </div>
      ${canSearch ? '' : `<div class="hint">${icon('lock')}<span>البحث المباشر مغلق للطلاب حالياً. تصفّح المقاطع المحفوظة أدناه.</span></div>`}
      ${canAdd ? `<details class="fold" style="margin:14px 0 0;background:var(--bg)"><summary>${icon('link')}أضف مقطعاً محدداً بالرابط${icon('chev', 'chev')}</summary><div class="inner" id="addBox"></div></details>` : ''}
    </section>`;
    if (canAdd) addForm($('#addBox', tools), platform, false);
  } else {
    const searchUrl = platform === 'tiktok' ? (q) => `https://www.tiktok.com/search/video?q=${encodeURIComponent(q)}` : (q) => `https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent(q)}`;
    tools.innerHTML = `
    <div class="grid-2" style="margin-bottom:22px;align-items:start">
      <section class="search-panel" style="margin:0">
        <h3 style="margin:0 0 4px;font-weight:700">${icon('search', '')} ابحث في ${P.name}</h3>
        <p class="muted" style="margin:0 0 12px;font-size:.86rem">اكتب نوع المحتوى، وتُفتح نتائج ${P.name} في تبويب جديد. اختر المقاطع ذات المشاهدات العالية ثم أضفها هنا.</p>
        <form class="search-main" id="extSearch"><input class="input" name="q" placeholder="مثال: تحدي رياضي، وصفات سريعة…"><button class="btn primary" type="submit">${icon('external')}افتح النتائج</button></form>
        <div class="chips" style="margin-top:12px">${cats.map((c) => `<button type="button" class="chip" data-open="${esc(c)}">${esc(c)}</button>`).join('')}</div>
        <div class="hint">${icon('puzzle')}<span>الأسرع: ثبّت <a href="#/extension">إضافة كروم</a>، وافتح أي مقطع على ${P.name} ثم اضغط زر M512، فيُضاف ويُحلَّل بضغطة واحدة.</span></div>
      </section>
      <section class="search-panel" style="margin:0">
        <h3 style="margin:0 0 4px;font-weight:700">أضف مقطعاً بالرابط</h3>
        <p class="muted" style="margin:0 0 12px;font-size:.86rem">الصق رابط المقطع، ونجلب الصورة المصغرة والعنوان والأرقام، ثم نحلل سبب انتشاره.</p>
        <div id="addBox">${canAdd ? '' : `<div class="hint">${icon('lock')}<span>الإضافة مغلقة للطلاب حالياً.</span></div>`}</div>
      </section>
    </div>`;
    if (canAdd) addForm($('#addBox', tools), platform, true);
    $('#extSearch', tools).onsubmit = (e) => { e.preventDefault(); const q = e.target.q.value.trim(); if (q) window.open(searchUrl(q), '_blank', 'noopener'); };
    $$('[data-open]', tools).forEach((b) => b.onclick = () => window.open(searchUrl(b.dataset.open), '_blank', 'noopener'));
  }

  // التبويبات: نتائج البحث / المكتبة
  const tabs = $('#resTabs', root), results = $('#results', root);
  let current = 'library', searchVideos = null, lib = null;
  const drawTabs = () => {
    tabs.innerHTML = `${searchVideos ? `<button data-t="search" class="${current === 'search' ? 'on' : ''}">${icon('search')}نتائج البحث <span class="pill num">${searchVideos.length}</span></button>` : ''}
      <button data-t="library" class="${current === 'library' ? 'on' : ''}">${icon('library')}كل مقاطع ${P.name} المحفوظة</button>`;
    $$('button', tabs).forEach((b) => b.onclick = () => { current = b.dataset.t; drawTabs(); drawResults(); });
  };
  const drawResults = async () => {
    if (current === 'search') return browser(results, searchVideos, { vertical: P.vertical, emptyHtml: emptyState('search', 'لا نتائج', 'جرّب كلمة أخرى أو وسّع فترة النشر.') });
    results.innerHTML = skeletonGrid(8, P.vertical);
    try { lib = await D.listVideos({ platform }); } catch (e) { results.innerHTML = errBox(e); return; }
    browser(results, lib, {
      vertical: P.vertical,
      emptyHtml: emptyState(P.icon, `لا توجد مقاطع ${P.name} بعد`, isYT ? 'ابدأ ببحث من الأعلى، وكل النتائج تُحفظ هنا تلقائياً ليستفيد منها الجميع.' : 'أضف أول مقطع بالرابط أو من إضافة كروم، وسيظهر هنا مع تحليله.'),
    });
  };
  drawTabs(); drawResults();

  if (isYT) {
    let mode = 'search';
    const form = $('#sForm', tools);
    let chosenCat = '';
    $$('#modeSeg button', tools).forEach((b) => b.onclick = () => {
      mode = b.dataset.mode;
      $$('#modeSeg button', tools).forEach((x) => x.classList.toggle('on', x === b));
      form.q.placeholder = mode === 'trending' ? 'اختر نوعاً من الأسفل (اختياري) ثم اضغط "اعرض الرائج"' : 'نوع الفيديو: رياضة، تعليم، ألعاب، فلوق… أو أي كلمة';
      form.querySelector('[type=submit] span').textContent = mode === 'trending' ? 'اعرض الرائج' : 'ابحث';
      form.q.disabled = mode === 'trending';
      ['oPeriod', 'oDur', 'oOrder'].forEach((id) => { const el = $('#' + id, tools); if (el) el.closest('.field').style.opacity = mode === 'trending' ? .4 : 1; });
    });
    $$('#catChips .chip', tools).forEach((c) => c.onclick = () => {
      const on = !c.classList.contains('on');
      $$('#catChips .chip', tools).forEach((x) => x.classList.remove('on'));
      c.classList.toggle('on', on);
      chosenCat = on ? c.dataset.cat : '';
      if (mode === 'search') { form.q.value = chosenCat; if (on) form.requestSubmit(); }
    });
    form.onsubmit = async (e) => {
      e.preventDefault();
      const q = form.q.value.trim();
      if (mode === 'search' && !q) { form.q.focus(); return toast('اكتب نوع الفيديو أو اختر تصنيفاً', 'err'); }
      const btn = form.querySelector('[type=submit]');
      busy(btn, true, mode === 'trending' ? 'نجلب الرائج…' : 'نبحث…');
      current = 'search'; searchVideos = []; drawTabs();
      results.innerHTML = skeletonGrid(8, P.vertical);
      try {
        const r = await D.search({
          platform, mode, query: mode === 'search' ? q : '', category: chosenCat && (mode === 'trending' || chosenCat === q) ? chosenCat : (cats.includes(q) ? q : ''),
          language: $('#oLang', tools).value, period: $('#oPeriod', tools).value, region: $('#oRegion', tools).value,
          duration: $('#oDur', tools)?.value, order: $('#oOrder', tools).value,
        });
        searchVideos = r.videos;
        drawTabs(); drawResults();
        if (r.notice) toast(r.notice, 'ok', 7000);
        toast(r.cached ? `نتائج محفوظة من بحث سابق (بدون استهلاك حصة) · ${r.videos.length} مقطع` : `وجدنا ${r.videos.length} مقطع · استهلك ${r.units} وحدة`);
      } catch (err) {
        searchVideos = null; current = 'library'; drawTabs();
        results.innerHTML = errBox(err);
      }
      busy(btn, false);
    };
  }
}
const REGIONS = [['SA', 'السعودية'], ['EG', 'مصر'], ['AE', 'الإمارات'], ['JO', 'الأردن'], ['PS', 'فلسطين'], ['IQ', 'العراق'], ['KW', 'الكويت'], ['QA', 'قطر'], ['MA', 'المغرب'], ['DZ', 'الجزائر'], ['US', 'أمريكا'], ['GB', 'بريطانيا'], ['', 'كل العالم']];

function errBox(e) {
  const setup = ['missing_youtube_key', 'missing_gemini_key', 'not_configured', 'yt_key'].includes(e.code);
  return `<div class="empty"><div class="ico">${icon(setup ? 'key' : 'info')}</div><h3>${setup ? 'ينقص إعداد' : 'تعذّر إكمال الطلب'}</h3><p>${esc(e.message)}</p>${setup && D.isAdmin() ? `<a class="btn primary" href="#/admin/settings/${e.code.includes('gemini') ? 'analysis' : 'youtube'}">${icon('settings')}افتح الإعدادات</a>` : ''}</div>`;
}

/** نموذج الإضافة بالرابط مع الإدخال اليدوي */
function addForm(box, platform, open) {
  const cats = S.cats.map((c) => c.name);
  box.innerHTML = `
    <form class="stack" id="addF">
      <input class="input ltr" name="url" placeholder="${platform === 'tiktok' ? 'https://www.tiktok.com/@user/video/…' : platform === 'instagram' ? 'https://www.instagram.com/reel/…' : 'https://www.youtube.com/…'}" required>
      <div class="grid-2">
        <select class="input" name="category"><option value="">نوع المحتوى (اختياري)</option>${cats.map((c) => `<option>${esc(c)}</option>`).join('')}</select>
        <select class="input" name="language"><option value="">اللغة: تلقائي</option><option value="ar">عربي</option><option value="en">أجنبي</option></select>
      </div>
      <details class="fold" id="manual" style="margin:0;background:var(--bg)"><summary>${icon('pen')}إدخال يدوي (إن لم تُقرأ البيانات تلقائياً)${icon('chev', 'chev')}</summary><div class="inner stack">
        <input class="input" name="title" placeholder="العنوان أو أول سطر من الوصف">
        <input class="input ltr" name="thumbnail_url" placeholder="رابط الصورة المصغرة (اختياري)">
        <div class="grid-3"><input class="input ltr" name="views" placeholder="المشاهدات 1.2M"><input class="input ltr" name="likes" placeholder="الإعجابات"><input class="input ltr" name="comments" placeholder="التعليقات"></div>
        <div class="grid-2"><input class="input ltr" name="channel_followers" placeholder="متابعو الحساب"><input class="input" name="published_at" type="date" title="تاريخ النشر"></div>
      </div></details>
      <button class="btn primary" type="submit">${icon('sparkles')}أضف وحلّل</button>
    </form>`;
  const f = $('#addF', box);
  f.onsubmit = async (e) => {
    e.preventDefault();
    const btn = f.querySelector('[type=submit]');
    const page = {};
    ['title', 'thumbnail_url', 'views', 'likes', 'comments', 'channel_followers', 'published_at'].forEach((k) => { if (f[k].value.trim()) page[k] = f[k].value.trim(); });
    busy(btn, true, 'نجلب البيانات ونحلل… (حتى دقيقة)');
    try {
      const r = await D.ingest({ url: f.url.value.trim(), category: f.category.value, language: f.language.value, page_data: page, source: 'link' });
      (r.warnings || []).forEach((w) => toast(w, 'err', 6000));
      toast(r.analyzed ? 'أُضيف المقطع وحُلّل ✓' : 'أُضيف المقطع');
      f.reset();
      if (PLATFORMS[r.video.platform]) location.hash = '#/video/' + r.video.id;
    } catch (err) {
      if (err.code === 'need_manual') { $('#manual', box).open = true; }
      toast(err.message, 'err', 7000);
    }
    busy(btn, false);
  };
}

// ================================================================ المكتبة والمختارات
async function pageLibrary(root) {
  root.innerHTML = `
    <div class="page-head"><div><div class="eyebrow">${icon('library')}المكتبة</div><h1>كل المقاطع <span class="tone">الناجحة</span></h1><p>كل ما بحثتم عنه وأضفتموه من المنصات الأربع، مع فلاتر الوصول والنوع ودرجة الانتشار.</p></div></div>
    <div id="lib">${skeletonGrid(12)}</div>`;
  try {
    const vids = await D.listVideos();
    browser($('#lib', root), vids, { showPlatform: true, emptyHtml: emptyState('library', 'المكتبة فارغة', 'ابدأ من صفحة يوتيوب ببحث، أو أضف مقطع تيك توك بالرابط.', `<a class="btn primary" href="#/discover/youtube">${icon('search')}ابدأ الاكتشاف</a>`) });
  } catch (e) { $('#lib', root).innerHTML = errBox(e); }
}

async function pageFavorites(root) {
  root.innerHTML = `
    <div class="page-head"><div><div class="eyebrow">${icon('bookmark')}مختاراتي</div><h1>المقاطع التي <span class="tone">اخترتها</span></h1><p>احفظ هنا المقاطع التي ستحوّلها إلى سكريبت أو سيناريو. افتح أي مقطع واضغط "انسخ لكتابة السكريبت" ثم الصقه في Claude.</p></div></div>
    <div id="fav">${skeletonGrid(6)}</div>`;
  try {
    const vids = await D.listFavorites();
    browser($('#fav', root), vids, { showPlatform: true, emptyHtml: emptyState('bookmark', 'لم تختر أي مقطع بعد', 'اضغط علامة الحفظ على أي بطاقة لتظهر هنا.', `<a class="btn primary" href="#/library">${icon('library')}تصفّح المكتبة</a>`) });
  } catch (e) { $('#fav', root).innerHTML = errBox(e); }
}

// ================================================================ تفاصيل الفيديو
function closeOverlay(nav = true) {
  const o = $('.overlay');
  if (!o) return;
  o.remove();
  document.body.style.overflow = '';
  if (nav) location.hash = S.prevHash || '#/library';
}

async function openVideo(id) {
  closeOverlay(false);
  const o = document.createElement('div');
  o.className = 'overlay';
  o.innerHTML = `<div class="sheet"><div class="analyzing"><div class="pulse"></div><p class="muted">نفتح المقطع…</p></div></div>`;
  document.body.append(o);
  document.body.style.overflow = 'hidden';
  o.addEventListener('click', (e) => { if (e.target === o) closeOverlay(); });
  const onKey = (e) => { if (e.key === 'Escape') { closeOverlay(); document.removeEventListener('keydown', onKey); } };
  document.addEventListener('keydown', onKey);

  let v;
  try { v = await D.getVideo(id); } catch (e) { o.querySelector('.sheet').innerHTML = errBox(e); return; }
  if (!v) { o.querySelector('.sheet').innerHTML = emptyState('info', 'المقطع غير موجود', 'ربما حُذف من المكتبة.'); return; }
  renderSheet(o, v);

  if (v.analysis_status !== 'done' && v.analysis_status !== 'failed' && S.settings.auto_analyze_on_open !== false) runAnalysis(o, v, false);
}

async function runAnalysis(o, v, force) {
  const box = $('#analysis', o);
  if (box) box.innerHTML = `<div class="analyzing"><div class="pulse"></div><h3 style="margin:0 0 4px">نحلل المقطع الآن…</h3><p class="muted" style="margin:0">نشاهد الفيديو ونستخرج الهوك وأسباب الانتشار والنص المنطوق. يستغرق عادة من 20 ثانية إلى دقيقتين.</p></div>`;
  try {
    const r = await D.analyze(v.id, force);
    Object.assign(v, r.video);
    if (document.body.contains(o)) renderSheet(o, v);
  } catch (e) {
    if (box && document.body.contains(o)) box.innerHTML = `${errBox(e)}<div class="row" style="justify-content:center;margin-top:12px"><button class="btn" id="retryA">${icon('refresh')}أعد المحاولة</button></div>`;
    $('#retryA', o)?.addEventListener('click', () => runAnalysis(o, v, force));
  }
}

function renderSheet(o, v) {
  const P = PLATFORMS[v.platform] || PLATFORMS.youtube;
  const t = tierOf(v.score, th());
  const sp = v.score_parts || {};
  const a = v.analysis;
  const admin = D.isAdmin();
  const fav = S.favs.has(v.id);
  const part = (k, label, extra) => sp[k] == null ? '' : `<div class="part"><span>${label}</span><div class="bar"><i style="width:${sp[k]}%"></i></div><b class="num">${sp[k]}</b></div>${extra ? `<div class="faint" style="font-size:.74rem;margin:-4px 0 4px">${extra}</div>` : ''}`;

  o.querySelector('.sheet').innerHTML = `
    <div class="sheet-head">
      <div class="row"><span class="badge-plat" style="background:var(--surface)">${icon(P.icon)}${P.name}</span>${v.category ? `<span class="pill">${esc(v.category)}</span>` : ''}<span class="pill">${v.language === 'ar' ? 'عربي' : v.language === 'en' ? 'أجنبي' : 'لغة أخرى'}</span></div>
      <div class="row">
        <button class="btn sm ${fav ? 'primary' : ''}" id="favT">${icon('bookmark')}${fav ? 'في مختاراتي' : 'أضف لمختاراتي'}</button>
        <a class="btn sm" href="${esc(v.url)}" target="_blank" rel="noopener">${icon('external')}شاهد الأصل</a>
        <button class="btn ghost icon" id="closeS" aria-label="إغلاق">${icon('x')}</button>
      </div>
    </div>
    <div class="sheet-body">
      <aside class="sheet-side">
        <div class="thumb-lg ${P.vertical ? 'vert' : ''}"><img src="${esc(v.thumbnail_url || fallbackThumb(v.title, v.platform))}" alt="" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${fallbackThumb(v.title, v.platform)}'"></div>
        <div class="score-hero"><div class="big num">${Math.round(v.score || 0)}</div><div><div class="lbl">${t.name}</div><small>درجة الانتشار من 100</small></div></div>
        <div class="metric-grid">
          <div class="metric"><small>المشاهدات</small><b class="num">${full(v.views)}</b></div>
          <div class="metric"><small>الإعجابات</small><b class="num">${full(v.likes)}</b></div>
          <div class="metric"><small>التعليقات</small><b class="num">${full(v.comments)}</b></div>
          <div class="metric"><small>متابعو الصانع</small><b class="num">${v.channel_followers ? compact(v.channel_followers) : '—'}</b></div>
          <div class="metric"><small>المدة</small><b class="num">${duration(v.duration_sec) || '—'}</b></div>
          <div class="metric"><small>النشر</small><b>${v.published_at ? ago(v.published_at) : '—'}</b></div>
        </div>
        <div class="stack" style="gap:8px">
          <b style="font-size:.86rem">لماذا هذه الدرجة؟</b>
          ${part('reach', 'حجم الوصول')}
          ${part('outlier', 'التفوق على القناة', sp.outlier_ratio ? `مشاهداته = ${sp.outlier_ratio}× عدد متابعي الصانع` : '')}
          ${part('velocity', 'سرعة الانتشار', sp.views_per_day ? `<span class="num">${compact(sp.views_per_day)}</span> مشاهدة يومياً في المتوسط` : '')}
          ${part('engagement', 'التفاعل', sp.engagement_rate ? `نسبة التفاعل ${sp.engagement_rate}%` : '')}
        </div>
        ${admin ? `<div class="row"><button class="btn sm" id="reA">${icon('refresh')}أعد التحليل</button><button class="btn sm" id="editA" ${a ? '' : 'disabled'}>${icon('pen')}عدّل التحليل</button><button class="btn sm danger" id="delV">${icon('trash')}احذف</button></div>` : ''}
      </aside>
      <section class="sheet-main">
        <h2>${esc(v.title || 'بدون عنوان')}</h2>
        <div class="muted" style="font-size:.86rem;margin-bottom:18px">${esc(v.channel_name || '')}</div>
        <div id="analysis">${a ? analysisHtml(v) : noAnalysisHtml(v)}</div>
      </section>
    </div>`;

  $('#closeS', o).onclick = () => closeOverlay();
  $('#favT', o).onclick = async () => {
    const on = !S.favs.has(v.id);
    try { await D.toggleFavorite(v.id, on); on ? S.favs.add(v.id) : S.favs.delete(v.id); renderSheet(o, v); $$(`[data-fav="${v.id}"]`).forEach((b) => b.classList.toggle('on', on)); toast(on ? 'أُضيف إلى مختاراتي' : 'أُزيل من مختاراتي'); }
    catch (e) { toast(e.message, 'err'); }
  };
  $('#runA', o)?.addEventListener('click', () => runAnalysis(o, v, false));
  $('#reA', o)?.addEventListener('click', () => runAnalysis(o, v, true));
  $('#delV', o)?.addEventListener('click', async () => {
    if (!confirm('حذف هذا المقطع من المكتبة لكل المستخدمين؟')) return;
    try { await D.deleteVideo(v.id); toast('حُذف المقطع'); closeOverlay(); } catch (e) { toast(e.message, 'err'); }
  });
  $('#editA', o)?.addEventListener('click', () => editAnalysis(o, v));
  $$('[data-copy]', o).forEach((b) => b.onclick = () => copyText(claudePrompt(v, b.dataset.copy), b.dataset.copy === 'transcript' ? 'نُسخ النص' : 'نُسخ. الصقه الآن في Claude'));
}

function noAnalysisHtml(v) {
  const failed = v.analysis_status === 'failed';
  return `<div class="empty"><div class="ico">${icon('sparkles')}</div><h3>${failed ? 'لم يكتمل التحليل' : 'لم يُحلَّل بعد'}</h3><p>${failed ? esc(v.analysis_error || '') : 'التحليل يشرح الهوك وأسباب الانتشار ويستخرج النص المنطوق والمشاهد.'}</p><button class="btn primary" id="runA">${icon('sparkles')}حلّل الآن</button></div>`;
}

function analysisHtml(v) {
  const a = v.analysis || {};
  const partial = v.analysis_mode && v.analysis_mode !== 'video';
  const card2 = (label, text) => text ? `<div class="a-card"><small>${label}</small><p>${esc(text)}</p></div>` : '';
  return `
    ${partial ? `<div class="hint" style="margin:0 0 16px">${icon('info')}<span>تحليل جزئي: لم نتمكن من مشاهدة الفيديو نفسه، فاعتمد التحليل على ${v.analysis_mode === 'thumbnail' ? 'الصورة المصغرة والعنوان والأرقام' : 'العنوان والوصف والأرقام'}.</span></div>` : ''}
    ${a.summary ? `<p style="font-size:1.02rem;margin:0 0 18px;color:#D8E0E4">${esc(a.summary)}${a.content_type ? ` <span class="pill outline">${esc(a.content_type)}</span>` : ''}</p>` : ''}
    ${a.hook ? `<div class="hook-box"><small class="tone" style="font-weight:700">الهوك · أول 3 ثوانٍ${a.hook.type ? ` · ${esc(a.hook.type)}` : ''}</small><div class="q">${esc(a.hook.moment || '')}</div><div class="muted" style="font-size:.88rem">${esc(a.hook.why || '')}</div></div>` : ''}
    ${a.viral_reasons?.length ? `<div class="sec"><h3>${icon('trend')}أسباب الانتشار</h3><ol class="reasons">${a.viral_reasons.map((r) => `<li><span>${esc(r)}</span></li>`).join('')}</ol></div>` : ''}
    <div class="a-grid">
      ${card2('الإيقاع', a.pacing)}${card2('المونتاج والصوت', a.editing)}${card2('الموضوع والعاطفة', a.topic_emotion)}${card2('العنوان والصورة المصغرة', a.title_thumbnail)}${card2('الجمهور', a.audience)}${card2('الدعوة لفعل', a.cta)}
    </div>
    ${a.lesson ? `<div class="lesson"><small>الدرس المستفاد</small><p>${esc(a.lesson)}</p></div>` : ''}
    ${a.formula ? `<div class="sec"><h3>${icon('layers')}القالب القابل للتكرار</h3><p>${esc(a.formula)}</p></div>` : ''}
    ${a.transcript ? `<details class="fold"><summary>${icon('mic')}النص المنطوق${icon('chev', 'chev')}</summary><div class="inner"><div class="paper"><pre>${esc(a.transcript)}</pre></div><div class="row end" style="margin-top:10px"><button class="btn sm" data-copy="transcript">${icon('copy')}انسخ النص</button></div></div></details>` : ''}
    ${a.scenes?.length ? `<details class="fold"><summary>${icon('film')}المشاهد بالتوقيت${icon('chev', 'chev')}</summary><div class="inner"><div class="paper" style="overflow-x:auto"><table class="scenes"><thead><tr><th>التوقيت</th><th>الصورة</th><th>الصوت</th></tr></thead><tbody>${a.scenes.map((s) => `<tr><td>${esc(s.time)}</td><td>${esc(s.visual)}</td><td>${esc(s.audio)}</td></tr>`).join('')}</tbody></table></div></div></details>` : ''}
    <div class="claude-box" style="margin-top:18px">
      <h4>${icon('pen', '')} حوّله إلى سكريبت أو سيناريو</h4>
      <p>انسخ ملف المقطع كاملاً (الرابط والتحليل والنص والمشاهد)، ثم الصقه في Claude ليكتبه لك بمهارة محمد مفيد.</p>
      <div class="row"><button class="btn primary" data-copy="script">${icon('copy')}انسخ لكتابة السكريبت</button><button class="btn" data-copy="screenplay">${icon('film')}انسخ لكتابة السيناريو</button></div>
    </div>
    <div class="faint" style="font-size:.74rem;margin-top:14px">${v.analyzed_at ? `حُلّل ${ago(v.analyzed_at)}` : ''}${a._model ? ` · ${esc(a._model)}` : ''}</div>`;
}

function claudePrompt(v, kind) {
  const a = v.analysis || {};
  if (kind === 'transcript') return a.transcript || '';
  const P = PLATFORMS[v.platform];
  const skill = kind === 'script' ? 'mofeed-script-writing' : 'mofeed-screenplay-writing';
  const what = kind === 'script' ? 'سكريبت' : 'سيناريو';
  const lines = [
    `اكتب لي ${what} بمهارة ${skill}، مستوحى من هذا المقطع الفيروسي (لا تنسخه، استلهم أسباب نجاحه):`,
    '',
    `الرابط: ${v.url}`,
    `المنصة: ${P?.name || v.platform}`,
    `العنوان: ${v.title || ''}`,
    `الأرقام: ${full(v.views)} مشاهدة · ${full(v.likes)} إعجاب · ${full(v.comments)} تعليق · درجة الانتشار ${Math.round(v.score || 0)}/100`,
    v.duration_sec ? `المدة: ${duration(v.duration_sec)}` : '',
    '',
    a.hook ? `الهوك: ${a.hook.moment || ''} (${a.hook.type || ''}) — ${a.hook.why || ''}` : '',
    a.viral_reasons?.length ? `أسباب الانتشار:\n${a.viral_reasons.map((r, i) => `${i + 1}. ${r}`).join('\n')}` : '',
    a.formula ? `القالب: ${a.formula}` : '',
    a.pacing ? `الإيقاع: ${a.pacing}` : '',
    a.editing ? `المونتاج: ${a.editing}` : '',
    '',
    a.transcript ? `النص المنطوق:\n${a.transcript}` : '',
    '',
    a.scenes?.length ? `المشاهد:\n${a.scenes.map((s) => `${s.time} | ${s.visual} | ${s.audio}`).join('\n')}` : '',
    '',
    'موضوعي أنا: [اكتب هنا فكرتك أو مجالك]',
  ];
  return lines.filter((l, i, arr) => l !== '' || arr[i - 1] !== '').join('\n').trim();
}

function editAnalysis(o, v) {
  const a = v.analysis || {};
  const box = $('#analysis', o);
  box.innerHTML = `
    <form class="stack" id="editF">
      <label class="field"><span>الملخص</span><textarea class="input" name="summary" rows="2">${esc(a.summary || '')}</textarea></label>
      <div class="grid-2">
        <label class="field"><span>لحظة الهوك</span><textarea class="input" name="hook_moment" rows="2">${esc(a.hook?.moment || '')}</textarea></label>
        <label class="field"><span>لماذا نجح الهوك</span><textarea class="input" name="hook_why" rows="2">${esc(a.hook?.why || '')}</textarea></label>
      </div>
      <label class="field"><span>أسباب الانتشار (سبب في كل سطر)</span><textarea class="input" name="reasons" rows="5">${esc((a.viral_reasons || []).join('\n'))}</textarea></label>
      <label class="field"><span>الدرس المستفاد</span><textarea class="input" name="lesson" rows="2">${esc(a.lesson || '')}</textarea></label>
      <label class="field"><span>القالب</span><textarea class="input" name="formula" rows="2">${esc(a.formula || '')}</textarea></label>
      <label class="field"><span>النص المنطوق</span><textarea class="input" name="transcript" rows="6">${esc(a.transcript || '')}</textarea></label>
      <div class="row end"><button type="button" class="btn ghost" id="cancelE">إلغاء</button><button class="btn primary">${icon('check')}احفظ</button></div>
    </form>`;
  $('#cancelE', o).onclick = () => renderSheet(o, v);
  $('#editF', o).onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    const next = { ...a, summary: f.summary.value.trim(), hook: { ...(a.hook || {}), moment: f.hook_moment.value.trim(), why: f.hook_why.value.trim() }, viral_reasons: f.reasons.value.split('\n').map((s) => s.trim()).filter(Boolean), lesson: f.lesson.value.trim(), formula: f.formula.value.trim(), transcript: f.transcript.value };
    try { await D.updateVideo(v.id, { analysis: next }); v.analysis = next; toast('حُفظ التعديل'); renderSheet(o, v); } catch (err) { toast(err.message, 'err'); }
  };
}

// ================================================================ إضافة كروم
function pageExtension(root) {
  const p = D.getProfile();
  root.innerHTML = `
    <div class="page-head"><div><div class="eyebrow">${icon('puzzle')}أداة إضافية</div><h1>إضافة <span class="tone">كروم</span></h1><p>أثناء تصفحك لتيك توك أو إنستغرام أو يوتيوب، اضغط زر M512 فيُضاف المقطع المفتوح إلى المنصة ويُحلَّل مباشرة.</p></div>
      <a class="btn primary" href="/downloads/m512-extension.zip" download>${icon('download')}حمّل الإضافة</a></div>
    <div class="grid-2" style="align-items:start">
      <section class="panel">
        <h3>التثبيت (مرة واحدة)</h3><p>كروم لا يحتاج متجراً لهذه الطريقة.</p>
        <ol class="steps">
          <li><div><b>حمّل الملف وفك الضغط</b><span>اضغط "حمّل الإضافة"، ثم فك ضغط الملف في مجلد ثابت لا تحذفه.</span></div></li>
          <li><div><b>افتح صفحة الإضافات</b><span>اكتب في شريط العنوان <code>chrome://extensions</code> وفعّل "وضع المطوّر" أعلى الصفحة.</span></div></li>
          <li><div><b>حمّل المجلد</b><span>اضغط "تحميل إضافة غير مضغوطة" واختر المجلد الذي فككت ضغطه.</span></div></li>
          <li><div><b>ثبّتها في الشريط</b><span>اضغط أيقونة قطعة البازل بجانب شريط العنوان، ثم الدبوس بجانب M512.</span></div></li>
          <li><div><b>اربطها بحسابك</b><span>افتح الإضافة وألصق رابط المنصة ورمزك الخاص من الأسفل.</span></div></li>
        </ol>
      </section>
      <section class="panel active">
        <h3>بيانات الربط</h3><p>هذه البيانات خاصة بك، لا تشاركها مع أحد.</p>
        <div class="stack">
          <label class="field"><span>رابط المنصة</span><div class="token-box"><span class="code">${esc(location.origin)}</span><button class="btn sm" data-c="${esc(location.origin)}">${icon('copy')}انسخ</button></div></label>
          <label class="field"><span>رمزك الخاص</span><div class="token-box"><span class="code" id="tok">${esc(p.ext_token || '')}</span><button class="btn sm" id="copyTok">${icon('copy')}انسخ</button></div><small>إن شككت أن أحداً رأى رمزك، جدّده من <a href="#/settings">إعداداتي</a>.</small></label>
        </div>
        <hr class="divider">
        <h3>ماذا تفعل الإضافة؟</h3>
        <ul class="checklist" style="margin-top:10px">
          <li><span class="ok">${icon('check')}</span>تقرأ الصورة المصغرة والعنوان والأرقام من الصفحة المفتوحة</li>
          <li><span class="ok">${icon('check')}</span>ترسلها للمنصة مع التصنيف الذي تختاره</li>
          <li><span class="ok">${icon('check')}</span>تعرض درجة الانتشار وتفتح التحليل الكامل</li>
          <li><span class="ok">${icon('check')}</span>تنسخ الرابط لتلصقه في Claude</li>
        </ul>
      </section>
    </div>`;
  $$('[data-c]', root).forEach((b) => b.onclick = () => copyText(b.dataset.c));
  $('#copyTok', root).onclick = () => copyText($('#tok', root).textContent, 'نُسخ الرمز');
}

// ================================================================ إعداداتي
function pageMySettings(root) {
  const p = D.getProfile();
  root.innerHTML = `
    <div class="page-head"><div><div class="eyebrow">${icon('user')}حسابي</div><h1>إعدادات <span class="tone">حسابي</span></h1></div></div>
    <div class="grid-2" style="align-items:start">
      <div>
        <section class="panel"><h3>الملف الشخصي</h3><p>${esc(p.email || '')}</p>
          <form class="row" id="nameF"><input class="input" style="flex:1" name="n" value="${esc(p.full_name || '')}"><button class="btn primary">${icon('check')}احفظ</button></form></section>
        <section class="panel"><h3>كلمة المرور</h3><p>6 أحرف على الأقل.</p>
          <form class="row" id="pwF"><input class="input ltr" style="flex:1" type="password" name="pw" autocomplete="new-password" placeholder="كلمة مرور جديدة"><button class="btn">${icon('lock')}غيّر</button></form></section>
      </div>
      <section class="panel active"><h3>رمز إضافة كروم</h3><p>تستخدمه الإضافة لتضيف المقاطع باسمك.</p>
        <div class="token-box"><span class="code" id="tok">${esc(p.ext_token || '')}</span><button class="btn sm" id="cT">${icon('copy')}انسخ</button></div>
        <div class="row" style="margin-top:12px"><button class="btn sm" id="rT">${icon('refresh')}جدّد الرمز</button><a class="btn sm ghost" href="#/extension">${icon('puzzle')}طريقة التثبيت</a></div>
      </section>
    </div>`;
  $('#nameF', root).onsubmit = async (e) => { e.preventDefault(); try { await D.updateMyName(e.target.n.value.trim()); toast('حُفظ الاسم'); renderShell(); highlightNav(); renderPage('settings'); } catch (err) { toast(err.message, 'err'); } };
  $('#pwF', root).onsubmit = async (e) => { e.preventDefault(); const pw = e.target.pw.value; if (pw.length < 6) return toast('كلمة المرور قصيرة', 'err'); try { await D.updatePassword(pw); e.target.reset(); toast('تغيّرت كلمة المرور'); } catch (err) { toast(err.message, 'err'); } };
  $('#cT', root).onclick = () => copyText($('#tok', root).textContent, 'نُسخ الرمز');
  $('#rT', root).onclick = async () => { if (!confirm('الرمز القديم سيتوقف عن العمل في الإضافة. متابعة؟')) return; try { $('#tok', root).textContent = await D.regenerateToken(); toast('تجدد الرمز، حدّثه في الإضافة'); } catch (err) { toast(err.message, 'err'); } };
}

// ================================================================ لوحة التحكم
async function pageDashboard(root) {
  root.innerHTML = `<div class="page-head"><div><div class="eyebrow">${icon('dashboard')}الإدارة</div><h1>لوحة <span class="tone">التحكم</span></h1></div><a class="btn" href="#/admin/settings/youtube">${icon('settings')}الإعدادات</a></div><div id="dash">${skeletonGrid(4)}</div>`;
  let s;
  try { s = await D.stats(); } catch (e) { $('#dash', root).innerHTML = errBox(e); return; }
  const ytPct = Math.min(100, Math.round(s.usage.youtube / 100));
  const setup = [
    [D.getMode() === 'live', 'ربط Supabase و Vercel', ''],
    [s.keys.youtube, 'مفتاح YouTube API', '#/admin/settings/youtube'],
    [s.keys.gemini, 'مفتاح Gemini للتحليل', '#/admin/settings/analysis'],
    [s.videos > 0, 'أول مقطع في المكتبة', '#/discover/youtube'],
    [s.users > 1, 'أول طالب في المنصة', '#/admin/users'],
  ];
  $('#dash', root).innerHTML = `
    <div class="stat-tiles">
      <div class="tile hero"><small>${icon('library')}كل المقاطع</small><b class="num">${full(s.videos)}</b></div>
      <div class="tile"><small>${icon('sparkles')}المحلَّلة</small><b class="num">${full(s.analyzed)}</b></div>
      <div class="tile"><small>${icon('users')}المستخدمون</small><b class="num">${full(s.users)}</b></div>
      <div class="tile"><small>${icon('clock')}بانتظار التفعيل</small><b class="num">${full(s.pending)}</b>${s.pending ? `<a href="#/admin/users" style="font-size:.8rem">فعّلهم الآن</a>` : ''}</div>
    </div>
    <div class="grid-2" style="align-items:start">
      <section class="panel">
        <h3>الاستهلاك اليومي المجاني</h3><p>يتجدد يومياً. عند الاقتراب من الحد، شجّع الطلاب على تصفح المكتبة بدل البحث الجديد.</p>
        <div class="stack" style="gap:6px">
          <div class="row between"><span>يوتيوب</span><span class="num muted">${full(s.usage.youtube)} / 10,000</span></div>
          <div class="bar"><i style="width:${ytPct}%"></i></div>
          <small class="faint">≈ ${Math.max(0, Math.floor((10000 - s.usage.youtube) / 102))} عملية بحث متبقية اليوم</small>
          <div class="row between" style="margin-top:12px"><span>تحليلات Gemini اليوم</span><span class="num muted">${full(s.usage.gemini)}</span></div>
        </div>
        <hr class="divider">
        <h3>المقاطع حسب المنصة</h3>
        <div class="stack" style="gap:8px;margin-top:10px">${Object.entries(s.byPlatform).map(([k, n]) => `<div class="part" style="grid-template-columns:120px 1fr 50px"><span>${icon(PLATFORMS[k].icon, '')} ${PLATFORMS[k].name}</span><div class="bar"><i style="width:${s.videos ? n / s.videos * 100 : 0}%"></i></div><b class="num">${n}</b></div>`).join('')}</div>
      </section>
      <section class="panel active">
        <h3>قائمة الإعداد</h3><p>أكمل هذه الخطوات لتعمل المنصة بالكامل.</p>
        <ul class="checklist">${setup.map(([ok, label, href]) => `<li><span class="${ok ? 'ok' : 'no'}">${ok ? icon('check') : ''}</span>${href && !ok ? `<a href="${href}">${label}</a>` : label}</li>`).join('')}</ul>
      </section>
    </div>`;
}

// ================================================================ المستخدمون
async function pageUsers(root) {
  root.innerHTML = `
    <div class="page-head"><div><div class="eyebrow">${icon('users')}الإدارة</div><h1>المستخدمون <span class="tone">والطلاب</span></h1><p>الطلاب يسجّلون من صفحة الدخول ويظهرون هنا بانتظار التفعيل، أو أنشئ حساباً لطالب مباشرة.</p></div></div>
    <details class="fold"><summary>${icon('plus')}أنشئ حساب طالب${icon('chev', 'chev')}</summary><div class="inner">
      <form class="grid-4" id="newU" style="align-items:end">
        <label class="field"><span>الاسم</span><input class="input" name="full_name" required></label>
        <label class="field"><span>البريد</span><input class="input ltr" name="email" type="email" required></label>
        <label class="field"><span>كلمة مرور مؤقتة</span><input class="input ltr" name="password" minlength="6" required></label>
        <button class="btn primary">${icon('plus')}أنشئ</button>
      </form></div></details>
    <div id="ulist"><div class="skeleton" style="height:220px"></div></div>`;
  $('#newU', root).onsubmit = async (e) => {
    e.preventDefault(); const f = e.target, b = f.querySelector('button'); busy(b, true);
    try { await D.createUser({ full_name: f.full_name.value.trim(), email: f.email.value.trim(), password: f.password.value }); toast('أُنشئ الحساب ومفعّل. أرسل البريد وكلمة المرور للطالب'); f.reset(); draw(); } catch (err) { toast(err.message, 'err'); }
    busy(b, false);
  };
  const draw = async () => {
    let list;
    try { list = await D.users(); } catch (e) { $('#ulist', root).innerHTML = errBox(e); return; }
    const me = D.getProfile().id;
    const st = { active: '<span class="pill solid">مفعّل</span>', pending: '<span class="pill outline">بانتظار التفعيل</span>', blocked: '<span class="pill">موقوف</span>' };
    $('#ulist', root).innerHTML = `<div class="table-wrap"><table class="tbl"><thead><tr><th>الاسم</th><th>البريد</th><th>الدور</th><th>الحالة</th><th>انضم</th><th></th></tr></thead><tbody>
      ${list.map((u) => `<tr data-u="${u.id}">
        <td><div class="row" style="flex-wrap:nowrap"><span class="avatar" style="width:30px;height:30px;font-size:.8rem">${esc(initials(u.full_name))}</span>${esc(u.full_name || '')}</div></td>
        <td class="num">${esc(u.email || '')}</td>
        <td>${u.role === 'admin' ? 'مدير' : 'طالب'}</td><td>${st[u.status]}</td><td class="muted">${ago(u.created_at)}</td>
        <td><div class="row" style="flex-wrap:nowrap;justify-content:flex-end">${u.id === me ? '<span class="faint">أنت</span>' : `
          ${u.status !== 'active' ? `<button class="btn sm primary" data-a="activate">${icon('check')}فعّل</button>` : `<button class="btn sm" data-a="block">أوقف</button>`}
          <button class="btn sm" data-a="role">${u.role === 'admin' ? 'اجعله طالباً' : 'اجعله مديراً'}</button>
          <button class="btn sm danger icon" data-a="delete" title="حذف">${icon('trash')}</button>`}</div></td></tr>`).join('')}
    </tbody></table></div>`;
    $$('[data-a]', root).forEach((b) => b.onclick = async () => {
      const id = b.closest('tr').dataset.u, u = list.find((x) => x.id === id), a = b.dataset.a;
      try {
        if (a === 'activate') await D.updateUser(id, { status: 'active' });
        if (a === 'block') await D.updateUser(id, { status: 'blocked' });
        if (a === 'role') await D.updateUser(id, { role: u.role === 'admin' ? 'student' : 'admin' });
        if (a === 'delete') { if (!confirm(`حذف حساب ${u.full_name} نهائياً؟`)) return; await D.deleteUser(id); }
        toast('تم'); draw();
      } catch (err) { toast(err.message, 'err'); }
    });
  };
  draw();
}

// ================================================================ إعدادات الإدارة
const SET_TABS = [
  ['youtube', 'youtube', 'يوتيوب'], ['shorts', 'shorts', 'شورتس'], ['tiktok', 'tiktok', 'تيك توك'], ['instagram', 'instagram', 'إنستغرام'],
  ['analysis', 'sparkles', 'التحليل'], ['categories', 'layers', 'التصنيفات'], ['tiers', 'trend', 'مستويات الانتشار'], ['general', 'users', 'صلاحيات الطلاب'],
];

async function pageAdminSettings(root, tab) {
  let s;
  try { s = await D.settings(); } catch (e) { root.innerHTML = errBox(e); return; }
  root.innerHTML = `
    <div class="page-head"><div><div class="eyebrow">${icon('settings')}الإدارة</div><h1>الإعدادات <span class="tone">والمفاتيح</span></h1><p>كل ما تحتاجه المنصة يُضبط من هنا. المفاتيح السرية لا يراها إلا المدير.</p></div>
      <button class="btn" id="testK">${icon('zap')}اختبر المفاتيح</button></div>
    <div id="testRes"></div>
    <div class="tabs">${SET_TABS.map(([k, ic, l]) => `<button class="${k === tab ? 'on' : ''}" data-tab="${k}">${icon(ic)}${l}</button>`).join('')}</div>
    <div id="tabBody"></div>`;
  $$('[data-tab]', root).forEach((b) => b.onclick = () => { location.hash = '#/admin/settings/' + b.dataset.tab; });
  $('#testK', root).onclick = async (e) => {
    busy(e.currentTarget, true, 'نختبر…');
    try {
      const r = await D.testKeys();
      $('#testRes', root).innerHTML = `<section class="panel" style="margin-bottom:18px"><ul class="checklist">${[['youtube', 'يوتيوب'], ['gemini', 'Gemini'], ['ytdlp', 'جلب تيك توك وإنستغرام']].map(([k, l]) => `<li><span class="${r[k]?.ok ? 'ok' : 'no'}">${r[k]?.ok ? icon('check') : icon('x')}</span><b>${l}:</b>&nbsp;<span class="muted">${esc(r[k]?.message || '')}</span></li>`).join('')}</ul></section>`;
    } catch (err) { toast(err.message, 'err'); }
    busy(e.currentTarget, false);
  };
  const body = $('#tabBody', root);
  const sw = (key, title, desc) => `<label class="switch"><span class="txt"><b>${title}</b><small>${desc}</small></span><input type="checkbox" data-k="${key}" ${s[key] !== false ? 'checked' : ''}></label>`;
  const keyField = (key, label, help) => `<label class="field"><span>${label}</span><div class="key-field"><input class="input ltr" type="password" data-k="${key}" value="${esc(s[key] || '')}" autocomplete="off" placeholder="الصق المفتاح هنا"><button type="button" class="btn ghost icon sm" data-show>${icon('eye')}</button></div><small>${help}</small></label>`;
  const num = (key, label, help, min, max) => `<label class="field"><span>${label}</span><input class="input ltr" type="number" data-k="${key}" data-num value="${esc(s[key] ?? '')}" min="${min}" max="${max}"><small>${help}</small></label>`;
  const save = `<div class="row end" style="margin-top:16px"><button class="btn primary" id="saveS">${icon('check')}احفظ الإعدادات</button></div>`;

  const T = {
    youtube: () => `
      <section class="panel active"><h3>مفتاح YouTube Data API</h3><p>مجاني بحصة 10,000 وحدة يومياً، ويُستخدم ليوتيوب وشورتس معاً.</p>
        ${keyField('youtube_api_key', 'المفتاح', 'من Google Cloud Console: فعّل "YouTube Data API v3" ثم أنشئ API key. الخطوات بالتفصيل في دليل الإعداد.')}
      </section>
      <section class="panel"><h3>البحث الافتراضي</h3><p>القيم التي تظهر مسبقاً في صفحة البحث.</p>
        <div class="grid-3">
          <label class="field"><span>الدولة</span><select class="input" data-k="youtube_region">${opts(REGIONS, s.youtube_region || 'SA')}</select></label>
          <label class="field"><span>فترة النشر (أيام)</span><select class="input" data-k="youtube_period_days" data-num>${opts([['7', '7'], ['30', '30'], ['90', '90'], ['365', '365'], ['0', 'أي وقت']], String(s.youtube_period_days ?? 30))}</select></label>
          <label class="field"><span>مدة فيديو يوتيوب</span><select class="input" data-k="youtube_duration">${opts([['medium', 'متوسط 4-20 د'], ['long', 'طويل +20 د'], ['any', 'الكل']], s.youtube_duration || 'medium')}</select></label>
          ${num('youtube_results', 'نتائج كل بحث', 'من 5 إلى 50. التكلفة ثابتة 100 وحدة.', 5, 50)}
          ${num('search_cache_hours', 'حفظ نتائج البحث (ساعات)', 'نفس البحث خلال هذه المدة لا يستهلك الحصة.', 0, 168)}
        </div></section>${save}`,
    shorts: () => `
      <section class="panel active"><h3>يوتيوب شورتس</h3><p>يستخدم مفتاح يوتيوب نفسه، لا يحتاج مفتاحاً إضافياً.</p>
        <div class="grid-2">${num('shorts_max_seconds', 'أقصى مدة للشورت (ثانية)', 'يوتيوب يسمح حتى 180 ثانية. المقاطع الأطول تُعدّ فيديو عادياً.', 30, 180)}</div>
      </section>${save}`,
    tiktok: () => platformTab('tiktok', 'تيك توك'),
    instagram: () => platformTab('instagram', 'إنستغرام'),
    analysis: () => `
      <section class="panel active"><h3>مفتاح Gemini</h3><p>مجاني من Google AI Studio. يشاهد الفيديو ويكتب التحليل والنص المنطوق.</p>
        ${keyField('gemini_api_key', 'المفتاح', 'من aistudio.google.com ← Get API key ← Create API key.')}
        <div class="grid-2" style="margin-top:14px">
          <label class="field"><span>النموذج الأساسي</span><input class="input ltr" data-k="gemini_model" value="${esc(s.gemini_model || 'gemini-3.5-flash')}"><small>غيّره إذا أعلنت جوجل نموذجاً مجانياً أحدث.</small></label>
          <label class="field"><span>النموذج الاحتياطي</span><input class="input ltr" data-k="gemini_fallback_model" value="${esc(s.gemini_fallback_model || 'gemini-3.5-flash-lite')}"><small>يُستخدم تلقائياً عند انتهاء حصة الأساسي.</small></label>
        </div>
      </section>
      <section class="panel"><h3>متى يعمل التحليل؟</h3><p>كل مقطع يُحلَّل مرة واحدة ثم يُحفظ للجميع.</p>
        ${sw('auto_analyze_on_add', 'حلّل عند الإضافة بالرابط أو الإضافة', 'المقاطع المضافة يدوياً تُحلَّل فوراً.')}
        ${sw('auto_analyze_on_open', 'حلّل عند فتح المقطع أول مرة', 'نتائج البحث لا تُحلَّل كلها، بل عند فتح أي مقطع، توفيراً للحصة.')}
      </section>${save}`,
    categories: () => `
      <section class="panel active"><h3>أنواع المحتوى</h3><p>تظهر كأزرار سريعة في البحث وكفلاتر. رقم تصنيف يوتيوب يُستخدم في "الرائج الآن" (اختياري).</p>
        <div class="chips" id="catList" style="margin-bottom:16px">${S.cats.map((c) => `<span class="chip on" style="display:inline-flex;gap:6px;align-items:center">${esc(c.name)}<button class="btn ghost icon sm" data-del="${c.id}" style="padding:0;color:inherit">${icon('x')}</button></span>`).join('')}</div>
        <form class="grid-4" id="catF" style="align-items:end">
          <label class="field"><span>الاسم</span><input class="input" name="name" required placeholder="مثال: سيارات"></label>
          <label class="field"><span>بالإنجليزية</span><input class="input ltr" name="name_en" placeholder="cars"></label>
          <label class="field"><span>رقم تصنيف يوتيوب</span><select class="input" name="yt">${opts(YT_CATS, '')}</select></label>
          <button class="btn primary">${icon('plus')}أضف</button>
        </form></section>`,
    tiers: () => {
      const t = s.tier_thresholds || { mega: 80, viral: 65, hot: 50, good: 35 };
      return `
      <section class="panel active"><h3>حدود المستويات</h3><p>درجة الانتشار من 100، والمستوى يتحدد بهذه الحدود.</p>
        <div class="grid-4">${TIERS.slice(0, 4).map((x) => `<label class="field"><span class="pill tier-${x.key}" style="align-self:flex-start">${x.name}</span><input class="input ltr" type="number" data-tier="${x.key}" value="${t[x.key]}" min="0" max="100"><small>من ${t[x.key]} فما فوق</small></label>`).join('')}</div>
      </section>
      <section class="panel"><h3>كيف تُحسب الدرجة؟</h3><p>أربعة مؤشرات، والدرجة متوسطها الموزون:</p>
        <ol class="steps">
          <li><div><b>حجم الوصول (35%)</b><span>المشاهدات على مقياس لوغاريتمي: ألف مشاهدة = 0، 50 مليون = 100.</span></div></li>
          <li><div><b>التفوق على القناة (25%)</b><span>المشاهدات ÷ المتابعين. مقطع شاهده 100 ضعف متابعي صاحبه = 100. هذا أقوى مؤشر على أن المحتوى نفسه هو السبب.</span></div></li>
          <li><div><b>سرعة الانتشار (25%)</b><span>متوسط المشاهدات اليومية منذ النشر: 100 يومياً = 0، مليون يومياً = 100.</span></div></li>
          <li><div><b>التفاعل (15%)</b><span>(إعجابات + تعليقات + مشاركات) ÷ المشاهدات. نسبة 10% = 100.</span></div></li>
        </ol></section>${save}`;
    },
    general: () => `
      <section class="panel active"><h3>ما الذي يستطيع الطلاب فعله؟</h3><p>المدير يستطيع كل شيء دائماً.</p>
        ${sw('students_can_search', 'البحث المباشر في يوتيوب وشورتس', 'أوقفه إن كانت الحصة اليومية تنفد بسرعة، ويبقى تصفح المكتبة متاحاً.')}
        ${sw('students_can_add', 'إضافة مقاطع بالرابط أو إضافة كروم', 'كل مقطع يضيفه طالب يظهر في المكتبة للجميع.')}
      </section>${save}`,
  };

  function platformTab(key, name) {
    return `
      <section class="panel active"><h3>${name}</h3><p>${name} لا يوفر بحثاً مجانياً مفتوحاً، لذلك تعمل المنصة بطريقتين مجانيتين:</p>
        <ol class="steps">
          <li><div><b>إضافة كروم (الأفضل)</b><span>تقرأ البيانات من الصفحة المفتوحة في متصفح الطالب، فتعمل حتى لو حجب ${name} الخوادم.</span></div></li>
          <li><div><b>الرابط + الجلب من الخادم</b><span>الخادم يجلب البيانات بأداة yt-dlp المجانية. قد يتعطل أحياناً إذا غيّر ${name} موقعه، وحينها يظهر الإدخال اليدوي.</span></div></li>
        </ol>
        <hr class="divider">
        ${sw(key + '_server_fetch', 'الجلب من الخادم (yt-dlp)', 'أوقفه إن كان يفشل دائماً، فتعتمد المنصة على الإضافة والإدخال اليدوي.')}
      </section>
      <section class="panel"><h3>التحليل</h3><p>الخادم يحاول تحميل الفيديو (حتى 40MB) ليشاهده Gemini كاملاً. إن تعذر، يُحلَّل من الصورة المصغرة والنص ويُكتب "تحليل جزئي".</p></section>${save}`;
  }

  body.innerHTML = (T[tab] || T.youtube)();
  $$('[data-show]', body).forEach((b) => b.onclick = () => { const i = b.previousElementSibling; i.type = i.type === 'password' ? 'text' : 'password'; });
  $('#saveS', body)?.addEventListener('click', async (e) => {
    const out = {};
    $$('[data-k]', body).forEach((el) => {
      const k = el.dataset.k;
      out[k] = el.type === 'checkbox' ? el.checked : el.dataset.num !== undefined ? Number(el.value || 0) : el.value.trim();
    });
    if ($$('[data-tier]', body).length) {
      out.tier_thresholds = Object.fromEntries($$('[data-tier]', body).map((el) => [el.dataset.tier, Number(el.value)]));
      const t = out.tier_thresholds;
      if (!(t.mega > t.viral && t.viral > t.hot && t.hot > t.good)) return toast('يجب أن تكون الحدود تنازلية: انفجار > فيروسي > ناجح جداً > ناجح', 'err');
    }
    busy(e.currentTarget, true);
    try { await D.saveSettings(out); Object.assign(S.settings, out); toast('حُفظت الإعدادات'); } catch (err) { toast(err.message, 'err'); }
    busy(e.currentTarget, false);
  });
  $('#catF', body)?.addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.target;
    try { await D.addCategory({ name: f.name.value.trim(), name_en: f.name_en.value.trim() || null, yt_category_id: f.yt.value || null, sort: (S.cats.length + 1) * 10 }); S.cats = await D.categories(); toast('أُضيف التصنيف'); pageAdminSettings(root, 'categories'); } catch (err) { toast(err.message, 'err'); }
  });
  $$('[data-del]', body).forEach((b) => b.onclick = async () => {
    try { await D.deleteCategory(Number(b.dataset.del) || b.dataset.del); S.cats = await D.categories(); pageAdminSettings(root, 'categories'); } catch (err) { toast(err.message, 'err'); }
  });
}

const YT_CATS = [['', 'بدون'], ['1', 'أفلام ورسوم'], ['2', 'سيارات'], ['10', 'موسيقى'], ['15', 'حيوانات'], ['17', 'رياضة'], ['19', 'سفر'], ['20', 'ألعاب'], ['22', 'أشخاص ومدونات'], ['23', 'كوميديا'], ['24', 'ترفيه'], ['25', 'أخبار'], ['26', 'أسلوب حياة'], ['27', 'تعليم'], ['28', 'علوم وتقنية']];
