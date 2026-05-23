window.addEventListener("error", e=>reportError("runtime", e));

const canvases = {
  cut: document.getElementById("canvas"),
  rig: document.getElementById("rigCanvas"),
  live: document.getElementById("liveCanvas"),
  obs: document.getElementById("obsCanvas"),
  mini: document.getElementById("miniMap")
};
const ctxs = Object.fromEntries(Object.entries(canvases).map(([k,c])=>[k,c.getContext("2d")]));
const video=document.getElementById("video");

const labels={
  headTop:"頭頂",chin:"顎先",templeL:"左こめかみ",templeR:"右こめかみ",neck:"首中心",body:"体中心",
  eyeLCenter:"左目中心",eyeLCornerIn:"左目頭",eyeLCornerOut:"左目尻",eyeLUpper:"左上まぶた",eyeLLower:"左下まぶた",
  eyeRCenter:"右目中心",eyeRCornerIn:"右目頭",eyeRCornerOut:"右目尻",eyeRUpper:"右上まぶた",eyeRLower:"右下まぶた",
  mouthCenter:"口中心",mouthLeft:"口左",mouthRight:"口右",mouthUpper:"口上",mouthLower:"口下",
  bangsRootL:"左前髪根元",bangsTipL:"左前髪先",bangsRootR:"右前髪根元",bangsTipR:"右前髪先",
  sideHairRootL:"左横髪根元",sideHairTipL:"左横髪先",sideHairRootR:"右横髪根元",sideHairTipR:"右横髪先",
  backHairRoot:"後ろ髪根元",backHairTip:"後ろ髪先",
  face:"顔",leftEye:"左目",rightEye:"右目",mouth:"口",hair:"髪"
};
const colors={
  headTop:"#ffe66d",chin:"#ff7675",templeL:"#ffe66d",templeR:"#ffe66d",neck:"#55efc4",body:"#74b9ff",
  eyeLCenter:"#ff66c4",eyeLCornerIn:"#ff66c4",eyeLCornerOut:"#ff66c4",eyeLUpper:"#ff66c4",eyeLLower:"#ff66c4",
  eyeRCenter:"#ff66c4",eyeRCornerIn:"#ff66c4",eyeRCornerOut:"#ff66c4",eyeRUpper:"#ff66c4",eyeRLower:"#ff66c4",
  mouthCenter:"#ff9f43",mouthLeft:"#ff9f43",mouthRight:"#ff9f43",mouthUpper:"#ff9f43",mouthLower:"#ff9f43",
  bangsRootL:"#a29bfe",bangsTipL:"#c77dff",bangsRootR:"#a29bfe",bangsTipR:"#c77dff",
  sideHairRootL:"#a29bfe",sideHairTipL:"#c77dff",sideHairRootR:"#a29bfe",sideHairTipR:"#c77dff",backHairRoot:"#a29bfe",backHairTip:"#c77dff"
};

const projectState={
  version:"4.3",
  original:null,
  originalDataUrl:"",
  points:{},
  parts:{},
  masks:{},
  contours:{},
  mesh:{vertices:[],triangles:[],edges:[]},
  inpainted:null,
  rig:{
    headBone:.75,neckBone:.42,hairBone:.62,headRotate:2.6,
    mouthLayerOpen:1.8,mouthLayerDrop:42,mouthLayerAlpha:.95,mouthHold:1.8,mouthLinkStrength:1.0,
    eyeLayerClose:1.75,eyeLayerAlpha:.95,blinkHold:1.4,eyeSmile:.10,eyeLinkStrength:1.0,blinkShapeStrength:1.0,
    lineDarkSensitivity:2.2,lineConnect:6,mouthSearchScale:.95,eyeSearchScale:.90,
    inpaintStrength:.85,showMasks:true,showPins:true,showMesh:true,meshWarp:true,meshStrength:.38,hairMeshStrength:.65,mouthMeshStrength:.85,blinkMeshStrength:.85,faceWarpSoftness:.65
  }
};

const runtime={
  tab:"cut", viewMode:"original", tool:"headTop", activeCanvas:"cut",
  view:{zoom:1,panX:0,panY:0,dragging:false,dragPin:null,lastX:0,lastY:0,moved:false,spaceDown:false},
  t:0,lastFrame:performance.now(),fps:0,
  smooth:{yaw:0,mouth:0,blink:0,headX:0,headY:0,neckX:0,hairX:0},
  manual:{talking:0,blinkBoost:0,mouthUntil:0,blinkUntil:0},
  autoYaw:false, obs:false, cameraOn:false, micOn:false,
  showHelpers:true
};

init();

function init(){
  wire();
  resizeAll();
  loadSample();
  requestAnimationFrame(loop);
}

function wire(){
  window.addEventListener("resize", resizeAll);
  document.querySelectorAll(".tab").forEach(btn=>btn.onclick=()=>switchTab(btn.dataset.tab));
  on("loadSampleBtn", loadSample);
  on("fileInput", e=>loadFile(e.target.files[0]), "change");
  on("saveProjectBtn", saveProject);
  on("loadProjectBtn", loadProject);
  on("obsBtn", openObs);
  on("closeObsBtn", closeObs);

  on("autoPointsBtn", autoPoints);
  on("traceBtn", ()=>{traceContours();syncToLive("輪郭トレースOK");});
  on("autoPartsBtn", ()=>{generateParts();generateMesh();syncToLive("自動パーツ生成OK");});
  on("generateMeshBtn", ()=>{generateMesh();syncToLive("メッシュ生成OK");});
  on("toggleMeshBtn", ()=>{projectState.rig.showMesh=!projectState.rig.showMesh;updateControls();syncToLive(projectState.rig.showMesh?"メッシュ表示ON":"メッシュ表示OFF");});
  on("toggleMeshWarpBtn", ()=>{projectState.rig.meshWarp=!projectState.rig.meshWarp;updateControls();syncToLive(projectState.rig.meshWarp?"メッシュ変形ON":"メッシュ変形OFF");});
  on("applyToLiveBtn", ()=>{generateMesh();syncToLive("Liveへ反映しました");});
  on("hideHelpersBtn", ()=>{runtime.showHelpers=false;projectState.rig.showMasks=false;projectState.rig.showPins=false;updateControls();});
  on("showHelpersBtn", ()=>{runtime.showHelpers=true;projectState.rig.showMasks=true;projectState.rig.showPins=true;updateControls();});

  on("showOriginalBtn", ()=>runtime.viewMode="original");
  on("showInpaintBtn", ()=>runtime.viewMode="inpaint");
  on("showPartsBtn", ()=>{runtime.viewMode="parts";renderPartsPreview();});
  on("showLivePreviewBtn", ()=>runtime.viewMode="live");

  document.querySelectorAll(".tool").forEach(b=>b.onclick=()=>selectTool(b));

  on("applyRigPresetBtn", applyRigPreset);
  on("exprNeutralBtn", ()=>applyExpression("neutral"));
  on("exprSmileBtn", ()=>applyExpression("smile"));
  on("testMouthBtn", testMouth);
  on("testBlinkBtn", testBlink);
  on("testMotionBtn", testMotion);
  on("resetMotionBtn", resetMotion);
  on("toggleAutoYawBtn", toggleAutoYaw);
  on("liveAutoYawBtn", toggleAutoYaw);
  on("toggleTrackingBtn", ()=>setStatus("rigStatus","顔トラッキングは次段階で再接続予定"));
  on("toggleMicBtn", ()=>setStatus("rigStatus","マイク口パクは次段階で再接続予定"));
  on("rigPreviewBtn", ()=>switchTab("rig"));

  on("liveMouthBtn", testMouth);
  on("liveBlinkBtn", testBlink);
  on("liveResetBtn", resetMotion);

  on("downloadPartsBtn", downloadParts);
  on("downloadProjectBtn", downloadProjectJson);

  ["headBone","neckBone","hairBone","headRotate","mouthLayerOpen","mouthLayerDrop","mouthLayerAlpha","mouthHold","mouthLinkStrength","eyeLayerClose","eyeLayerAlpha","blinkHold","eyeSmile","eyeLinkStrength","blinkShapeStrength","lineDarkSensitivity","lineConnect","mouthSearchScale","eyeSearchScale","inpaintStrength","showMasks","showPins","showMesh","meshWarp","meshStrength","hairMeshStrength","mouthMeshStrength","blinkMeshStrength","faceWarpSoftness"].forEach(id=>{
    const el=document.getElementById(id);
    if(!el)return;
    el.addEventListener(el.type==="checkbox"?"change":"input",()=>{
      projectState.rig[id]=el.type==="checkbox"?el.checked:Number(el.value);
      updateControls();
      syncToLive("Rig変更を反映");
    });
  });

  setupCanvasInteraction(canvases.cut);
  wireZoomControls();
  updateControls();
  updateZoomUi();
}

