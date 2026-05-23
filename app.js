const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const obsCanvas = document.getElementById("obsCanvas");
const obsCtx = obsCanvas.getContext("2d");

const state = {
  image:null, imageDataUrl:"", imageName:"",
  tool:"face", motion:true, obs:false, autoYaw:false,
  points:{face:null,leftEye:null,rightEye:null,mouth:null,chin:null,neck:null,body:null,hair:null},
  controls:{breath:16,sway:10,tilt:6,mouthAmount:24,blinkAmount:16,micGain:3.0,yaw:0,meshPower:32,faceRadius:210,meshEnabled:true},
  manual:{tilt:0,y:0,talking:0,blink:0,yawKey:0},
  view:{zoom:1,panX:0,panY:0,dragging:false,lastX:0,lastY:0,dragMoved:false},
  mic:{enabled:false,stream:null,audioCtx:null,analyser:null,data:null,level:0},
  t:0,lastFrame:performance.now(),fps:0,nextBlink:0
};
const pointLabels={face:"顔中心",leftEye:"左目",rightEye:"右目",mouth:"口",chin:"あご",neck:"首",body:"体中心",hair:"髪"};
const pointColors={face:"#ffe66d",leftEye:"#ff66c4",rightEye:"#ff66c4",mouth:"#ff9f43",chin:"#ff7675",neck:"#55efc4",body:"#74b9ff",hair:"#a29bfe"};

const sampleSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 900 1200">
<defs><linearGradient id="hair" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#2b2443"/><stop offset="100%" stop-color="#141827"/></linearGradient><linearGradient id="cloth" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#fff"/><stop offset="100%" stop-color="#dfe7ff"/></linearGradient></defs>
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
  fitCanvas(); fitObs(); setNextBlink(); updateAllLabels(); updateZoomUi();
  const restored = restoreLocal(false);
  if(!restored) loadSample();
  if(new URLSearchParams(location.search).get("obs")==="1") openObs(true);
  requestAnimationFrame(loop);
}

