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
  tool:"face",motion:true,obs:false,debug:true,showMeshLines:false,autoYaw:false,cameraOn:false,faceMesh:null,camera:null,
  points:{face:null,leftEye:null,rightEye:null,mouth:null,chin:null,neck:null,body:null,hair:null},
  controls:{
    meshEnabled:true,safeUnderlay:true,meshOpacity:0.82,partWeights:true,partSeparation:0.45,live2dLayerMode:true,layerOpacity:0.72,safeDeform:true,meshDensity:34,globalPower:1.15,faceRadius:220,yawBoost:1.55,manualYaw:0,
    headShift:22,faceSquash:0.08,cheekPower:18,noseShift:14,chinFollow:20,hairLag:0.62,neckLag:0.42,headRotate:4,neckFollow:0.35,hairDelay:0.45,
    mouthSensitivity:8.0,mouthOpenPower:88,mouthRadius:82,jawDrop:45,vowelMix:0.55,roundMouth:36,
    blinkSensitivity:8.0,blinkPower:78,eyeRadius:70,farEyeSquash:0.18,eyeLag:0.35,
    breath:5,trackingSpeed:0.20
  },
  track:{yaw:0,mouth:0,blink:0,hasFace:false},
  smooth:{yaw:0,mouth:0,blink:0,headX:0,headY:0,neckX:0,hairX:0},
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
  loadSample();
  setTimeout(()=>{ if(!state.image) loadSample(); }, 800);
  if(new URLSearchParams(location.search).get("obs")==="1")openObs(true);
  requestAnimationFrame(loop);
}

function setDebugStatus(kind,text){
  const id = kind === "image" ? "imageStatus" : kind === "mesh" ? "meshStatus" : "renderStatus";
  const el = document.getElementById(id);
  if(el) el.textContent = (kind === "image" ? "Image: " : kind === "mesh" ? "Mesh: " : "Render: ") + text;
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
  document.getElementById("meshLineBtn").onclick=()=>{state.showMeshLines=!state.showMeshLines;document.getElementById("meshLineBtn").textContent=state.showMeshLines?"メッシュ線 ON":"メッシュ線 OFF";};
  document.getElementById("blinkBtn").onclick=()=>triggerBlink(true);
  document.getElementById("talkBtn").onclick=()=>state.manual.talking=1.4;
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
    if(e.code==="Space"){e.preventDefault();state.manual.talking=1.4;}
    if(e.code==="KeyB")triggerBlink(true);
  });
  window.addEventListener("keyup",e=>{if(["KeyA","KeyD"].includes(e.code))state.manual.yawKey=0;});
}

function applyPreset(){
  Object.assign(state.controls,{
    meshEnabled:true,safeUnderlay:true,meshOpacity:0.82,partWeights:true,partSeparation:0.45,live2dLayerMode:true,layerOpacity:0.72,safeDeform:true,meshDensity:34,globalPower:1.15,faceRadius:220,yawBoost:1.55,manualYaw:0,
    headShift:22,faceSquash:0.08,cheekPower:18,noseShift:14,chinFollow:20,hairLag:0.62,neckLag:0.42,headRotate:4,neckFollow:0.35,hairDelay:0.45,
    mouthSensitivity:8.0,mouthOpenPower:88,mouthRadius:82,jawDrop:45,vowelMix:0.55,roundMouth:36,
    blinkSensitivity:8.0,blinkPower:78,eyeRadius:70,farEyeSquash:0.18,eyeLag:0.35,
    breath:5,trackingSpeed:0.20
  });
  updateLabels();
  alert("Live2D寄せプリセットを適用しました");
}

function selectTool(b){
  document.querySelectorAll(".tool").forEach(x=>x.classList.remove("active"));
  b.classList.add("active");state.tool=b.dataset.point;
  document.getElementById("toolReadout").textContent="選択中: "+labels[state.tool];
}
function loadFile(file){
  const status=document.getElementById("status");
  if(!file){return;}
  if(status) status.textContent="ファイル読み込み中: "+file.name;
  const r=new FileReader();
  r.onload=()=>loadImage(r.result,file.name,true);
  r.onerror=()=>{
    if(status) status.textContent="ファイル読み込み失敗: "+file.name;
  };
  r.readAsDataURL(file);
}