function on(id,fn,type="click"){
  const el=document.getElementById(id);
  if(!el){console.warn("missing",id);return;}
  el.addEventListener(type,e=>{try{clearError();fn(e);}catch(err){reportError(id,err);}});
}

function switchTab(tab){
  runtime.tab=tab;
  document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.tab===tab));
  document.querySelectorAll(".tab-page").forEach(p=>p.classList.toggle("active",p.id===`tab-${tab}`));
  setTimeout(resizeAll,30);
}

function resizeAll(){
  Object.entries(canvases).forEach(([key,c])=>{
    if(!c||key==="mini")return;
    const box=c.parentElement.getBoundingClientRect();
    c.width=Math.max(1,Math.floor(box.width));
    c.height=Math.max(1,Math.floor(box.height));
    c.style.width=box.width+"px";
    c.style.height=box.height+"px";
  });
}

function loadSample(){
  loadImage("./sample_character.png?v="+Date.now(),"sample_character.png");
}

function loadFile(file){
  if(!file)return;
  const r=new FileReader();
  r.onload=()=>loadImage(r.result,file.name);
  r.readAsDataURL(file);
}

function loadImage(src,name){
  const img=new Image();
  img.onload=()=>{
    projectState.original=img;
    projectState.originalDataUrl=src;
    autoPoints();
    generateParts();
    generateMesh();
    document.getElementById("dropMessage").style.display="none";
    setStatus("cutStatus",`画像読み込みOK: ${name}`);
  };
  img.onerror=()=>setStatus("cutStatus","画像読み込み失敗");
  img.src=src;
}

function autoPoints(){
  projectState.points={
    headTop:{x:.50,y:.115}, chin:{x:.50,y:.535}, templeL:{x:.365,y:.345}, templeR:{x:.635,y:.345}, neck:{x:.50,y:.600}, body:{x:.50,y:.740},
    eyeLCenter:{x:.405,y:.325}, eyeLCornerIn:{x:.448,y:.323}, eyeLCornerOut:{x:.362,y:.322}, eyeLUpper:{x:.405,y:.304}, eyeLLower:{x:.405,y:.344},
    eyeRCenter:{x:.595,y:.325}, eyeRCornerIn:{x:.552,y:.323}, eyeRCornerOut:{x:.638,y:.322}, eyeRUpper:{x:.595,y:.304}, eyeRLower:{x:.595,y:.344},
    mouthCenter:{x:.50,y:.455}, mouthLeft:{x:.465,y:.455}, mouthRight:{x:.535,y:.455}, mouthUpper:{x:.50,y:.442}, mouthLower:{x:.50,y:.470},
    bangsRootL:{x:.435,y:.190}, bangsTipL:{x:.405,y:.318}, bangsRootR:{x:.565,y:.190}, bangsTipR:{x:.595,y:.318},
    sideHairRootL:{x:.335,y:.275}, sideHairTipL:{x:.300,y:.565}, sideHairRootR:{x:.665,y:.275}, sideHairTipR:{x:.700,y:.565},
    backHairRoot:{x:.50,y:.175}, backHairTip:{x:.50,y:.660}
  };
  syncLegacyPoints();
  generateMesh();
  setStatus("cutStatus","詳細ピンプリセットOK");
}

function selectTool(btn){
  document.querySelectorAll(".tool").forEach(b=>b.classList.remove("active"));
  btn.classList.add("active");
  runtime.tool=btn.dataset.point;
  document.getElementById("toolReadout").textContent="選択中: "+(labels[runtime.tool]||runtime.tool);
}

function setupCanvasInteraction(c){
  c.addEventListener("mousedown",e=>{
    runtime.view.dragging=true;
    runtime.view.lastX=e.clientX;
    runtime.view.lastY=e.clientY;
    runtime.view.moved=false;
    runtime.view.dragPin=null;
    if(projectState.original && !runtime.view.spaceDown){
      const hit=findNearestPoint(e);
      if(hit){
        runtime.view.dragPin=hit.key;
        runtime.tool=hit.key;
        document.querySelectorAll(".tool").forEach(b=>b.classList.toggle("active",b.dataset.point===hit.key));
        const tr=document.getElementById("toolReadout"); if(tr)tr.textContent="選択中: "+(labels[hit.key]||hit.key);
      }
    }
  });
}

window.addEventListener("mousemove",e=>{
  if(!runtime.view.dragging)return;
  const dx=e.clientX-runtime.view.lastX,dy=e.clientY-runtime.view.lastY;
  if(Math.abs(dx)+Math.abs(dy)>3)runtime.view.moved=true;
  if(runtime.view.dragPin){
    updatePointFromEvent(runtime.view.dragPin,e);
  }else{
    runtime.view.panX+=dx;runtime.view.panY+=dy;
  }
  runtime.view.lastX=e.clientX;runtime.view.lastY=e.clientY;
});
window.addEventListener("mouseup",()=>{runtime.view.dragging=false;runtime.view.dragPin=null;});
canvases.cut.addEventListener("click",e=>{
  if(runtime.view.moved){runtime.view.moved=false;return;}
  placePoint(e);
});
canvases.cut.addEventListener("wheel",e=>{
  e.preventDefault();
  zoomAt(e.deltaY<0?1.18:1/1.18,e.clientX,e.clientY);
},{passive:false});
window.addEventListener("keydown",e=>{
  if(e.code==="Space"){
    runtime.view.spaceDown=true;
    const stage=document.getElementById("stage");
    if(stage)stage.classList.add("space-pan");
    e.preventDefault();
  }
});
window.addEventListener("keyup",e=>{
  if(e.code==="Space"){
    runtime.view.spaceDown=false;
    const stage=document.getElementById("stage");
    if(stage)stage.classList.remove("space-pan");
  }
});

function placePoint(e){
  if(!projectState.original)return;
  const rect=canvases.cut.getBoundingClientRect();
  const r=imageRect(canvases.cut.width,canvases.cut.height,true);
  setPoint(runtime.tool, clamp((e.clientX-rect.left-r.x)/r.w,0,1), clamp((e.clientY-rect.top-r.y)/r.h,0,1), true);
  generateMesh();
  setStatus("cutStatus",`${labels[runtime.tool]||runtime.tool}を移動`);
}


function updatePointFromEvent(key,e){
  if(!projectState.original||!projectState.points[key])return;
  const rect=canvases.cut.getBoundingClientRect();
  const r=imageRect(canvases.cut.width,canvases.cut.height,true);
  setPoint(key, clamp((e.clientX-rect.left-r.x)/r.w,0,1), clamp((e.clientY-rect.top-r.y)/r.h,0,1), true);
  generateMesh(false);
}

function findNearestPoint(e){
  if(!projectState.original)return null;
  const rect=canvases.cut.getBoundingClientRect();
  const r=imageRect(canvases.cut.width,canvases.cut.height,true);
  let best=null;
  Object.entries(projectState.points||{}).forEach(([k,p])=>{
    if(["face","leftEye","rightEye","mouth","hair"].includes(k))return;
    const x=rect.left+r.x+p.x*r.w,y=rect.top+r.y+p.y*r.h;
    const d=Math.hypot(e.clientX-x,e.clientY-y);
    const limit=Math.max(12,18*Math.min(1.8,runtime.view.zoom));
    if(d<=limit && (!best||d<best.d))best={key:k,d};
  });
  return best;
}

