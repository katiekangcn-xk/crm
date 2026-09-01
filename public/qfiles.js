/* 报价文件库 · 手动导入报价文件，点击即看 */
'use strict';

/* ---------- IndexedDB 文件存储 ---------- */
const IDB = {
  db: null,
  open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('crm-files', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('files', { keyPath: 'id' });
      r.onsuccess = () => { IDB.db = r.result; res(); };
      r.onerror = () => rej(r.error);
    });
  },
  put(rec) { return IDB.tx('files', 'readwrite', s => s.put(rec)); },
  all() { return IDB.tx('files', 'readonly', s => s.getAll()); },
  del(id) { return IDB.tx('files', 'readwrite', s => s.delete(id)); },
  get(id) { return IDB.tx('files', 'readonly', s => s.get(id)); },
  tx(store, mode, fn) {
    return new Promise((res, rej) => {
      const rq = fn(IDB.db.transaction(store, mode).objectStore(store));
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error);
    });
  }
};

/* ---------- 报价文件解析（兼容 小康报价系统 模板） ---------- */
function parseQuoteFile(buf, filename) {
  const out = { 解析成功: false };
  try {
    if (typeof XLSX === 'undefined') return out;
    const wb = XLSX.read(buf, { type: 'array' });
    const sn = wb.SheetNames.includes('报价明细') ? '报价明细' : (wb.SheetNames.find(n => n.includes('报价')) || wb.SheetNames[0]);
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: true });
    const norm = v => typeof v === 'string' ? v.replace(/\s+/g, '') : v;
    const lab = label => {
      const L = label.replace(/\s+/g, '');
      for (let r = 0; r < rows.length; r++) {
        const row = rows[r] || [];
        for (let c = 0; c < row.length; c++) {
          if (norm(row[c]) === L) {
            for (let k = c + 1; k <= c + 3 && k < row.length; k++)
              if (row[k] !== '' && row[k] != null) return row[k];
          }
        }
      }
      return '';
    };
    const keys = ['尺寸', '数量', '灰板', '面纸/坑纸', '印刷', '过膜', '工艺', '菲林', '人工', '啤板', '辅料', '包装', '运费',
      '利润率', '成本不含运', '单价', '出厂价', '利润', '含运成本', '美元单价', '美元总价', '汇率', '省内包配送报价',
      '客户', '产品', '材质', '文件名',
      '单个重量(g)', '每箱', '箱数', '箱规', '单箱实重(kg)', '总实重(kg)', '体积重(Ex)', '总体积重(Ex)',
      '体积重(Sea/Air)', '总体积重(Sea/Air)', '每箱体积(CBM/箱)', '总体积(CBM)'];
    let hit = 0;
    keys.forEach(k => { const v = lab(k + '：') !== '' ? lab(k + '：') : lab(k + ':'); if (v !== '') { out[k] = v; hit++; } });
    out.解析成功 = hit >= 3;
    out.工作表 = sn;
  } catch (e) { /* 非报价文件 */ }
  // 文件名兜底解析：客户-产品-数量-工艺.xlsx
  const base = String(filename || '').replace(/\.(xlsx|xls|csv)$/i, '');
  const parts = base.split('-');
  if (parts.length >= 2) {
    out.客户 = out.客户 || parts[0].trim();
    out.产品 = out.产品 || parts[1].trim();
    const m = base.match(/-(\d+)[个只pcs]/i);
    if (m && !out.数量) out.数量 = +m[1];
  }
  out.文件名解析 = { 客户: parts[0]?.trim() || '', 产品: parts[1]?.trim() || '', 工艺: parts.slice(2).join('-') };
  return out;
}

