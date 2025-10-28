/* ================== 기본 설정 ================== */
const VIDEO_COUNT = 30;
const SOURCES = Array.from({length:VIDEO_COUNT}, (_,i)=>`videos/${i+1}.mp4`);
const BASE_W_VAR = '--base-w';

const MAX_W_FRACTION = 0.20;
const MIN_W_PX = 100;
const MAX_W_PX = 280;
const EDGE_PAD = 80;

/* ===== 캡션 폴백 (video.js 없을 때 사용) ===== */
const CAPTIONS_FALLBACK = [
  "공백 = 일시정지 (1080*1080)",
  "겉표지 = 타이틀 시퀀스 (1080*1440)",
  "글줄 = 대사 (1080*1080)",
  "능동적 수용 = 수동적 수용 (1920*1080)",
  "도련 = 윈도우박스 (5120*1080)",
  "독립출판 = 스트리밍 (1920*1080)",
  "뒤표지 문구 = 티저 (1920*1080)",
  "두께 = 길이 (1920*1080)",
  "무게 = 용량 (1594*1608)",
  "상호작용 방식 (2958*1884)",
  "서점 = DVD 대여점 (1080*1920)",
  "스틸 이미지 = 무빙 이미지 (1920*1080)",
  "인디자인 = 프리미어 (1080*1080)",
  "인쇄 = 렌더링 (1252*452)",
  "인쇄기 = 스크린 (1920*1080)",
  "읽기 속도 조절 (1920*1080)",
  "재단 = 레이어마스크 (2002*1274)",
  "종이와 잉크 = 스크린과 픽셀 (1080*1440)",
  "주석 = 자막",
  "질감 = 입자감 (1920*1080)",
  "책갈피 = 마커 (1920*1080)",
  "책넘김 = 장면 전환 (1920*1080)",
  "책에서의 시점 = 영상에서의 시점 (1080*1920)",
  "책표지 = 썸네일 (1920*1080)",
  "챕터 = 시퀀스 (1920*1080)",
  "쪽수 = 프레임 (1920*1080)",
  "판권면 = 크레딧 (1080*1920)",
  "페이지 넘김 = 컷 (5120*1080)",
  "확대 = 클로즈업 (1412*612)",
  "CMYK = RGB (1080*1080)"
];


/* ================== DOM ================== */
const wrap    = document.getElementById('wrap');
const stage   = document.getElementById('stage');
const bgVideo = document.getElementById('bgVideo');

/* 최소 팝업 */
const popup       = document.getElementById('popup');
const popupVideo  = document.getElementById('popupVideo');
const popCaption  = document.getElementById('popCaption');

/* ================== 유틸 & 상태 ================== */
const rand  = (a,b)=>Math.random()*(b-a)+a;
const clamp = (v,a,b)=>Math.min(Math.max(v,a),b);

const items = [];
let pointer = {x:-9999, y:-9999};
let currentBgSrc=null, hideDelay=null, hoverToken=0;
let prevTs=null;

