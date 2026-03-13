# Deploy — Receipt Renamer

## 前端（GitHub Pages）

### 前提
- Node.js 18+
- GitHub repo 已开启 Pages（Settings → Pages → Source: Deploy from branch → `gh-pages`）

### 部署步骤

```bash
# 1. 安装依赖
npm install

# 2. 构建
npm run build

# 3. 部署到 GitHub Pages
npm run deploy    # 使用 gh-pages 包，推送 dist/ 到 gh-pages 分支
```

### 环境变量

在 `.env.production` 中配置：

```env
VITE_AI_PROXY_URL=https://receipt-proxy.your-domain.workers.dev
VITE_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
```

- `VITE_AI_PROXY_URL`：Cloudflare Worker AI 代理地址（必须）
- `VITE_GOOGLE_CLIENT_ID`：Google OAuth Client ID（必须）

### 验证

部署后访问 `https://<username>.github.io/receipt-renamer/`

检查：
- [ ] 页面正常加载（不是空白）
- [ ] `manifest.json` 可访问（`/receipt-renamer/manifest.json`）
- [ ] `sw.js` 可访问（`/receipt-renamer/sw.js`）
- [ ] Google 登录弹窗正常
- [ ] 拍照/上传功能可用

### 常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| 页面空白 | `base` 路径不对 | 检查 `vite.config.js` 中 `base: '/receipt-renamer/'` |
| sw.js 404 | Pages 未部署或 source 设置错 | Settings → Pages → Source 选 `gh-pages` 分支 |
| OAuth 报错 | Client ID 未配置或域名未授权 | Google Console → OAuth → 添加 `github.io` 域名 |
| AI 识别失败 | Worker 未部署或 URL 错 | 检查 `.env.production` 中的 `VITE_AI_PROXY_URL` |

---

## AI Proxy Worker（Cloudflare Workers）

### 前提
- Cloudflare 账号
- `wrangler` CLI 已安装并登录
- Gemini API key

### 部署步骤

```bash
cd worker/

# 1. 配置 wrangler.toml
# name = "receipt-proxy"
# 确认 KV namespace binding

# 2. 创建 KV namespace（首次）
wrangler kv namespace create "QUOTA"
# 将返回的 id 填入 wrangler.toml

# 3. 上传 secrets
wrangler secret put GEMINI_API_KEY     # 粘贴 Gemini API key
wrangler secret put ALLOWED_ORIGIN     # 例如 https://horancheng.github.io

# 4. 部署
wrangler deploy
```

### 环境变量 / Secrets

| 名称 | 类型 | 说明 |
|------|------|------|
| `GEMINI_API_KEY` | Secret | Gemini 2.0 Flash API key |
| `ALLOWED_ORIGIN` | Secret | CORS 允许的前端域名 |
| `QUOTA` | KV Binding | 用户日限额存储 |

### 验证

```bash
# 健康检查
curl https://receipt-proxy.your-domain.workers.dev/health

# 测试识别（需要有效 base64 图片数据）
curl -X POST https://receipt-proxy.your-domain.workers.dev/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"uid":"test","base64":"...","mediaType":"image/jpeg","fileType":"image"}'
```

### Worker 端点

| 路径 | 方法 | 说明 |
|------|------|------|
| `/health` | GET | 健康检查 |
| `/api/analyze` | POST | AI 识别（主端点） |

---

## Google Cloud 配置

### OAuth Consent Screen
1. Google Cloud Console → APIs & Services → OAuth consent screen
2. 类型：External（测试阶段）
3. 添加测试用户邮箱

### OAuth Client ID
1. APIs & Services → Credentials → Create OAuth Client ID
2. 类型：Web application
3. Authorized JavaScript origins：
   - `https://<username>.github.io`
   - `http://localhost:5173`（本地开发）
4. Authorized redirect URIs：同上

### 启用 API
- Google Drive API
- Google Sheets API

---

## 本地开发

```bash
# 安装
npm install

# 开发服务器
npm run dev        # Vite dev server on :5173

# 测试
npm test           # Vitest（77 tests）

# 构建
npm run build      # 输出到 dist/
```

`.env.local` 示例：
```env
VITE_AI_PROXY_URL=https://receipt-proxy.henrycdev26.workers.dev
VITE_GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
```
