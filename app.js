window.addEventListener("error", e=>{
  const m=document.getElementById("dropMessage");
  if(m){m.style.display="block";m.textContent="エラー: "+e.message;}
  console.error(e);
});

const canvas=document.getElementById("canvas");
const ctx=canvas.getContext("2d");
const obsCanvas=document.getElementById("obsCanvas");
const obsCtx=obsCanvas.getContext("2d");
const video=document.getElementById("video");

const state={
  image:null,imageDataUrl:"",imageName:"",
  tool:"face",motion:true,obs:false,debug:true,autoYaw:false,cameraOn:false,faceMesh:null,camera:null,
  points:{face:null,leftEye:null,rightEye:null,mouth:null,chin:null,neck:null,body:null,hair:null},
  controls:{
    meshEnabled:true,meshDensity:48,faceRadius:245,yawBoost:2.7,manualYaw:0,
    headShift:36,faceSquash:0.13,cheekPower:34,noseShift:24,chinFollow:42,hairLag:0.76,neckLag:0.58,
    mouthSensitivity:8.8,mouthOpenPower:118,mouthRadius:86,jawDrop:58,
    blinkSensitivity:7.4,blinkPower:82,eyeRadius:66,
    breath:7,trackingSpeed:0.26
  },
  track:{yaw:0,mouth:0,blink:0,hasFace:false},
  smooth:{yaw:0,mouth:0,blink:0,headX:0,headY:0,neckX:0,hairX:0,eyeX:0,eyeY:0},
  manual:{talking:0,blinkBoost:0,yawKey:0},
  view:{zoom:1,panX:0,panY:0,dragging:false,lastX:0,lastY:0,dragMoved:false},
  mic:{enabled:false,stream:null,audioCtx:null,analyser:null,data:null,level:0},
  t:0,lastFrame:performance.now(),fps:0,nextBlink:0,doubleBlink:false
};

const labels={face:"顔中心",leftEye:"左目",rightEye:"右目",mouth:"口",chin:"あご",neck:"首",body:"体中心",hair:"髪中心"};
const colors={face:"#ffe66d",leftEye:"#ff66c4",rightEye:"#ff66c4",mouth:"#ff9f43",chin:"#ff7675",neck:"#55efc4",body:"#74b9ff",hair:"#a29bfe"};

const sampleSvg=`<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 900 1200">
<defs><linearGradient id="hair" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#30264c"/><stop offset="100%" stop-color="#141827"/></linearGradient><linearGradient id="cloth" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#fff"/><stop offset="100%" stop-color="#dfe7ff"/></linearGradient></defs>
<rect width="900" height="1200" fill="none"/><ellipse cx="450" cy="1030" rx="250" ry="120" fill="#12131e" opacity=".25"/>
<path d="M250 520 C170 690 165 930 260 1090 L640 1090 C735 930 730 690 650 520 C610 420 300 420 250 520Z" fill="url(#cloth)" stroke="#30364e" stroke-width="8"/>
<path d="M375 520 L525 520 L505 650 L395 650Z" fill="#ffd8c8" stroke="#30364e" stroke-width="6"/>
<path d="M210 250 C210 95 330 45 450 45 C570 45 690 95 690 250 C720 500 695 790 620 980 C600 760 580 620 560 510 C520 560 380 560 340 510 C320 620 300 760 280 980 C205 790 180 500 210 250Z" fill="url(#hair)" stroke="#0d0f18" stroke-width="8"/>
<ellipse cx="450" cy="340" rx="205" ry="245" fill="#ffd8c8" stroke="#30364e" stroke-width="8"/>
<path d="M270 280 C330 150 570 150 630 280 C570 220 330 220 270 280Z" fill="url(#hair)"/>
<path d="M285 260 C330 135 520 110 610 235 C515 190 380 200 285 260Z" fill="url(#hair)" stroke="#0d0f18" stroke-width="5"/>
<ellipse cx="365" cy="355" rx="42" ry="34" fill="#fff"/><ellipse cx="535" cy="355" rx="42" ry="34" fill="#fff"/><circle cx="365" cy="358" r="20" fill="#8f69ff"/><circle cx="535" cy="358" r="20" fill="#8f69ff"/><circle cx="372" cy="348" r="7" fill="#fff"/><circle cx="542" cy="348" r="7" fill="#fff"/>
<path d="M330 310 C360 290 390 292 410 315" fill="none" stroke="#1a1d2c" stroke-width="10" stroke-linecap="round"/><path d="M490 315 C510 292 540 290 570 310" fill="none" stroke="#1a1d2c" stroke-width="10" stroke-linecap="round"/>
<path d="M445 365 C435 410 430 420 450 430" fill="none" stroke="#e7a99b" stroke-width="7" stroke-linecap="round"/><path d="M405 475 C435 505 470 505 500 475" fill="none" stroke="#8f3340" stroke-width="11" stroke-linecap="round"/>
<circle cx="315" cy="430" r="24" fill="#ff9eb3" opacity=".45"/><circle cx="585" cy="430" r="24" fill="#ff9eb3" opacity=".45"/><path d="M350 655 L450 760 L550 655" fill="#252944" stroke="#151827" stroke-width="8"/><circle cx="450" cy="705" r="30" fill="#8f69ff" stroke="#fff" stroke-width="6"/></svg>`;

