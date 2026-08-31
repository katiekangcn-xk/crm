-- 小康CRM团队版 · 数据库初始化脚本
-- 用法：注册 Supabase 后，在 SQL Editor 中运行本文件全部内容

-- 用户表
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  name text,
  password_hash text not null,
  role text not null default 'member',      -- admin / member
  verified boolean not null default false,
  verify_code text,
  created_at timestamptz default now()
);

-- 登录会话表
create table if not exists sessions (
  token text primary key,
  user_id uuid references users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz default now()
);

-- 每人一份的CRM业务数据（JSON）
create table if not exists crm_data (
  user_id uuid primary key references users(id) on delete cascade,
  data jsonb,
  updated_at timestamptz default now()
);

-- 自动/手动备份（保留10天）
create table if not exists backups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  label text,
  data jsonb,
  size int default 0,
  created_at timestamptz default now()
);

-- 邮件发送配置（管理员在网页里填写）
create table if not exists smtp_config (
  id int primary key default 1,
  host text,
  port int default 465,
  secure boolean default true,
  smtp_user text,
  smtp_pass text,
  from_addr text
);
insert into smtp_config (id) values (1) on conflict (id) do nothing;

create index if not exists idx_sessions_user on sessions(user_id);
create index if not exists idx_backups_user_time on backups(user_id, created_at desc);

-- 安全加固：关闭匿名访问，只有服务器（service_role 密钥）能读写
revoke all on users, sessions, crm_data, backups, smtp_config from anon, authenticated;
