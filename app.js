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
  tool:"face",motion:true,obs:false,autoYaw:false,debug:true,cameraOn:false,faceMesh:null,camera:null,
  points:{face:null,leftEye:null,rightEye:null,mouth:null,chin:null,neck:null,body:null,hair:null},
  controls:{
    headLayer:true,bodyFixed:true,faceMask:true,edgeCover:true,
    headMove:42,yawBoost:2.4,headLag:0.13,neckLag:0.55,hairLag:0.75,
    breath:12,bodySway:3,headIdle:7,
    mouthSensitivity:7.2,mouthAmount:88,mouthWide:82,
    blinkSensitivity:6.2,blinkAmount:88,eyeWander:12,
    faceSquash:0.16,faceRadius:245,trackingSpeed:0.22
  },
  track:{yaw:0,mouth:0,blink:0,hasFace:false},
  smooth:{yaw:0,mouth:0,blink:0,eyeX:0,eyeY:0,headX:0,headY:0,neckX:0,hairX:0,bodyBreath:0},
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
  document.getElementById("iriamPresetBtn").onclick=applyIriamPreset;
  document.querySelectorAll(".tool").forEach(b=>b.onclick=()=>selectTool(b));
  document.getElementById("autoPointBtn").onclick=autoPoints;
  document.getElementById("toggleMotionBtn").onclick=()=>{state.motion=!state.motion;document.getElementById("toggleMotionBtn").textContent=state.motion?"モーション ON":"モーション OFF";};
  document.getElementById("cameraBtn").onclick=toggleCameraTracking;
  document.getElementById("micBtn").onclick=toggleMic;
  document.getElementById("blinkBtn").onclick=()=>triggerBlink(true);
  document.getElementById("talkBtn").onclick=()=>state.manual.talking=1.2;
  document.getElementById("autoYawBtn").onclick=()=>{state.autoYaw=!state.autoYaw;document.getElementById("autoYawBtn").textContent=state.autoYaw?"顔向き自動 ON":"顔向き自動 OFF";};
  document.getElementById("debugBtn").onclick=()=>{state.debug=!state.debug;document.getElementById("debugBtn").textContent=state.debug?"ガイド ON":"ガイド OFF";};
  document.getElementById("resetPoseBtn").onclick=()=>{state.track.yaw=0;state.smooth.yaw=0;state.manual.yawKey=0;};
  document.getElementById("openObsBtn").onclick=()=>openObs(false);
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
  canvas.addEventListener("wheel",e=>{e.preventDefault();state.view.zoom=clamp(state.view.zoom*(e.deltaY<0?1.12:.88),.5,4.5);updateZoomUi();},{passive:false});
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
    if(e.code==="Space"){e.preventDefault();state.manual.talking=1.2;}
    if(e.code==="KeyB")triggerBlink(true);
  });
  window.addEventListener("keyup",e=>{
    if(["KeyA","KeyD"].includes(e.code))state.manual.yawKey=0;
    if(["KeyW","KeyS"].includes(e.code))state.manual.y=0;
  });
}

