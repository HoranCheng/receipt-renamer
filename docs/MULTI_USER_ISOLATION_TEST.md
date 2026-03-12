# Multi-User Isolation Test Plan

## Goal

验证 Receipt Renamer 在两套 Google 账号之间不会串数据：

- 本地缓存隔离
- Drive 文件隔离
- Sheets 记录隔离
- 云端配置隔离

---

## Preconditions

需要两个真实 Google 账号：

- Account A：Horan 主账号
- Account B：测试账号

建议使用：

- 同一台设备
- 同一个浏览器
- 先测正常退出/切换
- 再测不退出直接切换账号

---

## Isolation boundaries to verify

### 1. Local storage / IndexedDB

Expected:

- `rr-config` 应按用户作用域隔离
- `rr-receipts` 上传缓冲区不应跨账号可见
- `rr-image-cache-*` 不应串图
- `rr-pending-uploads-*` 不应串队列

### 2. Google Drive

Expected:

- A 只能看到 A 创建/授权的文件
- B 只能看到 B 创建/授权的文件
- 不能把 A 的图片写进 B 的月目录

### 3. Google Sheets

Expected:

- A 只写 A 的表
- B 只写 B 的表
- 重试 outbox 不应把 A 的记录补写进 B

### 4. Cloud config (appDataFolder)

Expected:

- A 的配置不覆盖 B
- B 的默认目录、sheetId、sheetName 不污染 A

---

## Test matrix

## Case 1 — Fresh login A

1. 清浏览器缓存
2. 登录 Account A
3. 完成 setup
4. 上传 1 张小票
5. 记录：
   - Drive folder
   - Sheet row
   - 本地缓存键

Expected:

- 数据全部写入 A
- 本地 user scope = A.sub 或 A.email

## Case 2 — Sign out then login B

1. 在应用内退出 A
2. 登录 Account B
3. 完成 setup
4. 上传 1 张小票

Expected:

- 看不到 A 的缓存数据
- 新文件写入 B 的 Drive
- 新记录写入 B 的 Sheet
- Config/Folder/Sheet 全为 B

## Case 3 — Re-login A

1. 退出 B
2. 重新登录 A

Expected:

- 能恢复 A 的配置
- 不看到 B 的上传缓冲区
- 不看到 B 的图片缓存

## Case 4 — No sign-out, Google account switched externally

1. 登录 A
2. 不点应用内退出
3. 在 Google account chooser 里切到 B
4. 再次授权/重连

Expected:

- 应用识别用户变化并重新作用域
- 不应继续使用 A 的本地 scope
- 不应把 B 的动作写入 A 的 Sheet

## Case 5 — Failed Sheets write + retry under switched account

1. 登录 A
2. 让 Sheets 写入失败（断网/改错表）
3. 形成 outbox
4. 切换到 B
5. 触发 retrySheetOutbox

Expected:

- A 的 outbox 不能在 B 下被补写
- 如果现状失败，则这是 P0 bug

---

## Pass criteria

全部满足才算通过：

- 无跨账号本地数据可见
- 无跨账号 Drive 文件写入
- 无跨账号 Sheet 行写入
- 无跨账号配置污染
- retry/outbox 不串账号

---

## Current risk assessment

### Low confidence areas

目前最值得重点验的是：

1. `retrySheetOutbox()`
2. 历史 localStorage 迁移逻辑
3. Service Worker 后台队列
4. 用户切换时 `setCurrentUser()` 的时机

---

## Recommendation

这个测试必须在老板最终放开给第二个 Google 账号后再做。

在没实测前，不建议把“多用户完全隔离”写成已验证结论。
