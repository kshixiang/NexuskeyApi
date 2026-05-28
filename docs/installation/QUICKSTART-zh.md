# NexuskeyApi 服务器安装指南（生产 + 域名）

适用：**宝塔 + Docker**，正式上线（PostgreSQL + Redis），域名示例：**https://nexuskey.eu.cc/**

详细参数见 [deploy-tool.md](./deploy-tool.md)。

---

## 能否把 IP 和密码交给工具自动部署？

| 方式 | 是否支持 | 说明 |
|------|----------|------|
| 在**服务器上**执行 `scripts/deploy.sh` | ✅ 推荐 | 脚本设计如此，一键完成 |
| 把 root 密码发给他人/AI 代部署 | ❌ **不要** | 泄露风险极高，本仓库不提供「收密码远程代装」 |
| 本机 SSH 登录后自己执行命令 | ✅ 推荐 | 用 SSH 密钥，密码不要写在聊天/文档里 |

**正确做法**：你自己 SSH 或宝塔终端登录服务器，复制下面命令执行。全程约 10–20 分钟（视网速而定）。

---

## 一、准备清单

- [ ] 云服务器一台（建议 **2 核 4G+**）
- [ ] 已安装 [宝塔面板](https://www.bt.cn/new/download.html)（≥ 9.2.0）
- [ ] 宝塔里已安装并启动 **Docker**
- [ ] 域名 **nexuskey.eu.cc** 已解析到服务器公网 IP（A 记录）
- [ ] 安全组 / 宝塔安全：放行 **80、443**（3000 可仅内网，见下文）

---

## 二、上传代码到服务器

任选一种：

**A. 服务器上 git clone（推荐）**

```bash
cd /www/wwwroot
git clone <你的仓库地址> NexuskeyApi
cd NexuskeyApi
```

**B. 本机打包上传**

将整份 `NexuskeyApi` 目录上传到 `/www/wwwroot/NexuskeyApi`。

---

## 三、一键部署（在服务器执行 — 使用你自己改过的代码）

在仓库目录执行时，脚本会**自动从本仓库构建镜像**（编译你的 Go 后端 + `web/default` 前端）。

> 「default」只是项目里新版前端的**目录名**（`web/default`），不是「官方默认皮肤」。你改的页面就在这里。

```bash
cd /www/wwwroot/NexuskeyApi
chmod +x scripts/deploy.sh
./scripts/deploy.sh install --dir /www/wwwroot/nexuskey-api --port 3000
```

不要用 `--upstream`（那是未修改的官方镜像）。等待出现 `API is healthy` 或脚本结束说明。

**检查：**

```bash
./scripts/deploy.sh status --dir /www/wwwroot/nexuskey-api
curl -s http://127.0.0.1:3000/api/status
```

浏览器可临时访问：`http://你的服务器IP:3000`（确认后再配域名）。

---

## 四、配置域名 HTTPS（nexuskey.eu.cc）

1. 宝塔 → **网站** → **添加站点** → 域名：`nexuskey.eu.cc`
2. **SSL** → Let's Encrypt → 申请并 **强制 HTTPS**
3. **反向代理** → 目标：`http://127.0.0.1:3000`
4. 站点 **配置文件** 中 `location /` 建议包含（流式 API）：

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
}
```

5. 浏览器访问：**https://nexuskey.eu.cc/**

生产环境建议在防火墙关闭公网 **3000**，只保留 80/443。

---

## 五、首次使用

1. 打开 https://nexuskey.eu.cc/ 按页面提示完成初始化（管理员账号等）
2. 后台若有「站点地址 / Server URL」，填：`https://nexuskey.eu.cc`
3. **备份** `.env`（含密钥，丢失会导致会话/加密问题）：

```bash
./scripts/deploy.sh backup --dir /www/wwwroot/nexuskey-api
```

---

## 六、常用运维命令

```bash
cd /www/wwwroot/NexuskeyApi

# 状态
./scripts/deploy.sh status --dir /www/wwwroot/nexuskey-api

# 改代码后更新线上（见第八节）
./scripts/deploy.sh update --dir /www/wwwroot/nexuskey-api

# 停止服务（数据保留）
./scripts/deploy.sh stop --dir /www/wwwroot/nexuskey-api

# 看日志
./scripts/deploy.sh logs --dir /www/wwwroot/nexuskey-api

# 备份 data + .env
./scripts/deploy.sh backup --dir /www/wwwroot/nexuskey-api

# 修复 classic theme not built
./scripts/deploy.sh fix-theme --dir /www/wwwroot/nexuskey-api
```

完整命令与参数见 [deploy-tool.md](./deploy-tool.md)。

---

## 七、已部署但不是自己的代码？先停再换

