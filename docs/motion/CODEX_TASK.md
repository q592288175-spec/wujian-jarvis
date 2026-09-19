# 五简 JARVIS：UI 资产、真实语音声核、macOS 标题栏改造

你现在是这个项目的实施工程师，不要停留在建议或再次输出设计稿。使用本交付包，在当前真实工作区完成最小侵入的集成、测试、重新构建与验收。

## 背景与边界

仓库 `q592288175-spec/wujian-jarvis`，本包审阅基线 `1f34e3e544552319a2931aaf840b8245217a99f5`。
产品是“五简”，不是“无间”。主业务是国内期货只读研究；火山负责语音、DeepSeek 负责查询与研究。用户要去掉前端 GPT-Live，不是删掉全部语音。
本包没有替你改过仓库，也没有在真实 Mac 上验收。先看当前 HEAD、git status、AGENTS.md / checkpoint 规则；保留用户未提交修改和基线之后的真实数据改动。不执行 git reset --hard，不覆盖 .env，不先撤销其他人的工作。不自动推送远端。

先读本包 `README.md`、`docs/INTEGRATION.md`、`docs/DESIGN_SPEC.md`、`docs/ACCEPTANCE.md`，并在浏览器打开 `Wujian-Voice-Preview.html` 理解参考效果。预览不是金融产品首页模板，不可把整张页面或截图覆盖到生产。

## 任务一：去掉 Mac 应用上方白色原生标题栏

核对 `desktop/main.cjs` 的 BrowserWindow。优先仅在 darwin 使用 `titleBarStyle:'hiddenInset'`，保留原生红黄绿按钮；必要时选用 `hidden + trafficLightPosition` 精调。不要默认 frame:false，也不要用固定定位的深色 div 掩盖白条。
把现有深色 header 延伸至窗口顶端，留出三按钮安全区。空白区域可拖动；链接、设置、输入框、按钮用 no-drag。不要把 body 全部设为 drag，不要影响地球拖动、表格选择、图表交互。web/browser 访问保持原布局，不得多出桌面安全区。
保留 nodeIntegration:false、contextIsolation:true、sandbox:true、webSecurity:true 和已有麦克风授权 / 外链限制 / 菜单 / hide-on-close 行为。若添加 preload，只暴露最小只读桌面标记；必须修改 `scripts/build-desktop.mjs` 将其复制到打包 stage。加载页也使用深色背景，检查启动白闪。
改主进程后运行真实 `npm run desktop:build`。在不会干扰运行中研究的前提下，彻底退出旧应用，再打开本次新产物，实际截图验收；不能只截图浏览器宣称 Mac 白栏已去掉。

## 任务二：删除前端 GPT-Live 入口及其依赖

`dist/voice.js` 的 GPT-Live 按钮是 JS 动态创建，不在首页 HTML 中。移除 LiveVoice import/实例、动态按钮、gpt 分支以及 this.live 的 mute/interrupt/stop。保留 VolcVoice、DeepSeek 文字、火山原有插话和音频代次隔离。
`dist/settings.js` 移除 gpt 下拉、GPT-Live 状态文案及 `/api/live-voice/status` 请求。排查其他前端文件 / data-hub 等是否还暴露旧入口。
将 `localStorage['jarvis-voice-provider']='gpt'` 以及非法值迁移为 `volc`，统一处理函数供连接入口和设置页共用。保留浏览器语音备用时放进高级选项，标注“识别+播报，非原生全双工”。主界面只保留清晰的“文字 / 语音”，语音默认火山。避免“火山实时语音”“接通语音”等多个重复主按钮。
只在引用关系确认无误后删除无人依赖的前端 live-voice.js。不删除任何 .env 密钥、DeepSeek 配置、火山配置、后端 provider、用户数据或历史研究报告。

## 任务三：接入五行 SVG 资产与克制的界面动效

