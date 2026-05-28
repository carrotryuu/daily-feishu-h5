# 飞书多维表格轻量版 H5 日报系统 V1

这是一个基于 Next.js 的 H5 日报系统，数据后台使用飞书多维表格。

## 本地启动

1. 复制 `.env.example` 为 `.env`。
2. 填入飞书应用信息和多维表格配置。
3. 运行：

```bash
npm install
npm run dev
```

打开 `APP_URL` 对应的地址。

- 本机单人测试：`APP_URL=http://localhost:3000`
- 多人局域网测试：`APP_URL=http://局域网IP:3000`

多人局域网测试时建议用下面的命令启动，让同一局域网内的其他电脑或手机可以访问：

```bash
npm run dev:lan
```

飞书应用后台的重定向 URL 必须填写：

```text
APP_URL/api/auth/callback
```

例如多人局域网测试时，如果 `APP_URL=http://192.168.1.23:3000`，飞书重定向 URL 就填写：

```text
http://192.168.1.23:3000/api/auth/callback
```

## 必需环境变量

- `FEISHU_APP_ID`
- `FEISHU_APP_SECRET`
- `FEISHU_BASE_APP_TOKEN`
- `APP_URL`
- `CRON_SECRET`

`FEISHU_BASE_APP_TOKEN` 支持三种写法：

- Wiki 多维表格链接，例如 `https://xxx.feishu.cn/wiki/wikcnxxxx`
- 普通多维表格链接，例如 `https://xxx.feishu.cn/base/appxxxx`
- 真实多维表格 `app_token`，也就是 Wiki 节点接口返回的 `obj_token`

当填入 Wiki 链接时，系统会先从链接中取出 `wiki_node_token`，再调用飞书 Wiki 节点信息接口，确认 `obj_type = bitable` 后，把返回的 `obj_token` 作为真正的多维表格 `app_token` 使用。

## 表 ID 配置

下面 6 个环境变量是可选项。留空时，系统会使用 `FEISHU_BASE_APP_TOKEN` 对应的多维表格，自动读取所有数据表，并按表名匹配 `table_id`：

- `FEISHU_TABLE_PEOPLE` 对应 `人员表`
- `FEISHU_TABLE_ACCOUNTS` 对应 `平台账号表`
- `FEISHU_TABLE_DAILY` 对应 `日报表`
- `FEISHU_TABLE_REVIEWS` 对应 `审核表`
- `FEISHU_TABLE_RANKINGS` 对应 `月度排行表`
- `FEISHU_TABLE_PUSH_LOGS` 对应 `推送日志表`

如果你已经知道某张表的 `table_id`，也可以继续手动填写对应环境变量。

开发期如果飞书登录还没配置好，可以临时设置 `DEV_OPEN_ID`。它只在非生产环境、且当前浏览器没有真实登录 cookie 时生效。多人局域网测试时建议不要设置 `DEV_OPEN_ID`，让每位测试人员通过飞书真实登录进入系统。

## 页面

- `/daily`：动画师填写日报
- `/review`：导演、管理岗/制片审核日报
- `/account`：导演、管理岗/制片维护账号
- `/ranking`：排行榜查看

## 定时任务

`vercel.json` 已配置两个定时任务：

- 每天 18:00（北京时间）执行 `/api/cron/push-daily`
- 每天 23:30（北京时间）执行 `/api/cron/recompute-ranking`

接口会校验 `CRON_SECRET`。部署到 Vercel 时请在项目环境变量中配置它。

## 验证命令

```bash
npm run typecheck
npm test
npm run build
npm audit --omit=dev
```
