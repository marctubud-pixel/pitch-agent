# R2 岗位独立评分与旧问题复核

只在本角色匿名首读已保存后执行。读本目录FACTS.md，再读其指向的事实、固定协议、v2/draft.json和SEAL、v2/RESPONSE.json。另只读 reviews/r1-本角色/score.json 定位该岗位旧问题；不读其他岗位评分、对抗或总监推荐。作者解释只能核验，不能替代句子实际说出的信息。

保留首读原件，按同一REVIEW-PROTOCOL的本岗位两组四项逐案独立重评。不继承旧分，不因为需要完成而放宽，也不把真实受众接受未知直接等同虚构文字概念必须失败。三案机制是否不同，读者收获及主副文协作的优缺点需引用实句；换句诊断是工具，允许不对称，不要求六组语法都不成立。不凭作者说它不同就认可，不单因三个方案共享同一产品事实就否定。

写本角色目录 score.json 和score.md，所有分数保持你自己的判断。输出采用以下可核验结构。

- schema_version=2，run_id=qingyu-copy-full-20261110，stage=slogan，role=copy/brand/user/comms之一，model_id为实际分派模型，packet_version=r2，report_id唯一。
- input_hashes记录实际读取文件的SHA-256，必须含v2稿件、原首读和协议；first_read保留本角色原件路径及SHA，可概括首读与核验后理解的区别，不能改原首读。
- items精确覆盖n7/k4/v2，各有id、scores、positive_claims、issues、hard_rejects、decision、scope及limits。
- scores精确四项。每项含dimension_id、group=direction或copy、dimension、score=1至5或null、status=scored/unknown/not_applicable、required=true、evidence引用实句及理由、comparison_scope=same_set、comparison_ids。两组各两项，维度名沿用协议本岗位表。
- positive_claims每条含唯一id、具体claim和文字evidence。issues每条含唯一id、evidence、severity=blocker/major/minor、blocking布尔、stage=slogan、suggested_action。0异议可以，不凑数。
- 必评项低于4、关键unknown、硬退或当前阻断不能由平均数抵消。decision仅pass/revise/hold/reject_use，不是客户批准。
- previous_issues逐条复核本岗位R1旧问题，注明closed/retained/deferred及新实句证据；作者的addressed_in_draft不是自行关闭。
- pairwise对三对实际文字进行比较并写出保留与损失，set_decision及set_reason单独给出。推荐不由本岗位决定。

4为达到给定文字概念基准，5需具体对照证明超过基准。内部模型尺度不代表真实消费者、客户或传播测试。不存在的产品事实和实际效果继续标明未知。报告可以简洁，不用复制整套作者说明。保存并验证JSON后结束turn。
