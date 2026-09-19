# 五简 UI / 语音动效接入说明

基线：`q592288175-spec/wujian-jarvis@1f34e3e544552319a2931aaf840b8245217a99f5`。
本包是新增资产和可复用模块，不是已应用的仓库补丁。实际工作区可能有后续提交；以当前工作区为准，禁止回退覆盖。

## 1. 已核验的文件与集成位置

| 文件 | 基线现状 | 应改内容 |
|---|---|---|
| `desktop/main.cjs` | 默认 BrowserWindow 原生标题栏，已有深色 backgroundColor | macOS 隐藏原生标题栏，原生三按钮、拖动、安全隔离全部保留 |
| `scripts/build-desktop.mjs` | 只复制 main.cjs、loading.html 到 stage，固定 darwin/arm64，asar:true | 修改壳后重新打包；若新建 preload，必须同时复制到 stage |
| `dist/index.html` / `dist/cockpit.html` | Unicode 导航图标；#callOrb 内是 CSS .wave；#callPanel 为通话浮窗 | 保留业务 ID，改为 SVG；接入核心，不把整张图替换成截图 |
| `dist/voice.js` | 同时 import/创建 VolcVoice 与 LiveVoice，动态插入 GPT-Live 按钮，localStorage 可选 gpt | 移除前端 GPT-Live 依赖和入口，迁移旧 gpt 设置到 volc，保留文字/火山 |
| `dist/settings.js` | 下拉有 gpt；每次加载请求 /api/live-voice/status | 移除 gpt 选项及请求，更新状态文案；不要破坏飞书设置 |
| `dist/volc-voice.js` | 同一个 AudioContext 负责 PCM 采集与 Ogg 分句播放；BufferSource 直接接 destination | 给输入/输出增加只读采样支路；保留 generation/audioGeneration 竞态隔离 |

来源：GitHub 以上文件的该提交。原仓库文档的“66项测试通过”不是本包运行得出的结论；集成后要在用户机器重新跑。

## 2. 最小资产路径

把 `assets/` 复制到 `dist/assets/wujian/`，把 `runtime/` 中模块复制到 `dist/ui/`。不要复制 demo 到生产首页。
在稳定版、预览版都加载 `/ui/tokens.css` 与 `/ui/voice-core.css`，保留原 CSS，再用局部选择器精修。
生产 `server.mjs` 的静态文件 MIME 要检查 `.mjs -> text/javascript`；也可以将这些模块统一改为 `.js` 并更新所有相对 import。不要发生浏览器将 JS 当下载文件的情况。

```html
<svg class="wj-icon" aria-hidden="true">
  <use href="/assets/wujian/icons/sprite.svg#wj-water-research"></use>
</svg>
```

外部 `<img src="...icon.svg">` 不继承宿主 currentColor。需要主题变色的图标使用内联 SVG 或同源 sprite `<use>`，不要误以为给 img 写 color 就可换色。
图标旁保留中文；纯图标按钮必须有 aria-label。Logo 不用 emoji，不把“五简”写成“无间”。

## 3. 真实音频分路：复用现有通话图，不再次申请麦克风

输入分支：

```text
同一次 getUserMedia 得到的 MediaStream
  └─ 现有 MediaStreamAudioSourceNode
       ├─ 现有 AudioWorklet → 16kHz PCM → 火山（保留）
       └─ inputTap.analyser → 仅可视化（不接扬声器）
```

输出分支：

```text
现有 decodeAudioData 得到的 Ogg 音频
  └─ 所有 AudioBufferSourceNode
       └─ 共用 playbackGain
            ├─ audio.destination（唯一听音路径）
            └─ outputTap.analyser（只读采样）
```

`AudioTap` 不会 getUserMedia、不创建 AudioContext、不记录、不上传、不连接扬声器。它的 dispose 只断开自己的连线，不会破坏原播放和采集。不要把麦克风接入扬声器“为了让分析器工作”。不要把分析器再接一次 destination 导致双重播放。

### 在现有 VolcVoice 的 AudioContext 和 source 建好后增加