function applyIriamPreset(){
  Object.assign(state.controls,{
    headLayer:true,bodyFixed:true,faceMask:true,edgeCover:true,
    headMove:42,yawBoost:2.4,headLag:0.13,neckLag:0.55,hairLag:0.75,
    breath:12,bodySway:3,headIdle:7,
    mouthSensitivity:7.2,mouthAmount:88,mouthWide:82,
    blinkSensitivity:6.2,blinkAmount:88,eyeWander:12,
    faceSquash:0.16,faceRadius:245,trackingSpeed:0.22
  });
  updateLabels();
  alert("IRIAM寄せプリセットを適用しました");
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
  if(typeof FaceMesh==="undefined")throw new Error("MediaPipe未読込。GitHub Pagesで試してください。");
  const fm=new FaceMesh({locateFile:file=>`https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`});
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
    const result=await new Promise(async(resolve,reject)=>{
      let done=false;
      fm.onResults(res=>{if(done)return;done=true;resolve(res);});
      const temp=document.createElement("canvas");
      temp.width=state.image.naturalWidth||state.image.width;
      temp.height=state.image.naturalHeight||state.image.height;
      temp.getContext("2d").drawImage(state.image,0,0,temp.width,temp.height);
      try{await fm.send({image:temp});}catch(e){reject(e);}
      setTimeout(()=>{if(!done)reject(new Error("顔を検出できませんでした"));},3500);
    });
    if(!result.multiFaceLandmarks||!result.multiFaceLandmarks[0])throw new Error("顔を検出できませんでした");
    applyLandmarksToImagePoints(result.multiFaceLandmarks[0]);
    status.textContent="顔認識OK。ポイント自動配置済み。";
    saveLocal();
  }catch(e){status.textContent="顔認識失敗: "+e.message;}
}
function applyLandmarksToImagePoints(lm){
  const avg=ids=>({x:ids.reduce((a,i)=>a+lm[i].x,0)/ids.length,y:ids.reduce((a,i)=>a+lm[i].y,0)/ids.length});
  const leftEye=avg([33,133,159,145]),rightEye=avg([263,362,386,374]),mouth=avg([13,14,78,308]);
  const chin=lm[152]||{x:.5,y:.55},nose=lm[1]||{x:.5,y:.35},forehead=lm[10]||{x:nose.x,y:nose.y-.18};
  state.points.leftEye=leftEye;state.points.rightEye=rightEye;state.points.mouth=mouth;state.points.chin={x:chin.x,y:chin.y};
  state.points.face={x:nose.x,y:(leftEye.y+rightEye.y+mouth.y)/3};
  state.points.neck={x:chin.x,y:clamp(chin.y+.07,0,1)};state.points.body={x:chin.x,y:clamp(chin.y+.23,0,1)};
  state.points.hair={x:forehead.x,y:clamp(forehead.y-.04,0,1)};
}

async function toggleCameraTracking(){
  if(state.cameraOn){stopCameraTracking();return;}
  try{
    const fm=await getFaceMesh();
    fm.onResults(onCameraResults);
    state.camera=new Camera(video,{onFrame:async()=>{await fm.send({image:video});},width:640,height:480});
    await state.camera.start();
    state.cameraOn=true;
    document.getElementById("cameraBtn").textContent="顔トラッキング ON";
    document.getElementById("trackingStatus").textContent="Tracking: 起動中";
  }catch(e){alert("顔トラッキング開始失敗: "+e.message);}
}
function stopCameraTracking(){
  state.cameraOn=false;
  if(state.camera&&state.camera.stop)state.camera.stop();
  if(video.srcObject)video.srcObject.getTracks().forEach(t=>t.stop());
  document.getElementById("cameraBtn").textContent="顔トラッキング OFF";
  document.getElementById("trackingStatus").textContent="Tracking: OFF";
}
function onCameraResults(res){
  if(!res.multiFaceLandmarks||!res.multiFaceLandmarks[0]){
    state.track.hasFace=false;document.getElementById("trackingStatus").textContent="Tracking: 顔なし";return;
  }
  const lm=res.multiFaceLandmarks[0];
  const dist=(a,b)=>Math.hypot(lm[a].x-lm[b].x,lm[a].y-lm[b].y);
  const leftEyeOpen=dist(159,145)/(dist(33,133)+.0001);
  const rightEyeOpen=dist(386,374)/(dist(263,362)+.0001);
  const eyeOpen=(leftEyeOpen+rightEyeOpen)/2;
  const mouthRatio=dist(13,14)/(dist(78,308)+.0001);
  const nose=lm[1],left=lm[234],right=lm[454];
  const centerX=(left.x+right.x)/2,faceW=Math.abs(right.x-left.x)+.0001;
  const rawYaw=(nose.x-centerX)/faceW;
  state.track.yaw=clamp(rawYaw*5.2*state.controls.yawBoost,-1,1);
  state.track.mouth=clamp((mouthRatio-.045)*state.controls.mouthSensitivity,0,1);
  state.track.blink=clamp((.185-eyeOpen)*state.controls.blinkSensitivity,0,1);
  state.track.hasFace=true;
  document.getElementById("trackingStatus").textContent="Tracking: ON / 顔あり";
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
  const r=imageRect(w,h,editor),c=state.controls,m=state.motion?1:0;
  const p=getPixelPoints(r);
  const breath=Math.sin(state.t*.035)*c.breath*m;
  const bodySway=Math.sin(state.t*.018)*c.bodySway*m;

  // body/base: fixed, but chest breathing uses tiny scale around body center instead of flying up.
  g.save();
  if(!c.bodyFixed){
    g.translate(bodySway, breath*.12);
  }
  const bodyCx=p.body.x, bodyCy=p.body.y;
  const chestScale=1+(breath*.0016);
  g.translate(bodyCx,bodyCy);
  g.scale(1+Math.abs(chestScale-1)*.25,chestScale);
  g.translate(-bodyCx,-bodyCy);
  g.drawImage(state.image,r.x,r.y,r.w,r.h);
  g.restore();

  if(c.headLayer){
    drawHeadLayer(g,r,p);
  }else{
    drawLegacyFace(g,r,p);
  }

  drawExpressions(g,r,p);
  if(state.debug&&editor)drawGuides(g,r,p);
  if(editor)drawPoints(g,r);
}

