# 🧾 Receipt Renamer — 小票智能管家

移动端 Web App，连接你的 Google Drive，自动识别、重命名、归档收据。

## 功能

- 📷 拍照或从 Drive 读取收据图片
- 🤖 AI 自动提取日期、商户、金额、分类
- 📁 智能重命名 `YYYY-MM-DD 分类 商户.ext` 并归档
- 📊 同步到 Google Sheets
- ⚡ 支持批量一键处理

## 快速开始

```bash
git clone <your-repo>
cd receipt-renamer
npm install
cp .env.example .env   # 编辑 .env 填入配置
npm run dev
```

## 部署

```bash
npm run build
# dist/ 目录部署到 Vercel / Netlify
```

## 技术栈

React 18 · Vite · Google Drive API · Google Sheets API · Claude API
