'use strict';

const DEFAULT_ORDER = ['Hair_Back','Neck','Body_Upper','Face_Base','Eye_L','Eye_R','Mouth','Hair_Front'];
const ROLE_COLORS = { Face_Base:'#58d8ff', Hair_Front:'#91ff7a', Hair_Back:'#8c7aff', Eye_L:'#ffd15c', Eye_R:'#ffd15c', Mouth:'#ff7a9a', Neck:'#7affd4', Body_Upper:'#ff9b58' };
const ROLE_RECTS = {
  Face_Base:{x:.38,y:.08,w:.24,h:.20}, Hair_Front:{x:.34,y:.04,w:.32,h:.17}, Hair_Back:{x:.31,y:.03,w:.38,h:.24},
  Eye_L:{x:.43,y:.145,w:.055,h:.035}, Eye_R:{x:.515,y:.145,w:.055,h:.035}, Mouth:{x:.47,y:.225,w:.065,h:.035},
  Neck:{x:.455,y:.285,w:.09,h:.08}, Body_Upper:{x:.30,y:.34,w:.40,h:.40}
};

const state = {
  image:null, imageName:'sample_character.png',
  layers: DEFAULT_ORDER.map((id,i)=>makeLayer(id,i)),
  target:'Face_Base', showLabels:true, showGuides:true,
  view:{scale:1, ox:0, oy:0}, anim:null
};

function makeLayer(id, index){
  return { id, role:id, fileName:null, bytes:0, loaded:false, z:index,
    tx:0, ty:0, sx:1, sy:1, rot:0, opacity:1, enabled:true,
    rect: ROLE_RECTS[id] || {x:.4,y:.4,w:.2,h:.2}
  };
}

const $ = (id)=>document.getElementById(id);
const canvas = $('stage'); const ctx = canvas.getContext('2d');

function setStatus(msg){ $('status').textContent = msg; }

async function loadDefaultImage(){
  const img = new Image();
  img.onload = ()=>{ state.image = img; fitView(); render(); };
  img.src = 'sample_character.png';
}

function fitView(){
  if(!state.image) return;
  const cw = canvas.width, ch = canvas.height;
  const s = Math.min(cw/state.image.width, ch/state.image.height) * .86;
  state.view.scale = s;
  state.view.ox = (cw - state.image.width*s)/2;
  state.view.oy = (ch - state.image.height*s)/2;
  render();
}

function resizeCanvas(){
  const r = canvas.getBoundingClientRect();
  canvas.width = Math.max(600, Math.floor(r.width * devicePixelRatio));
  canvas.height = Math.max(600, Math.floor(r.height * devicePixelRatio));
  fitView();
}

function normalizeRole(name){
  const base = name.replace(/\.cmo3$/i,'').replace(/\s+/g,'_');
  const lower = base.toLowerCase();
  const map = [
    ['hair_front','Hair_Front'],['front_hair','Hair_Front'],['maegami','Hair_Front'],
    ['hair_back','Hair_Back'],['back_hair','Hair_Back'],['ushiro','Hair_Back'],
    ['face_base','Face_Base'],['face','Face_Base'],['base','Face_Base'],
    ['eye_l','Eye_L'],['left_eye','Eye_L'],['eye_r','Eye_R'],['right_eye','Eye_R'],
    ['mouth','Mouth'],['kuchi','Mouth'],['neck','Neck'],['body_upper','Body_Upper'],['body','Body_Upper']
  ];
  for(const [key,val] of map) if(lower.includes(key)) return val;
  return base;
}

function upsertLayer(role, file){
  let layer = state.layers.find(l=>l.id===role);
  if(!layer){ layer = makeLayer(role, state.layers.length); state.layers.push(layer); }
  layer.fileName = file.name;
  layer.bytes = file.size;
  layer.loaded = true;
  layer.enabled = true;
  return layer;
}