init();

function init(){
  wire();
  fitCanvas();fitObs();updateLabels();updateZoomUi();scheduleBlink();
  if(!restoreLocal(false))loadSample();
  if(new URLSearchParams(location.search).get("obs")==="1")openObs(true);
  requestAnimationFrame(loop);
}

function wire(){
  window.addEventListener("resize",()=>{fitCanvas();fitObs();});
  document.getElementById("fileInput").addEventListener("change",e=>{const f=e.target.files[0];if(f)loadFile(f);});
  document.getElementById("sampleBtn").onclick=loadSample;
  document.getElementById("detectBtn").onclick=detectFaceFromImage;
  document.getElementById("presetBtn").onclick=applyPreset;
  document.querySelectorAll(".tool").forEach(b=>b.onclick=()=>selectTool(b));
  document.getElementById("autoPointsBtn").onclick=autoPoints;
  document.getElementById("resetViewBtn").onclick=()=>{state.view.zoom=1;state.view.panX=0;state.view.panY=0;updateZoomUi();};
  document.getElementById("motionBtn").onclick=()=>{state.motion=!state.motion;document.getElementById("motionBtn").textContent=state.motion?"モーション ON":"モーション OFF";};
  document.getElementById("trackingBtn").onclick=toggleTracking;
  document.getElementById("micBtn").onclick=toggleMic;
  document.getElementById("guideBtn").onclick=()=>{state.debug=!state.debug;document.getElementById("guideBtn").textContent=state.debug?"ガイド ON":"ガイド OFF";};
  document.getElementById("blinkBtn").onclick=()=>triggerBlink(true);
  document.getElementById("talkBtn").onclick=()=>state.manual.talking=1.25;
  document.getElementById("autoYawBtn").onclick=()=>{state.autoYaw=!state.autoYaw;document.getElementById("autoYawBtn").textContent=state.autoYaw?"顔向き自動 ON":"顔向き自動 OFF";};
  document.getElementById("centerBtn").onclick=()=>{state.controls.manualYaw=0;state.track.yaw=0;state.smooth.yaw=0;updateLabels();};
  document.getElementById("obsBtn").onclick=()=>openObs(false);
  document.getElementById("closeObsBtn").onclick=closeObs;
  document.getElementById("saveBtn").onclick=()=>{saveLocal();alert("保存しました");};
  document.getElementById("loadBtn").onclick=()=>restoreLocal(true);
  document.getElementById("exportBtn").onclick=()=>document.getElementById("settingsBox").value=JSON.stringify(settings(),null,2);
  document.getElementById("importBtn").onclick=()=>{try{applySettings(JSON.parse(document.getElementById("settingsBox").value));saveLocal();alert("読み込みました");}catch(e){alert("JSONが読めません");}};

  Object.keys(state.controls).forEach(id=>{
    const el=document.getElementById(id);
    if(!el)return;
    el.addEventListener(el.type==="checkbox"?"change":"input",()=>{
      state.controls[id]=el.type==="checkbox"?el.checked:Number(el.value);
      updateLabels();
    });
  });

  canvas.addEventListener("mousedown",e=>{state.view.dragging=true;state.view.lastX=e.clientX;state.view.lastY=e.clientY;state.view.dragMoved=false;});
  window.addEventListener("mousemove",e=>{
    if(!state.view.dragging)return;
    const dx=e.clientX-state.view.lastX,dy=e.clientY-state.view.lastY;
    if(Math.abs(dx)+Math.abs(dy)>3)state.view.dragMoved=true;
    state.view.panX+=dx;state.view.panY+=dy;state.view.lastX=e.clientX;state.view.lastY=e.clientY;
  });
  window.addEventListener("mouseup",()=>state.view.dragging=false);
  canvas.addEventListener("click",e=>{if(state.view.dragMoved){state.view.dragMoved=false;return;}placePoint(e);});
  canvas.addEventListener("wheel",e=>{e.preventDefault();state.view.zoom=clamp(state.view.zoom*(e.deltaY<0?1.12:.88),.5,4.5);updateZoomUi();},{passive:false});
  document.getElementById("zoomRange").addEventListener("input",e=>{state.view.zoom=Number(e.target.value)/100;updateZoomUi();});
  document.getElementById("zoomInBtn").onclick=()=>{state.view.zoom=clamp(state.view.zoom*1.2,.5,4.5);updateZoomUi();};
  document.getElementById("zoomOutBtn").onclick=()=>{state.view.zoom=clamp(state.view.zoom/1.2,.5,4.5);updateZoomUi();};

  window.addEventListener("keydown",e=>{
    if(e.repeat)return;
    if(e.code==="KeyA")state.manual.yawKey=-1;
    if(e.code==="KeyD")state.manual.yawKey=1;
    if(e.code==="Space"){e.preventDefault();state.manual.talking=1.25;}
    if(e.code==="KeyB")triggerBlink(true);
  });
  window.addEventListener("keyup",e=>{if(["KeyA","KeyD"].includes(e.code))state.manual.yawKey=0;});
}

