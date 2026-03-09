# Receipt Renamer — 项目完整大纲

## 原始版本 (V1) 设计 — Node.js 服务器端

### 核心功能
- **自动化文件摄取**：从 Google Drive 的 `00_inbox` 文件夹自动读取新的收据文件
- **多格式支持**：支持 JPG、PNG、HEIC 等图片格式和 PDF 文件
- **智能 OCR (Tesseract)**：
  - 图像预处理：灰度、归一化、对比度增强、锐化和自适应二值化
  - 自动旋转校正：0° / 90° / 180° / 270° 多角度扫描
  - PDF 文本层优先提取
- **字段提取 (正则与启发式)**：
  - 日期：优先澳大利亚格式 DD Month YYYY / DD/MM/YYYY
  - 金额：关键词+模式匹配，范围 0.01 - 9999.99
  - 商户名：关键词过滤（去 ABN, PTY LTD, TAX INVOICE）+ 全大写加权
- **智能分类**：
  - merchant-aliases.json：OCR → 标准品牌名
  - merchant-category-db.json：品牌名 → 分类
  - receipt-category-rules.json：关键词规则匹配
- **文件归档**：YYYY-MM-DD 分类 商户名.ext → 10_validated 或 20_flags/review_needed
- **Google Sheets 同步**：receipt_index 工作表
- **安全学习机制**：merchant-draft.json 草稿沙箱，3次验证后提升

### 技术栈
- Ubuntu VM → Docker → OpenClaw Gateway (Node.js)
- Tesseract.js + PaddleOCR (Python)
- Sharp 图像处理
- Gemini 2.5 Flash API
- Google Service Account

## V2 计划

### 已实施
- Gemini 2.5 Flash 结构化提取 + 校准置信度
- PaddleOCR 接入（待容器持久化）

### 待开发
1. 智能 LLM 调用策略（按需调用，降本）
2. Discord 通知 + 简易修正接口
3. 失败原因标签化（LOW_OCR_CONF, UNKNOWN_MERCHANT, AMOUNT_AMBIGUOUS）
4. 商户知识库版本化
5. 回归测试基准集

## 移动端重构（当前方向）
用 Claude 视觉 API 替代 OCR+Gemini 管线，前端直连 Google Drive API，无需自有后端。
