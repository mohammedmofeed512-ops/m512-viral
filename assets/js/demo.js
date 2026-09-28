// بيانات تجريبية تظهر فقط قبل ربط المنصة بقاعدة البيانات (كلها أمثلة مُختلقة للعرض)
function thumb(title, vertical, hue = 0) {
  const w = vertical ? 360 : 640, h = vertical ? 560 : 360;
  const stops = [['#B4E3E0', '#6BB8B5', '#3C8D8A', '#1F4B55', '#101E27'], ['#9AD3D0', '#3E9794', '#2A6F70', '#1C4751', '#132A34'], ['#6BB8B5', '#3C8D8A', '#303E47', '#1A2A34', '#101E27']][hue % 3];
  const cx = [10, 80, 40][hue % 3];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><radialGradient id="g" cx="${cx}%" cy="100%" r="130%"><stop offset="0" stop-color="${stops[0]}"/><stop offset=".25" stop-color="${stops[1]}"/><stop offset=".5" stop-color="${stops[2]}"/><stop offset=".75" stop-color="${stops[3]}"/><stop offset="1" stop-color="${stops[4]}"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><path d="M${w / 2 - 22} ${h / 2 - 60} h44 v52 l-22 -18 l-22 18z" fill="#F5F5F5" opacity=".9"/><text x="50%" y="${h / 2 + 34}" fill="#F5F5F5" font-family="Alexandria,sans-serif" font-size="${vertical ? 24 : 28}" font-weight="700" text-anchor="middle">${title}</text></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

const daysAgo = (d) => new Date(Date.now() - d * 86400000).toISOString();

const ANALYSIS = {
  summary: 'طالب يجرّب المذاكرة 10 ساعات متواصلة بطريقة بومودورو ويعرض النتيجة الحقيقية في النهاية.',
  content_type: 'تحدٍّ تعليمي',
  hook: { moment: 'يظهر أمام ساعة مكتوب عليها 10:00:00 ويقول: "جرّبت أذاكر 10 ساعات بدون جوال… والنتيجة صدمتني"', type: 'وعد + فضول', why: 'رقم كبير محدد، وتحدٍّ يعرفه كل طالب، ووعد بنتيجة غير متوقعة يجبر المشاهد على البقاء حتى النهاية.' },
  pacing: 'مقطع 58 ثانية، لقطة جديدة كل ثانية ونصف تقريباً، مع قفزات زمنية واضحة (الساعة 1، الساعة 4، الساعة 8).',
  editing: 'عدّاد زمني ثابت أعلى الشاشة، نصوص كبيرة لكل مرحلة، موسيقى تتسارع مع اقتراب النهاية، وصوت تكّة ساعة عند كل انتقال.',
  topic_emotion: 'يلمس إحساس الذنب عند الطلاب من التشتت، ويقدّم أملاً بأن التغيير ممكن في يوم واحد.',
  title_thumbnail: 'العنوان يحمل رقماً ونتيجة غامضة، والصورة المصغرة وجه متعب بجانب ساعة كبيرة، تناقض يثير الفضول.',
  audience: 'طلاب المدارس والجامعات 15 إلى 24 سنة.',
  cta: 'يطلب في النهاية: "جرّبها غداً واكتب لي كم ساعة صمدت".',
  viral_reasons: ['تحدٍّ بأرقام محددة يسهل فهمه في ثانية', 'نهاية غير متوقعة ترفع نسبة المشاهدة الكاملة', 'قابل للتقليد فيدفع الطلاب لنشر تجاربهم', 'دعوة تعليق تولّد نقاشاً كبيراً', 'إيقاع سريع لا يترك لحظة ملل'],
  lesson: 'ابدأ برقم محدد ووعد بنتيجة، واحتفظ بالنتيجة الحقيقية حتى آخر 5 ثوانٍ.',
  formula: 'تحدٍّ برقم ← عدّاد زمني ← 3 محطات صعبة ← نتيجة غير متوقعة ← دعوة للتجربة',
  transcript: 'جرّبت أذاكر عشر ساعات بدون جوال… والنتيجة صدمتني.\n[الساعة 1] أول ساعة كانت سهلة، حماس كامل.\n[الساعة 4] هون بلّش التعب، وصرت أدوّر على أي عذر.\n[الساعة 8] ما بقدر أركّز… بس كمّلت.\nوالنتيجة؟ خلّصت مادة كاملة كنت مأجلها شهر.\nجرّبها بكرة واكتبلي كم ساعة صمدت.',
  scenes: [
    { time: '0:00-0:03', visual: 'لقطة قريبة للوجه مع ساعة كبيرة 10:00:00', audio: 'جرّبت أذاكر 10 ساعات بدون جوال' },
    { time: '0:03-0:15', visual: 'مكتب مرتب، وضع الجوال في درج، بدء المؤقت', audio: 'موسيقى هادئة + تكّة ساعة' },
    { time: '0:15-0:35', visual: 'قفزات زمنية مع نص "الساعة 4" و"الساعة 8"، علامات التعب', audio: 'تعليق صوتي قصير لكل مرحلة' },
    { time: '0:35-0:52', visual: 'دفتر ممتلئ، مادة مكتملة، ابتسامة', audio: 'خلّصت مادة كاملة كنت مأجلها شهر' },
    { time: '0:52-0:58', visual: 'نظرة للكاميرا ونص "كم ساعة بتصمد؟"', audio: 'جرّبها بكرة واكتبلي' },
  ],
  _model: 'gemini-3.5-flash',
};

const raw = [
  ['shorts', 'جرّبت أذاكر 10 ساعات بدون جوال… والنتيجة صدمتني', 'قناة مذاكرة ذكية', 'تعليم', 'ar', 4200000, 380000, 9100, 120000, 58, 6, 88, ANALYSIS],
  ['youtube', 'بنيت بيت كامل من الطين في 30 يوم لوحدي', 'مغامرات بدوية', 'فلوق', 'ar', 8900000, 410000, 23000, 900000, 1260, 21, 81],
  ['tiktok', 'ردة فعل أبوي لما قلتله إني تركت الجامعة (مقلب)', 'عائلة سند', 'عائلي', 'ar', 12400000, 1900000, 41000, 350000, 34, 4, 90],
  ['instagram', 'أسرع طريقة تطبخ فيها رز بخاري في 15 دقيقة', 'مطبخ ريم', 'طبخ', 'ar', 2300000, 210000, 3400, 80000, 45, 9, 76],
  ['shorts', 'Trying the world\'s hardest football skill for 7 days', 'Skill Lab', 'رياضة', 'en', 15600000, 900000, 12000, 1400000, 49, 12, 84],
  ['youtube', 'I Spent 100 Days Learning to Code From Zero', 'Pixel Path', 'تقنية', 'en', 3100000, 120000, 8800, 450000, 1840, 44, 63],
  ['tiktok', 'لما المعلم يقول "سؤال سهل" 😂', 'ضحكة صف', 'كوميديا', 'ar', 5600000, 740000, 18000, 900000, 21, 15, 71],
  ['instagram', 'This 3-second hook doubled my views', 'Creator Notes', 'تعليم', 'en', 980000, 88000, 2100, 60000, 39, 18, 58],
  ['shorts', 'أقوى هدف في دوري الحارات هذا الأسبوع ⚽', 'حارتنا سبورت', 'رياضة', 'ar', 1900000, 95000, 2600, 540000, 27, 3, 66],
  ['youtube', 'تحدي 24 ساعة في أصغر غرفة فندق في العالم', 'رحّال', 'سفر', 'ar', 1200000, 61000, 4100, 2100000, 1320, 60, 38],
  ['tiktok', 'Speedrunning the new level with no damage', 'NoHit Nate', 'ألعاب', 'en', 740000, 52000, 1900, 610000, 44, 25, 42],
  ['instagram', 'يوم كامل مع جدّتي في المزرعة 🌾', 'بيت الجبل', 'عائلي', 'ar', 430000, 39000, 800, 390000, 52, 40, 29],
];

export const DEMO_VIDEOS = raw.map((r, i) => {
  const [platform, title, channel, category, language, views, likes, comments, followers, dur, age, score, analysis] = r;
  const vertical = platform !== 'youtube';
  const vpd = Math.round(views / age);
  return {
    id: 'demo-' + (i + 1), platform, external_id: 'demo' + i, url: '#', title, description: '', channel_name: channel,
    channel_followers: followers, language, category, views, likes, comments, duration_sec: dur, published_at: daysAgo(age),
    thumbnail_url: thumb(category, vertical, i), score,
    score_parts: { reach: Math.min(100, Math.round((Math.log10(views) - 3) / 4.7 * 100)), outlier: Math.min(100, Math.round(Math.log10(Math.max(views / followers, 1)) / 2 * 100)), outlier_ratio: +(views / followers).toFixed(1), velocity: Math.min(100, Math.round((Math.log10(vpd) - 2) / 4 * 100)), views_per_day: vpd, engagement: Math.min(100, Math.round((likes + comments) / views / 0.1 * 100)), engagement_rate: +((likes + comments) / views * 100).toFixed(2) },
    analysis: analysis || null, analysis_status: analysis ? 'done' : 'none', analysis_mode: analysis ? 'video' : null,
    created_at: daysAgo(i),
  };
});

export const DEMO_CATEGORIES = ['رياضة', 'تعليم', 'ألعاب', 'ترفيه', 'كوميديا', 'عائلي', 'فلوق', 'طبخ', 'تقنية', 'تحفيز', 'سفر', 'ديني']
  .map((name, i) => ({ id: i + 1, name, sort: (i + 1) * 10 }));

export const DEMO_USERS = [
  { id: 'u1', email: 'admin@m512.demo', full_name: 'محمد مفيد', role: 'admin', status: 'active', ext_token: '7f3c2a10-4b6d-4e8f-9a21-5c0d8e7b6a31', created_at: daysAgo(40) },
  { id: 'u2', email: 'sara@m512.demo', full_name: 'سارة أحمد', role: 'student', status: 'active', created_at: daysAgo(12) },
  { id: 'u3', email: 'yousef@m512.demo', full_name: 'يوسف خالد', role: 'student', status: 'active', created_at: daysAgo(9) },
  { id: 'u4', email: 'lina@m512.demo', full_name: 'لينا محمود', role: 'student', status: 'pending', created_at: daysAgo(1) },
];
