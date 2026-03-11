# Receipt Renamer — GPT Round 3 复核意见

审核时间：2026-03-11
审核对象：Claude Opus 4.6 的 round-3 报告与已提交修复后的代码

---

## 结论先说

我重新读了 Claude 提到的关键文件，结论是：

- **Claude 已修的 4 个关键问题：我都同意，而且这轮修复基本是正确的。**
- **Claude 未修的问题里，大部分判断也成立。**
- 但 Claude 还有**至少两个遗漏**，其中一个我认为是更值得立刻补的真实功能问题：
  - **遗漏-1：ReviewView 人工通过后没有回写本地 receipts，因为 App 没把 `onReceiptProcessed={addReceipt}` 传给 ReviewView。**
  - **遗漏-2：`retrySheetOutbox()` 写死了 sheet 名 `receipt_index`，没有使用实际 `sheetName`。**

整体上，这轮比上一轮更扎实，尤其 BUG-1 这个遮蔽问题确实抓得准，不是“代码风格问题”，而是**真 P0 功能 bug**。

---

## 1. 我对 Claude 已修 4 个关键问题的确认

### BUG-1 [P0] ReviewView `load` 遮蔽 storage.js 的 `load`
**结论：同意，且修复正确。**

我看到现在 `ReviewView.jsx` 已改成：

```js
import { store, load as storageLoad } from '../services/storage';
```

删除路径里也已改为：

```js
const alerts = await storageLoad('rr-non-receipt-alerts', []);
```

这说明：
- 之前的命名遮蔽确实会导致 `handleDelete()` 误调用组件内的 `load()`；
- 现在 alias 改名后，删除路径终于真正走到用户隔离的 storage 层；
- 所以上一轮 GPT 提出的用户隔离修复，在 ReviewView 删除路径上，这轮才算真正闭环。

**评价：Claude 这个点抓得非常准，严重度 P0 合理。**

---

### BUG-4 [P2] LogView 导出始终用本地数据
**结论：同意，修复正确。**

现在 `LogView.jsx` 已改成：

```js
onClick={() => { exportCSV(activeReceipts); setShowExport(false); }}
onClick={() => { exportJSON(activeReceipts); setShowExport(false); }}
```

这和当前的 cloud/local source 切换逻辑一致：

```js
const activeReceipts = (syncSource === 'cloud' && sheetRecords != null) ? sheetRecords : receipts;
```

所以这个修复是对的，能让导出尊重当前视图的数据源。

**评价：问题成立，优先级 P2 合理。**

---

### BUG-5 [P2] handleReset 清错 IndexedDB
**结论：同意，修复正确。**

现在 `App.jsx` 里已经改成：

```js
const userId = localStorage.getItem('rr-current-user') || '';
const dbs = ['rr-sw-queue'];
if (userId) {
  dbs.push(`rr-image-cache::${userId}`, `rr-pending-uploads::${userId}`);
}
dbs.push('rr-image-cache', 'rr-pending-uploads');
dbs.forEach(name => indexedDB.deleteDatabase(name));
```

这比原来只删固定库名明显正确：
- 能删当前用户作用域 DB；
- 也兼容清理老版本遗留的非作用域 DB；
- `rr-sw-queue` 仍是全局库，所以保留 unscoped 名称也对。

**评价：问题成立，修复方式也比较稳。**

---

### SEC-1 [P1] Drive API 查询字符串未转义
**结论：同意，修复正确。**

现在 `google.js` 已增加：

```js
function escQ(s) { return (s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
```

并且相关 query 都已切换为：

```js
name='${escQ(...)}'
```

包括：
- root folder 查找
- renameSubFolder old/new 名称查找
- findOrCreateFolder
- cloud config 文件查找

这能解决 folder/file 名带单引号时把 Drive query 弄坏的问题。

**评价：问题成立，修复正确，P1 合理。**

---

## 2. 我对 Claude “发现但未修”的评价

### BUG-6: processor.js / ReviewView 命名仍用 category 而非 merchant
**结论：同意，这是当前最明显的产品语义漂移问题之一。**

我确认以下代码仍然存在：

`processor.js`
```js
const safeCategory = safeName(data.category || 'Other');
const newName = `${safeDate} ${safeCategory}.${ext}`;
```

`ReviewView.jsx`
```js
const safeCategory = (d.category || 'Other').replace(/[/\\?%*:|"<>]/g, '-').trim();
const newName = `${safeDate} ${safeCategory}.${ext}`;
```

所以如果项目决策已经明确“文件名应该优先是 merchant(+amount)”，那么 Claude 的判断是对的：**目前实现并没有兑现这个决策**。

