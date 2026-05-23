window.addEventListener("error", e=>reportError("runtime", e));

const canvases = {
  cut: document.getElementById("canvas"),
  rig: document.getElementById("rigCanvas"),
  live: document.getElementById("liveCanvas"),
  obs: document.getElementById("obsCanvas")
};
const ctxs = Object.fromEntries(Object.entries(canvases).map(([k,c])=>[k,c.getContext("2d")]));
const video=document.getElementById("video");

const labels={face:"顔",leftEye:"左目",rightEye:"右目",mouth:"口",chin:"あご",neck:"首",body:"体",hair:"髪"};
const colors={face:"#ffe66d",leftEye:"#ff66c4",rightEye:"#ff66c4",mouth:"#ff9f43",chin:"#ff7675",neck:"#55efc4",body:"#74b9ff",hair:"#a29bfe"};

const projectState={
  version:"3.7",
  original:null,
  originalDataUrl:"",
  points:{},
  parts:{},
  masks:{},
  contours:{},
  inpainted:null,
  rig:{
    headBone:.75,neckBone:.42,hairBone:.62,headRotate:2.6,
    mouthLayerOpen:1.8,mouthLayerDrop:42,mouthLayerAlpha:.95,mouthHold:1.8,
    eyeLayerClose:1.75,eyeLayerAlpha:.95,blinkHold:1.4,eyeSmile:.10,
    lineDarkSensitivity:2.2,lineConnect:6,mouthSearchScale:.95,eyeSearchScale:.90,
    inpaintStrength:.85,showMasks:true,showPins:true
  }
};

