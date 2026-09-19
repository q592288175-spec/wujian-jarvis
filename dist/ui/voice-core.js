import { clamp, smoothEnvelope, ringPoints, presentationState } from './audio-math.js';
let nextId = 0;
const EMPTY = Object.freeze({level:0,rms:0,wave:null,bass:0,mid:0,high:0});
function markup(id) {
  const ticks=Array.from({length:60},(_,i)=>`<path d="M240 32v${i%5===0?9:4}" transform="rotate(${i*6} 240 240)"/>`).join('');
  const colors=['#d6bd7a','#88b6a2','#78badc','#db927f','#b7a18a'];
  const nodes=colors.map((c,i)=>`<circle cx="240" cy="42" r="2.5" fill="${c}" transform="rotate(${i*72} 240 240)"/>`).join('');
  return `<div class="wj-voice-art" aria-hidden="true"><svg viewBox="0 0 480 480" focusable="false">
  <defs><radialGradient id="wj-aura-${id}"><stop stop-color="#76e4df" stop-opacity=".23"/><stop offset=".48" stop-color="#369b9e" stop-opacity=".09"/><stop offset="1" stop-color="#369b9e" stop-opacity="0"/></radialGradient>
  <radialGradient id="wj-body-${id}" cx="42%" cy="32%"><stop stop-color="#335f69" stop-opacity=".7"/><stop offset=".45" stop-color="#112e3c" stop-opacity=".8"/><stop offset="1" stop-color="#071923" stop-opacity=".3"/></radialGradient>
  <linearGradient id="wj-edge-${id}" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#d1fffa"/><stop offset=".5" stop-color="#76e4df"/><stop offset="1" stop-color="#376c82"/></linearGradient>
  <filter id="wj-glow-${id}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3"/></filter></defs>
  <circle class="wj-aura" cx="240" cy="240" r="217" fill="url(#wj-aura-${id})"/>
  <g class="wj-calibration" fill="none" stroke="currentColor" stroke-width="1">${ticks}<circle cx="240" cy="240" r="191" opacity=".45"/></g>${nodes}
  <g class="wj-orbits" fill="none" stroke="currentColor"><ellipse cx="240" cy="240" rx="180" ry="78" transform="rotate(-35 240 240)"/><ellipse cx="240" cy="240" rx="180" ry="78" transform="rotate(35 240 240)"/></g>
  <g class="wj-nucleus"><circle cx="240" cy="240" r="104" fill="url(#wj-body-${id})"/><circle cx="240" cy="240" r="105" fill="none" stroke="url(#wj-edge-${id})" stroke-opacity=".4"/>
  <g fill="none" stroke="url(#wj-edge-${id})" stroke-width="1.1" opacity=".3"><ellipse cx="240" cy="240" rx="61" ry="103"/><ellipse cx="240" cy="240" rx="27" ry="103"/><ellipse cx="240" cy="240" rx="102" ry="37"/><ellipse cx="240" cy="240" rx="102" ry="72" transform="rotate(-25 240 240)"/></g>
  <circle cx="240" cy="240" r="53" fill="url(#wj-aura-${id})"/><g fill="url(#wj-edge-${id})" transform="translate(240 240) scale(.26)">${Array.from({length:5},(_,i)=>`<path d="M0-138C47-139 96-116 121-76L91-49C72-81 41-98 9-94L-16-105Z" transform="rotate(${i*72})"/>`).join('')}</g></g>
  <polygon class="wj-output-glow" points="" fill="none" stroke="url(#wj-edge-${id})" stroke-width="3" filter="url(#wj-glow-${id})"/>
  <polygon class="wj-input-wave" points="" fill="none" stroke="#78badc" stroke-width="1.25" stroke-linejoin="round"/>
  <polygon class="wj-output-wave" points="" fill="none" stroke="url(#wj-edge-${id})" stroke-width="1.75" stroke-linejoin="round"/>
  <g class="wj-work-arc" fill="none" stroke="#d6bd7a" stroke-width="2"><path d="M240 59A181 181 0 0 1 330 83"/></g>
  </svg></div><div class="wj-core-caption"><span class="wj-state-dot"></span><span class="wj-state-text" role="status" aria-live="polite">待机 · 未接通语音</span></div>`;
}
/** One shared frame loop updates any number of large/mini cores. It never owns audio. */
export class VoiceCoreController {
  constructor(elements, { inputTap = null, outputTap = null, reducedMotion = false, onLevels = null } = {}) {
    this.inputTap=inputTap; this.outputTap=outputTap; this.onLevels=onLevels;
    this.state={connection:'idle',micMuted:false,userSpeaking:false,agentSpeaking:false,working:false};
    this.levels={input:0,output:0}; this.roots=[]; this.frame=0; this.last=0; this.disposed=false;
    this.manualReduced=!!reducedMotion; this.media=matchMedia('(prefers-reduced-motion: reduce)');
    this.visible=new Set(); this.intersection=new IntersectionObserver(entries=>{
      for (const e of entries) e.isIntersecting ? this.visible.add(e.target) : this.visible.delete(e.target);
      this.refreshLoop();
    });
    this.onVisibility=()=>this.refreshLoop(); document.addEventListener('visibilitychange',this.onVisibility);
    this.onMedia=()=>this.syncReduced(); this.media.addEventListener('change',this.onMedia);
    for (const el of (Array.isArray(elements)?elements:[elements])) this.addRoot(el);
    this.tick=this.tick.bind(this); this.syncState(); this.syncReduced(); this.refreshLoop();
  }
  addRoot(el) {
    if (!el?.classList || this.roots.some(r=>r.el===el)) return;
    el.classList.add('wj-voice-core'); el.innerHTML=markup(++nextId);
    const q=s=>el.querySelector(s);
    this.roots.push({el,input:q('.wj-input-wave'),output:q('.wj-output-wave'),glow:q('.wj-output-glow'),text:q('.wj-state-text')});
    this.visible.add(el); this.intersection.observe(el);
  }
  setTaps({inputTap=null,outputTap=null}={}) { this.inputTap=inputTap;this.outputTap=outputTap;this.levels.input=this.levels.output=0; }
  setState(patch) {
    const next={...this.state,...patch};
    if (!['idle','connecting','connected','error'].includes(next.connection)) throw new TypeError('Invalid connection state');
    this.state=next; if(next.micMuted)this.levels.input=0; this.syncState();
  }
  syncState() {
    const view=presentationState(this.state);
    for(const r of this.roots){r.el.dataset.state=view.key; if(r.text.textContent!==view.label)r.text.textContent=view.label;}
  }
  setReducedMotion(value) { this.manualReduced=!!value;this.syncReduced(); }
  syncReduced() {this.reduced=this.manualReduced||this.media.matches;for(const r of this.roots)r.el.classList.toggle('wj-reduced',this.reduced);}
  resetOutput() {this.levels.output=0;this.setState({agentSpeaking:false});this.paint(EMPTY,EMPTY,0);}
  refreshLoop() {
    if(this.disposed)return;
    const run=!document.hidden&&this.visible.size>0;
    for(const r of this.roots)r.el.classList.toggle('wj-paused',!run||!this.visible.has(r.el));
    if(!run){cancelAnimationFrame(this.frame);this.frame=0;this.last=0;}
    else if(!this.frame&&this.tick)this.frame=requestAnimationFrame(this.tick);
  }
  tick(now) {
    this.frame=0;if(this.disposed||document.hidden||!this.visible.size)return;
    const interval=this.reduced?100:1000/30;
    if(!this.last||now-this.last>=interval-.5){
      const dt=this.last?(now-this.last)/1000:1/30;this.last=now;
      const active=this.state.connection==='connected';
      const input=active&&!this.state.micMuted?(this.inputTap?.read()||EMPTY):EMPTY;
      const output=active&&this.state.agentSpeaking?(this.outputTap?.read()||EMPTY):EMPTY;
      this.levels.input=this.state.micMuted?0:smoothEnvelope(this.levels.input,input.level,dt);
      this.levels.output=smoothEnvelope(this.levels.output,output.level,dt);
      if(input.level===0&&this.levels.input<.001)this.levels.input=0;
      if(output.level===0&&this.levels.output<.001)this.levels.output=0;
      this.paint(input,output,now/1000);
      this.onLevels?.({input:input.level,output:output.level,inputRms:input.rms,outputRms:output.rms});
    }
    this.frame=requestAnimationFrame(this.tick);
  }
  paint(input,output,seconds) {
    const li=this.reduced?0:this.levels.input,lo=this.reduced?0:this.levels.output;
    const inPoints=ringPoints(this.reduced?null:input.wave,154,li);
    const outPoints=ringPoints(this.reduced?null:output.wave,122,lo);
    for(const r of this.roots){
      if(!this.visible.has(r.el))continue;
      r.el.style.setProperty('--wj-input',clamp(li).toFixed(3));
      r.el.style.setProperty('--wj-output',clamp(lo).toFixed(3));
      r.input.setAttribute('points',inPoints);r.output.setAttribute('points',outPoints);r.glow.setAttribute('points',outPoints);
    }
  }
  dispose() {
    if(this.disposed)return;this.disposed=true;cancelAnimationFrame(this.frame);this.frame=0;
    document.removeEventListener('visibilitychange',this.onVisibility);this.media.removeEventListener('change',this.onMedia);
    this.intersection.disconnect();this.inputTap=this.outputTap=null;
    for(const r of this.roots)r.el.classList.add('wj-paused');
  }
}
