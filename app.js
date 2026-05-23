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
  tool:"face",motion:true,obs:false,autoYaw:false,cameraOn:false,faceMesh:null,camera:null,
  points:{face:null,leftEye:null,rightEye:null,mouth:null,chin:null,neck:null,body:null,hair:null},
  controls:{
    breath:16,sway:10,tilt:6,micGain:3.0,
    yaw:0,meshPower:48,faceRadius:230,meshDensity:54,meshEnabled:true,
    mouthAmount:58,mouthWide:58,blinkAmount:52,eyeWander:8,
    mouthSensitivity:4.0,blinkSensitivity:3.2
  },
  track:{yaw:0,mouth:0,blink:0},
  smooth:{yaw:0,mouth:0,blink:0,eyeX:0,eyeY:0},
  manual:{talking:0,blinkBoost:0,yawKey:0,y:0},
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
  document.getElementById("detectFaceBtn").onclick=detectFaceFromImage;
  document.querySelectorAll(".tool").forEach(b=>b.onclick=()=>selectTool(b));
  document.getElementById("autoPointBtn").onclick=autoPoints;
  document.getElementById("toggleMotionBtn").onclick=()=>{state.motion=!state.motion;document.getElementById("toggleMotionBtn").textContent=state.motion?"モーション ON":"モーション OFF";};
  document.getElementById("micBtn").onclick=toggleMic;
  document.getElementById("cameraBtn").onclick=toggleCameraTracking;
  document.getElementById("blinkBtn").onclick=()=>triggerBlink(true);
  document.getElementById("talkBtn").onclick=()=>state.manual.talking=1;
  document.getElementById("autoYawBtn").onclick=()=>{state.autoYaw=!state.autoYaw;document.getElementById("autoYawBtn").textContent=state.autoYaw?"顔向き自動 ON":"顔向き自動 OFF";};
  document.getElementById("resetFaceBtn").onclick=()=>{state.controls.yaw=0;state.track.yaw=0;state.smooth.yaw=0;updateLabels();};
  document.getElementById("openObsBtn").onclick=()=>openObs(false);
  document.getElementById("openObsBtn2").onclick=()=>openObs(false);
  document.getElementById("closeObs").onclick=closeObs;
  document.getElementById("saveLocalBtn").onclick=()=>{saveLocal();alert("保存しました");};
  document.getElementById("loadLocalBtn").onclick=()=>restoreLocal(true);
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
  canvas.addEventListener("wheel",e=>{e.preventDefault();zoomAt(e.deltaY<0?1.12:0.88);},{passive:false});
  document.getElementById("zoomRange").addEventListener("input",e=>{state.view.zoom=Number(e.target.value)/100;updateZoomUi();});
  document.getElementById("zoomInBtn").onclick=()=>{state.view.zoom=clamp(state.view.zoom*1.2,.5,4.5);updateZoomUi();};
  document.getElementById("zoomOutBtn").onclick=()=>{state.view.zoom=clamp(state.view.zoom/1.2,.5,4.5);updateZoomUi();};
  document.getElementById("zoomResetBtn").onclick=()=>{state.view.zoom=1;state.view.panX=0;state.view.panY=0;updateZoomUi();};

  window.addEventListener("keydown",e=>{
    if(e.repeat)return;
    if(e.code==="KeyA")state.manual.yawKey=-1;
    if(e.code==="KeyD")state.manual.yawKey=1;
    if(e.code==="KeyW")state.manual.y=-1;
    if(e.code==="KeyS")state.manual.y=1;
    if(e.code==="Space"){e.preventDefault();state.manual.talking=1;}
    if(e.code==="KeyB")triggerBlink(true);
  });
  window.addEventListener("keyup",e=>{
    if(["KeyA","KeyD"].includes(e.code))state.manual.yawKey=0;
    if(["KeyW","KeyS"].includes(e.code))state.manual.y=0;
  });
}

