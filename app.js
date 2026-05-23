const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const obsCanvas = document.getElementById("obsCanvas");
const obsCtx = obsCanvas.getContext("2d");

const state = {
  image: null,
  imageName: "",
  motion: true,
  tool: "face",
  points: {
    face:null, leftEye:null, rightEye:null, mouth:null, neck:null, body:null
  },
  controls: {
    breath:16, sway:10, tilt:5, mouthAmount:18, blinkAmount:12
  },
  manual: { tilt:0, y:0, talking:0, blink:0 },
  t:0,
  obs:false
};

const pointLabels = {
  face:"顔中心", leftEye:"左目", rightEye:"右目", mouth:"口", neck:"首", body:"体中心"
};

function fitCanvasToStage(){
  const stage = document.getElementById("stage");
  const rect = stage.getBoundingClientRect();
  canvas.width = Math.floor(rect.width * devicePixelRatio);
  canvas.height = Math.floor(rect.height * devicePixelRatio);
  canvas.style.width = rect.width + "px";
  canvas.style.height = rect.height + "px";
  ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);
}
function fitObs(){
  obsCanvas.width = Math.floor(innerWidth * devicePixelRatio);
  obsCanvas.height = Math.floor(innerHeight * devicePixelRatio);
  obsCtx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);
}
window.addEventListener("resize", ()=>{fitCanvasToStage();fitObs();});

fitCanvasToStage();
fitObs();

document.getElementById("fileInput").addEventListener("change", e=>{
  const file = e.target.files[0];
  if(!file) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = ()=>{
    state.image = img;
    state.imageName = file.name;
    document.getElementById("dropMessage").style.display = "none";
    autoPlacePoints();
  };
  img.src = url;
});

function autoPlacePoints(){
  state.points.face = {x:.5,y:.32};
  state.points.leftEye = {x:.43,y:.28};
  state.points.rightEye = {x:.57,y:.28};
  state.points.mouth = {x:.5,y:.39};
  state.points.neck = {x:.5,y:.52};
  state.points.body = {x:.5,y:.68};
}

document.querySelectorAll(".tool").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    document.querySelectorAll(".tool").forEach(b=>b.classList.remove("active"));
    btn.classList.add("active");
    state.tool = btn.dataset.point;
    document.getElementById("currentTool").textContent = "選択中: " + pointLabels[state.tool];
  });
});

canvas.addEventListener("click", e=>{
  if(!state.image) return;
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width;
  const y = (e.clientY - rect.top) / rect.height;
  const imgRect = getImageRect(rect.width, rect.height);
  const nx = (e.clientX - rect.left - imgRect.x) / imgRect.w;
  const ny = (e.clientY - rect.top - imgRect.y) / imgRect.h;
  state.points[state.tool] = {x: clamp(nx,0,1), y: clamp(ny,0,1)};
});

["breath","sway","tilt","mouthAmount","blinkAmount"].forEach(id=>{
  const el = document.getElementById(id);
  const out = document.getElementById(id.replace("Amount","").replace("breath","breath").replace("sway","sway").replace("tilt","tilt") + "Val");
  const valId = id === "mouthAmount" ? "mouthVal" : id === "blinkAmount" ? "blinkVal" : id + "Val";
  const valEl = document.getElementById(valId);
  el.addEventListener("input", ()=>{
    state.controls[id] = Number(el.value);
    if(valEl) valEl.textContent = el.value;
  });
});

document.getElementById("toggleMotionBtn").onclick = ()=>{
  state.motion = !state.motion;
  document.getElementById("toggleMotionBtn").textContent = state.motion ? "モーション ON" : "モーション OFF";
};
document.getElementById("blinkBtn").onclick = ()=> triggerBlink();
document.getElementById("talkBtn").onclick = ()=> triggerTalk();
document.getElementById("obsBtn").onclick = ()=>{
  state.obs = true;
  document.getElementById("obsOverlay").classList.remove("hidden");
  fitObs();
};
document.getElementById("closeObs").onclick = ()=>{
  state.obs = false;
  document.getElementById("obsOverlay").classList.add("hidden");
};