async function handleCmoFiles(files){
  const list = Array.from(files || []);
  for(const file of list){
    const role = normalizeRole(file.name);
    const layer = upsertLayer(role, file);
    layer.buffer = await file.arrayBuffer();
  }
  sortLayers();
  refreshUI();
  render();
  setStatus(`${list.length}件の .cmo3 をArrayBufferで読み込みました`);
}

function sortLayers(){
  state.layers.sort((a,b)=>{
    const ai = DEFAULT_ORDER.indexOf(a.id); const bi = DEFAULT_ORDER.indexOf(b.id);
    return (ai<0?999+state.layers.indexOf(a):ai) - (bi<0?999+state.layers.indexOf(b):bi);
  });
  state.layers.forEach((l,i)=>l.z=i);
}

function drawImageWithLayerTransforms(){
  if(!state.image) return;
  const v = state.view, img = state.image;
  ctx.save();
  ctx.translate(v.ox, v.oy); ctx.scale(v.scale, v.scale);

  // Base whole image: no CUT / no mask / no circular crop.
  ctx.globalAlpha = 1;
  ctx.drawImage(img, 0, 0);

  // Deformation preview: guides are transformed instead of cutting the image.
  for(const layer of state.layers){
    if(!layer.enabled) continue;
    const r = layer.rect;
    const x = r.x*img.width, y = r.y*img.height, w = r.w*img.width, h = r.h*img.height;
    const cx = x+w/2, cy = y+h/2;
    ctx.save();
    ctx.translate(cx + layer.tx, cy + layer.ty);
    ctx.rotate(layer.rot * Math.PI/180);
    ctx.scale(layer.sx, layer.sy);
    ctx.globalAlpha = state.showGuides ? .30*layer.opacity : .0;
    ctx.fillStyle = ROLE_COLORS[layer.id] || '#ffffff';
    ctx.fillRect(-w/2, -h/2, w, h);
    if(state.showGuides){ ctx.globalAlpha = .95; ctx.lineWidth = 2/v.scale; ctx.strokeStyle = ROLE_COLORS[layer.id] || '#fff'; ctx.strokeRect(-w/2,-h/2,w,h); }
    if(state.showLabels){
      ctx.globalAlpha = .95; ctx.font = `${Math.max(12, 14/v.scale)}px system-ui`; ctx.fillStyle = '#06101a';
      const label = layer.loaded ? `${layer.id} ✓` : layer.id;
      const tw = ctx.measureText(label).width + 10;
      ctx.fillStyle = ROLE_COLORS[layer.id] || '#fff'; ctx.fillRect(-w/2, -h/2-22/v.scale, tw, 20/v.scale);
      ctx.fillStyle = '#07101d'; ctx.fillText(label, -w/2+5/v.scale, -h/2-7/v.scale);
    }
    ctx.restore();
  }
  ctx.restore();
}

function render(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  drawImageWithLayerTransforms();
}

function refreshUI(){
  const layerList = $('layerList'); layerList.innerHTML = '';
  const targetSelect = $('targetSelect'); targetSelect.innerHTML = '';
  for(const layer of state.layers){
    const card = document.createElement('div'); card.className = 'layer-card' + (layer.id===state.target?' active':'');
    card.innerHTML = `<div class="layer-title"><span>${layer.id}</span><span class="pill">z:${layer.z}</span></div><div class="layer-meta">${layer.loaded ? layer.fileName + ' / ' + Math.round(layer.bytes/1024) + 'KB' : '未読込'}</div>`;
    card.onclick = ()=>{ state.target=layer.id; refreshUI(); render(); };
    layerList.appendChild(card);
    const opt = document.createElement('option'); opt.value = layer.id; opt.textContent = layer.id; if(layer.id===state.target) opt.selected=true; targetSelect.appendChild(opt);
  }
  $('orderList').innerHTML = state.layers.map(l=>`<li>${l.id}${l.loaded?' ✓':''}</li>`).join('');
  buildControls();
}

