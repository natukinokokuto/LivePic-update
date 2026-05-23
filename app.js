const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const obsCanvas = document.getElementById("obsCanvas");
const obsCtx = obsCanvas.getContext("2d");

const state = {
  image: null,
  imageDataUrl: "",
  imageName: "",
  motion: true,
  tool: "face",
  points: {
    face:null, leftEye:null, rightEye:null, mouth:null, neck:null, body:null
  },
  controls: {
    breath:16,
    sway:10,
    tilt:6,
    mouthAmount:24,
    blinkAmount:16,
    blinkInterval:4.5,
    micGain:3.0
  },
  manual: { tilt:0, y:0, talking:0, blink:0 },
  mic: {
    enabled:false,
    stream:null,
    audioCtx:null,
    analyser:null,
    data:null,
    level:0
  },
  t:0,
  lastFrame:performance.now(),
  fps:0,
  nextBlink:0,
  obs:false
};

const pointLabels = {
  face:"顔中心", leftEye:"左目", rightEye:"右目", mouth:"口", neck:"首", body:"体中心"
};

const pointColors = {
  face:"#ffe66d", leftEye:"#ff66c4", rightEye:"#ff66c4", mouth:"#ff9f43",
  neck:"#55efc4", body:"#74b9ff"
};


const sampleSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 900 1200">
  <defs>
    <linearGradient id="hair" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#29243f"/>
      <stop offset="100%" stop-color="#151827"/>
    </linearGradient>
    <linearGradient id="cloth" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="100%" stop-color="#dfe7ff"/>
    </linearGradient>
  </defs>
  <rect width="900" height="1200" fill="none"/>
  <ellipse cx="450" cy="1030" rx="250" ry="120" fill="#12131e" opacity=".25"/>
  <path d="M250 520 C170 690 165 930 260 1090 L640 1090 C735 930 730 690 650 520 C610 420 300 420 250 520Z" fill="url(#cloth)" stroke="#30364e" stroke-width="8"/>
  <path d="M305 625 C250 760 250 1000 330 1110" fill="none" stroke="#252944" stroke-width="42" stroke-linecap="round"/>
  <path d="M595 625 C650 760 650 1000 570 1110" fill="none" stroke="#252944" stroke-width="42" stroke-linecap="round"/>
  <path d="M375 520 L525 520 L505 650 L395 650Z" fill="#ffd8c8" stroke="#30364e" stroke-width="6"/>
  <path d="M210 250 C210 95 330 45 450 45 C570 45 690 95 690 250 C720 500 695 790 620 980 C600 760 580 620 560 510 C520 560 380 560 340 510 C320 620 300 760 280 980 C205 790 180 500 210 250Z" fill="url(#hair)" stroke="#0d0f18" stroke-width="8"/>
  <ellipse cx="450" cy="340" rx="205" ry="245" fill="#ffd8c8" stroke="#30364e" stroke-width="8"/>
  <path d="M270 280 C330 150 570 150 630 280 C570 220 330 220 270 280Z" fill="url(#hair)"/>
  <path d="M285 260 C330 135 520 110 610 235 C515 190 380 200 285 260Z" fill="url(#hair)" stroke="#0d0f18" stroke-width="5"/>
  <ellipse cx="365" cy="355" rx="42" ry="34" fill="#ffffff"/>
  <ellipse cx="535" cy="355" rx="42" ry="34" fill="#ffffff"/>
  <circle cx="365" cy="358" r="20" fill="#8f69ff"/>
  <circle cx="535" cy="358" r="20" fill="#8f69ff"/>
  <circle cx="372" cy="348" r="7" fill="#ffffff"/>
  <circle cx="542" cy="348" r="7" fill="#ffffff"/>
  <path d="M330 310 C360 290 390 292 410 315" fill="none" stroke="#1a1d2c" stroke-width="10" stroke-linecap="round"/>
  <path d="M490 315 C510 292 540 290 570 310" fill="none" stroke="#1a1d2c" stroke-width="10" stroke-linecap="round"/>
  <path d="M445 365 C435 410 430 420 450 430" fill="none" stroke="#e7a99b" stroke-width="7" stroke-linecap="round"/>
  <path d="M405 475 C435 505 470 505 500 475" fill="none" stroke="#8f3340" stroke-width="11" stroke-linecap="round"/>
  <circle cx="315" cy="430" r="24" fill="#ff9eb3" opacity=".45"/>
  <circle cx="585" cy="430" r="24" fill="#ff9eb3" opacity=".45"/>
  <path d="M350 655 L450 760 L550 655" fill="#252944" stroke="#151827" stroke-width="8"/>
  <circle cx="450" cy="705" r="30" fill="#8f69ff" stroke="#fff" stroke-width="6"/>
  <path d="M330 670 C390 720 510 720 570 670" fill="none" stroke="#30364e" stroke-width="8" stroke-linecap="round"/>