function createSamplePngDataUrl(){
  const c=document.createElement("canvas");
  c.width=900;
  c.height=1200;
  const g=c.getContext("2d");

  g.clearRect(0,0,c.width,c.height);

  // shadow
  g.fillStyle="rgba(18,19,30,.25)";
  g.beginPath();g.ellipse(450,1030,250,120,0,0,Math.PI*2);g.fill();

  // body
  const cloth=g.createLinearGradient(250,520,650,1090);
  cloth.addColorStop(0,"#ffffff");cloth.addColorStop(1,"#dfe7ff");
  g.fillStyle=cloth;g.strokeStyle="#30364e";g.lineWidth=8;
  g.beginPath();
  g.moveTo(250,520);
  g.bezierCurveTo(170,690,165,930,260,1090);
  g.lineTo(640,1090);
  g.bezierCurveTo(735,930,730,690,650,520);
  g.bezierCurveTo(610,420,300,420,250,520);
  g.closePath();g.fill();g.stroke();

  // neck
  g.fillStyle="#ffd8c8";g.strokeStyle="#30364e";g.lineWidth=6;
  g.beginPath();g.moveTo(375,520);g.lineTo(525,520);g.lineTo(505,650);g.lineTo(395,650);g.closePath();g.fill();g.stroke();

  // hair back
  const hair=g.createLinearGradient(210,45,690,980);
  hair.addColorStop(0,"#30264c");hair.addColorStop(1,"#141827");
  g.fillStyle=hair;g.strokeStyle="#0d0f18";g.lineWidth=8;
  g.beginPath();
  g.moveTo(210,250);
  g.bezierCurveTo(210,95,330,45,450,45);
  g.bezierCurveTo(570,45,690,95,690,250);
  g.bezierCurveTo(720,500,695,790,620,980);
  g.bezierCurveTo(600,760,580,620,560,510);
  g.bezierCurveTo(520,560,380,560,340,510);
  g.bezierCurveTo(320,620,300,760,280,980);
  g.bezierCurveTo(205,790,180,500,210,250);
  g.closePath();g.fill();g.stroke();

  // face
  g.fillStyle="#ffd8c8";g.strokeStyle="#30364e";g.lineWidth=8;
  g.beginPath();g.ellipse(450,340,205,245,0,0,Math.PI*2);g.fill();g.stroke();

  // bangs
  g.fillStyle=hair;g.strokeStyle="#0d0f18";g.lineWidth=5;
  g.beginPath();
  g.moveTo(270,280);
  g.bezierCurveTo(330,150,570,150,630,280);
  g.bezierCurveTo(570,220,330,220,270,280);
  g.closePath();g.fill();
  g.beginPath();
  g.moveTo(285,260);
  g.bezierCurveTo(330,135,520,110,610,235);
  g.bezierCurveTo(515,190,380,200,285,260);
  g.closePath();g.fill();g.stroke();

  // eyes
  g.fillStyle="#fff";
  g.beginPath();g.ellipse(365,355,42,34,0,0,Math.PI*2);g.fill();
  g.beginPath();g.ellipse(535,355,42,34,0,0,Math.PI*2);g.fill();
  g.fillStyle="#8f69ff";
  g.beginPath();g.arc(365,358,20,0,Math.PI*2);g.fill();
  g.beginPath();g.arc(535,358,20,0,Math.PI*2);g.fill();
  g.fillStyle="#fff";
  g.beginPath();g.arc(372,348,7,0,Math.PI*2);g.fill();
  g.beginPath();g.arc(542,348,7,0,Math.PI*2);g.fill();

  // brows
  g.strokeStyle="#1a1d2c";g.lineWidth=10;g.lineCap="round";
  g.beginPath();g.moveTo(330,310);g.bezierCurveTo(360,290,390,292,410,315);g.stroke();
  g.beginPath();g.moveTo(490,315);g.bezierCurveTo(510,292,540,290,570,310);g.stroke();

  // nose mouth blush
  g.strokeStyle="#e7a99b";g.lineWidth=7;
  g.beginPath();g.moveTo(445,365);g.bezierCurveTo(435,410,430,420,450,430);g.stroke();
  g.strokeStyle="#8f3340";g.lineWidth=11;
  g.beginPath();g.moveTo(405,475);g.bezierCurveTo(435,505,470,505,500,475);g.stroke();
  g.fillStyle="rgba(255,158,179,.45)";
  g.beginPath();g.arc(315,430,24,0,Math.PI*2);g.fill();
  g.beginPath();g.arc(585,430,24,0,Math.PI*2);g.fill();

  // ribbon
  g.fillStyle="#252944";g.strokeStyle="#151827";g.lineWidth=8;
  g.beginPath();g.moveTo(350,655);g.lineTo(450,760);g.lineTo(550,655);g.closePath();g.fill();g.stroke();
  g.fillStyle="#8f69ff";g.strokeStyle="#fff";g.lineWidth=6;
  g.beginPath();g.arc(450,705,30,0,Math.PI*2);g.fill();g.stroke();

  return c.toDataURL("image/png");
}