function selectTool(b){
  document.querySelectorAll(".tool").forEach(x=>x.classList.remove("active"));
  b.classList.add("active");state.tool=b.dataset.point;
  document.getElementById("currentTool").textContent="選択中: "+labels[state.tool];
}
function loadFile(file){const r=new FileReader();r.onload=()=>loadImage(r.result,file.name,true);r.readAsDataURL(file);}
function loadSample(){loadImage("data:image/svg+xml;charset=utf-8,"+encodeURIComponent(sampleSvg),"LivePic_sample.svg",true);}
function loadImage(url,name,auto){const img=new Image();img.onload=()=>{state.image=img;state.imageDataUrl=url;state.imageName=name;document.getElementById("fileName").textContent=name;document.getElementById("dropMessage").style.display="none";if(auto)autoPoints();saveLocal();};img.src=url;}
function autoPoints(){state.points={face:{x:.5,y:.32},leftEye:{x:.405,y:.30},rightEye:{x:.595,y:.30},mouth:{x:.5,y:.405},chin:{x:.5,y:.49},neck:{x:.5,y:.54},body:{x:.5,y:.70},hair:{x:.5,y:.20}};}

async function getFaceMesh(){
  if(state.faceMesh)return state.faceMesh;
  if(typeof FaceMesh === "undefined"){
    throw new Error("MediaPipeが読み込めません。ネット接続かGitHub Pages公開後に試してください。");
  }
  const fm=new FaceMesh({locateFile:(file)=>`https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`});
  fm.setOptions({maxNumFaces:1,refineLandmarks:true,minDetectionConfidence:.55,minTrackingConfidence:.55});
  state.faceMesh=fm;
  return fm;
}

async function detectFaceFromImage(){
  const status=document.getElementById("detectStatus");
  try{
    if(!state.image)throw new Error("先に画像を読み込んでください");
    status.textContent="顔認識中...";
    const fm=await getFaceMesh();
    const oldHandler=fm.onResults;
    const result=await new Promise(async(resolve,reject)=>{
      let done=false;
      fm.onResults((res)=>{if(done)return;done=true;resolve(res);});
      const temp=document.createElement("canvas");
      temp.width=state.image.naturalWidth||state.image.width;
      temp.height=state.image.naturalHeight||state.image.height;
      const tg=temp.getContext("2d");
      tg.drawImage(state.image,0,0,temp.width,temp.height);
      try{await fm.send({image:temp});}catch(e){reject(e);}
      setTimeout(()=>{if(!done)reject(new Error("顔を検出できませんでした"));},3500);
    });
    if(!result.multiFaceLandmarks || !result.multiFaceLandmarks[0])throw new Error("顔を検出できませんでした");
    applyLandmarksToImagePoints(result.multiFaceLandmarks[0]);
    status.textContent="顔認識OK。ポイントを自動配置しました。";
    saveLocal();
  }catch(e){
    status.textContent="顔認識失敗: "+e.message;
  }
}

function applyLandmarksToImagePoints(lm){
  const avg=(ids)=>({x:ids.reduce((a,i)=>a+lm[i].x,0)/ids.length,y:ids.reduce((a,i)=>a+lm[i].y,0)/ids.length});
  const leftEye=avg([33,133,159,145]);
  const rightEye=avg([263,362,386,374]);
  const mouth=avg([13,14,78,308]);
  const chin=lm[152] || {x:.5,y:.55};
  const nose=lm[1] || avg([leftEye,rightEye,mouth]);
  const forehead=lm[10] || {x:nose.x,y:nose.y-.18};
  state.points.leftEye=leftEye;
  state.points.rightEye=rightEye;
  state.points.mouth=mouth;
  state.points.chin={x:chin.x,y:chin.y};
  state.points.face={x:nose.x,y:(leftEye.y+rightEye.y+mouth.y)/3};
  state.points.neck={x:chin.x,y:clamp(chin.y+.07,0,1)};
  state.points.body={x:chin.x,y:clamp(chin.y+.23,0,1)};
  state.points.hair={x:forehead.x,y:clamp(forehead.y-.04,0,1)};
}

