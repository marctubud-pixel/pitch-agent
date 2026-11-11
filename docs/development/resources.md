# 源码、资源与导入身份

规范版本：1.0.1。本轮保留原件，在新应用目录导入当前可用实现，不将旧apps版本覆盖到当前预览。

## 归属

| 对象 | 仓库位置及处理 |
| --- | --- |
| 当前预览源码 | `apps/workbench-preview`，来自原scratch活跃源；导入明细为`source-import.json` |
| 必要图片 | 应用`public`，原图、研究参照、生成试稿保持原字节与来源登记 |
| 测试证据 | `test-fixtures/provenance/manifest.json`映射历史身份至147份原字节；不要求读取原本机路径 |
| 历史前端与后端 | `apps/proposal-workbench`及三组tools源码、测试、合同、必要合成夹具和vendor |
| 原始run与交付 | `.scratch`、`.audit`、`.data`、`output`及外部用户PDF原位保留，不整体上传 |
| 缓存与构建 | node_modules、dist、Python缓存等可再生成，不纳入新版本 |

## 身份检查

`source-import.json`记录原路径、目标路径和初次字节SHA，适配清单说明仓库内变更。初次导入保留原字节；后续维护为依赖、显式类型与HTTP状态等变更保存适配理由和新SHA，原导入记录与业务原件继续保留。今后正常功能修改须更新适用版本和身份记录，保留原导入证据，不靠刷新SHA冒充原票仍有效。

`scripts/repository-files.json`逐项列出纳管文件，`scripts/check-repository.py`检查文件闭包、导入变化与证据身份。新文件须有明确用途再入清单；忽略规则不会删除原件或移除已有Git对象。

## 来源与权利

仓库没有为全部内容新授予统一开源许可。研究引用图片、品牌资产及外部原文权利归其原权利人，来源URL、SHA和适用边界继续保留。`public/research-case/luma-uk-20261109/ATTRIBUTION.json`是来源与研究用途说明，不是再分发许可证。

生成青屿主图、草图和样机为虚构案例试稿，不代表正式通过。研究生成情景也不当作消费者证据。使用者对外发布或正式使用时须按对应资源授权范围处理。

`tools/workbench/vendor/jpeg-js`保留BSD-3-Clause LICENSE及PROVENANCE。npm依赖以锁文件和各包许可证为准；第三方方法来源按现有method-provenance保留，不伪造上游版本或改变历史生成身份。
