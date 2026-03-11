# Receipt Renamer 第二轮复核回复

复核文件：
- `src/views/ReviewView.jsx`
- `src/services/processor.js`
- `src/services/ai.js`
- `src/App.jsx`

基于我上一轮报告中的 P0 / P1 问题，我对本轮修改的判断如下。

---

## 一、总体结论

**结论：基本同意本轮修复，P0-1 / P0-2 / P0-3 三个核心问题已基本解决。**

其中：
- `ReviewView` 来源文件夹 bug：**已修复到位**
- 用户隔离存储（本轮涉及的 `rr-proc-progress`、`rr-non-receipt-alerts`）：**已修复到位**
- AI 配额 UID 来源不一致：**已修复到位**
- `alert → Toast`：**部分完成，方向正确，但尚未收口**

不过我也发现了**几个遗漏/新增问题**，其中有 1 个我认为值得尽快修：
- `App.jsx` 对 `getSavedProgress()` 的调用少了 `await`，会把 Promise 当成状态对象使用，属于真实 bug
- `ReviewView.jsx` 删除后清理 `rr-non-receipt-alerts` 时，**仍然直接操作了裸 `localStorage`**，把刚修好的 scoped storage 又绕开了一次
- `App.jsx` 的 `handleReconnect()` 仍然在用 `alert()`，说明 Toast 收口尚未完成

---

## 二、逐项复核

### 1) P0-2 ReviewView 来源文件夹 bug

### 结论：**修复正确，认可**

我上一轮指出的问题是：
- Review 页同时展示来自 `inbox` 和 `review` 的文件
- 但 approve 时固定按 `reviewFolderId` 去 move
- 导致来自 `inbox` 的文件可能 move 失败

本轮关键改动：

#### `load()` 中为文件标记来源
```js
const enrichReview = reviewResult.files.map((f) => ({ ...f, aiData, source: 'review' }));
const enrichInbox = inboxResult.files.map((f) => ({ ...f, aiData, source: 'inbox' }));
```

#### `handleEdit()` 中保留来源
```js
source: file.source || 'review'
```

#### `handleApprove()` 中按来源选择 source folder
```js
const sourceFolderId = editing.source === 'inbox' ? inboxFolderId : reviewFolderId;
await renameAndMoveFile(editing.fileId, newName, validFolderId, sourceFolderId);
```

这正好命中了我之前提出的问题，逻辑闭环是成立的。

**评价：这项修复我同意通过。**

---

### 2) P0-1 统一用户隔离存储

### 结论：**本轮承诺范围内已修复，认可**

我上一轮主要点名的是：
- `rr-proc-progress`
- `rr-non-receipt-alerts`
- `App.jsx` 对 `rr-non-receipt-alerts` 的读取

本轮看到：

#### `processor.js`
```js
store('rr-proc-progress', { ..._stats, updatedAt: Date.now() })
load('rr-proc-progress', null)
store('rr-proc-progress', null)
```

以及：
```js
const existing = await load('rr-non-receipt-alerts', []);
...
await store('rr-non-receipt-alerts', existing);
```

#### `App.jsx`
```js
const alerts = await load('rr-non-receipt-alerts', []);
```

这说明**我上一轮明确指出的两个关键未隔离 key，已经切回了 `storage.js` 的 user-scoped 封装层**。就这次修复目标而言，这是有效修复。

不过有一个**遗漏点**：

#### `ReviewView.jsx` 删除文件后，仍然直接操作裸 `localStorage`
```js
const key = 'rr-non-receipt-alerts';
const alerts = JSON.parse(localStorage.getItem(key) || '[]');
const updated = alerts.filter(a => a.fileId !== fileId);
localStorage.setItem(key, JSON.stringify(updated));
```

这段代码会绕开 `storage.js`，导致：
- 当前登录用户的 scoped alert 数据**不一定真的被清掉**
- 如果本地还残留旧版裸 key，反而会清错位置

所以我的判断是：
- **主修复已成立**
- 但 **`ReviewView.handleDelete()` 这里还需要补一刀**，改成 `load/store('rr-non-receipt-alerts')`

**评价：同意本项修复，但建议补上 ReviewView 的遗漏。**

---

### 3) P0-3 统一 AI 配额 UID

### 结论：**修复正确，认可**

上一轮问题是：
- `ai.js` / `ScanView.jsx` 读取 `receipt_google_uid`
- 但项目其余部分使用 `rr-current-user`
- 结果可能导致 quota 统计落到 anonymous 或出现多套身份源

本轮 `ai.js` 已变成：
```js
const uid = localStorage.getItem('rr-current-user') || 'anonymous';
```

我复核的四个关键文件里，`ai.js` 已统一到 `rr-current-user`。从本轮描述看，`ScanView.jsx` 也同步改了。

同时 `App.jsx` 在登录成功后：
```js
if (googleProfile?.sub) setCurrentUser(googleProfile.sub);
else if (googleProfile?.email) setCurrentUser(googleProfile.email);
```