async function toggleCameraTracking(){
  if(state.cameraOn){
    stopCameraTracking();
    return;
  }
  try{
    const fm=await getFaceMesh();
    fm.onResults(onCameraResults);
    state.camera=new Camera(video,{
      onFrame:async()=>{await fm.send({image:video});},
      width:640,height:480
    });
    await state.camera.start();
    state.cameraOn=true;
    document.getElementById("cameraBtn").textContent="カメラ表情 ON";
    document.getElementById("trackingStatus").textContent="Tracking: ON";
  }catch(e){
    alert("カメラ表情を開始できません: "+e.message);
  }
}
function stopCameraTracking(){
  state.cameraOn=false;
  if(state.camera && state.camera.stop)state.camera.stop();
  if(video.srcObject)video.srcObject.getTracks().forEach(t=>t.stop());
  document.getElementById("cameraBtn").textContent="カメラ表情 OFF";
  document.getElementById("trackingStatus").textContent="Tracking: OFF";
}
function onCameraResults(res){
  if(!res.multiFaceLandmarks || !res.multiFaceLandmarks[0])return;
  const lm=res.multiFaceLandmarks[0];
  const dist=(a,b)=>Math.hypot(lm[a].x-lm[b].x,lm[a].y-lm[b].y);
  const eyeW=(dist(33,133)+dist(263,362))/2;
  const eyeOpen=(dist(159,145)+dist(386,374))/2;
  const mouthW=dist(78,308);
  const mouthOpen=dist(13,14);
  const nose=lm[1], centerX=(lm[33].x+lm[263].x)/2;
  const yaw=clamp((nose.x-centerX)*8,-1,1);
  const mouth=clamp((mouthOpen/(mouthW+.0001)-.05)*state.controls.mouthSensitivity,0,1);
  const blink=clamp((.23-(eyeOpen/(eyeW+.0001)))*state.controls.blinkSensitivity,0,1);
  state.track.yaw=yaw;
  state.track.mouth=mouth;
  state.track.blink=blink;
}

function fitCanvas(){const r=document.getElementById("stage").getBoundingClientRect(),d=devicePixelRatio||1;canvas.width=Math.max(1,Math.floor(r.width*d));canvas.height=Math.max(1,Math.floor(r.height*d));canvas.style.width=r.width+"px";canvas.style.height=r.height+"px";ctx.setTransform(d,0,0,d,0,0);}
function fitObs(){const d=devicePixelRatio||1;obsCanvas.width=Math.floor(innerWidth*d);obsCanvas.height=Math.floor(innerHeight*d);obsCtx.setTransform(d,0,0,d,0,0);}
function baseRect(w,h){if(!state.image)return{x:0,y:0,w:0,h:0};const s=Math.min(w/state.image.width,h/state.image.height)*.92;return{x:(w-state.image.width*s)/2,y:(h-state.image.height*s)/2,w:state.image.width*s,h:state.image.height*s};}
function imageRect(w,h,editor){const r=baseRect(w,h);if(!editor)return r;const cx=w/2,cy=h/2;return{x:cx+(r.x-cx)*state.view.zoom+state.view.panX,y:cy+(r.y-cy)*state.view.zoom+state.view.panY,w:r.w*state.view.zoom,h:r.h*state.view.zoom};}
function zoomAt(f){state.view.zoom=clamp(state.view.zoom*f,.5,4.5);updateZoomUi();}
function updateZoomUi(){document.getElementById("zoomVal").textContent=Math.round(state.view.zoom*100)+"%";document.getElementById("zoomRange").value=Math.round(state.view.zoom*100);}
function placePoint(e){if(!state.image)return;const d=canvas.getBoundingClientRect(),r=imageRect(d.width,d.height,true);state.points[state.tool]={x:clamp((e.clientX-d.left-r.x)/r.w,0,1),y:clamp((e.clientY-d.top-r.y)/r.h,0,1)};}