function getPixelPoints(r){
  const def={face:{x:.5,y:.32},leftEye:{x:.405,y:.30},rightEye:{x:.595,y:.30},mouth:{x:.5,y:.405},chin:{x:.5,y:.49},neck:{x:.5,y:.54},body:{x:.5,y:.70},hair:{x:.5,y:.20}};
  const out={};
  for(const k of Object.keys(def)){
    const q=state.points[k]||def[k];
    out[k]={x:r.x+q.x*r.w,y:r.y+q.y*r.h,nx:q.x,ny:q.y};
  }
  return out;
}

function drawHeadLayer(g,r,p){
  const c=state.controls;
  const yaw=state.smooth.yaw;
  const headR=c.faceRadius*(r.w/900);
  const faceW=headR*1.25, faceH=headR*1.58;
  const cx=p.face.x, cy=p.face.y+headR*.10;
  const moveX=state.smooth.headX;
  const moveY=state.smooth.headY;
  const neckX=state.smooth.neckX;
  const hairX=state.smooth.hairX;

  // cover old head area a bit with enlarged blurred-like redraw to reduce black gaps.
  if(c.edgeCover){
    g.save();
    g.globalAlpha=.52;
    g.translate(cx+moveX*.28,cy+moveY*.15);
    g.scale(1.05,1.04);
    g.translate(-(cx),-(cy));
    clipEllipse(g,cx,cy,faceW*1.08,faceH*1.08);
    g.drawImage(state.image,r.x,r.y,r.w,r.h);
    g.restore();
  }

  // neck delayed patch
  g.save();
  g.globalAlpha=.78;
  const neckR=headR*.52;
  clipEllipse(g,p.neck.x+neckX*.35,p.neck.y,neckR*.70,neckR*.62);
  g.translate(neckX*.25,0);
  g.drawImage(state.image,r.x,r.y,r.w,r.h);
  g.restore();

  // head masked layer: pseudo separate head with yaw squash/shift
  g.save();
  const squash=1-Math.abs(yaw)*c.faceSquash;
  const stretch=1+Math.abs(yaw)*c.faceSquash*.28;
  const roll=yaw*.035;
  clipEllipse(g,cx+moveX,cy+moveY,faceW,faceH);
  g.translate(cx+moveX,cy+moveY);
  g.rotate(roll);
  g.scale(squash,stretch);
  g.translate(-(cx),-(cy));
  // opposite side reveal / cheek shift
  g.translate(yaw*c.headMove*(r.w/900)*.35,0);
  g.drawImage(state.image,r.x,r.y,r.w,r.h);
  g.restore();

  // hair delayed layer at top, gives IRIAM-ish lag
  g.save();
  g.globalAlpha=.55;
  const hairR=headR*.95;
  clipEllipse(g,p.hair.x+hairX*.38,p.hair.y+headR*.38,hairR*1.05,hairR*.95);
  g.translate(hairX*.45,state.smooth.headY*.25);
  g.drawImage(state.image,r.x,r.y,r.w,r.h);
  g.restore();

  // cheek shadow/highlight for fake 3D
  if(Math.abs(yaw)>.05){
    g.save();
    clipEllipse(g,cx+moveX,cy+moveY,faceW,faceH);
    const grad=g.createLinearGradient(cx-faceW,cy,cx+faceW,cy);
    if(yaw>0){
      grad.addColorStop(0,"rgba(0,0,0,.20)");
      grad.addColorStop(.55,"rgba(255,255,255,.04)");
      grad.addColorStop(1,"rgba(255,255,255,.16)");
    }else{
      grad.addColorStop(0,"rgba(255,255,255,.16)");
      grad.addColorStop(.45,"rgba(255,255,255,.04)");
      grad.addColorStop(1,"rgba(0,0,0,.20)");
    }
    g.fillStyle=grad;
    g.fillRect(cx-faceW,cy-faceH,faceW*2,faceH*2);
    g.restore();
  }
}