window.addEventListener("keydown",e=>{
  if(!projectState.original)return;
  const key=runtime.tool;
  if(!projectState.points[key])return;
  const step=(e.shiftKey?.01:.003)/(runtime.view.zoom||1);
  let dx=0,dy=0;
  if(e.key==="ArrowLeft")dx=-step;
  else if(e.key==="ArrowRight")dx=step;
  else if(e.key==="ArrowUp")dy=-step;
  else if(e.key==="ArrowDown")dy=step;
  else return;
  setPoint(key, clamp(projectState.points[key].x+dx,0,1), clamp(projectState.points[key].y+dy,0,1), true);
  generateMesh(false);e.preventDefault();
});

function setPoint(key,x,y,propagate=true){
  const pts=projectState.points||{};
  const old=pts[key]?{x:pts[key].x,y:pts[key].y}:null;
  pts[key]={x,y};
  if(propagate && old){
    const dx=x-old.x, dy=y-old.y;
    propagateLinkedPins(key,dx,dy);
  }
  syncLegacyPoints();
}

function propagateLinkedPins(key,dx,dy){
  const p=projectState.points||{};
  const move=(keys,rate=1)=>keys.forEach(k=>{ if(p[k] && k!==key){ p[k].x=clamp(p[k].x+dx*rate,0,1); p[k].y=clamp(p[k].y+dy*rate,0,1); }});
  if(key==="eyeLCenter") move(["eyeLCornerIn","eyeLCornerOut","eyeLUpper","eyeLLower"], projectState.rig.eyeLinkStrength??1);
  if(key==="eyeRCenter") move(["eyeRCornerIn","eyeRCornerOut","eyeRUpper","eyeRLower"], projectState.rig.eyeLinkStrength??1);
  if(key==="mouthCenter") move(["mouthLeft","mouthRight","mouthUpper","mouthLower"], projectState.rig.mouthLinkStrength??1);
  if(key==="headTop") move(["bangsRootL","bangsRootR","backHairRoot"], .55);
  if(key==="chin") move(["neck"], .25);
}

function imageRect(w,h,editor=false){
  const img=projectState.original;
  if(!img)return{x:0,y:0,w:0,h:0};
  const s=Math.min(w/img.width,h/img.height)*.92;
  let r={x:(w-img.width*s)/2,y:(h-img.height*s)/2,w:img.width*s,h:img.height*s};
  if(editor){
    const cx=w/2,cy=h/2;
    r={x:cx+(r.x-cx)*runtime.view.zoom+runtime.view.panX,y:cy+(r.y-cy)*runtime.view.zoom+runtime.view.panY,w:r.w*runtime.view.zoom,h:r.h*runtime.view.zoom};
  }
  return r;
}


function syncLegacyPoints(){
  const p=projectState.points||{};
  if(p.headTop&&p.chin){
    p.face={x:(p.headTop.x+p.chin.x)/2,y:p.headTop.y+(p.chin.y-p.headTop.y)*.52};
    p.hair={x:p.headTop.x,y:p.headTop.y+.08};
  }
  if(p.eyeLCenter)p.leftEye=p.eyeLCenter;
  if(p.eyeRCenter)p.rightEye=p.eyeRCenter;
  if(p.mouthCenter)p.mouth=p.mouthCenter;
}

function wireZoomControls(){
  on("zoomInBtn",()=>zoomAt(1.35));
  on("zoomOutBtn",()=>zoomAt(1/1.35));
  on("fitViewBtn",()=>{runtime.view.zoom=1;runtime.view.panX=0;runtime.view.panY=0;updateZoomUi();setStatus("cutStatus","全体表示に戻しました");});
  on("resetViewBtn",()=>{runtime.view.panX=0;runtime.view.panY=0;updateZoomUi();setStatus("cutStatus","表示位置を中央に戻しました");});
  document.querySelectorAll(".zoomPreset").forEach(b=>b.addEventListener("click",()=>setZoom(Number(b.dataset.zoom))));
  const slider=document.getElementById("zoomSlider");
  if(slider)slider.addEventListener("input",()=>setZoom(Number(slider.value)/100));
}

function setZoom(z){
  runtime.view.zoom=clamp(z,.25,32);
  updateZoomUi();
}

function zoomAt(factor,clientX=null,clientY=null){
  const old=runtime.view.zoom;
  const next=clamp(old*factor,.25,32);
  if(Math.abs(next-old)<.001)return;
  if(clientX!=null&&clientY!=null){
    const rect=canvases.cut.getBoundingClientRect();
    const sx=clientX-rect.left-canvases.cut.width/2;
    const sy=clientY-rect.top-canvases.cut.height/2;
    const ratio=next/old;
    runtime.view.panX=sx-(sx-runtime.view.panX)*ratio;
    runtime.view.panY=sy-(sy-runtime.view.panY)*ratio;
  }
  runtime.view.zoom=next;
  updateZoomUi();
}

function updateZoomUi(){
  const pct=Math.round(runtime.view.zoom*100);
  const read=document.getElementById("zoomReadout");
  const slider=document.getElementById("zoomSlider");
  if(read)read.textContent=pct+"%";
  if(slider)slider.value=clamp(pct,25,3200);
}

function traceContours(){
  if(!projectState.original)return;
  syncLegacyPoints();
  projectState.contours={
    mouth:traceFeature(projectState.points.mouth,"mouth"),
    leftEye:traceEyeFromPins("L"),
    rightEye:traceEyeFromPins("R")
  };
}


function traceEyeFromPins(side){
  const p=projectState.points;
  const prefix=side==="L"?"eyeL":"eyeR";
  const center=p[prefix+"Center"] || (side==="L"?p.leftEye:p.rightEye);
  const upper=p[prefix+"Upper"], lower=p[prefix+"Lower"], inner=p[prefix+"CornerIn"], outer=p[prefix+"CornerOut"];
  if(center&&upper&&lower&&inner&&outer&&projectState.original){
    const w=projectState.original.width,h=projectState.original.height;
    const points=[
      {x:inner.x*w,y:inner.y*h},
      {x:(center.x*.55+upper.x*.45)*w,y:upper.y*h},
      {x:outer.x*w,y:outer.y*h},
      {x:(center.x*.55+lower.x*.45)*w,y:lower.y*h}
    ];
    return {type:"eye",cx:center.x*w,cy:center.y*h,points:smoothContour(points,3)};
  }
  return traceFeature(center,"eye");
}