function applyPreset(){
  Object.assign(state.controls,{
    meshEnabled:true,meshDensity:48,faceRadius:245,yawBoost:2.7,manualYaw:0,
    headShift:36,faceSquash:0.13,cheekPower:34,noseShift:24,chinFollow:42,hairLag:0.76,neckLag:0.58,
    mouthSensitivity:8.8,mouthOpenPower:118,mouthRadius:86,jawDrop:58,
    blinkSensitivity:7.4,blinkPower:82,eyeRadius:66,
    breath:7,trackingSpeed:0.26
  });
  updateLabels();
  alert("IRIAM寄せプリセットを適用しました");
}

function selectTool(b){
  document.querySelectorAll(".tool").forEach(x=>x.classList.remove("active"));
  b.classList.add("active");state.tool=b.dataset.point;
  document.getElementById("toolReadout").textContent="選択中: "+labels[state.tool];
}
function loadFile(file){const r=new FileReader();r.onload=()=>loadImage(r.result,file.name,true);r.readAsDataURL(file);}
function loadSample(){loadImage("data:image/svg+xml;charset=utf-8,"+encodeURIComponent(sampleSvg),"LivePic_sample.svg",true);}
function loadImage(url,name,auto){const img=new Image();img.onload=()=>{state.image=img;state.imageDataUrl=url;state.imageName=name;document.getElementById("status").textContent=name;document.getElementById("dropMessage").style.display="none";if(auto)autoPoints();saveLocal();};img.src=url;}
function autoPoints(){state.points={face:{x:.5,y:.32},leftEye:{x:.405,y:.30},rightEye:{x:.595,y:.30},mouth:{x:.5,y:.405},chin:{x:.5,y:.49},neck:{x:.5,y:.54},body:{x:.5,y:.70},hair:{x:.5,y:.20}};}

async function getFaceMesh(){
  if(state.faceMesh)return state.faceMesh;
  if(typeof FaceMesh==="undefined")throw new Error("MediaPipe未読込。GitHub Pagesで試してください。");
  const fm=new FaceMesh({locateFile:file=>`https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`});
  fm.setOptions({maxNumFaces:1,refineLandmarks:true,minDetectionConfidence:.55,minTrackingConfidence:.55});
  state.faceMesh=fm;return fm;
}
async function detectFaceFromImage(){
  const status=document.getElementById("status");
  try{
    if(!state.image)throw new Error("先に画像を読み込んでください");
    status.textContent="顔認識中...";
    const fm=await getFaceMesh();
    const result=await new Promise(async(resolve,reject)=>{
      let done=false;
      fm.onResults(res=>{if(done)return;done=true;resolve(res);});
      const temp=document.createElement("canvas");
      temp.width=state.image.naturalWidth||state.image.width;temp.height=state.image.naturalHeight||state.image.height;
      temp.getContext("2d").drawImage(state.image,0,0,temp.width,temp.height);
      try{await fm.send({image:temp});}catch(e){reject(e);}
      setTimeout(()=>{if(!done)reject(new Error("顔を検出できませんでした"));},3500);
    });
    if(!result.multiFaceLandmarks||!result.multiFaceLandmarks[0])throw new Error("顔を検出できませんでした");
    applyLandmarks(result.multiFaceLandmarks[0]);status.textContent="顔認識OK";saveLocal();
  }catch(e){status.textContent="顔認識失敗: "+e.message;}
}
function applyLandmarks(lm){
  const avg=ids=>({x:ids.reduce((a,i)=>a+lm[i].x,0)/ids.length,y:ids.reduce((a,i)=>a+lm[i].y,0)/ids.length});
  const leftEye=avg([33,133,159,145]),rightEye=avg([263,362,386,374]),mouth=avg([13,14,78,308]);
  const chin=lm[152]||{x:.5,y:.55},nose=lm[1]||{x:.5,y:.35},forehead=lm[10]||{x:nose.x,y:nose.y-.18};
  state.points.leftEye=leftEye;state.points.rightEye=rightEye;state.points.mouth=mouth;state.points.chin={x:chin.x,y:chin.y};
  state.points.face={x:nose.x,y:(leftEye.y+rightEye.y+mouth.y)/3};
  state.points.neck={x:chin.x,y:clamp(chin.y+.07,0,1)};state.points.body={x:chin.x,y:clamp(chin.y+.23,0,1)};
  state.points.hair={x:forehead.x,y:clamp(forehead.y-.04,0,1)};
}

