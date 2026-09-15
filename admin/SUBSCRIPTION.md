# 活动订阅消息

报名成功弹窗现为「邀请好友探索」，用于微信好友分享，不再触发订阅。保留的订阅模块由页面调用 `subscribeActivity` 时，用户通过微信授权后，服务端立即发送一条报名通知。多个体验按同一次报名合并，以最早有效场次作为通知时间；点击通知进入该活动报名详情。当前功能不包含活动开始前定时提醒或持续推送。

## 配置

在微信公众平台的小程序「订阅消息」中选用与报名通知用途一致的模板，取得模板 ID 及完整字段列表。在服务端 `.env` 配置：

```dotenv
WECHAT_APP_ID=小程序AppID
WECHAT_APP_SECRET=小程序AppSecret
WECHAT_SUBSCRIBE_TEMPLATE_ID=微信分配的模板ID
WECHAT_SUBSCRIBE_FIELDS={"thing1":"title","time2":"datetime"}
WECHAT_SUBSCRIBE_STATE=trial
```

字段 JSON 仅为示例，键名必须替换成所选模板的真实字段。可映射值：`title` 活动名称、`name` 报名人、`date` 场次日期、`datetime` 场次日期与开始时间、`time` 场次时段、`experience` 体验名称、`status` 报名状态。根据微信字段类型和长度限制选择适合模板的字段（例如报名人姓名、状态不能随意映射到不同类型的字段）。`thing` 字段按 20 个 Unicode 字符截断。

`WECHAT_SUBSCRIBE_STATE` 为 `developer` 开发版、`trial` 体验版、`formal` 正式版（默认）。AppSecret 仅配置在服务端。Docker 部署更新配置后重新创建服务；代码更新需重新构建部署。小程序需重新编译/上传，服务端与小程序 AppID 必须相同。

## 行为与验证

- 未配置模板、字段映射无效或缺少微信凭据时，不发起微信授权。
- 一次报名的多个体验统一落到最早有效场次，重复点击及并发请求不会重复发送已发送的通知。
- 网络保存失败可以再次点击；当前页面保留授权结果，避免重复弹授权窗。
- `pending` 表示尚未发送，可再次点击触发处理；`sent` 表示微信发送接口返回成功。
- `failed` 表示微信明确拒绝，请管理员核对模板与授权问题，通过现有 `POST /api/admin/notifications` 重试接口处理；此接口要求管理员登录。
- `sending` / `unknown` 不自动重试，需人工确认微信投递记录，避免重复通知。

本地自动测试（Node 22.13+，已安装 admin 依赖）：

```sh
node --test miniprogram/tests/subscription.test.cjs admin/tests/subscription.test.mjs
```

订阅模块真机验收（需接入订阅入口）：使用同 AppID 的体验版完成报名，点击订阅并允许，检查微信服务通知及报名详情跳转；另验证拒绝授权、关闭订阅总开关、多个体验及连续点击。自动测试使用模拟微信响应，不证明品牌账号真实投递成功。