采用深墨蓝底、青白声核、低饱和五行点色。统一 24×24、1.6px 描边、圆角；用本包 SVG 替换 Unicode/emoji 图标。五行职能：火机会、水分析、金决策、土执行、木迭代。五行色不可改变报价涨跌含义。
将 assets 放入 `dist/assets/wujian/`，runtime 放入 `dist/ui/` 或符合仓库风格的目录。检查静态服务对 .mjs 的 JS MIME 支持，或统一改名 .js 并更新导入。优先复用原生 ES modules，不引入 React 或全新打包器，不加不必要的 Three.js 场景。
保留 index/cockpit 的业务 DOM ID、真实数据订阅、未知/过期/失联提示。背景仅装饰，不能画虚假行情轨迹或生成“研究进度百分比”。保留已有真实地球交互；通话时可降低其他装饰动效，避免地球、声核、全屏粒子同时抢眼。
SVG 无远程外链、无可执行脚本、无嵌入位图。交互按钮保留中文或 aria-label。主题色图标使用 inline/sprite，不误用 img 的 currentColor。

## 任务四：让 Agent 对话视觉真的跟随声音，而不是循环 GIF

集成 `runtime/audio-tap.mjs`、`voice-core.mjs`、`voice-core.css`。一套核心可同时驱动主界面与浮窗，保留点击唤醒入口。
在 `dist/volc-voice.js` 复用现有 AudioContext / MediaStreamAudioSourceNode：输入采集继续送 AudioWorklet，另挂 inputTap；所有解码后的 Ogg BufferSource 改接同一个 playbackGain，再由它唯一接 destination，同时旁挂 outputTap。不要第二次 getUserMedia，不要第二个 AudioContext，不要将麦克风回放进扬声器。
输入外环读实际麦克风时域样本；输出内环和核心缩放读实际播放图样本。RMS/频段只控制视觉，VAD/插话仍用原服务机制。禁止用文本长度、音频包到达、Math.random 或定时正弦波冒充真实语音。静音时仍可有克制待机呼吸，但不能假装在说话。
加入明确的结构化回调/状态适配，不靠 status 中文字符串匹配。基线 VoiceController.state 不随 VolcVoice 正确同步，必须修复，而不是只加 CSS。connection、micMuted、working、userSpeaking、agentSpeaking 是独立事实。工作时继续听，麦克风静音时也可播报。
BufferSource 没有 onstart。保存实际调度播放区间，用 AudioContext.currentTime 判断是否正在播放；曲线始终来自 AnalyserNode。不要把将来才会播放的队列当成正在说话。
clearAudio/interrupt 时保留 audioGeneration 隔离，停止并清掉旧音频和视觉输出；stop 时释放 taps/轨道/上下文，但不取消后台研究。挂断回到待机。收起面板不重建语音。隐藏文档暂停渲染，不暂停通话；支持系统 reduced-motion 和现有降低动效开关。
后台工作进度仅展示真实事件和原有任务状态，不能为好看生成假消息。

## 工程与验收

先提交/记录方案和受影响文件，再分 3 个可回滚逻辑变更：桌面壳、GPT-Live 前端清理、SVG/音频可视化。遵守工作区已有 checkpoint 习惯；不要假造已执行的命令。
必须运行原项目 npm test、npm run check，并对新增 .js/.mjs/main/preload 分别做语法检查；原 check 脚本不是自动覆盖所有新增文件。增加有针对性的测试，至少覆盖旧 provider 迁移、输入输出音量、静音与播放并行、打断清理、连续接通挂断、迟到音频解码隔离。
浏览器检查稳定版和预览版、DevTools 网络请求无 GPT-Live、SVG MIME 正确、界面无 console error、按钮无 drag 区误吞点击、权限拒绝回退可用。不得改动真实行情计算和只读交易权限。
使用 `docs/ACCEPTANCE.md` 在真实 Mac 新打包 app 验证白栏、按钮、拖动、全屏、麦克风、扬声器回声、真人插话。无法获得真人或 Mac 时明确“未验收”，保留操作步骤，不写“全双工已通过”。

最终交付：修改文件清单、逐项测试命令与结果、Mac 改前/改后截图、实际新 .app 路径、语音状态录像或说明、还未验收的项目、回滚方式。执行到能运行且可验证，不仅回复“建议这样做”。