function traceFeature(pt,type){
  const img=projectState.original;
  const temp=toCanvas(img);
  const g=temp.getContext("2d");
  const data=g.getImageData(0,0,temp.width,temp.height).data;
  const w=temp.width,h=temp.height;
  const scale=type==="mouth"?projectState.rig.mouthSearchScale:projectState.rig.eyeSearchScale;
  const bw=(type==="mouth"?0.16:0.13)*w*scale,bh=(type==="mouth"?0.09:0.075)*h*scale;
  const cx=pt.x*w,cy=pt.y*h,sens=projectState.rig.lineDarkSensitivity;
  let pts=[];
  for(let y=Math.max(1,cy-bh)|0;y<Math.min(h-1,cy+bh);y++){
    for(let x=Math.max(1,cx-bw)|0;x<Math.min(w-1,cx+bw);x++){
      const i=(y*w+x)*4;
      if(data[i+3]<10)continue;
      const L=luma(data[i],data[i+1],data[i+2]);
      const edge=Math.abs(luma(data[i+4],data[i+5],data[i+6])-luma(data[i-4],data[i-3],data[i-2]))+Math.abs(luma(data[i+w*4],data[i+w*4+1],data[i+w*4+2])-luma(data[i-w*4],data[i-w*4+1],data[i-w*4+2]));
      const local=clamp(1-Math.hypot((x-cx)/bw,(y-cy)/bh),0,1);
      const score=(clamp((135-L)/(80/sens),0,1)*.55+clamp(edge/(55/sens),0,1)*.45)*local;
      if(score>.34)pts.push({x,y,score});
    }
  }
  if(pts.length<10)return fallbackContour(cx,cy,bw*.35,bh*.35,type);
  let sx=0,sy=0,sw=0;
  pts.forEach(p=>{sx+=p.x*p.score;sy+=p.y*p.score;sw+=p.score;});
  const ccx=sx/sw,ccy=sy/sw;
  const bins=72, arr=new Array(bins).fill(0).map(()=>null);
  pts.forEach(p=>{
    const a=Math.atan2(p.y-ccy,p.x-ccx);
    const b=clamp(Math.floor(((a+Math.PI)/(Math.PI*2))*bins),0,bins-1)|0;
    const d=Math.hypot(p.x-ccx,p.y-ccy);
    if(!arr[b]||d>arr[b].d)arr[b]={x:p.x,y:p.y,d};
  });
  let points=[];
  for(let i=0;i<bins;i++){
    if(arr[i])points.push({x:arr[i].x,y:arr[i].y});
    else{
      const a=i/bins*Math.PI*2;
      points.push({x:ccx+Math.cos(a)*bw*.25,y:ccy+Math.sin(a)*bh*.25});
    }
  }
  points=smoothContour(points,2);
  projectState.points[type==="mouth"?"mouth":(pt===projectState.points.leftEye?"leftEye":"rightEye")]={x:ccx/w,y:ccy/h};
  return{type,cx:ccx,cy:ccy,points};
}

function fallbackContour(cx,cy,rx,ry,type){
  const points=[];
  for(let i=0;i<72;i++){const a=i/72*Math.PI*2;points.push({x:cx+Math.cos(a)*rx,y:cy+Math.sin(a)*ry});}
  return{type,cx,cy,points};
}
function smoothContour(points,passes){
  let pts=points;
  for(let p=0;p<passes;p++)pts=pts.map((pt,i)=>{const a=pts[(i-1+pts.length)%pts.length],b=pts[(i+1)%pts.length];return{x:(a.x+pt.x*2+b.x)/4,y:(a.y+pt.y*2+b.y)/4};});
  return pts;
}

function generateParts(){
  if(!projectState.original)return;
  traceContours();
  const img=projectState.original,w=img.width,h=img.height,src=toCanvas(img);
  const masks={};
  masks.face=createMask(w,h);drawEllipseMask(masks.face,projectState.points.face.x*w,(projectState.points.face.y+.05)*h,.22*w,.25*h);
  masks.hair=createMask(w,h);drawEllipseMask(masks.hair,projectState.points.hair.x*w,(projectState.points.hair.y+.10)*h,.30*w,.24*h);
  masks.neck=createMask(w,h);drawEllipseMask(masks.neck,projectState.points.neck.x*w,projectState.points.neck.y*h,.10*w,.08*h);
  masks.mouth=contourToMask(projectState.contours.mouth,w,h,projectState.rig.lineConnect);
  masks.leftEye=contourToMask(projectState.contours.leftEye,w,h,projectState.rig.lineConnect);
  masks.rightEye=contourToMask(projectState.contours.rightEye,w,h,projectState.rig.lineConnect);
  projectState.masks=masks;
  projectState.inpainted=inpaint(src,[masks.face,masks.hair,masks.leftEye,masks.rightEye,masks.mouth,masks.neck]);
  projectState.parts={
    base_inpainted:projectState.inpainted,
    original:src,
    face:cutLayer(src,masks.face),
    front_hair:cutLayer(src,masks.hair),
    left_eye:cutLayer(src,masks.leftEye),
    right_eye:cutLayer(src,masks.rightEye),
    mouth:cutLayer(src,masks.mouth),
    neck:cutLayer(src,masks.neck)
  };
  generateMesh(false);
  renderPartsPreview();
}

function toCanvas(img){
  const c=document.createElement("canvas");c.width=img.width;c.height=img.height;c.getContext("2d").drawImage(img,0,0);return c;
}
function createMask(w,h){const c=document.createElement("canvas");c.width=w;c.height=h;return c;}
function drawEllipseMask(mask,cx,cy,rx,ry){const g=mask.getContext("2d");g.fillStyle="#fff";g.beginPath();g.ellipse(cx,cy,rx,ry,0,0,Math.PI*2);g.fill();}
function contourToMask(contour,w,h,grow=4){const c=createMask(w,h),g=c.getContext("2d");g.fillStyle="#fff";g.beginPath();contour.points.forEach((p,i)=>i?g.lineTo(p.x,p.y):g.moveTo(p.x,p.y));g.closePath();g.fill();g.lineWidth=grow*2;g.strokeStyle="#fff";g.stroke();return c;}
function cutLayer(src,mask){const c=createMask(src.width,src.height),g=c.getContext("2d");g.drawImage(src,0,0);g.globalCompositeOperation="destination-in";g.drawImage(mask,0,0);g.globalCompositeOperation="source-over";return c;}
function inpaint(src,masks){
  const c=toCanvas(src),g=c.getContext("2d"),img=g.getImageData(0,0,c.width,c.height),d=img.data,w=c.width,h=c.height,str=projectState.rig.inpaintStrength;
  masks.forEach(mask=>{
    const md=mask.getContext("2d").getImageData(0,0,w,h).data;
    let minX=w,minY=h,maxX=0,maxY=0;
    for(let y=0;y<h;y+=2)for(let x=0;x<w;x+=2)if(md[(y*w+x)*4+3]>10){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
    minX=Math.max(0,minX-24);minY=Math.max(0,minY-24);maxX=Math.min(w-1,maxX+24);maxY=Math.min(h-1,maxY+24);
    let r=0,gg=0,b=0,n=0;
    for(let y=minY;y<=maxY;y+=3)for(let x=minX;x<=maxX;x+=3){const i=(y*w+x)*4;if(md[i+3]<10&&d[i+3]>10){r+=d[i];gg+=d[i+1];b+=d[i+2];n++;}}
    if(!n)return;r/=n;gg/=n;b/=n;
    for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){const i=(y*w+x)*4,a=md[i+3]/255*str;if(a>0){d[i]=d[i]*(1-a)+r*a;d[i+1]=d[i+1]*(1-a)+gg*a;d[i+2]=d[i+2]*(1-a)+b*a;d[i+3]=255;}}
  });
  g.putImageData(img,0,0);return c;
}

function renderPartsPreview(){
  const box=document.getElementById("partsPreview");if(!box)return;
  box.innerHTML="";
  Object.entries(projectState.parts||{}).forEach(([name,canvas])=>{
    const card=document.createElement("div");card.className="part-card";
    const img=document.createElement("img");img.src=canvas.toDataURL("image/png");
    const lab=document.createElement("div");lab.textContent=name;
    card.append(img,lab);box.appendChild(card);
  });
}

function syncToLive(msg){setStatus("liveStatus",msg);updateProjectReadout();}
function applyRigPreset(){Object.assign(projectState.rig,{headBone:.75,neckBone:.42,hairBone:.62,headRotate:2.6,mouthLayerOpen:1.8,mouthLayerDrop:42,eyeLayerClose:1.75});updateControls();syncToLive("Rigプリセット適用");}
function applyExpression(name){projectState.rig.eyeSmile=name==="smile"?.55:.10;updateControls();syncToLive(name==="smile"?"笑顔":"通常");}
function testMouth(){runtime.manual.talking=1.9;runtime.manual.mouthUntil=performance.now()+projectState.rig.mouthHold*1000;runtime.smooth.mouth=1;setStatus("rigStatus","口パクテスト：口中心を親に上下左右が連動します");}
function testBlink(){runtime.manual.blinkBoost=2.2;runtime.manual.blinkUntil=performance.now()+projectState.rig.blinkHold*1000;runtime.smooth.blink=1;setStatus("rigStatus","瞬きテスト：目ピンの上下が中心へ閉じます");}
function testMotion(){
  testMouth();
  testBlink();
  runtime.autoYaw=true;
  runtime.smooth.yaw=.32;
  runtime.smooth.headX=18;
  runtime.smooth.hairX=-16;
  updateAutoYawButtons();
  setStatus("rigStatus","動作テスト中：顔向き・口・瞬き・髪揺れを強めに反映");
}
function resetMotion(){runtime.smooth={yaw:0,mouth:0,blink:0,headX:0,headY:0,neckX:0,hairX:0};runtime.manual={talking:0,blinkBoost:0,mouthUntil:0,blinkUntil:0};runtime.autoYaw=false;updateAutoYawButtons();}
function toggleAutoYaw(){runtime.autoYaw=!runtime.autoYaw;updateAutoYawButtons();}
function updateAutoYawButtons(){["toggleAutoYawBtn","liveAutoYawBtn"].forEach(id=>{const b=document.getElementById(id);if(b)b.textContent=runtime.autoYaw?"顔向き自動 ON":"顔向き自動 OFF";});}

