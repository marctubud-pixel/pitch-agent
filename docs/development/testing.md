# 验证范围与已知失败

规范版本：1.5.1。默认验证目标是可检出的当前应用、规范和明示核心域边界。它不证明所有历史后端测试、原生渲染或业务流程均通过。

| 命令 | 实际验证对象 |
| --- | --- |
| `npm run check:specs` | 规范、引用、版本、固定方法及截图，另含隔离反例 |
| `npm run check:repository` | 明示文件与Git受控集合、导入和封存证据，含真实隔离Git反例；无Git时明确只核清单 |
| `npm run typecheck` | 当前预览应用TypeScript |
| `npm run test:frontend` | 当前应用共置测试，含案例、哈希绑定、权限与导出结构 |
| `npm run test:core` | 明示的存储、身份、枚举分区、客户端恢复和图表证据测试 |
| `npm run build` | 当前应用生产构建 |
| `npm run test:domain` | 已修的26项域合同与专用权限拒绝；不证明正式生成链成功 |
| `npm run test:brief-http` | 受限简报服务与新SQLite，含原生重放回执、冲突、请求边界与无任务恢复 |
| `npm run test:dependency` | 恶意图片终止、正常PNG和PPTX图片原字节；子进程隔离超时 |
| `npm run test:backend:legacy` | 兼容旧命令，现转到test:domain |

默认命令集合写在根package.json，CI执行同一套入口。锁定安装曾报告、现已修复的image-size公告见[005](../../status/issues/005-dependency-advisory.md)，两更新锁审计已零公告，冻结历史环境另记。新增测试依赖先确认它是否需要真实服务、预算、个人运行库或旧案例资产，避免通配运行所有旧脚本。

## 历史失败及本轮修复

原project测试22项中10项依赖旧通用成功夹具，遇到当前专用授权拒绝。现有26项保持生产守卫、按当前合同重建实际成功和拒绝边界，已纳入默认检查；覆盖见[映射](backend-fixture-coverage.md)。

当前78项核心测试与26项域测试是明示集合，不能称后端全量通过。正式后半生产链和原生成功仍在002、003，不因测试转绿而关闭。

前端HTTP集成测试另用实际受限服务处理器和SQLite，覆盖类型、旧隐藏字段、真实作者、业务版本、附件元数据、创建恢复、同版冲突及刷新后重放。实际TCP及UI未覆盖范围见[简报HTTP联调](http-brief.md)。

## 实际界面与产物

页面改动按项目[UI审核方法](../../skills/ui-review/SKILL.md)核真实运行界面、目标桌面和交互，保存前后证据及未覆盖状态。测试、截图和构建分别支持对应结论，不相互替代。

同版Deck的浏览器下载须定位实际文件并绑定SHA，核页序、原文、图片字节、图表工作簿和原生对象。PowerPoint实际渲染与在线编辑保存仍需另验，不能由PPTX结构测试推断。

单纯源码导入先证明生产文件原字节、必要资源和全部测试证据在仓库内闭合，再于独立入口核运行。原件历史绝对路径只保留身份，测试通过专用映射读取仓库内原字节。

## 当前七阶段与研究接入

新协议、来源登记、受限研究与原件读取、方法绑定和缺能力时停止的具体范围见[接续说明](seven-stage-research.md)。当前已接同版独立正文阅读、实际修订复查与研究声明/放行，详见[读者合同](research-reader.md)。自动采集和后续生产仍未完成；默认不执行模型。

## PDF原件子路径

默认test:brief-http加入brief-intake-service与brief-original-http两组，使用自有小SQLite与原件fixture，覆盖未确认保存/读取/重开、同体恢复、跨项目/错版/损坏、字段与HTTP边界，原件子包当时不执行解析或模型。前端intakeHttp使用真实受限处理器与Blob，实际Chrome和独立只读UI另见[本轮核验](brief-originals-verification-20261111.md)。该PDF保存核验不覆盖读者运行；读者新工作包另见下节，策略仍待接。


## 研究读者回归

`test:research-contract`覆盖预登记、完整正文、独立席位、原生调用、typed修订、逐项处置、同版复查、owner绑定、真实文件损坏及恢复。部分测试启动仅本机合成HTTP提供方；不访问真实模型或旧run。前端reader测试调用当前native处理器及新临时SQLite，验证原文SHA、回执、权限和丢响应同体恢复。

实际Chrome及独立只读UI另留[核验记录](research-reader-verification-20261111.md)。范围包括理解通过的工程正例与仍待补的实际界面负例，不把测试数量或UI通过当成研究语义质量。全链包装/KV及PPT验收仍按总目标另做。

## 本地PDF解析专项

当前`test:brief-http`另含解析HTTP组。本地无专用Python环境时仍测原件/缺能力/旧卡及HTTP边界；真实解析专项明确skip。Application CI在独立虚拟环境安装固定PDF依赖并明确设置PITCH_PDF_TEST_PYTHON，真实专项不能以skip代替通过。指定环境后运行：

```sh
PITCH_PDF_TEST_PYTHON=/absolute/path/to/python3 npm run test:brief-http
```

指定但不能运行应FAIL，不能把skip计通过。真实专项涵盖partial/空页/no_text/UTF16、加密/非法/资源限制、原件与JSON哈希、同body/错body/换卡历史、失败显式重试和running未知零重发；仅新临时SQLite和已装本地工具。首claim永久中断尚无接管，不冒称所有恢复已完成。前端及Chrome实际范围单独按最终回执记录，后续全链与原生PPT专项不由此通过。

`intake-python-environment.test.mjs`加入Brief/PDF组：标准无pip symlink venv通过.pth引用已装实际包，真实probe/mixed/UTF16与资源限制验证配置环境；直接Python、缺路径、调用中配置变动、symlink重定向/删除分别核受控结果。它不安装软件或修改系统环境。原realpath后spawn基础解释器的失败反例保留；CI同样必须以配置venv运行。
