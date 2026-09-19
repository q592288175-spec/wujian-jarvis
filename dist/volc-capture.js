class Capture extends AudioWorkletProcessor{
 constructor(){super();this.pending=[];this.position=0;this.output=new Int16Array(320);this.used=0;}
 process(inputs){const input=inputs[0]?.[0];if(!input)return true;for(const v of input)this.pending.push(v);const step=sampleRate/16000;while(this.position+1<this.pending.length){const i=Math.floor(this.position),f=this.position-i,v=this.pending[i]*(1-f)+this.pending[i+1]*f;this.output[this.used++]=Math.max(-32768,Math.min(32767,Math.round(v*32767)));this.position+=step;if(this.used===320){this.port.postMessage(this.output.buffer,[this.output.buffer]);this.output=new Int16Array(320);this.used=0}}const consumed=Math.min(Math.floor(this.position),this.pending.length);this.pending.splice(0,consumed);this.position-=consumed;return true;}
}
registerProcessor('volc-capture',Capture);