function drawLegacyFace(g,r,p){
  // fallback: just redraw image
  g.drawImage(state.image,r.x,r.y,r.w,r.h);
}

function drawExpressions(g,r,p){
  const c=state.controls;
  const yaw=state.smooth.yaw;
  const faceScale=r.w/900;
  const headX=state.smooth.headX, headY=state.smooth.headY;
  const exprX=headX+yaw*c.headMove*faceScale*.22;
  const exprY=headY;

  const mouthOpen=state.smooth.mouth;
  if(mouthOpen>.01){
    const o=ease(mouthOpen);
    const x=p.mouth.x+exprX;
    const y=p.mouth.y+exprY+o*c.mouthAmount*faceScale*.04;
    const rx=c.mouthWide*faceScale*(.55+.45*(1-o));
    const ry=(5+c.mouthAmount*.50*o)*faceScale;
    g.save();
    g.globalAlpha=.94*o;
    g.fillStyle="rgba(8,2,10,.92)";
    g.beginPath();g.ellipse(x,y,rx,ry,0,0,Math.PI*2);g.fill();
    g.globalAlpha=.18*o;
    g.fillStyle="rgba(255,255,255,.9)";
    g.beginPath();g.ellipse(x,y+ry*.32,rx*.38,Math.max(1,ry*.12),0,0,Math.PI*2);g.fill();
    g.restore();
  }

  const b=state.smooth.blink;
  if(b>.01){
    ["leftEye","rightEye"].forEach(k=>{
      const eye=p[k];
      const x=eye.x+exprX+yaw*c.headMove*faceScale*.08;
      const y=eye.y+exprY;
      const close=ease(b);
      const w=78*faceScale, h=(8+c.blinkAmount*.62)*faceScale*close;
      g.save();
      g.globalAlpha=.95*close;
      g.fillStyle="rgba(11,9,16,.92)";
      roundRect(g,x-w/2,y-h/2,w,h,999);g.fill();
      g.globalAlpha=.55*close;
      g.strokeStyle="rgba(255,220,230,.78)";
      g.lineWidth=2.5*faceScale;
      g.beginPath();g.moveTo(x-w*.38,y);g.quadraticCurveTo(x,y+h*.56,x+w*.38,y);g.stroke();
      g.restore();
    });
  }

  // eye sparkle gaze
  if(c.eyeWander>0 && b<.2){
    const ex=state.smooth.eyeX*c.eyeWander*faceScale;
    const ey=state.smooth.eyeY*c.eyeWander*faceScale*.45;
    ["leftEye","rightEye"].forEach(k=>{
      const eye=p[k];
      const x=eye.x+exprX+ex, y=eye.y+exprY+ey;
      g.save();g.globalAlpha=.42;g.fillStyle="rgba(126,231,255,.82)";
      g.beginPath();g.arc(x+8*faceScale,y-9*faceScale,4.3*faceScale,0,Math.PI*2);g.fill();
      g.restore();
    });
  }
}

function clipEllipse(g,cx,cy,rx,ry){
  g.beginPath();
  g.ellipse(cx,cy,rx,ry,0,0,Math.PI*2);
  g.clip();
}

function drawGuides(g,r,p){
  const c=state.controls;
  const headR=c.faceRadius*(r.w/900);
  g.save();
  g.strokeStyle="rgba(126,231,255,.45)";
  g.lineWidth=2;
  g.beginPath();g.ellipse(p.face.x+state.smooth.headX,p.face.y+headR*.10+state.smooth.headY,headR*1.25,headR*1.58,0,0,Math.PI*2);g.stroke();
  g.strokeStyle="rgba(255,255,255,.25)";
  g.beginPath();g.moveTo(p.neck.x-30,p.neck.y);g.lineTo(p.neck.x+30,p.neck.y);g.stroke();
  g.restore();
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
  state.mic.level=state.mic.level*.62+clamp(rms*state.controls.mouthSensitivity*.75,0,1)*.38;
}

