# 同版核证包

请读取 inputs/SOURCE-BRIEF.md、inputs/REVIEW-PROTOCOL.md，以及 v1/draft.json 和 v1/SEAL.json。保存的匿名首读不能重写，作者解释不等于广告自身已传达。

冻结原稿SHA256：15b7760a4b4e1c1ffa0c8ef29a523ef18c3aaed24549900375529365711382c7。完整原稿含三案主张、机制、假设与换句诊断，没有作者推荐或分数。资料只按SOURCE-BRIEF的来源界限使用。

每角色针对三个对象输出自己的岗位报告。items[].scores 每项含dimension_id、group:direction/copy、dimension、score、status、required、evidence、comparison_scope:same_set、comparison_ids。按角色协议两方向项与两文案项，四项均required，不用平均分签发岗位或整组通过。

items[]另含positive_claims[{id,text,evidence}]、issues[{id,evidence,severity,blocking,stage,suggested_action}]、hard_rejects、decision:pass/revise/hold/reject_use、scope、reason、limits。整组另写pairwise三对、主副文互换的具体结果、set_decision、set_reason、unresolved。

报告全局 schema_version:2、run_id:qingyu-copy-full-20261110、stage:slogan、role、model_id、packet_version:r1、input_hashes、report_id、calibration记录引用、first_read引用与限制。不要读取其他角色或替作者修文。可以全部退回，不因目标是完成而给4；5必须明确相对本轮已锁尺度好在哪里。模拟用户/传播结论不当作真实偏好或效果。
