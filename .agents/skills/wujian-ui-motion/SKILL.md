---
name: wujian-ui-motion
description: 为五简 JARVIS 集成五行 SVG 资产、真实输入输出语音可视化、macOS 原生标题栏和前端 GPT-Live 清理。用于该项目 UI 与语音视觉改造，不用于交易决策、下单或替换现有语音服务。
---

# 五简 UI / Audio Motion

先读当前仓库 AGENTS.md、git status 和实际代码，保留所有用户修改。基线参考提交是 1f34e3e，但不把它当当前 HEAD。名字必须写“五简”。

找到随技能提供的五简 UI 资产包，先读 CODEX_TASK.md 与 docs/INTEGRATION.md、DESIGN_SPEC.md、ACCEPTANCE.md。如果没有资产包，不要假称已有文件；只实施工作区真正存在的内容。

执行原则：
1. 复用现有原生 HTML/CSS/ES modules；保持真实数据和现有交易只读边界。不能为视觉伪造行情、在线、任务进度或语音活动。
2. 唯一主视觉是五行声核，图标统一24×24 / 1.6px描边。金木水火土是职能色，不是涨跌方向。
3. GPT-Live 只清前端入口/依赖/请求/旧设置，保留火山、DeepSeek、密钥及后台研究。
4. Mac 白栏从 BrowserWindow 改，保留原生按钮、no-drag 交互和安全隔离；新增 preload 必须同步打包。改完壳重新构建，再验真实 app。
5. 用同一 AudioContext：麦克风采集旁路 analyser、播报 gain 旁路 analyser。绝不把麦克风接到扬声器，不重复播放，不再次申请设备。
6. 待机是装饰呼吸；说话形变必须来自真实样本。结构化状态与电平分离，麦克风静音不等于停止助手播报。VAD/插话不由视觉电平重写。
7. 保留 generation/audioGeneration 异步隔离。interrupt清旧音频；挂断释放资源不取消后台研究；隐藏页面仅暂停渲染；支持 reduced-motion。
8. 新增代码做单元测试和浏览器验证，Mac功能在新打包产物中验收。合成输入测试不等于真人回声/全双工体验通过。

交付修改文件、测试命令与证据、新 app 路径、已验收/未验收项目、回滚办法。不自动推送，不声称看过没有打开的页面，不声称完成未跑的测试。

## 本项目集成位置

资产在 dist/assets/wujian，运行模块在 dist/ui；接入规范与验收记录在 docs/motion。原任务存于 docs/motion/CODEX_TASK.md。
