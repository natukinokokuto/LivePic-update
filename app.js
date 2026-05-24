'use strict';

const ORDER = ['Hair_Back','Neck','Body_Upper','Face_Base','Eye_L','Eye_R','Mouth','Hair_Front'];
const RECTS = {
  Hair_Back:{x:.30,y:.02,w:.40,h:.26}, Neck:{x:.455,y:.285,w:.09,h:.10}, Body_Upper:{x:.26,y:.34,w:.48,h:.46},
  Face_Base:{x:.385,y:.08,w:.23,h:.21}, Eye_L:{x:.427,y:.145,w:.06,h:.035}, Eye_R:{x:.515,y:.145,w:.06,h:.035},
  Mouth:{x:.47,y:.225,w:.07,h:.04}, Hair_Front:{x:.335,y:.04,w:.33,h:.18}
};
const COLORS = {Hair_Back:'#8c7aff',Neck:'#7affd4',Body_Upper:'#ff9b58',Face_Base:'#58d8ff',Eye_L:'#ffd15c',Eye_R:'#ffd15c',Mouth:'#ff7a9a',Hair_Front:'#91ff7a'};
const ALIAS = [
  [/hair[_ -]?front|front[_ -]?hair|maegami|前髪/i,'Hair_Front'],[/hair[_ -]?back|back[_ -]?hair|後髪|後ろ髪/i,'Hair_Back'],
  [/face[_ -]?base|face|顔/i,'Face_Base'],[/eye[_ -]?l|left[_ -]?eye|左目/i,'Eye_L'],[/eye[_ -]?r|right[_ -]?eye|右目/i,'Eye_R'],
  [/mouth|kuchi|口/i,'Mouth'],[/neck|首/i,'Neck'],[/body[_ -]?upper|upper[_ -]?body|body|体|胴/i,'Body_Upper']
];
const state = { img:null, imgName:'', layers:[], target:'Face_Base', view:{scale:1,ox:0,oy:0}, flags:{image:true,regions:true,labels:true,mesh:true,log:true}, raf:null, anim:null, dragging:false, last:null };
const $ = id => document.getElementById(id);
const canvas = $('stage'); const ctx = canvas.getContext('2d');

function initLayers(){ state.layers = ORDER.map((id,z)=>({id,z,role:id,rect:{...RECTS[id]},loaded:false,fileName:'未読込',bytes:0,tx:0,ty:0,sx:1,sy:1,rot:0,opacity:1,enabled:true,mesh:null,meshStats:null})); }
function log(msg){ const t = new Date().toLocaleTimeString(); $('logBox').textContent = `[${t}] ${msg}\n` + $('logBox').textContent; }
function roleOf(name){ const clean = name.replace(/\.cmo3$/i,''); for(const [re,role] of ALIAS){ if(re.test(clean)) return role; } return clean; }
function layer(role){ let l = state.layers.find(x=>x.id===role); if(!l){ l={id:role,z:state.layers.length,role,rect:{x:.35,y:.35,w:.3,h:.3},loaded:false,fileName:'未読込',bytes:0,tx:0,ty:0,sx:1,sy:1,rot:0,opacity:1,enabled:true,mesh:null,meshStats:null}; state.layers.push(l); } return l; }
function bytes(n){ if(!n) return '0 B'; if(n>1048576) return (n/1048576).toFixed(2)+' MB'; if(n>1024) return (n/1024).toFixed(1)+' KB'; return n+' B'; }

