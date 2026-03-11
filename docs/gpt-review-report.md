# Receipt Renamer PWA 审核报告

项目地址：<https://horancheng.github.io/receipt-renamer/>

审核范围：
- `src/App.jsx`
- `src/services/google.js`
- `src/services/processor.js`
- `src/services/ai.js`
- `src/views/ScanView.jsx`
- `src/views/ReviewView.jsx`
- `src/views/LogView.jsx`
- `src/views/ConfigView.jsx`
- `src/components/Toast.jsx`
- `src/components/AiLivePanel.jsx`
- `public/sw.js`

---

## 一、总览结论

这是一个**产品方向清晰、移动端优先、功能闭环基本成立**的小票处理 PWA。项目已经具备：Google 登录、Drive 入库、AI 识别、人工审核、Sheets 记录、PWA 缓存、弱网/断点续传等关键能力，说明作者有很强的产品推进能力和实战意识。

但从 QA / 代码审核视角看，当前代码还存在几类比较明显的问题：

1. **数据隔离没有完全做干净**：虽然项目引入了 user-scoped storage，但还有多处直接写未隔离的 `localStorage` / SW IndexedDB，存在共享设备串号、串告警、串进度的风险。  
2. **审核流存在真实逻辑 bug**：`ReviewView` 同时读取 inbox + review 两个来源，但 approve 时固定按 `reviewFolderId` 移动，来自 inbox 的文件可能 move 失败。  
3. **命名与主流程不一致**：`processor.js` / `ReviewView.jsx` 目前文件名仍然主要按“日期 + 分类”生成，而不是更适合检索的“日期 + 商家 + 金额”。  
4. **前端错误处理仍偏原始**：不少关键路径还在用 `alert()` / `window.confirm()`，对移动端体验和可控性都不够好。  
5. **架构上已经出现“单文件过重”迹象**：`App.jsx`、`ScanView.jsx`、`ReviewView.jsx` 责任较多，后续继续迭代会越来越难维护。

---

## 二、评分

### 1) 代码安全性：**6/10**
优点：
- AI 调用已强制走代理，避免浏览器直出 API Key。
- Google API 调用统一经 `ensureToken()` 管理，有基本的过期刷新逻辑。
- 部分本地缓存已开始做用户隔离（如 `storage.js`、`imageCache.js`、`pendingQueue.js`）。

扣分点：
- 用户隔离并未全面落地，仍有未隔离存储。
- Service Worker 队列库未分用户。
- 与配额相关的 UID 存储键不一致，可能导致识别额度统计失真。

### 2) 使用体验：**7/10**
优点：
- 上传后立即进入后台处理，主流程很顺。
- 有 toast、处理中浮层、AI 实时面板、WiFi 队列等反馈设计。
- 对 iOS / PWA 限制有一定现实处理。

扣分点：
- 关键失败仍弹 `alert()`，体验跳出感很强。
- 审核/删除流还比较硬，缺少可恢复与明确回执。
- 一些边界状态（云端/本地冲突、队列失败、审核来源不同）容易让用户困惑。

### 3) UI 合理性：**7/10**
优点：
- 视觉语言比较统一，暗色主题、圆角、强调色、状态卡片风格较完整。
- 重点 CTA 比较明确，面向手机操作习惯。
- `Toast`、`AiLivePanel`、状态卡片、底部导航整体一致性不错。

扣分点：
- 某些页面信息层级偏多，尤其 `ConfigView` 和 `ReviewView` 详情态。
- “实验性”“高级设置”“危险区域”等元素同时出现时，会拉高认知负担。

### 4) UI 排布：**7/10**
优点：
- 主路径“扫描 → 审核 → 记录 → 设置”结构清楚。
- 扫描页把主要动作放在首屏，非常合理。
- 记录页图表、筛选、列表的组织基本顺手。

扣分点：
- `ReviewView` 编辑态把图片、状态、表单、删除操作全部压在一个长页面里，信息密度偏高。
- `LogView` 同时有云端/本地、时间、分类、搜索、导出，层次开始变复杂。

### 5) 代码架构：**6/10**
优点：
- 已经有一定服务层拆分：`google.js`、`processor.js`、`ai.js`、`pendingQueue.js`、`imageCache.js`。
- 存在明显的产品模块边界，说明项目不是“纯堆代码”。

扣分点：
- 容器组件过大，视图层承担过多业务逻辑。
- 状态同步路径较分散：React state、localStorage、IndexedDB、SW message、Drive metadata、Sheets 同时存在。
- 一些跨层约定没有收敛，导致命名、存储、回调、来源字段容易漂移。