function drawAvatar(g,w,h,editor=false,mode="live"){
  g.clearRect(0,0,w,h);
  if(!projectState.original)return;
  const r=imageRect(w,h,editor);
  const parts=projectState.parts;
  if(mode==="original"||!parts.base_inpainted){g.drawImage(projectState.original,r.x,r.y,r.w,r.h);}
  else if(mode==="inpaint"){g.drawImage(projectState.inpainted,r.x,r.y,r.w,r.h);}
  else if(mode==="parts"){drawPartsGrid(g,w,h);}
  else{
    if(projectState.rig.meshWarp && projectState.mesh && projectState.mesh.triangles.length){
      drawMeshAvatar(g,r);
    }else{
      const p=projectState.points, rig=projectState.rig, yaw=runtime.smooth.yaw, scale=r.w/projectState.original.width;
      const headMove=runtime.smooth.headX*scale*rig.headBone, headY=runtime.smooth.headY*scale*.45;
      const rot=yaw*rig.headRotate*Math.PI/180;
      g.drawImage(parts.base_inpainted||projectState.original,r.x,r.y,r.w,r.h);
      drawPart(g,parts.neck,p.neck,r, runtime.smooth.neckX*scale*rig.neckBone,0,rot*.1,1,1,.85);
      drawPart(g,parts.face,p.face,r, headMove,headY,rot,1-Math.abs(yaw)*.01,1,1);
      drawPart(g,parts.front_hair,p.hair,r, runtime.smooth.hairX*scale*rig.hairBone,headY*.2,rot*.25,1,1,.80);
      const blink=clamp(runtime.smooth.blink*rig.eyeLayerClose+rig.eyeSmile*.55,0,.94);
      drawEye(g,parts.left_eye,p.leftEye,r,headMove,headY,rot,blink);
      drawEye(g,parts.right_eye,p.rightEye,r,headMove,headY,rot,blink);
      drawMouth(g,parts.mouth,p.mouth,r,headMove,headY,rot,runtime.smooth.mouth);
      drawSynthetic(g,r,p,headMove,headY,rot);
    }
  }
  if(editor&&runtime.showHelpers)drawHelpers(g,r);
}

function drawPart(g,img,pt,r,tx=0,ty=0,rot=0,sx=1,sy=1,a=1){
  if(!img||!pt)return;
  const cx=r.x+pt.x*r.w,cy=r.y+pt.y*r.h;
  g.save();g.globalAlpha=a;g.translate(cx+tx,cy+ty);g.rotate(rot);g.scale(sx,sy);g.translate(-cx,-cy);g.drawImage(img,r.x,r.y,r.w,r.h);g.restore();
}
function drawEye(g,img,pt,r,tx,ty,rot,blink){drawPart(g,img,pt,r,tx*.55,ty*.6,rot*.25,1,Math.max(.08,1-blink*.88),projectState.rig.eyeLayerAlpha);}
function drawMouth(g,img,pt,r,tx,ty,rot,mouth){drawPart(g,img,pt,r,tx*.8,ty+mouth*projectState.rig.mouthLayerDrop*(r.w/900),rot*.18,1+mouth*.1*projectState.rig.mouthLayerOpen,1+mouth*.32*projectState.rig.mouthLayerOpen,projectState.rig.mouthLayerAlpha);}
function drawSynthetic(g,r,p,tx,ty,rot){
  const scale=r.w/900;
  const m=runtime.smooth.mouth;
  const b=clamp(runtime.smooth.blink*projectState.rig.eyeLayerClose+projectState.rig.eyeSmile*.15,0,.96);

  // 瞬き：中心楕円ではなく、目頭/目尻/上下まぶたピンを使って閉じ線を描く。
  if(b>.03){
    drawBlinkLine(g,r,"L",tx,ty,rot,b);
    drawBlinkLine(g,r,"R",tx,ty,rot,b);
  }

  // 口パク：口ピンの上下左右から口内を生成。中心だけの楕円より形が合わせやすい。
  if(m>.03 && p.mouthCenter){
    const ml=p.mouthLeft||p.mouthCenter, mr=p.mouthRight||p.mouthCenter, mu=p.mouthUpper||p.mouthCenter, md=p.mouthLower||p.mouthCenter;
    const lx=r.x+ml.x*r.w+tx*.8, rx=r.x+mr.x*r.w+tx*.8;
    const uy=r.y+mu.y*r.h+ty, dy=r.y+md.y*r.h+ty + m*projectState.rig.mouthLayerDrop*scale*.45;
    const cx=(lx+rx)/2, cy=(uy+dy)/2;
    const rw=Math.max(8*scale,(rx-lx)/2*(1+m*.25));
    const rh=Math.max(3*scale,(dy-uy)/2 + 9*scale*m*projectState.rig.mouthLayerOpen);
    g.save();
    g.translate(cx,cy);g.rotate(rot*.18);
    g.fillStyle=`rgba(86,22,38,${.42+m*.43})`;
    g.beginPath();g.ellipse(0,0,rw,rh,0,0,Math.PI*2);g.fill();
    g.strokeStyle=`rgba(255,170,190,${.22+m*.18})`;g.lineWidth=Math.max(1,2*scale);g.stroke();
    g.restore();
  }
}

function drawBlinkLine(g,r,side,tx,ty,rot,b){
  const p=projectState.points;
  const pre=side==="L"?"eyeL":"eyeR";
  const inn=p[pre+"CornerIn"], out=p[pre+"CornerOut"], up=p[pre+"Upper"], low=p[pre+"Lower"], cen=p[pre+"Center"];
  if(!inn||!out||!cen)return;
  const ix=r.x+inn.x*r.w+tx*.55, iy=r.y+inn.y*r.h+ty*.6;
  const ox=r.x+out.x*r.w+tx*.55, oy=r.y+out.y*r.h+ty*.6;
  const cy=r.y+cen.y*r.h+ty*.6;
  const uy=up? r.y+up.y*r.h+ty*.6 : cy-8;
  const ly=low? r.y+low.y*r.h+ty*.6 : cy+8;
  const midY=lerp((uy+ly)/2,cy,b);
  const cx=(ix+ox)/2;
  const width=Math.hypot(ox-ix,oy-iy);
  g.save();
  g.translate(cx,midY);
  g.rotate(rot*.25 + Math.atan2(oy-iy,ox-ix));
  g.strokeStyle=`rgba(28,18,30,${.30+b*.62})`;
  g.lineWidth=Math.max(1.5, width*.045);
  g.lineCap="round";
  g.beginPath();
  g.moveTo(-width/2,0);
  g.quadraticCurveTo(0,(ly-uy)*.14*(1-b),width/2,0);
  g.stroke();
  if(b>.55){
    g.strokeStyle=`rgba(255,235,245,${(b-.55)*.35})`;
    g.lineWidth=Math.max(1,width*.018);
    g.beginPath();g.moveTo(-width*.34,2);g.lineTo(width*.34,2);g.stroke();
  }
  g.restore();
}



