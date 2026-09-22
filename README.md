# 昨日头条 · 七日历史日签

暖白报刊风的个人历史阅读应用，支持按日期阅读、来源详情、收藏及导出 PNG。

## 使用

每日一页只展示所选日报文件的内容。往日拾光列出今天及前六天，共七天；选择日期后日历与内容同步切换，不再混排全库。未来及更早日期不可选，过期链接回到今天。收藏书签保存在本机，仅展示仍在七天范围内的事件。

## 数据

GitHub 数据仓库使用 DeepSeek 和真实搜索自动采集。每日独立保存 archives/YYYY-MM-DD.json，并通过 archive_index.json 提供索引。前端依次读取索引和各日期文件，校验文件日期、事件月日、来源日期、状态；不直接读取全量 catalog.json。
服务端缓存一分钟，打开页面每五分钟及切回页面时检查，也可手动刷新。线上失败时显示内置资料和明确提示。无合格事件标为空日报，采集失败标为资料暂不可用，两者区分。

## 开发部署

Node.js 24；npm ci，然后 npm run dev。
验证：npm test、npm run typecheck、npm run lint、npm run build。
沿用 Netlify 原站 https://yesterdays-headlines-app.netlify.app/ ，GitHub main 提交自动部署。前端无需 DeepSeek 密钥；密钥只存在数据仓库的 GitHub Secret。

## 字体与版式

刊名和文章大标题使用 Ma Shan Zheng 毛笔手写体；正文使用 Noto Serif SC 宋体。两套字体通过 Fontsource 自托管，随网站发布，不依赖读者安装字体或连接 Google Fonts。上游 SIL OFL 授权位于 public/fonts/licenses/。
日签 PNG 使用同样的标题与正文字体，导出前等待对应字形加载。桌面使用日期边栏和宽阅读栏，手机去掉重复日期区；七日目录提供日期大字与文章标题预览。
