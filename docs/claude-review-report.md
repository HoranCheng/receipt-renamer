# Receipt Renamer — Claude Opus 4.6 全面审核报告

审核时间：2026-03-11
审核范围：全部 src/ 源文件 + public/sw.js

---

## 一、发现的 Bug（确认级）

### BUG-1：ReviewView 的 `load` 函数名遮蔽了 storage.js 的 `load` 导入
**严重度：P0 — 实际功能 bug**
**文件：`src/views/ReviewView.jsx` 第 155 行**

```js
import { store, load } from '../services/storage';
// ...
const load = async () => {  // ← 这里的 load 遮蔽了 import 的 load
```

ReviewView 内部定义了一个 `load` 函数（加载 Drive 文件列表），但同时从 `storage.js` 导入了 `load`。函数声明 **遮蔽了 import**，导致：
- `handleDelete` 中调用的 `load('rr-non-receipt-alerts', [])` 实际调用的是 **ReviewView 自己的 `load()` 函数**（加载 Drive 文件），而不是 storage.js 的用户隔离 `load()`
- 这意味着刚修好的 P0-1 用户隔离 **在 ReviewView 的删除路径上实际上是坏的**

**修复建议：** 将 ReviewView 的 `load` 函数重命名为 `loadFiles` 或 `fetchFiles`

---

### BUG-2：InboxView 的文件命名与 processor.js 不一致
**严重度：P1**
**文件：`src/views/InboxView.jsx` 第 87-91 行**

```js
const newName = `${safeDate} ${safeCategory} ${safeAmount}.${ext}`;
```

而 `processor.js` 使用：
```js
const newName = `${safeDate} ${safeCategory}.${ext}`;
```

InboxView 的手动处理包含金额，但 processor.js 的自动处理不包含。两条路径产出不同格式的文件名。

---

### BUG-3：InboxView header 仍显示旧的英文 fallback
**严重度：P2**
**文件：`src/views/InboxView.jsx` 第 171 行**

```js
sub={`${config.inboxFolder || '00_inbox'} · ${files.length} 个文件`}
```

上一轮修了 folder 查找的 fallback，但 **header 显示** 仍然用 `'00_inbox'` 作 fallback，不一致。

---

### BUG-4：LogView export 始终导出本地数据，不尊重当前 syncSource
**严重度：P2**
**文件：`src/views/LogView.jsx` 第 290-291 行**

```js
onClick={() => { exportCSV(receipts); ... }}  // ← 始终用 receipts（本地）
onClick={() => { exportJSON(receipts); ... }}  // ← 始终用 receipts（本地）
```

当用户切换到"云端记录"时，导出的仍然是本地数据 `receipts`，而不是 `activeReceipts`。

---

### BUG-5：handleReset 清除 IndexedDB 时用了旧的固定库名
**严重度：P2**
**文件：`src/App.jsx` 第 485 行**

```js
const dbs = ['rr-image-cache', 'rr-pending-uploads', 'rr-sw-queue'];
dbs.forEach(name => indexedDB.deleteDatabase(name));
```

但实际 imageCache 和 pendingQueue 使用的是 **用户作用域的库名**：`rr-image-cache::${userId}` 和 `rr-pending-uploads::${userId}`。`handleReset` 删的是不存在的固定名库。

---

### BUG-6：processor.js 的命名还是用 category 而不是 merchant
**严重度：P1 — 与项目决定不一致**

根据之前的决定，文件应该用 `日期 + 商家 + 金额` 命名，但 processor.js 仍在用：
```js
const safeCategory = safeName(data.category || 'Other');
const newName = `${safeDate} ${safeCategory}.${ext}`;
```

ReviewView 也一样。这与 commit 信息说的 "naming unified to merchant+amount" 不匹配。

---

### BUG-7：Sheets outbox 的 retry 用了裸 localStorage 而非 storage.js
**严重度：P2**
**文件：`src/services/processor.js` 第 43-60 行**

`_getOutboxKey` 和 `_logSheetFailure` / `retrySheetOutbox` 直接用 `localStorage`。虽然它们手动做了 user-scoping，但跳过了 `storage.js` 的 migration 逻辑。

---

## 二、安全问题

### SEC-1：Drive 查询参数未转义
**严重度：P1**
**文件：`src/services/google.js` 多处**

```js
q: `name='${ROOT_FOLDER_NAME}' ...`
q: `name='${oldName}' ...`
q: `name='${name}' ...`
```

