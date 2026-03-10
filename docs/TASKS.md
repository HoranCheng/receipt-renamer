# TASKS.md — Receipt Renamer

## Project Status: ACTIVE
## Current Version: v0.2.0

---

## Completed (v0.1.0)

| ID | Task | Worker | Status |
|----|------|--------|--------|
| T-001 | Fix AI service (CORS + auth headers) | Tech Lead | ✅ Done |
| T-002 | ESLint + Prettier + cleanup | Tech Lead | ✅ Done |
| T-003 | Vitest + core tests | Tech Lead | ✅ Done |
| T-004 | UI polish + ErrorBoundary | Tech Lead | ✅ Done |
| T-005 | README + docs + LICENSE | Tech Lead | ✅ Done |
| T-006 | PWA manifest + meta tags | Tech Lead | ✅ Done |

## Completed (v0.2.0)

| ID | Task | Worker | Status |
|----|------|--------|--------|
| T-007 | Google OAuth token auto-refresh | Tech Lead | ✅ Done |
| T-008 | Drive file pagination | Tech Lead | ✅ Done |
| T-009 | Receipt detail/edit page | Tech Lead | ✅ Done |
| T-010 | Batch error recovery + retry | Tech Lead | ✅ Done |
| T-011 | PDF file support | Tech Lead | ✅ Done |
| T-012 | Export CSV + data backup | Tech Lead | ✅ Done |

---

## Active (v0.3.0) — 2026-03-11 Horan 提出

### Bug

| ID | Task | Priority | Status |
|----|------|----------|--------|
| T-013 | 用户重命名文件夹后退出再登录，系统会重新创建文件夹（应检测已有同名文件夹） | P0 | ✅ Done |
| T-014 | 电脑端手动同步后看不到有多少个文件要审核 | P1 | ✅ Done |

### Feature

| ID | Task | Priority | Status |
|----|------|----------|--------|
| T-015 | 上传与 AI 识别并行：多张照片一边上传一边识别，不要等全部上传完再开始 | P0 | ✅ Done |
| T-016 | AI 识别完成后自动写入 Sheets，不需要用户手动点"同步到 Excel" | P0 | ✅ Done |
| T-017 | 后台运行：拍完照锁屏后，上传 + AI 识别 + 分类仍在后台继续 | P1 | ✅ Done |
| T-018 | 状态恢复：切回 / 重启 PWA 后，恢复之前的处理进度并同步最新状态 | P1 | ✅ Done |
| T-019 | AI 识别进度实时反馈：每识别完一张就更新计数（剩余 X 张） | P1 | ✅ Done |
| T-020 | 记录界面点击小票名称可查看原始照片（不占用太多本地存储） | P2 | ✅ Done |

### Additional fixes (2026-03-11)

| ID | Task | Priority | Status |
|----|------|----------|--------|
| T-021 | 数据备份设置 UI（实验性，功能待开发） | P2 | 🔲 Pending decision |
| T-022 | deleteFile 使用了 Drive API v2 接口导致删除永远失败 | P0 | ✅ Done |
| T-023 | 命名格式改为「日期 + 分类」，不含商家名和价格 | P1 | ✅ Done |
| T-024 | Service Worker 后台上传 + AI 识别（IndexedDB 队列 + Background Sync） | P1 | ✅ Done |
| T-025 | 登录优化：Google API 加载不阻塞 UI，静默刷新 token | P1 | ✅ Done |

---

## Backlog (v0.4.0+)

- [ ] 月度/周度消费报表
- [ ] 商户别名学习（merchant-aliases）
- [ ] 多语言支持（中/英）
- [ ] 多币种支持
- [ ] 下拉刷新
- [ ] Web Push 通知
- [ ] 草稿学习沙箱
- [ ] 失败原因标签化