</svg>`;

function loadSampleCharacter(){
  const dataUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(sampleSvg);
  loadImageFromDataUrl(dataUrl, "LivePic_sample_character.svg", true);
}


function init(){
  fitCanvasToStage();
  fitObs();
  wireEvents();
  setNextBlink();
  const restored = restoreFromLocal(false);
  if(!restored){
    loadSampleCharacter();
  }

  if(new URLSearchParams(location.search).get("obs") === "1"){
    openObs(true);
  }
}
init();

function wireEvents(){
  window.addEventListener("resize", ()=>{fitCanvasToStage();fitObs();});

  const fileInput = document.getElementById("fileInput");
  fileInput.addEventListener("change", e=>{
    const file = e.target.files[0];
    if(file) loadFile(file);
  });

  document.getElementById("sampleBtn").addEventListener("click", ()=>{
    loadSampleCharacter();
  });

  const stage = document.getElementById("stage");
  ["dragenter","dragover"].forEach(type=>{
    stage.addEventListener(type, e=>{
      e.preventDefault();
      stage.classList.add("dragging");
    });
  });
  ["dragleave","drop"].forEach(type=>{
    stage.addEventListener(type, e=>{
      e.preventDefault();
      stage.classList.remove("dragging");
    });
  });
  stage.addEventListener("drop", e=>{
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if(file && file.type.startsWith("image/")) loadFile(file);
  });

  document.querySelectorAll(".tool").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      document.querySelectorAll(".tool").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      state.tool = btn.dataset.point;
      document.getElementById("currentTool").textContent = "選択中: " + pointLabels[state.tool];
    });
  });

  canvas.addEventListener("click", e=> placePointByClick(e, canvas));

  document.getElementById("autoPointBtn").onclick = autoPlacePoints;
  document.getElementById("resetMotionBtn").onclick = resetMotionControls;
  document.getElementById("toggleMotionBtn").onclick = ()=>{
    state.motion = !state.motion;
    document.getElementById("toggleMotionBtn").textContent = state.motion ? "モーション ON" : "モーション OFF";
  };
  document.getElementById("blinkBtn").onclick = triggerBlink;
  document.getElementById("talkBtn").onclick = triggerTalk;
  document.getElementById("micBtn").onclick = toggleMic;
  document.getElementById("openObsBtn").onclick = ()=> openObs(false);
  document.getElementById("closeObs").onclick = closeObs;

  document.getElementById("saveLocalBtn").onclick = ()=> {
    saveToLocal();
    alert("ブラウザに保存しました");
  };
  document.getElementById("loadLocalBtn").onclick = ()=> restoreFromLocal(true);
  document.getElementById("exportBtn").onclick = exportSettings;
  document.getElementById("importBtn").onclick = importSettings;
  document.getElementById("copyObsHintBtn").onclick = copyObsHint;

  ["breath","sway","tilt","mouthAmount","blinkAmount","blinkInterval","micGain"].forEach(id=>{
    const el = document.getElementById(id);
    el.addEventListener("input", ()=>{
      state.controls[id] = Number(el.value);
      updateControlLabels();
      if(id === "blinkInterval") setNextBlink();
    });
  });

  window.addEventListener("keydown", e=>{
    if(e.repeat) return;
    if(e.code==="KeyA") state.manual.tilt = -1;
    if(e.code==="KeyD") state.manual.tilt = 1;
    if(e.code==="KeyW") state.manual.y = -1;
    if(e.code==="KeyS") state.manual.y = 1;
    if(e.code==="Space"){ e.preventDefault(); triggerTalk(); }
    if(e.code==="KeyB") triggerBlink();
  });
  window.addEventListener("keyup", e=>{
    if(["KeyA","KeyD"].includes(e.code)) state.manual.tilt = 0;
    if(["KeyW","KeyS"].includes(e.code)) state.manual.y = 0;
  });
}

function loadFile(file){
  const reader = new FileReader();
  reader.onload = ()=>{
    loadImageFromDataUrl(reader.result, file.name);
  };
  reader.readAsDataURL(file);
}

function loadImageFromDataUrl(dataUrl, name="image"){
  const img = new Image();
  img.onload = ()=>{
    state.image = img;
    state.imageDataUrl = dataUrl;
    state.imageName = name;
    document.getElementById("fileName").textContent = name;
    document.getElementById("dropMessage").style.display = "none";
    autoPlacePoints();
    saveToLocal();
  };
  img.src = dataUrl;
}

function autoPlacePoints(){
  state.points = {
    face:{x:.5,y:.32},
    leftEye:{x:.43,y:.285},
    rightEye:{x:.57,y:.285},
    mouth:{x:.5,y:.395},
    neck:{x:.5,y:.535},
    body:{x:.5,y:.70}
  };
}

function resetMotionControls(){
  state.controls = {
    breath:16, sway:10, tilt:6, mouthAmount:24,
    blinkAmount:16, blinkInterval:4.5, micGain:3.0
  };
  for(const [k,v] of Object.entries(state.controls)){
    const el = document.getElementById(k);
    if(el) el.value = v;
  }
  updateControlLabels();
}

function updateControlLabels(){
  const map = {
    breath:"breathVal",
    sway:"swayVal",
    tilt:"tiltVal",
    mouthAmount:"mouthVal",
    blinkAmount:"blinkVal",
    blinkInterval:"blinkIntervalVal",
    micGain:"micGainVal"
  };
  for(const [k,id] of Object.entries(map)){
    const el = document.getElementById(id);
    if(!el) continue;
    let v = state.controls[k];
    if(k==="blinkInterval") v = v.toFixed(1)+"秒";
    else if(k==="micGain") v = Number(v).toFixed(1);
    el.textContent = v;
  }
}
updateControlLabels();

function placePointByClick(e, targetCanvas){
  if(!state.image) return;
  const rectDom = targetCanvas.getBoundingClientRect();
  const imgRect = getImageRect(rectDom.width, rectDom.height);
  const nx = (e.clientX - rectDom.left - imgRect.x) / imgRect.w;
  const ny = (e.clientY - rectDom.top - imgRect.y) / imgRect.h;
  state.points[state.tool] = {x: clamp(nx,0,1), y: clamp(ny,0,1)};
}

async function toggleMic(){
  if(state.mic.enabled){
    stopMic();
    return;
  }
  try{
    const stream = await navigator.mediaDevices.getUserMedia({audio:true, video:false});
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const audioCtx = new AudioContext();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = .72;
    source.connect(analyser);
    state.mic.stream = stream;
    state.mic.audioCtx = audioCtx;
    state.mic.analyser = analyser;
    state.mic.data = new Uint8Array(analyser.fftSize);
    state.mic.enabled = true;
    document.getElementById("micBtn").textContent = "マイク口パク ON";
    document.getElementById("micStatus").textContent = "Mic: ON";
  }catch(err){
    alert("マイクが使えませんでした。ブラウザの権限を確認してください。");
  }
}

function stopMic(){
  if(state.mic.stream){
    state.mic.stream.getTracks().forEach(t=>t.stop());
  }
  if(state.mic.audioCtx){
    state.mic.audioCtx.close().catch(()=>{});
  }
  state.mic = {enabled:false, stream:null, audioCtx:null, analyser:null, data:null, level:0};
  document.getElementById("micBtn").textContent = "マイク口パク OFF";
  document.getElementById("micStatus").textContent = "Mic: OFF";
}

function updateMicLevel(){
  if(!state.mic.enabled || !state.mic.analyser) {
    state.mic.level *= .88;
    return;
  }
  state.mic.analyser.getByteTimeDomainData(state.mic.data);
  let sum = 0;
  for(let i=0;i<state.mic.data.length;i++){
    const v = (state.mic.data[i]-128)/128;
    sum += v*v;
  }
  const rms = Math.sqrt(sum/state.mic.data.length);
  const boosted = clamp(rms * state.controls.micGain * 4.5, 0, 1);
  state.mic.level = state.mic.level * .65 + boosted * .35;
}

function triggerBlink(){
  state.manual.blink = 1;
}
function triggerTalk(){
  state.manual.talking = 1;
}

function setNextBlink(){
  const base = state.controls.blinkInterval * 1000;
  const random = 600 + Math.random() * 1600;
  state.nextBlink = performance.now() + base + random;
}

function openObs(fromQuery){
  state.obs = true;
  document.getElementById("obsOverlay").classList.remove("hidden");
  if(fromQuery) document.body.classList.add("obs-mode");
  fitObs();
}
function closeObs(){
  state.obs = false;
  document.getElementById("obsOverlay").classList.add("hidden");
}

function exportSettings(){
  const data = makeSettingsObject();
  document.getElementById("settingsBox").value = JSON.stringify(data, null, 2);
}
function importSettings(){
  try{
    const data = JSON.parse(document.getElementById("settingsBox").value);
    applySettingsObject(data);
    saveToLocal();
    alert("読み込みました");
  }catch(err){
    alert("JSONの読み込みに失敗しました");
  }
}
function makeSettingsObject(){
  return {
    app:"LivePic",
    version:"0.2",
    imageName: state.imageName,
    imageDataUrl: state.imageDataUrl,
    points: state.points,
    controls: state.controls
  };
}
function applySettingsObject(data){
  if(data.points) state.points = data.points;
  if(data.controls) state.controls = {...state.controls, ...data.controls};
  for(const [k,v] of Object.entries(state.controls)){
    const el = document.getElementById(k);
    if(el) el.value = v;
  }
  updateControlLabels();
  if(data.imageDataUrl) loadImageFromDataUrl(data.imageDataUrl, data.imageName || "restored-image");
}
function saveToLocal(){
  try{
    localStorage.setItem("livepic_v02_project", JSON.stringify(makeSettingsObject()));
  }catch(err){
    console.warn("localStorage save failed", err);
  }
}
function restoreFromLocal(showAlert){
  try{
    const raw = localStorage.getItem("livepic_v02_project");
    if(!raw){
      if(showAlert) alert("保存データがありません");
      return false;
    }
    const data = JSON.parse(raw);
    if(!data || !data.imageDataUrl){
      if(showAlert) alert("保存画像がありません");
      return false;
    }
    applySettingsObject(data);
    if(showAlert) alert("復元しました");
    return true;
  }catch(err){
    if(showAlert) alert("復元に失敗しました");
    return false;
  }
}
async function copyObsHint(){
  const url = location.href.split("?")[0] + "?obs=1";
  try{
    await navigator.clipboard.writeText(url);
    alert("OBS用URLヒントをコピーしました");
  }catch(err){
    document.getElementById("settingsBox").value = url;
  }
}

function fitCanvasToStage(){
  const stage = document.getElementById("stage");
  const rect = stage.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  canvas.style.width = rect.width + "px";
  canvas.style.height = rect.height + "px";
  ctx.setTransform(dpr,0,0,dpr,0,0);
}
function fitObs(){
  const dpr = window.devicePixelRatio || 1;
  obsCanvas.width = Math.floor(innerWidth * dpr);
  obsCanvas.height = Math.floor(innerHeight * dpr);
  obsCtx.setTransform(dpr,0,0,dpr,0,0);
}

function getImageRect(w,h){
  if(!state.image) return {x:0,y:0,w:0,h:0};
  const iw = state.image.width;
  const ih = state.image.height;
  const scale = Math.min(w/iw, h/ih) * .92;
  const rw = iw * scale;
  const rh = ih * scale;
  return {x:(w-rw)/2, y:(h-rh)/2, w:rw, h:rh};
}

function draw(targetCtx, w, h, showPoints){
  targetCtx.clearRect(0,0,w,h);
  if(!state.image) return;

  const rect = getImageRect(w,h);
  const c = state.controls;
  const t = state.t;
  const motion = state.motion ? 1 : 0;

  const breath = Math.sin(t*0.035) * c.breath * motion;
  const sway = Math.sin(t*0.022) * c.sway * motion;
  const idleTilt = Math.sin(t*0.018) * c.tilt * .25;
  const tilt = (idleTilt + state.manual.tilt*c.tilt) * motion;
  const yManual = state.manual.y * 18 * motion;

  const micMouth = state.mic.level;
  const talk = Math.max(state.manual.talking, micMouth);
  const blink = state.manual.blink;

  targetCtx.save();
  targetCtx.translate(w/2 + sway, h/2 + breath + yManual);
  targetCtx.rotate(tilt * Math.PI/180);
  targetCtx.translate(-w/2, -h/2);

  // 体全体
  targetCtx.drawImage(state.image, rect.x, rect.y, rect.w, rect.h);

  // 口パク：口ポイントを楕円で疑似開口
  const mouth = state.points.mouth;
  if(mouth && talk > 0.015){
    const mx = rect.x + mouth.x * rect.w;
    const my = rect.y + mouth.y * rect.h;
    const open = easeOutCubic(clamp(talk,0,1));
    targetCtx.save();
    targetCtx.globalAlpha = .72 * open;
    targetCtx.fillStyle = "rgba(18,7,16,.78)";
    targetCtx.beginPath();
    targetCtx.ellipse(
      mx,
      my + 4*open,
      14 + c.mouthAmount*open*.55,
      2.5 + c.mouthAmount*open*.30,
      0,
      0,
      Math.PI*2
    );
    targetCtx.fill();
    targetCtx.restore();

    // 下あごっぽい影
    targetCtx.save();
    targetCtx.globalAlpha = .20 * open;
    targetCtx.fillStyle = "rgba(255,255,255,.6)";
    targetCtx.beginPath();
    targetCtx.ellipse(mx, my + 9 + c.mouthAmount*open*.18, 18, 2, 0, 0, Math.PI*2);
    targetCtx.fill();
    targetCtx.restore();
  }

  // まばたき：左右目ポイントを線で潰す
  if(blink > 0.02){
    ["leftEye","rightEye"].forEach(k=>{
      const p = state.points[k];
      if(!p) return;
      const x = rect.x + p.x*rect.w;
      const y = rect.y + p.y*rect.h;
      const close = easeOutCubic(clamp(blink,0,1));
      targetCtx.save();
      targetCtx.globalAlpha = .72 * close;
      targetCtx.fillStyle = "rgba(15,15,25,.78)";
      roundRect(targetCtx, x-27, y-c.blinkAmount*.20, 54, 5 + c.blinkAmount*.36, 999);
      targetCtx.fill();
      targetCtx.restore();
    });
  }

  targetCtx.restore();

  if(showPoints) drawPoints(targetCtx, rect);
}

function drawPoints(targetCtx, rect){
  Object.entries(state.points).forEach(([k,p])=>{
    if(!p) return;
    const x = rect.x + p.x*rect.w;
    const y = rect.y + p.y*rect.h;
    targetCtx.save();
    targetCtx.fillStyle = pointColors[k] || "#fff";
    targetCtx.strokeStyle = "rgba(0,0,0,.72)";
    targetCtx.lineWidth = 3;
    targetCtx.beginPath();
    targetCtx.arc(x,y,k===state.tool?8:6,0,Math.PI*2);
    targetCtx.fill();
    targetCtx.stroke();
    targetCtx.font = "700 12px system-ui";
    targetCtx.fillStyle = "rgba(0,0,0,.75)";
    targetCtx.fillText(pointLabels[k], x+11, y-7);
    targetCtx.fillStyle = "white";
    targetCtx.fillText(pointLabels[k], x+10, y-8);
    targetCtx.restore();
  });
}

function loop(now=performance.now()){
  const delta = now - state.lastFrame;
  state.lastFrame = now;
  state.fps = state.fps * .9 + (1000 / Math.max(delta,1)) * .1;
  document.getElementById("fps").textContent = "FPS: " + Math.round(state.fps);

  state.t++;
  updateMicLevel();

  state.manual.talking *= .88;
  state.manual.blink *= .70;

  if(now > state.nextBlink && state.motion){
    triggerBlink();
    setNextBlink();
  }

  const rect = canvas.getBoundingClientRect();
  draw(ctx, rect.width, rect.height, true);

  if(state.obs || document.body.classList.contains("obs-mode")){
    draw(obsCtx, innerWidth, innerHeight, false);
  }

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

function clamp(n,min,max){return Math.max(min,Math.min(max,n));}
function easeOutCubic(x){return 1 - Math.pow(1-x,3);}
function roundRect(ctx,x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r);
  ctx.closePath();
}