/* 포맷: 초 → HH:MM:SS / MM:SS */
function fmtDur(sec){
  if(!isFinite(sec) || sec<=0) return '00:00';
  const s = Math.floor(sec%60);
  const m = Math.floor((sec/60)%60);
  const h = Math.floor(sec/3600);
  const pad=n=>String(n).padStart(2,'0');
  return h>0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/* ================== 배경(호버) ================== */
function showBackground(src){
  hoverToken++;
  const token=hoverToken;

  if(currentBgSrc!==src){
    currentBgSrc=src;
    bgVideo.src=src;
    bgVideo.currentTime=0;
  }
  const p=bgVideo.play(); if(p&&p.catch) p.catch(()=>{});
  if(hideDelay) { clearTimeout(hideDelay); hideDelay=null; }
  requestAnimationFrame(()=>{
    if(token===hoverToken) bgVideo.classList.add('visible');
  });
}
function hideBackground(){
  if(hideDelay) clearTimeout(hideDelay);
  hideDelay=setTimeout(()=>{
    bgVideo.classList.remove('visible');
    bgVideo.pause(); bgVideo.removeAttribute('src'); bgVideo.load();
    currentBgSrc=null;
  },120);
}

/* 포인터 추적 */
['pointermove','mousemove','touchmove'].forEach(evt=>{
  window.addEventListener(evt, e=>{
    if(e.touches && e.touches[0]){ pointer.x=e.touches[0].clientX; pointer.y=e.touches[0].clientY; }
    else{ pointer.x=e.clientX; pointer.y=e.clientY; }
  }, {passive:true});
});
window.addEventListener('mouseout', e=>{
  if(!e.relatedTarget || e.relatedTarget.nodeName==="HTML"){
    pointer.x=-9999; pointer.y=-9999; hideBackground();
  }
});

/* ================== 썸네일 생성 ================== */
function createVideos(){
  const rect  = wrap.getBoundingClientRect();
  const baseW = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(BASE_W_VAR));

  SOURCES.forEach((src,idx)=>{
    const node=document.createElement('div');
    node.className='v';
    node.tabIndex=0;

    const vid=document.createElement('video');
    vid.src=src; vid.autoplay=true; vid.loop=true; vid.muted=true; vid.playsInline=true;
    node.appendChild(vid); stage.appendChild(node);

    // 임시 크기(16:9) → 메타 로드 후 비율 보정
    const rawW = baseW * rand(0.9,1.05);
    let w = rawW, h = rawW * 9/16;
    node.style.width  = `${w}px`;
    node.style.height = `${h}px`;

    // 비겹침 초기 위치
    const pos = findFreeSpot(w,h,rect,EDGE_PAD,220);
    const x = pos.x, y = pos.y;

    // 느린 부유
    const maxSpeed = rand(0.008, 0.016);
    const minSpeed = maxSpeed * 0.55;
    const maxForce = maxSpeed * 0.030;
    const wanderJitter = 0.0009;
    const sepStrength = maxForce * 1.8;
    const sepRadius   = Math.max(w,h) * 0.85;
    const wallMargin  = 60;
    const wallForce   = maxForce * 2.0;

    const theta = rand(0,Math.PI*2);
    const vx = Math.cos(theta)*rand(minSpeed,maxSpeed)*0.6;
    const vy = Math.sin(theta)*rand(minSpeed,maxSpeed)*0.6;

    const item={
      index:idx,node,vid,
      x,y,w,h, vx,vy, ax:0,ay:0,
      minSpeed,maxSpeed,maxForce,
      wanderTheta: rand(0,Math.PI*2), wanderJitter,
      sepStrength, sepRadius, wallMargin, wallForce,
      phase: rand(0,Math.PI*2)
    };
    items.push(item);

    // 클릭 → 최소 팝업 열기
    node.addEventListener('click', ()=> openPopup(idx));

    // 호버 → 배경 전환
    node.addEventListener('pointerenter', ()=>showBackground(src));
    node.addEventListener('pointerleave',  ()=>hideBackground());
    node.addEventListener('mouseenter',    ()=>showBackground(src));
    node.addEventListener('mouseleave',    ()=>hideBackground());

    // 메타 로드 후 종횡비/크기 보정
    vid.addEventListener('loadedmetadata', ()=>{
      const vw = vid.videoWidth  || 16;
      const vh = vid.videoHeight || 9;
      const ratio = vw/vh;

      const maxByView = Math.min(rect.width, rect.height) * MAX_W_FRACTION;
      const maxW = Math.min(MAX_W_PX, maxByView);
      const finalW = clamp(rawW, MIN_W_PX, maxW);
      const finalH = Math.round(finalW / ratio);

      node.style.width  = `${finalW}px`;
      node.style.height = `${finalH}px`;
      item.w=finalW; item.h=finalH;
      item.sepRadius = Math.max(finalW, finalH) * 0.85;

      // 경계/겹침 보정
      const corrected = clampIntoAndAvoid(item, rect, EDGE_PAD);
      item.x = corrected.x; item.y = corrected.y;
      node.style.transform = `translate3d(${item.x}px,${item.y}px,0)`;
    }, {once:true});

    // 첫 배치
    node.style.transform = `translate3d(${x}px,${y}px,0)`;
  });
}