async function toggleTracking(){
  if(state.cameraOn){stopTracking();return;}
  try{
    const fm=await getFaceMesh();
    fm.onResults(onCameraResults);
    state.camera=new Camera(video,{onFrame:async()=>{await fm.send({image:video});},width:640,height:480});
    await state.camera.start();
    state.cameraOn=true;document.getElementById("trackingBtn").textContent="顔トラッキング ON";document.getElementById("trackReadout").textContent="Tracking: 起動中";
  }catch(e){alert("顔トラッキング開始失敗: "+e.message);}
}
function stopTracking(){
  state.cameraOn=false;if(state.camera&&state.camera.stop)state.camera.stop();if(video.srcObject)video.srcObject.getTracks().forEach(t=>t.stop());
  document.getElementById("trackingBtn").textContent="顔トラッキング OFF";document.getElementById("trackReadout").textContent="Tracking: OFF";
}
function onCameraResults(res){
  if(!res.multiFaceLandmarks||!res.multiFaceLandmarks[0]){state.track.hasFace=false;document.getElementById("trackReadout").textContent="Tracking: 顔なし";return;}
  const lm=res.multiFaceLandmarks[0],dist=(a,b)=>Math.hypot(lm[a].x-lm[b].x,lm[a].y-lm[b].y);
  const leftEyeOpen=dist(159,145)/(dist(33,133)+.0001),rightEyeOpen=dist(386,374)/(dist(263,362)+.0001),eyeOpen=(leftEyeOpen+rightEyeOpen)/2;
  const mouthRatio=dist(13,14)/(dist(78,308)+.0001);
  const nose=lm[1],left=lm[234],right=lm[454],centerX=(left.x+right.x)/2,faceW=Math.abs(right.x-left.x)+.0001;
  const rawYaw=(nose.x-centerX)/faceW;
  state.track.yaw=clamp(rawYaw*5.2*state.controls.yawBoost,-1,1);
  state.track.mouth=clamp((mouthRatio-.045)*state.controls.mouthSensitivity,0,1);
  state.track.blink=clamp((.185-eyeOpen)*state.controls.blinkSensitivity,0,1);
  state.track.hasFace=true;document.getElementById("trackReadout").textContent="Tracking: ON / 顔あり";
}

function fitCanvas(){const r=document.getElementById("stage").getBoundingClientRect(),d=devicePixelRatio||1;canvas.width=Math.max(1,Math.floor(r.width*d));canvas.height=Math.max(1,Math.floor(r.height*d));canvas.style.width=r.width+"px";canvas.style.height=r.height+"px";ctx.setTransform(d,0,0,d,0,0);}
function fitObs(){const d=devicePixelRatio||1;obsCanvas.width=Math.floor(innerWidth*d);obsCanvas.height=Math.floor(innerHeight*d);obsCtx.setTransform(d,0,0,d,0,0);}
function baseRect(w,h){if(!state.image)return{x:0,y:0,w:0,h:0};const s=Math.min(w/state.image.width,h/state.image.height)*.92;return{x:(w-state.image.width*s)/2,y:(h-state.image.height*s)/2,w:state.image.width*s,h:state.image.height*s};}
function imageRect(w,h,editor){const r=baseRect(w,h);if(!editor)return r;const cx=w/2,cy=h/2;return{x:cx+(r.x-cx)*state.view.zoom+state.view.panX,y:cy+(r.y-cy)*state.view.zoom+state.view.panY,w:r.w*state.view.zoom,h:r.h*state.view.zoom};}
function updateZoomUi(){document.getElementById("zoomVal").textContent=Math.round(state.view.zoom*100)+"%";document.getElementById("zoomRange").value=Math.round(state.view.zoom*100);}
function placePoint(e){if(!state.image)return;const d=canvas.getBoundingClientRect(),r=imageRect(d.width,d.height,true);state.points[state.tool]={x:clamp((e.clientX-d.left-r.x)/r.w,0,1),y:clamp((e.clientY-d.top-r.y)/r.h,0,1)};}