---

## 三、总分

### **33 / 50**

我的判断：这是一个**已经能打、但还没彻底收口**的项目。产品完成度明显高于很多 demo 级 PWA，但若要进一步走向稳定可长期维护，需要先补齐**数据隔离、审核流一致性、错误交互收敛、文件命名策略统一**这四件事。

---

## 四、分维度详细审核

---

### A. 代码安全性

#### 1. AI Key 暴露风险控制方向正确
`src/services/ai.js`：

```js
// SECURITY: Direct browser→Anthropic API was removed because it exposes the API
// key in client-side JavaScript. All AI calls MUST go through the proxy Worker.
if (!PROXY_URL) {
  throw new Error('AI 代理未配置。请联系管理员设置 VITE_AI_PROXY_URL。');
}
```

这部分方向是对的。至少从前端代码看，已经明确禁止浏览器直连模型服务，避免最危险的 API Key 暴露。

#### 2. Google Token 管理做得比普通前端项目成熟
`src/services/google.js`：

```js
export function tryRestoreSession() {
  const raw = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(PERSIST_KEY);
  ...
  window.gapi.client.setToken(token);
}
```

```js
async function ensureToken() {
  const t = getToken();
  if (t) return t;
  if (tryRestoreSession()) return getToken();
  await requestAccessToken({ prompt: '', loginHint: _loginHint });
}
```

这里说明作者已经在处理 token 恢复、静默刷新、登录 hint 等问题，不是只做了一个最简授权 demo。

#### 3. 但“用户隔离”仍然没有真正闭环
项目里已经有 user-scoped storage：
`src/services/storage.js`

```js
const SCOPED_KEYS = ['rr-config', 'rr-receipts', 'rr-proc-progress', 'rr-non-receipt-alerts'];
...
return scope ? `${key}::${scope}` : key;
```

看起来是想把关键数据按用户隔离，这个设计是对的。问题在于**很多地方并没有走这个封装层**，而是直接写裸 `localStorage`。

例如 `src/services/processor.js`：

```js
localStorage.setItem('rr-proc-progress', JSON.stringify({
  ..._stats,
  updatedAt: Date.now(),
}));
```

以及：

```js
const key = 'rr-non-receipt-alerts';
const existing = JSON.parse(localStorage.getItem(key) || '[]');
localStorage.setItem(key, JSON.stringify(existing));
```

`src/App.jsx` 也直接读：

```js
const alerts = JSON.parse(localStorage.getItem('rr-non-receipt-alerts') || '[]');
```

这意味着：
- 同设备切换不同 Google 用户时，**非小票提醒可能串用户**。
- 恢复的处理进度可能不是当前用户的。
- `storage.js` 做了隔离，但关键逻辑绕开了它，实际安全收益被打折。

#### 4. Service Worker 队列库没有做用户作用域
`public/sw.js`：

```js
const req = indexedDB.open('rr-sw-queue', 1);
```

这里是全局固定库名，没有像 `imageCache.js` / `pendingQueue.js` 那样按 `rr-current-user` 分库。

这会带来两个问题：
- 共享设备多账号时，SW 队列可能遗留上一个用户的待处理任务。
- sign out 只清 token，不清任务本体；下一位用户进入时，理论上可能碰到旧任务残留。

这不是“理论上无所谓”的小问题，因为 SW 是跨页面、跨会话持久化的。

#### 5. 配额 UID 存储键不一致
`src/services/ai.js`：

```js
const uid = localStorage.getItem('receipt_google_uid') || 'anonymous';
```

`src/views/ScanView.jsx` 也用了：

```js
uid: localStorage.getItem('receipt_google_uid') || 'anonymous',
```

但当前项目里真正用于用户作用域的是：

```js
localStorage.setItem('rr-current-user', userId || '');
```

我在已审文件中**没有看到 `receipt_google_uid` 被正确写入的闭环**。这可能导致：
- 代理侧配额统计大量落到 `anonymous`
- 多用户之间额度统计不准确
- 某些用户被错误共享或抢占配额

这属于安全与业务治理交界处的问题，风险比纯 UI bug 更高。

---

### B. 使用体验

#### 1. 扫描上传主路径做得不错
`src/views/ScanView.jsx`：

```js
const item = {
  id, name: file.name || 'receipt.jpg',
  status: wifiOnly ? 'wifi_blocked' : 'queued',
  ...
};
```