/* ---------- 工具 ---------- */
const fileIcon = name => {
  const e = (name.split('.').pop() || '').toLowerCase();
  if (/xlsx|xls|csv/.test(e)) return { cls: 'xlsx', txt: 'X' };
  if (e === 'pdf') return { cls: 'pdf', txt: 'P' };
  if (/png|jpg|jpeg|gif|webp/.test(e)) return { cls: 'img', txt: 'I' };
  return { cls: 'other', txt: '?' };
};
const fmtSize = b => b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB';
const fmtDT = iso => {
  const d = new Date(iso), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
function timeGroup(iso) {
  const t = new Date(iso), now = new Date();
  const day = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.floor((day(now) - day(t)) / 86400000);
  if (diff <= 0) return '今天';
  if (diff === 1) return '昨天';
  if (diff < 7) return '最近7天';
  if (diff < 14) return '上周';
  if (t.getFullYear() === now.getFullYear() && t.getMonth() === now.getMonth()) return '这个月的早些时候';
  return '更早';
}
const GROUP_ORDER = ['今天', '昨天', '最近7天', '上周', '这个月的早些时候', '更早'];

/* ---------- 视图 ---------- */
VIEWS.qfiles = {
  files: [], q: '',
  async render() {
    await IDB.open().catch(() => {});
    this.files = await IDB.all().catch(() => []) || [];
    this.files.sort((a, b) => b.date.localeCompare(a.date));
    return `
    <div class="page-head"><h2>报价文件库</h2><span class="sub">手动导入报价文件 · 点击文件查看报价摘要 · ${this.files.length} 个文件</span>
      <span class="spacer"></span>
      <button class="btn ghost" id="qf-sample">下载模板</button>
      <button class="btn pri" id="qf-upload">⬆ 上传文件</button>
      <input type="file" id="qf-input" multiple hidden></div>
    <div class="card card-pad" style="margin-bottom:.9rem">
      <div class="qf-drop" id="qf-drop">
        <div class="qf-drop-ico">🗂</div>
        <div><b>拖拽报价文件到此处</b>，或点击「上传文件」<br>
        <span class="muted" style="font-size:.76rem">支持 Excel 报价文件（自动解析报价明细）、PDF、图片等 · 文件保存在本浏览器中</span></div>
      </div>
      <div class="toolbar" style="margin:.8rem 0 0">
        <input type="search" id="qf-q" placeholder="搜索文件名 / 客户…" value="${esc(this.q)}">
        <span class="spacer"></span><span class="muted" id="qf-count" style="font-size:.78rem"></span>
      </div>
    </div>
    <div id="qf-list"></div>`;
  },
  async mount() {
    $('#qf-upload').onclick = () => $('#qf-input').click();
    $('#qf-input').onchange = e => this.addFiles(e.target.files);
    $('#qf-q').oninput = e => { this.q = e.target.value.trim(); this.list(); };
    $('#qf-sample').onclick = () => this.sample();
    const dz = $('#qf-drop');
    ['dragover', 'dragenter'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('over'); }));
    dz.addEventListener('drop', e => this.addFiles(e.dataTransfer.files));
    this.list();
  },
  async addFiles(fileList) {
    const files = [...fileList];
    if (!files.length) return;
    let ok = 0;
    for (const f of files) {
      const buf = await f.arrayBuffer();
      let summary = null;
      if (/\.xlsx?$/i.test(f.name)) summary = parseQuoteFile(buf, f.name);
      await IDB.put({ id: Date.now() + '-' + Math.random().toString(36).slice(2, 7), name: f.name, size: f.size, type: f.type, date: new Date().toISOString(), data: buf, summary });
      ok++;
    }
    toast(`已导入 ${ok} 个文件`);
    route();
  },
  filtered() {
    const q = this.q.toLowerCase();
    return this.files.filter(f => !q || (f.name + (f.summary?.客户 || '') + (f.summary?.产品 || '')).toLowerCase().includes(q));
  },
  list() {
    const list = this.filtered();
    $('#qf-count').textContent = `共 ${list.length} 个文件`;
    if (!list.length) {
      $('#qf-list').innerHTML = `<div class="card"><div class="empty"><div class="big">🗂</div>${this.files.length ? '没有符合条件的文件' : '还没有文件，先上传或拖拽一个报价文件试试'}</div></div>`;
      return;
    }
    const groups = {};
    list.forEach(f => { const g = timeGroup(f.date); (groups[g] = groups[g] || []).push(f); });
    $('#qf-list').innerHTML = GROUP_ORDER.filter(g => groups[g]).map(g => `
      <div class="card qf-group">
        <div class="qf-group-head">▽ ${g} <span class="cnt">(${groups[g].length})</span></div>
        <div class="tbl-wrap"><table class="tbl qf-table"><thead><tr>
          <th style="width:44%">名称</th><th>修改日期</th><th>类型</th><th>大小</th><th>报价摘要</th><th style="width:90px"></th>
        </tr></thead><tbody>
          ${groups[g].map(f => {
            const ic = fileIcon(f.name);
            const s = f.summary || {};
            const brief = s.解析成功
              ? `${s.数量 ? fmt(s.数量) + '个' : ''}${s.美元单价 ? ' · $' + s.美元单价 + '/个' : ''}${s.出厂价 !== '' && s.出厂价 != null ? ' · ¥' + fmt(s.出厂价) : ''}`
              : (/\.xlsx?$/i.test(f.name) ? '<span class="muted">未能解析</span>' : '<span class="muted">—</span>');
            const idx = this.files.indexOf(f);
            return `<tr class="qf-row" onclick="VIEWS.qfiles.open('${f.id}')">
              <td><span class="fico ${ic.cls}">${ic.txt}</span><b>${esc(f.name)}</b></td>
              <td class="num muted">${fmtDT(f.date)}</td>
              <td class="muted">${f.name.split('.').pop().toUpperCase()} 文件</td>
              <td class="num muted">${fmtSize(f.size)}</td>
              <td>${brief}</td>
              <td><div class="row-acts" style="opacity:.5">
                <button class="btn ghost sm" onclick="event.stopPropagation();VIEWS.qfiles.download('${f.id}')">下载</button>
                <button class="btn danger sm" onclick="event.stopPropagation();VIEWS.qfiles.remove('${f.id}')">删除</button>
              </div></td></tr>`;
          }).join('')}
        </tbody></table></div>
      </div>`).join('');
  },
  /* 点击文件 → 详情 */
  async open(id) {
    const f = await IDB.get(id);
    if (!f) return;
    const s = f.summary || {};
    const dims = String(s.尺寸 || '').match(/([\d.]+)\s*[×xX]\s*([\d.]+)\s*[×xX]\s*([\d.]+)/);
    const kv = (k, v, cls) => `<div class="kv"><span class="k">${k}</span><span class="v ${cls || ''}">${v === '' || v == null ? '<span class="muted">—</span>' : v}</span></div>`;
    let body;
    if (s.解析成功) {
      const cost = [['灰板', s.灰板], ['面纸/坑纸', s['面纸/坑纸']], ['印刷', s.印刷], ['过膜', s.过膜], ['工艺', s.工艺], ['菲林', s.菲林],
        ['辅料', s.辅料], ['人工', s.人工], ['啤板/刀模', s.啤板], ['纸箱包装', s.包装], ['国内运费', s.运费]]
        .map(x => kv(x[0], x[1] != null && x[1] !== '' ? '¥' + fmt(x[1]) : '')).join('');
      const box = kv('单个重量', s['单个重量(g)'] ? s['单个重量(g)'] + ' g' : '') + kv('装箱', s.每箱 ? `${fmt(s.每箱)}个/箱 × ${fmt(s.箱数)}箱` : '')
        + kv('箱规', s.箱规 || '') + kv('总体积', s.总体积 ? s.总体积 + ' CBM' : '')
        + kv('总体积重', s.总体积重 || '') + kv('总实重', s.总实重 ? s.总实重 + ' kg' : '');
      body = `
        <div class="qf-detail-head">
          <span class="fico ${fileIcon(f.name).cls}">${fileIcon(f.name).txt}</span>
          <div><b style="font-size:1rem">${esc(f.name)}</b><br>
          <span class="muted" style="font-size:.76rem">${fmtDT(f.date)} · ${fmtSize(f.size)} · 解析自「${esc(s.工作表 || '')}」工作表</span></div>
        </div>
        <div class="form-grid three" style="margin-bottom:.8rem">
          <div class="qf-kv-card"><div class="kk">客户</div><div class="vv">${esc(s.客户 || f.summary?.文件名解析?.客户 || '—')}</div></div>
          <div class="qf-kv-card"><div class="kk">产品</div><div class="vv">${esc(s.产品 || f.summary?.文件名解析?.产品 || '—')}</div></div>
          <div class="qf-kv-card"><div class="kk">数量</div><div class="vv">${s.数量 ? fmt(s.数量) + ' 个' : '—'}</div></div>
          <div class="qf-kv-card"><div class="kk">尺寸</div><div class="vv">${esc(s.尺寸 || '—')}</div></div>
          <div class="qf-kv-card"><div class="kk">材质</div><div class="vv">${esc(s.材质 || '—')}</div></div>
          <div class="qf-kv-card"><div class="kk">利润率 / 汇率</div><div class="vv">${s.利润率 || '—'} / ${s.汇率 || '—'}</div></div>
        </div>
        <div class="form-grid">
          <div class="card" style="box-shadow:none;background:var(--paper-2)">
            <h3 class="qh" style="margin:.6rem .8rem">💰 成本与报价</h3>
            ${cost}${kv('成本(不含运)', s.成本不含运 !== '' ? '¥' + fmt(s.成本不含运) : '')}
            ${kv('出厂价', s.出厂价 !== '' ? '¥' + fmt(s.出厂价) : '', 'pri')}
            ${kv('美元单价', s.美元单价 !== '' ? '$' + s.美元单价 : '', 'pri')}
            ${kv('美元总价', s.美元总价 !== '' ? '$' + fmt(s.美元总价) : '', 'pri')}
            ${kv('利润', s.利润 !== '' ? '¥' + fmt(s.利润) : '')}
          </div>
          <div class="card" style="box-shadow:none;background:var(--paper-2)">
            <h3 class="qh" style="margin:.6rem .8rem">📦 装箱数据</h3>${box}
          </div>
        </div>`;
    } else {
      body = `
        <div class="qf-detail-head">
          <span class="fico ${fileIcon(f.name).cls}">${fileIcon(f.name).txt}</span>
          <div><b style="font-size:1rem">${esc(f.name)}</b><br>
          <span class="muted" style="font-size:.76rem">${fmtDT(f.date)} · ${fmtSize(f.size)}</span></div>
        </div>
        <div class="empty" style="padding:1.6rem">${/\.xlsx?$/i.test(f.name)
          ? '该 Excel 文件不是「小康报价系统」模板格式，无法自动解析报价明细。<br>你可以下载后查看，或用报价计算器手动重算。'
          : '该文件为非 Excel 文件，可下载查看。'}</div>`;
    }
    const canLoad = s.解析成功 && (s.数量 || dims);
    openModal('报价文件详情', body,
      `${canLoad ? `<button class="btn pri" id="qf-load">↗ 转存到产品报价</button>` : ''}
       <button class="btn ghost" id="qf-dl">下载原文件</button>
       <button class="btn danger" id="qf-del">删除</button>`,
      () => {
        $('#qf-dl').onclick = () => this.download(id);
        $('#qf-del').onclick = () => { closeModal(); this.remove(id); };
        if (canLoad) $('#qf-load').onclick = () => { closeModal(); this.loadToCalc(s, f); };
      });
  },
  loadToCalc(s, f) {
    const dims = String(s.尺寸 || '').match(/([\d.]+)\s*[×xX]\s*([\d.]+)\s*[×xX]\s*([\d.]+)/);
    DB.data['产品信息'].push({
      客户名称: s.客户 || f.summary?.文件名解析?.客户 || '',
      产品名称: s.产品 || f.summary?.文件名解析?.产品 || '',
      材质要求: s.材质 || '',
      规格尺寸: s.尺寸 || (dims ? `${dims[1]}×${dims[2]}×${dims[3]}mm` : ''),
      数量: s.数量 || '',
      报价: s.美元单价 ?? '',
      报价阶段: '已报价',
      备注: `${f.name} · 出厂价¥${fmt(s.出厂价 ?? 0)} · ${todayStr()}导入`,
    });
    DB.save();
    location.hash = '#/customers';
    toast('已转存到「产品报价」模块');
  },
  async download(id) {
    const f = await IDB.get(id);
    if (!f) return;
    const blob = new Blob([f.data], { type: f.type || 'application/octet-stream' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = f.name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('已开始下载');
  },
  async remove(id) {
    openModal('删除文件', `<p>确定删除该文件吗？本浏览器中的副本将被清除（不影响你电脑上的原文件）。</p>`,
      `<button class="btn ghost" onclick="closeModal()">取消</button><button class="btn danger" id="qf-del-ok">删除</button>`,
      () => { $('#qf-del-ok').onclick = async () => { closeModal(); await IDB.del(id); toast('已删除'); route(); }; });
  },
  sample() {
    const rows = [
      ['报价明细', '', '', '国内出厂价', '', '', '装箱数据'],
      ['尺寸：', '200×150×60mm', '', '利润率：', 1.35, '', '单个重量 (g)：', 85],
      ['数量：', 1000, '', '成本不含运：', 0, '', '每箱：', 100],
      ['灰板：', 0, '', '单价：', 0, '', '箱数：', 10],
      ['面纸/坑纸：', 0, '', '出厂价：', 0, '', '箱规：', '45×31×25cm'],
      ['印刷：', 0, '', '利润：', 0, '', '单箱实重 (kg)：', 2.4],
      ['过膜：', 0, '', '外贸含省内运费', '', '', '总实重 (kg)：', 24],
      ['工艺：', 0, '', '汇率：', 6.8, '', '体积重 (Ex)：', 7],
      ['菲林：', 0, '', '含运成本：', 0, '', '总体积重 (Ex)：', 70],
      ['人工：', 0, '', '省内包配送报价：', 0, '', '体积重 (Sea/Air)：', 5.5],
      ['啤板：', 0, '', '利润：', 0, '', '总体积重 (Sea/Air)：', 55],
      ['辅料：', 0, '', '美元单价：', 0, '', '每箱体积 (CBM/箱)：', 0.035],
      ['包装：', 0, '', '美元总价：', 0, '', '总体积 (CBM)：', 0.35],
      ['运费：', 0, '', '', '', '', '客户：', '示例客户'],
      ['', '', '', '', '', '', '产品：', '折叠盒'],
      ['', '', '', '', '', '', '材质：', '157克双铜纸裱1200克灰板'],
      ['', '', '', '', '', '', '工艺：', '4色+哑膜'],
      ['', '', '', '', '', '', '文件名：', '示例'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '报价明细');
    XLSX.writeFile(wb, '报价模板-示例.xlsx');
  },
};
