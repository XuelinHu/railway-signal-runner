# Railway Signal Runner

<p align="center">
  <img height="20" alt="Vue 3.5.28" src="https://img.shields.io/badge/vue-3.5.28-4FC08D" />
  <img height="20" alt="Vite 7.3.1" src="https://img.shields.io/badge/vite-7.3.1-646CFF" />
  <img height="20" alt="CesiumJS 1.137.0" src="https://img.shields.io/badge/cesiumjs-1.137.0-6CADDF" />
  <img height="20" alt="Three.js 0.182.0" src="https://img.shields.io/badge/three.js-0.182.0-000000" />
  <img height="20" alt="PostgreSQL configured" src="https://img.shields.io/badge/postgresql-configured-4169E1" />
  <img height="20" alt="License GPL-2.0" src="https://img.shields.io/badge/license-GPL--2.0-3DA639" />
</p>

基于 Vue 3、CesiumJS、Three.js 和 GLTFLoader 的第一人称铁道信号巡视小游戏。

## 功能

- 第一人称视角移动、鼠标视角控制、移动端方向控制
- 复用 `railway_sign` 中的铁路、车站、桥梁、信号机、机车和人物 GLB 模型
- 铁路沿线信号机巡视目标、计时、速度、里程和完成度 HUD
- CesiumJS 小地图同步显示玩家位置和线路点位
- 本地音效开关、重置、地图显示切换

## 平台能力

- **账号全流程**：注册、登录、退出、修改密码、忘记密码（无 SMTP，由管理员在后台生成一次性重置链接）。
- **管理台**：概览、用户管理、登录日志、训练场景、训练记录、AI 对话、AI 调用日志、模型管理、系统信息，**每个菜单都支持分页查询**（每页条数、筛选、排序、页码钳位）。
- **智能体**：右下角悬浮球或游戏内按钮唤起弹框，支持多轮对话与流式输出；模型从 Ollama 已下载清单里下拉选择、按需加载。
- **语音**：语音播报与语音对话。桌面端走浏览器 `speechSynthesis` / Web Speech，安卓端走原生桥接，
  桥接契约与安卓侧义务见 [`docs/android-voice-bridge.md`](docs/android-voice-bridge.md)。

## 运行

```bash
npm install
npm run dev
```

默认开发地址：

```text
http://localhost:4029/
```

## 构建

```bash
npm run build
npm run preview
```

如果已构建 Android release，`npm run build` 会在 Vite 清理 `dist/` 后自动保留 `dist/signal-runner-release.apk`。

## 测试

```bash
npm test
```

PostgreSQL API 集成测试只允许连接名称以 `_test` 结尾的隔离库，并使用本地 Ollama 协议桩，不会启动真实模型：

```bash
RUN_POSTGRES_INTEGRATION=1 node --env-file=server/.env --test test/postgres-api.integration.test.js
```

## 资源

模型资源位于 `public/assets/models`，来自当前工作区的 `railway_sign/public/assets/models`。
<!-- codex-runtime-config:start -->
## 运行配置与数据存储

- 前端端口：`4029`，Vite 开发和预览服务均绑定 `0.0.0.0:4029`。
- 后端 API 端口：`8038`，绑定 `0.0.0.0:8038`；FRP 自动映射为公网 `47.120.48.245:18038`。
- 本机访问：`http://127.0.0.1:4029/`。
- FRP 外网访问：`http://47.120.48.245:14029/`。
- 浏览器只与 `:4029/api/*` 通信，由 Vite 代理转发到 `:8038`；**开发和预览两条链路都配了代理**，代理会剥掉 `Origin` 头（Ollama 0.19 对带 `Origin` 的请求直接返回 `403`）。

### 命令

```bash
npm install
npm run db:init                                        # 使用项目运行角色幂等建表
npm run seed:demo                                      # 造分页验证用的演示数据（demo- 前缀，可 --clean）
npm run dev                                            # 前端 4029
npm run api                                            # 后端 8038（api:dev 为 node --watch）
```