function draw(g,w,h,editor){
  g.clearRect(0,0,w,h);
  if(!state.image)return;
  const r=imageRect(w,h,editor);
  if(!state.controls.meshEnabled){
    g.drawImage(state.image,r.x,r.y,r.w,r.h);
  }else{
    drawWarpedMesh(g,r);
  }
  if(state.debug&&editor)drawGuides(g,r);
  if(editor)drawPoints(g,r);
}

function drawWarpedMesh(g,r){
  const n=Math.floor(state.controls.meshDensity);
  const cols=n,rows=Math.max(18, Math.floor(n*state.image.height/state.image.width));
  const verts=[];
  for(let y=0;y<=rows;y++){
    for(let x=0;x<=cols;x++){
      const u=x/cols,v=y/rows;
      verts.push({u,v,...warpPoint(u,v,r)});
    }
  }
  // draw base behind slightly enlarged to hide any triangle seam/edge
  g.save();g.globalAlpha=.18;g.drawImage(state.image,r.x-2,r.y-2,r.w+4,r.h+4);g.restore();

  for(let y=0;y<rows;y++){
    for(let x=0;x<cols;x++){
      const i=y*(cols+1)+x;
      const a=verts[i],b=verts[i+1],c=verts[i+cols+1],d=verts[i+cols+2];
      drawTri(g,a,b,c);
      drawTri(g,b,d,c);
    }
  }
}

function warpPoint(u,v,r){
  const p=normPoints();
  const c=state.controls, scale=r.w/900;
  let x=r.x+u*r.w,y=r.y+v*r.h;
  const face=toPixel(p.face,r),mouth=toPixel(p.mouth,r),chin=toPixel(p.chin,r),neck=toPixel(p.neck,r),hair=toPixel(p.hair,r);
  const leftEye=toPixel(p.leftEye,r),rightEye=toPixel(p.rightEye,r);
  const yaw=state.smooth.yaw;
  const mouthOpen=state.smooth.mouth;
  const blink=state.smooth.blink;

  // Stable chest breathing only below neck. No "flying".
  const bodyInf=smoothStep(p.neck.y, 1.0, v);
  y += Math.sin(state.t*.035)*c.breath*scale*0.13*bodyInf;
  x += Math.sin(state.t*.020)*0.9*scale*bodyInf;

  // Head influence: oval weighting, not circle only.
  const ox=(x-face.x)/(c.faceRadius*scale*0.92+.001);
  const oy=(y-face.y)/(c.faceRadius*scale*1.24+.001);
  let headInf=clamp(1-Math.sqrt(ox*ox+oy*oy),0,1);
  headInf=headInf*headInf*(3-2*headInf);

  // Hair and neck are separate delayed-ish regions
  const hx=(x-hair.x)/(c.faceRadius*scale*.95+.001), hy=(y-hair.y)/(c.faceRadius*scale*.76+.001);
  let hairInf=clamp(1-Math.sqrt(hx*hx+hy*hy),0,1); hairInf=hairInf*hairInf;

  const nx=(x-neck.x)/(c.faceRadius*scale*.42+.001), ny=(y-neck.y)/(c.faceRadius*scale*.36+.001);
  let neckInf=clamp(1-Math.sqrt(nx*nx+ny*ny),0,1); neckInf=neckInf*neckInf;

  // IRIAM-like head shift: face moves, neck less, hair counters with lag.
  x += state.smooth.headX*scale*headInf;
  y += state.smooth.headY*scale*headInf;
  x += state.smooth.neckX*scale*neckInf;
  x += state.smooth.hairX*scale*hairInf;

  // Pseudo 3D face turn: center shifts, far side compresses, near cheek expands.
  const side=(x-face.x)/(c.faceRadius*scale+.001);
  const verticalFace=clamp(1-Math.abs((y-face.y)/(c.faceRadius*scale*1.25+.001)),0,1);
  const cheekInf=headInf*verticalFace;
  x += yaw*c.headShift*scale*cheekInf*(1-Math.abs(side)*.18);
  x += -yaw*c.faceSquash*44*scale*cheekInf*side;

  // cheek volume: one cheek forward, other back. Subtle but makes it less rubber-sheet.
  const cheekPower=(c.cheekPower||0)*scale;
  const cheekSign = side >= 0 ? 1 : -1;
  x += yaw*cheekPower*cheekInf*0.18*cheekSign*(1-Math.abs(side));
  y += Math.abs(yaw)*cheekPower*0.035*cheekInf*Math.sign(y-face.y);

  // nose bridge-ish shift, central vertical band follows yaw more.
  const noseBand=clamp(1-Math.abs(side)/0.38,0,1)*clamp(1-Math.abs((y-face.y)/(c.faceRadius*scale*.90+.001)),0,1);
  x += yaw*(c.noseShift||0)*scale*noseBand*.35;

  // Chin follows head but drops/leans slightly on yaw.
  const chx=(x-chin.x)/(c.faceRadius*scale*.58+.001), chy=(y-chin.y)/(c.faceRadius*scale*.42+.001);
  let chinInf=clamp(1-Math.sqrt(chx*chx+chy*chy),0,1); chinInf=chinInf*chinInf;
  x += yaw*c.chinFollow*scale*chinInf*.22;
  y += Math.abs(yaw)*c.chinFollow*scale*chinInf*.06;

  // Mouth mesh: not overlay. Upper lip barely moves, lower lip/jaw moves more.
  const mx=(x-mouth.x)/(c.mouthRadius*scale*1.18+.001), my=(y-mouth.y)/(c.mouthRadius*scale*.82+.001);
  let mi=clamp(1-Math.sqrt(mx*mx+my*my),0,1);
  mi=mi*mi*(3-2*mi);
  const lower=Math.max(0, (y-mouth.y)/(c.mouthRadius*scale+.001));
  const upper=Math.max(0, (mouth.y-y)/(c.mouthRadius*scale+.001));
  const lowerWeight=0.38+0.78*clamp(lower,0,1);
  const upperWeight=0.20+0.22*clamp(upper,0,1);
  const lipWeight = y > mouth.y ? lowerWeight : upperWeight;
  y += mouthOpen*c.mouthOpenPower*scale*mi*lipWeight;
  x += (x-mouth.x)*mouthOpen*0.30*mi; // horizontal vowel-like spread
  // mouth corners slightly lift inward/outward
  x += Math.sign(x-mouth.x)*mouthOpen*10*scale*mi*clamp(Math.abs(mx),0,1);

  // Jaw region follows mouth, but smoothly blends down to chin.
  const jawInf=smoothStep(p.mouth.y, p.chin.y+.18, v)*headInf;
  y += mouthOpen*c.jawDrop*scale*jawInf;

  // Blink mesh: pull eyelid vertices toward eye center, per-eye.
  const eyeWarp=(eye)=>{
    const ex=(x-eye.x)/(c.eyeRadius*scale*1.15+.001), ey=(y-eye.y)/(c.eyeRadius*scale*.78+.001);
    let ei=clamp(1-Math.sqrt(ex*ex+ey*ey),0,1);
    ei=ei*ei*(3-2*ei);
    // Collapse toward eye center; upper lid stronger than lower.
    const toward=(eye.y-y);
    const upperLid = y < eye.y ? 1.0 : 0.55;
    y += toward*blink*(c.blinkPower/100)*0.92*ei*upperLid;
    x += (eye.x-x)*blink*0.10*ei;
    // face turn squashes far eye a little
    x += yaw*(eye.x < face.x ? -1 : 1)*4*scale*ei*headInf;
  };
  eyeWarp(leftEye); eyeWarp(rightEye);

  return {x,y};
}

