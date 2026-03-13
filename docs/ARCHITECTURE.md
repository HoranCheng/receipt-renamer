# Architecture — Receipt Renamer (内测 Beta)

> 最后更新：2026-03-14 · 基于当前代码实况，非设计愿景

## Overview

Receipt Renamer 是一个移动优先的 PWA，通过 Google Drive API 管理小票照片/PDF，借助 AI 自动识别内容并重命名归档。

**核心链路：** 拍照/选图 → 上传到 Drive → AI 识别 → 命名(`日期_分类_序号`) → 分流(高置信→已存档 / 低置信→待确认) → Sheets 记录

```
┌──────────────────────────────────────────────────┐
│  Browser (PWA)                                    │
│                                                   │
│  ┌─────────┐ ┌──────────┐ ┌───────┐ ┌────────┐  │
│  │ScanView  │ │ReviewView│ │LogView│ │Config  │  │
│  │(主入口)  │ │(审核)    │ │(历史) │ │View    │  │
│  └────┬─────┘ └────┬─────┘ └───┬───┘ └───┬────┘  │
│       │             │           │          │       │
│  ┌────┴─────────────┴───────────┴──────────┴───┐  │
│  │            App.jsx (State Hub)               │  │
│  └────┬──────────┬──────────┬──────────────────┘  │
│       │          │          │                      │
│  ┌────┴───┐ ┌───┴──────┐ ┌┴──────────┐           │
│  │google  │ │processor │ │storage/   │           │
│  │.js     │ │.js       │ │pending    │           │
│  │(Drive/ │ │(识别+    │ │Queue/     │           │
│  │Sheets/ │ │命名+     │ │imageCache │           │
│  │OAuth)  │ │分流)     │ │(IDB+LS)  │           │
│  └────┬───┘ └───┬──────┘ └───────────┘           │
│       │         │                                  │
│  ┌────┴─────────┴──────┐                          │
│  │   Service Worker     │                          │
│  │  (SW ↔ 主线程通信)   │                          │
│  └────┬─────────────────┘                          │
└───────┼────────────────────────────────────────────┘
        │
   ┌────┴──────────────┐     ┌─────────────────────┐
   │  Google APIs       │     │  Cloudflare Worker   │
   │  - Drive v3        │     │  receipt-proxy       │
   │  - Sheets v4       │     │  - Gemini 2.0 Flash  │
   │  - OAuth 2.0       │     │  - 用户日限额 100/天  │
   └────────────────────┘     │  - CORS 白名单       │
                              └─────────────────────┘
```

## 文件结构

```
src/
├── App.jsx                    # 主组件 + 全局状态（认证、配置同步、路由）
├── main.jsx                   # 入口 + SW 注册
├── constants/
│   ├── index.js               # DEFAULT_CONFIG、CATEGORIES、CAT_ICON/CLR、SCOPES
│   └── theme.js               # T (颜色) + F (字体)
├── components/
│   ├── Btn.jsx                # 通用按钮
│   ├── Field.jsx              # 表单输入
│   ├── Header.jsx             # 页面标题
│   ├── Lightbox.jsx           # 图片预览（pinch-to-zoom）
│   ├── Modal.jsx              # AlertModal + ConfirmModal（替代原生 alert/confirm）
│   ├── Nav.jsx                # 底部导航栏
│   ├── RobotScene.jsx         # 动画吉祥物
│   └── StatusDot.jsx          # 状态指示灯
├── views/
│   ├── ScanView.jsx           # 📸 拍照/上传 + 上传队列（主入口）
│   ├── ReviewView.jsx         # ✅ 审核低置信度结果
│   ├── InboxView.jsx          # 📥 Drive 收件箱（旧入口，待统一）
│   ├── LogView.jsx            # 📋 历史记录（来源：Sheets + 本地缓存）
│   ├── DetailView.jsx         # 📝 单条记录详情/编辑
│   ├── ConfigView.jsx         # ⚙️ 设置 + 核删除
│   └── SetupView.jsx          # 🔧 首次配置向导
├── hooks/
│   └── useToast.jsx           # Toast 通知
├── services/
│   ├── ai.js                  # AI 代理调用（仅 proxy 模式，不直连模型）
│   ├── google.js              # Google API 封装（Drive + Sheets + OAuth）
│   ├── processor.js           # 主处理链：AI 识别 → 命名 → 分流 → Sheets
│   ├── storage.js             # localStorage 封装（用户隔离 key）
│   ├── pendingQueue.js        # IndexedDB 持久化上传队列
│   ├── imageCache.js          # IndexedDB 图片缓存
│   └── swBridge.js            # SW ↔ 主线程通信
├── utils/
│   └── naming.js              # 文件命名规则（日期_分类_序号）
├── sw.js                      # Service Worker
└── register-sw.js             # SW 注册
```

## AI 识别链路