function generateMesh(showStatus=true){
  const p=projectState.points||{};
  const vertices=[];
  const triangles=[];
  const edges=[];
  const byKey={};
  const addVertex=(key,x,y,extra={})=>{
    const id=vertices.length;
    const v={id,key,x:clamp(x,0,1),y:clamp(y,0,1),u:clamp(x,0,1),v:clamp(y,0,1),...extra};
    vertices.push(v);
    if(key)byKey[key]=id;
    return id;
  };

  // v45: 本物の面メッシュ。画像全体を細かい三角面で敷き、各頂点にUVを持たせる。
  // これにより「楕円を切り抜いて動かす」ではなく、元画像一枚を三角面ごとに変形する。
  const COLS=28, ROWS=34;
  const grid=[];
  for(let y=0;y<=ROWS;y++){
    grid[y]=[];
    for(let x=0;x<=COLS;x++){
      grid[y][x]=addVertex(`grid_${x}_${y}`,x/COLS,y/ROWS,{group:'base',gx:x,gy:y});
    }
  }
  for(let y=0;y<ROWS;y++){
    for(let x=0;x<COLS;x++){
      const a=grid[y][x], b=grid[y][x+1], c=grid[y+1][x], d=grid[y+1][x+1];
      triangles.push([a,b,c,'base']);
      triangles.push([b,d,c,'base']);
    }
  }

  // ピン自体も頂点として保持。表示・輪郭ループ・制約の基準に使う。
  Object.entries(p).forEach(([key,pt])=>{
    if(pt&&Number.isFinite(pt.x)&&Number.isFinite(pt.y))addVertex(key,pt.x,pt.y,{group:'pin',pin:true});
  });

  const edge=(a,b,group='guide')=>{ if(byKey[a]!=null&&byKey[b]!=null)edges.push([byKey[a],byKey[b],group]); };
  const loop=(keys,group)=>{ for(let i=0;i<keys.length;i++)edge(keys[i],keys[(i+1)%keys.length],group); };
  loop(['mouthLeft','mouthUpper','mouthRight','mouthLower'],'mouthLoop');
  loop(['eyeLCornerIn','eyeLUpper','eyeLCornerOut','eyeLLower'],'eyeLoop');
  loop(['eyeRCornerIn','eyeRUpper','eyeRCornerOut','eyeRLower'],'eyeLoop');
  edge('headTop','chin','faceAxis'); edge('templeL','templeR','faceAxis'); edge('chin','neck','neck'); edge('neck','body','body');
  edge('bangsRootL','bangsTipL','hair'); edge('bangsRootR','bangsTipR','hair');
  edge('sideHairRootL','sideHairTipL','hair'); edge('sideHairRootR','sideHairTipR','hair'); edge('backHairRoot','backHairTip','hair');

  projectState.mesh={version:'v45-real-uv-grid',cols:COLS,rows:ROWS,vertices,triangles,edges};
  if(showStatus)setStatus('cutStatus',`実メッシュ生成OK: 面${triangles.length} / 頂点${vertices.length}`);
  updateProjectReadout();
}

function distNorm(x,y,cx,cy,rx,ry){
  rx=Math.max(.0001,rx); ry=Math.max(.0001,ry);
  const dx=(x-cx)/rx, dy=(y-cy)/ry;
  return Math.sqrt(dx*dx+dy*dy);
}
function softWeight(d){ return clamp(1-d,0,1)**2*(3-2*clamp(1-d,0,1)); }
function getPt(name){return (projectState.points||{})[name]||null;}
function pointSpan(a,b,fallback=.08){ const p1=getPt(a),p2=getPt(b); if(!p1||!p2)return fallback; return Math.max(fallback,Math.hypot(p1.x-p2.x,p1.y-p2.y)); }
function clampMove(v,min,max){return Math.max(min,Math.min(max,v));}

function warpedVertex(v,r){
  const rig=projectState.rig||{};
  const p=projectState.points||{};
  const nx=v.x, ny=v.y;
  let wx=nx, wy=ny;

  const yaw=clamp(runtime.smooth.yaw||0,-1,1);
  const headX=(runtime.smooth.headX||0)/(projectState.original?.width||900);
  const headY=(runtime.smooth.headY||0)/(projectState.original?.height||1200);
  const faceCenter=p.face||p.faceCenter||{x:.5,y:.40};

  // 顔全体の動きは強制制限。鼻から下や顎が吹き飛ばないように最大移動量を小さくする。
  const faceTop=p.headTop?.y??.10, faceBottom=p.chin?.y??.66;
  const inHeadY=clamp((ny-faceTop)/Math.max(.01,faceBottom-faceTop),0,1);
  const headW=softWeight(distNorm(nx,ny,faceCenter.x,faceCenter.y,.36,.42));
  const maxHeadX=.018, maxHeadY=.012;
  wx += clampMove(headX*(rig.meshStrength||.38)*headW,-maxHeadX,maxHeadX);
  wy += clampMove(headY*(rig.meshStrength||.38)*headW,-maxHeadY,maxHeadY);
  wx += clampMove((nx-faceCenter.x)*yaw*.020*headW*(1-inHeadY*.45),-.012,.012);

  // 目：中心だけでなく、打った上下左右ピンの範囲を楕円ではなく制約付き領域として扱う。
  const applyEye=(side)=>{
    const cen=p[`eye${side}Center`], inn=p[`eye${side}CornerIn`], out=p[`eye${side}CornerOut`], up=p[`eye${side}Upper`], low=p[`eye${side}Lower`];
    if(!cen||!inn||!out||!up||!low)return;
    const rx=Math.max(Math.abs(out.x-inn.x)*.72,.035);
    const ry=Math.max(Math.abs(low.y-up.y)*1.55,.025);
    const d=distNorm(nx,ny,cen.x,cen.y,rx,ry);
    const w=softWeight(d);
    if(w<=0)return;
    const blink=clamp((runtime.smooth.blink||0)*(rig.eyeLayerClose||1)+(rig.eyeSmile||0)*.16,0,.92)*(rig.blinkMeshStrength||.85);
    // 上下まぶた方向へ畳む。目頭/目尻は固定寄り、中央ほど動く。
    const across=clamp(Math.abs(nx-cen.x)/rx,0,1);
    const centerBias=(1-across*.72);
    const vertical=(ny-cen.y)/ry;
    const maxClose=ry*.45;
    if(vertical<0){ wy += clampMove((cen.y-wy)*blink*w*centerBias*.82,-maxClose,maxClose); }
    else { wy += clampMove((cen.y-wy)*blink*w*centerBias*.62,-maxClose,maxClose); }
    // 視線風の微小移動。目範囲から外へ出ない。
    wx += clampMove(yaw*.004*w*centerBias,-.005,.005);
  };
  applyEye('L'); applyEye('R');

  // 口：口角は固定寄り、上唇/下唇は上限下限あり。中心点だけで裂かない。
  const ml=p.mouthLeft, mr=p.mouthRight, mu=p.mouthUpper, md=p.mouthLower, mc=p.mouthCenter;
  if(ml&&mr&&mu&&md&&mc){
    const rx=Math.max(Math.abs(mr.x-ml.x)*.75,.035);
    const ry=Math.max(Math.abs(md.y-mu.y)*1.80,.025);
    const d=distNorm(nx,ny,mc.x,mc.y,rx,ry);
    const w=softWeight(d);
    if(w>0){
      const open=clamp(runtime.smooth.mouth||0,0,1)*(rig.mouthMeshStrength||.85);
      const across=clamp(Math.abs(nx-mc.x)/rx,0,1);
      const cornerLock=clamp(across,.0,1);        // 口角ほど動かさない
      const centerMove=(1-cornerLock*.82);
      const upperLimit=ry*.18, lowerLimit=ry*.78, sideLimit=rx*.12;
      if(ny<mc.y){
        wy += clampMove(-upperLimit*open*w*centerMove,-upperLimit,upperLimit);
      }else{
        wy += clampMove(lowerLimit*open*w*centerMove,-lowerLimit,lowerLimit);
      }
      // 横幅は少しだけ。裂け防止。
      const side=(nx<mc.x?-1:1);
      wx += clampMove(side*sideLimit*open*w*(1-centerMove*.25)*.28,-sideLimit,sideLimit);
    }
  }

  // 髪：root/tip方式。tip近傍ほど動き、root近傍は固定。
  const applyHair=(rootName,tipName,phase=0)=>{
    const root=p[rootName], tip=p[tipName]; if(!root||!tip)return;
    const len=Math.max(.03,Math.hypot(tip.x-root.x,tip.y-root.y));
    const vx=tip.x-root.x, vy=tip.y-root.y;
    const t=clamp(((nx-root.x)*vx+(ny-root.y)*vy)/(len*len),0,1);
    const lineX=root.x+vx*t, lineY=root.y+vy*t;
    const d=Math.hypot(nx-lineX,ny-lineY)/Math.max(.025,len*.25);
    const w=softWeight(d)*t*t;
    if(w<=0)return;
    const sway=clamp((runtime.smooth.hairX||0)/(projectState.original?.width||900),-.035,.035)*(rig.hairMeshStrength||.65);
    wx += sway*w;
    wy += Math.sin((runtime.t||0)*.07+phase)*.003*w;
  };
  applyHair('bangsRootL','bangsTipL',1); applyHair('bangsRootR','bangsTipR',2);
  applyHair('sideHairRootL','sideHairTipL',3); applyHair('sideHairRootR','sideHairTipR',4); applyHair('backHairRoot','backHairTip',5);

  return {x:r.x+wx*r.w,y:r.y+wy*r.h,u:v.u??v.x,v:v.v??v.y,wx,wy};
}