但我会补一句：
- 这不是“代码错误”那种 bug；
- 它是**产品命名策略没有收敛，导致多处实现继续沿用旧口径**。

我建议把它当成 **P1 产品一致性/信息架构问题**，而不是纯技术 bug。

---

### BUG-2: InboxView 命名格式与 processor.js 不一致
**结论：同意。**

`InboxView.jsx` 仍是：

```js
const newName = `${safeDate} ${safeCategory} ${safeAmount}.${ext}`;
```

而 `processor.js` 仍是：

```js
const newName = `${safeDate} ${safeCategory}.${ext}`;
```

两条处理路径产出不同文件名，长期一定会造成：
- 用户困惑；
- Drive 排序和搜索体验不一致；
- 后续修命名规则时要处理历史数据兼容。

**评价：Claude 判断正确。**

---

### SEC-2: SW queue 仍未用户隔离
**结论：同意。**

我确认 `public/sw.js` 里还是：

```js
indexedDB.open('rr-sw-queue', 1)
```

没有用户作用域。

而 `imageCache.js` / `pendingQueue.js` 已经是：
- `rr-image-cache::${userId}`
- `rr-pending-uploads::${userId}`

所以目前 SW queue 的确还是全局共享。

这意味着共享设备上，理论上可能出现：
- A 用户遗留任务被 B 用户看到/继续处理；
- 队列状态串号；
- 甚至错误地用当前用户 token 续跑别人的任务。

**评价：Claude 判断正确，而且这是下一批应优先修的隔离问题。**

---

### ARCH-1: App.jsx God Component
**结论：同意。**

这个判断没争议。`App.jsx` 现在确实承载了过多职责：
- auth 初始化
- config 持久化
- processing status
- toast
- routing
- SW 通信
- conflict prompt
- receipt state

这类问题不会立刻炸，但会让后续修 bug 的成本越来越高。

**评价：成立，但优先级低于数据一致性和隔离问题。**

---

### UX-2 / UX-3: InboxView / ConfigView / SetupView 仍用 `alert()`
**结论：同意。**

我确认以下仍存在：
- `InboxView.jsx` load 失败用 `alert()`
- `ConfigView.jsx` rename / create sheet 失败用 `alert()`
- `SetupView.jsx` connect / create sheet 失败用 `alert()`
- `App.jsx` connect 失败也仍用 `alert()`
- `ReviewView.jsx` 删除确认仍用 `window.confirm()`

所以 Claude 这块判断成立。

不过我补一条优先级建议：
- **错误提示的 `alert()` 可以晚一点统一收口；**
- **删除确认的 `confirm()` 反而更该早点换成 app 内部 modal**，因为它直接影响移动端体验连续性。

---

## 3. 我认为 Claude 可能漏掉的问题

下面是我这轮复看时确认的两个真实遗漏。

### 漏掉-1：ReviewView 人工通过后，没有把记录写回本地 receipts
**严重度：我认为至少 P1。**

`ReviewView` 本身是支持回调的：

```js
export default function ReviewView({ config, onReceiptProcessed, showToast })
```

并且 `handleApprove()` 里也确实调用了：

```js
onReceiptProcessed?.({...})
```

但 `App.jsx` 实际挂载时写的是：

```js
{view === 'review' && <ReviewView config={config} showToast={showToast} />}
```

**没有传 `onReceiptProcessed={addReceipt}`。**

这会导致：
- 审核通过后，Drive 和 Sheets 可能都成功；
- 但本地 `receipts` 不会更新；
- 在本地模式、或云端读取失败 fallback 到本地时，用户会看到“我刚通过的小票不在记录页”；
- 和 ScanView / InboxView 的行为也不一致，因为它们都把结果回写本地 state 了。

这是我认为 Claude 本轮最可惜的遗漏。

**建议：**
在 `App.jsx` 改为：

```jsx
{view === 'review' && (
  <ReviewView
    config={config}
    showToast={showToast}
    onReceiptProcessed={addReceipt}
  />
)}
```

---

### 漏掉-2：`retrySheetOutbox()` 写死了 `receipt_index`，忽略实际 `sheetName`
**严重度：P2。**

我确认 `processor.js` 中重试逻辑是：

```js
await appendToSheet(item.sheetId, 'receipt_index', item.row);
```

但正常主流程写表时用的是：

```js
appendToSheet(config.sheetId, config.sheetName || 'receipt_index', sheetRow)
```

也就是说：
- 首次写失败进 outbox 时，没有保存 sheetName；
- retry 时永远写 `receipt_index`；
- 一旦用户自定义 sheet tab 名称，重试就会跑偏。

这不是最致命的问题，但确实是个真实一致性 bug。

