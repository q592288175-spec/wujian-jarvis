# 小木背景降亮与完整标识

按本人反馈，九页背景统一降低饱和度和亮度；背景层使用 saturate(.32)、brightness(.55)、opacity .22，文字与多空信号不受滤镜影响。正文面板采用实色深灰，边框降低对比，原五行主题保留为轻微氛围。

两版页头使用完整透明标识 `dist/assets/wujian/brand/wujian-complete-logo.png`，图内包含五元素与“五简交易系统”，旁边只写“小木”。原独立符号保留用于小尺寸 favicon。

修改范围：`dist/workbench-theme.css`、`dist/index.html`、`dist/cockpit.html` 和新增标识。业务接口、账户、筛选规则与交易逻辑没有修改。

验证：九页1500px截图、九页1100/390px无横向溢出；背景单独像素检查最高通道值38至43（满值255）；正文辅助文字对比度9.05:1。浏览器无脚本错误、无业务写请求，验收前后业务表清单一致。多空与地球配色相关7项测试通过。Windows独立构建启动通过，当前旧窗口已无草稿刷新，监控运行状态保持。

对比度参考：https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html 。这里只核验上述文字配色，不声称全站无障碍认证。

截图与验证：`output/quiet-theme-2026-10-19/`。

改前文件：`output/quiet-theme-2026-10-19/before/`。仅需恢复其中三个界面文件即可回到上一版鲜艳背景与独立符号，不恢复数据库。

新版桌面构建：`.runtime/desktop-build-quiet-20261019/小木-win32-x64/小木.exe`。旧构建保留。
