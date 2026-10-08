'use strict';
(() => {
  const data = window.COVERING_DATA, phases = window.COVERING_GRID;
  const M = window.CoveringModel, G = window.CoveringGrid, P = window.CoveringPrime, $ = id => document.getElementById(id);
  const F = window.CoveringDiffraction;
  if (!data || !phases) {
    $('error').hidden = false;
    $('error').textContent = 'Geometry data could not be loaded. Keep all supplied files beside this page.';
    return;
  }
  const state = {radius:40, step:100, selected:0, construction:'E20′', phaseId:'original'};
  const colors = {window:'#a8d8ed', grey:'#858c95', dot:'#187da0', line:'#526a75', highlight:'#d86623', 5:'#eabf76', 6:'#ab94cd', 10:'#afd7e1'};
  let sample = data, activePhase = G.node('original'), offset = [0, 0];
  let current, internalMap, physicalMap, scheduled = false, acceptedLabels = new Set();
  let drag = null, pendingPhase = null, suppressClick = false;
  let meshKey='',mesh=[],diffractionKey='',diffraction=null,diffractionResult=null,diffractionMap=null;
  let diffractionRaster=null,rasterSize=0;
  const candidates = phases.pool.filter(c => Math.hypot(...c.x) <= 60 && Math.max(...c.z.map(Math.abs)) <= phases.internalBound);
  const key = label => label.join(',');
  const fnum = (n, d=4) => n.toFixed(d);
  const centreDigits = phases.coordinateDigits || 2;
  const pct = n => (100*n).toFixed(3)+'%';
  const shifted = (shape, c) => shape.map(p => [p[0]+c[0], p[1]+c[1]]);
  const internalPoint = c => [c.y[0]+offset[0], c.y[1]+offset[1]];
  const selectedLabel = () => sample.centres[state.selected]?.label;
  const isPrime = () => state.construction === P.name;
  const geometryKey = () => [state.phaseId,state.construction,state.step].join(':');
  const spectrumKey = () => [geometryKey(),state.radius].join(':');
  function physicalPolygons(){
    const k=geometryKey();if(k===meshKey)return mesh;
    meshKey=k;
    if(isPrime()){mesh=P.geometry(sample,state.step);return mesh;}
    mesh=[];
    for(const c of sample.centres)if(!M.deleted(c,state.step,state.construction))mesh.push(shifted(data.decagon,c.x));
    mesh.push(...sample.pentagons);
    for(const c of sample.centres)if(M.deleted(c,state.step,state.construction))mesh.push(...c.replacement);
    return mesh;
  }

  function activatePhase(id) {
    const next = G.node(id);
    if (!next) throw new Error('Unknown translation position.');
    const previous = selectedLabel();
    activePhase = next;
    sample = isPrime() ? P.sample(id) : G.sample(id);
    state.phaseId = id;
    offset = next.offset.slice();
    acceptedLabels = new Set(sample.centres.filter(c=>!c.primeAddition).map(c => key(c.label)));
    const match = previous ? sample.centres.findIndex(c => key(c.label) === key(previous)) : -1;
    state.selected = match >= 0 ? match : sample.centres.findIndex(c => c.eligible[state.construction] && Math.hypot(...c.x) < 8);
    if (state.selected < 0) state.selected = 0;
    $('selectionNotice').textContent = previous && match < 0
      ? `Previous label (${previous.join(', ')}) is outside this sample. Another centre is selected.` : '';
  }

  function setup(canvas) {
    const r = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(r.width*dpr); canvas.height = Math.round(r.height*dpr);
    const ctx = canvas.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,r.width,r.height);
    return {ctx,w:r.width,h:r.height};
  }
  function coordinate(w,h,bound,pad=48) {
    const side=Math.max(40,Math.min(w-pad-16,h-pad-18)),left=pad+(w-pad-16-side)/2,top=12+(h-pad-18-side)/2,s=side/(2*bound);
    return {left,top,side,s,bound,xy:p=>[left+side/2+p[0]*s,top+side/2-p[1]*s]};
  }
  function polygon(ctx,points,map,fill,stroke=colors.line,lw=.65) {
    ctx.beginPath(); points.forEach((p,i)=>{const q=map.xy(p);i?ctx.lineTo(...q):ctx.moveTo(...q);}); ctx.closePath();
    if(fill){ctx.fillStyle=fill;ctx.fill();} if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lw;ctx.stroke();}
  }
  function regions(ctx,polys,map,fill,translation=[0,0]) {
    ctx.beginPath();
    for(const rings of polys) for(const ring of rings) {
      ring.forEach((p,i)=>{const q=map.xy([p[0]+translation[0],p[1]+translation[1]]);i?ctx.lineTo(...q):ctx.moveTo(...q);});
      ctx.closePath();
    }
    ctx.fillStyle=fill;ctx.fill('evenodd');
  }
  function axes(ctx,map,xlabel,ylabel) {
    ctx.strokeStyle='#b9c8d2';ctx.lineWidth=.8;ctx.strokeRect(map.left,map.top,map.side,map.side);
    ctx.fillStyle='#547082';ctx.font='12px Segoe UI, sans-serif';ctx.textAlign='center';
    for(const t of [-1,-.5,0,.5,1]) {
      const v=t*map.bound,q=map.xy([v,v]);ctx.fillText(Number(v.toFixed(1)),q[0],map.top+map.side+18);
      ctx.textAlign='right';ctx.fillText(Number(v.toFixed(1)),map.left-7,q[1]+4);ctx.textAlign='center';
    }
    ctx.font='14px Segoe UI, sans-serif';ctx.fillText(xlabel,map.left+map.side/2,map.top+map.side+39);
    ctx.save();ctx.translate(15,map.top+map.side/2);ctx.rotate(-Math.PI/2);ctx.fillText(ylabel,0,0);ctx.restore();
  }
  function point(ctx,p,map,fill,r=2.5,cross=false) {
    const q=map.xy(p);ctx.strokeStyle=fill;ctx.fillStyle=fill;ctx.beginPath();
    if(cross){ctx.lineWidth=1.1;ctx.moveTo(q[0]-r,q[1]-r);ctx.lineTo(q[0]+r,q[1]+r);ctx.moveTo(q[0]-r,q[1]+r);ctx.lineTo(q[0]+r,q[1]-r);ctx.stroke();}
    else{ctx.arc(q[0],q[1],r,0,Math.PI*2);ctx.fill();}
  }
  function highlight(ctx,p,map) {
    const q=map.xy(p);ctx.beginPath();ctx.arc(...q,7,0,Math.PI*2);ctx.strokeStyle=colors.highlight;ctx.lineWidth=2.5;ctx.stroke();point(ctx,p,map,colors.highlight,2.8);
  }
  function drawOriginalWindow(ctx,map) {
    if (Math.hypot(...offset) < 1e-10) return;
    ctx.save();ctx.setLineDash([5,4]);
    polygon(ctx,data.window,map,null,'#627f91',1.2);
    ctx.restore();
  }
  function drawInternal() {
    const {ctx,w,h}=setup($('internal')),map=coordinate(w,h,phases.internalBound);internalMap=map;
    polygon(ctx,shifted(data.window,offset),map,colors.window);
    regions(ctx,data.constructions[state.construction].frames[state.step].paths,map,colors.grey,offset);
    if(isPrime())regions(ctx,data.constructions[P.name].frames[state.step].addedPaths,map,'#c34259',offset);
    for(const c of candidates)
      if(Math.hypot(...c.x)<=state.radius && !acceptedLabels.has(key(c.label)))point(ctx,c.z,map,'#9aa4ac',current.total>450?1.2:1.7);
    const rr=current.total>450?1.6:2.5;
    for(const i of current.ids){const c=sample.centres[i],del=M.deleted(c,state.step,state.construction);point(ctx,internalPoint(c),map,del?'#434f59':c.primeAddition?'#b12d42':colors.dot,rr,del);}
    drawOriginalWindow(ctx,map);
    const c=sample.centres[state.selected];if(c&&current.ids.includes(state.selected))highlight(ctx,internalPoint(c),map);
    axes(ctx,map,'Internal coordinate 1','Internal coordinate 2');
  }
  function drawPhysical() {
    const{ctx,w,h}=setup($('physical')),map=coordinate(w,h,state.radius*1.04);physicalMap=map;
    ctx.save();const q=map.xy([0,0]);ctx.beginPath();ctx.arc(...q,state.radius*map.s,0,2*Math.PI);ctx.clip();
    for(const p of physicalPolygons()){
      ctx.globalAlpha=p.length===10&&!isPrime()?.84:1;polygon(ctx,p,map,colors[p.length]);
    }
    ctx.globalAlpha=1;if(isPrime())drawChains(ctx,map);
    const c=sample.centres[state.selected];
    if(c&&current.ids.includes(state.selected)){ctx.setLineDash([4,3]);polygon(ctx,shifted(data.decagon,c.x),map,null,colors.highlight,2);ctx.setLineDash([]);highlight(ctx,c.x,map);}
    ctx.restore();axes(ctx,map,'x₁ / edge','x₂ / edge');
  }
  function drawChains(ctx,map,origin=[0,0]) {
    for(const triple of P.triples(sample,state.step)){
      const relative=triple.map(p=>[p[0]-origin[0],p[1]-origin[1]]);
      for(const c of relative)polygon(ctx,shifted(data.decagon,c),map,null,'#b12d42',1.8);
      ctx.beginPath();relative.forEach((p,i)=>{const q=map.xy(p);i?ctx.lineTo(...q):ctx.moveTo(...q);});
      ctx.strokeStyle='#b12d42';ctx.lineWidth=1.5;ctx.setLineDash([3,3]);ctx.stroke();ctx.setLineDash([]);
      for(const c of relative)point(ctx,c,map,'#b12d42',2.5);
    }
  }
  function drawDetail() {
    const{ctx,w,h}=setup($('detail')),map=coordinate(w,h,4.3,8),c=sample.centres[state.selected];if(!c)return;
    const local=p=>p.map(v=>[v[0]-c.x[0],v[1]-c.x[1]]);
    if(isPrime()){
      ctx.save();ctx.beginPath();ctx.rect(0,0,w,h);ctx.clip();
      for(const p of P.geometry(sample,state.step)){
        const mid=p.reduce((a,v)=>a.map((x,k)=>x+v[k]/p.length),[0,0]);
        if(Math.hypot(mid[0]-c.x[0],mid[1]-c.x[1])<7)polygon(ctx,local(p),map,colors[p.length]);
      }
      drawChains(ctx,map,c.x);ctx.restore();highlight(ctx,[0,0],map);return;
    }
    if(c.eligible[state.construction])for(const j of c.neighbors)polygon(ctx,shifted(data.decagon,[sample.centres[j].x[0]-c.x[0],sample.centres[j].x[1]-c.x[1]]),map,colors[10]);
    if(M.deleted(c,state.step,state.construction)){for(const p of c.replacement)polygon(ctx,local(p),map,colors[p.length]);ctx.setLineDash([4,3]);polygon(ctx,data.decagon,map,null,colors.highlight,1.5);ctx.setLineDash([]);}
    else polygon(ctx,data.decagon,map,colors[10],colors.highlight,1.5);
  }
  const magma=[[0,0,4],[10,8,34],[29,17,71],[54,16,107],[81,18,124],[106,28,129],[131,38,129],[156,46,127],[183,55,121],[208,65,111],[231,82,99],[245,107,92],[252,137,97],[254,167,114],[254,196,136],[253,226,163],[252,253,191]];
  function spectrumRaster(result,size){
    if(diffractionRaster&&rasterSize===size)return diffractionRaster;
    const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
    const ctx=canvas.getContext('2d'),pixels=ctx.createImageData(size,size),source=result.intensity,n=result.size;
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      // Keep narrow Bragg peaks visible when the full reciprocal grid is
      // reduced to the panel's pixel size; retain the raw grid for readout.
      let intensity=0;
      for(let j=Math.floor(y*n/size);j<Math.ceil((y+1)*n/size);j++)for(let i=Math.floor(x*n/size);i<Math.ceil((x+1)*n/size);i++)intensity=Math.max(intensity,source[j*n+i]);
      const t=Math.min(1,Math.log1p(intensity)/result.logCeiling)*16,k=Math.min(15,Math.floor(t)),f=t-k,index=4*(y*size+x);
      for(let c=0;c<3;c++)pixels.data[index+c]=Math.round(magma[k][c]*(1-f)+magma[k+1][c]*f);
      pixels.data[index+3]=255;
    }
    ctx.putImageData(pixels,0,0);diffractionRaster=canvas;rasterSize=size;return canvas;
  }
  function drawDiffraction(){
    const {ctx,w,h}=setup($('diffraction')),bound=diffractionResult?.extent||10,map=coordinate(w,h,bound);diffractionMap=map;
    ctx.fillStyle='#000004';ctx.fillRect(map.left,map.top,map.side,map.side);
    if(diffractionResult){
      const size=Math.min(diffractionResult.size,Math.max(1,Math.round(map.side*Math.min(devicePixelRatio||1,2))));
      ctx.imageSmoothingEnabled=false;ctx.drawImage(spectrumRaster(diffractionResult,size),map.left,map.top,map.side,map.side);
    }else{
      ctx.fillStyle='#d1c3df';ctx.font='13px Segoe UI, sans-serif';ctx.textAlign='center';ctx.fillText($('diffraction').dataset.status==='error'?'Calculation unavailable':'Calculating diffraction…',map.left+map.side/2,map.top+map.side/2);
    }
    axes(ctx,map,'qₓ (radian / edge)','qᵧ (radian / edge)');
  }
  function requestDiffraction(){
    const k=spectrumKey();if(k===diffractionKey)return;
    diffractionKey=k;
    diffraction.request(k,F.collectVertices(physicalPolygons(),state.radius));
  }
  function update() {
    M.validate(state.radius,state.step,state.construction);
    current=M.sample(sample,state.radius,state.step,state.construction);
    acceptedLabels=new Set(sample.centres.filter(c=>!c.primeAddition||P.active(c.primeAddition,state.step)).map(c=>key(c.label)));
    if(!current.ids.includes(state.selected))state.selected=current.ids[0];
    $('constructionName').textContent=state.construction;$('windowName').textContent=state.construction;$('maskName').textContent=state.construction;
    document.body.classList.toggle('prime-active',isPrime());
    $('progressHelp').textContent=isPrime()?'0–50% builds E20. 50–100% grows the straight-triple selection windows; each local rearrangement is applied as a complete move.':'The parameter t scales a concentric decagonal mask, activating only the selected deletion region inside it.';
    $('windowFormula').hidden=isPrime();$('primeFormula').hidden=!isPrime();$('chainControls').hidden=!isPrime();
    $('chainStatus').textContent=isPrime()?`${current.chains} complete straight triple${current.chains===1?'':'s'} in this observation circle.`:'';
    document.title=state.construction+' | Cut-and-project construction';
    for(const [i,id] of ['centreX','centreY'].entries()) if(document.activeElement!==$(id)) $(id).value=fnum(offset[i],centreDigits);
    $('centreCoordinates').textContent=`Centre = (${offset.map(v=>fnum(v,centreDigits)).join(', ')})`;
    $('resetPhase').disabled=state.phaseId==='original';
    $('radiusValue').textContent=state.radius+' edge lengths';$('progressValue').textContent=state.step+'%';
    $('stage').textContent=state.step===100?`Complete ${state.construction} replacement`:state.step===0?'Reference 5/10 covering':isPrime()?(state.step<=50?'Building E20':'Adding straight triples'):'Partial replacement';
    const frame=data.constructions[state.construction].frames[state.step];
    $('windowStats').textContent=`Fraction of ${state.construction} deletion area activated: `+pct(frame.f/data.constructions[state.construction].frames[100].f);
    $('sampleStats').textContent=`Reference: ${current.total} · Removed: ${current.removed} · Retained: ${current.retained}\nSample deletion fraction: ${pct(current.removed/current.total)}`;
    $('densityStats').textContent=`Deletion fraction f: ${pct(frame.f)}\nOverlap ratio η: ${fnum(frame.eta,10)}\nTHF:H₂O = 1:${fnum(4+12*data.tau-(4*data.tau+2)*frame.eta,5)}`;
    if(isPrime()){
      $('windowStats').textContent=`Added window area |Aₜ| / |W|: ${pct(frame.addedFraction)}`;
      $('sampleStats').textContent=`Reference: ${current.total} · Removed: ${current.removed} · Added: ${current.added} · Retained: ${current.retained}\nComplete straight triples: ${current.chains}`;
      $('densityStats').textContent=`Removed area: ${pct(frame.removedFraction)} · Added area: ${pct(frame.addedFraction)}\nOverlap ratio η: ${fnum(frame.eta,10)}${state.step>=50?' (= E20)':''}\nTHF:H₂O = 1:${fnum(4+12*data.tau-(4*data.tau+2)*frame.eta,5)}`;
    }
    const select=$('centreSelect'),listKey=state.phaseId+':'+state.radius+':'+state.construction+(isPrime()?':'+state.step:'');
    if(select.dataset.sample!==listKey){select.replaceChildren(...current.ids.map(i=>{const o=document.createElement('option');o.value=i;o.textContent=`n = (${sample.centres[i].label.join(', ')})`;return o;}));select.dataset.sample=listKey;}
    select.value=state.selected;
    const c=sample.centres[state.selected];
    let status=M.deleted(c,state.step,state.construction)?'Replaced by two pentagons and one hexagon':c.eligible[state.construction]?`Eligible ${state.construction} centre; replacement not yet activated`:`Decagon retained in ${state.construction}`;
    if(isPrime()){
      if(c.primeAddition)status='Added decagon outside W, part of an E20′ straight triple';
      else if(c.primeRemoval&&P.active(c.primeRemoval,state.step))status='Removed as part of a complete E20′ local rearrangement';
      else if(sample.primeMoves.some(m=>P.active(m,state.step)&&Math.hypot(m.x[0]-c.x[0],m.x[1]-c.x[1])<6))status=M.deleted(c,state.step,P.name)?'Removed E20 centre; surrounding tiles rearranged for E20′':'Retained decagon in the E20′ rearrangement';
    }
    const absoluteY=c.y.map((v,i)=>v+activePhase.phase[i]);
    $('selectedInfo').textContent=`${status}\nx = (${c.x.map(v=>fnum(v,3)).join(', ')}); y = (${absoluteY.map(v=>fnum(v,4)).join(', ')})\ny − (h₀ + h) = (${c.y.map(v=>fnum(v,4)).join(', ')})`;
    drawInternal();drawPhysical();drawDetail();requestDiffraction();drawDiffraction();
  }
  function schedule(){if(!scheduled){scheduled=true;requestAnimationFrame(()=>{scheduled=false;if(pendingPhase){const id=pendingPhase;pendingPhase=null;if(id!==state.phaseId)activatePhase(id);}update();});}}
  function configure(radius,progress,construction=state.construction,phaseId=state.phaseId) {
    M.validate(radius,progress,construction);
    if(!G.node(phaseId))throw new Error('Unknown translation position.');
    pendingPhase=null;
    const changed=construction!==state.construction;
    state.construction=construction;state.radius=radius;state.step=progress;
    if(phaseId!==state.phaseId||changed)activatePhase(phaseId);
    $('construction').value=construction;$('radius').value=radius;$('progress').value=progress;update();return snapshot();
  }
  function snapshot(){return{construction:state.construction,radius:state.radius,progress:state.step,phaseId:state.phaseId,
    phase:activePhase.phase.slice(),translation:offset.slice(),centre:offset.slice(),strategy:phases.strategy||'square',grid:phases.axis?{row:activePhase.row,col:activePhase.col}:null,boundaryClearance:Math.min(activePhase.boundaryClearance,isPrime()?(window.E20_PRIME_DATA.boundaryClearances[state.phaseId]??Infinity):Infinity),
    finite:current&&{total:current.total,removed:current.removed,retained:current.retained,...(isPrime()?{added:current.added,chains:current.chains}:{})},
    density:data.constructions[state.construction].frames[state.step].f,overlapRatio:data.constructions[state.construction].frames[state.step].eta,
    selectedLabel:selectedLabel()?.slice(),diffraction:diffraction?.snapshot()};}
  const setPhase=id=>configure(state.radius,state.step,state.construction,id);
  function setCentre(x,y){const node=G.nearest(x,y);const result=setPhase(node.id);$('centreX').value=fnum(node.offset[0],centreDigits);$('centreY').value=fnum(node.offset[1],centreDigits);return result;}
  $('centreForm').addEventListener('submit',e=>{
    e.preventDefault();
    const x=$('centreX').valueAsNumber,y=$('centreY').valueAsNumber;
    if(![x,y].every(Number.isFinite)){$('centreNotice').textContent='Enter a number for each coordinate.';return;}
    const result=setCentre(x,y);
    $('centreNotice').textContent=Math.hypot(result.centre[0]-x,result.centre[1]-y)>1e-9?'Snapped to the nearest available centre.':'';
  });
  $('resetPhase').addEventListener('click',()=>{setCentre(0,0);$('centreNotice').textContent='';});
  function showTriple(){
    const move=window.E20_PRIME_DATA.instances.original[0];
    configure(Math.max(state.radius,40),100,P.name,'original');
    state.selected=sample.centres.findIndex(c=>key(c.label)===key(move.label));
    $('selectionNotice').textContent='Selected the middle decagon of the certified straight triple at the original window centre.';
    update();return snapshot();
  }
  $('showTriple').addEventListener('click',showTriple);
  $('construction').addEventListener('change',e=>configure(state.radius,state.step,e.target.value));
  $('radius').addEventListener('input',e=>{state.radius=Number(e.target.value);$('selectionNotice').textContent='';schedule();});
  $('progress').addEventListener('input',e=>{state.step=Number(e.target.value);schedule();});
  $('centreSelect').addEventListener('change',e=>{state.selected=Number(e.target.value);$('selectionNotice').textContent='';schedule();});
  for(const id of ['internal','physical'])$(id).addEventListener('click',e=>{
    if(id==='internal'&&suppressClick){suppressClick=false;return;}
    const box=$(id).getBoundingClientRect(),x=e.clientX-box.left,y=e.clientY-box.top,map=id==='internal'?internalMap:physicalMap;let best=-1,dist=22;
    for(const i of current.ids){const c=sample.centres[i],q=map.xy(id==='internal'?internalPoint(c):c.x),dd=Math.hypot(q[0]-x,q[1]-y);if(dd<dist){dist=dd;best=i;}}
    if(best>=0){state.selected=best;$('selectionNotice').textContent='';schedule();}
  });
  const canvas=$('internal');
  function windowHit(e){
    const b=canvas.getBoundingClientRect(),p=internalMap.xy(offset);
    const x=(e.clientX-b.left-p[0])/internalMap.s,y=-(e.clientY-b.top-p[1])/internalMap.s;
    return Array.from({length:10},(_,i)=>Math.cos((i+.5)*Math.PI/5)*x+Math.sin((i+.5)*Math.PI/5)*y)
      .every(v=>v<=data.tau*Math.cos(Math.PI/10)+.05);
  }
  canvas.addEventListener('pointerdown',e=>{
    if(e.button!==0||drag||!windowHit(e))return;
    suppressClick=false;
    drag={pointer:e.pointerId,x:e.clientX,y:e.clientY,offset:offset.slice(),scale:internalMap.s,moved:false};
    canvas.setPointerCapture(e.pointerId);canvas.focus({preventScroll:true});
  });
  function moveWindow(e){
    if(!drag||e.pointerId!==drag.pointer)return;
    if(!drag.moved&&Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<4)return;
    drag.moved=true;canvas.classList.add('dragging');$('centreNotice').textContent='';
    const node=G.nearest(drag.offset[0]+(e.clientX-drag.x)/drag.scale,drag.offset[1]-(e.clientY-drag.y)/drag.scale);
    pendingPhase=node.id;schedule();
  }
  canvas.addEventListener('pointermove',e=>{
    if(drag){moveWindow(e);return;}
    canvas.classList.toggle('over-window',windowHit(e));
  });
  function endDrag(e){
    if(!drag||e.pointerId!==drag.pointer)return;
    if(e.type==='pointerup')moveWindow(e);
    suppressClick=drag.moved;drag=null;canvas.classList.remove('dragging');
    if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
  }
  canvas.addEventListener('pointerup',endDrag);canvas.addEventListener('pointercancel',endDrag);
  canvas.addEventListener('lostpointercapture',endDrag);
  canvas.addEventListener('keydown',e=>{
    const shifts={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,1],ArrowDown:[0,-1]};
    if(!shifts[e.key])return;e.preventDefault();
    const d=shifts[e.key],node=G.direction(state.phaseId,d[0],d[1]);setCentre(...node.offset);
  });
  $('diffraction').addEventListener('pointermove',e=>{
    if(!diffractionResult||!diffractionMap)return;
    const box=$('diffraction').getBoundingClientRect(),m=diffractionMap,r=diffractionResult;
    const x=Math.floor((e.clientX-box.left-m.left)/m.side*r.size),y=Math.floor((e.clientY-box.top-m.top)/m.side*r.size);
    if(x<0||y<0||x>=r.size||y>=r.size){$('diffractionPoint').textContent='Hover over a peak to inspect its intensity.';return;}
    $('diffractionPoint').textContent=`q = (${fnum((x-r.cut)*r.dq,3)}, ${fnum((r.cut-y)*r.dq,3)}) · I = ${fnum(r.intensity[y*r.size+x],3)}`;
  });
  $('diffraction').addEventListener('pointerleave',()=>{$('diffractionPoint').textContent='Hover over a peak to inspect its intensity.';});
  diffraction=F.createController({
    onPending(job){
      diffractionResult=null;diffractionRaster=null;
      $('diffraction').dataset.status='computing';$('diffraction').setAttribute('aria-busy','true');
      $('diffractionStatus').textContent=`${job.count.toLocaleString('en-US')} distinct vertices · Updating…`;
      $('diffractionScaleMax').textContent='…';$('diffractionPoint').textContent='Hover over a peak to inspect its intensity.';
    },
    onResult(result){
      diffractionResult=result;diffractionRaster=null;
      $('diffraction').dataset.status='ready';$('diffraction').setAttribute('aria-busy','false');
      $('diffractionStatus').textContent=`${result.count.toLocaleString('en-US')} distinct vertices · |r| ≤ ${state.radius}`;
      $('diffractionPoint').textContent='Hover over a peak to inspect its intensity.';
      $('diffractionScaleMax').textContent=fnum(result.logCeiling,2);drawDiffraction();
    },
    onError(message){
      diffractionResult=null;diffractionRaster=null;
      $('diffraction').dataset.status='error';$('diffraction').setAttribute('aria-busy','false');
      $('diffractionStatus').textContent=message;drawDiffraction();
    }
  });
  window.addEventListener('pagehide',e=>{if(!e.persisted)diffraction.dispose();});
  state.selected=data.centres.findIndex(c=>c.eligible.E20&&Math.hypot(...c.x)<8);
  activatePhase('original');
  state.selected=sample.centres.findIndex(c=>key(c.label)===key(window.E20_PRIME_DATA.instances.original[0].label));
  new ResizeObserver(schedule).observe(document.querySelector('.views'));
  update();window.CoveringApp={configure,snapshot,setPhase,setCentre,showTriple,
    getDiffraction:()=>diffraction.result(),getScatteringVertices:()=>F.collectVertices(physicalPolygons(),state.radius)};
  if(document.modelContext?.registerTool){try{Promise.resolve(document.modelContext.registerTool({
    name:'configure_covering_view',title:'Set construction, translation and observation controls',
    description:'Choose a checked internal translation and update the finite covering view.',
    inputSchema:{type:'object',properties:{construction:{type:'string',enum:['L5','L6','L8','L11','E20','E20′']},
      phase:{type:'string',enum:phases.samples.map(p=>p.id)},radius:{type:'integer',minimum:8,maximum:60},progress:{type:'integer',minimum:0,maximum:100}},
      required:['radius','progress'],additionalProperties:false},annotations:{readOnlyHint:false},
      execute:input=>configure(input.radius,input.progress,input.construction,input.phase)})).catch(()=>{});}catch(_){}}
})();