```js
if (pending._uploadedFile && onStatusChange) {
  const swQueued = isSWAvailable() && enqueueToSW({ ... });
  if (!swQueued) {
    enqueueFile(pending._uploadedFile, config, onStatusChange, onReceiptProcessed);
  }
}
```

这个设计是对的：
- 上传和识别尽快异步化
- 优先 SW，失败再退回主线程
- WiFi-only 有持久队列

对手机端用户来说，这比“拍完一张死等 8 秒”强很多。

#### 2. 反馈系统比较完整
`src/components/Toast.jsx`：

```js
showToast(`${merchant}${amount} 已识别归档 📂`, 'success');
showToast(`${merchant}${amount} 需要人工审核 👀`, 'warn');
```

`src/components/AiLivePanel.jsx`：

```js
{isActive ? `AI 识别中 · ${done}/${total}` : `识别完成 · ${done} 张`}
```

加上 `App.jsx` 的底部 processing pill，整体反馈链路是通的。这一点明显优于很多“后台处理中但用户完全不知道系统在干嘛”的应用。

#### 3. 但错误处理仍偏“工程态”而非“产品态”
全项目很多关键路径仍在用 `alert()`：

```js
alert('加载失败：' + msg);
alert('操作失败：' + e.message);
alert('删除失败：' + e.message);
alert(`文件 "${file.name}" 太大...`);
```

以及 `window.confirm()`：

```js
if (window.confirm('确定从 Drive 删除这个文件？此操作不可撤销。'))
```

问题不是“能不能用”，而是：
- 移动端原生弹窗会打断节奏
- 无法统一视觉风格
- 错误文案与恢复动作无法组合呈现
- 在复杂状态下会让用户不清楚下一步该干嘛

如果项目准备继续做成长期产品，这批交互应该统一换成 App 内 modal / sheet / toast 体系。

#### 4. 审核流里存在真实 bug，直接影响体验
`src/views/ReviewView.jsx` 读取了两个来源：

```js
const [reviewResult, inboxResult] = await Promise.all([
  listFilesInFolder(reviewId),
  listFilesInFolder(inboxId),
]);
...
setFiles([...enrichInbox, ...enrichReview]);
```

但 approve 时固定这样调用：

```js
await renameAndMoveFile(editing.fileId, newName, validFolderId, reviewFolderId);
```

也就是说，**即使当前正在审核的是来自 inbox 的文件，也还是按 reviewFolderId 当作原父目录去 removeParents**。

这会导致：
- 轻则移动失败
- 重则让用户觉得“明明点了通过，但没成功”

这是本次审核里最明确的功能级 bug 之一。

#### 5. 文件命名策略不够友好
`src/services/processor.js`：

```js
const safeCategory = safeName(data.category || 'Other');
const newName = `${safeDate} ${safeCategory}.${ext}`;
```

`src/views/ReviewView.jsx` 也是：

```js
const safeCategory = (d.category || 'Other').replace(/[/\\?%*:|"<>]/g, '-').trim();
const newName = `${safeDate} ${safeCategory}.${ext}`;
```

按“分类”命名并不是最利于个人检索的方式。对真实用户而言，通常更有价值的是：
- 日期
- 商家
- 金额

例如 `2026.03.10 Woolworths 45.80.jpg` 明显比 `2026.03.10 Grocery.jpg` 更实用。

---

### C. UI 合理性

#### 1. ScanView 首屏 CTA 很清楚
`src/views/ScanView.jsx`：

```js
<button ...>
  <span style={{ fontSize: 54 }}>📷</span>
  <span style={{ fontSize: 20, fontWeight: 700 }}>拍张照片</span>
  <span style={{ fontSize: 12 }}>照片即存 Drive，AI 自动识别</span>
</button>
```

这一段在视觉上把主要动作放得很前，对新手也友好。

#### 2. Toast / LivePanel / 状态卡片视觉一致性较好
`Toast.jsx`、`AiLivePanel.jsx`、`ScanView.jsx` 里都延续了：
- 深色卡面
- 半透明状态背景
- 清晰边框
- 圆角较大
- 成功/警告/错误颜色统一

这说明 UI 并不是“每页各写各的”。

#### 3. ConfigView 信息层级开始变重
`src/views/ConfigView.jsx` 里同屏出现：
- Google 账号
- 上传设置
- Drive 文件夹
- 高级设置
- Sheets
- 图片压缩
- 数据备份（实验性）
- 危险区域

这不是说内容不该有，而是对于一个手机端工具类 PWA，这个页已经接近“后台管理页”的信息量了。建议后续把：
- 低频配置折叠更深
- 实验性功能独立到二级页
- Drive folder rename 与普通用户设置分层

