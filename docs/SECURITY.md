# Security — Receipt Renamer

## 当前安全状态

**整体评估：内测安全，上线前需加固**

---

## ✅ 已实现的安全措施

### 前端

| 措施 | 说明 |
|------|------|
| Google OAuth 2.0 | 标准 PKCE 流程，不存储 refresh token |
| 用户数据隔离 | IndexedDB/localStorage key 带 `userId` 前缀 |
| 清缓存不退出登录 | `handleReset` 只清数据，保留 auth state |
| 无明文密钥 | API key 全部在 Worker 端，前端无接触 |
| Drive API 防注入 | 文件名通过 metadata API 设置，非 URL 拼接 |
| appDataFolder | 云端配置存在用户私有空间，其他应用不可读 |

### Worker (Cloudflare)

| 措施 | 说明 |
|------|------|
| Bearer Token 认证 | 请求必须携带有效 token |
| CORS 限制 | `ALLOWED_ORIGIN` 环境变量控制允许的域名 |
| 错误信息脱敏 | AI API 错误不返回原始内容给客户端 |

---

## 🔴 上线前必须修复

### C-1: Worker 用户身份验证

**风险：** 当前 Worker 只验证 bearer token，任何拿到 token 的人都能冒充任何用户调用 AI。

**修复方案：**
```
前端 → 请求时附带 Google ID Token (JWT)
Worker → 验证 JWT 签名 → 提取用户身份 → 用于配额管理
```

**实现步骤：**
1. 前端在请求头加 `X-Google-ID-Token: <jwt>`
2. Worker 用 Google 公钥验证 JWT
3. 从 JWT 中提取 `sub` (用户ID)
4. 用 `sub` 作为配额 key

### C-2: 删除调试端点

**风险：** `/api/debug/gemini` 端点绕过认证或暴露内部信息。

**修复：** 直接删除。

### C-3: CORS 白名单

**风险：** 如果 `ALLOWED_ORIGIN` 设为 `*`，任何网站可发起 API 请求。

**修复：**
```
ALLOWED_ORIGIN = "https://horancheng.github.io"
```

只允许生产域名。开发时用 `wrangler dev --local` 不需要 CORS。

### C-4: 配额原子化

**风险：** 当前配额用 KV 存储，KV 是最终一致的。并发请求可能导致配额被绕过。

**修复方案：** 使用 Cloudflare Durable Objects 实现原子计数器。

**成本：** Durable Objects 需要 Workers Paid Plan ($5/月)。

---

## 🟡 已知风险（内测可接受）

| 风险 | 影响 | 缓解 |
|------|------|------|
| Token 存 localStorage | XSS 可偷 token | 无第三方脚本、CSP 保护 |
| 单 bearer token 共享 | 泄露影响所有用户 | 内测只有 1 个用户 |
| 无审计日志 | 无法追踪滥用 | 内测人数少 |
| Drive 权限范围大 | `drive.file` scope 可访问应用创建的所有文件 | 这是最小必要权限 |

---

## 📋 Drive API 注入防护

### 文件名注入

**场景：** 用户上传的图片被 AI 识别后生成文件名。恶意图片可能让 AI 返回包含 `../` 或特殊字符的文件名。

**防护：**
- Drive API 的 `files.update` 使用 JSON body 中的 `name` 字段，不是 URL path
- 文件名中的 `/` 在 Drive 中是合法字符（不代表目录层级）
- Drive 的文件夹结构通过 `parents` 字段管理，不是路径
- AI 返回的文件名经过 `sanitizeFilename()` 清理

### Sheets 注入

**场景：** AI 识别结果被写入 Sheets。恶意数据可能包含公式注入（`=IMPORTRANGE(...)`）。

**防护：**
- Sheets API `values.append` 使用 `USER_ENTERED` 模式
- 目前未做公式前缀检测（内测风险低，数据来源是自己的小票）
- **上线前应加：** 对 AI 返回值做 `=` 前缀检测，加单引号转义

---

## 清缓存不退出登录 — 机制说明

用户点击"清除缓存"时：

```
handleReset()
  1. 保留 auth 相关字段:
     - connected, googleProfile, clientId, setupDone, sheetId, sheetName
  2. 清除数据字段:
     - receipts, image cache, processing progress
  3. 清除 IndexedDB:
     - rr-image-cache-{userId}
     - rr-pending-uploads-{userId}
  4. 重置 config 为 DEFAULT_CONFIG + preserved auth
```

结果：
- ✅ 用户仍然登录
- ✅ Google Drive 数据不受影响
- ✅ 本地缓存已清空
- ✅ 下次使用会重新从云端加载