当前若是官方镜像，站点不会显示你改过的页面。在服务器执行：

```bash
cd /www/wwwroot/NexuskeyApi
git pull

# 一键：停止旧容器 + 用本仓库重新构建并启动（数据库数据保留）
./scripts/deploy.sh redeploy --dir /www/wwwroot/nexuskey-api
```

或分两步：

```bash
./scripts/deploy.sh stop --dir /www/wwwroot/nexuskey-api
./scripts/deploy.sh update --dir /www/wwwroot/nexuskey-api
```

确认镜像：

```bash
docker inspect new-api --format '{{.Config.Image}}'
# 必须是 nexuskey-api:local
```

---

## 八、改了代码后如何更新线上？

日常发布按下面做即可（详细说明见 [deploy-tool.md#代码更新](./deploy-tool.md)）。

### 标准流程（最常用）

```bash
# 在 Git 仓库目录执行（注意：不是 nexuskey-api 部署目录）
cd /www/wwwroot/NexuskeyApi

git pull
# 或：git pull origin main

# 可选：更新前备份
./scripts/deploy.sh backup --dir /www/wwwroot/nexuskey-api

# 重新构建并重启（约 5–15 分钟，数据库数据不丢）
./scripts/deploy.sh update --dir /www/wwwroot/nexuskey-api
```

浏览器 **Ctrl+F5** 强刷。

### 本机开发 → 服务器发布

```text
本机修改代码 → git push → 服务器 git pull → deploy.sh update
```

- **仓库目录**（放源码）：如 `/www/wwwroot/NexuskeyApi`
- **部署目录**（放 `.env`、`data/`）：如 `/www/wwwroot/nexuskey-api`
- `update` 从仓库构建镜像，在部署目录启动容器

### `update` 会做什么

1. 检测仓库有 `Dockerfile` 时，自动构建 **`nexuskey-api:local`**（你的 Go + `web/default`）
2. 默认**不**构建 `web/classic`（加快速度）
3. 写入 `DEPLOY_IMAGE=nexuskey-api:local` 到部署目录 `.env`
4. 强制重建并启动容器（PostgreSQL / Redis 卷保留）

无需手写 `--build`；**不要**加 `--upstream`（那是官方未改代码的镜像）。

### 什么要 update、什么不用

| 修改内容 | 是否需要 `update` |
|----------|-------------------|
| `web/default/` 页面、样式、前端 | **需要** |
| Go 后端 `.go` 文件 | **需要** |
| `Dockerfile` / 部署脚本 | **需要**（先 `git pull`） |
| 管理后台渠道、模型、用户、比例等 | **不需要**（在数据库里） |
| 只改部署目录 `.env` | 改完后 `update` 或重启容器 |

### 更新后自检

```bash
./scripts/deploy.sh status --dir /www/wwwroot/nexuskey-api

grep DEPLOY_IMAGE /www/wwwroot/nexuskey-api/.env
docker inspect new-api --format '{{.Config.Image}}'
```

必须是 **`nexuskey-api:local`**。若是 `calciumion/new-api:latest`，执行：

```bash
./scripts/deploy.sh redeploy --dir /www/wwwroot/nexuskey-api
```

### 其他命令

| 场景 | 命令 |
|------|------|
| 也改了 `web/classic` 老界面 | `update ... --with-classic` |
| 页面 `classic theme not built` | `fix-theme --dir /www/wwwroot/nexuskey-api` |
| 构建失败查日志 | `logs --dir /www/wwwroot/nexuskey-api` |
| 仅停止服务 | `stop --dir /www/wwwroot/nexuskey-api` |

构建失败时先 `git pull` 同步最新 `Dockerfile`，查看 `logs` 或构建终端最后几十行报错。

---

## 九、故障排查

| 现象 | 处理 |
|------|------|
| 页面显示 **classic theme not built** | 部署时跳过了 classic 前端，但数据库仍选 classic。执行：`./scripts/deploy.sh fix-theme --dir /www/wwwroot/nexuskey-api`，然后浏览器 Ctrl+F5。或在管理后台把「前端主题」改为 **新版前端（default）**。若必须用 classic UI：`update --with-classic` 重新构建（更慢） |
| 域名 502 | `status` 看容器是否运行；反代是否指向 `127.0.0.1:3000` |
| IP:3000 能开，域名不行 | 检查 DNS、SSL、反代配置 |
| 登录后会话失效 | 检查 `.env` 中 `SESSION_SECRET` 是否为空或被改过 |
| 流式输出中断 | 确认 Nginx 已加 `proxy_buffering off` 等（见第四节） |

---

## 十、相关文档

- [deploy-tool.md](./deploy-tool.md) — 脚本参数与环境变量
- [BT.md](./BT.md) — 宝塔其他安装方式