function loadSample(){
  const dataUrl = createSamplePngDataUrl();
  loadImage(dataUrl, "LivePic_sample_generated.png", true);
}
function loadImage(url,name,auto){
  const status=document.getElementById("status");
  const drop=document.getElementById("dropMessage");
  if(status) status.textContent="画像読み込み中: "+name;
  setDebugStatus("image","loading");
  const img=new Image();
  img.onload=()=>{
    if(!img.width || !img.height){
      if(status) status.textContent="画像読み込み失敗: サイズを取得できません";
      setDebugStatus("image","size error");
      if(drop){drop.style.display="block";drop.textContent="画像読み込み失敗";}
      return;
    }
    state.image=img;
    state.imageDataUrl=url;
    state.imageName=name;
    if(status) status.textContent="画像読み込みOK: "+name+" / "+img.width+"x"+img.height;
    setDebugStatus("image","OK "+img.width+"x"+img.height);
    if(drop) drop.style.display="none";
    if(auto) autoPoints();
    saveLocal();
  };
  img.onerror=()=>{
    if(status) status.textContent="画像読み込み失敗: "+name;
    setDebugStatus("image","load error");
    if(drop){drop.style.display="block";drop.textContent="画像を読み込めませんでした";}
  };
  img.src=url;
}
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

function fitCanvas(){
  const r=document.getElementById("stage").getBoundingClientRect();
  // Important: use CSS-pixel canvas coordinates so triangle affine transforms do not fight DPR transforms.
  canvas.width=Math.max(1,Math.floor(r.width));
  canvas.height=Math.max(1,Math.floor(r.height));
  canvas.style.width=r.width+"px";canvas.style.height=r.height+"px";
  ctx.setTransform(1,0,0,1,0,0);
  ctx.imageSmoothingEnabled=true;
}
function fitObs(){
  obsCanvas.width=Math.floor(innerWidth);
  obsCanvas.height=Math.floor(innerHeight);
  obsCtx.setTransform(1,0,0,1,0,0);
  obsCtx.imageSmoothingEnabled=true;
}
function baseRect(w,h){if(!state.image)return{x:0,y:0,w:0,h:0};const s=Math.min(w/state.image.width,h/state.image.height)*.92;return{x:(w-state.image.width*s)/2,y:(h-state.image.height*s)/2,w:state.image.width*s,h:state.image.height*s};}
function imageRect(w,h,editor){const r=baseRect(w,h);if(!editor)return r;const cx=w/2,cy=h/2;return{x:cx+(r.x-cx)*state.view.zoom+state.view.panX,y:cy+(r.y-cy)*state.view.zoom+state.view.panY,w:r.w*state.view.zoom,h:r.h*state.view.zoom};}
function updateZoomUi(){document.getElementById("zoomVal").textContent=Math.round(state.view.zoom*100)+"%";document.getElementById("zoomRange").value=Math.round(state.view.zoom*100);}
function placePoint(e){if(!state.image)return;const d=canvas.getBoundingClientRect(),r=imageRect(d.width,d.height,true);state.points[state.tool]={x:clamp((e.clientX-d.left-r.x)/r.w,0,1),y:clamp((e.clientY-d.top-r.y)/r.h,0,1)};}

