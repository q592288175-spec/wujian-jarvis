const ENDPOINT='https://api.deepseek.com/chat/completions';
export const modelName=()=>process.env.DEEPSEEK_MODEL||'deepseek-flash';
export const modelStatus=()=>({provider:'DeepSeek',model:modelName(),configured:!!process.env.DEEPSEEK_API_KEY,audio:'browser-speech',nativeRealtime:false});
export async function runDeepSeek({messages,tools=[],execute,signal,thinking=false,onTool=()=>{},fetchImpl=fetch,maxRounds=6}){
 if(!process.env.DEEPSEEK_API_KEY)throw Error('DeepSeek密钥尚未配置');
 const context=messages.map(m=>({...m}));const allowed=new Set(tools.map(t=>t.name));const calls=[];let usage=0;
 const timeout=AbortSignal.timeout(240000);const combined=signal?AbortSignal.any([signal,timeout]):timeout;
 for(let round=0;round<=maxRounds;round++){
 combined.throwIfAborted();
 const body={model:modelName(),messages:context,thinking:{type:thinking?'enabled':'disabled'},...(thinking?{reasoning_effort:'low'}:{}),max_tokens:thinking?7000:1800,stream:false};
 if(tools.length){body.tools=tools.map(t=>({type:'function',function:{name:t.name,description:t.description,parameters:t.parameters}}));body.tool_choice=round===maxRounds?'none':'auto';}
 let r;try{r=await fetchImpl(ENDPOINT,{method:'POST',headers:{Authorization:'Bearer '+process.env.DEEPSEEK_API_KEY,'Content-Type':'application/json'},body:JSON.stringify(body),signal:combined})}catch{throw Error(combined.aborted?'DeepSeek请求已取消或超时':'DeepSeek网络连接失败')}
 if(!r.ok)throw Error(r.status===401?'DeepSeek密钥无效，请检查本机配置':r.status===402?'DeepSeek账户余额不足':r.status===429?'DeepSeek请求频率或额度受限，请稍后重试':`DeepSeek服务返回错误（${r.status}）`);
 const data=await r.json();const msg=data.choices?.[0]?.message;usage+=data.usage?.total_tokens||0;if(!msg)throw Error('DeepSeek未返回有效内容');
 if(data.choices[0].finish_reason==='length')throw Error('模型回答达到长度上限，请缩小研究问题后重试');
 context.push(msg);
 if(!msg.tool_calls?.length){if(!msg.content?.trim())throw Error('模型未返回可显示的回答');return {text:msg.content,model:data.model||modelName(),provider:'DeepSeek',totalTokens:usage,tools:calls};}
 if(round===maxRounds)throw Error('模型工具调用超过上限');
 for(const call of msg.tool_calls){combined.throwIfAborted();const name=call.function?.name;let result;if(!allowed.has(name)){result={error:'工具未授权'};}else{try{const args=JSON.parse(call.function.arguments||'{}');if(!args||typeof args!=='object'||Array.isArray(args))throw Error();onTool(name);result=await execute(name,args);calls.push(name)}catch{result={error:'工具读取失败或参数无效，不得补造结果'}}}
 context.push({role:'tool',tool_call_id:call.id,content:JSON.stringify(result)});
 }
 }
 throw Error('研究未返回结果');
}