```js
import { AudioTap } from './ui/audio-tap.mjs';

// 放在 connect() 中，复用 this.audio 和 this.source。
this.playbackGain = this.audio.createGain();
this.playbackGain.gain.value = 1;
this.playbackGain.connect(this.audio.destination);
this.inputTap = new AudioTap(this.audio).addSource(this.source);
this.outputTap = new AudioTap(this.audio).addSource(this.playbackGain);
this.onAudioGraph?.({ inputTap: this.inputTap, outputTap: this.outputTap });

// 每一段 Ogg 解码后的源，只替换连线，不改变原调度/隔离逻辑：
// 原先：s.connect(this.audio.destination)
s.connect(this.playbackGain);
```

constructor 的 options 与 Object.assign 显式补充可选 `onAudioGraph`、`onVoiceState`。别把上面片段当完整替换文件。

### 在 VoiceController 或 UI composition root 创建一次共享核心

```js
import { VoiceCoreController } from './ui/voice-core.mjs';
const mainHost = document.querySelector('#voiceCoreMain');
const callHost = document.querySelector('#voiceCoreCall');
const visualizer = new VoiceCoreController([mainHost, callHost]);
// 将这两个宿主插入已有 #callOrb 内/旁和 #callPanel 顶部，保留原点击与对话表单。
// VolcVoice 的回调接到这里：
// onAudioGraph: taps => visualizer.setTaps(taps)
// onVoiceState: facts => visualizer.setState(facts)
```

只创建一个可视化服务，把大核、浮窗小核一起传入；不要给每个图标开一个独立音频上下文。

## 4. 状态不靠字符串猜，不靠音量判断是否允许打断

独立事实：connection / working / micMuted / userSpeaking / agentSpeaking。它们不是互斥的“六选一”。麦克风静音和助手播报可以同时存在。正在研究时麦克风仍工作。

回调建议：
- connect 开始：connection=connecting；ready：connection=connected。
- partial 或服务端已有 VAD/interrupt：更新 userSpeaking；ASR final 对应 user 事件后清理该说话段状态。
- working：working=true；result：当前回答工作完成。后台研究任务的状态仍由原任务系统提供，不能被挂断清零。
- 播放状态来自 AudioContext.currentTime 与实际已调度播放区间。音频包到达、文本生成、s.start(未来时刻) 不等于当前已出声。
- 音量取 AnalyserNode 每帧读到的真实 PCM，不能取文本长度、WebSocket 字节数或 Math.random()。
- source.onended、clearAudio、interrupt、stop、错误、会话代次变动时，同步清理旧播放区间与 agentSpeaking。
- micMuted 只控制输入通道的可视化和原麦克风 track.enabled，绝不强制 agentSpeaking=false。

AudioBufferSourceNode 没有 onstart 事件。需要精确“正在播报”时，保存每段 `{source,start,end,generation,audioGeneration}`，在共享采样 tick 里按 this.audio.currentTime 判断区间是否活跃；不要凭不存在的事件写代码。模块只按外部事实显示文字，实时曲线始终从分析器读。

RMS 是音频电平，不是“语音活动检测算法”。背景噪声也会产生输入电平。打断仍使用现有火山事件 / VAD 策略，不要为做动效改坏通话策略。
这里检测的是应用音频图中的样本，无法知道 macOS 物理扬声器是否静音或硬件是否真正发声。

## 5. 停止和释放顺序

interrupt/clearAudio：保持现有 audioGeneration++、stop() 所有 BufferSource、清队列、playAt=0；更新 agentSpeaking=false、调用 visualizer.resetOutput()。输入分析器继续运行。

hangup/stop：先保留原有 generation++ 与旧异步结果隔离；清空音频源；inputTap.dispose() / outputTap.dispose()；playbackGain.disconnect()；visualizer.setTaps()；再关闭已有 AudioContext 和麦克风轨道；不要取消研究任务。服务级组件销毁才 visualizer.dispose()，普通挂断保留待机呼吸。

