# TASKS.md — Receipt Renamer

## Project Status: ACTIVE
## Current Version: v0.3.0

---

## Completed (v0.1.0)

| ID | Task | Status |
|----|------|--------|
| T-001 | Fix AI service (CORS + auth headers) | ✅ |
| T-002 | ESLint + Prettier + cleanup | ✅ |
| T-003 | Vitest + core tests | ✅ |
| T-004 | UI polish + ErrorBoundary | ✅ |
| T-005 | README + docs + LICENSE | ✅ |
| T-006 | PWA manifest + meta tags | ✅ |

## Completed (v0.2.0)

| ID | Task | Status |
|----|------|--------|
| T-007 | Google OAuth token auto-refresh | ✅ |
| T-008 | Drive file pagination | ✅ |
| T-009 | Receipt detail/edit page | ✅ |
| T-010 | Batch error recovery + retry | ✅ |
| T-011 | PDF file support | ✅ |
| T-012 | Export CSV + data backup | ✅ |

## Completed (v0.3.0)

| ID | Task | Status |
|----|------|--------|
| T-013 | 文件夹重复创建 bug | ✅ |
| T-014 | 电脑端手动同步后看不到审核数量 | ✅ |
| T-015 | 上传与 AI 识别并行 | ✅ |
| T-016 | AI 识别完自动写入 Sheets | ✅ |
| T-017 | 后台运行（SW + Background Sync）| ✅ |
| T-018 | 状态恢复 | ✅ |
| T-019 | AI 识别进度实时反馈 | ✅ |
| T-020 | 点击小票查看原图 | ✅ |
| T-022 | deleteFile Drive API v2→v3 修复 | ✅ |
| T-023 | 命名格式统一 | ✅ (待老板确认最终格式) |
| T-024 | SW 后台上传 + IndexedDB 队列 | ✅ |
| T-025 | 登录优化：非阻塞加载 + 静默刷新 | ✅ |
| T-026 | Safari 登录流程修复 | ✅ (待实测验收) |
| T-027 | LogView 单一数据源（Sheets only）| ✅ |
| T-028 | 云端配置同步（appDataFolder）| ✅ |
| T-029 | 清除缓存不退出登录 | ✅ |
| T-030 | Lightbox 安全区 + 删除按钮 | ✅ |
| T-031 | 首次登录空白页修复 | ✅ |
| T-032 | Sheets 404 容错 | ✅ |
| T-033 | 安全审核报告从 git 移除 | ✅ |
| T-034 | GPT Round 3 — onReceiptProcessed 未连线 | ✅ |
| T-035 | GPT Round 3 — retrySheetOutbox 硬编码修复 | ✅ |
| T-036 | alert/confirm 替换为自定义 Modal | ✅ |
| T-037 | 彻底删除全部数据（双重确认 + 双5秒等待）| ✅ |
| T-038 | 本地 receipts 改为上传缓冲区 | ✅ |

---

## Active (v0.4.0) — 老板指导意见 2026-03-12

### 待老板确认

| ID | Task | Priority | Status |
|----|------|----------|--------|
| T-039 | 文件命名最终格式 | P0 | ⏳ 等老板选方案 |
| T-021 | 备份功能方案 | P1 | ⏳ 等老板选方案 |

### 待执行

| ID | Task | Priority | Status |
|----|------|----------|--------|
| T-040 | 多用户数据隔离测试 | P0 | ⏳ 需第二个测试账号 |
| T-041 | App.jsx 拆分（God Component）| P1 | 🔲 |
| T-042 | InboxView + processor.js 逻辑统一 | P2 | 🔲 |

### 文档

| ID | Task | Priority | Status |
|----|------|----------|--------|
| D-001 | Drive API 注入防护详细说明 | P0 | ✅ SECURITY.md |
| D-002 | 清缓存不退出登录机制说明 | P0 | ✅ SECURITY.md |
| D-003 | ARCHITECTURE.md | P1 | ✅ |
| D-004 | SECURITY.md | P1 | ✅ |
| D-005 | 多用户隔离测试计划 | P1 | ✅ MULTI_USER_ISOLATION_TEST.md |
| D-006 | 命名方案比较 + 建议 | P1 | ✅ NAMING_OPTIONS.md |

---

## 正式上线前必须完成（安全项）

| ID | Task | 需要 | Status |
|----|------|------|--------|
| C-1 | Worker 用户身份验证 | Worker 源码 | 🔴 未落地 |
| C-2 | 删除 /api/debug/gemini | Worker 源码 | 🔴 未落地 |
| C-3 | CORS 域名白名单 | Worker 源码 | 🔴 未落地 |
| C-4 | 配额原子化（Durable Objects）| Worker 源码 + 付费计划 | 🔴 未落地 |

内测期风险评估：低（仅内部使用），上线前必须修。

---

## Backlog (v0.5.0+)

- [ ] 月度/周度消费报表
- [ ] 商户别名学习
- [ ] 多语言支持
- [ ] 多币种支持
- [ ] 下拉刷新
- [ ] Web Push 通知
- [ ] 失败原因标签化
