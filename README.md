# AI创意提案工作台

从Brief生成有来源的研究、策略、文案与视觉，再排成可讲解、可导出原生PPT的静态提案。当前中文桌面与样本预览可用，通用正式业务编排和部分服务仍未接通。

## 开发先从这里读

- [Agent和页面规范基线](docs/specs/README.md)：岗位、16页规格、固定方法、版本与待定范围。
- [现行七阶段](docs/workflows/提案工作流_现行规则.md)：当前执行顺序；历史流程另存，不混作新规则。
- [当前实际状态](status/current.md)：原生回执和实现导航，不能用规范文件替代运行结果。
- [源码与Git纳管范围](docs/specs/repository-scope.md)：本轮规范基线保护哪些文件，活跃源在哪里。
- [版本截图图册](http://127.0.0.1:4418/)：本地只读HTML入口；原单文件在 output/version-atlas-20261111/index.html。

## 检查规范

```sh
python3 scripts/check-specs.py
python3 scripts/check-specs.test.py
```

规范修改按[版本与PR规则](docs/specs/change-control.md)，登记版本、更新变更记录，复核后刷新锁。内容和页面分别有合同；有岗位不代表必须有复杂Skill，策略继续用两项基础要求。

本轮先形成规范提交；尚未纳入Git的源码、数据库和历史产物不能靠该提交回退。GitHub目的仓库尚未配置，真实PR未创建。原[项目首页](README.history-20261111.md)、[历史工作流](docs/workflows/提案工作流_历史_截至20261111.md)与原件继续保留。