打开/收起面板不重建音频图。模块用 IntersectionObserver 和 visibilitychange 暂停不可见图形；它从不因为窗口隐藏而暂停语音或后台研究。原 Electron “关闭按钮仅隐藏窗口”的行为可能让通话继续，必须保留明确的“挂断”按钮并沿用用户原策略；不能暗中改变。

降低动效：系统 prefers-reduced-motion + 现有 body.reduced 开关要都接入 visualizer.setReducedMotion(...)。减少动效只影响视觉，不影响音频。

## 6. 原生顶部栏：正确修改而不是白色遮罩

建议 macOS 用 `titleBarStyle: 'hiddenInset'`，保留三色原生按钮。如果需要更精确位置，可改用 `titleBarStyle:'hidden', trafficLightPosition:{x:16,y:18}`。先选一种并在真机校准，不要反复叠加互相矛盾的窗口样式。

```js
window = new BrowserWindow({
  width: 1500, height: 980, minWidth: 1100, minHeight: 720,
  backgroundColor: '#050d18', title: '五简 JARVIS',
  ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' } : {}),
  webPreferences: {
    nodeIntegration: false, contextIsolation: true,
    sandbox: true, webSecurity: true,
    // 仅在确实添加 preload 时填写，并同步 build-desktop.mjs 复制它。
  }
});
```

用最小、安全的 preload / contextBridge 暴露只读 desktop/platform 标记，或在 preload 的 DOMContentLoaded 中给文档根节点加平台类。不要启用 NodeIntegration，不要为此扩大 IPC 权限。

```css
html.wj-desktop-macos body { margin:0; background:#050d18; }
html.wj-desktop-macos header {
  min-height:52px;
  padding-left:104px; /* 给原生红黄绿安全区；按真机尺寸微调 */
  background:#050d18;
  -webkit-app-region:drag;
  user-select:none;
}
html.wj-desktop-macos header :is(button,a,input,select,[role=button]) {
  -webkit-app-region:no-drag;
}
```

平台类只用于桌面 macOS，浏览器版不得多出 104px 无用空白。保留窗口菜单、全屏、最小化、窗口隐藏行为、麦克风权限对话、导航限制。不要删 macOS 屏幕顶部系统菜单栏。

`build-desktop.mjs` 把 main.cjs 打包进 asar；仅刷新网页不会更改已安装 app 的窗口壳。必须 `npm run desktop:build`，彻底退出旧进程后打开新产物。当前脚本把项目绝对路径写进 project.json，这是绑定本机项目的壳，不是自包含分发包；本次不要顺便重构分发架构。

## 7. 前端 GPT-Live 的精确清理范围

1. 移除 dist/voice.js 的 LiveVoice import、实例、动态按钮与 this.live 的 connect/mute/interrupt/stop 调用；保留 VolcVoice 和文字对话。
2. 移除 dist/settings.js 的 gpt option、/api/live-voice/status 请求和 GPT-Live 文案。
3. 读取 `jarvis-voice-provider` 时，把 `gpt` 或无效值迁移到 `volc`。在 settings 和 VoiceController 共用正常化函数，避免只改一个入口。
4. 审计 data-hub/app/index/cockpit 及其他 dist 模块的 GPT-Live 文案和可达请求。不要只全局 replace 一遍就声称完成。
5. 保留浏览器语音备用时明确其为“备用 · 识别+播报”，不要宣称全双工，也不要生成假输出波形。建议收进高级设置，主界面仅“文字/语音”。
6. `dist/live-voice.js` 仅在确认无其他前端依赖后删除。不删除 .env 中任何密钥、不删除后端 provider/接口、不删历史文档。用户本次明确是前端清理，后端退役可另做独立变更。

## 8. 来源（2026-09-19 核对）

- 原生标题栏：https://www.electronjs.org/docs/latest/tutorial/custom-title-bar
- 拖动 / no-drag：https://www.electronjs.org/docs/latest/tutorial/custom-window-interactions
- Web Audio 分析器：https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode
- 时域采样：https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode/getFloatTimeDomainData
- 仓库基线：https://github.com/q592288175-spec/wujian-jarvis/commit/1f34e3e544552319a2931aaf840b8245217a99f5
