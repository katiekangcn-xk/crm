# 小康CRM 团队版 · 部署指南

> 账号密码 + 邮箱验证码登录 · 每人独立数据云端同步 · 每日自动备份（保留10天）· 全程免费

## 你将获得

- 一个公网网址，团队成员打开即用（电脑/手机浏览器均可）
- 每人注册自己的账号，数据互相独立、云端同步
- 每天自动备份一份，保留最近 10 天，随时可下载 JSON 备份文件
- 第一个注册的人自动成为**管理员**，可配置邮件服务、查看成员列表

---

## 第一步：注册 Supabase（免费数据库）

1. 打开 https://supabase.com ，点 **Start your project**，用邮箱或 GitHub 注册登录
2. 点 **New project**，名称随便填（如 `crm`），数据库密码点自动生成（不用记），地区选 Singapore，点 Create
3. 等约 2 分钟创建完成后，左侧点 **SQL Editor**（图标是一个终端）
4. 打开本文件夹里的 `init.sql` 文件（记事本即可），**全选复制**，粘贴到 SQL Editor 输入框，点右下角 **Run**
   - 显示 `Success. No rows returned` 即成功
5. 左侧点 **Project Settings**（齿轮）→ **API**，找到并复制两样东西（先记在记事本）：
   - **Project URL** —— 形如 `https://xxxx.supabase.co`
   - **service_role** 密钥 —— 点 Reveal 显示后复制（⚠ 这是最高权限密钥，绝不外传）

## 第二步：部署到 Render（免费服务器）

1. 打开 https://render.com ，用 GitHub 或邮箱注册登录
2. 本文件夹压缩为 zip（或上传到 GitHub 仓库，二选一，下面以 zip 为例）
3. 点 **New +** → **Web Service** → 选 **Deploy an existing ...** 上传 zip（或连接仓库）
4. 填写配置：
   - **Name**：`crm`（随意）
   - **Region**：Singapore
   - **Language**：Node
   - **Build Command**：`npm install`
   - **Start Command**：`node server.js`
5. 展开 **Advanced** → **Add Environment Variable**，添加两条：
   - `SUPABASE_URL` = 第一步记下的 Project URL
   - `SUPABASE_SERVICE_KEY` = 第一步记下的 service_role 密钥
6. 点 **Create Web Service**，等 2~3 分钟构建完成
7. 页面顶部会出现网址（形如 `https://crm-xxxx.onrender.com`），打开它！

## 第三步：注册账号开始使用

1. 打开网站，点「注册新账号」：填邮箱、姓名、密码（≥6位）
2. **第一个注册的人自动成为管理员并直接进入系统**
3. 后续成员注册时需要邮箱验证码：
   - 管理员配置了邮件服务（见第四步）→ 验证码发到邮箱
   - 未配置 → 验证码直接显示在注册页上（也能用，只是不够正式）
4. 首次登录会让你选「导入示例数据」或「从空白开始」

## 第四步（推荐）：配置邮件验证码

需要一个 QQ 邮箱即可：

1. QQ 邮箱网页版 → 设置 → 账户 → 找到「POP3/IMAP/SMTP」→ 开启 **SMTP 服务** → 按提示用手机发短信获取**授权码**（一串字母）
2. 用管理员账号登录 CRM → 左下角「系统设置」→ 邮件服务，填入：
   - SMTP 服务器：`smtp.qq.com`
   - 端口：`465`
   - 发件邮箱账号：你的 QQ 邮箱
   - 授权码：刚获取的那串字母（**不是QQ密码**）
   - 发件人显示：`小康CRM <你的QQ邮箱>`
3. 点「保存设置」→「发送测试邮件」，收到邮件即成功

> 163 邮箱同理：`smtp.163.com`，在设置里开启 SMTP 拿授权码。

---

## 日常使用

| 功能 | 位置 |
|---|---|
| 数据自动云端同步 | 每次修改后约1秒自动上传，换电脑登录数据都在 |
| 每日自动备份 | 每天第一次登录/保存时自动创建，保留10天自动删除 |
| 手动备份/下载备份 | 左下角「我的备份」→ 立即备份 / 下载 |
| 导出数据 | 左下角「导出数据」（下载当前全部数据 JSON） |
| 导入数据 | 左下角「导入数据」（上传之前导出的 JSON 恢复） |
| 成员管理 / 邮件设置 | 管理员左下角「系统设置」 |
| 忘记密码 | 联系管理员：系统设置里可看到成员邮箱（密码不可逆存储，需删除用户重新注册，或新建账号导入其备份数据） |

## 常见问题

**Q: 免费额度够用吗？**
A: Supabase 免费版 500MB 数据库，本系统每人约 0.5MB，够几十人用几年。Render 免费版 15 分钟无人访问会休眠，下次打开等 30~60 秒唤醒即可（数据不受影响）。

**Q: 数据安全吗？**
A: 数据库里存的是加密密码（不可逆），数据库已关闭匿名访问，只有你的服务器（持有 service_role 密钥）能读写。service_role 密钥只配在 Render 环境变量里，不会出现在网页代码中。

**Q: 想换平台部署？**
A: 任何支持 Node.js 的平台都行（Railway、Vercel+serverless、自己的服务器），核心就三步：`npm install` → 配两个环境变量 → `node server.js`。

**Q: 网站打不开/提示数据库未连接？**
A: 检查 Render 的环境变量 `SUPABASE_URL` 和 `SUPABASE_SERVICE_KEY` 是否配置正确（注意 service_role 不是 anon key），改完会自动重新部署。

## 目录结构

```
crm-team/
├── server.js      # 服务器（账号/会话/数据API/自动备份）
├── init.sql       # 数据库建表脚本（在 Supabase 运行一次）
├── package.json
└── public/        # 前端页面（与单机版同源，加了登录层）
```
