# 五简 UI 与双通道语音集成验收记录

日期：2026-09-19。macOS 26.6.2 (25G83)，Apple Silicon，Electron 44.4.3。

## 交付结果

已在当前项目实施，没有回退或推送远端。开始时 HEAD 为 1f34e3e544552319a2931aaf840b8245217a99f5，git status 干净。保留 .env、后端 GPT provider、DeepSeek、火山和全部报告。

新原生应用：[五简 JARVIS.app](/Users/a1-6/Desktop/五简文件/五简个人资料/五简个人资料/2026年8月文件/codex/8月生成内容/2026-09-18_五简JARVIS_Web工作台_验证中_v1.0/.runtime/desktop-build-motion/五简 JARVIS-darwin-arm64/五简 JARVIS.app)

这是绑定当前本机项目路径的桌面壳；前端和服务端由原有本机工程加载，不是独立分发包。旧 .runtime/desktop-build 产物保留。

## 修改清单

- 桌面：desktop/main.cjs 使用 darwin hiddenInset；desktop/preload.cjs 只添加平台类；desktop/loading.html 保留深色加载页；scripts/build-desktop.mjs 复制 preload，并可指定独立输出目录；dist/desktop.css 设置原有 header 拖动区、原生按钮安全区与 no-drag 控件。
- 前端入口：dist/voice.js、settings.js、app.js、voice-provider.js 清理 GPT-Live 并迁移旧 gpt/非法设置到 volc；删除无人使用的 dist/live-voice.js；后端不动。保留浏览器备用，收进高级设置。
- 资产：dist/assets/wujian/ 包含32份SVG与品牌PNG；稳定版/预览版局部使用logo、五行图标、导航图标和背景。dist/hologram.js 只移除旧小声球，主地球保留。
- 声核：dist/ui/audio-math.js、audio-tap.js、voice-core.js、tokens.css、voice-core.css、integration.css；dist/index.html、cockpit.html 增加两个声核宿主，原有业务DOM ID全保留。
- 语音：dist/volc-voice.js 复用原AudioContext、麦克风和音频调度；输入只读tap，输出共用gain与tap；以音频时钟判断实际播放；独立状态回调；静音立即清输入，打断清输出；迟到解码和授权结果隔离；拒绝/超时可重试，防止叠加待处理授权请求。
- 测试：tests/motion-audio.test.mjs、motion-integration.test.mjs；tests/live-voice.test.mjs 保留后端两项，删除随退役前端失效的两项。
- 文档：docs/motion、docs/motion-evidence、.agents/skills/wujian-ui-motion/SKILL.md。

完整逐文件清单见 files.txt。

## 实际测试

| 检查 | 结果与边界 |
|---|---|
| 原项目 npm test | 最终88项通过、0失败；原有行情/研究测试仍执行。包括10次合成接通挂断、资源释放、排队未播放、静音与播报并行、打断、迟到解码、拒绝授权、待处理授权去重 |
| npm run check | 通过 |
| 新增/相关文件 node --check | 10个文件通过，详见 new-file-syntax.txt |
| 资产包 npm test / npm run check | 16项通过；包内语法检查通过 |
| SVG审计 | 32份SVG均可解析，无script、foreignObject、嵌入位图、事件属性或外部href |
| DOM兼容 | 稳定版、预览版相对起始HEAD全部业务ID保留 |
| 静态服务 | voice-core.js 返回200 text/javascript；sprite.svg 返回200 image/svg+xml |
| 浏览器稳定版与预览版 | 都实际打开，无捕获到的console error；设置页无GPT选项；40条被捕获网络请求中无旧live-voice请求 |
| provider迁移 | 临时设置gpt，刷新后实际变为volc；浏览器没有macOS平台类，header左间距30px；测试后已重载恢复页面，无音频夹具保留 |
| 浏览器真实Web Audio合成样本 | 使用现有VolcVoice创建的单一输入流/上下文；输入和输出均测得非零，实际播放时agentSpeaking为true，打断清空；不是真人麦克风测试 |
| 静音回归 | 初次合成测试发现外环衰减，修复后输入立即0、输出约0.698、清输出后0；见 browser-audio-mute-fixed.json |
| npm run desktop:build | 真实构建成功，独立输出目录；asar包含preload和hiddenInset，实际运行进程路径属于新产物 |
| Mac标题栏和按钮 | 新窗口截图无原白色原生标题条；设置按钮可点击。原生关闭/全屏/最小化控件在AX树中保留；未充分完成三按钮逐项动作验收 |
| Mac麦克风 | 原生权限弹窗实际出现；拒绝后显示错误且能重试；授权后火山连接成功、计时推进、静音状态同步 |
| Mac拖动/全屏 | 发起过拖动操作，但没有可靠窗口坐标前后对照；全屏动作遇到界面变化保护，未判定通过 |

## 截图

- [改前：旧原生白标题栏](../motion-evidence/mac-before.png)
- [改后：新原生窗口与已接通语音](../motion-evidence/mac-voice-connected.png)
- [后续窗口现场](../motion-evidence/mac-after.png)

截图来自真实Mac应用，不是浏览器预览。左上角紫色标记是截图现场的系统指示，未通过页面绘制替代原生按钮。

## 仍未验收

1. 真人说话外环、真人插话的实际延迟、扬声器回声、耳机对比；未宣称真人全双工通过。
2. Mac全屏进出、三色按钮完整行为、拖动位移、多显示器与不同缩放倍率；安全策略已保留并做源码/asar核对，不能替代这些操作验收。
3. 启动白闪逐帧录像、长时间内存和真实设备10次通话压测；合成生命周期测试不等价。
4. 包中的Python Playwright browser_smoke.py未原样执行；本次采用CUA浏览器开发接口进行实际页面、网络及Web Audio夹具检查。
5. 原生应用连接验证完成后用户开始操作，为避免打断没有强制重载；最后的授权去重/静音立即归零/入口状态补丁在下一次挂断并刷新后加载。

## 回滚

改前源码检查点：.runtime/checkpoints/20260919-205910-source.tar.gz。不要直接覆盖当前目录；先解压到新目录对比，保留新用户修改。

本轮分三个本地逻辑提交：桌面壳、GPT前端清理、声核资产集成。完整回退可在确认无未提交修改后按逆序revert这些提交，不使用reset --hard。旧应用壳仍在 .runtime/desktop-build，但它也会读取当前前端，单开旧壳不等于完整源码回滚。

未执行git push。密钥未写入代码、报告或截图文件名。
