# 流程与历史：只读检查记录UI复验

范围：项目固定ui-review；同原App、同purpose-limited合成metadata、1440×1000、DPR1、浅色、中文、字体就绪。before实际原guard拒读，after沿原流程Tasks页显示后台检查；不签真实B、业务批准或原件资格。临时Vite/Chrome已关闭。

问题与改动：原canonical入口遇新purpose全页不可用；新增专用只读bridge/section。首次看图发现技术错误抢主阅读、原“两类记录”介绍失配，已把错误收进原More展开并改为三类记录说明；标识相符不再写得像全部input已重核。未改CSS、配色或现有业务动作。

当前证据：`ui-evidence/before-cold.png` → `after-unknown.png`；报告`after-clear-report.png`、`after-stale-report.png`、`after-invalid-report.png`。实际More点击后原报告可见，unknown继续待核，stale继续历史。1180边界只用`after-boundary-1180-viewport.png`／`after-boundary-1180-panel.png`，原fullPage拼接异常图保留但不作结论。root/流程标题/section各1、页面宽1180、无横向溢出，键盘Enter能展开版本关联；见boundary-proof.json。

原色状态标签实际fg(173,67,0)/bg(255,232,214)局部对比度≥4.5，见contrast.json。正文scope实际14px、原行高23.1px；读图层级为小节→状态→含义→按需细节。所有button均为只读More，HTTP adapter调用记录仅GET。报告保存与终审/人类采用明确分开，无绿色通过样式。

| 原则 | 处置及证据 |
| --- | --- |
| 01 气质 | 已满足：沿用原SectionHead、pw-records、More、状态tag，无新色值 |
| 02 灰度 | 无法验证：未另做灰度图；有明确文字状态，不能冒称色觉验收 |
| 03 文字层级 | 已满足：实际截图与14px正文，状态/详情分层 |
| 04 减少竞争 | 已修复：技术错误不占主层，展开仍可查 |
| 05 冗余标签 | 已满足：仅版本/ID技术详情保留必要标签 |
| 06 操作层级 | 已满足：只有查看详情，无生产/批准动作 |
| 07 留白 | 已满足：复用原卡片与间距；1180/1440截图未见拥挤重叠 |
| 08 宽度 | 已满足：边界documentWidth=1180，panel1108，无横向溢出 |
| 09 归属 | 已满足：一job一卡，报告与版本详情在同卡 |
| 10 不同屏幕 | 部分已验：1180/1440桌面；项目移动端不在范围 |
| 11 行长行高 | 已满足于实测范围：中文说明换行、长JSON用原raw展开；未签所有长列表 |
| 12 对齐 | 已满足：原标签/标题与明细dl，实际看图无新增悬浮错位 |
| 13 色阶 | 已满足：完全复用原neutral/warn，未更动全站变量 |
| 14 对比度 | 局部已验：unknown tag实测≥4.5；不签全页WCAG或dark |
| 15 非颜色线索 | 已满足：排队、待核、历史、格式待核均有文字 |
| 16 局部边界 | 不适用：原卡片层级足够，不新增边线 |
| 17 图上文字 | 不适用：本section无叠图文字 |
| 18 素材尺寸 | 不适用：无新图像素材，沿用原disclosure图标 |
| 19 分割线 | 已满足：未追加分割或覆盖层，复用现有卡片 |
| 20 空态 | 已满足于新增范围：无records隐藏该section；queued无尝试、unknown待核、invalid格式待核分别显示；原研究空态保持 |

实际未验：真实native qualified报告、完整B快照、dark/手机、全站可访问性与用户效率。此次证实窄只读记录可以复用现有流程页；metadata hash只支持显示身份，不能替代后台原件资格。未发现需要修改Skill的新证据。