function draw(g,w,h,editor){
  g.setTransform(1,0,0,1,0,0);
  g.clearRect(0,0,w,h);
  if(!state.image){
    setDebugStatus("render","no image");
    return;
  }
  g.imageSmoothingEnabled=true;
  g.imageSmoothingQuality="high";
  const r=imageRect(w,h,editor);

  // Always draw base. Live2D is layered, not a single violently warped sheet.
  g.save();
  g.globalAlpha = 1.0;
  g.drawImage(state.image,r.x,r.y,r.w,r.h);
  g.restore();

  if(state.controls.meshEnabled){
    try{
      g.save();
      g.globalAlpha = Number(state.controls.meshOpacity ?? 0.82);
      drawWarpedMesh(g,r);
      g.restore();
      setDebugStatus("mesh","OK");
    }catch(err){
      console.error("mesh render failed", err);
      setDebugStatus("mesh","ERROR");
    }
  }else{
    setDebugStatus("mesh","OFF");
  }

  if(state.controls.live2dLayerMode){
    try{
      drawLive2DLikeLayers(g,r);
    }catch(err){
      console.error("layer render failed", err);
    }
  }

  setDebugStatus("render","OK");
  if(state.debug&&editor)drawGuides(g,r);
  if(editor)drawPoints(g,r);
}


function drawLive2DLikeLayers(g,r){
  const c=state.controls;
  const p=normPoints();
  const face=toPixel(p.face,r), neck=toPixel(p.neck,r), hair=toPixel(p.hair,r);
  const scale=r.w/900;
  const yaw=state.smooth.yaw;
  const opacity=Number(c.layerOpacity||0.72);
  const headMove=state.smooth.headX*scale*0.72;
  const headY=state.smooth.headY*scale*0.55;
  const rot=yaw*(Number(c.headRotate||4))*Math.PI/180;

  // Neck subtle follow: local redraw, not whole-body distortion.
  g.save();
  g.globalAlpha=opacity*.38;
  clipEllipse(g, neck.x+state.smooth.neckX*scale*.25, neck.y, 90*scale, 90*scale);
  g.translate(state.smooth.neckX*scale*.18,0);
  g.drawImage(state.image,r.x,r.y,r.w,r.h);
  g.restore();

  // Head/face layer: small rotation and translation, not violent mesh deformation.
  g.save();
  g.globalAlpha=opacity;
  clipEllipse(g, face.x+headMove, face.y+headY+35*scale, 190*scale, 250*scale);
  g.translate(face.x+headMove, face.y+headY);
  g.rotate(rot);
  g.scale(1-Math.abs(yaw)*0.035,1+Math.abs(yaw)*0.015);
  g.translate(-face.x, -face.y);
  g.drawImage(state.image,r.x,r.y,r.w,r.h);
  g.restore();

  // Hair delay layer: hair moves a little opposite/late.
  g.save();
  g.globalAlpha=opacity*.42;
  clipEllipse(g, hair.x+state.smooth.hairX*scale*.28, hair.y+90*scale, 210*scale, 210*scale);
  g.translate(state.smooth.hairX*scale*.30, state.smooth.headY*scale*.12);
  g.drawImage(state.image,r.x,r.y,r.w,r.h);
  g.restore();
}

function clipEllipse(g,cx,cy,rx,ry){
  g.beginPath();
  g.ellipse(cx,cy,rx,ry,0,0,Math.PI*2);
  g.clip();
}

