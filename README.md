# 🧾 Receipt Renamer — 小票智能管家

移动端优先的 Web App，连接你的 Google Drive，用 AI 自动识别、重命名、归档收据。

## ✨ Features

- 📷 **拍照扫描** — 手机拍照即可识别收据
- 🤖 **AI 自动提取** — 日期、商户、金额、分类一键识别
- 📁 **智能归档** — 自动重命名为 `YYYY-MM-DD 分类 商户.ext`，按置信度分档
- 📊 **Sheets 同步** — 处理结果自动写入 Google Sheets
- ⚡ **批量处理** — Drive 收件箱一键全部处理
- 📱 **PWA 支持** — 可添加到手机主屏幕
- 🌙 **暗色主题** — 精心设计的深色 UI

## 🛠 Tech Stack

| 技术 | 用途 |
|------|------|
| React 18 | UI 框架 |
| Vite | 构建工具 |
| Google Drive API v3 | 文件读写 |
| Google Sheets API v4 | 数据同步 |
| Anthropic Claude API | 收据图片 AI 识别 |
| localStorage | 本地配置持久化 |

## 📋 Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- Google Cloud 项目（OAuth Client ID + Drive API + Sheets API）
- [Anthropic API Key](https://console.anthropic.com/)（用于 AI 收据识别）

## 🚀 Quick Start

```bash
# 1. Clone
git clone https://github.com/HoranCheng/receipt-renamer.git
cd receipt-renamer

# 2. Install
npm install

# 3. Configure
cp .env.example .env
# Edit .env — fill in your API keys

# 4. Run
npm run dev
```

Open `http://localhost:5173` on your phone (same WiFi network).

## 🔑 Google Cloud Setup

1. 打开 [Google Cloud Console](https://console.cloud.google.com/)
2. 创建新项目（或选择已有项目）
3. **启用 API**:
   - Google Drive API
   - Google Sheets API
4. **创建 OAuth 凭据**:
   - API 和服务 → 凭据 → 创建凭据 → OAuth 客户端 ID
   - 应用类型：Web 应用
   - 授权 JavaScript 来源：添加 `http://localhost:5173`（开发）和你的生产域名
5. 复制 Client ID（格式：`xxxxx.apps.googleusercontent.com`）
6. 在 App 的 Setup 页面粘贴 Client ID

## 🔧 Environment Variables

| 变量 | 必须 | 说明 |
|------|------|------|
| `VITE_ANTHROPIC_API_KEY` | 是* | Anthropic API Key（直连模式） |
| `VITE_AI_PROXY_URL` | 是* | AI 代理服务器 URL（代理模式） |
| `VITE_GOOGLE_CLIENT_ID` | 否 | 预置 Google OAuth Client ID |

*二选一：直连模式用 `VITE_ANTHROPIC_API_KEY`，生产环境建议用 `VITE_AI_PROXY_URL` 代理。

## 📂 Google Drive Folder Structure

```
My Drive/
├── 00_inbox/           ← 放入待处理收据
├── 10_validated/       ← AI 高置信度自动归档
└── 20_review_needed/   ← 低置信度待人工审核
```

文件夹名称可在 App 设置中自定义，系统会自动创建不存在的文件夹。

## 🏗 Architecture

```
用户 Google Drive 00_inbox/
  → 前端读取文件列表（Drive API）
  → 下载图片转 base64
  → Claude API 视觉识别（提取 date/merchant/amount/category）
  → 重命名为 "YYYY-MM-DD Category Merchant.ext"
  → 高置信(≥70%) → 10_validated/ | 低置信 → 20_review_needed/
  → 写入 Google Sheets receipt_index 表
```

**纯前端架构**：无自有后端，用户数据全部在用户自己的 Google 账号中。

## 📦 Project Structure

```
receipt-renamer/
├── src/
│   ├── components/     # UI 组件（Btn, Nav, Field, etc.）
│   ├── constants/      # 常量、主题色、分类定义
│   ├── services/       # Google API, AI, Storage 服务
│   ├── views/          # 页面视图（Dashboard, Inbox, Scan, Log, Config, Setup）
│   ├── App.jsx         # 主应用组件
│   └── main.jsx        # 入口
├── public/             # 静态资源、PWA manifest
├── docs/               # 项目文档
└── dist/               # 构建输出（git ignored）
```

## 🚢 Deployment

### Vercel
```bash
npm run build
# 在 Vercel 导入 GitHub 仓库，自动部署
# 在 Vercel 环境变量中配置 VITE_ANTHROPIC_API_KEY
```

### Netlify
```bash
npm run build
# 拖拽 dist/ 到 Netlify，或连接 GitHub 仓库
# Build command: npm run build
# Publish directory: dist
```

⚠️ **生产部署注意**：在 Google Cloud Console 的 OAuth 凭据中添加你的生产域名作为授权来源。

## 📄 License

MIT © 2026 Horan Cheng
