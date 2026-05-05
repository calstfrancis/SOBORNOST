// ── SOBORNOST ENGINE — systems/audio.js ───────────────────────

import{emit}from'../core/events.js';
import{_registries}from'./registries.js';
import{setAudioMoodCallback,mood as currentMood}from'./atmosphere.js';

let _actx=null,_gainNode=null;
export let _audioOn=false;
let _oscNodes=[],_filterNode=null,_reverbGain=null,_currentMoodRef='neutral';

// FIX (Issue 1 / 14): mood received as parameter — no dynamic import
setAudioMoodCallback((newMood)=>{_updateAudioMood(newMood);});

function _makeReverb(ctx,dur=1.8,dec=2.2){
  const len=ctx.sampleRate*dur,buf=ctx.createBuffer(2,len,ctx.sampleRate);
  for(let c=0;c<2;c++){const d=buf.getChannelData(c);for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/len,dec);}
  const conv=ctx.createConvolver();conv.buffer=buf;return conv;
}

function _initAudio(){
  if(_actx)return;
  try{
    _actx=new(window.AudioContext||window.webkitAudioContext)();
    const master=_actx.createGain();master.gain.value=0;master.connect(_actx.destination);_gainNode=master;
    const rev=_makeReverb(_actx);_reverbGain=_actx.createGain();_reverbGain.gain.value=0.18;rev.connect(_reverbGain);_reverbGain.connect(master);
    _oscNodes=[50,101,149].map((freq,i)=>{const o=_actx.createOscillator(),g=_actx.createGain();o.frequency.value=freq;o.type='sawtooth';g.gain.value=[0.5,0.25,0.15][i];o.connect(g);g.connect(master);o.connect(rev);o.start();return o;});
    const buf=_actx.createBuffer(1,_actx.sampleRate,_actx.sampleRate);const d=buf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
    const ns=_actx.createBufferSource();ns.buffer=buf;ns.loop=true;
    _filterNode=_actx.createBiquadFilter();_filterNode.type='lowpass';_filterNode.frequency.value=90;
    const ng=_actx.createGain();ng.gain.value=0.03;ns.connect(_filterNode);_filterNode.connect(ng);ng.connect(master);ns.start();
  }catch(e){console.warn('Audio:',e);}
}

function _gain(){return _currentMoodRef==='tense'?0.055:_currentMoodRef==='revelation'?0.015:_currentMoodRef==='uncanny'?0.008:0.035;}

function _applyMood(m){
  if(!_actx||!_audioOn)return;
  const t=_actx.currentTime;
  const cfg={neutral:{freqs:[50,101,149],filter:90,rv:0.18},tense:{freqs:[48,98,146],filter:60,rv:0.08},uncanny:{freqs:[44,88,132],filter:200,rv:0.35},revelation:{freqs:[55,110,165],filter:420,rv:0.45}}[m]||{freqs:[50,101,149],filter:90,rv:0.18};
  _oscNodes.forEach((o,i)=>{if(o)o.frequency.setTargetAtTime(cfg.freqs[i],t,2.5);});
  if(_filterNode)_filterNode.frequency.setTargetAtTime(cfg.filter,t,2.5);
  if(_reverbGain)_reverbGain.gain.setTargetAtTime(cfg.rv,t,2.5);
  if(m==='revelation'){try{const b=_actx.createOscillator(),bg=_actx.createGain();b.type='sine';b.frequency.value=880;bg.gain.setValueAtTime(0.07,t);bg.gain.exponentialRampToValueAtTime(0.0001,t+4);b.connect(bg);bg.connect(_gainNode);b.start(t);b.stop(t+4);}catch(e){}}
  if(m==='uncanny'){try{const w=_actx.createOscillator(),wg=_actx.createGain();w.type='sine';w.frequency.value=333;wg.gain.setValueAtTime(0.012,t);wg.gain.exponentialRampToValueAtTime(0.0001,t+5);w.connect(wg);wg.connect(_gainNode);w.start(t);w.stop(t+5);}catch(e){}}
}

export function _updateAudioMood(newMood){
  _currentMoodRef=newMood;
  if(_audioOn&&_gainNode&&_actx){_gainNode.gain.setTargetAtTime(_gain(),_actx.currentTime,2.5);_applyMood(newMood);}
}

export function toggleAudio(){
  _initAudio();if(!_actx)return;
  if(_actx.state==='suspended')_actx.resume();
  _audioOn=!_audioOn;
  if(_gainNode)_gainNode.gain.setTargetAtTime(_audioOn?_gain():0,_actx.currentTime,1.2);
  if(_audioOn)_applyMood(currentMood);
  const btn=document.getElementById('audio-btn');
  if(btn){btn.textContent=_audioOn?'\u266a on':'\u266a off';btn.style.color=_audioOn?'var(--amber)':'var(--dim)';}
  emit('audioToggled',_audioOn);
}

export function playSfx(name,volume=0.5){
  const sfx=_registries.sfxLibrary[name];if(sfx){sfx(volume);emit('sfxPlayed',name);return;}
  if(!_actx){_initAudio();if(!_actx)return;}
  const c=_actx;
  const _osc=(freq,type,gain,dur)=>{const o=c.createOscillator(),g=c.createGain();o.type=type;o.frequency.value=freq;g.gain.value=volume*gain;o.connect(g);g.connect(c.destination);o.start();g.gain.exponentialRampToValueAtTime(0.0001,c.currentTime+dur);o.stop(c.currentTime+dur);};
  if(name==='click')_osc(800,'sine',0.15,0.2);
  else if(name==='chime')_osc(440,'sine',0.2,1.0);
  else if(name==='beep')_osc(660,'square',0.1,0.15);
  else console.warn(`SFX "${name}" not registered.`);
}
export function initBuiltinSfx(){}