function drawWarpedMesh(g,r){
  const n=Math.max(8, Math.floor(state.controls.meshDensity));
  const cols=n;
  const rows=Math.max(16,Math.floor(n*state.image.height/state.image.width));
  const verts=[];
  for(let y=0;y<=rows;y++){
    for(let x=0;x<=cols;x++){
      const u=x/cols,v=y/rows;
      verts.push({u,v,...warpPoint(u,v,r)});
    }
  }

  // Background underlay hides tiny cracks and makes it obvious something is there.
  g.save();
  g.globalAlpha=0.20;
  g.drawImage(state.image,r.x-3,r.y-3,r.w+6,r.h+6);
  g.restore();

  for(let y=0;y<rows;y++){
    for(let x=0;x<cols;x++){
      const i=y*(cols+1)+x;
      const a=verts[i],b=verts[i+1],c=verts[i+cols+1],d=verts[i+cols+2];
      drawTri(g,a,b,c);
      drawTri(g,b,d,c);
      if(state.showMeshLines){
        g.save();
        g.globalAlpha=.16;
        g.strokeStyle="rgba(126,231,255,.75)";
        g.lineWidth=.45;
        g.beginPath();
        g.moveTo(a.x,a.y);g.lineTo(b.x,b.y);g.lineTo(d.x,d.y);g.lineTo(c.x,c.y);g.closePath();
        g.stroke();
        g.restore();
      }
    }
  }
}