document.getElementById("saveBtn").onclick = ()=>{
  const data = {
    app:"TachieMotionLite",
    version:"0.1",
    imageName: state.imageName,
    points: state.points,
    controls: state.controls
  };
  document.getElementById("settingsBox").value = JSON.stringify(data, null, 2);
};
document.getElementById("loadBtn").onclick = ()=>{
  try{
    const data = JSON.parse(document.getElementById("settingsBox").value);
    if(data.points) state.points = data.points;
    if(data.controls){
      state.controls = {...state.controls, ...data.controls};
      for(const [k,v] of Object.entries(state.controls)){
        const el = document.getElementById(k);
        if(el) el.value = v;
      }
    }
  }catch(err){
    alert("JSONの読み込みに失敗しました");
  }
};

window.addEventListener("keydown", e=>{
  if(e.code==="KeyA") state.manual.tilt = -1;
  if(e.code==="KeyD") state.manual.tilt = 1;
  if(e.code==="KeyW") state.manual.y = -1;
  if(e.code==="KeyS") state.manual.y = 1;
  if(e.code==="Space") triggerTalk();
  if(e.code==="KeyB") triggerBlink();
});
window.addEventListener("keyup", e=>{
  if(["KeyA","KeyD"].includes(e.code)) state.manual.tilt = 0;
  if(["KeyW","KeyS"].includes(e.code)) state.manual.y = 0;
});

function triggerBlink(){ state.manual.blink = 1; }
function triggerTalk(){ state.manual.talking = 1; }

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
  const tilt = (Math.sin(t*0.018)*c.tilt*0.35 + state.manual.tilt*c.tilt) * motion;
  const yManual = state.manual.y * 16;

  const talk = state.manual.talking;
  const blink = state.manual.blink;

  targetCtx.save();
  targetCtx.translate(w/2 + sway, h/2 + breath + yManual);
  targetCtx.rotate(tilt * Math.PI/180);
  targetCtx.translate(-w/2, -h/2);

  // Main image
  targetCtx.drawImage(state.image, rect.x, rect.y, rect.w, rect.h);

  // Pseudo mouth animation: shadow/line expansion at mouth point
  const mouth = state.points.mouth;
  if(mouth && talk > 0.02){
    const mx = rect.x + mouth.x * rect.w;
    const my = rect.y + mouth.y * rect.h;
    targetCtx.save();
    targetCtx.globalAlpha = .65 * talk;
    targetCtx.fillStyle = "rgba(20,10,20,.65)";
    targetCtx.beginPath();
    targetCtx.ellipse(mx, my + 4*talk, 18 + c.mouthAmount*talk*.45, 3 + c.mouthAmount*talk*.22, 0, 0, Math.PI*2);
    targetCtx.fill();
    targetCtx.restore();
  }

  // Pseudo blink: draw soft skin-colored-ish bars / dark translucent bars over eyes
  if(blink > 0.02){
    ["leftEye","rightEye"].forEach(k=>{
      const p = state.points[k];
      if(!p) return;
      const x = rect.x + p.x*rect.w;
      const y = rect.y + p.y*rect.h;
      targetCtx.save();
      targetCtx.globalAlpha = .58 * blink;
      targetCtx.fillStyle = "rgba(10,10,18,.72)";
      roundRect(targetCtx, x-24, y-c.blinkAmount*.23, 48, 5 + c.blinkAmount*.34, 999);
      targetCtx.fill();
      targetCtx.restore();
    });
  }

  targetCtx.restore();

  if(showPoints){
    Object.entries(state.points).forEach(([k,p])=>{
      if(!p) return;
      const x = rect.x + p.x*rect.w;
      const y = rect.y + p.y*rect.h;
      targetCtx.save();
      targetCtx.fillStyle = k === state.tool ? "#79e7ff" : "#ff7ad9";
      targetCtx.strokeStyle = "rgba(0,0,0,.65)";
      targetCtx.lineWidth = 3;
      targetCtx.beginPath();
      targetCtx.arc(x,y,7,0,Math.PI*2);
      targetCtx.fill();
      targetCtx.stroke();
      targetCtx.fillStyle = "white";
      targetCtx.font = "12px system-ui";
      targetCtx.fillText(pointLabels[k], x+10, y-8);
      targetCtx.restore();
    });
  }
}

function loop(){
  state.t++;
  state.manual.talking *= .88;
  state.manual.blink *= .78;

  const rect = canvas.getBoundingClientRect();
  draw(ctx, rect.width, rect.height, true);

  if(state.obs){
    draw(obsCtx, innerWidth, innerHeight, false);
  }
  requestAnimationFrame(loop);
}
loop();

function clamp(n,min,max){return Math.max(min,Math.min(max,n));}
function roundRect(ctx,x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r);
  ctx.closePath();
}