如果 folder 名称包含单引号（如 `Tom's Receipts`），Drive API 查询会语法错误。虽然不是 SQL 注入，但会导致功能失败。

**修复建议：** 转义单引号：`name.replace(/'/g, "\\'")`

---

### SEC-2：SW 的 `rr-sw-queue` 仍未按用户隔离
GPT 上轮已指出，本轮仍未修复。Service Worker 中的 IndexedDB `rr-sw-queue` 是全局的，多用户共享设备时可能泄露或错处理另一用户的文件。

---

### SEC-3：cloud config 存在 root folder 内，不在 appDataFolder
**文件：`src/services/google.js`**

`rr-config.json` 保存在 `Receipt Renamer` 文件夹内，用户可以在 Drive 中直接看到和修改。之前的决定是用 `appDataFolder`（应用数据目录），但实际没有实现。

---

## 三、UI/UX 问题

### UX-1：ReviewView 删除确认用 `window.confirm`
**文件：`src/views/ReviewView.jsx` 第 483, 530 行**

虽然部分 alert 已改成 Toast，但删除确认仍用系统 confirm 弹窗。移动端体验不一致。

---

### UX-2：InboxView 仍然用 `alert()` 处理错误
**文件：`src/views/InboxView.jsx` 第 44 行**

没有 showToast prop 传入。

---

### UX-3：ConfigView 和 SetupView 仍然用 `alert()` 
ConfigView 重命名失败（242行）、创建sheet失败（328行）
SetupView 连接失败（70行）、创建sheet失败（159行）
都没有 showToast prop。

---

### UX-4：LogView 搜索框 placeholder 是"搜索商户"但实际也搜分类
逻辑正确但文案不准。

---

### UX-5：没有 pull-to-refresh
移动端常见交互模式。ScanView 和 LogView 都可以受益。

---

### UX-6：ReviewView 编辑时日期字段 `type="date"` 在 iOS Safari 上可能不显示日历选择器
iOS Safari 对 input type="date" 的支持取决于 CSS 样式。暗色主题下选择器可能不可见。

---

## 四、架构问题

### ARCH-1：`App.jsx` 是 God Component (~750 行)
承担了初始化、auth、config sync、conflict modal、SW bridge、processing status、toast、routing、非小票 modal 等所有职责。

---

### ARCH-2：InboxView 与 processor.js 有大量重复逻辑
InboxView 的 `processFile` 基本就是 processor.js 的 `_processOneFile` 的简化版，但有不同的命名逻辑、不同的 Sheets 写入处理、不同的结果格式。两套处理路径很容易 drift。

---

### ARCH-3：receipts 和 sheetRecords 是两套独立数据源
LogView 有本地 receipts 和云端 sheetRecords，但没有真正的同步机制——只有一个粗糙的 "发现本地有但云端没有就提示合并" 的方案。

---

### ARCH-4：processor.js 使用模块级全局变量
`_queue`, `_running`, `_stats`, `_statusCallback`, `_receiptCallback`, `_configRef` 都是模块级变量。HMR 时状态丢失，也不利于测试。

---

## 五、评分

| 维度 | 分数 | 说明 |
|------|------|------|
| 代码安全性 | 6.5/10 | AI key 保护到位，但隔离有遗漏（BUG-1 遮蔽、SW 未隔离） |
| 使用体验 | 7/10 | 主流程顺畅，错误处理未完全收口 |
| UI 合理性 | 7.5/10 | 视觉一致性好，暗色主题专业 |
| UI 排布 | 7/10 | 导航清晰，ReviewView/ConfigView 信息密度偏高 |
| 代码架构 | 5.5/10 | 服务层已拆分，但 God Component + 重复逻辑 + 全局状态 |
| **总分** | **33.5/50** | |

---

## 六、优先修复建议

### 必须立即修（本轮）
1. **BUG-1** ReviewView `load` 遮蔽 → 重命名为 `loadFiles`
2. **BUG-5** handleReset 清错 IndexedDB 名
3. **BUG-4** LogView export 用 activeReceipts
4. **SEC-1** Drive 查询转义单引号

### 建议尽快修
5. **BUG-6** 命名统一（processor.js + ReviewView）
6. **BUG-2** InboxView 命名对齐
7. **BUG-3** InboxView header fallback
8. **UX-2/3** 传 showToast 给 InboxView/ConfigView/SetupView

### 后续迭代
9. **SEC-2** SW queue 用户隔离
10. **ARCH-1** App.jsx 拆分 hooks
11. **ARCH-2** 统一 InboxView/processor.js 处理逻辑