function warpPoint(u,v,r){
  const p=normPoints();
  const c=state.controls, gp=(c.safeDeform ? Math.min(c.globalPower||1,1.35) : (c.globalPower||1)), scale=r.w/900;
  let x=r.x+u*r.w,y=r.y+v*r.h;

  const face=toPixel(p.face,r),mouth=toPixel(p.mouth,r),chin=toPixel(p.chin,r),neck=toPixel(p.neck,r),hair=toPixel(p.hair,r);
  const leftEye=toPixel(p.leftEye,r),rightEye=toPixel(p.rightEye,r);
  const yaw=state.smooth.yaw;
  const mouthOpen=state.smooth.mouth;
  const blink=state.smooth.blink;
  const partMode = !!c.partWeights;
  const sep = partMode ? Number(c.partSeparation||0.65) : 0;

  // Chest breathing only below neck.
  const bodyInf=smoothStep(p.neck.y,1.0,v);
  y += Math.sin(state.t*.035)*c.breath*scale*0.14*bodyInf;

  // Elliptical regions: face, hair, neck.
  const ox=(x-face.x)/(c.faceRadius*scale*0.92+.001);
  const oy=(y-face.y)/(c.faceRadius*scale*1.24+.001);
  let headInf=sCurve(clamp(1-Math.sqrt(ox*ox+oy*oy),0,1));

  const hx=(x-hair.x)/(c.faceRadius*scale*.96+.001), hy=(y-hair.y)/(c.faceRadius*scale*.78+.001);
  let hairInf=sCurve(clamp(1-Math.sqrt(hx*hx+hy*hy),0,1));
  const nx=(x-neck.x)/(c.faceRadius*scale*.46+.001), ny=(y-neck.y)/(c.faceRadius*scale*.38+.001);
  let neckInf=sCurve(clamp(1-Math.sqrt(nx*nx+ny*ny),0,1));

  // Pseudo part separation: hair/neck don't fully follow face.
  const faceFollow = partMode ? (1 + sep*0.10) : 1;
  const hairFollow = partMode ? (1 - sep*0.35) : 1;
  const neckFollow = partMode ? (1 - sep*0.45) : 1;

  x += state.smooth.headX*scale*headInf*faceFollow;
  y += state.smooth.headY*scale*headInf*faceFollow;
  x += state.smooth.neckX*scale*neckInf*neckFollow;
  x += state.smooth.hairX*scale*hairInf*hairFollow;

  // Face turn deformation
  const side=(x-face.x)/(c.faceRadius*scale+.001);
  const verticalFace=clamp(1-Math.abs((y-face.y)/(c.faceRadius*scale*1.25+.001)),0,1);
  const cheekInf=headInf*verticalFace;
  x += yaw*c.headShift*scale*cheekInf*gp*(1-Math.abs(side)*.18);
  x += -yaw*c.faceSquash*44*scale*cheekInf*side*gp;
  x += yaw*c.cheekPower*scale*cheekInf*0.24*Math.sign(side||1)*(1-Math.abs(side))*gp;
  y += Math.abs(yaw)*c.cheekPower*0.038*scale*cheekInf*Math.sign(y-face.y)*gp;

  // Nose bridge / center band follows yaw strongly to fake depth.
  const noseBand=clamp(1-Math.abs(side)/0.40,0,1)*clamp(1-Math.abs((y-face.y)/(c.faceRadius*scale*.92+.001)),0,1);
  x += yaw*c.noseShift*scale*noseBand*.44*gp;

  // Far-side eye compression and near-side expansion.
  const eyeSquash = Number(c.farEyeSquash||0.45);
  const farSide = Math.sign(yaw || 0);
  const eyeSideInfluence = headInf * clamp(Math.abs(yaw),0,1);
  x += -farSide * eyeSquash * 12 * scale * eyeSideInfluence * (Math.abs(side)>.12 ? Math.sign(side) : 0);

  // Chin turn
  const chx=(x-chin.x)/(c.faceRadius*scale*.60+.001), chy=(y-chin.y)/(c.faceRadius*scale*.45+.001);
  let chinInf=sCurve(clamp(1-Math.sqrt(chx*chx+chy*chy),0,1));
  x += yaw*c.chinFollow*scale*chinInf*.36*gp;
  y += Math.abs(yaw)*c.chinFollow*scale*chinInf*.08*gp;

  // Mouth deformation: vowel-ish behavior.
  const mx=(x-mouth.x)/(c.mouthRadius*scale*1.22+.001), my=(y-mouth.y)/(c.mouthRadius*scale*.86+.001);
  let mi=sCurve(clamp(1-Math.sqrt(mx*mx+my*my),0,1));
  const lower=Math.max(0,(y-mouth.y)/(c.mouthRadius*scale+.001));
  const upper=Math.max(0,(mouth.y-y)/(c.mouthRadius*scale+.001));
  const lipWeight = y > mouth.y ? 0.45+0.95*clamp(lower,0,1) : 0.20+0.25*clamp(upper,0,1);

  const vowel = (Math.sin(state.t*.11)+1)/2 * Number(c.vowelMix||0.75);
  const round = Number(c.roundMouth||48)/100;
  const wideShape = 1 + mouthOpen*(0.30 + 0.35*vowel);
  const roundShape = 1 - mouthOpen*round*0.25;

  y += mouthOpen*c.mouthOpenPower*scale*mi*lipWeight*gp;
  x += (x-mouth.x)*mouthOpen*0.42*mi*gp*wideShape*roundShape;
  x += Math.sign(x-mouth.x||1)*mouthOpen*14*scale*mi*clamp(Math.abs(mx),0,1)*gp*(1-round*.35);

  // "u" mouth: pull corners slightly inward on some frames.
  const roundPhase = mouthOpen * round * (1-vowel*.45);
  x += (mouth.x-x)*roundPhase*0.20*mi*gp;

  // Jaw follows mouth.
  const jawInf=smoothStep(p.mouth.y,p.chin.y+.18,v)*headInf;
  y += mouthOpen*c.jawDrop*scale*jawInf*gp;

  // Blink deformation, with eye lag against face yaw.
  const eyeWarp=(eye, isLeft)=>{
    const ex=(x-eye.x)/(c.eyeRadius*scale*1.18+.001), ey=(y-eye.y)/(c.eyeRadius*scale*.80+.001);
    let ei=sCurve(clamp(1-Math.sqrt(ex*ex+ey*ey),0,1));
    const toward=(eye.y-y);
    const upperLid=y<eye.y?1.12:0.62;
    y += toward*blink*(c.blinkPower/100)*1.05*ei*upperLid*gp;
    x += (eye.x-x)*blink*0.13*ei*gp;

    // Eye line subtly lags behind head turn.
    const eyeLag = Number(c.eyeLag||0.55);
    x += -yaw*eyeLag*10*scale*ei*headInf;
    // Far eye compresses more.
    const sideOfEye = isLeft ? -1 : 1;
    if(Math.sign(yaw) === sideOfEye){
      x += (eye.x-x)*Math.abs(yaw)*eyeSquash*0.16*ei;
    }
  };
  eyeWarp(leftEye,true);
  eyeWarp(rightEye,false);

  return {x,y};
}

