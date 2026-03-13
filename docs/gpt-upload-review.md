# GPT Upload Queue Review

审查范围：
- `src/views/ScanView.jsx`
- `src/services/google.js`
- `src/services/pendingQueue.js`

## 结论

这次“上传队列持久化 + 自动恢复”方向是对的，但我看下来有几个很具体的问题。**最关键的一个我已经直接修掉了**：上传成功后没有稳定清掉 IndexedDB 里的 pending item，会导致“已经上传成功的文件”在下次打开 app 时又被恢复出来，轻则重复上传，重则制造重复 Drive 文件和重复 AI 处理。

---

## 已修复的关键 bug

### 1) 成功上传后没有统一删除 IndexedDB 记录，导致下次启动重复恢复 / 重复上传
- 文件：`src/views/ScanView.jsx`
- 原位置：约 `308-314`
- 问题：
  - 现在 `handleFiles()` 里是**所有新文件都会先 `savePending()`** 到 IndexedDB。
  - 但 `processQueue()` 成功后只在 `pending.fromIndexedDB === true` 时才 `removePending(pending.id)`。
  - 这意味着：**本次会话中新拍/新选的文件虽然上传成功了，但因为 `fromIndexedDB: false`，不会被删掉**。
  - 下次重新打开页面，这些“其实已经传完的文件”会再次从 `loadPending()` 被恢复出来。
- 影响：
  - 重复上传到 Drive
  - 重复触发 AI 流程
  - 本地缓存越来越大，误导存储告警
- 修复：
  - 改成**只要上传成功，就总是 `removePending(pending.id)`**。

---

## 其他具体问题 / 改进建议

### 2) PDF 会被错误命名成 `.jpg`
- 文件：`src/views/ScanView.jsx`
- 位置：约 `281-286`
- 代码行为：
  - `const ext = (file.type || '').includes('png') ? 'png' : 'jpg';`
  - 如果 `file.type === 'application/pdf'`，这里会落到 `jpg`。
  - 随后 `uploadToDriveFolder(file, fileName, folderId, file.type || 'image/jpeg')` 又会带着真实 MIME `application/pdf` 上传。
- 结果：
  - Drive 里会出现 **扩展名 `.jpg`，但 MIME 实际是 PDF** 的文件。
  - 后续人工查看、下载、第三方系统兼容性都可能出问题。
- 建议：
  - 显式分支：`pdf -> .pdf`，`png -> .png`，其余图片再走 `.jpg`。

### 3) 相册入口不允许选 PDF，但上传链路却声明支持 PDF，前后不一致
- 文件：`src/views/ScanView.jsx`
- 位置：约 `64`（`ALLOWED_TYPES`）与 `404-406`
- 问题：
  - 代码明确允许 `application/pdf`：
    - `const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];`
  - 但相册 input 是：
    - `<input ... accept="image/*" multiple ... />`
  - 这会导致 UI 层根本选不到 PDF。
- 影响：
  - 产品表现和代码能力不一致
  - 用户会以为“PDF 支持坏了”
- 建议：
  - 如果要支持 PDF，改成 `accept="image/*,application/pdf"`
  - 如果产品决定不支持 PDF，就把 `ALLOWED_TYPES` 和上传逻辑一起收紧，不要半支持。

### 4) 自动消失的 done 项没有释放 object URL，也没有清理 `filesRef`，会有内存泄漏
- 文件：`src/views/ScanView.jsx`
- 位置：约 `243-252`
- 问题：
  - `updateItem()` 里 done 状态 2 秒后只做了：
    - `setItems(...filter...)`
    - `queueRef.current = queueRef.current.filter(...)`
  - 但没有：
    - `URL.revokeObjectURL(it.previewUrl)`
    - `delete filesRef.current[id]`
  - `clearDone()` 里是有做清理的，但**自动消失路径没有做**。
- 影响：
  - 多次连续拍照上传时，页面内存会持续涨
  - 移动端 Safari 更容易被打爆
- 建议：
  - 在 auto-dismiss 的 timeout 里把对应 item 找出来并释放 `previewUrl`、清掉 `filesRef.current[id]`。

### 5) `nukeAllUserData()` 会对 `const _folderIdCache` 重新赋值，运行到这里会直接抛错
- 文件：`src/services/google.js`
- 位置：约 `381` 与 `603-604`
- 问题：
  - `_folderIdCache` 定义是：
    - `const _folderIdCache = {};`
  - 但在 `nukeAllUserData()` 里写了：
    - `_folderIdCache = {};`
- 结果：
  - 这里会触发 `Assignment to constant variable.`
  - 用户在执行“核删除”时，前面的 Drive / Sheet 删除可能已经部分成功，但本地状态清理会异常中断。
- 建议：
  - 改成调用已有的 `clearFolderCache()`，或者遍历 delete key。

### 6) `pendingQueue.openDB()` 在升级时直接 `createObjectStore`，没有判断 store 是否已存在
- 文件：`src/services/pendingQueue.js`
- 位置：约 `19-27`
- 问题：
  - `onupgradeneeded` 里是：
    - `e.target.result.createObjectStore(STORE, { keyPath: 'id' });`
  - 如果将来 DB 版本升级，而 store 已经存在，这里会抛 `ConstraintError`。
- 影响：
  - 后续 schema 演进很脆
  - 一旦以后给 pending queue 加 index / metadata，升级流程容易炸
- 建议：
  - 改成：
    - `if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(...)`

---

## 我会优先排的后续修复顺序

1. **PDF 文件名修正**（很容易导致脏数据）
2. **done 自动消失时释放 URL / File 引用**（移动端稳定性）
3. **修掉 nukeAllUserData 里的 const 重赋值**（删库场景不能半成功半报错）
4. **给 IndexedDB upgrade 加存在性判断**（为后续版本演进兜底）

---

## 本次实际改动

已修改：`src/views/ScanView.jsx`

- 上传成功后：
  - 不再依赖 `fromIndexedDB`
  - 一律执行 `removePending(pending.id)`

这能直接阻止“成功上传的文件下次又被恢复出来”的主链路 bug。
