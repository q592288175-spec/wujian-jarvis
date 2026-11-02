import {runDeepSeek} from './deepseek.mjs';
export async function runExpertModel({messages,signal,onRetry=()=>{},model=runDeepSeek}){
 try{return await model({signal,thinking:true,maxRounds:0,maxTokens:24000,messages})}
 catch(error){
  signal?.throwIfAborted();
  if(error.code!=='MODEL_LENGTH')throw error;
  await onRetry('正在自动压缩长报告，已采集资料保留');
  const result=await model({signal,thinking:false,maxRounds:0,maxTokens:16000,messages:[...messages,{role:'user',content:'上次生成超出长度限制。这次直接输出完整正文和完整JSON：正文1500至2500字，每个JSON文本字段不超过120字，claims仅6条，各quote控制20至60字。保留全部必查指标、数据缺口和引用，不改变证据标准。'}]});
  return{...result,totalTokens:result.totalTokens+(error.totalTokens||0),recoveredFrom:'length'};
 }
}