这说明：
- canonical user id 的写入来源已收敛
- AI 请求 UID 读取也已收敛

**评价：这项修复我同意通过。**

---

### 4) P1-2 alert → Toast

### 结论：**部分完成，方向正确，但不能算彻底完成**

本轮已完成的部分我认可：
- `ReviewView.jsx` 的加载失败/登录过期/操作失败/删除失败 已改 `showToast`
- 根据说明，`ScanView.jsx` 文件过大/类型不支持 也已改 `showToast`

但我在本次复核文件里仍然看到：

#### `App.jsx > handleReconnect()`
```js
alert('连接失败：' + (e.message || JSON.stringify(e)))
```

#### `App.jsx > handleReset()`
```js
if (!confirm('确定要清除所有设置和记录吗？')) return;
```

所以本轮更准确的判断应该是：
- **Review 相关错误提示改善明显，体验比上一轮好**
- **但全局交互层面还没有统一**

`confirm()` 我可以接受继续保留一段时间，因为删除/清空类动作确实常需要明确确认；
但 `alert()` 建议继续收口，不然交互风格还是会“应用内 Toast + 系统弹窗”混用。

**评价：建议继续调整，但不影响本轮 P0 通过。**

---

## 三、我发现的遗漏 / 新问题

### 问题 A：`App.jsx` 里 `getSavedProgress()` 调用方式有 bug

这是本轮我认为**最值得尽快修**的问题。

#### 当前代码 1
```js
const savedProgress = getSavedProgress();
if (savedProgress) {
  setProcStatus({ ...savedProgress, processing: false, resumed: true });
}
```

#### 当前代码 2
```js
const saved = getSavedProgress();
if (saved && saved.processing) {
  triggerProcessing();
}
```

但 `processor.js` 里的定义是：
```js
export async function getSavedProgress() {
  ...
}
```

也就是说它返回的是 **Promise**，这里少了 `await`。

影响：
- 第一处会把 Promise 展开成对象，结果不可预期
- 第二处 `saved.processing` 实际读的是 Promise 上不存在的属性，逻辑永远不对
- T-018 / T-017 的恢复逻辑会失真，可能表现为“恢复状态不显示”或“可见性恢复时不按预期触发”

#### 建议修法
在异步上下文里改成：
```js
const savedProgress = await getSavedProgress();
```
以及：
```js
const saved = await getSavedProgress();
if (saved?.processing) triggerProcessing();
```

**严重度判断：P1（接近功能 bug）**

---

### 问题 B：`ReviewView.handleDelete()` 仍绕过 scoped storage

上面已经提过一次，这里单列出来，因为它和本轮目标直接相关。

#### 当前代码
```js
const key = 'rr-non-receipt-alerts';
const alerts = JSON.parse(localStorage.getItem(key) || '[]');
...
localStorage.setItem(key, JSON.stringify(updated));
```

建议改成：
- `await load('rr-non-receipt-alerts', [])`
- `await store('rr-non-receipt-alerts', updated)`

**严重度判断：P1**

---

### 问题 C：`ReviewView` 的 approve 命名仍然是“日期 + 分类”

#### 当前代码
```js
const safeCategory = (d.category || 'Other').replace(...)
const newName = `${safeDate} ${safeCategory}.${ext}`
```

这个不是新 bug，但我确认它**仍然没有变**。

不过因为你们已经明确说明：
- 用户要求保留“日期 + 分类”格式
- 这项不作为本轮整改目标

那我这次就**不把它继续作为阻塞项**。只是建议后续至少抽成统一 helper，避免 `processor.js` 和 `ReviewView.jsx` 两边各写一套命名逻辑。

**严重度判断：非阻塞，产品决策项**

---

## 四、最终评价

我的最终评价是：

### **结论：同意本轮整改结果，但建议在合并/宣告完成前再补 2 个小修。**

我认可的部分：
- P0-2 修得对，而且修到了根因
- P0-1 在本轮声明范围内基本修到位
- P0-3 已统一到单一 UID 来源
- 整体代码方向比上一轮更一致了

我建议补的两项：
1. **修 `App.jsx` 中 `getSavedProgress()` 漏 `await` 的问题**
2. **修 `ReviewView.jsx` 删除时对 `rr-non-receipt-alerts` 的裸 `localStorage` 操作**

如果这两项也补掉，我会更愿意给出“本轮整改可以关闭”的判断。

---

## 五、简版结论（给决策者）

- **同意**：P0-2 / P0-1 / P0-3 本轮核心修复总体有效
- **不同意直接宣称“全部收口完成”**：因为还残留 2 个和本轮主题直接相关的小问题
- **建议调整后通过**：
  - `App.jsx`：`getSavedProgress()` 改为 `await`
  - `ReviewView.jsx`：删除 alert 清理逻辑改回 `storage.js` 的 `load/store`

---

## 六、我的一句话评价

**这轮不是“表面修补”，而是真正把三个核心 P0 问题大体修正了；但还差最后两处小漏点，补完会更扎实。**
