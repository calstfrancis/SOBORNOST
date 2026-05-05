// ── SOBORNOST ENGINE — ui/widgets.js ──────────────────────────
import{emit}from'../core/events.js';
import{_registries}from'../systems/registries.js';

let _uiOpacity=1;
export function setUiOpacity(o){_uiOpacity=Math.min(1,Math.max(0,o));emit('uiOpacityChanged',_uiOpacity);}
export function getUiOpacity(){return _uiOpacity;}

let _compass={left:{label:'Left',value:0},right:{label:'Right',value:0}};
export function registerCompassAxes(l,r){_compass={left:{label:l,value:0},right:{label:r,value:0}};}
export function updateCompass(l,r){_compass.left.value=l;_compass.right.value=r;emit('compassUpdated',{left:l,right:r});}
export function renderCompass(){
  const total=_compass.left.value+_compass.right.value;
  if(!total)return'<div style="font-family:monospace">\u25c4\u2014\u2014\u2014???\u2014\u2014\u2014\u25ba</div>';
  const pos=Math.floor((_compass.left.value/total)*20);
  let c='\u25c4';for(let i=0;i<20;i++)c+=i===pos?'\u25cf':'\u2500';c+='\u25ba';
  return`<div style="font-family:monospace;font-size:.7rem">${c}</div><div style="font-size:.7rem">${_compass.left.label} \u25cf ${_compass.right.label}</div>`;
}

const _pt={};
export function registerProgressTracker(id,label,max,onUpdate){_pt[id]={current:0,max,label,onUpdate};emit('progressTrackerRegistered',id);}
export function updateProgressTracker(id,inc){
  if(!_pt[id])return;const old=_pt[id].current;
  _pt[id].current=Math.min(_pt[id].max,Math.max(0,old+inc));
  if(_pt[id].onUpdate)_pt[id].onUpdate(_pt[id].current);
  emit('progressTrackerUpdated',{id,old,new:_pt[id].current});
}
export function getProgressTracker(id){return _pt[id];}

export function renderCoverMeter(integrity){
  const pct=(Math.min(integrity,10)/10)*100;
  const color=integrity<=2?'#c06060':integrity<=5?'#c0a060':'#90c060';
  const pulse=integrity<=2?' pulsing':'';
  return`<div class="cover-meter${pulse}" style="width:100%;background:#2a2018;border-radius:4px;margin-top:.3rem"><div style="width:${pct}%;background:${color};height:6px;border-radius:4px"></div></div>`;
}

export function renderMapPanel(){
  let s='';
  for(const[id,d]of Object.entries(_registries.mapNodes)){
    s+=`${d.visited?'\u25c9':'\u25cb'} ${id}\n`;
    if(d.connections&&d.connections.length)s+=`  \u2514\u2500 connects to: ${d.connections.join(', ')}\n`;
  }
  return`<pre style="font-size:.7rem;font-family:monospace">${s}</pre>`;
}
export function markMapNodeVisited(id){if(_registries.mapNodes[id])_registries.mapNodes[id].visited=true;}
