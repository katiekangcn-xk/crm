/* 小康CRM团队版服务器 · 账号登录 + 云同步 + 每日自动备份(保留10天) */
'use strict';
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const DB_READY = SUPABASE_URL && SUPABASE_KEY;
const SESSION_DAYS = 30;
const BACKUP_KEEP_DAYS = 10;

/* ---------- 数据库（Supabase REST，fetch 内置） ---------- */
async function db(method, table, { query = '', body = null, prefer = '' } = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${table}${query}`;
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
  };
  if (prefer) headers['Prefer'] = prefer;
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000) });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
  if (!res.ok) {
    const err = new Error(`db_${table}_${method}_failed`);
    err.status = res.status === 401 || res.status === 403 ? 503 : 500;
    err.detail = data && data.message ? String(data.message).slice(0, 120) : '';
    throw err;
  }
  return data;
}

/* ---------- 密码与工具 ---------- */
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(pw, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(pw, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(test, 'hex'));
}
const nowISO = () => new Date().toISOString();
const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let buf = '';
    req.on('data', c => { buf += c; if (buf.length > 30e6) req.destroy(); });
    req.on('end', () => { try { resolve(buf ? JSON.parse(buf) : {}); } catch (e) { resolve(null); } });
    req.on('error', reject);
  });
}
function getCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}


/* ---------- 会话 ---------- */
async function createSession(res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000);
  await db('POST', 'sessions', { body: { token, user_id: userId, expires_at: expires.toISOString() }, prefer: 'return=minimal' });
  res.setHeader('Set-Cookie', `crm_session=${token}; HttpOnly; Path=/; Max-Age=${SESSION_DAYS * 86400}; SameSite=Lax`);
}
async function getUser(req) {
  const token = getCookie(req, 'crm_session');
  if (!token) return null;
  const rows = await db('GET', 'sessions', { query: `?token=eq.${token}&select=user_id,expires_at` });
  if (!rows || !rows.length) return null;
  if (new Date(rows[0].expires_at) < new Date()) {
    db('DELETE', 'sessions', { query: `?token=eq.${token}` }).catch(() => {});
    return null;
  }
  const users = await db('GET', 'users', { query: `?id=eq.${rows[0].user_id}&select=id,email,name,role,verified,created_at` });
  return users && users.length ? users[0] : null;
}
async function requireUser(req, res) {
  const user = await getUser(req);
  if (!user) { json(res, 401, { error: 'not_logged_in' }); return null; }
  return user;
}

/* ---------- 备份：每日一份 + 保留10天 ---------- */
async function ensureDailyBackup(userId, data) {
  try {
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const rows = await db('GET', 'backups', {
      query: `?user_id=eq.${userId}&created_at=gte.${todayStart.toISOString()}&select=id&limit=1`,
    });
    if (!rows || !rows.length) {
      const payload = JSON.stringify(data);
      await db('POST', 'backups', {
        body: { user_id: userId, label: '每日自动备份', data, size: payload.length },
        prefer: 'return=minimal',
      });
    }
    await cleanupOldBackups(userId);
  } catch (e) { /* 备份失败不阻塞主流程 */ }
}
async function cleanupOldBackups(userId) {
  const cutoff = new Date(Date.now() - BACKUP_KEEP_DAYS * 86400000).toISOString();
  const q = userId ? `?user_id=eq.${userId}&created_at=lt.${cutoff}` : `?created_at=lt.${cutoff}`;
  await db('DELETE', 'backups', { query: q });
}

/* ---------- 邮件（管理员配置后启用） ---------- */
async function getSmtp() {
  const rows = await db('GET', 'smtp_config', { query: '?id=eq.1&select=*' });
  const c = rows && rows[0];
  return c && c.host && c.smtp_user && c.smtp_pass ? c : null;
}
async function sendMail(to, subject, text) {
  const c = await getSmtp();
  if (!c) return false;
  const nodemailer = require('nodemailer');
  const tr = nodemailer.createTransport({
    host: c.host, port: c.port || 465, secure: c.secure !== false,
    auth: { user: c.smtp_user, pass: c.smtp_pass },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000, // 快速失败，不长时间挂起
  });
  await tr.sendMail({ from: c.from_addr || c.smtp_user, to, subject, text });
  return true;
}

/* ---------- 静态文件 ---------- */
const PUBLIC = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
function serveStatic(req, res) {
  let p = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) {
      // SPA 回退
      fs.readFile(path.join(PUBLIC, 'index.html'), (e2, idx) => {
        if (e2) { res.writeHead(404); return res.end('Not Found'); }
        res.writeHead(200, { 'Content-Type': MIME['.html'] }); res.end(idx);
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
}

/* ---------- API 路由 ---------- */
async function handleApi(req, res, pathname) {
  if (!DB_READY) return json(res, 503, { error: 'database_not_configured', message: '请在部署平台的环境变量中配置 SUPABASE_URL 和 SUPABASE_SERVICE_KEY' });

  /* 注册 */
  if (pathname === '/api/register' && req.method === 'POST') {
    const b = await parseBody(req);
    if (!b) return json(res, 400, { error: 'bad_request' });
    const email = String(b.email || '').trim().toLowerCase();
    const password = String(b.password || '');
    const name = String(b.name || '').trim().slice(0, 30);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(res, 400, { error: 'email_invalid' });
    if (password.length < 6) return json(res, 400, { error: 'password_too_short', message: '密码至少6位' });
    // 并行查询：是否已注册 + 是否首个用户（省一半串行往返）
    const [exist, all] = await Promise.all([
      db('GET', 'users', { query: `?email=eq.${email}&select=id` }),
      db('GET', 'users', { query: '?select=id&limit=1' }),
    ]);
    if (exist && exist.length) return json(res, 409, { error: 'email_exists', message: '该邮箱已注册' });
    const isFirst = !all || !all.length;
    if (isFirst) {
      // 第一个用户直接成为已激活的管理员
      const rows = await db('POST', 'users', {
        body: { email, name: name || '管理员', password_hash: hashPassword(password), role: 'admin', verified: true },
        prefer: 'return=representation',
      });
      await createSession(res, rows[0].id);
      await db('POST', 'crm_data', { body: { user_id: rows[0].id, data: null }, prefer: 'return=minimal' }).catch(() => {});
      return json(res, 200, { ok: true, user: { email, name: rows[0].name, role: 'admin' }, message: '首个账号已自动成为管理员' });
    }
    const code = String(crypto.randomInt(100000, 999999));
    await db('POST', 'users', {
      body: { email, name, password_hash: hashPassword(password), role: 'member', verified: false, verify_code: code },
      prefer: 'return=minimal',
    });
    let mailed = false, mailErr = '';
    try { mailed = await sendMail(email, '小康CRM 验证码', `您的验证码是：${code}，10分钟内有效。`); }
    catch (e) { mailErr = 'send_failed'; }
    return json(res, 200, { ok: true, need_verify: true, mailed, dev_code: mailed ? undefined : code,
      message: mailed ? '验证码已发送到邮箱' : '邮件服务未配置，请联系管理员（当前直接显示验证码）' });
  }

  /* 验证邮箱 */
  if (pathname === '/api/verify' && req.method === 'POST') {
    const b = await parseBody(req);
    const email = String(b.email || '').trim().toLowerCase();
    const code = String(b.code || '').trim();
    const rows = await db('GET', 'users', { query: `?email=eq.${email}&select=id,verify_code,verified,created_at` });
    if (!rows || !rows.length) return json(res, 404, { error: 'not_found' });
    const u = rows[0];
    if (u.verified) return json(res, 200, { ok: true, message: '已验证，请直接登录' });
    // 验证码10分钟有效
    if (Date.now() - new Date(u.created_at).getTime() > 10 * 60000)
      return json(res, 400, { error: 'code_expired', message: '验证码已过期，请重新注册' });
    if (u.verify_code !== code) return json(res, 400, { error: 'code_wrong', message: '验证码不正确' });
    await db('PATCH', 'users', { query: `?id=eq.${u.id}`, body: { verified: true, verify_code: null }, prefer: 'return=minimal' });
    await createSession(res, u.id);
    await db('POST', 'crm_data', { body: { user_id: u.id, data: null }, prefer: 'return=minimal' }).catch(() => {});
    return json(res, 200, { ok: true });
  }

  /* 登录 */
  if (pathname === '/api/login' && req.method === 'POST') {
    const b = await parseBody(req);
    const email = String(b.email || '').trim().toLowerCase();
    const rows = await db('GET', 'users', { query: `?email=eq.${email}&select=*` });
    if (!rows || !rows.length || !verifyPassword(String(b.password || ''), rows[0].password_hash))
      return json(res, 401, { error: 'login_failed', message: '邮箱或密码错误' });
    const u = rows[0];
    if (!u.verified) {
      const code = String(crypto.randomInt(100000, 999999));
      await db('PATCH', 'users', { query: `?id=eq.${u.id}`, body: { verify_code: code, created_at: nowISO() }, prefer: 'return=minimal' });
      let mailed = false; try { mailed = await sendMail(email, '小康CRM 验证码', `您的验证码是：${code}，10分钟内有效。`); } catch (e) {}
      return json(res, 403, { error: 'need_verify', mailed, dev_code: mailed ? undefined : code, message: mailed ? '验证码已发送' : '请输入验证码' });
    }
    await createSession(res, u.id);
    await ensureDailyBackup(u.id, null); // 触发登录时的备份检查（仅清理）
    return json(res, 200, { ok: true, user: { email: u.email, name: u.name, role: u.role } });
  }

  /* 登出 */
  if (pathname === '/api/logout' && req.method === 'POST') {
    const token = getCookie(req, 'crm_session');
    if (token) await db('DELETE', 'sessions', { query: `?token=eq.${token}` }).catch(() => {});
    res.setHeader('Set-Cookie', 'crm_session=; HttpOnly; Path=/; Max-Age=0');
    return json(res, 200, { ok: true });
  }

  /* 当前用户 */
  if (pathname === '/api/me' && req.method === 'GET') {
    const user = await getUser(req);
    if (!user) return json(res, 200, { user: null });
    return json(res, 200, { user: { email: user.email, name: user.name, role: user.role } });
  }

  /* ===== 以下接口需要登录 ===== */

  /* 读业务数据 */
  if (pathname === '/api/data' && req.method === 'GET') {
    const user = await requireUser(req, res); if (!user) return;
    const rows = await db('GET', 'crm_data', { query: `?user_id=eq.${user.id}&select=data,updated_at` });
    return json(res, 200, { data: rows && rows.length ? rows[0].data : null, updated_at: rows && rows.length ? rows[0].updated_at : null });
  }

  /* 存业务数据（自动触发当日备份） */
  if (pathname === '/api/data' && req.method === 'PUT') {
    const user = await requireUser(req, res); if (!user) return;
    const b = await parseBody(req);
    if (!b || typeof b.data !== 'object') return json(res, 400, { error: 'bad_request' });
    const exist = await db('GET', 'crm_data', { query: `?user_id=eq.${user.id}&select=user_id` });
    if (exist && exist.length)
      await db('PATCH', 'crm_data', { query: `?user_id=eq.${user.id}`, body: { data: b.data, updated_at: nowISO() }, prefer: 'return=minimal' });
    else
      await db('POST', 'crm_data', { body: { user_id: user.id, data: b.data }, prefer: 'return=minimal' });
    await ensureDailyBackup(user.id, b.data);
    return json(res, 200, { ok: true, saved_at: nowISO() });
  }

  /* 备份列表 */
  if (pathname === '/api/backups' && req.method === 'GET') {
    const user = await requireUser(req, res); if (!user) return;
    const rows = await db('GET', 'backups', {
      query: `?user_id=eq.${user.id}&select=id,label,size,created_at&order=created_at.desc&limit=60`,
    });
    return json(res, 200, { backups: rows || [] });
  }

  /* 手动备份 */
  if (pathname === '/api/backups' && req.method === 'POST') {
    const user = await requireUser(req, res); if (!user) return;
    const rows = await db('GET', 'crm_data', { query: `?user_id=eq.${user.id}&select=data` });
    const data = rows && rows.length ? rows[0].data : null;
    if (!data) return json(res, 400, { error: 'no_data', message: '暂无数据可备份' });
    const payload = JSON.stringify(data);
    await db('POST', 'backups', { body: { user_id: user.id, label: '手动备份', data, size: payload.length }, prefer: 'return=minimal' });
    await cleanupOldBackups(user.id);
    return json(res, 200, { ok: true });
  }

  /* 下载备份 */
  if (pathname.startsWith('/api/backups/') && pathname.endsWith('/download') && req.method === 'GET') {
    const user = await requireUser(req, res); if (!user) return;
    const id = pathname.split('/')[3];
    const rows = await db('GET', 'backups', { query: `?id=eq.${id}&user_id=eq.${user.id}&select=data,label,created_at` });
    if (!rows || !rows.length) return json(res, 404, { error: 'not_found' });
    const d = new Date(rows[0].created_at);
    const fname = `CRM备份-${rows[0].label}-${d.toISOString().slice(0, 10)}.json`.replace(/[/ ]/g, '-');
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fname)}`,
    });
    return res.end(JSON.stringify(rows[0].data));
  }

  /* 删除备份 */
  if (pathname.startsWith('/api/backups/') && req.method === 'DELETE') {
    const user = await requireUser(req, res); if (!user) return;
    const id = pathname.split('/')[3];
    await db('DELETE', 'backups', { query: `?id=eq.${id}&user_id=eq.${user.id}` });
    return json(res, 200, { ok: true });
  }

  /* 管理员：用户列表 */
  if (pathname === '/api/admin/users' && req.method === 'GET') {
    const user = await requireUser(req, res); if (!user) return;
    if (user.role !== 'admin') return json(res, 403, { error: 'forbidden' });
    const rows = await db('GET', 'users', { query: '?select=email,name,role,verified,created_at&order=created_at.asc' });
    return json(res, 200, { users: rows || [] });
  }

  /* 管理员：读取/保存 SMTP 配置 */
  if (pathname === '/api/admin/smtp' && req.method === 'GET') {
    const user = await requireUser(req, res); if (!user) return;
    if (user.role !== 'admin') return json(res, 403, { error: 'forbidden' });
    const rows = await db('GET', 'smtp_config', { query: '?id=eq.1&select=*' });
    const c = rows && rows[0] ? rows[0] : {};
    return json(res, 200, { smtp: { host: c.host || '', port: c.port || 465, secure: c.secure !== false, user: c.smtp_user || '', from: c.from_addr || '', configured: !!(c.host && c.smtp_user && c.smtp_pass) } });
  }
  if (pathname === '/api/admin/smtp' && req.method === 'PUT') {
    const user = await requireUser(req, res); if (!user) return;
    if (user.role !== 'admin') return json(res, 403, { error: 'forbidden' });
    const b = await parseBody(req);
    const cur = await db('GET', 'smtp_config', { query: '?id=eq.1&select=*' });
    const old = cur && cur[0] ? cur[0] : {};
    await db('PATCH', 'smtp_config', {
      query: '?id=eq.1',
      body: {
        host: String(b.host || '').trim() || null,
        port: Number(b.port) || 465,
        secure: b.secure !== false,
        smtp_user: String(b.user || '').trim() || null,
        smtp_pass: b.pass ? String(b.pass) : old.smtp_pass || null,
        from_addr: String(b.from || '').trim() || null,
      },
      prefer: 'return=minimal',
    });
    return json(res, 200, { ok: true });
  }
  /* 管理员：测试邮件 */
  if (pathname === '/api/admin/smtp/test' && req.method === 'POST') {
    const user = await requireUser(req, res); if (!user) return;
    if (user.role !== 'admin') return json(res, 403, { error: 'forbidden' });
    try {
      const ok = await sendMail(user.email, '小康CRM 邮件测试', '恭喜，邮件服务配置成功！团队成员注册时将收到验证码邮件。');
      return json(res, ok ? 200 : 400, { ok, message: ok ? '测试邮件已发送，请查收' : '尚未配置完整' });
    } catch (e) {
      return json(res, 400, { ok: false, message: '发送失败，请检查SMTP配置（常见原因：授权码错误、端口不对）' });
    }
  }

  json(res, 404, { error: 'not_found' });
}

/* ---------- 服务器 ---------- */
const server = http.createServer((req, res) => {
  const pathname = req.url.split('?')[0].split('#')[0];
  if (pathname === '/healthz') { res.writeHead(200); return res.end('ok'); }
  if (pathname.startsWith('/api/')) {
    handleApi(req, res, pathname).catch(e => {
      json(res, e.status || 500, { error: 'server_error' });
    });
    return;
  }
  serveStatic(req, res);
});

/* 后台：每6小时清理一次过期备份（>10天） */
setInterval(() => { if (DB_READY) cleanupOldBackups(null).catch(() => {}); }, 6 * 3600 * 1000);

server.listen(PORT, HOST, () => {
  console.log(`CRM team server on http://${HOST}:${PORT} | db=${DB_READY ? 'ready' : 'NOT configured'}`);
});
