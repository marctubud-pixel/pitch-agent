# 图片解析依赖公告修复

Status: resolved

两个仓库前端现将PptxGenJS的image-size限定为2.0.3，PptxGenJS仍为3.12.0，未改案例内容。对应[ICNS公告](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr)与[JXL和HEIF公告](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq)的修复版本已核对；两份更新锁的安装审计均零公告。

实际复现旧安装1.2.1对恶意零长度ICNS进入超时，更新安装拒绝同一输入；正常PNG尺寸和PPTX原图字节保持。`npm run test:dependency`将超时隔离在子进程，纳入默认检查，既有旧前端亦在同版修复依赖下验证。新安装还暴露对间接Node类型的依赖，现已显式声明并加载Node类型。

青屿23页实际生成保留3原生图表和3工作簿。原生PowerPoint渲染、浏览器实际下载及正式业务通过不由这次结构检查替代。冻结预览和历史依赖目录保持原位，不宣称已替所有历史环境升级。
