# OnePitch 个人工作台

部署为一位所有者使用的私有站点。登录前统一保护工作台、项目 API、附件和预览；登录后进入「我的提案项目」。退出会撤销当前会话，网关重启后需要重新登录。

## 中国内地部署

域名在所有者自己的注册商账户下实名注册。选购可办理 ICP 备案的内地云实例，按接入商流程完成备案。以接入商允许接入的状态为准。域名 A 记录指向实例公网 IPv4。开放 80/443 给 Caddy，管理端口按云账户管理策略限制。工作台进程监听回环 4420，登录网关监听回环 4432。

在 Linux 安装仓库指定版本 Node（见 .node-version）、Python 3.11 或以上、Caddy 和 systemd。代码安装到 /opt/onepitch，在该目录执行 npm run setup:frontend、npm run setup:workbench、npm run build。两个 systemd 单元使用 /usr/bin/node；若安装到其他目录，请改成实际绝对路径。建立专用系统账户 onepitch。以管理员执行以下命令设置账号；密码由所有者在终端输入，环境文件只保存盐与 scrypt 校验值。

    install -d -m 700 /etc/onepitch
    python3 deploy/onepitch/configure.py /etc/onepitch/portal.env 你的域名

安装仓库中的两个 .service 到 /etc/systemd/system/，运行 systemctl daemon-reload。导入资料后运行 systemctl enable --now onepitch-app onepitch-portal。为 Caddy 服务设置 ONEPITCH_HOST，值与上一步的域名一致。在 Caddy 配置中加入本目录的站点块，验证配置后重载 Caddy，确认 HTTPS 签发成功。DNS、备案或证书未就绪时不要发布临时无鉴权入口。

## 搬迁项目

停止源工作台的新写入，保留源库和原件。在本机运行：

    python3 deploy/onepitch/export.py 新的快照目录 源数据目录 [其他源数据目录]

脚本通过 SQLite 读取一致的项目行，保留资料库独立上传的文件，并复制当前与历史记录引用的文件，逐件核对 SHA-256。项目 ID 冲突、文件缺失或目标已存在时停止。独立演练页面、散存在工作目录中的 PPT 和运行回执需要另行确认归属。它们不会自动成为项目的正式阶段成果。

使用受控通道把快照发送到服务器，停止服务后将其放在新的 /var/lib/onepitch/projects，所有者设为 onepitch，目录仅所有者可读写。保留迁移前备份，禁止覆盖已有数据库。上线后分别用无痕窗口验证未登录拒绝项目和文件读取、正确登录看到原项目、文件下载与清单摘要一致、退出后旧 Cookie 失效。定期做加密异地备份和恢复演练。

## 运行与模型设置

在服务器安装排版用的 Chromium 及系统依赖。一个可复用的方式是使用预览工程锁定的 Playwright，在安装目录执行以下命令。让运行服务的用户可以读取浏览器和 Python 环境。

    sudo env PLAYWRIGHT_BROWSERS_PATH=/opt/onepitch/browsers apps/workbench-preview/node_modules/.bin/playwright install --with-deps chromium
    python3 -m venv /opt/onepitch/venv
    /opt/onepitch/venv/bin/pip install -r tools/workbench/requirements-pdf.txt

随附的 onepitch-app 服务已设置 PLAYWRIGHT_BROWSERS_PATH=/opt/onepitch/browsers、NIGHTFLIGHT_PYTHON=/opt/onepitch/venv/bin/python 和 PATH=/opt/onepitch/venv/bin:/usr/local/bin:/usr/bin:/bin。修改单元配置后重新加载并重启服务。

登录后打开「菜单 → 模型与 API」，填写 DeepSeek 文字、OpenAI 视觉理解和生图的模型及 Key。保存后再主动开始项目测试。服务器需要能连接所选模型的官方接口及公开研究来源。账号、API 密钥和历史项目分别保存在部署机器上。复制 Git 仓库只能取得程序，要显示已有项目须先导入项目快照。服务器备份需同时保护私有模型目录及登录环境文件。

桌面版从仓库的 desktop/nightflight/build.sh 构建，使用 macOS 钥匙串。网页版的密钥单独设置。