function wire(){
  window.addEventListener("resize",()=>{fitCanvas();fitObs();});
  document.getElementById("fileInput").addEventListener("change",e=>{const f=e.target.files[0]; if(f) loadFile(f);});
  document.getElementById("sampleBtn").onclick=loadSample;
  document.querySelectorAll(".tool").forEach(btn=>btn.onclick=()=>selectTool(btn));
  document.getElementById("autoPointBtn").onclick=autoPoints;
  document.getElementById("toggleMotionBtn").onclick=()=>{state.motion=!state.motion;document.getElementById("toggleMotionBtn").textContent=state.motion?"モーション ON":"モーション OFF";};
  document.getElementById("blinkBtn").onclick=()=>state.manual.blink=1;
  document.getElementById("talkBtn").onclick=()=>state.manual.talking=1;
  document.getElementById("micBtn").onclick=toggleMic;
  document.getElementById("openObsBtn").onclick=()=>openObs(false);
  document.getElementById("closeObs").onclick=closeObs;
  document.getElementById("saveLocalBtn").onclick=()=>{saveLocal(); alert("保存しました");};
  document.getElementById("loadLocalBtn").onclick=()=>restoreLocal(true);
  document.getElementById("exportBtn").onclick=()=>document.getElementById("settingsBox").value=JSON.stringify(settings(),null,2);
  document.getElementById("importBtn").onclick=()=>{try{applySettings(JSON.parse(document.getElementById("settingsBox").value));saveLocal();alert("読み込みました");}catch(e){alert("JSONが読めません");}};
  document.getElementById("autoYawBtn").onclick=()=>{state.autoYaw=!state.autoYaw;document.getElementById("autoYawBtn").textContent=state.autoYaw?"顔向き自動テスト ON":"顔向き自動テスト OFF";};

  ["breath","sway","tilt","mouthAmount","blinkAmount","micGain","yaw","meshPower","faceRadius"].forEach(id=>{
    document.getElementById(id).addEventListener("input",e=>{state.controls[id]=Number(e.target.value);updateAllLabels();});
  });
  document.getElementById("meshEnabled").addEventListener("change",e=>{state.controls.meshEnabled=e.target.checked;});

  const stage=document.getElementById("stage");
  canvas.addEventListener("mousedown",e=>{state.view.dragging=true;state.view.lastX=e.clientX;state.view.lastY=e.clientY;state.view.dragMoved=false;});
  window.addEventListener("mousemove",e=>{
    if(!state.view.dragging)return;
    const dx=e.clientX-state.view.lastX, dy=e.clientY-state.view.lastY;
    if(Math.abs(dx)+Math.abs(dy)>3) state.view.dragMoved=true;
    state.view.panX+=dx; state.view.panY+=dy; state.view.lastX=e.clientX; state.view.lastY=e.clientY;
  });
  window.addEventListener("mouseup",()=>state.view.dragging=false);
  canvas.addEventListener("click",e=>{if(state.view.dragMoved){state.view.dragMoved=false;return;} placePoint(e);});
  canvas.addEventListener("wheel",e=>{e.preventDefault(); zoomAt(e.deltaY<0?1.12:0.88,e.clientX,e.clientY);},{passive:false});
  document.getElementById("zoomRange").addEventListener("input",e=>{state.view.zoom=Number(e.target.value)/100;updateZoomUi();});
  document.getElementById("zoomInBtn").onclick=()=>{state.view.zoom=clamp(state.view.zoom*1.2,.5,4);updateZoomUi();};
  document.getElementById("zoomOutBtn").onclick=()=>{state.view.zoom=clamp(state.view.zoom/1.2,.5,4);updateZoomUi();};
  document.getElementById("zoomResetBtn").onclick=()=>{state.view.zoom=1;state.view.panX=0;state.view.panY=0;updateZoomUi();};

  window.addEventListener("keydown",e=>{
    if(e.repeat)return;
    if(e.code==="KeyA") state.manual.yawKey=-1;
    if(e.code==="KeyD") state.manual.yawKey=1;
    if(e.code==="KeyW") state.manual.y=-1;
    if(e.code==="KeyS") state.manual.y=1;
    if(e.code==="Space"){e.preventDefault();state.manual.talking=1;}
    if(e.code==="KeyB") state.manual.blink=1;
  });
  window.addEventListener("keyup",e=>{
    if(["KeyA","KeyD"].includes(e.code)) state.manual.yawKey=0;
    if(["KeyW","KeyS"].includes(e.code)) state.manual.y=0;
  });
}

function selectTool(btn){
  document.querySelectorAll(".tool").forEach(b=>b.classList.remove("active"));
  btn.classList.add("active");
  state.tool=btn.dataset.point;
  document.getElementById("currentTool").textContent="選択中: "+pointLabels[state.tool];
}
function loadFile(file){
  const r=new FileReader();
  r.onload=()=>loadImage(r.result,file.name,true);
  r.readAsDataURL(file);
}
function loadSample(){loadImage("data:image/svg+xml;charset=utf-8,"+encodeURIComponent(sampleSvg),"LivePic_sample.svg",true);}
function loadImage(dataUrl,name,auto){
  const img=new Image();
  img.onload=()=>{state.image=img;state.imageDataUrl=dataUrl;state.imageName=name;document.getElementById("fileName").textContent=name;document.getElementById("dropMessage").style.display="none";if(auto)autoPoints();saveLocal();};
  img.src=dataUrl;
}
function autoPoints(){
  state.points={face:{x:.5,y:.32},leftEye:{x:.405,y:.30},rightEye:{x:.595,y:.30},mouth:{x:.5,y:.40},chin:{x:.5,y:.49},neck:{x:.5,y:.54},body:{x:.5,y:.70},hair:{x:.5,y:.20}};
}