function drawMeshAvatar(g,r){
  const img=projectState.original;
  const mesh=projectState.mesh;
  if(!img)return;
  if(!mesh||!mesh.triangles||!mesh.triangles.length){g.drawImage(img,r.x,r.y,r.w,r.h);return;}

  // v45: パーツ切り抜き・穴埋めを使わず、元画像を三角面で全面描画する。
  // ここが本物のメッシュ描画。各三角形が src UV → dst 変形先へ貼られる。
  g.save();
  mesh.triangles.forEach(t=>{
    const sv=t.slice(0,3).map(i=>mesh.vertices[i]);
    const dv=sv.map(v=>warpedVertex(v,r));
    drawTexturedTriangle(g,img,r,sv,dv);
  });
  g.restore();

  // 目閉じ・口の補助線だけは、完全な穴埋めではなく上から薄く描く。福笑い感を避けるため強すぎない。
  const p=projectState.points||{};
  const yaw=runtime.smooth.yaw||0;
  const rot=yaw*(projectState.rig?.headRotate||1)*Math.PI/180;
  const headTx=0, headTy=0;
  drawSynthetic(g,r,p,headTx,headTy,rot);
}

function drawTexturedTriangle(g,img,r,src,dst){
  const sw=img.width,sh=img.height;
  const s=src.map(v=>({x:v.x*sw,y:v.y*sh}));
  const d=dst;
  const denom=s[0].x*(s[1].y-s[2].y)+s[1].x*(s[2].y-s[0].y)+s[2].x*(s[0].y-s[1].y);
  if(Math.abs(denom)<.001)return;
  const a=(d[0].x*(s[1].y-s[2].y)+d[1].x*(s[2].y-s[0].y)+d[2].x*(s[0].y-s[1].y))/denom;
  const b=(d[0].x*(s[2].x-s[1].x)+d[1].x*(s[0].x-s[2].x)+d[2].x*(s[1].x-s[0].x))/denom;
  const c=(d[0].x*(s[1].x*s[2].y-s[2].x*s[1].y)+d[1].x*(s[2].x*s[0].y-s[0].x*s[2].y)+d[2].x*(s[0].x*s[1].y-s[1].x*s[0].y))/denom;
  const dA=(d[0].y*(s[1].y-s[2].y)+d[1].y*(s[2].y-s[0].y)+d[2].y*(s[0].y-s[1].y))/denom;
  const e=(d[0].y*(s[2].x-s[1].x)+d[1].y*(s[0].x-s[2].x)+d[2].y*(s[1].x-s[0].x))/denom;
  const f=(d[0].y*(s[1].x*s[2].y-s[2].x*s[1].y)+d[1].y*(s[2].x*s[0].y-s[0].x*s[2].y)+d[2].y*(s[0].x*s[1].y-s[1].x*s[0].y))/denom;
  g.save();
  g.beginPath();g.moveTo(d[0].x,d[0].y);g.lineTo(d[1].x,d[1].y);g.lineTo(d[2].x,d[2].y);g.closePath();g.clip();
  g.transform(a,dA,b,e,c,f);
  g.drawImage(img,0,0);
  g.restore();
}

function drawMeshOverlay(g,r){
  const mesh=projectState.mesh;if(!mesh||!mesh.vertices.length)return;
  const pos=v=>warpedVertex(v,r);
  g.save();
  mesh.triangles.forEach(t=>{
    const a=pos(mesh.vertices[t[0]]),b=pos(mesh.vertices[t[1]]),c=pos(mesh.vertices[t[2]]);
    g.strokeStyle=t[3]==="hair"?"rgba(199,125,255,.50)":t[3]==="mouth"?"rgba(255,159,67,.55)":t[3]==="eye"?"rgba(126,231,255,.55)":"rgba(255,230,109,.42)";
    g.lineWidth=1.5;g.beginPath();g.moveTo(a.x,a.y);g.lineTo(b.x,b.y);g.lineTo(c.x,c.y);g.closePath();g.stroke();
  });
  mesh.edges.forEach(e=>{const a=pos(mesh.vertices[e[0]]),b=pos(mesh.vertices[e[1]]);g.strokeStyle=e[2]==="hair"?"rgba(199,125,255,.9)":"rgba(255,255,255,.45)";g.lineWidth=2;g.beginPath();g.moveTo(a.x,a.y);g.lineTo(b.x,b.y);g.stroke();});
  g.restore();
}

function drawPartsGrid(g,w,h){g.fillStyle="rgba(0,0,0,.25)";g.fillRect(0,0,w,h);let i=0;Object.entries(projectState.parts).forEach(([name,img])=>{const col=i%3,row=Math.floor(i/3),cw=w/3,ch=h/4,x=col*cw,y=row*ch;g.strokeStyle="rgba(255,255,255,.2)";g.strokeRect(x+8,y+8,cw-16,ch-16);g.drawImage(img,x+10,y+26,cw-20,ch-38);g.fillStyle="#fff";g.font="13px system-ui";g.fillText(name,x+14,y+22);i++;});}
function drawHelpers(g,r){
  drawStructureLines(g,r);
  if(projectState.rig.showMesh)drawMeshOverlay(g,r);
  if(projectState.rig.showPins)Object.entries(projectState.points).forEach(([k,p])=>{
    if(["face","leftEye","rightEye","mouth","hair"].includes(k))return;
    const x=r.x+p.x*r.w,y=r.y+p.y*r.h;
    g.fillStyle=colors[k]||"#fff";
    g.beginPath();g.arc(x,y,k===runtime.tool?12:7,0,Math.PI*2);g.fill();
    g.lineWidth=k===runtime.tool?3:2;g.strokeStyle=k===runtime.tool?"#fff":"#111";g.stroke();
    if(k===runtime.tool){g.fillStyle="rgba(0,0,0,.65)";g.fillRect(x+12,y-24,(labels[k]||k).length*12+12,20);g.fillStyle="#fff";g.font="12px system-ui";g.fillText(labels[k]||k,x+18,y-10);}
  });
  if(projectState.rig.showMasks&&projectState.contours){["mouth","leftEye","rightEye"].forEach(k=>{const c=projectState.contours[k];if(!c)return;g.strokeStyle=k==="mouth"?"#ff6e9a":"#7ee7ff";g.lineWidth=2;g.beginPath();c.points.forEach((p,i)=>{const x=r.x+p.x/projectState.original.width*r.w,y=r.y+p.y/projectState.original.height*r.h;i?g.lineTo(x,y):g.moveTo(x,y);});g.closePath();g.stroke();});}
}

