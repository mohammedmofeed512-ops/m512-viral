-- ============================================================
-- M512 Viral Content — قاعدة البيانات
-- الصق هذا الملف كاملاً في Supabase > SQL Editor ثم اضغط Run
-- آمن للتشغيل أكثر من مرة
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- المستخدمون ----------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text,
  role        text not null default 'student' check (role in ('admin','student')),
  status      text not null default 'pending' check (status in ('pending','active','blocked')),
  ext_token   uuid not null default gen_random_uuid(),
  created_at  timestamptz not null default now()
);
create unique index if not exists profiles_ext_token_idx on public.profiles(ext_token);

-- أول مستخدم يسجّل يصبح مديراً مفعّلاً تلقائياً، والباقي طلاب بانتظار التفعيل
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare has_admin boolean;
begin
  select exists(select 1 from public.profiles where role = 'admin') into has_admin;
  insert into public.profiles (id, email, full_name, role, status)
  values (
    new.id, new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    case when has_admin then 'student' else 'admin' end,
    case when has_admin then 'pending' else 'active' end
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin' and status = 'active');
$$;

create or replace function public.is_active_user()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid() and status = 'active');
$$;

-- الطالب يستطيع تغيير اسمه فقط، وتجديد رمز الإضافة عبر هذه الدالة
create or replace function public.regenerate_ext_token()
returns uuid language plpgsql security definer set search_path = public as $$
declare t uuid := gen_random_uuid();
begin
  update public.profiles set ext_token = t where id = auth.uid();
  return t;
end $$;

create or replace function public.update_my_name(new_name text)
returns void language sql security definer set search_path = public as $$
  update public.profiles set full_name = left(new_name, 80) where id = auth.uid();
$$;

-- ---------- الفيديوهات ----------
create table if not exists public.videos (
  id               uuid primary key default gen_random_uuid(),
  platform         text not null check (platform in ('youtube','shorts','tiktok','instagram')),
  external_id      text not null,
  url              text not null,
  title            text,
  description      text,
  thumbnail_url    text,
  channel_name     text,
  channel_id       text,
  channel_followers bigint,
  language         text default 'other',
  category         text,
  search_query     text,
  views            bigint default 0,
  likes            bigint default 0,
  comments         bigint default 0,
  shares           bigint,
  duration_sec     integer,
  published_at     timestamptz,
  score            numeric(5,1) default 0,
  score_parts      jsonb default '{}'::jsonb,
  analysis         jsonb,
  analysis_status  text not null default 'none' check (analysis_status in ('none','running','done','failed')),
  analysis_mode    text,
  analysis_error   text,
  analyzed_at      timestamptz,
  source           text default 'search',
  added_by         uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (platform, external_id)
);
create index if not exists videos_platform_idx on public.videos(platform);
create index if not exists videos_score_idx on public.videos(score desc);
create index if not exists videos_views_idx on public.videos(views desc);
create index if not exists videos_category_idx on public.videos(category);

-- ---------- المفضلة (الفيديوهات المختارة لكل طالب) ----------
create table if not exists public.favorites (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  video_id   uuid not null references public.videos(id) on delete cascade,
  note       text,
  created_at timestamptz not null default now(),
  primary key (user_id, video_id)
);

-- ---------- التصنيفات ----------
create table if not exists public.categories (
  id        serial primary key,
  name      text not null unique,
  name_en   text,
  yt_category_id text,
  sort      int default 100
);

-- ---------- الإعدادات ----------
-- is_public = يقرؤها كل المستخدمين المفعّلين. المفاتيح السرية is_public = false
create table if not exists public.settings (
  key        text primary key,
  value      jsonb,
  is_public  boolean not null default false,
  updated_at timestamptz not null default now()
);

