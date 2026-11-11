# 现有PPT依赖的image-size安全公告

Status: ready-for-agent

独立锁定安装后的npm audit实际报告1项high、0项critical，节点为image-size 1.2.1，经pptxgenjs 3.12.0引入。公告为[GHSA-5p2g-fcmc-qvqq](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq)和[GHSA-w3rx-r6r6-pgpr](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr)，涉及特定图片格式解析的无限循环。

本轮未自动执行npm audit fix或跨主版本覆盖。PptxGenJS的browser映射将image-size禁用；这条静态信息不证明所有调用路径都不受影响，Node侧使用范围仍需核查。旧前端的锁也保留原版本，不能只改一个锁就声称项目清零。

验收先核应用及工具实际调用，选择兼容的依赖升级或隔离方案，再跑两个前端适用测试、实际同版PPT导出和图片路径，重新保存锁与audit结果。原始audit输出留在本地本轮验证目录，Git保留具体版本与公告索引。当前CI验证功能和明示边界，不声称安全公告已解决。