function drawStructureLines(g,r){
  const p=projectState.points;
  const line=(a,b,color)=>{if(!p[a]||!p[b])return;g.strokeStyle=color;g.lineWidth=2;g.setLineDash([7,5]);g.beginPath();g.moveTo(r.x+p[a].x*r.w,r.y+p[a].y*r.h);g.lineTo(r.x+p[b].x*r.w,r.y+p[b].y*r.h);g.stroke();g.setLineDash([]);};
  line("headTop","chin","rgba(255,230,109,.8)");
  line("templeL","templeR","rgba(255,230,109,.55)");
  line("chin","neck","rgba(85,239,196,.75)");
  [["bangsRootL","bangsTipL"],["bangsRootR","bangsTipR"],["sideHairRootL","sideHairTipL"],["sideHairRootR","sideHairTipR"],["backHairRoot","backHairTip"]].forEach(pair=>line(pair[0],pair[1],"rgba(199,125,255,.8)"));
  [["eyeLCornerIn","eyeLCornerOut"],["eyeLUpper","eyeLLower"],["eyeRCornerIn","eyeRCornerOut"],["eyeRUpper","eyeRLower"],["mouthLeft","mouthRight"],["mouthUpper","mouthLower"]].forEach(pair=>line(pair[0],pair[1],"rgba(126,231,255,.55)"));
}

function drawMiniMap(){
  const mini=canvases.mini;if(!mini||!projectState.original)return;
  const g=mini.getContext("2d"),w=mini.width,h=mini.height;
  g.clearRect(0,0,w,h);g.fillStyle="rgba(5,8,16,.82)";g.fillRect(0,0,w,h);
  const img=projectState.original, s=Math.min(w/img.width,h/img.height)*.88;
  const x=(w-img.width*s)/2,y=(h-img.height*s)/2,iw=img.width*s,ih=img.height*s;
  g.globalAlpha=.88;g.drawImage(img,x,y,iw,ih);g.globalAlpha=1;
  const r=imageRect(canvases.cut.width,canvases.cut.height,true);
  const vx=clamp((-r.x/r.w)*iw+x,x,x+iw), vy=clamp((-r.y/r.h)*ih+y,y,y+ih);
  const vw=clamp((canvases.cut.width/r.w)*iw,4,iw), vh=clamp((canvases.cut.height/r.h)*ih,4,ih);
  g.strokeStyle="#7ee7ff";g.lineWidth=2;g.strokeRect(vx,vy,vw,vh);
  g.fillStyle="#7ee7ff";g.font="11px system-ui";g.fillText(Math.round(runtime.view.zoom*100)+"%",8,15);
}


function loop(now){
  const dt=now-runtime.lastFrame;runtime.lastFrame=now;runtime.fps=runtime.fps*.9+(1000/Math.max(1,dt))*.1;runtime.t++;
  updateMotion(now);updateMeters();
  drawAvatar(ctxs.cut,canvases.cut.width,canvases.cut.height,true,runtime.viewMode);
  drawMiniMap();
  drawAvatar(ctxs.rig,canvases.rig.width,canvases.rig.height,false,"live");
  drawAvatar(ctxs.live,canvases.live.width,canvases.live.height,false,"live");
  if(runtime.obs)drawAvatar(ctxs.obs,canvases.obs.width,canvases.obs.height,false,"live");
  const fps=document.getElementById("fpsReadout");if(fps)fps.textContent="FPS: "+Math.round(runtime.fps);
  requestAnimationFrame(loop);
}

function updateMotion(now){
  const targetYaw=runtime.autoYaw?Math.sin(runtime.t*.035)*.72:0;
  runtime.smooth.yaw=lerp(runtime.smooth.yaw,targetYaw,.12);
  runtime.smooth.headX=lerp(runtime.smooth.headX,targetYaw*48,.14);
  runtime.smooth.headY=lerp(runtime.smooth.headY,Math.sin(runtime.t*.018)*1.4,.08);
  runtime.smooth.neckX=lerp(runtime.smooth.neckX,targetYaw*18,.08);
  runtime.smooth.hairX=lerp(runtime.smooth.hairX,-targetYaw*42,.07);
  let mouth=runtime.manual.talking;
  if(now<runtime.manual.mouthUntil)mouth=1;
  runtime.smooth.mouth=lerp(runtime.smooth.mouth,mouth,.35);
  runtime.manual.talking*=.62;
  let blink=runtime.manual.blinkBoost;
  if(now<runtime.manual.blinkUntil)blink=1;
  runtime.smooth.blink=lerp(runtime.smooth.blink,blink,.48);
  runtime.manual.blinkBoost*=.42;
}
function updateMeters(){const vals={Yaw:Math.round(Math.abs(runtime.smooth.yaw)*100),Mouth:Math.round(runtime.smooth.mouth*100),Blink:Math.round(runtime.smooth.blink*100)};Object.entries(vals).forEach(([k,v])=>{const m=document.getElementById("meter"+k),b=document.getElementById("bar"+k);if(m)m.textContent=v+"%";if(b)b.style.width=v+"%";});}

function updateControls(){
  Object.entries(projectState.rig).forEach(([k,v])=>{const el=document.getElementById(k);if(!el)return;if(el.type==="checkbox")el.checked=!!v;else el.value=v;const lab=document.getElementById(k+"Val");if(lab)lab.textContent=typeof v==="number"?v.toFixed(k.includes("Hold")||k.includes("Scale")||k.includes("Bone")||k.includes("Alpha")?2:1):v;});
  updateProjectReadout();
}
function updateProjectReadout(){const el=document.getElementById("statusReadout");if(el)el.textContent=`parts:${Object.keys(projectState.parts).length} contours:${Object.keys(projectState.contours).length} mesh:${projectState.mesh?.triangles?.length||0}`;}
function saveProject(){localStorage.setItem("livepic_v37_project",JSON.stringify({points:projectState.points,rig:projectState.rig,mesh:projectState.mesh,originalDataUrl:projectState.originalDataUrl}));setStatus("cutStatus","保存しました");}
function loadProject(){const raw=localStorage.getItem("livepic_v37_project");if(!raw)return setStatus("cutStatus","保存なし");const d=JSON.parse(raw);projectState.points=d.points||projectState.points;projectState.mesh=d.mesh||projectState.mesh;syncLegacyPoints();generateMesh(false);Object.assign(projectState.rig,d.rig||{});updateControls();if(d.originalDataUrl)loadImage(d.originalDataUrl,"restored");}
function downloadProjectJson(){const data={version:projectState.version,points:projectState.points,mesh:projectState.mesh,rig:projectState.rig};document.getElementById("projectBox").value=JSON.stringify(data,null,2);downloadText("livepic_project.json",JSON.stringify(data,null,2));}
function downloadParts(){Object.entries(projectState.parts).forEach(([name,canvas],i)=>setTimeout(()=>{const a=document.createElement("a");a.href=canvas.toDataURL("image/png");a.download=`livepic_${name}.png`;document.body.appendChild(a);a.click();a.remove();},i*150));}
function downloadText(name,text){const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([text],{type:"application/json"}));a.download=name;a.click();}
function openObs(){runtime.obs=true;document.getElementById("obsOverlay").classList.remove("hidden");resizeAll();}
function closeObs(){runtime.obs=false;document.getElementById("obsOverlay").classList.add("hidden");}
function setStatus(id,text){const el=document.getElementById(id);if(el)el.textContent=text;}
function reportError(label,err){console.error(label,err);setStatus("cutStatus",`${label}: ${err.message||err}`);}
function clearError(){}
function luma(r,g,b){return r*.299+g*.587+b*.114;}
function clamp(n,min,max){return Math.max(min,Math.min(max,n));}
function lerp(a,b,t){return a+(b-a)*t;}
