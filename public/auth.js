/* 小康CRM团队版 · 登录注册 + 云端同步 */
'use strict';

const Auth = {
  user: null,

  /* ---------- 启动入口：先登录，再初始化 CRM ---------- */
   async boot() {
    this.showLogin();
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const r = await fetch('/api/me', { signal: ctrl.signal });
      clearTimeout(timer);
      if (r.status === 503) { this.dbDown = true; this.showLogin(); return; }
      const j = await r.json();
      this.user = j.user;
      if (this.user) {
        await this.startCRM();
      } else {
        this.showLogin();
      }
    } catch (e) {
    }
  },


  async startCRM() {
    // 登录成功：拉云端数据 → 初始化 DB → 启动主应用
    let cloud = null;
    try { const r = await fetch('/api/data'); const j = await r.json(); cloud = j.data; } catch (e) {}
    if (cloud === null || cloud === undefined) {
      cloud = await this.firstTimeChoice(); // 首次使用：选示例或空白
      await this.pushData(cloud);
    }
    DB.data = cloud;
    DB.cloudReady = true;
    localStorage.setItem(LS_KEY, JSON.stringify(cloud)); // 本地兜底缓存
    document.getElementById('auth-mask').classList.add('hide');
    main();
  },

  async firstTimeChoice() {
    return new Promise(resolve => {
      const seedFetch = fetch('seed.json').then(r => r.json()).catch(() => null);
      openModal('欢迎使用小康CRM', `
        <p style="line-height:1.9">欢迎，<b>${esc(this.user.name || this.user.email)}</b>！<br>
        这是您第一次登录，请选择初始数据：</p>
        <div style="display:flex;gap:.7rem;margin-top:1rem">
          <button class="btn pri" id="init-demo" style="flex:1;padding:.8rem">📋 导入示例数据<br><span style="font-size:.72rem;font-weight:400">130位客户、订单等演示数据</span></button>
          <button class="btn ghost" id="init-empty" style="flex:1;padding:.8rem">🆕 从空白开始<br><span style="font-size:.72rem;font-weight:400">干净的工作空间</span></button>
        </div>`,
        '',
        async () => {
          const done = d => { closeModal(); resolve(d); };
          $('#init-demo').onclick = async () => done(await seedFetch || {});
          $('#init-empty').onclick = () => done({
            '跟进明细': [], '跟进日志': [], '产品信息': [], '订单成交管理': [], '生产计划': [],
            '报价单': [],
            '后台配置': { '客户等级': ['L1+', 'L1', 'L2', 'L3', '无'], '客户分类': ['A类', 'B类', 'C类', 'D类'], '跟进方式': ['阿里', '邮件', 'WhatsApp', '微信'], '跟进阶段': ['初步询盘', '细节沟通', '待报价', '已报价', '设计确认中', '待付样品费', '样品生产中', '样品确认', '待付款', '待生产', '生产中', '待出货', '运输中', '已签收', '客户流失'], '跟进结果': ['未读', '已读不回', '跟进中', '待报价', '待报运费', '流失', '账号失效'], '询盘来源': ['询盘', 'TM', 'RFQ', '客户推荐', '社媒'], '报价阶段': ['待报价', '已报价', '盒型未确定', '尺寸未确定', '数量未确定', '工艺未确定', '材质未确定', '颜色未确定', '超大做不了', '改尺寸', '流失'] },
            stageProgress: { '初步询盘': .07, '细节沟通': .14, '待报价': .21, '已报价': .29, '设计确认中': .36, '待付样品费': .43, '样品生产中': .5, '样品确认': .57, '待付款': .64, '待生产': .71, '生产中': .79, '待出货': .86, '运输中': .93, '已签收': 1, '客户流失': 0 },
          });
        });
    });
  },

  async pushData(data) {
    try {
      await fetch('/api/data', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data }), signal: AbortSignal.timeout(30000) });
    } catch (e) { toast('云端同步失败，已暂存本地', 'err'); }
  },

  /* ---------- 登录界面 ---------- */
  showLogin(mode = 'login') {
    const mask = document.getElementById('auth-mask');
    mask.classList.remove('hide');
    document.getElementById('auth-box').innerHTML = this.loginHTML(mode);
    this.bindLogin(mode);
  },

  loginHTML(mode) {
    const isLogin = mode === 'login';
    const isVerify = mode === 'verify';
    const dbWarn = this.dbDown ? `<div class="dev-code" style="border-color:rgba(179,38,30,.4);color:var(--danger)">⚠ 数据库未连接：请确认已按部署说明配置 Supabase 环境变量</div>` : '';
    return `
      <div class="auth-logo"><div class="brand-mark">康</div></div>
      <h2>小康 CRM</h2>
      <p class="auth-sub">外贸客户管理系统 · 团队版</p>
      ${dbWarn}
      ${isVerify ? `
        <p class="auth-tip">验证码已发送至 <b id="v-email"></b>，请输入邮箱验证码完成注册</p>
        <div class="field"><label>邮箱</label><input id="a-email" type="email" disabled></div>
        <div class="field"><label>验证码</label><input id="a-code" type="text" maxlength="6" placeholder="6位数字" autocomplete="one-time-code"></div>
        <div id="dev-code" class="dev-code"></div>
        <button class="btn pri auth-btn" id="a-submit">验证并登录</button>
      ` : `
        ${isLogin ? '' : `<div class="field"><label>姓名</label><input id="a-name" type="text" placeholder="您的名字" maxlength="30"></div>`}
        <div class="field"><label>邮箱</label><input id="a-email" type="email" placeholder="name@example.com" autocomplete="username"></div>
        <div class="field"><label>密码</label><input id="a-pass" type="password" placeholder="${isLogin ? '登录密码' : '至少6位'}" autocomplete="${isLogin ? 'current-password' : 'new-password'}"></div>
        <button class="btn pri auth-btn" id="a-submit">${isLogin ? '登 录' : '注 册'}</button>
      `}
      <div class="auth-switch">
        ${isLogin
          ? `还没有账号？<a href="javascript:Auth.showLogin('register')">注册新账号</a>`
          : `已有账号？<a href="javascript:Auth.showLogin('login')">返回登录</a>`}
      </div>
      <p class="auth-err" id="a-err"></p>`;
  },

  bindLogin(mode) {
    const submit = () => this.submit(mode);
    document.getElementById('a-submit').onclick = submit;
    document.getElementById('auth-box').onkeydown = e => { if (e.key === 'Enter') submit(); };
    if (mode === 'login') setTimeout(() => document.getElementById('a-email')?.focus(), 50);
  },

  err(msg) { const el = document.getElementById('a-err'); if (el) el.textContent = msg || ''; },

  async submit(mode) {
    this.err('');
    const email = (document.getElementById('a-email')?.value || '').trim().toLowerCase();
    const pass = document.getElementById('a-pass')?.value || '';
    const name = document.getElementById('a-name')?.value || '';
    const code = document.getElementById('a-code')?.value || '';
    const btn = document.getElementById('a-submit');
    btn.disabled = true; btn.textContent = '处理中…（免费服务器冷启动可能需30~60秒）';
    try {
      if (mode === 'login') {
        const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: pass }), signal: AbortSignal.timeout(60000) });
        const j = await r.json();
        if (j.error === 'need_verify') {
          this.pendingEmail = email;
          this.showLogin('verify');
          document.getElementById('a-email').value = email;
          document.getElementById('v-email').textContent = email;
          if (j.dev_code) document.getElementById('dev-code').innerHTML = `当前未配置邮件服务，验证码：<b>${j.dev_code}</b>`;
          return;
        }
        if (!r.ok) return this.err(j.message || '邮箱或密码错误');
        this.user = j.user;
        await this.startCRM();
      } else if (mode === 'register') {
        if (!email || !pass) return this.err('请填写邮箱和密码');
        const r = await fetch('/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: pass, name }), signal: AbortSignal.timeout(60000) });
        const j = await r.json();
        if (!r.ok) return this.err(j.message || '注册失败');
        if (j.user) { // 首个用户直接是管理员
          this.user = j.user;
          toast('注册成功，您是首个用户（管理员）');
          await this.startCRM();
          return;
        }
        this.pendingEmail = email;
        this.showLogin('verify');
        document.getElementById('a-email').value = email;
        document.getElementById('v-email').textContent = email;
        if (j.dev_code) document.getElementById('dev-code').innerHTML = `当前未配置邮件服务，验证码：<b>${j.dev_code}</b><br><span style="font-size:.68rem">（管理员在「系统设置」配置邮箱后即走邮件发送）</span>`;
      } else if (mode === 'verify') {
        if (!code) return this.err('请输入验证码');
        const r = await fetch('/api/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: this.pendingEmail || email, code }), signal: AbortSignal.timeout(60000) });
        const j = await r.json();
        if (!r.ok) return this.err(j.message || '验证失败');
        toast('验证成功');
        const me = await (await fetch('/api/me')).json();
        this.user = me.user;
        await this.startCRM();
      }
    } catch (e) {
      this.err('网络错误，请重试');
    } finally {
      const b = document.getElementById('a-submit');
      if (b) { b.disabled = false; b.textContent = mode === 'login' ? '登 录' : mode === 'register' ? '注 册' : '验证并登录'; }
    }
  },

  async logout() {
    await fetch('/api/logout', { method: 'POST' }).catch(() => {});
    location.reload();
  },
};