---

### D. UI 排布

#### 1. 主导航逻辑是成立的
从 `App.jsx` 可见：

```js
{view === 'scan' && <ScanView ... />}
{view === 'review' && <ReviewView config={config} />}
{view === 'log' && <LogView ... />}
{view === 'cfg' && <ConfigView ... />}
```

这四段路径是对的，属于典型的“输入 / 处理 / 查询 / 配置”结构。

#### 2. ReviewView 编辑页过长，动作密度偏高
`src/views/ReviewView.jsx` 编辑态把这些东西都放在一个滚动页：
- 图片预览
- 状态说明
- 日期字段
- 商家字段
- 金额字段
- 分类 chips
- 返回 / 通过
- 删除

这在信息设计上不是错误，但对移动端来说稍微重了。特别是“通过”和“删除”同时放在同页，虽然视觉上做了弱化，但仍然会制造心理压力。

#### 3. LogView 功能多，开始逼近“一页过载”
`src/views/LogView.jsx` 同时有：
- 本地 / 云端切换
- 本周 / 本月 / 全部
- 图表
- 搜索
- 分类 pills
- 列表 swipe delete
- 导出菜单

单个功能都合理，但叠在一页后认知负荷偏高。建议后续优先级明确化：
- 默认只强调图表 + 列表
- 将导出 / 数据源切换藏在更轻的入口
- 搜索与分类不要争抢注意力

---

### E. 代码架构

#### 1. 服务层拆分方向是正确的
项目已有：
- `google.js`：Drive / Sheets / OAuth
- `processor.js`：识别与流转
- `ai.js`：AI 代理调用
- `pendingQueue.js`：待上传队列
- `imageCache.js`：图片缓存
- `sw.js`：后台任务

说明作者已经意识到“业务逻辑不应全堆在组件里”。

#### 2. 但 `App.jsx` 已明显过重
`src/App.jsx` 现在同时负责：
- 启动初始化
- Google API 初始化
- session 恢复
- cloud config sync
- config conflict modal
- SW token 下发
- SW message 监听
- visibility resume
- toast 触发
- view router
- 非小票 modal
- receipts 本地存储

这已经接近一个“应用总控制器”。当前还能跑，但后续继续加功能会越来越脆。

#### 3. `ScanView.jsx` 与 `ReviewView.jsx` 业务逻辑过多
以 `ScanView.jsx` 为例，它自己处理了：
- 文件校验
- 图片压缩
- 缩略图生成
- 本地缓存
- WiFi 策略
- 上传队列
- 重试
- SW fallback
- 成功提示
- 存储告警

这会让视图层测试变难，也让后续 bug 难以定位。

#### 4. 跨层约定没有完全统一
典型例子：
- 用户身份：`rr-current-user` vs `receipt_google_uid`
- 文件命名：某些地方强调 category，产品语义上又更适合 merchant
- 存储隔离：有 `storage.js`，但一些逻辑绕开它
- 审核来源：文件有 `source: 'review' | 'inbox'`，但 approve 时没有真正利用

这类问题不会立刻炸，但会持续制造“修一个点、漏另一个点”的维护成本。

---

## 五、按严重程度排序的改进建议

---

## P0（必须优先修）

### P0-1：统一并补齐所有用户隔离存储
**问题**：`storage.js` 已有 scoped 机制，但 `processor.js`、`App.jsx`、`ReviewView.jsx` 等仍直接操作裸 `localStorage`；`public/sw.js` 里的 IndexedDB 也未分用户。

**证据片段**：

`src/services/processor.js`
```js
localStorage.setItem('rr-proc-progress', JSON.stringify({ ..._stats }))
```

```js
const key = 'rr-non-receipt-alerts';
```

`public/sw.js`
```js
const req = indexedDB.open('rr-sw-queue', 1);
```

**建议**：
- 所有 `rr-*` 本地键统一经 `storage.js` / 封装 API 读写。
- `rr-sw-queue` 改为用户作用域，或在 task 中写入 `userId` 并按用户过滤、登出清理。
- sign out 时清除当前用户的 SW queue / 非小票提醒 / 处理中进度。

### P0-2：修复 ReviewView 审核来自 inbox 文件时的 move bug
**问题**：读取了 inbox + review 两类文件，但 approve 时固定 `removeParents: reviewFolderId`。

**证据片段**：

```js
setFiles([...enrichInbox, ...enrichReview]);
```

```js
await renameAndMoveFile(editing.fileId, newName, validFolderId, reviewFolderId);
```

