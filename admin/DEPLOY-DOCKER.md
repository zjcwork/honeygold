# Docker 测试环境部署

本目录 Dockerfile 和 compose.yaml 配套使用。包含 PC 后台和 API，不包含微信小程序代码。
构建使用 HONEYGOLD_RUNTIME=node，服务使用 Node.js 22 + SQLite，不需要 Cloudflare 账号。
部署时使用完整 admin 目录，包含 package-lock.json、源码和 drizzle 全部迁移文件。构建时会重新生成产物。

## 启动
在 Linux 服务器安装 Docker Engine 和 Compose v2，进入项目的 admin 目录：

```sh
test -f .env || cp deploy.env.example .env
chmod 600 .env
# 编辑 .env，填写 WECHAT_APP_ID、WECHAT_APP_SECRET
# 可选 HTTP_PORT=13001、BIND_ADDRESS=0.0.0.0
# 需要通知时填写 WECHAT_SUBSCRIBE_TEMPLATE_ID 和 WECHAT_SUBSCRIBE_FIELDS
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 honeygold
```

默认后台地址 http://服务器IP:13001/login，初始账号 admin，密码 admin。
首次登录后在用户管理修改密码。原 ADMIN_KEY 配置不再用于登录。
首次启动创建空数据库并运行迁移，不导入本机活动、会员或图片。

## 数据与升级

数据位于容器 /app/data/honeygold.sqlite，存放在 honeygold-data 命名卷，上传图片也保存在该数据库。
`docker compose down` 保留卷；不要执行 `docker compose down -v`，它会删除数据库卷。
保持同一 Compose 项目目录或固定 -p 项目名，避免升级时误用一个新卷。

```sh
# 停机备份整个数据目录，避免遗漏 WAL 文件
mkdir -p backups
docker compose stop honeygold
docker compose cp honeygold:/app/data ./backups/data-backup
docker compose start honeygold
# 更新代码后重新构建和启动
docker compose up -d --build
```

## 小程序访问

当前测试地址为 http://124.160.73.118:13001/，需确保服务器端口映射及防火墙允许访问。小程序测试接口为 http://124.160.73.118:13001/api。
微信体验版应配置 HTTPS 域名和微信合法域名；在反向代理中转发至服务器13001端口。
将 miniprogram/config.js 的 baseUrl 改为 https://测试域名/api 后上传体验版。
若使用反向代理，上传图片接口应接收到正确的外部 Host/协议，上传后检查图片地址。
单实例部署；不要用多个容器同时运行当前自动迁移流程。

## 已完成验证

本机已验证 Node 生产构建、服务启动、SQLite 自动迁移、默认管理员登录及后台接口。
本机未安装 Docker，尚未执行 Docker 镜像构建和容器启动。