function draw(g,w,h,editor){
  g.clearRect(0,0,w,h);
  if(!state.image)return;
  const c=state.controls,r=imageRect(w,h,editor),m=state.motion?1:0;
  const breath=Math.sin(state.t*.035)*c.breath*m;
  const sway=Math.sin(state.t*.022)*c.sway*m;
  const tilt=Math.sin(state.t*.018)*c.tilt*.28*m;
  const yManual=state.manual.y*18*m;

  g.save();
  g.translate(w/2+sway,h/2+breath+yManual);
  g.rotate(tilt*Math.PI/180);
  g.translate(-w/2,-h/2);

  if(c.meshEnabled)drawSmoothDeform(g,r);
  else g.drawImage(state.image,r.x,r.y,r.w,r.h);

  drawFaceOverlays(g,r);
  g.restore();

  if(editor)drawPoints(g,r);
}

function drawSmoothDeform(g,r){
  const img=state.image,c=state.controls;
  const strips=Math.max(18,Math.min(90,Math.floor(c.meshDensity)));
  const face=state.points.face||{x:.5,y:.32},chin=state.points.chin||{x:.5,y:.49},hair=state.points.hair||{x:.5,y:.20};
  const fx=r.x+face.x*r.w;
  const cr=c.faceRadius*(r.w/900);
  const yaw=state.smooth.yaw;
  const sw=img.width/strips;
  for(let i=0;i<strips;i++){
    const sx=i*sw;
    const nx=(i+.5)/strips;
    const x=r.x+nx*r.w;
    const dx=x-fx;
    const side=dx/cr;
    const distX=Math.abs(dx)/cr;
    let faceInf=clamp(1-distX,0,1);
    faceInf=faceInf*faceInf;
    const power=c.meshPower*yaw;
    const cheek=power*faceInf*(1-Math.abs(side)*.24);
    const perspective=1-Math.abs(yaw)*0.045*faceInf;
    const destX=r.x+(sx/img.width)*r.w + cheek*.42;
    const destW=(r.w/strips+1.4)*perspective;
    g.drawImage(img,sx,0,sw,img.height,destX,r.y,destW,r.h);
  }
}

function drawFaceOverlays(g,r){
  const c=state.controls;
  const mouth=state.points.mouth;
  const mouthOpen=state.smooth.mouth;
  if(mouth&&mouthOpen>.01){
    const x=r.x+mouth.x*r.w,y=r.y+mouth.y*r.h;
    const o=ease(mouthOpen);
    const wide=c.mouthWide*(r.w/900);
    const open=c.mouthAmount*(r.w/900)*o;
    const yawShift=state.smooth.yaw*c.meshPower*.16;
    g.save();
    g.globalAlpha=.88*o;
    g.fillStyle="rgba(10,2,12,.9)";
    g.beginPath();
    const rx=wide*(.70+.30*(1-o));
    const ry=5*(r.w/900)+open*.45;
    g.ellipse(x+yawShift,y+open*.12,rx,ry,0,0,Math.PI*2);
    g.fill();
    g.globalAlpha=.22*o;
    g.fillStyle="rgba(255,255,255,.85)";
    g.beginPath();
    g.ellipse(x+yawShift,y+open*.38,rx*.42,Math.max(1,ry*.12),0,0,Math.PI*2);
    g.fill();
    g.restore();
  }

  const b=state.smooth.blink;
  if(b>.01){
    ["leftEye","rightEye"].forEach(k=>{
      const p=state.points[k];if(!p)return;
      const x=r.x+p.x*r.w+state.smooth.yaw*c.meshPower*.10;
      const y=r.y+p.y*r.h;
      const close=ease(b);
      const w=72*(r.w/900),h=(7+c.blinkAmount*.56)*(r.w/900)*close;
      g.save();
      g.globalAlpha=.93*close;
      g.fillStyle="rgba(12,10,18,.9)";
      roundRect(g,x-w/2,y-h/2,w,h,999);
      g.fill();
      g.globalAlpha=.50*close;
      g.strokeStyle="rgba(255,220,230,.75)";
      g.lineWidth=2.5*(r.w/900);
      g.beginPath();
      g.moveTo(x-w*.38,y);
      g.quadraticCurveTo(x,y+h*.50,x+w*.38,y);
      g.stroke();
      g.restore();
    });
  }

  const ew=c.eyeWander*(r.w/900);
  if(ew>0 && b<.2){
    const ex=state.smooth.eyeX*ew,ey=state.smooth.eyeY*ew*.45;
    ["leftEye","rightEye"].forEach(k=>{
      const p=state.points[k];if(!p)return;
      const x=r.x+p.x*r.w+ex,y=r.y+p.y*r.h+ey;
      g.save();
      g.globalAlpha=.35;
      g.fillStyle="rgba(126,231,255,.75)";
      g.beginPath();g.arc(x+8*(r.w/900),y-9*(r.w/900),4*(r.w/900),0,Math.PI*2);g.fill();
      g.restore();
    });
  }
}