function fitCanvas(){
  const rect=document.getElementById("stage").getBoundingClientRect(), dpr=devicePixelRatio||1;
  canvas.width=Math.max(1,Math.floor(rect.width*dpr)); canvas.height=Math.max(1,Math.floor(rect.height*dpr));
  canvas.style.width=rect.width+"px"; canvas.style.height=rect.height+"px"; ctx.setTransform(dpr,0,0,dpr,0,0);
}
function fitObs(){const dpr=devicePixelRatio||1;obsCanvas.width=Math.floor(innerWidth*dpr);obsCanvas.height=Math.floor(innerHeight*dpr);obsCtx.setTransform(dpr,0,0,dpr,0,0);}
function baseRect(w,h){if(!state.image)return{x:0,y:0,w:0,h:0};const s=Math.min(w/state.image.width,h/state.image.height)*.92;return{x:(w-state.image.width*s)/2,y:(h-state.image.height*s)/2,w:state.image.width*s,h:state.image.height*s};}
function imageRect(w,h,editor){const r=baseRect(w,h);if(!editor)return r;const cx=w/2,cy=h/2;return{x:cx+(r.x-cx)*state.view.zoom+state.view.panX,y:cy+(r.y-cy)*state.view.zoom+state.view.panY,w:r.w*state.view.zoom,h:r.h*state.view.zoom};}
function zoomAt(factor,cx,cy){
  const old=state.view.zoom, nz=clamp(old*factor,.5,4);
  const rect=canvas.getBoundingClientRect();
  const x=cx-rect.left, y=cy-rect.top;
  state.view.panX = x - (x - state.view.panX - rect.width/2) * (nz/old) - rect.width/2;
  state.view.panY = y - (y - state.view.panY - rect.height/2) * (nz/old) - rect.height/2;
  state.view.zoom=nz; updateZoomUi();
}
function updateZoomUi(){document.getElementById("zoomVal").textContent=Math.round(state.view.zoom*100)+"%";document.getElementById("zoomRange").value=Math.round(state.view.zoom*100);}
function placePoint(e){
  if(!state.image)return;
  const dom=canvas.getBoundingClientRect(), r=imageRect(dom.width,dom.height,true);
  state.points[state.tool]={x:clamp((e.clientX-dom.left-r.x)/r.w,0,1),y:clamp((e.clientY-dom.top-r.y)/r.h,0,1)};
}

function draw(target,w,h,editor){
  target.clearRect(0,0,w,h);
  if(!state.image)return;
  const r=imageRect(w,h,editor);
  const c=state.controls, motion=state.motion?1:0;
  if(state.autoYaw)c.yaw=Math.sin(state.t*.025)*70;
  c.yaw=clamp(c.yaw + state.manual.yawKey*3,-100,100);
  document.getElementById("yaw").value=Math.round(c.yaw); updateAllLabels(false);
  const breath=Math.sin(state.t*.035)*c.breath*motion;
  const sway=Math.sin(state.t*.022)*c.sway*motion;
  const tilt=Math.sin(state.t*.018)*c.tilt*.25*motion;
  const yManual=state.manual.y*18*motion;
  const talk=Math.max(state.manual.talking,state.mic.level);
  const blink=state.manual.blink;

  target.save();
  target.translate(w/2+sway,h/2+breath+yManual);
  target.rotate(tilt*Math.PI/180);
  target.translate(-w/2,-h/2);
  if(c.meshEnabled) drawMesh(target,r,c.yaw/100,c.meshPower,c.faceRadius);
  else target.drawImage(state.image,r.x,r.y,r.w,r.h);
  drawMouthBlink(target,r,talk,blink);
  target.restore();

  if(editor)drawPoints(target,r);
}

