/* 小康CRM · 单页应用 */
'use strict';

/* ================= Store ================= */
const LS_KEY = 'crm-db-v1';
const DB = {
  data: null,
  cloudReady: false,   // 团队版：由 Auth 登录后置真
  _t: null,
  _lastPush: 0,
  save() {
    if (!this.cloudReady) { localStorage.setItem(LS_KEY, JSON.stringify(this.data)); return; }
    localStorage.setItem(LS_KEY, JSON.stringify(this.data)); // 本地兜底缓存
    clearTimeout(this._t);
    this._t = setTimeout(() => this.push(), 900); // 防抖上传云端
  },
  async push() {
    try {
      const r = await fetch('/api/data', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: this.data }), signal: AbortSignal.timeout(30000) });
      if (r.ok) this._lastPush = Date.now();
    } catch (e) { /* 离线时本地缓存仍在 */ }
  },
  async reset() { location.reload(); }
};

/* ================= Utils ================= */
const $ = (s, p = document) => p.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
const fmt = n => num(n).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
const todayStr = () => new Date().toISOString().slice(0, 10);
const monthStr = () => todayStr().slice(0, 7);
const daysAgo = d => { if (!d) return Infinity; return Math.floor((Date.now() - new Date(d + 'T00:00:00')) / 86400000); };
const daysUntil = d => { if (!d) return Infinity; return Math.ceil((new Date(d + 'T00:00:00') - Date.now()) / 86400000); };

function toast(msg, type = 'ok') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  $('#toast-wrap').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = '.3s'; setTimeout(() => el.remove(), 320); }, 2600);
}

function openModal(title, bodyHTML, footHTML, onOpen) {
  $('#modal-title').textContent = title;
  $('#modal-body').innerHTML = bodyHTML;
  $('#modal-foot').innerHTML = footHTML;
  $('#modal-mask').classList.add('show');
  onOpen && onOpen();
}
function closeModal() { $('#modal-mask').classList.remove('show'); }
$('#modal-close').onclick = closeModal;
$('#modal-mask').addEventListener('click', e => { if (e.target === $('#modal-mask')) closeModal(); });

/* 常量选项（默认值，实际从 config 读取） */
const CFG_KEYS = ['客户等级', '客户分类', '跟进方式', '跟进阶段', '跟进结果', '询盘来源', '报价阶段'];
const opt = (k, allLabel) => {
  const list = DB.data['后台配置'][k] || [];
  return `<option value="">${allLabel ?? '全部'}</option>` + list.map(v => `<option>${esc(v)}</option>`).join('');
};
const gradeClass = c => 'grade-' + String(c || '').trim().charAt(0).toUpperCase();
const stageProgress = st => DB.data.stageProgress?.[st] ?? 0;

/* 状态标签着色 */
function statusTag(s) {
  const v = String(s || '');
  if (v.includes('流失') || v.includes('失效') || v.includes('未读') || v.includes('不回')) return 'st-lost';
  if (v.includes('已签收') || v.includes('已付款') || v.includes('已发货') || v.includes('跟进中')) return 'st-ok';
  if (v.includes('待') || v.includes('部分')) return 'st-wait';
  return 'plain';
}

/* ================= 路由 ================= */
const VIEWS = {};
const NAV = [
  { grp: '总览' },
  { id: 'dash', ico: '◧', name: '仪表盘' },
  { grp: '客户管理' },
  { id: 'customers', ico: '⚇', name: '客户档案' },
  { id: 'logs', ico: '✎', name: '跟进日志' },
  { grp: '交易管理' },
  { id: 'qfiles', ico: '🗂', name: '报价文件库' },
  { id: 'orders', ico: '¥', name: '订单成交' },
  { grp: '工具' },
  { id: 'search', ico: '🔍', name: '智能搜索' },
  { id: 'timezone', ico: '🕐', name: '时差查询' },
  { grp: '系统' },
  { id: 'config', ico: '⚒', name: '后台配置' },
];

function buildNav() {
  $('#nav').innerHTML = NAV.map(n => n.grp
    ? `<div class="grp">${n.grp}</div>`
    : `<a href="#/${n.id}" data-id="${n.id}"><span class="ico">${n.ico}</span>${n.name}${n.id === 'customers' ? `<span class="cnt">${DB.data['跟进明细'].length}</span>` : ''}</a>`
  ).join('');
}

function route() {
  const id = (location.hash.replace('#/', '') || 'dash').split('?')[0];
  const view = VIEWS[id] || VIEWS.dash;
  document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('on', a.dataset.id === id));
  const nav = NAV.find(n => n.id === id);
  $('#crumb').textContent = nav ? nav.name : '仪表盘';
  const out = view.render();
  const done = html => { $('#view').innerHTML = html; view.mount && view.mount(); };
  if (out instanceof Promise) out.then(done);
  else done(out);
  $('#sidebar').classList.remove('open');
  window.scrollTo(0, 0);
}

