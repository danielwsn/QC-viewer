'use strict';
(() => {
  const grid = window.COVERING_GRID, data = window.COVERING_DATA;
  const names = ['L5','L6','L8','L11','E20'];
  const nodes = new Map(grid.samples.map(p => [p.id, p]));
  const cache = new Map();
  const normals = Array.from({length:10}, (_,i) => [Math.cos((i+.5)*Math.PI/5),Math.sin((i+.5)*Math.PI/5)]);
  const apothem = data.tau*Math.cos(Math.PI/10);
  function sample(id) {
    const node = nodes.get(id);
    if (!node) throw new Error('Unknown window centre.');
    if (id === 'original') return data;
    if (cache.has(id)) return cache.get(id);
    const centres = node.centreRows.map(([pool, bits, template]) => {
      const p = grid.pool[pool], y = p.z.map((v,i) => v-node.offset[i]);
      return {label:p.label, x:p.x, y,
        eligible:Object.fromEntries(names.map((name,i) => [name, Boolean(bits & (1<<i))])),
        threshold:Math.max(...normals.map(n => n[0]*y[0]+n[1]*y[1]))/apothem,
        replacement:template < 0 ? [] : grid.templates[template].map(poly => poly.map(q => [q[0]+p.x[0], q[1]+p.x[1]])),
        neighbors:[]};
    });
    const index = new Map(centres.map((c,i) => [c.label.join(','),i]));
    for (const c of centres) {
      c.neighbors = grid.neighbourShifts.map(v => index.get(c.label.map((n,i)=>n+v[i]).join(','))).filter(i=>i!==undefined);
    }
    const pentagons = node.pentagonIds.flatMap((ids,k) => ids.map(i => {
      const x = grid.pool[i].x;
      return grid.pentagonShapes[k].map(p => [p[0]+x[0],p[1]+x[1]]);
    }));
    const result = {centres,pentagons};
    cache.set(id,result);
    if (cache.size > 8) cache.delete(cache.keys().next().value);
    return result;
  }
  function nearest(x,y) {
    if (![x,y].every(Number.isFinite)) throw new Error('Enter two finite centre coordinates.');
    if (!grid.axis) {
      let best=grid.samples[0],distance=Infinity;
      for(const p of grid.samples){const d=Math.hypot(x-p.offset[0],y-p.offset[1]);if(d<distance){best=p;distance=d;}}
      return best;
    }
    const axis = grid.axis, step = axis[1]-axis[0];
    const index = v => Math.max(0,Math.min(axis.length-1,Math.round((v-axis[0])/step)));
    return grid.samples[index(y)*axis.length+index(x)];
  }
  function direction(id,dx,dy) {
    const origin=nodes.get(id);
    if(grid.axis){const step=grid.axis[1]-grid.axis[0];return nearest(origin.offset[0]+dx*step,origin.offset[1]+dy*step);}
    let best=origin,score=Infinity;
    for(const p of grid.samples){
      const x=p.offset[0]-origin.offset[0],y=p.offset[1]-origin.offset[1],projection=x*dx+y*dy;
      if(projection<=1e-9)continue;
      const distance=Math.hypot(x,y),value=distance**3/projection**2;
      if(value<score){score=value;best=p;}
    }
    return best;
  }
  window.CoveringGrid = {sample,nearest,direction,node:id=>nodes.get(id)};
})();
