# 本轮实施记录

基线 HEAD 1f34e3e544552319a2931aaf840b8245217a99f5；初始工作区干净。未回退、未修改凭据、不会推送远端。

源码检查点：.runtime/checkpoints/20260919-205910-source.tar.gz。

三个逻辑变更：
1. desktop/main.cjs、preload.cjs、loading.html、build脚本及 desktop.css：hiddenInset 原生标题栏和安全拖动区。
2. voice.js、settings.js、app.js、voice-provider.js：前端移除 GPT-Live，迁移旧设置，保留后端。
3. dist/assets/wujian、dist/ui、volc-voice.js、hologram.js、两个首页：SVG、双通道分析及结构化状态。保留真实行情与业务 ID。

验证结果随后记录于本目录验收报告。