function drawTri(g,p0,p1,p2){
  const iw=state.image.width,ih=state.image.height;
  const sx0=p0.u*iw,sy0=p0.v*ih,sx1=p1.u*iw,sy1=p1.v*ih,sx2=p2.u*iw,sy2=p2.v*ih;
  let dx0=p0.x,dy0=p0.y,dx1=p1.x,dy1=p1.y,dx2=p2.x,dy2=p2.y;

  // Expand triangles a hair to hide seams.
  const cx=(dx0+dx1+dx2)/3,cy=(dy0+dy1+dy2)/3;
  const expand=.45;
  const push=(x,y)=>{const vx=x-cx,vy=y-cy,len=Math.hypot(vx,vy)||1;return{x:x+vx/len*expand,y:y+vy/len*expand};};
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
  g.transform(a,b,c,d,e,f);
  g.imageSmoothingEnabled=true;
  g.drawImage(state.image,0,0);
  g.restore();
}

function normPoints(){
  const def={face:{x:.5,y:.32},leftEye:{x:.405,y:.30},rightEye:{x:.595,y:.30},mouth:{x:.5,y:.405},chin:{x:.5,y:.49},neck:{x:.5,y:.54},body:{x:.5,y:.70},hair:{x:.5,y:.20}};
  return Object.fromEntries(Object.entries(def).map(([k,v])=>[k,state.points[k]||v]));
}
function toPixel(q,r){return{x:r.x+q.x*r.w,y:r.y+q.y*r.h};}
function smoothStep(a,b,x){const t=clamp((x-a)/(b-a+.0001),0,1);return t*t*(3-2*t);}
function sCurve(t){return t*t*(3-2*t);}