function drawMesh(g,r,yaw,power,faceRadius){
  const img=state.image, cols=28, rows=36;
  const face=state.points.face||{x:.5,y:.32};
  const chin=state.points.chin||{x:.5,y:.49};
  const hair=state.points.hair||{x:.5,y:.20};
  const fx=r.x+face.x*r.w, fy=r.y+face.y*r.h;
  const cr=faceRadius*(r.w/900);
  const cellW=img.width/cols, cellH=img.height/rows;
  for(let j=0;j<rows;j++){
    for(let i=0;i<cols;i++){
      const sx=i*cellW, sy=j*cellH;
      const x=r.x+(i/cols)*r.w, y=r.y+(j/rows)*r.h;
      const dw=r.w/cols+1.2, dh=r.h/rows+1.2;
      const cx=x+dw/2, cy=y+dh/2;
      const dx=cx-fx, dy=cy-fy;
      const dist=Math.sqrt(dx*dx+dy*dy);
      let influence=Math.max(0,1-dist/cr);
      influence=influence*influence;
      const vertical=(cy<r.y+chin.y*r.h && cy>r.y+hair.y*r.h-80)?1:0.35;
      const side=dx/cr;
      const shiftX=yaw*power*influence*vertical*(1-Math.abs(side)*.35);
      const squash=1 - Math.abs(yaw)*0.10*influence;
      const lift=-Math.abs(yaw)*power*.16*influence*(dy/cr);
      g.drawImage(img,sx,sy,cellW,cellH,x+shiftX*0.55,y+lift,dw*squash,dh);
    }
  }
}

function drawMouthBlink(g,r,talk,blink){
  const c=state.controls, mouth=state.points.mouth;
  if(mouth&&talk>.015){
    const x=r.x+mouth.x*r.w,y=r.y+mouth.y*r.h,o=ease(clamp(talk,0,1));
    g.save();g.globalAlpha=.72*o;g.fillStyle="rgba(18,7,16,.78)";g.beginPath();g.ellipse(x,y+4*o,14+c.mouthAmount*o*.55,2.5+c.mouthAmount*o*.30,0,0,Math.PI*2);g.fill();g.restore();
  }
  if(blink>.02){
    ["leftEye","rightEye"].forEach(k=>{const p=state.points[k];if(!p)return;const x=r.x+p.x*r.w,y=r.y+p.y*r.h,cl=ease(clamp(blink,0,1));g.save();g.globalAlpha=.72*cl;g.fillStyle="rgba(15,15,25,.78)";roundRect(g,x-30,y-c.blinkAmount*.2,60,5+c.blinkAmount*.36,999);g.fill();g.restore();});
  }
}
function drawPoints(g,r){
  Object.entries(state.points).forEach(([k,p])=>{if(!p)return;const x=r.x+p.x*r.w,y=r.y+p.y*r.h,sel=k===state.tool,rad=sel?16:12;g.save();g.fillStyle=pointColors[k]||"#fff";g.strokeStyle="rgba(0,0,0,.75)";g.lineWidth=3;g.beginPath();g.arc(x,y,rad,0,Math.PI*2);g.fill();g.stroke();if(sel){g.strokeStyle="rgba(126,231,255,.9)";g.beginPath();g.arc(x,y,rad+8,0,Math.PI*2);g.stroke();g.beginPath();g.moveTo(x-28,y);g.lineTo(x+28,y);g.moveTo(x,y-28);g.lineTo(x,y+28);g.stroke();}g.font="800 15px system-ui";g.fillStyle="rgba(0,0,0,.8)";g.fillText(pointLabels[k],x+rad+6,y-rad-2);g.fillStyle="#fff";g.fillText(pointLabels[k],x+rad+5,y-rad-3);g.restore();});
}

