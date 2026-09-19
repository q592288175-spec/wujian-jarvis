import * as lark from '@larksuiteoapi/node-sdk';
import QRCode from 'qrcode';
import {createBindingService,persistBinding} from './im-binding.mjs';
import {startFeishu,stopFeishu,setFeishuSchedule} from './feishu.mjs';
lark.defaultHttpInstance.defaults.timeout=15000;
export const registration=createBindingService({register:options=>lark.registerApp(options),qr:url=>QRCode.toDataURL(url,{width:320,margin:3,errorCorrectionLevel:'M'}),persist:persistBinding,activate:async()=>{stopFeishu();await setFeishuSchedule({enabled:false,times:['15:30','21:00']});await startFeishu()}});
export async function disconnectFeishu(){if(registration.isSaving())throw Error('请等待绑定完成');registration.stop();await persistBinding({disabled:true});stopFeishu();await setFeishuSchedule({enabled:false,times:['15:30','21:00']});return {ok:true}}