async function loadImageFile(file){
  const url = URL.createObjectURL(file); const img = new Image();
  await new Promise((res,rej)=>{ img.onload=res; img.onerror=rej; img.src=url; });
  state.img = img; state.imgName = file.name; $('imageBadge').textContent = file.name; log(`画像読込OK: ${file.name} ${img.width}x${img.height}`); fit(); draw();
}
async function loadSample(){ const img = new Image(); await new Promise((res,rej)=>{ img.onload=res; img.onerror=rej; img.src='sample_character.png'; }); state.img=img; state.imgName='sample_character.png'; $('imageBadge').textContent=state.imgName; log(`サンプル表示OK: ${img.width}x${img.height}`); fit(); draw(); }
async function loadCmoFiles(files){
  const list = [...files].filter(f=>/\.cmo3$/i.test(f.name));
  for(const f of list){
    const buf = await f.arrayBuffer();
    const r=roleOf(f.name); const l=layer(r);
    const parsed = parseCmo3Mesh(buf, f.name, r);
    l.loaded=true; l.fileName=f.name; l.bytes=f.size; l.mesh=parsed.mesh; l.meshStats=parsed.stats;
    if(parsed.stats.points>0){
      adoptRectFromMesh(l, parsed.mesh);
      log(`cmo3メッシュ抽出OK: ${f.name} → ${r} / 頂点候補 ${parsed.stats.points} / 線 ${parsed.stats.lines} / ${bytes(f.size)}`);
    }else{
      log(`cmo3読込OK: ${f.name} → ${r} / メッシュ候補 0 / ${bytes(f.size)}`);
    }
  }
  $('cmoBadge').textContent = `cmo3: ${state.layers.filter(l=>l.loaded).length} / mesh: ${state.layers.filter(l=>l.mesh&&l.mesh.points.length).length}`; refreshUI(); draw();
}
async function handleFiles(files){ const arr=[...files]; const img=arr.find(f=>/^image\//.test(f.type)); if(img) await loadImageFile(img); const cmos=arr.filter(f=>/\.cmo3$/i.test(f.name)); if(cmos.length) await loadCmoFiles(cmos); }


function parseCmo3Mesh(buffer, fileName, role){
  const bytesU = new Uint8Array(buffer);
  const dv = new DataView(buffer);
  const textHead = new TextDecoder('utf-8',{fatal:false}).decode(bytesU.slice(0, Math.min(bytesU.length, 240000)));
  const names = [];
  for(const m of textHead.matchAll(/[A-Za-z0-9_\-一-龠ぁ-んァ-ン]{3,48}/g)){
    const v=m[0]; if(/ArtMesh|Drawable|Vertex|Mesh|Deformer|Param|Texture|Eye|Mouth|Hair|Face|Body|Neck|顔|目|口|髪|体|首/i.test(v)) names.push(v);
    if(names.length>40) break;
  }

  const vals=[];
  const maxFloats = Math.min(Math.floor(buffer.byteLength/4)-1, 450000);
  for(let i=0;i<maxFloats;i++){
    const off=i*4;
    const v=dv.getFloat32(off,true);
    if(Number.isFinite(v) && Math.abs(v) > 0.000001 && Math.abs(v) < 12000){ vals.push(v); }
  }

  const pairs=[];
  for(let i=0;i<vals.length-1;i+=2){
    const x=vals[i], y=vals[i+1];
    if(Number.isFinite(x)&&Number.isFinite(y) && Math.abs(x)<12000 && Math.abs(y)<12000){ pairs.push({x,y}); }
    if(pairs.length>12000) break;
  }
  const cleaned = cleanPointCloud(pairs);
  const mesh = buildMeshFromPoints(cleaned);
  mesh.names = names;
  return { mesh, stats:{points:mesh.points.length, lines:mesh.lines.length, names:names.length, rawPairs:pairs.length} };
}
function cleanPointCloud(points){
  if(!points.length) return [];
  let xs=points.map(p=>p.x).sort((a,b)=>a-b), ys=points.map(p=>p.y).sort((a,b)=>a-b);
  const q=(arr,t)=>arr[Math.max(0,Math.min(arr.length-1,Math.floor(arr.length*t)))];
  const minX=q(xs,.03), maxX=q(xs,.97), minY=q(ys,.03), maxY=q(ys,.97);
  const w=maxX-minX, h=maxY-minY;
  if(w<=0||h<=0) return [];
  const seen=new Set(), out=[];
  for(const p of points){
    if(p.x<minX-w*.15||p.x>maxX+w*.15||p.y<minY-h*.15||p.y>maxY+h*.15) continue;
    const k=Math.round((p.x-minX)/Math.max(1,w)*220)+'_'+Math.round((p.y-minY)/Math.max(1,h)*220);
    if(seen.has(k)) continue; seen.add(k); out.push({x:p.x,y:p.y});
    if(out.length>=900) break;
  }
  return out;
}
function buildMeshFromPoints(points){
  if(points.length<3) return {points:[],lines:[],bounds:null,names:[]};
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  points.forEach(p=>{minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);});
  const center={x:(minX+maxX)/2,y:(minY+maxY)/2};
  points.sort((a,b)=>Math.atan2(a.y-center.y,a.x-center.x)-Math.atan2(b.y-center.y,b.x-center.x));
  const lines=[];
  for(let i=0;i<points.length;i++){ if(i%2===0) lines.push([i,(i+1)%points.length]); if(i+12<points.length && i%12===0) lines.push([i,i+12]); }
  return {points,lines,bounds:{minX,maxX,minY,maxY},names:[]};
}
function adoptRectFromMesh(l, mesh){
  if(!state.img || !mesh.bounds) return;
  // バイナリ抽出した点群を、その意味パーツの既定領域に正規化して重ねる。実座標が取れた場合は後でここを置換する。
  l.hasMeshRect = true;
}

function resize(){ const r=canvas.getBoundingClientRect(); const d=window.devicePixelRatio||1; canvas.width=Math.max(640,Math.floor(r.width*d)); canvas.height=Math.max(480,Math.floor(r.height*d)); fit(false); draw(); }
function fit(redraw=true){ if(!state.img) return; const s=Math.min(canvas.width/state.img.width,canvas.height/state.img.height)*.88; state.view.scale=s; state.view.ox=(canvas.width-state.img.width*s)/2; state.view.oy=(canvas.height-state.img.height*s)/2; if(redraw) draw(); }
function center(){ if(!state.img)return; state.view.ox=(canvas.width-state.img.width*state.view.scale)/2; state.view.oy=(canvas.height-state.img.height*state.view.scale)/2; draw(); }
function imgRect(l){ const iw=state.img?.width||1000, ih=state.img?.height||1000; return {x:l.rect.x*iw,y:l.rect.y*ih,w:l.rect.w*iw,h:l.rect.h*ih}; }
function toScreen(x,y){ return {x:state.view.ox+x*state.view.scale,y:state.view.oy+y*state.view.scale}; }
function draw(){
  ctx.clearRect(0,0,canvas.width,canvas.height); ctx.save();
  if(state.img && state.flags.image){ ctx.globalAlpha=.96; ctx.drawImage(state.img,state.view.ox,state.view.oy,state.img.width*state.view.scale,state.img.height*state.view.scale); }
  if(state.img && state.flags.regions){ for(const l of [...state.layers].sort((a,b)=>a.z-b.z)){ if(!l.enabled) continue; drawLayerGuide(l); } }
  if(state.img && state.flags.mesh){ for(const l of [...state.layers].sort((a,b)=>a.z-b.z)){ if(!l.enabled||!l.mesh) continue; drawLayerMesh(l); } }
  if(!state.img){ ctx.fillStyle='#dce8ff'; ctx.font='28px system-ui'; ctx.fillText('画像を読み込むとここに表示されます',40,80); }
  ctx.restore();
}
function drawLayerGuide(l){
  const r=imgRect(l); const cx=r.x+r.w/2+l.tx, cy=r.y+r.h/2+l.ty; const p=toScreen(cx,cy); const sw=r.w*state.view.scale*l.sx, sh=r.h*state.view.scale*l.sy;
  ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(l.rot*Math.PI/180); ctx.globalAlpha=l.loaded?.95:.46; ctx.strokeStyle=COLORS[l.id]||'#ffffff'; ctx.lineWidth=(l.id===state.target?4:2)*(window.devicePixelRatio||1); ctx.fillStyle=(COLORS[l.id]||'#fff')+'22'; ctx.fillRect(-sw/2,-sh/2,sw,sh); ctx.strokeRect(-sw/2,-sh/2,sw,sh);
  if(state.flags.labels){ ctx.fillStyle='rgba(0,0,0,.72)'; ctx.fillRect(-sw/2, -sh/2-26, Math.max(72,l.id.length*9), 24); ctx.fillStyle=COLORS[l.id]||'#fff'; ctx.font=`${13*(window.devicePixelRatio||1)}px system-ui`; ctx.fillText(l.id, -sw/2+6, -sh/2-8); }
  ctx.restore();
}

function drawLayerMesh(l){
  const mesh=l.mesh; if(!mesh || !mesh.points.length || !mesh.bounds) return;
  const r=imgRect(l); const b=mesh.bounds;
  const bw=b.maxX-b.minX||1, bh=b.maxY-b.minY||1;
  const cx=r.x+r.w/2+l.tx, cy=r.y+r.h/2+l.ty; const p=toScreen(cx,cy);
  const sw=r.w*state.view.scale*l.sx, sh=r.h*state.view.scale*l.sy;
  ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(l.rot*Math.PI/180); ctx.globalAlpha=.86;
  ctx.strokeStyle=COLORS[l.id]||'#ffffff'; ctx.fillStyle=COLORS[l.id]||'#ffffff'; ctx.lineWidth=1.2*(window.devicePixelRatio||1);
  ctx.beginPath();
  for(const [a,bidx] of mesh.lines){ const pa=mesh.points[a], pb=mesh.points[bidx]; if(!pa||!pb) continue;
    const ax=((pa.x-mesh.bounds.minX)/bw-.5)*sw, ay=((pa.y-mesh.bounds.minY)/bh-.5)*sh;
    const bx=((pb.x-mesh.bounds.minX)/bw-.5)*sw, by=((pb.y-mesh.bounds.minY)/bh-.5)*sh;
    ctx.moveTo(ax,ay); ctx.lineTo(bx,by);
  }
  ctx.stroke();
  for(let i=0;i<mesh.points.length;i+=Math.max(1,Math.floor(mesh.points.length/160))){ const q=mesh.points[i]; const x=((q.x-mesh.bounds.minX)/bw-.5)*sw, y=((q.y-mesh.bounds.minY)/bh-.5)*sh; ctx.fillRect(x-1.5,y-1.5,3,3); }
  ctx.restore();
}

function refreshUI(){
  const sel=$('targetSelect'); const old=sel.value||state.target; sel.innerHTML=''; state.layers.forEach(l=>{ const o=document.createElement('option'); o.value=l.id; o.textContent=l.id+(l.loaded?' ✓':''); sel.appendChild(o); }); state.target=state.layers.find(l=>l.id===old)?old:state.layers[0].id; sel.value=state.target;
  $('layerList').innerHTML=''; state.layers.forEach(l=>{ const d=document.createElement('div'); d.className='layer '+(l.loaded?'loaded ':'')+(l.id===state.target?'active':''); d.innerHTML=`<div class="name">${l.id}</div><div class="meta">${l.loaded?'OK':'未読込'} / ${l.fileName}<br>${bytes(l.bytes)}</div><div class="mesh">${l.meshStats?('mesh '+l.meshStats.points+'点 / names '+l.meshStats.names):'mesh 未解析'}</div>`; d.onclick=()=>{state.target=l.id; refreshUI(); draw();}; $('layerList').appendChild(d); });
  buildControls();
}
function buildControls(){ const l=layer(state.target); const box=$('controls'); box.className='controls'; box.innerHTML=''; [['tx','X',-300,300,1],['ty','Y',-300,300,1],['sx','横倍率',.2,2,.01],['sy','縦倍率',.05,2,.01],['rot','回転',-45,45,1],['opacity','不透明度',0,1,.01]].forEach(([k,n,min,max,step])=>{ const lab=document.createElement('label'); lab.innerHTML=`${n}<span class="value" id="v_${k}">${Number(l[k]).toFixed(k==='opacity'||k==='sx'||k==='sy'?2:0)}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${l[k]}">`; const inp=lab.querySelector('input'); inp.oninput=()=>{ l[k]=Number(inp.value); $(`v_${k}`).textContent=Number(l[k]).toFixed(k==='opacity'||k==='sx'||k==='sy'?2:0); draw(); }; box.appendChild(lab); }); }
function resetTransforms(){ state.layers.forEach(l=>{l.tx=0;l.ty=0;l.sx=1;l.sy=1;l.rot=0;l.opacity=1;}); refreshUI(); draw(); }
function animate(kind){ cancelAnimationFrame(state.raf); const start=performance.now(); const base=JSON.parse(JSON.stringify(state.layers)); const step=t=>{ const p=(t-start)/1000; state.layers.forEach((l,i)=>Object.assign(l,{tx:base[i]?.tx||0,ty:base[i]?.ty||0,sx:1,sy:1,rot:0})); const wave=Math.sin(p*Math.PI*2); if(kind==='blink'){ ['Eye_L','Eye_R'].forEach(id=>{const l=layer(id); l.sy=.12+.88*Math.abs(Math.sin(p*Math.PI*2));}); }
    if(kind==='mouth'){ const l=layer('Mouth'); l.sy=.35+.9*Math.abs(wave); }
    if(kind==='turn'){ const v=wave; layer('Face_Base').tx=v*18; layer('Face_Base').rot=v*3; layer('Neck').rot=v*2; layer('Hair_Front').tx=v*30; layer('Hair_Back').tx=v*-16; layer('Eye_L').tx=v*20; layer('Eye_R').tx=v*20; layer('Mouth').tx=v*18; }
    if(kind==='idle'){ state.layers.forEach((l,idx)=>{ l.ty=Math.sin(p*2+idx)*4; l.rot=Math.sin(p*1.8+idx)*1.3; }); }
    draw(); state.raf=requestAnimationFrame(step); }; state.raf=requestAnimationFrame(step); setTimeout(()=>{cancelAnimationFrame(state.raf); resetTransforms();}, kind==='idle'?5000:3500); }

function bind(){
  $('imageInput').onchange=e=>e.target.files[0]&&loadImageFile(e.target.files[0]); $('cmoInput').onchange=e=>loadCmoFiles(e.target.files); $('demoBtn').onclick=loadSample; $('fitBtn').onclick=()=>fit(); $('centerBtn').onclick=center; $('resetBtn').onclick=resetTransforms;
  $('blinkBtn').onclick=()=>animate('blink'); $('mouthBtn').onclick=()=>animate('mouth'); $('turnBtn').onclick=()=>animate('turn'); $('idleBtn').onclick=()=>animate('idle'); $('targetSelect').onchange=e=>{state.target=e.target.value;refreshUI();draw();};
  ['showImage','showRegions','showLabels','showMesh','showLog'].forEach(id=>$(id).onchange=e=>{ const key=id.replace('show','').toLowerCase(); if(key==='image')state.flags.image=e.target.checked; if(key==='regions')state.flags.regions=e.target.checked; if(key==='labels')state.flags.labels=e.target.checked; if(key==='mesh')state.flags.mesh=e.target.checked; if(key==='log')$('logBox').style.display=e.target.checked?'block':'none'; draw(); });
  window.addEventListener('resize',resize); ['dragenter','dragover'].forEach(ev=>document.addEventListener(ev,e=>{e.preventDefault();$('dropHint').textContent='ここで離すと読み込み';})); ['dragleave','drop'].forEach(ev=>document.addEventListener(ev,e=>{e.preventDefault();$('dropHint').textContent='PNG/JPG/WEBP と .cmo3 をここへドロップしてもOK';})); document.addEventListener('drop',e=>handleFiles(e.dataTransfer.files));
  canvas.addEventListener('wheel',e=>{e.preventDefault(); const old=state.view.scale; const f=e.deltaY<0?1.08:.92; state.view.scale*=f; const rect=canvas.getBoundingClientRect(); const mx=(e.clientX-rect.left)*(window.devicePixelRatio||1), my=(e.clientY-rect.top)*(window.devicePixelRatio||1); state.view.ox=mx-(mx-state.view.ox)*(state.view.scale/old); state.view.oy=my-(my-state.view.oy)*(state.view.scale/old); draw();},{passive:false});
  canvas.addEventListener('pointerdown',e=>{state.dragging=true;state.last={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);}); canvas.addEventListener('pointermove',e=>{if(!state.dragging)return; const d=window.devicePixelRatio||1; state.view.ox+=(e.clientX-state.last.x)*d; state.view.oy+=(e.clientY-state.last.y)*d; state.last={x:e.clientX,y:e.clientY}; draw();}); canvas.addEventListener('pointerup',()=>state.dragging=false);
}

(async function main(){ initLayers(); bind(); refreshUI(); resize(); await loadSample(); log('v6起動OK: CUTなし / cmo3メッシュ候補抽出版'); })();
