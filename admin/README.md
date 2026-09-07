# 蜜金活动管理服务

`npm install` 后配置 `.env`，运行 `npm run dev`。本地演示使用 `DEMO_MODE=true`，线上正式服务设为 false 并配置管理密钥、微信 AppID / AppSecret。

- `/` 运营后台；`/mini` 浏览器预约预览。
- `/api/events` 活动列表；`/api/events/:id` 活动与场次。
- `/api/auth/demo` 仅演示；`/api/auth/admin` 管理密钥；`/api/auth/wechat` 微信登录。
- `/api/bookings` 当前用户预约查询 / 创建；`/:id/cancel` 取消；`/:id/reschedule` 改签；`/:id/ticket` 私有凭证。
- `/api/admin/overview` 运营数据；`/events` 编辑；`/event-status` 发布状态；`/slots` 名额；`/checkin` 核销。

生产表结构通过 Drizzle 迁移管理。`npm run db:generate` 生成新增迁移。已应用的迁移不可修改。`tests/api-flow.mjs` 对运行中的演示服务进行实际接口测试，会创建测试数据。

私有预览不等于已上线微信小程序。手机号正式授权需品牌配置；订阅消息已包含授权、队列、发送和失败重试，须配置模板与字段映射后验证正式投递。演示条款和活动地点上线前需品牌确认。