function drawPoints(g,r){
  Object.entries(state.points).forEach(([k,p])=>{
    if(!p)return;
    const x=r.x+p.x*r.w,y=r.y+p.y*r.h,sel=k===state.tool,rad=sel?16:12;
    g.save();g.fillStyle=colors[k]||"#fff";g.strokeStyle="rgba(0,0,0,.75)";g.lineWidth=3;
    g.beginPath();g.arc(x,y,rad,0,Math.PI*2);g.fill();g.stroke();
    if(sel){g.strokeStyle="rgba(126,231,255,.9)";g.beginPath();g.arc(x,y,rad+8,0,Math.PI*2);g.stroke();g.beginPath();g.moveTo(x-28,y);g.lineTo(x+28,y);g.moveTo(x,y-28);g.lineTo(x,y+28);g.stroke();}
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
    document.getElementById("micBtn").textContent="マイク口パク ON";
  }catch(e){alert("マイク権限を確認してください");}
}
function stopMic(){
  if(state.mic.stream)state.mic.stream.getTracks().forEach(t=>t.stop());
  if(state.mic.audioCtx)state.mic.audioCtx.close().catch(()=>{});
  state.mic={enabled:false,stream:null,audioCtx:null,analyser:null,data:null,level:0};
  document.getElementById("micBtn").textContent="マイク口パク OFF";
}
function updateMic(){
  if(!state.mic.enabled||!state.mic.analyser){state.mic.level*=.88;return;}
  state.mic.analyser.getByteTimeDomainData(state.mic.data);
  let sum=0;
  for(const b of state.mic.data){const v=(b-128)/128;sum+=v*v;}
  const rms=Math.sqrt(sum/state.mic.data.length);
  state.mic.level=state.mic.level*.62+clamp(rms*state.controls.micGain*4.8,0,1)*.38;
}

function triggerBlink(manual=false){
  state.manual.blinkBoost=1.25;
  if(manual)state.doubleBlink=false;
}
function scheduleBlink(){
  state.nextBlink=performance.now()+2200+Math.random()*4200;
  state.doubleBlink=Math.random()<.18;
}
function updateMotion(now){
  const c=state.controls;
  let targetYaw=c.yaw/100;
  if(state.autoYaw)targetYaw=Math.sin(state.t*.024)*.75;
  if(state.cameraOn)targetYaw=state.track.yaw;
  targetYaw+=state.manual.yawKey*.85;
  state.smooth.yaw=lerp(state.smooth.yaw,clamp(targetYaw,-1,1),.10);

  let targetMouth=Math.max(state.mic.level,state.manual.talking);
  if(state.cameraOn)targetMouth=Math.max(targetMouth,state.track.mouth);
  state.smooth.mouth=lerp(state.smooth.mouth,targetMouth,.32);
  state.manual.talking*=.82;

  let targetBlink=state.manual.blinkBoost;
  if(state.cameraOn)targetBlink=Math.max(targetBlink,state.track.blink);
  if(now>state.nextBlink && !state.cameraOn){
    triggerBlink();
    if(state.doubleBlink)state.nextBlink=now+150;
    else scheduleBlink();
    state.doubleBlink=false;
  }
  state.smooth.blink=lerp(state.smooth.blink,targetBlink,.45);
  state.manual.blinkBoost*=.56;

  state.smooth.eyeX=lerp(state.smooth.eyeX,Math.sin(state.t*.019)+Math.sin(state.t*.007)*.5,.03);
  state.smooth.eyeY=lerp(state.smooth.eyeY,Math.sin(state.t*.013),.03);
}

function openObs(q){state.obs=true;document.getElementById("obsOverlay").classList.remove("hidden");if(q)document.body.classList.add("obs-mode");fitObs();}
function closeObs(){state.obs=false;document.getElementById("obsOverlay").classList.add("hidden");}
function settings(){return{app:"LivePic",version:"0.8",imageName:state.imageName,imageDataUrl:state.imageDataUrl,points:state.points,controls:state.controls};}
function applySettings(d){
  if(d.points)state.points=d.points;
  if(d.controls)Object.assign(state.controls,d.controls);
  Object.entries(state.controls).forEach(([k,v])=>{const el=document.getElementById(k);if(!el)return;if(el.type==="checkbox")el.checked=!!v;else el.value=v;});
  updateLabels();
  if(d.imageDataUrl)loadImage(d.imageDataUrl,d.imageName||"restored",false);
}
function saveLocal(){try{localStorage.setItem("livepic_v08",JSON.stringify(settings()));}catch(e){}}
function restoreLocal(show){try{const raw=localStorage.getItem("livepic_v08");if(!raw){if(show)alert("保存がありません");return false;}applySettings(JSON.parse(raw));if(show)alert("復元しました");return true;}catch(e){if(show)alert("復元失敗");return false;}}

function updateLabels(){
  Object.keys(state.controls).forEach(id=>{
    const el=document.getElementById(id);if(el){if(el.type==="checkbox")el.checked=!!state.controls[id];else el.value=state.controls[id];}
    const lab=document.getElementById(id+"Val");if(lab){let v=state.controls[id];if(id==="micGain"||id==="mouthSensitivity"||id==="blinkSensitivity")v=Number(v).toFixed(1);lab.textContent=v;}
  });
}
function loop(now){
  const delta=now-state.lastFrame;state.lastFrame=now;state.fps=state.fps*.9+(1000/Math.max(delta,1))*.1;document.getElementById("fps").textContent="FPS: "+Math.round(state.fps);
  state.t++;updateMic();updateMotion(now);
  const r=canvas.getBoundingClientRect();draw(ctx,r.width,r.height,true);
  if(state.obs||document.body.classList.contains("obs-mode"))draw(obsCtx,innerWidth,innerHeight,false);
  requestAnimationFrame(loop);
}

function clamp(n,min,max){return Math.max(min,Math.min(max,n));}
function lerp(a,b,t){return a+(b-a)*t;}
function ease(x){return 1-Math.pow(1-x,3);}
function roundRect(g,x,y,w,h,r){g.beginPath();g.moveTo(x+r,y);g.arcTo(x+w,y,x+w,y+h,r);g.arcTo(x+w,y+h,x,y+h,r);g.arcTo(x,y+h,x,y,r);g.arcTo(x,y,x+w,y,r);g.closePath();}