/* 초기 비겹침 배치/보정 */
function findFreeSpot(w,h,rect,pad=EDGE_PAD,tries=300){
  for(let t=0;t<tries;t++){
    const rx = (Math.random()+Math.random())/2;
    const ry = (Math.random()+Math.random())/2;

    const x = clamp(rx*(rect.width - 2*pad - w) + pad, pad, rect.width  - w - pad);
    const y = clamp(ry*(rect.height- 2*pad - h) + pad, pad, rect.height - h - pad);

    let ok = true;
    for(const it of items){
      if(rectOverlap(x,y,w,h, it.x,it.y,it.w,it.h, 12)){ ok=false; break; }
    }
    if(ok) return {x,y};
  }
  return { x: rand(pad, rect.width-w-pad), y: rand(pad, rect.height-h-pad) };
}
function rectOverlap(x1,y1,w1,h1, x2,y2,w2,h2, m=0){
  return !(x1+w1+m < x2 || x2+w2+m < x1 || y1+h1+m < y2 || y2+h2+m < y1);
}
function clampIntoAndAvoid(item, rect, pad){
  let x = clamp(item.x, pad, rect.width  - item.w - pad);
  let y = clamp(item.y, pad, rect.height - item.h - pad);
  for(const it of items){
    if(it === item) continue;
    if(rectOverlap(x,y,item.w,item.h, it.x,it.y,it.w,it.h, 8)){
      const ax = x + item.w/2, ay = y + item.w/2;
      const bx = it.x + it.w/2, by = it.y + it.h/2;
      const dx = ax - bx, dy = ay - by;
      const d  = Math.hypot(dx,dy) || 1;
      const nx = dx/d, ny = dy/d;
      x += nx * 12; y += ny * 12;
      x = clamp(x, pad, rect.width  - item.w - pad);
      y = clamp(y, pad, rect.height - item.h - pad);
    }
  }
  return {x,y};
}

