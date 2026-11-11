# 后端旧测试夹具与当前草图授权不一致

Status: ready-for-agent

运行`npm run test:backend:legacy`可复现旧project测试中的10项失败。当前`project.mjs`要求专门的已评审草图生成权限，旧`project.test.mjs`的produce/release帮助函数仍尝试通过旧通用路径推进，报`REVIEWED_SKETCH_REQUIRED`。

本轮8文件试运行实际100项中90通过、10失败。失败原件保留在本地，未放宽守卫、删测试或声称后端全量通过；根默认核心测试是另外明示的7文件范围。

验收需先核当前专用草图合同和有效阶段分工，更新合成夹具并重跑受影响测试，保留未知、独立评审及版本约束。不能只把当前拒绝改成允许来消除失败。真实生成、付费与旧run恢复仍不在授权内。