async function toggleMic(){
  if(state.mic.enabled){stopMic();return;}
  try{const stream=await navigator.mediaDevices.getUserMedia({audio:true,video:false});const AC=window.AudioContext||window.webkitAudioContext;const ac=new AC();const src=ac.createMediaStreamSource(stream);const an=ac.createAnalyser();an.fftSize=1024;an.smoothingTimeConstant=.72;src.connect(an);state.mic={enabled:true,stream,audioCtx:ac,analyser:an,data:new Uint8Array(an.fftSize),level:0};document.getElementById("micBtn").textContent="マイク ON";}catch(e){alert("マイク権限を確認してください");}
}
function stopMic(){if(state.mic.stream)state.mic.stream.getTracks().forEach(t=>t.stop());if(state.mic.audioCtx)state.mic.audioCtx.close().catch(()=>{});state.mic={enabled:false,stream:null,audioCtx:null,analyser:null,data:null,level:0};document.getElementById("micBtn").textContent="マイク OFF";}
function updateMic(){if(!state.mic.enabled||!state.mic.analyser){state.mic.level*=.88;return;}state.mic.analyser.getByteTimeDomainData(state.mic.data);let s=0;for(const b of state.mic.data){const v=(b-128)/128;s+=v*v;}const rms=Math.sqrt(s/state.mic.data.length);state.mic.level=state.mic.level*.65+clamp(rms*state.controls.micGain*4.5,0,1)*.35;}
function setNextBlink(){state.nextBlink=performance.now()+3000+Math.random()*3000;}
function openObs(q){state.obs=true;document.getElementById("obsOverlay").classList.remove("hidden");if(q)document.body.classList.add("obs-mode");fitObs();}
function closeObs(){state.obs=false;document.getElementById("obsOverlay").classList.add("hidden");}
function settings(){return{app:"LivePic",version:"0.5",imageName:state.imageName,imageDataUrl:state.imageDataUrl,points:state.points,controls:state.controls};}
function applySettings(d){if(d.points)state.points=d.points;if(d.controls)Object.assign(state.controls,d.controls);Object.entries(state.controls).forEach(([k,v])=>{const el=document.getElementById(k);if(el.type==="checkbox")el.checked=!!v;else if(el)el.value=v;});updateAllLabels();if(d.imageDataUrl)loadImage(d.imageDataUrl,d.imageName||"restored",false);}
function saveLocal(){try{localStorage.setItem("livepic_v05",JSON.stringify(settings()));}catch(e){}}
function restoreLocal(show){try{const raw=localStorage.getItem("livepic_v05");if(!raw){if(show)alert("保存がありません");return false;}applySettings(JSON.parse(raw));if(show)alert("復元しました");return true;}catch(e){if(show)alert("復元失敗");return false;}}

function updateAllLabels(write=True){
  const ids=["breath","sway","tilt","mouthAmount","blinkAmount","micGain","yaw","meshPower","faceRadius"];
  ids.forEach(id=>{const el=document.getElementById(id+"Val");if(el){let v=state.controls[id];if(id==="micGain")v=Number(v).toFixed(1);el.textContent=v;}});
  const mesh=document.getElementById("meshEnabled"); if(mesh) mesh.checked=!!state.controls.meshEnabled;
}
function loop(now){
  const delta=now-state.lastFrame;state.lastFrame=now;state.fps=state.fps*.9+(1000/Math.max(delta,1))*.1;document.getElementById("fps").textContent="FPS: "+Math.round(state.fps);
  state.t++; updateMic(); state.manual.talking*=.88; state.manual.blink*=.70;
  if(now>state.nextBlink&&state.motion){state.manual.blink=1;setNextBlink();}
  const r=canvas.getBoundingClientRect(); draw(ctx,r.width,r.height,true);
  if(state.obs||document.body.classList.contains("obs-mode"))draw(obsCtx,innerWidth,innerHeight,false);
  requestAnimationFrame(loop);
}
function clamp(n,min,max){return Math.max(min,Math.min(max,n));}
function ease(x){return 1-Math.pow(1-x,3);}
function roundRect(g,x,y,w,h,r){g.beginPath();g.moveTo(x+r,y);g.arcTo(x+w,y,x+w,y+h,r);g.arcTo(x+w,y+h,x,y+h,r);g.arcTo(x,y+h,x,y,r);g.arcTo(x,y,x+w,y,r);g.closePath();}
