# 前端真实接口联调

当前入口 http://127.0.0.1:4280/ 使用用户提供的前端。后端4281使用独立数据库 `.data/frontend-integration-20261030/workbench.sqlite`。原4180与原项目不变。已恢复用户授权的既有CodexCLI文字提供方，模型gpt-6.1-sol；图像服务未配置，没有复制或读取密钥。

已接通项目、首页、任务卡保存与确认、历史、模式及人工节点，以及原始任务和产物读取。来源采集与明确选取依据的调研请求已接通。文字工作区已接核验、充分性、双侧交接、策略续接及修订。已生成真实调研并通过摘录核验，充分性超时等待用户决定补调。策略尚未实际生成，后续创作操作和真实PPT交付未验收。提供材料不等于来源已核验。原始附件二进制尚不能持久保存。

## 启动

需要Node24。当前会话已启动两项服务。停止后可以分别在两个终端运行以下命令。若4280或4281已占用，先查看已有服务，不启动重复实例。

后端使用明确的text-launch.json配置，并排除冲突的旧配置变量。保留既有登录环境；命令从项目根目录执行。

```sh
cd "/Users/marc/Documents/ChatGPT/调研agent"
env -u PORT -u WORKBENCH_DB -u WORKBENCH_EXECUTIONS -u WORKBENCH_MODEL -u WORKBENCH_IMAGE_CONFIG -u WORKBENCH_MAX_CONCURRENT_JOBS WORKBENCH_CONFIG="/Users/marc/Documents/ChatGPT/调研agent/.data/frontend-integration-20261030/text-launch.json" /Users/marc/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --max-old-space-size=512 tools/workbench/server.mjs
```

前端通过同源代理访问该后端。

```sh
cd "/Users/marc/Documents/ChatGPT/调研agent/apps/proposal-workbench"
VITE_WORKBENCH_API_URL=/api WORKBENCH_PROXY_TARGET=http://127.0.0.1:4281 /Users/marc/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4280 --strictPort
```

不提供 `VITE_WORKBENCH_API_URL` 的原有 `npm run dev` 仍为演示模式。真实模式不会回退到模拟提案服务。开发代理只改写实际同源请求的Origin，外来Origin仍由后端拒绝。

## 验证范围

实际HTTP服务层到SQLite的创建、重放、确认、版本、模式与冲突已验证。构建、类型检查和5项定向检查通过。浏览器控制被当前Work设置禁用，所以没有声明页面点击或视觉验收完成。

联调库中保留“得闲 · 前后端联调样本”。当前任务卡已按已授权的得闲范围确认，历史与原版本保留。最初缺模型的阻断记录保留。后续已取得三份可读资料、真实调研稿和核验报告；充分性调用超时，不能进入策略。

## 已修复的首次白屏

接口SSR验证曾与在线开发服务器共用Vite缓存，导致React等六项依赖返回504。测试脚本现使用每次运行独立的cacheDir，4280已强制重建缓存。相同模块检查由失败变为147项资源无加载错误。隔离SSR验证不会再改变在线依赖元数据。该检查仍不等于真实浏览器执行验收。

## 得闲来源与调研接线

资料库的来源页及提案的调研空状态均可进入真实采集面板。支持公开HTTPS采集，展示真实提取正文、候选图片链接与任务状态。勾选连续原文并注明用途与理由后提交调研；提供方未配置时页面显示后端原因并禁用生成。当前选择是页面草稿，刷新不保留。完整结果见 `.scratch/workbench-v1/dexian-intake-live-20261031/integration-report.md`。

## 充分性结果未知

得闲调研页已显示原调用、实际提议与未知费用。先检查并恢复保存结果，无新增调用。若仍未知，只能由用户实际核对提议、勾选确认并点击新增一次调用。代理不得代为授权。策略与后续是否可以继续取决于真实充分性、交接和后端状态，不能把任务成功当通过。当前结果见 `.scratch/workbench-v1/dexian-text-live-20261031/integration-report.md`。