function smoothStep(a,b,x){
  const t=clamp((x-a)/(b-a+.0001),0,1);
  return t*t*(3-2*t);
}

function normPoints(){
  const def={face:{x:.5,y:.32},leftEye:{x:.405,y:.30},rightEye:{x:.595,y:.30},mouth:{x:.5,y:.405},chin:{x:.5,y:.49},neck:{x:.5,y:.54},body:{x:.5,y:.70},hair:{x:.5,y:.20}};
  return Object.fromEntries(Object.entries(def).map(([k,v])=>[k,state.points[k]||v]));
}
function toPixel(q,r){return{x:r.x+q.x*r.w,y:r.y+q.y*r.h};}
function smoothBand(v,a,b){return clamp((v-a)/(b-a+.0001),0,1);}

function drawTri(g,p0,p1,p2){
  const iw=state.image.width,ih=state.image.height;
  const sx0=p0.u*iw,sy0=p0.v*ih,sx1=p1.u*iw,sy1=p1.v*ih,sx2=p2.u*iw,sy2=p2.v*ih;
  let dx0=p0.x,dy0=p0.y,dx1=p1.x,dy1=p1.y,dx2=p2.x,dy2=p2.y;

  // Tiny outward expansion reduces hairline seams between triangles.
  const cx=(dx0+dx1+dx2)/3, cy=(dy0+dy1+dy2)/3;
  const expand=0.35;
  const push=(x,y)=>{
    const vx=x-cx,vy=y-cy,len=Math.hypot(vx,vy)||1;
    return {x:x+vx/len*expand,y:y+vy/len*expand};
  };
  const q0=push(dx0,dy0),q1=push(dx1,dy1),q2=push(dx2,dy2);
  dx0=q0.x;dy0=q0.y;dx1=q1.x;dy1=q1.y;dx2=q2.x;dy2=q2.y;

  const denom=sx0*(sy1-sy2)+sx1*(sy2-sy0)+sx2*(sy0-sy1);
  if(Math.abs(denom)<.0001)return;
  const a=(dx0*(sy1-sy2)+dx1*(sy2-sy0)+dx2*(sy0-sy1))/denom;
  const b=(dy0*(sy1-sy2)+dy1*(sy2-sy0)+dy2*(sy0-sy1))/denom;
  const c=(dx0*(sx2-sx1)+dx1*(sx0-sx2)+dx2*(sx1-sx0))/denom;
  const d=(dy0*(sx2-sx1)+dy1*(sx0-sx2)+dy2*(sx1-sx0))/denom;
  const e=(dx0*(sx1*sy2-sx2*sy1)+dx1*(sx2*sy0-sx0*sy2)+dx2*(sx0*sy1-sx1*sy0))/denom;
  const f=(dy0*(sx1*sy2-sx2*sy1)+dy1*(sx2*sy0-sx0*sy2)+dy2*(sx0*sy1-sx1*sy0))/denom;
  g.save();
  g.beginPath();
  g.moveTo(dx0,dy0);g.lineTo(dx1,dy1);g.lineTo(dx2,dy2);g.closePath();
  g.clip();
  g.setTransform(a,b,c,d,e,f);
  g.imageSmoothingEnabled=true;
  g.imageSmoothingQuality="high";
  g.drawImage(state.image,0,0);
  g.restore();
}

