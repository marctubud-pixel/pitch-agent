# SIMPLE策略至三方向文案运行合同

规范版本：1.1.0。本合同描述当前七阶段HTTP文案接续。业务方法沿用[文案负责人](../agents/copy-owner.md)，策略三板块及受阻诊断继续遵守[策略合同](simple-strategy.md)。本包不恢复旧复杂策略Skill。

## 当前原生链路

当前已核SIMPLE策略，经原生双负责人交出和接收、同源owner edge commit，派生唯一`copy-message-v2`任务。copy生成三方向实际正文，再分别登记全文核验及原四岗独立评审。不得通过任意`request-stage copy`替代原owner commit。

输入继承当前任务卡、完整policy、研究放行、问题计划、SIMPLE正文SHA、原交接包及限制。研究r7、reader、事实、readiness、semantic和研究双负责人要求保持。原生commit和实际claim重核当前来源与绑定，旧稿不能跟随新策略冒充当前。

默认创建授权仍为research。服务器`creationAuthorizedThrough`可为新工程项目显式配置final_review，公共创建body不能上传或提升终点，不通过`set-policy`升级旧案。执行还需明确开关及完整岗位配置，授权终点本身不开放视觉至交付。

## 六个受限接口

路径前缀为`/api/v1/projects/:id`。每个POST都有`commandId`和`expectedRevision`，下表只列其余字段。

| 方法与路径 | 其余字段 | 行为 |
| --- | --- | --- |
| GET `/copy-workflow` | 无query | 读取当前文案工作区和原生报告，不执行任务 |
| POST `/strategy-continuations` | 策略`artifactId` | 复用原continueStrategy，只建立本来源的owner edge |
| POST `/simple-strategy/confirm` | 策略`artifactId`、`contentHash`、`reason` | 显式人工采用当前已核策略 |
| POST `/copy-workflow/step` | `edgeId`、`jobIds` | 仅执行明确1至4个当前queued且零attempt的原任务 |
| POST `/copy-workflow/verify` | 文案`artifactId` | 登记同版独立全文核验，执行另由step推进 |
| POST `/copy-workflow/review` | 文案`artifactId` | 登记原完整四岗panel，执行另由step推进 |

接口沿用严格字段、128KiB JSON、方法、loopback Host、明确Origin和query守卫。返回包络为`{project,view,copyWorkflow,capability,revision}`，POST另含`receipt:{commandId,replayed,operation,jobIds}`。异步读取前后核同revision。

`copyWorkflow.protocolVersion`为`simple-copy-workspace-v1`，含任务卡和策略身份、sourceCurrent/current、人工节点、edge、copyJobId、artifactId/contentHash/content、queuedJobIds、unknownJobs、ownerReports、verification、creativePanels、creativeReports及creativeDecision。三方向来自实际正文，不填青屿默认稿。GET固定`originalsVerified:false`，报告投影不等于逐份物理重验全部原票，也不替代下游原生交付权威。

## 人工采用与固定任务

strategy人工节点未确认时，confirm先核当前SIMPLE正文SHA、同版无阻断全文核验及非空理由，再以服务端本机humanContext调用原生`adopt-creative`。前端使用`decide/strategy`权限，其余写操作使用workflow权限，游客只读。该操作不是`release-stage`，导航、交接按钮和默认选择不代签。服务端当前是本机`local-operator`，不代表生产账号鉴权或客户批准。

`copyHttpRequests`保存原body、完整快照、固定edge及job bindings。actual claim携带原账本ID和捕获revision，再核任务卡、policy、研究、问题计划、SIMPLE来源及binding。重放只处理原集合，不能用后来eligible替换原任务。仅原selected全部明确成功后，按本来源推进consumer、commit和copy；owner推进受`onlyArtifactId`限制，panel推进受当前artifact限制，不扫描其他edge或项目。

前端BriefWriteJournal保留精确path/body，回执核command、operation、jobIds及原生保存记录。丢响应时显式核对原提交，不换命令。continue和confirm恢复定位策略页，step、verify和review定位文案页。已知历史回执与原生unknown分开，核对成功不证明业务完成。

## 原评审与严格投影

原四岗为文案、品牌、目标用户模拟、传播。各岗保存score_first_read、score、opposition_first_read、opposition，再加director裁定，共17节点。匿名首读、原校准evidenceHash、适用必评至少4分、未知、有据硬退和异议裁定继续按原native creativeDecision判断，不借视觉均分，不手算综合通过。

前端`copyCreativeProjection`核完整冻结packet及实际SHA、17唯一key和job、role、phase、依赖、每个creativeInput和原前置报告。正文、任务卡、policy、sources、upstreamConstraints和匿名subjects均绑定原packet。只核数量或局部node不足以准入。同步`sha256`仅用于native snapshot读取准入，不证明原票物理完整、模型校准、语义质量或业务批准。

合法历史packet保留其原任务卡与policy，可继续只读。current能力和服务器写门禁另判；新Brief不能让整个历史项目不可读。原报告、推荐、人类选案分别保存，AI四岗不是客户或真人消费者研究。

## 原件、恢复与未接范围

新step与review另保存copy-durable-advance-v1、原scope与实际完整binding。固定job组完成、或原panel登记后，先按CAS写唯一随机marker及真实claimOwner；从存储核回自己的claim后才推进一次。原progress由同marker和owner保存。exact原body重放只读该结果，关闭执行器也不安排后来eligible任务。

marker后中断或结果保存失败保持advance_pending，GET不推进，新COPY命令和actual start/retry停止。旧无此协议的step/review只读返回advance_state_unrecorded；不补造历史结果，不允许换ID或省略准入借旧job升级。当前scope的未记录状态、历史原记录与当前业务资格分别呈现，不误挡另一合法新scope。pending核回、解除及视觉unknown恢复均未开放。

已通过原IO核回的SIMPLE可凭原生reconciliation证明合法进入双负责人及下游。原attempt仍保持awaiting_reconciliation，原作者、executor、receipt、packet和正文身份不改。独立IO身份复核只证明来源和未重复执行，不能代替原生校准或业务质量判断。

copy、owner和creative的unknown仅保留原记录，本包没有原件恢复端点，不重置queued或重派。策略修订、文案改稿及异议触发的再评仍待接。视觉参考与后端草图路由另按[受限合同](visual-workflow.md)接线；完整App草图/v2、成稿、样机、同版Deck、终审、可编辑PPTX及包装/KV两类整链仍需实际接入和验收。

原件、坏文件、失败票、旧数据库及青屿身份保持。本地合成HTTP测试证明接缝，不证明真实异议已解决、审美通过或客户选案。当前根最终检查、实际UI与PR #9按真实回执登记，候选owner自述不能替代根验收。专项入口见[验证范围](testing.md)。
