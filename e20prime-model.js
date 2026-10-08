'use strict';
(() => {
  const data=window.COVERING_DATA, addon=window.E20_PRIME_DATA, G=window.CoveringGrid;
  const base=window.CoveringModel, name='E20′', samples=new Map(), geometryCache=new WeakMap();
  const key=n=>n.join(','), shift=(poly,x)=>poly.map(p=>[p[0]+x[0],p[1]+x[1]]);
  const polygonKey=p=>p.map(v=>v.map(x=>Math.round(x*1e6)).join(',')).sort().join(';');
  const baseStep=step=>Math.min(100,2*step), amount=step=>Math.max(0,(step-50)/50);
  const active=(move,step)=>step>50&&move.threshold<=amount(step)+1e-12;
  function shrink(poly,s) {
    const c=poly.reduce((a,p)=>a.map((v,k)=>v+p[k]/poly.length),[0,0]);
    return poly.map(p=>p.map((v,k)=>c[k]+s*(v-c[k])));
  }
  const frames=Array.from({length:101},(_,step)=>{
    const original=data.constructions.E20.frames[baseStep(step)],s=amount(step);
    const extra=s ? addon.orientations.flatMap(o=>o.removedWindows.map(p=>[shrink(p,s)])) : [];
    const added=s ? addon.orientations.flatMap(o=>o.addedWindows.map(p=>[shrink(p,s)])) : [];
    return {...original,paths:[...original.paths,...extra],addedPaths:added,
      removedFraction:original.f+2*addon.markerDensity*s*s,addedFraction:2*addon.markerDensity*s*s};
  });
  data.constructions[name]={frames};
  function sample(id) {
    if(samples.has(id))return samples.get(id);
    const original=G.sample(id),moves=addon.instances[id],centres=original.centres.map(c=>({...c}));
    const index=new Map(centres.map((c,i)=>[key(c.label),i]));
    for(const move of moves){
      for(const label of move.removedLabels){
        const c=centres[index.get(key(label))];
        if(c)c.primeRemoval=move;
      }
      for(const c of move.addedCentres){
        if(index.has(key(c.label)))throw new Error('E20′ addition already belongs to W.');
        centres.push({...c,eligible:{},replacement:[],neighbors:[],primeAddition:move});
      }
    }
    const result={...original,centres,primeMoves:moves};samples.set(id,result);
    if(samples.size>8)samples.delete(samples.keys().next().value);
    return result;
  }
  function deleted(c,step,construction='E20') {
    if(construction!==name)return base.deleted(c,step,construction);
    if(c.primeAddition)return false;
    return Boolean(c.primeRemoval&&active(c.primeRemoval,step))||base.deleted(c,baseStep(step),'E20');
  }
  function counts(sample,radius,step,construction='E20') {
    if(construction!==name)return base.sample(sample,radius,step,construction);
    const ids=[];let total=0,removed=0,added=0;
    sample.centres.forEach((c,i)=>{
      if(Math.hypot(...c.x)>radius+1e-10)return;
      if(c.primeAddition){if(active(c.primeAddition,step)){added++;ids.push(i);}return;}
      total++;ids.push(i);if(deleted(c,step,name))removed++;
    });
    const chains=sample.primeMoves.filter(m=>active(m,step)&&addon.orientations[m.orientation].triple
      .every(p=>Math.hypot(p[0]+m.x[0],p[1]+m.x[1])<=radius)).length;
    return {ids,total,removed,added,retained:total-removed+added,chains};
  }
  function geometry(sample,step) {
    let cache=geometryCache.get(sample);if(!cache){cache=new Map();geometryCache.set(sample,cache);}
    if(cache.has(step))return cache.get(step);
    const polys=[...sample.pentagons];
    for(const c of sample.centres){
      if(c.primeAddition)continue;
      polys.push(...(base.deleted(c,baseStep(step),'E20')?c.replacement:[shift(data.decagon,c.x)]));
    }
    const map=new Map(polys.map(p=>[polygonKey(p),p]));
    for(const move of sample.primeMoves){
      if(!active(move,step))continue;
      const orient=addon.orientations[move.orientation];
      for(const p of orient.removed)map.delete(polygonKey(shift(p,move.x)));
      for(const p of orient.added){const poly=shift(p,move.x);map.set(polygonKey(poly),poly);}
    }
    const result=Array.from(map.values());cache.set(step,result);
    if(cache.size>3)cache.delete(cache.keys().next().value);
    return result;
  }
  window.CoveringModel={...base,deleted,sample:counts,validate:(r,t,c='E20')=>base.validate(r,t,c===name?'E20':c)};
  window.CoveringPrime={name,sample,geometry,active,baseStep,amount,
    triples:(sample,step)=>sample.primeMoves.filter(m=>active(m,step)).map(m=>shift(addon.orientations[m.orientation].triple,m.x))};
})();
