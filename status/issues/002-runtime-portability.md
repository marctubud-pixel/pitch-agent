# 原生工具与运行配置可移植化

Status: ready-for-agent

`tools/auto-layout`部分文件引用个人Codex运行库、字体和Python路径，原生图表writer存在个人目录静态导入；部分旧测试还依赖未上传output案例。`tools/workbench`的本机供应商、终审host及部分runner也带机器身份限制。

验收需按真实模块边界显式配置依赖、隔离可选本机适配与纯域逻辑，在新目录或新机器安装并实际生成核验。保留现有历史身份及原生证明，不作全局路径替换。供应商真实能力、原生PPT渲染、在线编辑保存与预算另按授权验收。