**建议：** outbox item 保存 `sheetName`，retry 时使用 `item.sheetName || 'receipt_index'`。

---

### 可算“半遗漏”的点：SEC-3 的表述需要降调
Claude 说 cloud config 没放 `appDataFolder`，而是放在 root folder 内。

这点**现象属实**，但我不完全同意它作为“安全问题”的表述强度。

更准确地说，它是：
- **隐私/产品设计/配置管理问题**，不是典型 security 漏洞；
- 前提是用户本来就拥有该 Drive 账户的访问权；
- 风险主要是“可见、可误改、可误删”，而不是越权访问。

所以我会把它改标成：
- **ARCH / DX / privacy hygiene**，
- 而不是单独作为高优先级安全问题。

---

## 4. 对 BUG-6（category vs merchant 命名策略）的建议

我的建议很明确：

### 建议采用统一规则：
**`YYYY.MM.DD Merchant Amount.ext`**

例如：
- `2026.03.11 Woolworths 42.80.jpg`
- `2026.03.11 Bunnings 18.45.jpg`

### 原因

#### 1) merchant 比 category 更适合当文件名主语
用户回头在 Drive 找文件时，第一反应通常是：
- “我想找 Woolworths 那张”
- “我想找 Chemist Warehouse 那张”

而不是：
- “我想找 Grocery 那张”

category 适合做：
- 统计
- 过滤
- 图表
- 标签

merchant 更适合做：
- 文件名
- 快速搜索
- 人脑识别

#### 2) amount 放进文件名是值得的
同一天同一家店可能有多张小票。

如果只用：
- `2026.03.11 Woolworths.jpg`

那重复概率非常高，后续要靠系统自动加 `(1)`、`(2)`，体验差。

而：
- `2026.03.11 Woolworths 42.80.jpg`

可读性和去重能力都更好。

#### 3) category 不应该消失，而应该退回元数据层
category 最适合：
- Sheets 列
- 本地 receipt record
- LogView filters / donut chart
- Review form editable field

也就是说：
- **文件名主键：merchant + amount**
- **业务分类：category**

这个分工最自然。

---

### 如果担心 merchant 识别不准
可以用一个保守 fallback：

```text
YYYY.MM.DD Merchant Amount.ext
若 merchant 为空 → YYYY.MM.DD Category Amount.ext
若 amount 也为空 → YYYY.MM.DD Merchant.ext
```

推荐统一封装一个 helper，例如：
- `buildReceiptFilename({ date, merchant, category, amount, ext })`

然后让以下三条路径全部复用：
- `processor.js`
- `ReviewView.jsx`
- `InboxView.jsx`

这样才能真正结束 BUG-2 / BUG-6 这种 drift。

---

## 5. 我对 Claude 这轮整体质量的评价

### 我同意的地方
Claude 这轮最有价值的是：
- 抓到了 **BUG-1 命名遮蔽** 这个真 P0；
- 没有只盯“表面功能”，而是回到数据隔离路径验证；
- 对 Drive query escaping、reset DB 名这些细节也看到了。

这说明它这轮不是泛泛扫，而是有沿着真实调用链在看。

### 我保留意见的地方
- `SEC-3` 我会降级，不把它讲成典型安全漏洞；
- `BUG-6` 更像“产品命名决策未落地”，不是普通 coding bug；
- 还漏了一个我认为更该补的真实问题：**ReviewView approve 没回写本地 receipts**。

---

## 6. 我的建议优先级（按我自己的排序）

### 应该马上补
1. **补 App → ReviewView 的 `onReceiptProcessed={addReceipt}` 传递**
2. **统一文件名 helper，彻底解决 BUG-2 / BUG-6**
3. **修 SW queue 用户隔离**
4. **修 outbox retry 的 `sheetName` 写死问题**

### 下一批再做
5. 把 `alert()/confirm()` 收口为 Toast + Modal
6. 拆 App.jsx，把 auth / sync / receipt-state / toast / sw bridge 拆成 hooks
7. 评估 cloud config 是否迁移到 `appDataFolder` 或至少做“用户不可见配置”的备选方案

---

## 最终结论

**Claude 这轮报告总体可信，已修的 4 个关键问题我都确认无误。**

但从“是否已经把 round-3 风险收干净”的角度看，答案是：**还没有。**

剩下最值得立刻补的，不是继续争论 category/merchant，而是这两个一致性问题：
- **ReviewView approve 后本地记录没更新**
- **outbox retry 写死 `receipt_index`**

而关于 BUG-6，我的建议是别再拖着争论：
**直接定规则为 `日期 + merchant + amount`，category 退回元数据层。**

这样整个系统的命名、搜索、去重、人工审核体验都会更顺。