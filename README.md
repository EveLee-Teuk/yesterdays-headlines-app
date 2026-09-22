# 昨日头条 · 个人历史日签

暖白报刊风的个人阅读应用：按日读历史、看出处、收藏事件、导出带日期和来源的 PNG 日签。

## 运行与验证

Node.js 24：`npm ci`，然后 `npm run dev`。
验证：`npm test`、`npm run typecheck`、`npm run lint`、`npm run build`。
生产：`npm start`。

## 每天自动更新

数据仓库 yesterdays-headlines-data 的 GitHub Action 每天检索真实来源，并使用现有 DEEPSEEK_API_KEY 整理、复核后更新 catalog.json。前端无需密钥。
服务端读取远端 main/catalog.json，缓存 1 分钟；已打开网页每 5 分钟及重新切回时自动检查，也可手动刷新。每天的数据更新不需要重建网站。
读取失败或数据不合规范时，显示内置备用资料和明确提示。页面显示最近成功检索日期；未完成当天检索不会标为今日更新。
自动整理记录附原文短句及来源，人工核对记录单独标示。日期匹配和模型复核不能保证事实零错误，读者可直接查看出处。

## 个人使用

北京时间决定今天，按事件真实月日筛选。没有资料的日期保持空白。
收藏存于当前浏览器 localStorage；清除站点数据会清除收藏。
网址 date 与 event 参数可直达选定日期和事件。
PNG 日签在浏览器本地排版，手机可长按预览图保存。

## Netlify

沿用 yesterdays-headlines-app.netlify.app，连接 GitHub main。
netlify.toml 配置构建 npm run build、发布 .next、Node.js 24；由 Netlify Next.js 适配器提供服务端及 API。
首次上线先发布数据仓库，再推送前端。之后前端代码提交触发部署，日常数据独立自动更新。