/* ---------- 备份管理弹窗 ---------- */
Auth.backupsModal = async function () {
  openModal('我的备份', '<div class="empty" style="padding:1.5rem">加载中…</div>',
    `<button class="btn pri" id="bk-now">📷 立即备份</button><button class="btn ghost" onclick="closeModal()">关闭</button>`,
    () => { $('#bk-now').onclick = () => Auth.backupNow(); Auth.loadBackups(); });
};
Auth.loadBackups = async function () {
  try {
    const r = await fetch('/api/backups');
    const j = await r.json();
    const list = j.backups || [];
    $('#modal-body').innerHTML = `
      <p class="muted" style="font-size:.78rem;margin-bottom:.6rem">每天首次登录/保存时自动备份一份，保留最近 10 天，超期自动删除。</p>
      ${list.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>时间</th><th>类型</th><th>大小</th><th>操作</th></tr></thead>
      <tbody>${list.map(b => `<tr>
        <td class="num">${String(b.created_at).replace('T', ' ').slice(0, 16)}</td>
        <td><span class="tag ${b.label === '每日自动备份' ? 'plain' : 'st-ok'}">${esc(b.label)}</span></td>
        <td class="num">${b.size ? Math.round(b.size / 1024) + ' KB' : '—'}</td>
        <td><div class="row-acts" style="opacity:1">
          <a class="btn ghost sm" href="/api/backups/${b.id}/download" download>下载</a>
          <button class="btn danger sm" onclick="Auth.delBackup('${b.id}')">删</button></div></td></tr>`).join('')}
      </tbody></table></div>` : '<div class="empty" style="padding:1.5rem">还没有备份，点「立即备份」创建一份</div>'}`;
  } catch (e) { $('#modal-body').innerHTML = '<div class="empty">加载失败，请重试</div>'; }
};
Auth.backupNow = async function () {
  const r = await fetch('/api/backups', { method: 'POST' });
  const j = await r.json();
  toast(r.ok ? '已创建手动备份' : (j.message || '备份失败'), r.ok ? 'ok' : 'err');
  if (r.ok) Auth.loadBackups();
};
Auth.delBackup = async function (id) {
  await fetch('/api/backups/' + id, { method: 'DELETE' });
  toast('已删除'); Auth.loadBackups();
};

/* ---------- 管理员设置 ---------- */
Auth.adminModal = async function () {
  openModal('系统设置（管理员）', '<div class="empty" style="padding:1.5rem">加载中…</div>', '',
    () => Auth.loadAdmin());
};
Auth.loadAdmin = async function () {
  const [ur, sr] = await Promise.all([fetch('/api/admin/users'), fetch('/api/admin/smtp')]);
  const uj = await ur.json(), sj = await sr.json();
  if (ur.status === 403) { $('#modal-body').innerHTML = '<div class="empty">仅管理员可访问</div>'; return; }
  const users = uj.users || [], smtp = sj.smtp || {};
  $('#modal-body').innerHTML = `
    <h3 class="qh">👥 团队成员（${users.length}）</h3>
    <div class="tbl-wrap" style="margin-bottom:1rem"><table class="tbl">
      <thead><tr><th>姓名</th><th>邮箱</th><th>角色</th><th>状态</th><th>注册时间</th></tr></thead>
      <tbody>${users.map(u => `<tr><td><b>${esc(u.name || '—')}</b></td><td class="num" style="font-size:.78rem">${esc(u.email)}</td>
      <td><span class="tag ${u.role === 'admin' ? 'grade-A' : 'plain'}">${u.role === 'admin' ? '管理员' : '成员'}</span></td>
      <td><span class="tag ${u.verified ? 'st-ok' : 'st-wait'}">${u.verified ? '已验证' : '待验证'}</span></td>
      <td class="num muted">${String(u.created_at).slice(0, 10)}</td></tr>`).join('')}
      </tbody></table></div>
    <h3 class="qh">📮 邮件服务（注册验证码发送）${smtp.configured ? '<span class="tag st-ok">已配置</span>' : '<span class="tag st-wait">未配置 · 验证码直接显示在注册页</span>'}</h3>
    <div class="form-grid">
      <div class="field"><label>SMTP 服务器</label><input id="sm-host" value="${esc(smtp.host || '')}" placeholder="如 smtp.qq.com"></div>
      <div class="field"><label>端口</label><input id="sm-port" type="number" value="${smtp.port || 465}"></div>
      <div class="field"><label>发件邮箱账号</label><input id="sm-user" value="${esc(smtp.user || '')}" placeholder="如 12345@qq.com"></div>
      <div class="field"><label>授权码（不是登录密码）</label><input id="sm-pass" type="password" placeholder="${smtp.configured ? '已保存，留空则不修改' : 'QQ邮箱：设置→账户→开启SMTP获取'}"></div>
      <div class="field"><label>发件人显示</label><input id="sm-from" value="${esc(smtp.from || '')}" placeholder="如 小康CRM <12345@qq.com>"></div>
      <div class="field"><label>加密方式</label><select id="sm-secure"><option value="1" ${smtp.secure !== false ? 'selected' : ''}>SSL (465)</option><option value="0" ${smtp.secure === false ? 'selected' : ''}>STARTTLS (587)</option></select></div>
    </div>
    <p class="muted" style="font-size:.74rem;margin-top:.5rem">推荐用 QQ 邮箱：网页版设置 → 账户 → 开启 SMTP 服务 → 获取授权码。配置后团队成员注册时会收到验证码邮件。</p>`;
  $('#modal-foot').innerHTML = `
    <button class="btn ghost" id="sm-test">发送测试邮件</button>
    <button class="btn pri" id="sm-save">保存设置</button>
    <button class="btn ghost" onclick="closeModal()">关闭</button>`;
  $('#sm-save').onclick = async () => {
    const r = await fetch('/api/admin/smtp', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host: $('#sm-host').value, port: +$('#sm-port').value, user: $('#sm-user').value, pass: $('#sm-pass').value, from: $('#sm-from').value, secure: $('#sm-secure').value === '1' }) });
    toast(r.ok ? '设置已保存' : '保存失败', r.ok ? 'ok' : 'err');
    if (r.ok) Auth.loadAdmin();
  };
  $('#sm-test').onclick = async () => {
    toast('正在发送…');
    const r = await fetch('/api/admin/smtp/test', { method: 'POST' });
    const j = await r.json();
    toast(j.message || (r.ok ? '已发送' : '失败'), r.ok ? 'ok' : 'err');
  };
};