-- ---------- ذاكرة البحث (توفّر حصة يوتيوب) ----------
create table if not exists public.searches (
  id         uuid primary key default gen_random_uuid(),
  cache_key  text not null unique,
  platform   text,
  query      text,
  params     jsonb,
  video_ids  uuid[] default '{}',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- الاستهلاك اليومي ----------
create table if not exists public.usage (
  day     date not null default current_date,
  service text not null,
  units   int not null default 0,
  primary key (day, service)
);

create or replace function public.bump_usage(p_service text, p_units int)
returns void language sql security definer set search_path = public as $$
  insert into public.usage(day, service, units) values (current_date, p_service, p_units)
  on conflict (day, service) do update set units = public.usage.units + excluded.units;
$$;

-- ---------- الصلاحيات (RLS) ----------
alter table public.profiles   enable row level security;
alter table public.videos     enable row level security;
alter table public.favorites  enable row level security;
alter table public.categories enable row level security;
alter table public.settings   enable row level security;
alter table public.searches   enable row level security;
alter table public.usage      enable row level security;

drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles for select using (id = auth.uid() or public.is_admin());
drop policy if exists profiles_admin_write on public.profiles;
create policy profiles_admin_write on public.profiles for update using (public.is_admin());
drop policy if exists profiles_admin_delete on public.profiles;
create policy profiles_admin_delete on public.profiles for delete using (public.is_admin());

drop policy if exists videos_read on public.videos;
create policy videos_read on public.videos for select using (public.is_active_user());
drop policy if exists videos_admin_write on public.videos;
create policy videos_admin_write on public.videos for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists fav_own on public.favorites;
create policy fav_own on public.favorites for all
  using (user_id = auth.uid() and public.is_active_user())
  with check (user_id = auth.uid() and public.is_active_user());

drop policy if exists cat_read on public.categories;
create policy cat_read on public.categories for select using (public.is_active_user());
drop policy if exists cat_admin on public.categories;
create policy cat_admin on public.categories for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists settings_read on public.settings;
create policy settings_read on public.settings for select using ((is_public and public.is_active_user()) or public.is_admin());
drop policy if exists settings_admin on public.settings;
create policy settings_admin on public.settings for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists searches_read on public.searches;
create policy searches_read on public.searches for select using (public.is_active_user());
drop policy if exists searches_admin on public.searches;
create policy searches_admin on public.searches for delete using (public.is_admin());

drop policy if exists usage_admin on public.usage;
create policy usage_admin on public.usage for select using (public.is_admin());

-- ---------- بيانات أولية ----------
insert into public.categories (name, name_en, yt_category_id, sort) values
  ('رياضة','sports','17',10),
  ('تعليم','education','27',20),
  ('ألعاب','gaming','20',30),
  ('ترفيه','entertainment','24',40),
  ('كوميديا','comedy','23',50),
  ('عائلي','family','22',60),
  ('فلوق','vlog','22',70),
  ('طبخ','cooking','26',80),
  ('تقنية','tech','28',90),
  ('تحفيز','motivation','22',100),
  ('سفر','travel','19',110),
  ('ديني','islamic','22',120)
on conflict (name) do nothing;

insert into public.settings (key, value, is_public) values
  ('youtube_api_key',      '""'::jsonb, false),
  ('gemini_api_key',       '""'::jsonb, false),
  ('gemini_model',         '"gemini-3.5-flash"'::jsonb, false),
  ('gemini_fallback_model','"gemini-3.5-flash-lite"'::jsonb, false),
  ('youtube_region',       '"SA"'::jsonb, true),
  ('youtube_period_days',  '30'::jsonb, true),
  ('youtube_results',      '25'::jsonb, true),
  ('youtube_duration',     '"medium"'::jsonb, true),
  ('search_cache_hours',   '12'::jsonb, true),
  ('students_can_search',  'true'::jsonb, true),
  ('shorts_max_seconds',   '180'::jsonb, true),
  ('tiktok_server_fetch',  'true'::jsonb, true),
  ('instagram_server_fetch','true'::jsonb, true),
  ('students_can_add',     'true'::jsonb, true),
  ('auto_analyze_on_add',  'true'::jsonb, true),
  ('auto_analyze_on_open', 'true'::jsonb, true),
  ('tier_thresholds',      '{"mega":80,"viral":65,"hot":50,"good":35}'::jsonb, true)
on conflict (key) do nothing;