/* ================= 顶栏时钟 ================= */
function tick() {
  const d = new Date();
  $('#clock').textContent = d.toTimeString().slice(0, 8);
  const wd = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
  $('#today').textContent = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 星期${wd}`;
}
setInterval(tick, 1000);

VIEWS.orders = {
  f: { q: '', pay: '', ship: '' },
  render() {
    return `
    <div class="page-head"><h2>订单成交管理</h2><span class="sub">自动计算提成 · ${DB.data['订单成交管理'].length} 笔订单</span>
      <span class="spacer"></span><button class="btn pri" id="btn-add-o">＋ 新增订单</button></div>
    <div class="stat-grid" style="grid-template-columns:repeat(4,1fr)" id="o-stats"></div>
    <div class="card card-pad" style="margin:.9rem 0"><div class="toolbar" style="margin:0">
      <input type="search" id="oq" placeholder="搜索订单号 / 客户 / 产品…" value="${esc(this.f.q)}">
      <select id="opay"><option value="">付款状态</option>${[...new Set(DB.data['订单成交管理'].map(o => o['付款状态']).filter(Boolean))].map(v => `<option ${this.f.pay === v ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>
      <select id="oship"><option value="">发货状态</option>${[...new Set(DB.data['订单成交管理'].map(o => o['发货状态']).filter(Boolean))].map(v => `<option ${this.f.ship === v ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>
      <span class="spacer"></span><span class="muted" id="o-count" style="font-size:.78rem"></span>
    </div></div>
    <div class="card tbl-wrap" id="o-table"></div>`;
  },
  mount() {
    $('#oq').oninput = e => { this.f.q = e.target.value.trim(); this.table(); };
    $('#opay').onchange = e => { this.f.pay = e.target.value; this.table(); };
    $('#oship').onchange = e => { this.f.ship = e.target.value; this.table(); };
    $('#btn-add-o').onclick = () => this.edit(null);
    this.stats(); this.table();
  },
  filtered() {
    const f = this.f;
    return DB.data['订单成交管理'].filter(o => {
      if (f.q && !(o['订单号'] + o['客户名称'] + o['产品名称']).toLowerCase().includes(f.q.toLowerCase())) return false;
      if (f.pay && o['付款状态'] !== f.pay) return false;
      if (f.ship && o['发货状态'] !== f.ship) return false;
      return true;
    }).sort((a, b) => String(b['成交日期']).localeCompare(String(a['成交日期'])));
  },
  stats() {
    const os = this.filtered();
    const sum = k => os.reduce((a, o) => a + num(o[k]), 0);
    const cards = [
      ['c-vermilion', '成交总额', '$' + fmt(sum('总金额USD')), '约 ¥' + fmt(sum('总金额RMB'))],
      ['c-amber', '提成合计', '¥' + fmt(sum('提成')), '按明细行汇总'],
      ['c-pine', '待生产', os.filter(o => o['发货状态'] === '待生产').length + ' 单', '需安排生产计划'],
      ['c-indigo', '已签收', os.filter(o => o['发货状态'] === '已签收').length + ' 单', '交易完成'],
    ];
    $('#o-stats').innerHTML = cards.map(c => `<div class="stat ${c[0]}"><div class="k">${c[1]}</div><div class="v" style="font-size:1.45rem">${c[2]}</div><div class="hint">${c[3]}</div></div>`).join('');
  },
  table() {
    this.stats();
    const list = this.filtered();
    $('#o-count').textContent = `共 ${list.length} 笔`;
    if (!list.length) { $('#o-table').innerHTML = '<div class="empty"><div class="big">¥</div>暂无订单</div>'; return; }
    $('#o-table').innerHTML = `<table class="tbl"><thead><tr>
      <th>订单号</th><th>成交日期</th><th>客户</th><th>国家</th><th>产品</th><th>数量</th><th>单价</th><th>汇率</th>
      <th>总额$</th><th>总额¥</th><th>提成%</th><th>提成¥</th><th>付款</th><th>发货</th><th>备注</th><th>操作</th>
    </tr></thead><tbody>${list.map(o => {
      const idx = DB.data['订单成交管理'].indexOf(o);
      return `<tr>
      <td class="num" style="font-size:.74rem">${esc(o['订单号'])}</td>
      <td class="num">${esc(o['成交日期'])}</td>
      <td><b>${esc(o['客户名称'])}</b></td>
      <td>${esc(o['国家'])}</td>
      <td>${esc(o['产品名称'])}</td>
      <td class="num">${fmt(o['数量'])}</td>
      <td class="num">$${fmt(o['单价'])}</td>
      <td class="num muted">${fmt(o['汇率'])}</td>
      <td class="num"><b>$${fmt(o['总金额USD'])}</b></td>
      <td class="num">¥${fmt(o['总金额RMB'])}</td>
      <td class="num muted">${num(o['提成百分比']) * 100}%</td>
      <td class="num" style="color:var(--vermilion)"><b>¥${fmt(o['提成'])}</b></td>
      <td><span class="tag ${statusTag(o['付款状态'])}">${esc(o['付款状态'])}</span></td>
      <td><span class="tag ${statusTag(o['发货状态'])}">${esc(o['发货状态'])}</span></td>
      <td class="muted" style="max-width:150px;overflow:hidden;text-overflow:ellipsis" title="${esc(o['备注'])}">${esc(o['备注'])}</td>
      <td><div class="row-acts">
        <button class="btn ghost sm" onclick="VIEWS.orders.edit(${idx})">编辑</button>
        <button class="btn danger sm" onclick="VIEWS.orders.del(${idx})">删</button>
      </div></td></tr>`;
    }).join('')}</tbody></table>`;
  },
  edit(i) {
    const o = i == null ? { '汇率': 6.8, '提成百分比': 0.03 } : DB.data['订单成交管理'][i];
    const F = (k, label, type = 'text') => `<div class="field"><label>${label}</label><input name="${k}" type="${type}" value="${esc(o[k] ?? '')}"></div>`;
    openModal(i == null ? '新增订单' : '编辑订单', `
      <div class="form-grid three">
        ${F('订单号', '订单号')}${F('成交日期', '成交日期', 'date')}${F('客户名称', '客户名称 *')}
        ${F('国家', '国家')}${F('产品名称', '产品名称')}${F('数量', '数量', 'number')}
        ${F('单价', '单价 (USD)', 'number')}${F('汇率', '汇率', 'number')}${F('提成百分比', '提成百分比 (0.03=3%)', 'number')}
        ${F('成本RMB', '成本 (RMB)', 'number')}${F('运费USD', '运费 (USD)', 'number')}${F('运费RMB', '运费 (RMB)', 'number')}
        <div class="field"><label>付款状态</label><select name="付款状态"><option value=""></option>
          ${['已付款', '部分付款', '待付款'].map(v => `<option ${o['付款状态'] === v ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        <div class="field"><label>发货状态</label><select name="发货状态"><option value=""></option>
          ${['待生产', '生产中', '待出货', '运输中', '已发货', '已签收'].map(v => `<option ${o['发货状态'] === v ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        ${F('备注', '备注')}
        ${`<div class="field full muted" style="font-size:.76rem">保存时自动计算：总额$ = 数量×单价；总额¥ = 总额$×汇率；提成 = 总额¥×提成百分比</div>`}
      </div>`,
      `<button class="btn ghost" onclick="closeModal()">取消</button><button class="btn pri" id="save-o">保存</button>`,
      () => {
        $('#save-o').onclick = () => {
          const data = {};
          document.querySelectorAll('#modal-body [name]').forEach(el => data[el.name] = el.value.trim());
          if (!data['客户名称']) return toast('请填写客户名称', 'err');
          if (data['成交日期']) data['成交日期'] = data['成交日期'];
          data['总金额USD'] = num(data['数量']) * num(data['单价']);
          data['总金额RMB'] = num(data['总金额USD']) * num(data['汇率']);
          data['提成'] = num(data['总金额RMB']) * num(data['提成百分比']);
          if (i == null) DB.data['订单成交管理'].push(data);
          else DB.data['订单成交管理'][i] = { ...DB.data['订单成交管理'][i], ...data };
          DB.save(); closeModal(); toast('订单已保存，金额已自动计算'); this.table();
        };
      });
  },
  del(i) {
    openModal('删除订单', `<p>确定删除该笔订单吗？</p>`,
      `<button class="btn ghost" onclick="closeModal()">取消</button><button class="btn danger" id="del-o">删除</button>`,
      () => { $('#del-o').onclick = () => { DB.data['订单成交管理'].splice(i, 1); DB.save(); closeModal(); toast('已删除'); this.table(); }; });
  }
};

VIEWS.search = {
  q: '',
  render() {
    return `
    <div class="page-head"><h2>智能搜索中心</h2><span class="sub">输入客户名，一键查看全维度档案</span></div>
    <div class="search-hero">
      <input type="text" id="sq" list="customer-names" placeholder="🔍 输入客户名称…" value="${esc(this.q)}" autofocus>
      <datalist id="customer-names">${DB.data['跟进明细'].map(c => `<option value="${esc(c['客户名称'])}">`).join('')}</datalist>
      <button class="btn pri" id="btn-search">查询</button>
    </div>
    <div id="s-result"></div>`;
  },
  mount() {
    const go = () => { this.q = $('#sq').value.trim(); this.result(); };
    $('#btn-search').onclick = go;
    $('#sq').onkeydown = e => { if (e.key === 'Enter') go(); };
    if (this.q) this.result();
  },
  result() {
    const q = this.q.toLowerCase();
    if (!q) { $('#s-result').innerHTML = ''; return; }
    const cs = DB.data['跟进明细'].filter(c => c['客户名称'].toLowerCase().includes(q));
    if (!cs.length) { $('#s-result').innerHTML = '<div class="card"><div class="empty"><div class="big">🔍</div>未找到该客户，试试其他关键词</div></div>'; return; }
    $('#s-result').innerHTML = cs.map(c => this.card(c)).join('');
  },
  card(c) {
    const name = c['客户名称'];
    const prods = DB.data['产品信息'].filter(p => p['客户名称'] === name);
    const logs = DB.data['跟进日志'].filter(l => l['客户名称'] === name)
      .sort((a, b) => String(b['跟进日期']).localeCompare(String(a['跟进日期'])));
    const orders = DB.data['订单成交管理'].filter(o => o['客户名称'] === name);
    const usd = orders.reduce((a, o) => a + num(o['总金额USD']), 0);
    const kv = (k, v) => `<div class="kv"><span class="k">${k}</span><span class="v">${v || '<span class="muted">—</span>'}</span></div>`;
    return `<div class="card card-pad" style="margin-bottom:1rem">
      <div class="page-head" style="margin-bottom:.5rem">
        <h2 style="font-size:1.2rem">🙎 ${esc(name)}</h2>
        <span class="tag lv">${esc(c['等级'])}</span>
        <span class="tag ${gradeClass(c['分类'])}">${esc(c['分类'])}</span>
        <span class="tag ${statusTag(c['跟进结果'])}">${esc(c['跟进结果'])}</span>
        <span class="sub">累计成交 <b style="color:var(--vermilion)">$${fmt(usd)}</b></span>
      </div>
      <div class="profile">
        <div>
          <div class="card" style="box-shadow:none;background:var(--paper-2)">
            ${kv('国家', esc(c['国家']))}
            ${kv('询盘来源', `<span class="tag src">${esc(c['来源'])}</span>`)}
            ${kv('跟进阶段', `${esc(c['跟进阶段'])}`)}
            ${kv('跟进次数', `<b>${c['总跟进次数']}</b> 次`)}
            ${kv('最新跟进', esc(c['最新跟进日']))}
            ${kv('下次提醒', esc(c['下次提醒']) || '—')}
            ${kv('标签', esc(c['客户标签']) || '')}
            ${kv('联系方式', esc(c['联系方式']) || '')}
            ${kv('邮箱', esc(c['邮箱']) || '')}
            ${kv('公司', esc(c['公司名称']) || '')}
            ${kv('地址', esc(c['地址']) || '')}
          </div>
          <div style="padding:.7rem .2rem">
            <div style="font-size:.72rem;color:var(--ink-3);margin-bottom:.3rem">跟进进度 · ${(stageProgress(c['跟进阶段']) * 100).toFixed(0)}%</div>
            <span class="prog" style="width:100%;height:8px"><i style="width:${stageProgress(c['跟进阶段']) * 100}%"></i></span>
          </div>
        </div>
        <div>
          <h3 style="font-family:var(--serif);font-size:.9rem;margin:.2rem 0 .4rem">📋 产品报价（${prods.length}）</h3>
          ${prods.length ? `<div class="tbl-wrap" style="border:1px solid var(--line);border-radius:8px;margin-bottom:1rem"><table class="tbl">
            <thead><tr><th>产品</th><th>规格</th><th>数量</th><th>报价$</th><th>阶段</th></tr></thead>
            <tbody>${prods.map(p => `<tr><td>${esc(p['产品名称'])}</td><td class="num" style="font-size:.74rem">${esc(p['规格尺寸'])}</td><td class="num">${esc(p['数量'])}</td><td class="num">${p['报价'] ? fmt(p['报价']) : '—'}</td><td><span class="tag ${statusTag(p['报价阶段'])}" style="font-size:.66rem">${esc(p['报价阶段'])}</span></td></tr>`).join('')}
            </tbody></table></div>` : '<div class="muted" style="font-size:.8rem;margin-bottom:1rem">暂无产品报价</div>'}
          <h3 style="font-family:var(--serif);font-size:.9rem;margin:.2rem 0 .4rem">🕓 跟进历史（${logs.length}）</h3>
          <div class="timeline">${logs.map(l => `<div class="tl-item">
            <div class="d">${esc(l['跟进日期'])} · ${esc(l['跟进方式']) || '—'} · ${esc(l['跟进阶段']) || ''}</div>
            <div class="rec">${esc(l['跟进记录'])}</div></div>`).join('') || '<div class="muted" style="font-size:.8rem">暂无跟进记录</div>'}</div>
        </div>
      </div>
    </div>`;
  }
};

/* ================= 时差查询 ================= */
VIEWS.timezone = {
  local: '10:00',
  render() {
    return `
    <div class="page-head"><h2>客户时间查询</h2><span class="sub">输入客户当地时间，查询对应的北京上下班时间</span></div>
    <div class="tz-grid">
      <div class="card card-pad">
        <div class="field"><label>客户当地时间</label>
          <input type="time" id="tz-in" value="${this.local}" style="font-size:1.2rem;font-family:var(--mono)"></div>
        <div style="margin-top:.9rem" class="muted" style="font-size:.78rem">
          <div style="font-size:.78rem;color:var(--ink-3);line-height:1.8">
            客户上班 09:00 / 下班 17:00（按外贸常规）<br>
            时差 = 客户时间 − 北京时间（负数表示客户比北京早）
          </div>
        </div>
      </div>
      <div class="card card-pad tz-out" id="tz-out"></div>
    </div>`;
  },
  mount() {
    $('#tz-in').oninput = e => { this.local = e.target.value || '00:00'; this.calc(); };
    this.calc();
  },
  calc() {
    const [h, m] = this.local.split(':').map(Number);
    const now = new Date();
    const bjMin = now.getHours() * 60 + now.getMinutes();
    const clMin = (h * 60 + m + 1440) % 1440;
    let diff = clMin - bjMin;
    // 找最近的一天使客户时间最接近当前（假设查询的是"现在客户显示的时间"）
    const fmtT = mins => `${String(Math.floor(((mins % 1440) + 1440) % 1440 / 60)).padStart(2, '0')}:${String(((mins % 1440) + 1440) % 1440 % 60).padStart(2, '0')}`;
    const rows = [
      ['北京时间（当前）', fmtT(bjMin), true],
      ['客户当地时间', fmtT(clMin), true],
      ['时差', (diff >= 0 ? '−' : '+') + fmtT(Math.abs(diff)) + (diff >= 0 ? '（客户比北京晚）' : '（客户比北京早）'), false],
      ['客户上班 09:00 → 北京时间', fmtT(540 - diff), false],
      ['客户下班 17:00 → 北京时间', fmtT(1020 - diff), false],
    ];
    $('#tz-out').innerHTML = rows.map(r => `
      <div class="tz-row"><span class="lbl">${r[0]}</span><span class="tm ${r[2] ? 'hl' : ''}">${r[1]}</span>
      ${r[0].includes('上班') ? '<span class="badge">最佳跟进时段</span>' : ''}</div>`).join('');
  }
};

/* ================= 后台配置 ================= */
VIEWS.config = {
  render() {
    const cfg = DB.data['后台配置'];
    const hints = { '客户等级': 'L1+ 最优', '客户分类': 'A~D 类', '跟进方式': '沟通渠道', '跟进阶段': '决定进度条', '跟进结果': '当前状态', '询盘来源': '获客渠道', '报价阶段': '报价进度' };
    return `
    <div class="page-head"><h2>后台配置</h2><span class="sub">各下拉选项的字典维护 · 跟进阶段与进度条自动关联</span></div>
    <div class="cfg-grid">
      ${CFG_KEYS.map(k => `
        <div class="card cfg-card">
          <h3 class="h">${k}<span class="muted" style="font-family:var(--sans);font-weight:400;font-size:.7rem;margin-left:.4rem">${hints[k] || ''}</span></h3>
          <div class="cfg-list" id="cfg-${k}">
            ${(cfg[k] || []).map((v, i) => `<span class="cfg-item">${esc(v)}
              <button onclick="VIEWS.config.del('${k}',${i})" title="删除">×</button></span>`).join('') || '<span class="muted" style="font-size:.76rem">暂无选项</span>'}
          </div>
          <div class="cfg-add">
            <input id="add-${k}" placeholder="新增选项…" onkeydown="if(event.key==='Enter')VIEWS.config.add('${k}')">
            <button class="btn pri sm" onclick="VIEWS.config.add('${k}')">添加</button>
          </div>
        </div>`).join('')}
      <div class="card card-pad" style="grid-column:1/-1">
        <h3 class="h" style="padding-left:0">阶段进度条映射</h3>
        <div style="display:flex;flex-wrap:wrap;gap:.5rem">
        ${Object.entries(DB.data.stageProgress || {}).map(([s, p]) => `
          <span class="cfg-item" style="min-width:120px">${esc(s)}
            <span class="prog" style="width:44px;margin:0 .3rem"><i style="width:${p * 100}%"></i></span>
            <span class="num" style="font-size:.7rem">${(p * 100).toFixed(0)}%</span></span>`).join('')}
        </div>
        <div class="muted" style="font-size:.76rem;margin-top:.7rem">跟进阶段按顺序均分进度（客户流失为0、已签收为100%），删除/新增阶段后可在下方重新生成。</div>
        <button class="btn ghost sm" style="margin-top:.5rem" onclick="VIEWS.config.regen()">按当前阶段顺序重新生成进度</button>
      </div>
    </div>`;
  },
  mount() {},
  add(k) {
    const el = $('#add-' + k);
    const v = el.value.trim();
    if (!v) return;
    if ((DB.data['后台配置'][k] || []).includes(v)) return toast('该选项已存在', 'err');
    DB.data['后台配置'][k].push(v);
    if (k === '跟进阶段') this.regen(false);
    DB.save(); toast('已添加 ' + v); route();
  },
  del(k, i) {
    DB.data['后台配置'][k].splice(i, 1);
    DB.save(); toast('已删除'); route();
  },
  regen(re = true) {
    const stages = DB.data['后台配置']['跟进阶段'] || [];
    const sp = {};
    stages.forEach(s => {
      if (s === '客户流失') sp[s] = 0;
      else if (s === '账号失效') sp[s] = 0;
      else if (s === '已签收') sp[s] = 1;
      else sp[s] = Math.round((stages.indexOf(s) + 1) / (stages.length + 1) * 100) / 100;
    });
    DB.data.stageProgress = sp;
    DB.save();
    if (re) { toast('进度映射已重新生成'); route(); }
  }
};

/* ================= 数据操作 ================= */
function addLog(row) {
  DB.data['跟进日志'].push(row);
  const c = DB.data['跟进明细'].find(r => r['客户名称'] === row['客户名称']);
  if (c) {
    c['总跟进次数'] = num(c['总跟进次数']) + 1;
    c['最新跟进日'] = row['跟进日期'];
    c['最后跟进内容'] = row['跟进记录'];
    if (row['跟进阶段']) c['跟进阶段'] = row['跟进阶段'];
    if (row['跟进结果']) c['跟进结果'] = row['跟进结果'];
    if (row['下次提醒日期']) c['下次提醒'] = row['下次提醒日期'];
    c['进度'] = stageProgress(c['跟进阶段']);
  }
  DB.save();
}

/* 头像：名字首字符，按等级着色 */
const AVATAR_COLORS = ['#c9452c', '#b97f1e', '#33507a', '#2f6e4f', '#6b4f8a', '#8a6f4b', '#5d7a5a', '#a0522d'];
function avatar(name, grade) {
  const ch = String(name || '?').trim().charAt(0).toUpperCase() || '?';
  let h = 0; for (const s of String(name)) h = (h * 31 + s.charCodeAt(0)) >>> 0;
  const color = grade === 'L1+' ? 'var(--vermilion)' : AVATAR_COLORS[h % AVATAR_COLORS.length];
  return `<span class="avatar" style="background:${color}">${esc(ch)}</span>`;
}

const PLAN_STEPS = ['付款', '设计审核', '备料', '印刷', '表面处理', '特殊工艺', '模切', '质检打包', '发货', '到港', '签收'];

/* ================= 客户档案 ================= */
VIEWS.customers = {
  f: { q: '', grade: '', cat: '', src: '', stage: '', quick: '' },
  batch: false,
  picked: new Set(),
  render() {
    const f = this.f;
    return `
    <div class="page-head"><h2>客户档案</h2><span class="sub">点击头像查看客户详情 · ${DB.data['跟进明细'].length} 份档案</span>
      <span class="spacer"></span>
      <button class="btn ghost" id="btn-batch">${this.batch ? '✓ 完成勾选' : '☑ 批量删除'}</button>
      <button class="btn pri" id="btn-add-c">＋ 新建客户档案</button></div>
    <div class="batch-bar" id="batch-bar">
      <span class="btxt">已选 <b id="batch-n">0</b> 份档案</span>
      <button class="del" id="batch-del">删除所选</button>
      <button class="cancel" id="batch-cancel">取消</button>
      <button class="all" id="batch-all">全选当前列表</button>
    </div>
    <div class="card card-pad" style="margin-bottom:.9rem">
      <div class="toolbar" style="margin:0">
        <input type="search" id="fq" placeholder="搜索姓名 / 公司 / 国家 / 联系方式…" value="${esc(f.q)}">
        <select id="f-grade">${opt('客户等级')}</select>
        <select id="f-cat">${opt('客户分类')}</select>
        <select id="f-src">${opt('询盘来源')}</select>
        <select id="f-stage">${opt('跟进阶段')}</select>
        <span class="sep"></span>
        <select id="f-quick">
          <option value="">快捷筛选</option>
          <option value="today" ${f.quick === 'today' ? 'selected' : ''}>今日待跟进</option>
          <option value="week" ${f.quick === 'week' ? 'selected' : ''}>7天内待跟进</option>
          <option value="overdue" ${f.quick === 'overdue' ? 'selected' : ''}>超时未跟进(>14天)</option>
          <option value="a" ${f.quick === 'a' ? 'selected' : ''}>A类客户</option>
          <option value="lost" ${f.quick === 'lost' ? 'selected' : ''}>已流失</option>
        </select>
        <span class="spacer"></span><span class="muted" id="f-count" style="font-size:.78rem"></span>
      </div>
    </div>
    <div class="cust-grid" id="c-grid"></div>`;
  },
  mount() {
    const bind = (id, key) => { const el = $('#' + id); el.oninput = el.onchange = () => { this.f[key] = el.value.trim(); this.grid(); }; };
    bind('fq', 'q'); bind('f-grade', 'grade'); bind('f-cat', 'cat'); bind('f-src', 'src'); bind('f-stage', 'stage'); bind('f-quick', 'quick');
    $('#btn-add-c').onclick = () => this.form(null);
    $('#btn-batch').onclick = () => { this.batch = !this.batch; this.picked.clear(); route(); };
    $('#batch-cancel').onclick = () => { this.batch = false; this.picked.clear(); route(); };
    $('#batch-all').onclick = () => {
      this.filtered().forEach(c => this.picked.add(DB.data['跟进明细'].indexOf(c)));
      this.grid();
    };
    $('#batch-del').onclick = () => this.batchDel();
    this.grid();
  },
  filtered() {
    const f = this.f, t = todayStr();
    return DB.data['跟进明细'].filter(c => {
      if (f.q && !(c['客户名称'] + c['国家'] + c['客户标签'] + c['公司名称'] + c['联系方式'] + c['邮箱']).toLowerCase().includes(f.q.toLowerCase())) return false;
      if (f.grade && c['等级'] !== f.grade) return false;
      if (f.cat && c['分类'] !== f.cat) return false;
      if (f.src && c['来源'] !== f.src) return false;
      if (f.stage && c['跟进阶段'] !== f.stage) return false;
      if (f.quick === 'today' && c['下次提醒'] !== t) return false;
      if (f.quick === 'week' && !(daysUntil(c['下次提醒']) >= 0 && daysUntil(c['下次提醒']) <= 7)) return false;
      if (f.quick === 'overdue' && !(daysAgo(c['最新跟进日']) > 14 && !String(c['跟进结果']).includes('流失'))) return false;
      if (f.quick === 'a' && c['分类'] !== 'A类') return false;
      if (f.quick === 'lost' && !String(c['跟进结果']).includes('流失')) return false;
      return true;
    }).sort((a, b) => String(b['聊天建立日期']).localeCompare(String(a['聊天建立日期'])));
  },
  grid() {
    const list = this.filtered();
    $('#f-count').textContent = `共 ${list.length} 份档案`;
    if (!list.length) { $('#c-grid').innerHTML = '<div class="card"><div class="empty"><div class="big"> persona</div>没有符合条件的客户</div></div>'.replace(' persona', '⚇'); return; }
    $('#c-grid').innerHTML = list.map(c => {
      const dd = daysAgo(c['最新跟进日']);
      const i = DB.data['跟进明细'].indexOf(c);
      const ck = this.batch ? `<input type="checkbox" class="ck" ${this.picked.has(i) ? 'checked' : ''}
        onclick="event.stopPropagation()" onchange="VIEWS.customers.pick(${i}, this.checked)">` : '';
      return `<div class="cust-card ${this.batch && this.picked.has(i) ? 'picked' : ''}" onclick="${this.batch ? `VIEWS.customers.pick(${i}, ${!this.picked.has(i)})` : `VIEWS.customers.detail(${i})`}">
        ${ck}${avatar(c['客户名称'], c['等级'])}
        <div class="cc-main">
          <div class="cc-name">${esc(c['客户名称'])} <span class="tag lv">${esc(c['等级'])}</span> <span class="tag ${gradeClass(c['分类'])}">${esc(c['分类'])}</span></div>
          <div class="cc-sub">${esc(c['国家']) || '—'}${c['公司名称'] ? ' · ' + esc(c['公司名称']) : ''}</div>
          <div class="cc-meta">
            <span class="tag plain" style="font-size:.66rem">${esc(c['跟进阶段']) || '未开始'}</span>
            <span class="tag ${statusTag(c['跟进结果'])}" style="font-size:.66rem">${esc(c['跟进结果']) || '—'}</span>
            <span class="num" style="font-size:.68rem;color:var(--ink-3)">${c['总跟进次数'] || 0}次跟进</span>
          </div>
          <span class="prog" style="margin-top:.4rem"><i style="width:${stageProgress(c['跟进阶段']) * 100}%"></i></span>
        </div>
        <div class="cc-side" style="${this.batch ? 'display:none' : ''}">
          <button class="btn pri sm" onclick="event.stopPropagation();VIEWS.customers.logForm(${i})">＋ 跟进</button>
          <button class="btn ghost sm" onclick="event.stopPropagation();VIEWS.customers.form(${i})">编辑</button>
        </div>
        ${dd > 14 && !String(c['跟进结果']).includes('流失') ? '<span class="cc-flag" title="超时未跟进">超时</span>' : ''}
      </div>`;
    }).join('');
    const bar = $('#batch-bar');
    if (bar) {
      bar.classList.toggle('show', this.batch);
      $('#batch-n').textContent = this.picked.size;
    }
  },
  pick(i, on) {
    on ? this.picked.add(i) : this.picked.delete(i);
    this.grid();
  },
  batchDel() {
    if (!this.picked.size) return toast('请先勾选要删除的客户', 'err');
    const names = [...this.picked].map(i => DB.data['跟进明细'][i]?.['客户名称']).filter(Boolean);
    openModal(`批量删除 ${names.length} 份档案`, `
      <p>将删除以下 <b style="color:var(--danger)">${names.length}</b> 份客户档案：</p>
      <div style="max-height:200px;overflow-y:auto;background:var(--paper-2);border-radius:8px;padding:.6rem .8rem;margin:.5rem 0;line-height:1.9;font-size:.84rem">
        ${names.map(n => esc(n)).join('、')}</div>
      <p class="muted" style="font-size:.76rem">跟进日志中的历史记录会保留。此操作不可撤销，建议先导出备份。</p>`,
      `<button class="btn ghost" onclick="closeModal()">取消</button>
       <button class="btn danger" id="batch-del-ok">确认删除 ${names.length} 份</button>`,
      () => {
        $('#batch-del-ok').onclick = () => {
          const idxs = [...this.picked].sort((a, b) => b - a);
          idxs.forEach(i => DB.data['跟进明细'].splice(i, 1));
          DB.save(); this.picked.clear(); this.batch = false;
          closeModal(); toast(`已删除 ${idxs.length} 份档案`); route(); buildNav();
        };
      });
  },
  /* ---------- 客户详情 ---------- */
  detail(i) {
    const c = DB.data['跟进明细'][i];
    const name = c['客户名称'];
    const prods = DB.data['产品信息'].filter(p => p['客户名称'] === name);
    const logs = DB.data['跟进日志'].filter(l => l['客户名称'] === name)
      .sort((a, b) => String(b['跟进日期']).localeCompare(String(a['跟进日期'])));
    const orders = DB.data['订单成交管理'].filter(o => o['客户名称'] === name);
    const plan = DB.data['生产计划'].find(p => p['客户名称'] === name);
    const usd = orders.reduce((a, o) => a + num(o['总金额USD']), 0);
    const kv = (k, v) => `<div class="kv"><span class="k">${k}</span><span class="v">${v === '' || v == null ? '<span class="muted">—</span>' : v}</span></div>`;
    const E = mod => `<button class="btn ghost sm" onclick="closeModal();VIEWS.customers.form(${i},'${mod}')">编辑</button>`;
    openModal(`客户档案 · ${name}`, `
      <div class="cust-hero">
        ${avatar(name, c['等级'])}
        <div>
          <div style="font-family:var(--serif);font-weight:900;font-size:1.25rem">${esc(name)}
            <span class="tag lv">${esc(c['等级'])}</span>
            <span class="tag ${gradeClass(c['分类'])}">${esc(c['分类'])}</span>
            <span class="tag ${statusTag(c['跟进结果'])}">${esc(c['跟进结果']) || '—'}</span></div>
          <div class="muted" style="font-size:.78rem;margin-top:.2rem">${esc(c['国家']) || '—'} · 建档 ${esc(c['聊天建立日期']) || '—'} · 累计成交 <b style="color:var(--vermilion)">$${fmt(usd)}</b></div>
          <div style="margin-top:.4rem;display:flex;gap:.3rem;align-items:center">
            <span class="prog" style="width:120px"><i style="width:${stageProgress(c['跟进阶段']) * 100}%"></i></span>
            <span class="num" style="font-size:.72rem;color:var(--ink-3)">${esc(c['跟进阶段']) || '未开始'} · ${(stageProgress(c['跟进阶段']) * 100).toFixed(0)}%</span>
          </div>
        </div>
      </div>
      <div class="form-grid">
        <div class="card" style="box-shadow:none;background:var(--paper-2);padding:.7rem .9rem">
          <h3 class="qh" style="margin:.2rem 0 .4rem">🙎 基础信息 ${E('basic')}</h3>
          ${kv('产品ID', esc(c['产品ID']))}
          ${kv('询盘来源', esc(c['来源']))}
          ${kv('标签', esc(c['客户标签']))}
          ${kv('联系方式', esc(c['联系方式']))}
          ${kv('邮箱', esc(c['邮箱']))}
        </div>
        <div class="card" style="box-shadow:none;background:var(--paper-2);padding:.7rem .9rem">
          <h3 class="qh" style="margin:.2rem 0 .4rem">🏢 公司与联系 ${E('contact')}</h3>
          ${kv('公司名称', esc(c['公司名称']))}
          ${kv('公司网站', esc(c['公司网站']))}
          ${kv('地址', esc(c['地址']))}
          ${kv('涉及行业', esc(c['涉及行业']))}
        </div>
      </div>
      <div class="card" style="box-shadow:none;background:var(--paper-2);margin-top:.7rem;padding:.7rem .9rem">
        <h3 class="qh" style="margin:.2rem 0 .4rem">📈 跟进状态 ${E('follow')}</h3>
        <div class="form-grid three">
          <div>${kv('跟进阶段', esc(c['跟进阶段']) || '—')}</div>
          <div>${kv('总跟进次数', (c['总跟进次数'] || 0) + ' 次')}</div>
          <div>${kv('下次提醒', esc(c['下次提醒']) || '—')}</div>
          <div>${kv('跟进结果', esc(c['跟进结果']) || '—')}</div>
          <div>${kv('最新跟进', esc(c['最新跟进日']) || '—')}</div>
        </div>
        ${c['最后跟进内容'] ? `
        <div class="note-box grid-note">
          <div class="note-label">📝 最后跟进内容</div>
          <div class="note-text">${esc(c['最后跟进内容'])}</div>
        </div>` : ''}
      </div>
      <div class="card" style="box-shadow:none;background:var(--paper-2);margin-top:.7rem;padding:.7rem .9rem">
        <h3 class="qh" style="margin:0 0 .4rem">📋 产品报价（${prods.length}）· 订单（${orders.length}）
          <button class="btn pri sm" style="margin-left:auto" onclick="closeModal();VIEWS.customers.prodForm(null,'${esc(name).replace(/'/g, "\\'")}')">＋ 添加报价</button></h3>
        ${prods.length ? `<div class="tbl-wrap" style="border:1px solid var(--line);border-radius:8px"><table class="tbl">
          <thead><tr><th>产品</th><th>规格</th><th>数量</th><th>成本¥</th><th>报价$</th><th>阶段</th><th></th></tr></thead>
          <tbody>${prods.map(p => {
            const pi = DB.data['产品信息'].indexOf(p);
            return `<tr><td>${esc(p['产品名称'])}</td><td class="num" style="font-size:.74rem">${esc(p['规格尺寸'])}</td><td class="num">${esc(p['数量'])}</td><td class="num">${p['成本'] ? fmt(p['成本']) : '—'}</td><td class="num"><b style="color:var(--vermilion)">${p['报价'] ? fmt(p['报价']) : '—'}</b></td><td><span class="tag ${statusTag(p['报价阶段'])}" style="font-size:.66rem">${esc(p['报价阶段'])}</span></td>
            <td><div class="row-acts" style="opacity:1">
              <button class="btn ghost sm" onclick="closeModal();VIEWS.customers.prodForm(${pi})">编辑</button>
              <button class="btn danger sm" onclick="closeModal();VIEWS.customers.prodDel(${pi})">删</button></div></td></tr>`;
          }).join('')}
          </tbody></table></div>` : '<div class="muted" style="font-size:.8rem">暂无产品报价</div>'}
      </div>
      <div class="card" style="box-shadow:none;background:var(--paper-2);margin-top:.7rem;padding:.7rem .9rem">
        <h3 class="qh" style="margin:0 0 .4rem">🏭 生产计划${plan ? ` · 预计收货 <b style="color:var(--vermilion)">${esc(plan['预计收货时间'])}</b>` : ''}
          <span style="margin-left:auto"></span>
          <button class="btn ghost sm" onclick="closeModal();VIEWS.customers.planForm(${plan ? DB.data['生产计划'].indexOf(plan) : 'null'},'${esc(name).replace(/'/g, "\\'")}')">${plan ? '编辑排期' : '＋ 添加排期'}</button>
          ${plan ? `<button class="btn ghost sm" onclick="closeModal();VIEWS.customers.planDel(${DB.data['生产计划'].indexOf(plan)})">删除</button>` : ''}
          ${plan ? `<button class="btn pri sm" onclick="VIEWS.customers.gantt(${DB.data['生产计划'].indexOf(plan)})">📊 甘特图</button>` : ''}</h3>
        ${plan ? `<div class="plan-flow">${VIEWS.customers.planFlowHTML(plan)}</div>
          <div class="muted" style="font-size:.74rem;margin-top:.5rem">下单 ${esc(plan['预计下单时间'])} · 生产周期 ${plan['生产周期']} 天 · 总周期 ${plan['总周期']} 天</div>`
        : '<div class="muted" style="font-size:.8rem">暂无生产排期</div>'}
      </div>
      <div class="card" style="box-shadow:none;background:var(--paper-2);margin-top:.7rem;padding:.7rem .9rem">
        <h3 class="qh" style="margin:0 0 .4rem">🕓 跟进历史（${logs.length}）</h3>
        <div class="timeline">${logs.map(l => {
          const li = DB.data['跟进日志'].indexOf(l);
          return `<div class="tl-item">
          <div class="d">${esc(l['跟进日期'])} · ${esc(l['跟进方式']) || '—'} · ${esc(l['跟进阶段']) || ''}
            <button class="btn ghost sm" style="padding:.05rem .4rem;font-size:.64rem;margin-left:.3rem" onclick="closeModal();VIEWS.logs.editForm(${li})">改</button>
            <button class="btn danger sm" style="padding:.05rem .4rem;font-size:.64rem" onclick="closeModal();VIEWS.logs.del(${li})">删</button></div>
          <div class="rec">${esc(l['跟进记录'])}</div></div>`;
        }).join('') || '<div class="muted" style="font-size:.8rem">暂无跟进记录</div>'}</div>
      </div>`,
      `<button class="btn pri" onclick="closeModal();VIEWS.customers.logForm(${i})">＋ 记跟进</button>
       <button class="btn ghost" onclick="closeModal();VIEWS.customers.form(${i},'basic')">编辑基础</button>
       <button class="btn danger" onclick="closeModal();VIEWS.customers.del(${i})">删除档案</button>`);
  },
  planFlowHTML(p) {
    return PLAN_STEPS.map(s => {
      const d = num(p[s]);
      return `<div class="plan-step" title="${s}：${d}天"><b>${d || '–'}</b>${s}</div>`;
    }).join('');
  },
  /* ---------- 甘特图（canvas 绘制，可下载发客户） ---------- */
  /* ---------- 甘特图（马卡龙暖橙配色，中英文切换，canvas 可下载发客户） ---------- */
  GANTT_EN: {
    title: 'Estimated Time Frame',
    steps: { '付款': 'Payment', '设计审核': 'Design Review', '备料': 'Material Prep', '印刷': 'Printing',
      '表面处理': 'Surface Finishing', '特殊工艺': 'Special Process', '模切': 'Die Cutting',
      '质检打包': 'QC & Packing', '发货': 'Ship', '到港': 'Port Arrive', '签收': 'Sign Off' },
    orderDate: 'Order Date', prodCycle: 'Production', totalCycle: 'Total Lead Time',
    days: 'days', eta: 'Est. Delivery', today: 'Today',
  },
  drawGantt(p, lang) {
    const T = this.GANTT_EN;
    const zh = lang === 'zh';
    const steps = PLAN_STEPS.map(s => ({ name: s, en: T.steps[s], days: num(p[s]) })).filter(s => s.days > 0);
    const start = new Date(String(p['预计下单时间']) + 'T00:00:00');
    const totalDays = steps.reduce((a, s) => a + s.days, 0);
    const W = 900, rowH = 44, headH = 118, H = headH + steps.length * rowH + 46;
    const cv = document.createElement('canvas');
    const dpr = 2; cv.width = W * dpr; cv.height = H * dpr;
    const g = cv.getContext('2d'); g.scale(dpr, dpr);
    // 马卡龙暖橙配色
    const INK = '#6b3a2a', MUTED = '#b08968', LINE = '#e5c9a8', PAPER = '#fdf8e9', DEEP = '#c45a2d', BAR = '#e8a87c';
    g.fillStyle = PAPER; g.fillRect(0, 0, W, H);
    // 标题
    g.fillStyle = DEEP; g.font = '700 24px "Noto Serif SC", serif';
    g.fillText(zh ? `生产排期甘特图 · ${p['客户名称']}` : `${T.title} · ${p['客户名称']}`, 28, 42);
    g.font = '13px "Noto Sans SC", sans-serif'; g.fillStyle = MUTED;
    g.fillText(zh
      ? `下单日期 ${p['预计下单时间']}    生产周期 ${p['生产周期']} 天    总周期 ${p['总周期']} 天`
      : `${T.orderDate} ${p['预计下单时间']}    ${T.prodCycle} ${p['生产周期']} ${T.days}    ${T.totalCycle} ${p['总周期']} ${T.days}`, 28, 66);
    g.fillStyle = DEEP; g.font = '700 14px "Noto Sans SC", sans-serif';
    g.fillText(zh ? `预计收货：${p['预计收货时间']}` : `${T.eta}: ${p['预计收货时间']}`, W - 210, 42);
    const L = 118, R = W - 28, chartW = R - L;
    const dayW = chartW / totalDays;
    // 日期轴
    const fmtD = d => `${d.getMonth() + 1}/${d.getDate()}`;
    g.font = '11px "JetBrains Mono", monospace';
    for (let d = 0; d <= totalDays; d += Math.max(1, Math.ceil(totalDays / 12))) {
      const x = L + d * dayW;
      g.strokeStyle = LINE; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(x, headH - 18); g.lineTo(x, H - 34); g.stroke(); g.setLineDash([]);
      const dt = new Date(start.getTime() + d * 86400000);
      g.fillStyle = MUTED; g.textAlign = 'center'; g.fillText(fmtD(dt), x, H - 18);
    }
    g.textAlign = 'left';
    // 工序条（统一马卡龙橙，深浅交替）
    let cursor = 0;
    steps.forEach((s, si) => {
      const y = headH + si * rowH;
      g.fillStyle = INK; g.font = '500 13px "Noto Sans SC", sans-serif';
      g.fillText(zh ? s.name : s.en, L - 8, y + 18); g.textAlign = 'right';
      const bx = L + cursor * dayW, bw = s.days * dayW;
      const base = si % 2 === 0 ? BAR : '#d99b6a';
      const grad = g.createLinearGradient(bx, y, bx + bw, y + rowH - 20);
      grad.addColorStop(0, base); grad.addColorStop(1, si % 2 === 0 ? '#f0c9a0' : '#e8b98e');
      g.fillStyle = grad;
      const r = Math.min(9, bw / 2, 12);
      const by = y + 2, bh = rowH - 22;
      g.beginPath(); g.moveTo(bx + r, by); g.arcTo(bx + bw, by, bx + bw, by + bh, r);
      g.arcTo(bx + bw, by + bh, bx, by + bh, r); g.arcTo(bx, by + bh, bx, by, r); g.arcTo(bx, by, bx + bw, by, r); g.fill();
      if (bw > 44) {
        g.fillStyle = '#fff'; g.font = '600 11px "Noto Sans SC", sans-serif'; g.textAlign = 'center';
        g.fillText(`${s.days}${zh ? '天' : 'd'}`, bx + bw / 2, y + bh / 2 + 12);
      }
      const dStart = new Date(start.getTime() + cursor * 86400000);
      g.fillStyle = MUTED; g.font = '10px "JetBrains Mono", monospace';
      g.fillText(fmtD(dStart), bx, y + rowH - 8);
      g.textAlign = 'left';
      cursor += s.days;
    });
    // 今日线
    const todayX = L + (Date.now() - start.getTime()) / 86400000 * dayW;
    if (todayX > L && todayX < R) {
      g.strokeStyle = DEEP; g.setLineDash([5, 4]); g.beginPath();
      g.moveTo(todayX, headH - 18); g.lineTo(todayX, H - 34); g.stroke(); g.setLineDash([]);
      g.fillStyle = DEEP; g.font = '11px "Noto Sans SC", sans-serif';
      g.fillText(zh ? '今天' : T.today, todayX + 4, headH - 4);
    }
    return cv;
  },
  ganttLang: 'zh',
  gantt(i) {
    const p = DB.data['生产计划'][i];
    const steps = PLAN_STEPS.map(s => ({ name: s, days: num(p[s]) })).filter(s => s.days > 0);
    if (!steps.length) return toast('该排期没有填写工序天数', 'err');
    const paint = () => {
      const cv = this.drawGantt(p, this.ganttLang);
      $('#gantt-img').src = cv.toDataURL('image/png');
      $('#gantt-cv').dataset.dataurl = cv.toDataURL('image/png');
    };
    openModal((this.ganttLang === 'zh' ? '生产甘特图' : 'Production Gantt') + ' · ' + p['客户名称'], `
      <div style="display:flex;gap:.4rem;justify-content:flex-end;margin-bottom:.5rem">
        <button class="btn ${this.ganttLang === 'zh' ? 'pri' : 'ghost'} sm" id="gantt-zh">中文</button>
        <button class="btn ${this.ganttLang === 'en' ? 'pri' : 'ghost'} sm" id="gantt-en">English</button>
      </div>
      <div style="text-align:center;background:#fff;border-radius:8px;padding:.5rem">
        <img id="gantt-img" src="" style="max-width:100%;border-radius:6px" alt="甘特图">
      </div>`,
      `<button class="btn ghost" onclick="closeModal()">关闭</button>
       <button class="btn pri" id="gantt-dl">⬇ 下载图片（发客户）</button>`,
      () => {
        const cv = this.drawGantt(p, this.ganttLang);
        $('#gantt-img').src = cv.toDataURL('image/png');
        $('#gantt-zh').onclick = () => { this.ganttLang = 'zh'; $('#gantt-zh').className = 'btn pri sm'; $('#gantt-en').className = 'btn ghost sm'; $('#modal-title').textContent = '生产甘特图 · ' + p['客户名称']; paint(); };
        $('#gantt-en').onclick = () => { this.ganttLang = 'en'; $('#gantt-en').className = 'btn pri sm'; $('#gantt-zh').className = 'btn ghost sm'; $('#modal-title').textContent = 'Production Gantt · ' + p['客户名称']; paint(); };
        $('#gantt-dl').onclick = () => {
          const a = document.createElement('a');
          a.href = $('#gantt-img').src;
          a.download = `Production-Schedule-${p['客户名称']}-${p['预计下单时间']}.png`;
          a.click(); toast('图片已下载，可直接发送给客户');
        };
      });
  },
  /* ---------- 产品报价表单 ---------- */
  prodForm(i, presetName) {
    const p = i == null ? { 客户名称: presetName || '' } : DB.data['产品信息'][i];
    const F = (k, label, type = 'text') => `<div class="field"><label>${label}</label><input name="${k}" type="${type}" value="${esc(p[k] ?? '')}"></div>`;
    openModal(i == null ? '添加产品报价' : '编辑产品报价', `
      <div class="form-grid three">
        ${F('客户名称', '客户名称 *')}${F('产品名称', '产品名称')}${F('用途', '用途')}
        ${F('材质要求', '材质要求')}${F('规格尺寸', '规格尺寸')}${F('印刷工艺', '印刷工艺')}
        ${F('数量', '数量')}${F('成本', '成本 (RMB)', 'number')}${F('报价', '报价 (USD)', 'number')}
        <div class="field"><label>报价阶段</label><select name="报价阶段"><option value=""></option>
          ${(DB.data['后台配置']['报价阶段'] || []).map(v => `<option ${p['报价阶段'] === v ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></div>
        ${F('备注', '备注', 'text', )}
        <div class="field full"><label>报价明细</label><textarea name="报价明细" placeholder="工艺/价格构成等">${esc(p['报价明细'] ?? '')}</textarea></div>
      </div>`,
      `<button class="btn ghost" onclick="closeModal()">取消</button><button class="btn pri" id="save-p">保存</button>`,
      () => {
        $('#save-p').onclick = () => {
          const data = {};
          document.querySelectorAll('#modal-body [name]').forEach(el => data[el.name] = el.value.trim());
          if (!data['客户名称']) return toast('请填写客户名称', 'err');
          if (i == null) DB.data['产品信息'].push(data);
          else DB.data['产品信息'][i] = { ...DB.data['产品信息'][i], ...data };
          DB.save(); closeModal(); toast('报价已保存');
          const ci = DB.data['跟进明细'].findIndex(r => r['客户名称'] === data['客户名称']);
          if (ci >= 0) VIEWS.customers.detail(ci);
        };
      });
  },
  prodDel(i) {
    const p = DB.data['产品信息'][i];
    openModal('删除报价', `<p>确定删除 <b>${esc(p['客户名称'])}</b> 的「${esc(p['产品名称'])}」报价吗？</p>`,
      `<button class="btn ghost" onclick="closeModal()">取消</button><button class="btn danger" id="del-p">删除</button>`,
      () => {
        $('#del-p').onclick = () => {
          const cn = p['客户名称'];
          DB.data['产品信息'].splice(i, 1); DB.save(); closeModal(); toast('已删除');
          const ci = DB.data['跟进明细'].findIndex(r => r['客户名称'] === cn);
          if (ci >= 0) VIEWS.customers.detail(ci);
        };
      });
  },
  /* ---------- 生产排期表单 ---------- */
  planForm(i, presetName) {
    const p = i == null ? { 客户名称: presetName || '', 预计下单时间: todayStr() } : DB.data['生产计划'][i];
    const F = (k, label, type = 'text') => `<div class="field"><label>${label}</label><input name="${k}" type="${type}" value="${esc(p[k] ?? '')}"></div>`;
    openModal(i == null ? '添加生产排期' : '编辑生产排期', `
      <div class="form-grid three">
        ${F('预计下单时间', '预计下单时间', 'date')}${F('客户名称', '客户名称 *')}
        ${PLAN_STEPS.map(s => F(s, s + ' (天)', 'number')).join('')}
      </div>
      <div class="muted" style="font-size:.76rem;margin-top:.6rem">保存时自动计算：生产周期 = 设计审核~质检打包之和；总周期 = 全部工序之和；预计收货 = 下单日期 + 总周期</div>`,
      `<button class="btn ghost" onclick="closeModal()">取消</button><button class="btn pri" id="save-pl">保存</button>`,
      () => {
        $('#save-pl').onclick = () => {
          const data = {};
          document.querySelectorAll('#modal-body [name]').forEach(el => data[el.name] = el.value.trim());
          if (!data['客户名称']) return toast('请填写客户名称', 'err');
          data['预计下单时间'] = data['预计下单时间'] || todayStr();
          const prod = ['设计审核', '备料', '印刷', '表面处理', '特殊工艺', '模切', '质检打包'].reduce((a, s) => a + num(data[s]), 0);
          const total = PLAN_STEPS.reduce((a, s) => a + num(data[s]), 0);
          data['生产周期'] = prod; data['总周期'] = total;
          const d = new Date(data['预计下单时间'] + 'T00:00:00');
          d.setDate(d.getDate() + total);
          data['预计收货时间'] = d.toISOString().slice(0, 10);
          if (i == null) DB.data['生产计划'].push(data);
          else DB.data['生产计划'][i] = { ...DB.data['生产计划'][i], ...data };
          DB.save(); closeModal(); toast('排期已保存，周期自动计算');
          const ci = DB.data['跟进明细'].findIndex(r => r['客户名称'] === data['客户名称']);
          if (ci >= 0) VIEWS.customers.detail(ci);
        };
      });
  },
  planDel(i) {
    const p = DB.data['生产计划'][i];
    openModal('删除排期', `<p>确定删除 <b>${esc(p['客户名称'])}</b> 的生产排期吗？</p>`,
      `<button class="btn ghost" onclick="closeModal()">取消</button><button class="btn danger" id="del-pl">删除</button>`,
      () => {
        $('#del-pl').onclick = () => {
          const cn = p['客户名称'];
          DB.data['生产计划'].splice(i, 1); DB.save(); closeModal(); toast('已删除');
          const ci = DB.data['跟进明细'].findIndex(r => r['客户名称'] === cn);
          if (ci >= 0) VIEWS.customers.detail(ci);
        };
      });
  },
  /* ---------- 录入 / 编辑（分模块） ---------- */
  FIELDS: {
    basic: [['聊天建立日期', '聊天建立日期', 'date'], ['产品ID', '产品ID', 'text'],
      ['客户名称', '客户名称 *', 'text'], ['国家', '国家', 'text'],
      ['等级', '等级', 'sel:客户等级'], ['分类', '分类', 'sel:客户分类'],
      ['来源', '来源', 'sel:询盘来源'], ['客户标签', '标签', 'text']],
    contact: [['联系方式', '联系方式', 'text'], ['邮箱', '邮箱', 'text'],
      ['公司名称', '公司名称', 'text'], ['公司网站', '公司网站', 'text'],
      ['地址', '地址', 'text'], ['涉及行业', '涉及行业', 'text']],
    follow: [['跟进阶段', '跟进阶段', 'sel:跟进阶段'], ['跟进结果', '跟进结果', 'sel:跟进结果'],
      ['最新跟进日', '最新跟进日', 'date'], ['下次提醒', '下次提醒', 'date']],
  },
  MODULE_NAMES: { basic: '基础信息', contact: '公司与联系', follow: '跟进状态' },
  form(i, mod) {
    mod = mod || 'basic';
    const isNew = i == null;
    const c = isNew ? { 聊天建立日期: todayStr() } : DB.data['跟进明细'][i];
    const fields = isNew
      ? [...this.FIELDS.basic, ...this.FIELDS.contact]
      : (this.FIELDS[mod] || this.FIELDS.basic);
    const title = isNew ? '新建客户档案'
      : `编辑${this.MODULE_NAMES[mod] || '档案'} · ${c['客户名称']}`;
    openModal(title, `
      <div class="form-grid">
        ${fields.map(([k, label, t]) => {
          if (t.startsWith('sel:')) {
            const list = DB.data['后台配置'][t.slice(4)] || [];
            return `<div class="field"><label>${label}</label><select name="${k}"><option value=""></option>
              ${list.map(v => `<option ${c[k] === v ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></div>`;
          }
          return `<div class="field"><label>${label}</label><input name="${k}" type="${t}" value="${esc(c[k] ?? '')}"></div>`;
        }).join('')}
        ${mod === 'follow' || isNew ? `<div class="field full"><label>最后跟进内容</label><textarea name="最后跟进内容">${esc(c['最后跟进内容'] ?? '')}</textarea></div>` : ''}
      </div>`,
      `<button class="btn ghost" onclick="closeModal()">取消</button><button class="btn pri" id="save-c">保存</button>`,
      () => {
        $('#save-c').onclick = () => {
          const data = {};
          document.querySelectorAll('#modal-body [name]').forEach(el => data[el.name] = el.value.trim());
          if (!data['客户名称'] && isNew) return toast('请填写客户名称', 'err');
          if (isNew) {
            const dup = DB.data['跟进明细'].findIndex(r => r['客户名称'] === data['客户名称']);
            if (dup >= 0) return toast('该客户已存在', 'err');
            data['聊天建立日期'] = data['聊天建立日期'] || todayStr();
            data['总跟进次数'] = 0;
            data['进度'] = stageProgress(data['跟进阶段']);
            DB.data['跟进明细'].push(data);
            DB.save(); closeModal(); toast('档案已创建'); this.grid(); buildNav();
          } else {
            if (data['客户名称'] === undefined) data['客户名称'] = c['客户名称'];
            data['进度'] = stageProgress(data['跟进阶段'] !== undefined ? data['跟进阶段'] : c['跟进阶段']);
            DB.data['跟进明细'][i] = { ...c, ...data };
            DB.save(); closeModal(); toast('已保存'); this.grid();
            VIEWS.customers.detail(i);
          }
        };
      });
  },
  /* ---------- 记跟进 ---------- */
  logForm(i) {
    const c = DB.data['跟进明细'][i];
    const F = (k, label, type = 'text') => `<div class="field"><label>${label}</label>
      <input name="${k}" type="${type}" value="${k === '跟进日期' ? todayStr() : ''}"></div>`;
    const S = (k, label) => `<div class="field"><label>${label}</label>
      <select name="${k}"><option value=""></option>${(DB.data['后台配置'][k] || []).map(v => `<option ${c[k] === v ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></div>`;
    openModal('记录跟进 · ' + c['客户名称'], `
      <div class="form-grid three">
        ${F('跟进日期', '跟进日期', 'date')}${S('跟进方式', '跟进方式')}${F('下次提醒日期', '下次提醒', 'date')}
        ${S('跟进阶段', '跟进阶段')}${S('跟进结果', '跟进结果')}
        <div class="field full"><label>跟进记录</label><textarea name="跟进记录" placeholder="本次沟通了什么？"></textarea></div>
      </div>`,
      `<button class="btn ghost" onclick="closeModal()">取消</button><button class="btn pri" id="save-log">保存并更新档案</button>`,
      () => {
        $('#save-log').onclick = () => {
          const data = {};
          document.querySelectorAll('#modal-body [name]').forEach(el => data[el.name] = el.value.trim());
          if (!data['跟进记录']) return toast('请填写跟进记录', 'err');
          data['跟进日期'] = data['跟进日期'] || todayStr();
          data['客户名称'] = c['客户名称'];
          addLog(data); closeModal(); toast('跟进已记录，档案已同步更新'); this.grid();
        };
      });
  },
  del(i) {
    const c = DB.data['跟进明细'][i];
    openModal('删除档案', `<p>确定删除 <b>${esc(c['客户名称'])}</b> 的客户档案吗？跟进日志中将保留历史记录。</p>`,
      `<button class="btn ghost" onclick="closeModal()">取消</button><button class="btn danger" id="del-ok">删除</button>`,
      () => { $('#del-ok').onclick = () => { DB.data['跟进明细'].splice(i, 1); DB.save(); closeModal(); toast('已删除'); this.grid(); buildNav(); }; });
  }
};

/* ================= 跟进日志 ================= */
VIEWS.logs = {
  f: { q: '', date: '', stage: '' },
  render() {
    return `
    <div class="page-head"><h2>跟进日志</h2><span class="sub">当天跟进了谁就记谁 · 自动同步客户档案</span>
      <span class="spacer"></span><button class="btn pri" id="btn-add-log">＋ 记一条跟进</button></div>
    <div class="card card-pad" style="margin-bottom:.9rem"><div class="toolbar" style="margin:0">
      <input type="search" id="lq" placeholder="搜索客户名 / 跟进记录…" value="${esc(this.f.q)}">
      <input type="date" id="ld" value="${esc(this.f.date)}">
      <select id="ls">${opt('跟进阶段')}</select>
      <span class="spacer"></span><span class="muted" id="l-count" style="font-size:.78rem"></span>
    </div></div>
    <div class="card card-pad" id="l-list"></div>`;
  },
  mount() {
    const bind = (id, key) => { const el = $('#' + id); el.oninput = el.onchange = () => { this.f[key] = el.value.trim(); this.list(); }; };
    bind('lq', 'q'); bind('ld', 'date'); bind('ls', 'stage');
    $('#btn-add-log').onclick = () => this.addForm();
    this.list();
  },
  filtered() {
    const f = this.f;
    return DB.data['跟进日志'].filter(l => {
      if (f.q && !(l['客户名称'] + l['跟进记录']).toLowerCase().includes(f.q.toLowerCase())) return false;
      if (f.date && l['跟进日期'] !== f.date) return false;
      if (f.stage && l['跟进阶段'] !== f.stage) return false;
      return true;
    }).sort((a, b) => String(b['跟进日期']).localeCompare(String(a['跟进日期'])));
  },
  list() {
    const list = this.filtered();
    $('#l-count').textContent = `共 ${list.length} 条日志`;
    if (!list.length) { $('#l-list').innerHTML = '<div class="empty"><div class="big">✎</div>暂无跟进记录</div>'; return; }
    let html = '', lastDay = '';
    list.forEach(l => {
      const idx = DB.data['跟进日志'].indexOf(l);
      if (l['跟进日期'] !== lastDay) { html += `<div class="log-day">${esc(l['跟进日期'])}</div>`; lastDay = l['跟进日期']; }
      html += `<div class="log-entry">
        <div class="lg-head">
          <span class="lg-name">${esc(l['客户名称'])}</span>
          <span class="tag plain">${esc(l['跟进方式']) || '—'}</span>
          <span class="tag ${statusTag(l['跟进结果'])}">${esc(l['跟进结果']) || '—'}</span>
          ${l['跟进阶段'] ? `<span class="tag plain">${esc(l['跟进阶段'])}</span>` : ''}
          <span class="lg-acts">
            <button class="btn ghost sm" onclick="VIEWS.logs.editForm(${idx})">编辑</button>
            <button class="btn danger sm" onclick="VIEWS.logs.del(${idx})">删除</button>
          </span>
        </div>
        <div class="lg-rec">${esc(l['跟进记录'])}${l['下次提醒日期'] ? ` <span class="tag st-wait">下次提醒：${esc(l['下次提醒日期'])}</span>` : ''}</div>
      </div>`;
    });
    $('#l-list').innerHTML = html;
  },
  /* 通用表单：新增 null / 编辑 idx */
  form(i, preset) {
    const l = i == null ? { '跟进日期': todayStr(), ...(preset || {}) } : DB.data['跟进日志'][i];
    const F = (k, label, type = 'text') => `<div class="field"><label>${label}</label>
      <input name="${k}" type="${type}" value="${esc(l[k] ?? '')}"></div>`;
    const S = (k, label) => `<div class="field"><label>${label}</label>
      <select name="${k}"><option value=""></option>${(DB.data['后台配置'][k] || []).map(v => `<option ${l[k] === v ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></div>`;
    openModal(i == null ? '记一条跟进' : '编辑跟进日志', `
      <div class="form-grid three">
        ${F('客户名称', '客户名称 *')}
        ${F('跟进日期', '跟进日期', 'date')}${S('跟进方式', '跟进方式')}${F('下次提醒日期', '下次提醒', 'date')}
        ${S('跟进阶段', '跟进阶段')}${S('跟进结果', '跟进结果')}
        <div class="field full"><label>跟进记录</label><textarea name="跟进记录" placeholder="本次沟通了什么？">${esc(l['跟进记录'] ?? '')}</textarea></div>
      </div>`,
      `<button class="btn ghost" onclick="closeModal()">取消</button><button class="btn pri" id="save-log">${i == null ? '保存并更新档案' : '保存修改'}</button>`,
      () => {
        $('#save-log').onclick = () => {
          const data = {};
          document.querySelectorAll('#modal-body [name]').forEach(el => data[el.name] = el.value.trim());
          if (!data['客户名称']) return toast('请填写客户名称', 'err');
          if (!data['跟进记录']) return toast('请填写跟进记录', 'err');
          data['跟进日期'] = data['跟进日期'] || todayStr();
          if (i == null) {
            const idx = DB.data['跟进明细'].findIndex(r => r['客户名称'] === data['客户名称']);
            if (idx < 0) return toast('客户档案中不存在该客户，请先建档', 'err');
            addLog(data); toast('跟进已记录，档案已同步更新');
          } else {
            const old = DB.data['跟进日志'][i];
            DB.data['跟进日志'][i] = { ...old, ...data };
            // 若最新一条被修改，同步档案摘要
            const c = DB.data['跟进明细'].find(r => r['客户名称'] === data['客户名称']);
            const last = DB.data['跟进日志'].filter(x => x['客户名称'] === data['客户名称'])
              .sort((a, b) => String(b['跟进日期']).localeCompare(String(a['跟进日期'])))[0];
            if (c && last && String(last['跟进日期']) === String(DB.data['跟进日志'][i]['跟进日期'])) {
              c['最新跟进日'] = data['跟进日期'];
              c['最后跟进内容'] = data['跟进记录'];
              if (data['跟进阶段']) c['跟进阶段'] = data['跟进阶段'];
              if (data['跟进结果']) c['跟进结果'] = data['跟进结果'];
              if (data['下次提醒日期']) c['下次提醒'] = data['下次提醒日期'];
              c['进度'] = stageProgress(c['跟进阶段']);
            }
            DB.save(); toast('日志已修改');
          }
          closeModal(); this.list();
        };
      });
  },
  addForm() { this.form(null); },
  editForm(i) { this.form(i); },
  del(i) {
    const l = DB.data['跟进日志'][i];
    openModal('删除日志', `<p>确定删除 <b>${esc(l['客户名称'])}</b> ${esc(l['跟进日期'])} 的这条跟进记录吗？</p>`,
      `<button class="btn ghost" onclick="closeModal()">取消</button><button class="btn danger" id="del-log">删除</button>`,
      () => { $('#del-log').onclick = () => { DB.data['跟进日志'].splice(i, 1); DB.save(); closeModal(); toast('已删除'); this.list(); }; });
  }
};

/* ================= 启动（团队版：由 Auth.boot 登录后调用） ================= */
async function main() {
  buildNav();
  window.addEventListener('hashchange', route);
  if (document.readyState === 'complete') route();
  else window.addEventListener('load', route); // 等所有脚本加载完毕再渲染
  tick();

  $('#btn-export').onclick = () => {
    const blob = new Blob([JSON.stringify(DB.data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `小康CRM备份-${todayStr()}.json`;
    a.click();
    toast('数据已导出');
  };
  $('#btn-import').onclick = () => $('#file-import').click();
  $('#file-import').onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const d = JSON.parse(r.result);
        if (!d['跟进明细']) throw 0;
        DB.data = d; DB.save(); toast('导入成功，已同步到云端'); route();
      } catch (err) { toast('文件格式不正确', 'err'); }
    };
    r.readAsText(f);
  };
  $('#menu-toggle').onclick = () => $('#sidebar').classList.toggle('open');

  /* 团队版按钮：备份 / 系统设置 / 退出 */
  $('#btn-backups').onclick = () => Auth.backupsModal();
  $('#btn-admin').onclick = () => Auth.adminModal();
  $('#btn-logout').onclick = () => Auth.logout();
  const who = $('#whoami');
  if (who && Auth.user) who.textContent = (Auth.user.name || Auth.user.email) + (Auth.user.role === 'admin' ? ' · 管理员' : '');
  $('#btn-admin').style.display = Auth.user?.role === 'admin' ? '' : 'none';
}

/* ================= 仪表盘 ================= */
VIEWS.dash = {
  render() { return `<div id="dash-root"><div class="empty"><div class="big">◧</div>加载中…</div></div>`; },
  mount() { this.paint(); },
  stats() {
    const cs = DB.data['跟进明细'], logs = DB.data['跟进日志'], t = todayStr(), m = monthStr();
    return {
      total: cs.length,
      followed: logs.filter(l => l['跟进日期'] === t).length,
      todo: cs.filter(c => c['下次提醒'] === t).length,
      inquiry: cs.filter(c => c['聊天建立日期'] === t).length,
      week: cs.filter(c => { const d = daysUntil(c['下次提醒']); return d >= 0 && d <= 7; }).length,
      overdue: cs.filter(c => daysAgo(c['最新跟进日']) > 14 && !String(c['跟进结果']).includes('流失')).length,
      quote: DB.data['产品信息'].filter(p => p['报价阶段'] === '待报价').length,
      inquiryM: cs.filter(c => String(c['聊天建立日期']).startsWith(m)).length,
    };
  },
  paint() {
    const s = this.stats();
    const cards = [
      ['c-ink', '客户总数', s.total, '档案已合并通讯录'],
      ['c-vermilion', '今日已跟进', s.followed, '今日待跟进 ' + s.todo + ' 个'],
      ['c-amber', '7天内待跟进', s.week, '超时未跟进 ' + s.overdue + ' 个'],
      ['c-pine', '本月询盘', s.inquiryM, '今日询盘 ' + s.inquiry + ' 个'],
      ['c-indigo', '待报价', s.quote, '产品报价条目'],
      ['c-vermilion', '订单总数', DB.data['订单成交管理'].length, '总金额 $' + fmt(DB.data['订单成交管理'].reduce((a, o) => a + num(o['总金额USD']), 0))],
      ['c-amber', '提成合计', '¥' + fmt(DB.data['订单成交管理'].reduce((a, o) => a + num(o['提成']), 0)), '按订单明细汇总'],
      ['c-pine', '生产中', DB.data['生产计划'].length, '生产计划排期'],
    ];
    $('#dash-root').innerHTML = `
      <div class="page-head"><h2>仪表盘</h2><span class="sub">数据自动汇总自各业务表</span></div>
      <div class="stat-grid">${cards.map(c => `
        <div class="stat ${c[0]}" onclick="location.hash='#/${c[1].includes('订单') || c[1].includes('提成') ? 'orders' : 'customers'}'" style="cursor:pointer">
          <div class="k">${c[1]}</div><div class="v">${c[2]}</div><div class="hint">${c[3]}</div>
        </div>`).join('')}
      </div>
      <div class="dash-grid">
        <div class="col">
          <div class="card chart-card"><h3>客户跟进阶段分布</h3><div class="chart-box" id="ch-stage"></div></div>
          <div class="card chart-card"><h3>月度成交金额 (USD)</h3><div class="chart-box" id="ch-month"></div></div>
        </div>
        <div class="col">
          <div class="card chart-card"><h3>询盘来源分布</h3><div class="chart-box" id="ch-src"></div></div>
          <div class="card"><h3 class="h">跟进次数 TOP 8</h3><div class="rank-list" id="rank"></div></div>
          <div class="card"><h3 class="h">最新跟进动态</h3><div class="rank-list" id="recent"></div></div>
        </div>
      </div>`;
    this.charts(); this.ranks();
  },
  charts() {
    const font = { fontFamily: 'Noto Sans SC', fontSize: 11, color: '#4a5361' };
    const cs = DB.data['跟进明细'];
    const by = k => { const m = {}; cs.forEach(c => { const v = c[k] || '未填'; m[v] = (m[v] || 0) + 1; }); return m; };
    const stage = by('跟进阶段');
    echarts.init($('#ch-stage')).setOption({
      tooltip: { trigger: 'item' },
      series: [{ type: 'pie', radius: ['42%', '68%'], center: ['50%', '50%'],
        itemStyle: { borderRadius: 4, borderColor: '#fffdf8', borderWidth: 2 },
        label: { ...font, formatter: '{b}\n{c} 人' },
        data: Object.entries(stage).map(([n, v], i) => ({ name: n, value: v,
          itemStyle: { color: ['#c9452c', '#b97f1e', '#33507a', '#2f6e4f', '#8a6f4b', '#6b7a8f', '#a0522d', '#5d7a5a', '#8b8f98', '#4a5361'][i % 10] } })) }]
    });
    const src = by('来源');
    echarts.init($('#ch-src')).setOption({
      tooltip: { trigger: 'item' },
      series: [{ type: 'pie', radius: '66%', roseType: 'radius',
        label: { ...font, formatter: '{b} {c}' },
        itemStyle: { borderRadius: 4, borderColor: '#fffdf8', borderWidth: 2 },
        data: Object.entries(src).map(([n, v], i) => ({ name: n, value: v,
          itemStyle: { color: ['#2f6e4f', '#c9452c', '#b97f1e', '#33507a', '#6b7a8f', '#8a6f4b'][i % 6] } })) }]
    });
    const om = {};
    DB.data['订单成交管理'].forEach(o => { const m = String(o['成交日期']).slice(0, 7); om[m] = (om[m] || 0) + num(o['总金额USD']); });
    const months = Object.keys(om).sort();
    echarts.init($('#ch-month')).setOption({
      tooltip: { trigger: 'axis', valueFormatter: v => '$' + fmt(v) },
      grid: { left: 44, right: 14, top: 14, bottom: 26 },
      xAxis: { type: 'category', data: months, axisLabel: font, axisLine: { lineStyle: { color: '#d4cbb4' } } },
      yAxis: { type: 'value', axisLabel: font, splitLine: { lineStyle: { color: '#efe9dd' } } },
      series: [{ type: 'bar', data: months.map(m => om[m]), barWidth: 26,
        itemStyle: { borderRadius: [5, 5, 0, 0], color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [{ offset: 0, color: '#c9452c' }, { offset: 1, color: '#e8a13c' }] } } }]
    });
  },
  ranks() {
    const cs = [...DB.data['跟进明细']].sort((a, b) => num(b['总跟进次数']) - num(a['总跟进次数'])).slice(0, 8);
    const max = Math.max(1, ...cs.map(c => num(c['总跟进次数'])));
    $('#rank').innerHTML = cs.map((c, i) => `
      <div class="rank-item"><span class="no">${i + 1}</span><span class="nm" title="${esc(c['客户名称'])}">${esc(c['客户名称'])}</span>
      <span class="bar"><i style="width:${num(c['总跟进次数']) / max * 100}%"></i></span><span class="val">${c['总跟进次数']} 次</span></div>`).join('');
    const logs = [...DB.data['跟进日志']].sort((a, b) => String(b['跟进日期']).localeCompare(String(a['跟进日期']))).slice(0, 8);
    $('#recent').innerHTML = logs.map(l => `
      <div class="rank-item"><span class="nm" style="flex:2"><b>${esc(l['客户名称'])}</b> · <span class="muted" style="font-size:.76rem">${esc(l['跟进方式'])}</span><br>
      <span class="muted" style="font-size:.76rem;white-space:normal">${esc(String(l['跟进记录']).slice(0, 46))}</span></span>
      <span class="val" style="font-size:.72rem">${esc(l['跟进日期'])}</span></div>`).join('') || '<div class="empty">暂无记录</div>';
  }
};