/* ================== 메인 루프(느린 유영) ================== */
function tick(ts){
  if(prevTs==null) prevTs=ts;
  let dt=ts-prevTs; prevTs=ts;
  dt = clamp(dt, 8, 40);

  const rect=wrap.getBoundingClientRect();

  // 분리 힘 초기화
  for(const a of items){ a.ax=0; a.ay=0; }

  // 분리 힘
  for(let i=0;i<items.length;i++){
    for(let j=i+1;j<items.length;j++){
      const a=items[i], b=items[j];
      const ax=a.x+a.w*0.5, ay=a.y+a.h*0.5;
      const bx=b.x+b.w*0.5, by=b.y+b.h*0.5;
      const dx=ax-bx, dy=ay-by;
      const dist=Math.hypot(dx,dy) || 0.0001;
      const radius  = Math.max(a.sepRadius, b.sepRadius);
      const minSep = (Math.max(a.w,a.h)+Math.max(b.w,b.h))*0.45;

      if(dist < radius){
        const strength = (1 - dist/radius) * (a.sepStrength + b.sepStrength)*0.5;
        const nx = dx/dist, ny = dy/dist;
        a.ax +=  nx * strength; a.ay +=  ny * strength;
        b.ax += -nx * strength; b.ay += -ny * strength;
      }
      if(dist < minSep){
        const nx = dx/dist, ny = dy/dist;
        const extra = 0.0004;
        a.ax +=  nx * extra; a.ay +=  ny * extra;
        b.ax += -nx * extra; b.ay += -ny * extra;
      }
    }
  }

  // 업데이트
  for(const it of items){
    it.wanderTheta += (Math.random()*2-1) * it.wanderJitter * dt;
    it.ax += Math.cos(it.wanderTheta) * it.maxForce * 0.25;
    it.ay += Math.sin(it.wanderTheta) * it.maxForce * 0.25;

    const m=it.wallMargin;
    if(it.x < m)                           it.ax += ( (m-it.x) / m) * it.wallForce;
    if(it.x + it.w > rect.width  - m)      it.ax -= ( (it.x+it.w - (rect.width-m)) / m) * it.wallForce;
    if(it.y < m)                           it.ay += ( (m-it.y) / m) * it.wallForce;
    if(it.y + it.h > rect.height - m)      it.ay -= ( (it.y+it.h - (rect.height-m)) / m) * it.wallForce;

    it.vx += it.ax * dt; it.vy += it.ay * dt;

    let sp = Math.hypot(it.vx,it.vy);
    if(sp < it.minSpeed){ const k = it.minSpeed / (sp||1); it.vx*=k; it.vy*=k; sp=it.minSpeed; }
    if(sp > it.maxSpeed){ const k = it.maxSpeed / sp;      it.vx*=k; it.vy*=k; }

    it.x += it.vx * dt; it.y += it.vy * dt;

    it.x = clamp(it.x, EDGE_PAD, rect.width  - it.w - EDGE_PAD);
    it.y = clamp(it.y, EDGE_PAD, rect.height - it.h - EDGE_PAD);

    it.phase += 0.0007 * dt;
    const rot = Math.sin(it.phase) * 0.4;
    const scl = 1 + Math.sin(it.phase*0.8)*0.005;

    it.node.style.transform = `translate3d(${it.x}px,${it.y}px,0) rotate(${rot}deg) scale(${scl})`;
  }

  // 프레임별 호버 판정
  let hoveredSrc=null;
  for(const it of items){
    if(pointer.x>=it.x && pointer.x<=it.x+it.w && pointer.y>=it.y && pointer.y<=it.y+it.h){
      hoveredSrc = SOURCES[it.index]; break;
    }
  }
  if(hoveredSrc) showBackground(hoveredSrc); else hideBackground();

  requestAnimationFrame(tick);
}

/* ================== 최소 팝업 ================== */
function openPopup(idx){
  // 비디오 준비
  popupVideo.src = SOURCES[idx];
  popupVideo.currentTime = 0;
  popupVideo.play().catch(()=>{});

  // 캡션: video.js(window.CAPTIONS) 우선, 없으면 폴백 사용. 그래도 없으면 "—"
  const list = (Array.isArray(window.CAPTIONS) && window.CAPTIONS.length)
    ? window.CAPTIONS
    : CAPTIONS_FALLBACK;
  const rawCap = (typeof list[idx] === 'string') ? list[idx].trim() : "";
  popCaption.textContent = rawCap || "—";

  // 팝업 열기
  popup.classList.add('open');
  popup.setAttribute('aria-hidden','false');

  // 닫기: 오버레이 클릭 / Esc
  const onBackdrop = (e)=>{ if(e.target === popup) closePopup(); };
  const onEsc = (e)=>{ if(e.key==='Escape') closePopup(); };
  popup.addEventListener('click', onBackdrop, {once:true});
  window.addEventListener('keydown', onEsc, {once:true});
}

function closePopup(){
  popup.classList.remove('open');
  popup.setAttribute('aria-hidden','true');
  popupVideo.pause();
  popupVideo.removeAttribute('src');
  popupVideo.load();
  popCaption.textContent = '—';
}

/* ================== 부팅 ================== */
function init(){ createVideos(); requestAnimationFrame(tick); }
if(document.readyState === 'loading'){ document.addEventListener('DOMContentLoaded', init); }
else{ init(); }
