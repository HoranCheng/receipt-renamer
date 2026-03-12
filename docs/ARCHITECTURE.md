# Architecture — Receipt Renamer v0.3.0

## Overview

Receipt Renamer 是一个 PWA（Progressive Web App），运行在浏览器中，利用 Google Drive API 管理小票照片，通过 AI（Gemini）自动识别并重命名。

```
┌─────────────────────────────────────────────────┐
│  Browser (PWA)                                   │
│                                                  │
│  ┌─────────┐  ┌──────────┐  ┌──────────────┐   │
│  │ ScanView │  │ReviewView│  │  ConfigView   │   │
│  └────┬─────┘  └────┬─────┘  └──────┬───────┘   │
│       │              │               │           │
│  ┌────┴──────────────┴───────────────┴────┐     │
│  │              App.jsx (State Hub)        │     │
│  └────┬──────────┬──────────┬─────────────┘     │
│       │          │          │                    │
│  ┌────┴───┐ ┌───┴────┐ ┌───┴──────┐            │
│  │google.js│ │process │ │ storage  │            │
│  │(Drive/ │ │or.js   │ │(IDB/LS)  │            │
│  │Sheets) │ │        │ │          │            │
│  └────┬───┘ └───┬────┘ └──────────┘            │
│       │         │                               │
│  ┌────┴─────────┴─────┐                        │
│  │   Service Worker    │                        │
│  │  (Background Sync)  │                        │
│  └────┬────────────────┘                        │
│       │                                          │
└───────┼──────────────────────────────────────────┘
        │
   ┌────┴─────────────┐     ┌────────────────────┐
   │  Google APIs       │     │  Cloudflare Worker │
   │  - Drive v3        │     │  (AI Proxy)        │
   │  - Sheets v4       │     │  - Gemini API      │
   │  - OAuth 2.0       │     │  - Rate limiting   │
   └────────────────────┘     └────────────────────┘
```

## 文件结构

```
src/
├── App.jsx                    # 主组件 + 全局状态管理（884行，待拆分）
├── main.jsx                   # 入口
├── constants/
│   ├── index.js               # DEFAULT_CONFIG, BUILT_IN_CLIENT_ID
│   └── theme.js               # T (颜色) + F (字体)
├── components/
│   ├── Btn.jsx                # 通用按钮
│   ├── Field.jsx              # 表单输入
│   ├── Lightbox.jsx           # 图片预览
│   ├── Modal.jsx              # 自定义弹窗（AlertModal, ConfirmModal）
│   └── Nav.jsx                # 底部导航栏
├── views/
│   ├── ScanView.jsx           # 📸 拍照/上传 → AI 识别 → 重命名
│   ├── ReviewView.jsx         # ✅ 审核 AI 结果
│   ├── InboxView.jsx          # 📥 Drive 未处理文件
│   ├── LogView.jsx            # 📋 历史记录（数据源：Sheets）
│   ├── DetailView.jsx         # 📝 单条记录详情/编辑
│   ├── ConfigView.jsx         # ⚙️ 设置
│   └── SetupView.jsx          # 🔧 首次配置向导
├── hooks/
│   └── useToast.jsx           # Toast 通知
├── services/
│   ├── google.js              # Google API 封装（Drive + Sheets + OAuth）
│   ├── processor.js           # AI 识别 + 重命名 pipeline
│   ├── storage.js             # IndexedDB + localStorage 抽象层
│   └── swBridge.js            # SW ↔ 主线程通信
├── sw.js                      # Service Worker（后台同步）
└── register-sw.js             # SW 注册逻辑
```

## 数据流

### 1. 拍照 → 上传 → AI 识别 → 重命名

```
用户拍照/选图
  → ScanView 触发 processInboxBackground()
    → processor.js:
      1. 上传到 Drive (google.js)  ←── 并行 ──→  2. AI 识别 (Worker)
      3. 等两者完成
      4. 根据 AI 结果重命名 Drive 文件
      5. 写入 Sheets 记录
      6. 如果 Sheets 失败 → 存入 outbox (localStorage)
    → 返回 liveResults 实时显示
```

### 2. 后台处理（SW）

```
主线程 → sendTokenToSW(token) → SW 获得 API 访问权限
SW 监听 Background Sync 事件
  → 从 IndexedDB 取 pending-uploads 队列
  → 上传 + AI 识别 + 重命名
  → postMessage 通知主线程更新 UI
```

### 3. 数据存储层级

| 数据 | 存储位置 | 生命周期 |
|------|----------|----------|
| 用户配置 | IndexedDB `rr-config` + Drive appDataFolder | 永久，跨设备同步 |
| 小票记录 | Google Sheets | 永久，单一数据源 |
| 本地 receipts | IndexedDB `rr-receipts` | 临时上传缓冲区 |
| 图片文件 | Google Drive | 永久 |
| 图片缓存 | IndexedDB `rr-image-cache` | 本地缓存，可清除 |
| Sheets 失败队列 | localStorage `rr-sheet-outbox-*` | 直到成功重试 |

## 认证流程

```
App 启动
  → tryRestoreSession() （检查 localStorage 缓存的 token）
    → 成功 → 直接使用
    → 失败 → requestAccessToken({ prompt: '' }) （静默刷新）
      → 成功 → 直接使用
      → 失败 → requestAccessToken() （弹出 Google 登录窗口）
```

**Safari 特殊处理：** popup 模式替代 redirect（iOS Safari 限制）。

## 安全模型

### 前端

- **Token 生命周期：** Google OAuth token 缓存在内存 + localStorage，不写入 cookie
- **用户隔离：** IndexedDB key 前缀带用户 ID (`sub` 或 `email`)
- **清除缓存：** 只清本地数据，不退出登录（保留 auth state）

### Worker (Cloudflare)

- **认证：** 目前仅靠 bearer token（内测可接受，上线前需要加用户身份验证）
- **AI 代理：** Worker 持有 Gemini API key，前端不接触
- **CORS：** 限制 `ALLOWED_ORIGIN`

### ⚠️ 上线前必须修复

1. Worker 需要验证调用者身份（Google ID Token 转发）
2. 删除 `/api/debug/gemini` 端点
3. CORS 白名单只留生产域名
4. 配额改用 Durable Objects 实现原子化

## 命名约定

**文件命名格式：** `YYYY-MM-DD_商户名_金额`
- 示例：`2026-03-12_Woolworths_$45.60`
- 待老板确认最终格式

**文件夹结构：**
```
Google Drive/
└── receipt-renamer/      ← 根文件夹
    ├── 2026-03/          ← 按月分文件夹
    │   ├── 2026-03-12_Woolworths_$45.60.jpg
    │   └── ...
    └── _non-receipt/     ← 非小票文件
```

## 已知技术债

1. **App.jsx (884行)** — God Component，包含全局状态管理、认证、处理逻辑、UI。应拆分为 hooks（useAuth, useProcessing, useReceipts）
2. **InboxView + processor.js 逻辑重复** — 两处都有 Drive 文件拉取逻辑
3. **无测试覆盖** — Vitest 配好了但覆盖率低