function drawGuides(g,r){
  const p=normPoints(),scale=r.w/900,face=toPixel(p.face,r),mouth=toPixel(p.mouth,r),leftEye=toPixel(p.leftEye,r),rightEye=toPixel(p.rightEye,r);
  g.save();
  g.strokeStyle="rgba(126,231,255,.7)";g.lineWidth=2;
  g.beginPath();g.arc(face.x,face.y,state.controls.faceRadius*scale,0,Math.PI*2);g.stroke();
  g.strokeStyle="rgba(255,122,217,.7)";
  g.beginPath();g.arc(mouth.x,mouth.y,state.controls.mouthRadius*scale,0,Math.PI*2);g.stroke();
  g.strokeStyle="rgba(255,230,109,.7)";
  g.beginPath();g.arc(leftEye.x,leftEye.y,state.controls.eyeRadius*scale,0,Math.PI*2);g.stroke();
  g.beginPath();g.arc(rightEye.x,rightEye.y,state.controls.eyeRadius*scale,0,Math.PI*2);g.stroke();
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

function triggerBlink(manual=false){state.manual.blinkBoost=1.55;if(manual)state.doubleBlink=false;}
function scheduleBlink(){state.nextBlink=performance.now()+2200+Math.random()*4200;state.doubleBlink=Math.random()<.18;}
function updateMotion(now){
  const c=state.controls,m=state.motion?1:0;
  let targetYaw=c.manualYaw/100;
  if(state.autoYaw)targetYaw=Math.sin(state.t*.026)*0.45;
  if(state.cameraOn)targetYaw=state.track.yaw;
  targetYaw+=state.manual.yawKey*.38;
  state.smooth.yaw=lerp(state.smooth.yaw,clamp(targetYaw,-1,1),c.trackingSpeed);

  const headTarget=state.smooth.yaw*c.headShift*m;
  state.smooth.headX=lerp(state.smooth.headX,headTarget,.16);
  state.smooth.headY=lerp(state.smooth.headY,Math.sin(state.t*.021)*1.4*m,.10);
  state.smooth.neckX=lerp(state.smooth.neckX,headTarget*(c.neckFollow||0.35),.12*(1-c.neckLag*.55));
  state.smooth.hairX=lerp(state.smooth.hairX,-headTarget*(c.hairDelay||0.45),.10*(1-c.hairLag*.50));

  let targetMouth=Math.max(state.mic.level,state.manual.talking);
  if(state.cameraOn)targetMouth=Math.max(targetMouth,state.track.mouth);
  state.smooth.mouth=lerp(state.smooth.mouth,targetMouth,.38);
  state.manual.talking*=.80;

  let targetBlink=state.manual.blinkBoost;
  if(state.cameraOn)targetBlink=Math.max(targetBlink,state.track.blink);
  if(now>state.nextBlink&&!state.cameraOn){
    triggerBlink();
    if(state.doubleBlink)state.nextBlink=now+150;else scheduleBlink();
    state.doubleBlink=false;
  }
  state.smooth.blink=lerp(state.smooth.blink,targetBlink,.50);
  state.manual.blinkBoost*=.55;

  updateMeters();
}
function updateMeters(){
  const vals={Yaw:Math.round(Math.abs(state.smooth.yaw)*100),Mouth:Math.round(clamp(state.smooth.mouth,0,1)*100),Blink:Math.round(clamp(state.smooth.blink,0,1)*100)};
  for(const [k,v] of Object.entries(vals)){const t=document.getElementById("meter"+k),b=document.getElementById("bar"+k);if(t)t.textContent=v+"%";if(b)b.style.width=v+"%";}
}

function openObs(q){state.obs=true;document.getElementById("obsOverlay").classList.remove("hidden");if(q)document.body.classList.add("obs-mode");fitObs();}
function closeObs(){state.obs=false;document.getElementById("obsOverlay").classList.add("hidden");}
function settings(){return{app:"LivePic",version:"2.6",imageName:state.imageName,imageDataUrl:state.imageDataUrl,points:state.points,controls:state.controls};}
function applySettings(d){if(d.points)state.points=d.points;if(d.controls)Object.assign(state.controls,d.controls);updateLabels();if(d.imageDataUrl)loadImage(d.imageDataUrl,d.imageName||"restored",false);}
function saveLocal(){try{localStorage.setItem("livepic_v26",JSON.stringify(settings()));}catch(e){}}
function restoreLocal(show){try{const raw=localStorage.getItem("livepic_v26");if(!raw){if(show)alert("保存がありません");return false;}applySettings(JSON.parse(raw));if(show)alert("復元しました");return true;}catch(e){if(show)alert("復元失敗");return false;}}

function updateLabels(){
  Object.keys(state.controls).forEach(id=>{
    const el=document.getElementById(id);if(el){if(el.type==="checkbox")el.checked=!!state.controls[id];else el.value=state.controls[id];}
    const lab=document.getElementById(id+"Val");if(lab){let v=state.controls[id];if(["globalPower","yawBoost","faceSquash","hairLag","neckLag","mouthSensitivity","blinkSensitivity","trackingSpeed","meshOpacity","partSeparation","vowelMix","farEyeSquash","eyeLag","layerOpacity","headRotate","neckFollow","hairDelay"].includes(id))v=Number(v).toFixed(2);lab.textContent=v;}
  });
}
function loop(now){
  const delta=now-state.lastFrame;state.lastFrame=now;state.fps=state.fps*.9+(1000/Math.max(delta,1))*.1;document.getElementById("fpsReadout").textContent="FPS: "+Math.round(state.fps);
  state.t++;updateMic();updateMotion(now);
  const r=canvas.getBoundingClientRect();draw(ctx,r.width,r.height,true);
  if(state.obs||document.body.classList.contains("obs-mode"))draw(obsCtx,innerWidth,innerHeight,false);
  requestAnimationFrame(loop);
}

function setDebugStatus(kind,text){
  const id = kind === "image" ? "imageStatus" : kind === "mesh" ? "meshStatus" : "renderStatus";
  const el = document.getElementById(id);
  if(el) el.textContent = (kind === "image" ? "Image: " : kind === "mesh" ? "Mesh: " : "Render: ") + text;
}

function clamp(n,min,max){return Math.max(min,Math.min(max,n));}
function lerp(a,b,t){return a+(b-a)*t;}