首次部署前，由 PostgreSQL 管理员在目标实例执行 `server/postgres/provision-role.psql`，按提示创建本项目专属数据库和受限运行角色，并在 `server/.env` 配置该角色凭据。应用运行角色不负责建库或管理其他项目；随后运行 `npm run db:init` 初始化 schema。Windows 本机 PostgreSQL 18 示例：

```powershell
$pgAdmin = Read-Host 'PostgreSQL 管理员角色'
& 'C:\Program Files\PostgreSQL\18\bin\psql.exe' -h 127.0.0.1 -p 5432 -U $pgAdmin -d postgres -f server/postgres/provision-role.psql
```

PowerShell 下可交互输入管理员密码，避免把明文放进命令参数：

```powershell
Read-Host '管理员密码' -AsSecureString | ForEach-Object {
  $p = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($_)
  try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($p) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p) }
} | node --env-file-if-exists=server/.env scripts/seed-admin.mjs --username admin --password-stdin
```

### 浏览器本地数据库

- IndexedDB / Dexie，数据库名 `railway-signal-runner`，对象仓库 `scenes`、`records`。
- 未登录或离线时仍走这条链路，老师端和学生端在无后端时照常可用。

### PostgreSQL

- 已真实接入运行时，API 直接读写；数据库名 `railway_signal_runner`，初始化脚本 `scripts/init-postgres.mjs` 只执行 schema migration，不创建数据库。
- 运行连接使用 `PGUSER=railway_signal_runner_app` 和本项目独立口令；`deipss` 等管理员身份仅用于人工 provision，不得放进应用运行配置。LAN 连接可设置 `PGHOST=192.168.1.9`、`PGPORT=5433`。
- 表：`users`、`refresh_tokens`、`password_reset_tokens`、`login_logs`、`ai_conversations`、`ai_messages`、`ai_request_logs`、`system_settings`、`audit_logs`，以及扩展后的 `training_scenes`、`training_records`。
- 配置模板见 `server/env.example`，复制为 `server/.env` 后填写；`server/.env` 已被 `.gitignore` 忽略，**切勿提交**。

备份使用 `pg_dump` custom 格式和 AES-256-GCM 加密。先在 `server/.env` 设置独立的 32 字节随机密钥 `DB_BACKUP_ENCRYPTION_KEY`（64 位十六进制）；默认快照存入 Git 忽略的 `backups/` 目录：

```bash
npm run db:backup
```

恢复需要一个已创建、与源库不同且以 `_test` 结尾的目标数据库，并必须显式传入 `--replace`。恢复前会先验证快照认证标签，再由 `pg_restore` 在单事务中替换目标对象：

```bash
npm run db:restore -- --source backups/runner-snapshot.pgbak --database railway_signal_runner_restore_test --replace
```

`npm run test:db:backup` 会从当前 `PGDATABASE` 备份，并创建唯一隔离恢复库；请先将 `PGDATABASE` 指向 `_test` 数据库。恢复测试库保留供复核。

### 模型服务（Ollama）

- `OLLAMA_BASE_URL=http://192.168.1.9:11434`（局域网 Ollama；模型请求仅在用户主动发起时执行）。
- 模型清单优先取 `GET /api/tags`（权威），失败时回退到扫描 manifests 目录并标注来源。
- 本机 `OLLAMA_MODELS` 未设置，Ollama 以 `ollama` 系统用户运行，实际目录是 `/usr/share/ollama/.ollama/models`；可用 `OLLAMA_MODELS_DIRS` 显式覆盖扫描路径。
<!-- codex-runtime-config:end -->

## 开源协议

本项目使用 GNU General Public License v2.0（GPL-2.0）开源，详见 `LICENSE`。

## 启动端口

网页入口：4029；后台服务：8038。完整启动约定见 [PORTS.md](./PORTS.md)。