function buildControls(){
  const box = $('controlBox'); const l = state.layers.find(x=>x.id===state.target) || state.layers[0];
  if(!l) return;
  const defs = [
    ['tx','X移動',-250,250,1],['ty','Y移動',-250,250,1],['sx','横拡縮',0.2,2,0.01],['sy','縦拡縮',0.05,2,0.01],['rot','回転',-45,45,0.1],['opacity','ガイド濃度',0,1,0.01]
  ];
  box.innerHTML = defs.map(([key,label,min,max,step])=>`<label>${label}<span class="num" id="num_${key}">${Number(l[key]).toFixed(step<1?2:0)}</span><input data-k="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${l[key]}"></label>`).join('') +
    `<label><input id="enabledChk" type="checkbox" ${l.enabled?'checked':''}> この意味レイヤーを表示</label>`;
  box.querySelectorAll('input[type=range]').forEach(inp=>inp.oninput=(e)=>{ const k=e.target.dataset.k; l[k]=Number(e.target.value); const n=$('num_'+k); if(n)n.textContent=Number(l[k]).toFixed(e.target.step<1?2:0); render(); });
  $('enabledChk').onchange=(e)=>{ l.enabled=e.target.checked; render(); refreshUI(); };
}

function animate(kind){
  cancelAnimationFrame(state.anim);
  const start = performance.now();
  function tick(t){
    const p = (t-start)/1000;
    if(kind==='blink'){
      for(const id of ['Eye_L','Eye_R']){ const l=state.layers.find(x=>x.id===id); if(l) l.sy = 1 - .88*Math.max(0, Math.sin(p*8)); }
    }
    if(kind==='mouth'){
      const l=state.layers.find(x=>x.id==='Mouth'); if(l) l.sy = .65 + .75*Math.abs(Math.sin(p*7));
    }
    if(kind==='turn'){
      const s = Math.sin(p*2);
      const face=state.layers.find(x=>x.id==='Face_Base'); if(face){ face.tx=s*22; face.rot=s*4; }
      const neck=state.layers.find(x=>x.id==='Neck'); if(neck){ neck.tx=s*12; neck.rot=s*2; }
      const front=state.layers.find(x=>x.id==='Hair_Front'); if(front){ front.tx=s*32; }
      const back=state.layers.find(x=>x.id==='Hair_Back'); if(back){ back.tx=s*-18; }
    }
    render();
    state.anim = requestAnimationFrame(tick);
  }
  state.anim = requestAnimationFrame(tick);
}

$('imageInput').onchange = (e)=>{
  const file = e.target.files[0]; if(!file) return;
  const url = URL.createObjectURL(file); const img = new Image();
  img.onload = ()=>{ state.image=img; state.imageName=file.name; URL.revokeObjectURL(url); fitView(); setStatus(`${file.name} を表示用画像として読み込みました`); };
  img.src = url;
};
$('cmoInput').onchange = (e)=>handleCmoFiles(e.target.files);
$('targetSelect').onchange = (e)=>{ state.target=e.target.value; refreshUI(); render(); };
$('showLabels').onchange = (e)=>{ state.showLabels=e.target.checked; render(); };
$('showGuides').onchange = (e)=>{ state.showGuides=e.target.checked; render(); };
$('fitBtn').onclick = fitView;
$('blinkBtn').onclick = ()=>animate('blink');
$('mouthBtn').onclick = ()=>animate('mouth');
$('turnBtn').onclick = ()=>animate('turn');
$('resetBtn').onclick = ()=>{ cancelAnimationFrame(state.anim); state.anim=null; for(const l of state.layers){ Object.assign(l,{tx:0,ty:0,sx:1,sy:1,rot:0,opacity:1,enabled:true}); } refreshUI(); render(); };

window.addEventListener('resize', resizeCanvas);
refreshUI(); loadDefaultImage(); setTimeout(resizeCanvas, 50);