function triggerBlink(manual=false){
  state.manual.blinkBoost=1.35;
  if(manual)state.doubleBlink=false;
}
function scheduleBlink(){
  state.nextBlink=performance.now()+2200+Math.random()*4200;
  state.doubleBlink=Math.random()<.18;
}
function updateMotion(now){
  const c=state.controls,m=state.motion?1:0;
  let targetYaw=0;
  if(state.autoYaw)targetYaw=Math.sin(state.t*.026)*.72;
  if(state.cameraOn)targetYaw=state.track.yaw;
  targetYaw+=state.manual.yawKey*.9;
  state.smooth.yaw=lerp(state.smooth.yaw,clamp(targetYaw,-1,1),c.trackingSpeed);

  const faceScale=1; // neutral scaler for timing
  const headTargetX=state.smooth.yaw*c.headMove*m;
  const idleY=Math.sin(state.t*.021)*c.headIdle*m;
  state.smooth.headX=lerp(state.smooth.headX,headTargetX,c.headLag);
  state.smooth.headY=lerp(state.smooth.headY,idleY,c.headLag*.7);
  state.smooth.neckX=lerp(state.smooth.neckX,headTargetX*.45,c.headLag*(1-c.neckLag*.65));
  state.smooth.hairX=lerp(state.smooth.hairX,-headTargetX*.55,c.headLag*(1-c.hairLag*.72));

  let targetMouth=Math.max(state.mic.level,state.manual.talking);
  if(state.cameraOn)targetMouth=Math.max(targetMouth,state.track.mouth);
  state.smooth.mouth=lerp(state.smooth.mouth,targetMouth,.36);
  state.manual.talking*=.80;

  let targetBlink=state.manual.blinkBoost;
  if(state.cameraOn)targetBlink=Math.max(targetBlink,state.track.blink);
  if(now>state.nextBlink && !state.cameraOn){
    triggerBlink();
    if(state.doubleBlink)state.nextBlink=now+150;
    else scheduleBlink();
    state.doubleBlink=false;
  }
  state.smooth.blink=lerp(state.smooth.blink,targetBlink,.52);
  state.manual.blinkBoost*=.55;

  state.smooth.eyeX=lerp(state.smooth.eyeX,Math.sin(state.t*.019)+Math.sin(state.t*.007)*.5-state.smooth.yaw*.55,.035);
  state.smooth.eyeY=lerp(state.smooth.eyeY,Math.sin(state.t*.013),.03);
  updateMeters();
}
function updateMeters(){
  const yaw=Math.round(Math.abs(state.smooth.yaw)*100),mouth=Math.round(clamp(state.smooth.mouth,0,1)*100),blink=Math.round(clamp(state.smooth.blink,0,1)*100);
  [["Yaw",yaw],["Mouth",mouth],["Blink",blink]].forEach(([id,v])=>{
    const t=document.getElementById("meter"+id),b=document.getElementById("bar"+id);
    if(t)t.textContent=v+"%";if(b)b.style.width=v+"%";
  });
}

function openObs(q){state.obs=true;document.getElementById("obsOverlay").classList.remove("hidden");if(q)document.body.classList.add("obs-mode");fitObs();}
function closeObs(){state.obs=false;document.getElementById("obsOverlay").classList.add("hidden");}
function settings(){return{app:"LivePic",version:"1.0",imageName:state.imageName,imageDataUrl:state.imageDataUrl,points:state.points,controls:state.controls};}
function applySettings(d){
  if(d.points)state.points=d.points;
  if(d.controls)Object.assign(state.controls,d.controls);
  updateLabels();
  if(d.imageDataUrl)loadImage(d.imageDataUrl,d.imageName||"restored",false);
}
function saveLocal(){try{localStorage.setItem("livepic_v10",JSON.stringify(settings()));}catch(e){}}
function restoreLocal(show){try{const raw=localStorage.getItem("livepic_v10");if(!raw){if(show)alert("保存がありません");return false;}applySettings(JSON.parse(raw));if(show)alert("復元しました");return true;}catch(e){if(show)alert("復元失敗");return false;}}

function updateLabels(){
  Object.keys(state.controls).forEach(id=>{
    const el=document.getElementById(id);if(el){if(el.type==="checkbox")el.checked=!!state.controls[id];else el.value=state.controls[id];}
    const lab=document.getElementById(id+"Val");if(lab){let v=state.controls[id];if(["yawBoost","headLag","neckLag","hairLag","mouthSensitivity","blinkSensitivity","faceSquash","trackingSpeed"].includes(id))v=Number(v).toFixed(2);lab.textContent=v;}
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