function drawGuides(g,r){
  const p=normPoints(),scale=r.w/900;
  const face=toPixel(p.face,r),mouth=toPixel(p.mouth,r);
  g.save();
  g.strokeStyle="rgba(126,231,255,.55)";g.lineWidth=2;
  g.beginPath();g.arc(face.x,face.y,state.controls.faceRadius*scale,0,Math.PI*2);g.stroke();
  g.strokeStyle="rgba(255,122,217,.55)";
  g.beginPath();g.arc(mouth.x,mouth.y,state.controls.mouthRadius*scale,0,Math.PI*2);g.stroke();
  g.restore();
}
function drawPoints(g,r){
  Object.entries(normPoints()).forEach(([k,p])=>{
    if(!state.points[k])return;
    const x=r.x+p.x*r.w,y=r.y+p.y*r.h,sel=k===state.tool,rad=sel?16:12;
    g.save();g.fillStyle=colors[k]||"#fff";g.strokeStyle="rgba(0,0,0,.75)";g.lineWidth=3;
    g.beginPath();g.arc(x,y,rad,0,Math.PI*2);g.fill();g.stroke();
    if(sel){g.strokeStyle="rgba(126,231,255,.9)";g.beginPath();g.arc(x,y,rad+8,0,Math.PI*2);g.stroke();}
    g.font="800 15px system-ui";g.fillStyle="rgba(0,0,0,.8)";g.fillText(labels[k],x+rad+6,y-rad-2);g.fillStyle="#fff";g.fillText(labels[k],x+rad+5,y-rad-3);g.restore();
  });
}

async function toggleMic(){
  if(state.mic.enabled){stopMic();return;}
  try{
    const stream=await navigator.mediaDevices.getUserMedia({audio:true,video:false});
    const AC=window.AudioContext||window.webkitAudioContext;
    const ac=new AC(),src=ac.createMediaStreamSource(stream),an=ac.createAnalyser();
    an.fftSize=1024;an.smoothingTimeConstant=.70;src.connect(an);
    state.mic={enabled:true,stream,audioCtx:ac,analyser:an,data:new Uint8Array(an.fftSize),level:0};
    document.getElementById("micBtn").textContent="マイク ON";
  }catch(e){alert("マイク権限を確認してください");}
}
function stopMic(){
  if(state.mic.stream)state.mic.stream.getTracks().forEach(t=>t.stop());
  if(state.mic.audioCtx)state.mic.audioCtx.close().catch(()=>{});
  state.mic={enabled:false,stream:null,audioCtx:null,analyser:null,data:null,level:0};
  document.getElementById("micBtn").textContent="マイク OFF";
}
function updateMic(){
  if(!state.mic.enabled||!state.mic.analyser){state.mic.level*=.88;return;}
  state.mic.analyser.getByteTimeDomainData(state.mic.data);
  let sum=0;for(const b of state.mic.data){const v=(b-128)/128;sum+=v*v;}
  const rms=Math.sqrt(sum/state.mic.data.length);
  state.mic.level=state.mic.level*.62+clamp(rms*state.controls.mouthSensitivity*.75,0,1)*.38;
}

