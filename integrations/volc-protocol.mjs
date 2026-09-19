import {gzipSync,gunzipSync} from 'node:zlib';
const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32BE(n);return b};
export function pack(event,payload={},sid=null,audio=false){const body=gzipSync(audio?payload:Buffer.from(JSON.stringify(payload)));return Buffer.concat([Buffer.from([0x11,audio?0x24:0x14,audio?0x01:0x11,0]),u32(event),...(sid?[u32(Buffer.byteLength(sid)),Buffer.from(sid)]:[]),u32(body.length),body]);}
export function unpack(data){const b=Buffer.from(data);if(b.length<8)throw Error('short frame');const type=b[1]>>4,flags=b[1]&15,serial=b[2]>>4,zip=b[2]&15;let at=(b[0]&15)*4;const read=()=>{if(at+4>b.length)throw Error('truncated frame');const v=b.readUInt32BE(at);at+=4;return v};let event=null,code=null;
 if(type===15)code=read();else{if(flags&1)read();if(flags&4)event=read();if(event!==null){const length=read();if(length>4096||at+length>b.length)throw Error('invalid id');at+=length}}
 const size=read();if(size>8*1024*1024||at+size!==b.length)throw Error('invalid payload');let payload=b.subarray(at);if(zip===1)payload=gunzipSync(payload,{maxOutputLength:8*1024*1024});else if(zip!==0)throw Error('unsupported compression');return {type,event,code,audio:serial===0,payload:serial===1?JSON.parse(payload.toString()):payload};
}
export const sessionParameters=()=>({asr:{extra:{end_smooth_window_ms:700}},tts:{speaker:'zh_female_xiaohe_jupiter_bigtts'},dialog:{bot_name:'五简助手',system_role:'你是语音通道。不要提供金融分析，实际研究由外部工具处理。',speaking_style:'简短自然的普通话',extra:{input_mod:'audio',model:'O',recv_timeout:60}}});