const runtime={
  tab:"cut", viewMode:"original", tool:"face", activeCanvas:"cut",
  view:{zoom:1,panX:0,panY:0,dragging:false,lastX:0,lastY:0,moved:false},
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
  on("autoPartsBtn", ()=>{generateParts();syncToLive("自動パーツ生成OK");});
  on("applyToLiveBtn", ()=>syncToLive("Liveへ反映しました"));
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

  ["headBone","neckBone","hairBone","headRotate","mouthLayerOpen","mouthLayerDrop","mouthLayerAlpha","mouthHold","eyeLayerClose","eyeLayerAlpha","blinkHold","eyeSmile","lineDarkSensitivity","lineConnect","mouthSearchScale","eyeSearchScale","inpaintStrength","showMasks","showPins"].forEach(id=>{
    const el=document.getElementById(id);
    if(!el)return;
    el.addEventListener(el.type==="checkbox"?"change":"input",()=>{
      projectState.rig[id]=el.type==="checkbox"?el.checked:Number(el.value);
      updateControls();
      syncToLive("Rig変更を反映");
    });
  });

  setupCanvasInteraction(canvases.cut);
  updateControls();
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
  Object.values(canvases).forEach(c=>{
    if(!c)return;
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
    document.getElementById("dropMessage").style.display="none";
    setStatus("cutStatus",`画像読み込みOK: ${name}`);
  };
  img.onerror=()=>setStatus("cutStatus","画像読み込み失敗");
  img.src=src;
}

function autoPoints(){
  projectState.points={
    face:{x:.50,y:.36},leftEye:{x:.405,y:.325},rightEye:{x:.595,y:.325},mouth:{x:.50,y:.455},
    chin:{x:.50,y:.535},neck:{x:.50,y:.585},body:{x:.50,y:.73},hair:{x:.50,y:.235}
  };
  setStatus("cutStatus","基準点プリセットOK");
}

function selectTool(btn){
  document.querySelectorAll(".tool").forEach(b=>b.classList.remove("active"));
  btn.classList.add("active");
  runtime.tool=btn.dataset.point;
  document.getElementById("toolReadout").textContent="選択中: "+labels[runtime.tool];
}

function setupCanvasInteraction(c){
  c.addEventListener("mousedown",e=>{runtime.view.dragging=true;runtime.view.lastX=e.clientX;runtime.view.lastY=e.clientY;runtime.view.moved=false;});
}

window.addEventListener("mousemove",e=>{
  if(!runtime.view.dragging)return;
  const dx=e.clientX-runtime.view.lastX,dy=e.clientY-runtime.view.lastY;
  if(Math.abs(dx)+Math.abs(dy)>3)runtime.view.moved=true;
  runtime.view.panX+=dx;runtime.view.panY+=dy;
  runtime.view.lastX=e.clientX;runtime.view.lastY=e.clientY;
});
window.addEventListener("mouseup",()=>runtime.view.dragging=false);
canvases.cut.addEventListener("click",e=>{
  if(runtime.view.moved){runtime.view.moved=false;return;}
  placePoint(e);
});
canvases.cut.addEventListener("wheel",e=>{
  e.preventDefault();
  runtime.view.zoom=clamp(runtime.view.zoom*(e.deltaY<0?1.1:.9),.5,4);
},{passive:false});

function placePoint(e){
  if(!projectState.original)return;
  const rect=canvases.cut.getBoundingClientRect();
  const r=imageRect(canvases.cut.width,canvases.cut.height,true);
  projectState.points[runtime.tool]={x:clamp((e.clientX-rect.left-r.x)/r.w,0,1),y:clamp((e.clientY-rect.top-r.y)/r.h,0,1)};
  setStatus("cutStatus",`${labels[runtime.tool]}を移動`);
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

function traceContours(){
  if(!projectState.original)return;
  projectState.contours={
    mouth:traceFeature(projectState.points.mouth,"mouth"),
    leftEye:traceFeature(projectState.points.leftEye,"eye"),
    rightEye:traceFeature(projectState.points.rightEye,"eye")
  };
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
function testMouth(){runtime.manual.talking=1.8;runtime.manual.mouthUntil=performance.now()+projectState.rig.mouthHold*1000;runtime.smooth.mouth=1;}
function testBlink(){runtime.manual.blinkBoost=1.6;runtime.manual.blinkUntil=performance.now()+projectState.rig.blinkHold*1000;runtime.smooth.blink=1;}
function testMotion(){testMouth();testBlink();runtime.autoYaw=true;updateAutoYawButtons();}
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
  const b=runtime.smooth.blink;
  if(b>.04){
    [p.leftEye,p.rightEye].forEach(pt=>{
      const x=r.x+pt.x*r.w+tx*.55;
      const y=r.y+pt.y*r.h+ty*.6;
      g.save();
      g.translate(x,y);
      g.rotate(rot*.25);
      g.fillStyle=`rgba(30,22,30,${.35+b*.45})`;
      g.beginPath();
      g.ellipse(0,0,45*scale,18*scale*b,0,0,Math.PI*2);
      g.fill();
      g.restore();
    });
  }
  if(m>.04){
    const x=r.x+p.mouth.x*r.w+tx*.8;
    const y=r.y+p.mouth.y*r.h+ty+m*18*scale;
    g.save();
    g.translate(x,y);
    g.rotate(rot*.18);
    g.fillStyle=`rgba(90,25,38,${.45+m*.40})`;
    g.beginPath();
    g.ellipse(0,0,28*scale,10*scale*(.5+m*1.1),0,0,Math.PI*2);
    g.fill();
    g.restore();
  }
}

function drawPartsGrid(g,w,h){g.fillStyle="rgba(0,0,0,.25)";g.fillRect(0,0,w,h);let i=0;Object.entries(projectState.parts).forEach(([name,img])=>{const col=i%3,row=Math.floor(i/3),cw=w/3,ch=h/4,x=col*cw,y=row*ch;g.strokeStyle="rgba(255,255,255,.2)";g.strokeRect(x+8,y+8,cw-16,ch-16);g.drawImage(img,x+10,y+26,cw-20,ch-38);g.fillStyle="#fff";g.font="13px system-ui";g.fillText(name,x+14,y+22);i++;});}
function drawHelpers(g,r){
  if(projectState.rig.showPins)Object.entries(projectState.points).forEach(([k,p])=>{const x=r.x+p.x*r.w,y=r.y+p.y*r.h;g.fillStyle=colors[k]||"#fff";g.beginPath();g.arc(x,y,k===runtime.tool?13:9,0,Math.PI*2);g.fill();g.strokeStyle="#111";g.stroke();});
  if(projectState.rig.showMasks&&projectState.contours){["mouth","leftEye","rightEye"].forEach(k=>{const c=projectState.contours[k];if(!c)return;g.strokeStyle=k==="mouth"?"#ff6e9a":"#7ee7ff";g.lineWidth=2;g.beginPath();c.points.forEach((p,i)=>{const x=r.x+p.x/projectState.original.width*r.w,y=r.y+p.y/projectState.original.height*r.h;i?g.lineTo(x,y):g.moveTo(x,y);});g.closePath();g.stroke();});}
}

function loop(now){
  const dt=now-runtime.lastFrame;runtime.lastFrame=now;runtime.fps=runtime.fps*.9+(1000/Math.max(1,dt))*.1;runtime.t++;
  updateMotion(now);updateMeters();
  drawAvatar(ctxs.cut,canvases.cut.width,canvases.cut.height,true,runtime.viewMode);
  drawAvatar(ctxs.rig,canvases.rig.width,canvases.rig.height,false,"live");
  drawAvatar(ctxs.live,canvases.live.width,canvases.live.height,false,"live");
  if(runtime.obs)drawAvatar(ctxs.obs,canvases.obs.width,canvases.obs.height,false,"live");
  const fps=document.getElementById("fpsReadout");if(fps)fps.textContent="FPS: "+Math.round(runtime.fps);
  requestAnimationFrame(loop);
}

function updateMotion(now){
  const targetYaw=runtime.autoYaw?Math.sin(runtime.t*.025)*.42:0;
  runtime.smooth.yaw=lerp(runtime.smooth.yaw,targetYaw,.12);
  runtime.smooth.headX=lerp(runtime.smooth.headX,targetYaw*28,.14);
  runtime.smooth.headY=lerp(runtime.smooth.headY,Math.sin(runtime.t*.018)*1.4,.08);
  runtime.smooth.neckX=lerp(runtime.smooth.neckX,targetYaw*9,.08);
  runtime.smooth.hairX=lerp(runtime.smooth.hairX,-targetYaw*18,.07);
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
function updateProjectReadout(){const el=document.getElementById("statusReadout");if(el)el.textContent=`parts:${Object.keys(projectState.parts).length} contours:${Object.keys(projectState.contours).length}`;}
function saveProject(){localStorage.setItem("livepic_v37_project",JSON.stringify({points:projectState.points,rig:projectState.rig,originalDataUrl:projectState.originalDataUrl}));setStatus("cutStatus","保存しました");}
function loadProject(){const raw=localStorage.getItem("livepic_v37_project");if(!raw)return setStatus("cutStatus","保存なし");const d=JSON.parse(raw);projectState.points=d.points||projectState.points;Object.assign(projectState.rig,d.rig||{});updateControls();if(d.originalDataUrl)loadImage(d.originalDataUrl,"restored");}
function downloadProjectJson(){const data={version:projectState.version,points:projectState.points,rig:projectState.rig};document.getElementById("projectBox").value=JSON.stringify(data,null,2);downloadText("livepic_project.json",JSON.stringify(data,null,2));}
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
