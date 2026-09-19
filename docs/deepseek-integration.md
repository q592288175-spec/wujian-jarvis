# DeepSeek统一模型接入 · 2026-09-19

所有活跃语言模型入口统一使用 DeepSeek V4.1 Flash，官方ID `deepseek-flash`，固定官方端点 `https://api.deepseek.com/chat/completions`，无其他模型自动回退。

- 文字与语音转写问答：`/api/chat`，支持真实行情、研究方法、现行规则、官方搜索与读取、启动/查询后台研究工具。
- 后台品种报告：`/api/research/run`，改为同一DeepSeek适配器；报告记录provider/model/token数和工具列表。
- 语音识别与播报：浏览器SpeechRecognition/SpeechSynthesis。语言推理由DeepSeek完成。此为分段语音链路，不是原生实时音频模型；浏览器不支持语音识别时明确提示并保留文字。
- 原OpenAI Realtime和Codex Live路由返回410；旧适配器仅保留作回滚代码和测试，不再由服务器导入。
- 公开资料通过服务器的搜索/官方域名读取工具查询；搜索无结果明确缺口，不使用模型记忆伪造检索结果。来源检索不发送模型密钥。

密钥仅存本机被Git忽略的`.env`，权限600；`.env.example`只有变量名。不会修改全局Codex模型配置。公开源内容一律视为证据，不能改变系统指令或授予操作权限。

验证：官方/models返回deepseek-flash；实际Chat Completions返回200并确认model；真实行情工具链调用成功；网页文字问答成功；中证1000报告完成，返回model=deepseek-flash并已在UI读取。22项自动测试通过。未测试用户麦克风或实际听感。

参考：https://api-docs.deepseek.com/ 、https://api-docs.deepseek.com/guides/tool_calls/ 、https://api-docs.deepseek.com/guides/thinking_mode/
