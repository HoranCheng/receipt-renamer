# Receipt Renamer — 小票智能管家

## 项目概述
移动端优先的 Web App，帮助用户自动处理 Google Drive 中的收据：AI 识别 → 智能命名 → 归档 → Sheets 同步。

## 当前状态
- **阶段**: v0.1.0 — 已从原型拆分为模块化结构，工程化配置完成
- **可工作功能**: Google OAuth 登录、Drive 文件读取/重命名/移动、AI 识别（Claude API）、Sheets 同步、拍照扫描、批量处理
- **架构**: 模块化 React 组件 + 服务层，含 ESLint/Prettier、Vitest 测试、ErrorBoundary

## 技术栈
- **前端**: React 18 + Vite，纯 CSS-in-JS（无框架），移动端优先
- **AI**: Anthropic Claude API（`claude-sonnet-4-20250514`），视觉识别收据图片
- **后端/存储**: 无自有后端，用户数据全部在用户自己的 Google 账号中
- **Google APIs**: Drive API v3, Sheets API v4, OAuth 2.0（用户提供自己的 Client ID）
- **部署目标**: Vercel / Netlify 静态部署

## 架构设计

### 数据流
```
用户 Google Drive 00_inbox/
  → 前端读取文件列表
  → 下载图片为 base64
  → Claude API 视觉识别（提取 date/merchant/amount/category）
  → 重命名为 "YYYY-MM-DD Category Merchant.ext"
  → 高置信(>=70%) → 10_validated/ | 低置信 → 20_review_needed/
  → 写入 Google Sheets receipt_index 表
```

### 核心模块（待从原型拆分）
- `src/services/google.js` — Google OAuth + Drive + Sheets API 封装
- `src/services/ai.js` — Claude API 调用，收据识别 prompt
- `src/services/storage.js` — 本地持久化（IndexedDB 或 localStorage）
- `src/components/` — UI 组件
- `src/views/` — 5个页面：Dashboard, Inbox, Scan, Log, Settings

### AI Prompt 关键规则
- 日期优先澳洲格式 DD/MM/YYYY，输出 YYYY-MM-DD
- 商户名清洗：去除 ABN, PTY LTD, ACN, TAX INVOICE
- 14 种分类：Grocery, Dining, Fuel, Medical, Hardware & Garden, Outdoor & Camping, Transport, Utilities, Entertainment, Shopping, Education, Insurance, Subscription, Other
- 输出纯 JSON，无 markdown

## 文件夹约定
```
00_inbox/          — 用户放入待处理收据
10_validated/      — 高置信度自动归档
20_review_needed/  — 低置信度待人工审核
```

## 开发命令
```bash
npm install          # 安装依赖
npm run dev          # 启动开发服务器
npm run build        # 生产构建
```

## 下一步开发计划（按优先级）

### P0 — 项目工程化
- [x] 从 `src/app-prototype.jsx` 拆分为模块化结构
- [x] 配置 Vite + React
- [x] 环境变量管理（.env）
- [x] 添加 ESLint + Prettier
- [x] ErrorBoundary 错误边界
- [x] AI 服务 CORS 代理 + 认证头修复
- [x] Vitest 单元测试
- [x] PWA manifest + service worker

### P1 — 核心功能完善
- [ ] Google OAuth token 自动刷新（当前 token 过期后需重新授权）
- [ ] Drive 文件分页加载（当前限制 50 个）
- [ ] PDF 文件支持（当前只支持图片，需要 PDF 转图片或直接发给 Claude）
- [ ] 批量处理的错误恢复和断点续传
- [ ] 处理结果的详情页（点击记录查看原图、编辑、重新分类）

### P2 — 用户体验
- [ ] PWA 支持（离线缓存、添加到主屏幕）
- [ ] 下拉刷新
- [ ] 处理进度推送通知（Web Push API）
- [ ] 月度/周度消费报表
- [ ] 导出 CSV

### P3 — 进阶功能（对应原 V2 计划）
- [ ] 商户别名学习（merchant-aliases）：同一商户不同 OCR 结果映射到标准名
- [ ] 草稿学习沙箱：新商户/分类 3 次验证后提升到主库
- [ ] 失败原因标签化：LOW_CONFIDENCE, UNKNOWN_MERCHANT, AMOUNT_AMBIGUOUS
- [ ] 多语言支持（中/英）
- [ ] 多币种支持

## 注意事项
- Google API 的 CORS 限制：生产部署时需在 Google Cloud Console 配置授权域名
- Claude API 在 artifact 环境中免认证，独立部署时需要用户提供 API key 或搭建代理
- 收据图片通常较大，base64 编码后可能超过 Claude API 的 payload 限制，需要压缩
- 移动端相机拍摄的 HEIC 格式需要转换

## 历史背景
这个项目从一个 Node.js + Docker 的服务器端程序演进而来，原版使用 Tesseract/PaddleOCR + Gemini LLM + 正则表达式。
移动端重构用 Claude 视觉 API 替代了整个 OCR 管线，大幅简化了架构。
详细的 V1/V2 设计文档见 `docs/project-outline.md`。
