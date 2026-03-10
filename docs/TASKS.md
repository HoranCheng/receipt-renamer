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
| T-013 | 用户重命名文件夹后退出再登录，系统会重新创建文件夹（应检测已有同名文件夹） | P0 | 🔲 Todo |
| T-014 | 电脑端手动同步后看不到有多少个文件要审核 | P1 | 🔲 Todo |

### Feature

| ID | Task | Priority | Status |
|----|------|----------|--------|
| T-015 | 上传与 AI 识别并行：多张照片一边上传一边识别，不要等全部上传完再开始 | P0 | 🔲 Todo |
| T-016 | AI 识别完成后自动写入 Sheets，不需要用户手动点"同步到 Excel" | P0 | 🔲 Todo |
| T-017 | 后台运行：拍完照锁屏后，上传 + AI 识别 + 分类仍在后台继续 | P1 | 🔲 Todo |
| T-018 | 状态恢复：切回 / 重启 PWA 后，恢复之前的处理进度并同步最新状态 | P1 | 🔲 Todo |
| T-019 | AI 识别进度实时反馈：每识别完一张就更新计数（剩余 X 张） | P1 | 🔲 Todo |
| T-020 | 记录界面点击小票名称可查看原始照片（不占用太多本地存储） | P2 | 🔲 Todo |

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