```
前端 → ai.js → POST /api/analyze → Cloudflare Worker (receipt-proxy)
                                      ↓
                              Gemini 2.0 Flash API
                                      ↓
                              JSON 结构化响应
                                      ↓
                              返回给前端（已剥离 _quota）
```

**前端不持有任何 AI API key。** 所有 AI 调用通过 `VITE_AI_PROXY_URL` 指向 Cloudflare Worker。

Worker 端功能：
- Gemini 2.0 Flash 调用（支持图片 + PDF）
- 用户级日限额（100 张/天，KV 存储）
- CORS 白名单
- 结构化 prompt → JSON 响应

## 命名规则

**当前格式：** `YYYY-MM-DD_category_seq.ext`

示例：
- `2026-03-12_grocery_1.jpg`
- `2026-03-12_grocery_2.jpg`
- `2026-03-12_dining_1.pdf`

规则：
- 日期：来自 AI 识别结果
- 分类：14 种预定义类别的 slug（grocery, dining, fuel, medical 等）
- 序号：同日期+同分类下自动递增，从现有文件名播种避免冲突
- 实现：`src/utils/naming.js`（`buildReceiptName` + `seedNameCounters`）

## 置信度分流

```
AI 识别结果
  ├── is_receipt = false && 无数据 → 移入待确认 + 标记 not_receipt
  ├── is_receipt = false && 有数据 → 强制降为 review（置信度 cap 35%）
  ├── confidence ≥ 70 → 已存档（自动重命名 + Sheets 写入）
  └── confidence < 70 → 待确认（等人工审核）
```

**关键设计：** AI 说"不是小票"但提取到了交易数据时，不丢弃，而是降级送审。

## 数据存储

| 数据 | 存储位置 | 角色 |
|------|----------|------|
| 小票文件 | Google Drive（按文件夹分类） | **真源** |
| 消费记录 | Google Sheets `receipt_index` | **真源** |
| 用户配置 | Drive `rr-config.json` + 本地 LS | 云端同步，本地缓存 |
| 上传队列 | IndexedDB `rr-pending-uploads` | 持久化，app 重启恢复 |
| 图片缓存 | IndexedDB `rr-image-cache` | 纯缓存，可清除 |
| Sheets 失败队列 | localStorage `rr-sheets-outbox::*` | 直到重试成功 |
| 处理进度 | IDB `rr-proc-progress` | 恢复中断的批处理 |

**Drive 文件夹结构：**
```
Google Drive/
├── 小票待处理/      # inbox — 新上传文件落地
├── 小票已存档/      # validated — 高置信度已确认
└── 小票待确认/      # review — 低置信度等人工审核
```

## 配置同步

```
App 启动 → 检查 Drive 是否有 rr-config.json
  ├── 有且本地是新设备 → 用云端配置
  ├── 有且本地已自定义 → 弹窗让用户选"用云端的 / 用本地的"
  └── 无 → 用本地配置，后续自动上传到 Drive
```

**⚠️ 已知问题：** `saveCloudConfig()` 失败时只 `console.warn`，用户无感知。

## 认证

```
App 启动
  → tryRestoreSession()（检查 LS 缓存 token）
    → 成功 → 直接用
    → 失败 → requestAccessToken({ prompt: '' })（静默刷新）
      → 成功 → 直接用
      → 失败 → requestAccessToken()（弹出 Google 登录窗口）
```

- Token 在内存 + localStorage，不写 cookie
- 用户隔离：所有 IDB/LS key 带 `rr-current-user` 前缀
- Safari 用 popup 模式替代 redirect

## 安全模型

### 前端
- 不持有任何 AI API key
- Google OAuth token 仅用于 Drive/Sheets API
- 核删除：双确认 + 双 5 秒倒计时

### Worker (Cloudflare)
- 持有 Gemini API key
- 用户日限额 100 张/天
- CORS 限制 `ALLOWED_ORIGIN`

### ⚠️ 上线前安全待办
1. Worker 验证调用者身份（Google ID Token 转发）
2. 删除 debug 端点
3. CORS 白名单只留生产域名
4. 配额改 Durable Objects 实现原子化

## 测试

| 测试文件 | 覆盖范围 | 数量 |
|----------|----------|------|
| `ai.test.js` | proxy 调用、输入校验、错误处理、429 | 12 |
| `naming.test.js` | 命名格式、序号、播种、slug | 18 |
| `processor-recognition.test.js` | 识别分流、false negative、Sheets 重试、outbox | 33 |
| `constants/index.test.js` | 类别、配置、Google API 常量 | 14 |

总计 77 tests，5 files，全绿。

## 已知架构问题

1. **双处理链：** `processor.js`（新，完整容错）与 `InboxView.jsx`（旧，简化版）并存，逻辑会分叉
2. **App.jsx 体量大：** 全局状态、认证、配置同步、UI 路由都在一个文件
3. **Log 页编辑语义模糊：** 展示来自 Sheets，但编辑/删除只改本地
4. **配置同步失败静默：** 用户以为跨设备一致，实际可能失败