**建议**：
- 在 `editing` 中保存 `source` 或 `currentFolderId`。
- approve / delete 时按真实来源 folderId 处理。
- 为 inbox 来源、review 来源分别补自动化测试。

### P0-3：统一 AI 配额 UID 来源
**问题**：`receipt_google_uid` 与 `rr-current-user` 并存，且前者未见稳定写入闭环。

**证据片段**：

`src/services/ai.js`
```js
const uid = localStorage.getItem('receipt_google_uid') || 'anonymous';
```

**建议**：
- 统一只保留一个 canonical user id（优先用 Google `sub`）。
- 代理请求、缓存隔离、Sheets outbox、SW queue 全部用同一个 user id。
- 对旧键做一次迁移，再删除遗留分支。

---

## P1（高优先级）

### P1-1：统一文件命名策略，建议改为“日期 + 商家 + 金额”
**问题**：当前主流程使用 category 命名，不利于检索与人工确认。

**证据片段**：

`src/services/processor.js`
```js
const newName = `${safeDate} ${safeCategory}.${ext}`;
```

`src/views/ReviewView.jsx`
```js
const newName = `${safeDate} ${safeCategory}.${ext}`;
```

**建议**：
- 主流程与 ReviewView 使用同一命名函数。
- 推荐格式：`YYYY.MM.DD Merchant Amount.ext`
- 统一 `safeName()`、title-case、amount 格式化逻辑，避免多处复制。

### P1-2：把 `alert()` / `confirm()` 收敛为应用内交互组件
**问题**：大量系统弹窗破坏移动端体验。

**建议**：
- `alert` → toast / inline error / modal
- `confirm` → bottom sheet confirm dialog
- 为删除、登录过期、上传失败、重命名失败做统一错误组件

### P1-3：给关键链路补最小回归测试
尤其建议覆盖：
- ReviewView 从 inbox / review 两来源 approve
- 用户切换后的本地缓存隔离
- SW queue 在 sign out / sign in 后的行为
- 命名函数在 merchant/category/date/amount 缺失时的 fallback

---

## P2（中优先级）

### P2-1：拆分 `App.jsx` 的应用级控制逻辑
建议抽成：
- `useAuthBootstrap()`
- `useCloudConfigSync()`
- `useProcessingBridge()`
- `useNonReceiptAlerts()`

这样能大幅降低主组件复杂度。

### P2-2：拆分 `ScanView` / `ReviewView` 业务逻辑
建议将以下逻辑移出视图：
- 上传队列状态机
- 文件校验与压缩
- 审核动作（approve/delete）
- Lightbox 状态管理

### P2-3：精简 LogView 的首屏认知负担
建议：
- 默认只显示一个数据源
- 导出移入二级菜单或设置页
- 搜索和分类筛选分主次显示

---

## P3（优化项）

### P3-1：Toast 支持去重/合并
当前连续识别多张时可能产生较密集提示。可以考虑：
- 同类 toast 合并
- 批处理完成优先于逐张提醒

### P3-2：AiLivePanel 增加失败项详情
现在只显示失败计数：

```js
{failed > 0 && <div>{failed} 张识别失败</div>}
```

可以补充：
- 哪一张失败
- 失败原因
- 一键重试入口

### P3-3：ConfigView 实验性模块进一步弱化
“数据备份（实验性）”现在已经占据真实 UI 空间，如果短期不上线，建议：
- 先隐藏到 feature flag
- 或在说明页展示，不占主设置页首屏资源

---

## 六、我最建议优先修的 5 件事

如果只做最有价值的 5 个动作，我建议顺序是：

1. **修 ReviewView 来源文件夹 bug**  
2. **彻底统一 user-scoped storage / SW queue / alerts / progress**  
3. **统一 AI 配额 UID 来源**  
4. **统一命名函数为“日期 + 商家 + 金额”**  
5. **把关键 `alert/confirm` 收敛为 App 内组件**

---

## 七、结语

这个项目最大优点不是“代码多漂亮”，而是**已经明显脱离 demo，进入真实产品迭代状态**：你能看到作者在处理 OAuth、Drive、Sheets、后台队列、PWA 限制、移动端体验、审核流这些真实世界问题。

但也正因为它已经不是 demo，所以现在最需要做的不是继续叠功能，而是把几条底层规则收紧：

- **身份与隔离规则统一**
- **审核与归档流程统一**
- **命名与数据写入策略统一**
- **错误处理与 UI 反馈统一**

把这些做完，这个项目的稳定性、可信度和可维护性都会明显上一个台阶。