function triggerBlink(manual=false){state.manual.blinkBoost=1.35;if(manual)state.doubleBlink=false;}
function scheduleBlink(){state.nextBlink=performance.now()+2200+Math.random()*4200;state.doubleBlink=Math.random()<.18;}
function updateMotion(now){
  const c=state.controls,m=state.motion?1:0;
  let targetYaw=c.manualYaw/100;
  if(state.autoYaw)targetYaw=Math.sin(state.t*.026)*.75;
  if(state.cameraOn)targetYaw=state.track.yaw;
  targetYaw+=state.manual.yawKey*.9;
  state.smooth.yaw=lerp(state.smooth.yaw,clamp(targetYaw,-1,1),c.trackingSpeed);

  const headTarget=state.smooth.yaw*c.headShift*m;
  state.smooth.headX=lerp(state.smooth.headX,headTarget,.18);
  state.smooth.headY=lerp(state.smooth.headY,Math.sin(state.t*.021)*2.2*m,.10);
  state.smooth.neckX=lerp(state.smooth.neckX,headTarget*.30,.15*(1-c.neckLag*.72));
  state.smooth.hairX=lerp(state.smooth.hairX,-headTarget*.46,.14*(1-c.hairLag*.74));

  let targetMouth=Math.max(state.mic.level,state.manual.talking);
  if(state.cameraOn)targetMouth=Math.max(targetMouth,state.track.mouth);
  state.smooth.mouth=lerp(state.smooth.mouth,targetMouth,.34);
  state.manual.talking*=.80;

  let targetBlink=state.manual.blinkBoost;
  if(state.cameraOn)targetBlink=Math.max(targetBlink,state.track.blink);
  if(now>state.nextBlink&&!state.cameraOn){
    triggerBlink();
    if(state.doubleBlink)state.nextBlink=now+150;else scheduleBlink();
    state.doubleBlink=false;
  }
  state.smooth.blink=lerp(state.smooth.blink,targetBlink,.46);
  state.manual.blinkBoost*=.55;

  state.smooth.eyeX=lerp(state.smooth.eyeX,Math.sin(state.t*.019)-state.smooth.yaw*.55,.035);
  state.smooth.eyeY=lerp(state.smooth.eyeY,Math.sin(state.t*.013),.03);
  updateMeters();
}
function updateMeters(){
  const vals={Yaw:Math.round(Math.abs(state.smooth.yaw)*100),Mouth:Math.round(clamp(state.smooth.mouth,0,1)*100),Blink:Math.round(clamp(state.smooth.blink,0,1)*100)};
  for(const [k,v] of Object.entries(vals)){const t=document.getElementById("meter"+k),b=document.getElementById("bar"+k);if(t)t.textContent=v+"%";if(b)b.style.width=v+"%";}
}

function openObs(q){state.obs=true;document.getElementById("obsOverlay").classList.remove("hidden");if(q)document.body.classList.add("obs-mode");fitObs();}
function closeObs(){state.obs=false;document.getElementById("obsOverlay").classList.add("hidden");}
function settings(){return{app:"LivePic",version:"2.1",imageName:state.imageName,imageDataUrl:state.imageDataUrl,points:state.points,controls:state.controls};}
function applySettings(d){if(d.points)state.points=d.points;if(d.controls)Object.assign(state.controls,d.controls);updateLabels();if(d.imageDataUrl)loadImage(d.imageDataUrl,d.imageName||"restored",false);}
function saveLocal(){try{localStorage.setItem("livepic_v21",JSON.stringify(settings()));}catch(e){}}
function restoreLocal(show){try{const raw=localStorage.getItem("livepic_v21");if(!raw){if(show)alert("保存がありません");return false;}applySettings(JSON.parse(raw));if(show)alert("復元しました");return true;}catch(e){if(show)alert("復元失敗");return false;}}

function updateLabels(){
  Object.keys(state.controls).forEach(id=>{
    const el=document.getElementById(id);if(el){if(el.type==="checkbox")el.checked=!!state.controls[id];else el.value=state.controls[id];}
    const lab=document.getElementById(id+"Val");if(lab){let v=state.controls[id];if(["yawBoost","faceSquash","hairLag","neckLag","mouthSensitivity","blinkSensitivity","trackingSpeed"].includes(id))v=Number(v).toFixed(2);lab.textContent=v;}
  });
}
function loop(now){
  const delta=now-state.lastFrame;state.lastFrame=now;state.fps=state.fps*.9+(1000/Math.max(delta,1))*.1;document.getElementById("fpsReadout").textContent="FPS: "+Math.round(state.fps);
  state.t++;updateMic();updateMotion(now);
  const r=canvas.getBoundingClientRect();draw(ctx,r.width,r.height,true);
  if(state.obs||document.body.classList.contains("obs-mode"))draw(obsCtx,innerWidth,innerHeight,false);
  requestAnimationFrame(loop);
}
function clamp(n,min,max){return Math.max(min,Math.min(max,n));}
function lerp(a,b,t){return a+(b-a)*t;}
