/* Finite equal-weight vertex diffraction, using the Figure 1f conventions.
 * Self-contained so the page and its worker also work from a file:// URL.
 */
(function(root){'use strict';
  function collectVertices(polygons,radius) {
    const unique=new Map(),limit=radius*radius;
    for(const poly of polygons)for(const [x,y] of poly){
      // Merge actual vertices before rasterization. Circle/edge intersections
      // produced by clipping the drawing are not additional scatterers.
      const a=Math.round(x*1e8),b=Math.round(y*1e8),px=a/1e8,py=b/1e8;
      if(px*px+py*py<=limit+1e-10)unique.set(a+','+b,[px,py]);
    }
    return Float64Array.from(Array.from(unique.values()).flat());
  }

  function createFourierEngine() {
    let n=0,re,im,reverse,cos,sin;
    function prepare(size){
      if(n===size){re.fill(0);im.fill(0);return;}
      n=size;re=new Float32Array(n*n);im=new Float32Array(n*n);
      reverse=new Uint32Array(n);cos=new Float64Array(n/2);sin=new Float64Array(n/2);
      const bits=Math.log2(n);
      for(let k=0;k<n;k++){let v=k,r=0;for(let b=0;b<bits;b++){r=(r<<1)|(v&1);v>>>=1;}reverse[k]=r;}
      for(let k=0;k<n/2;k++){const a=-2*Math.PI*k/n;cos[k]=Math.cos(a);sin[k]=Math.sin(a);}
    }
    function rowFFT(offset){
      for(let k=0;k<n;k++){
        const j=reverse[k];if(j<=k)continue;
        let t=re[offset+k];re[offset+k]=re[offset+j];re[offset+j]=t;
        t=im[offset+k];im[offset+k]=im[offset+j];im[offset+j]=t;
      }
      for(let length=2;length<=n;length*=2){
        const half=length/2,stride=n/length;
        for(let start=0;start<n;start+=length){
          for(let j=0;j<half;j++){
            const a=offset+start+j,b=a+half,k=j*stride,cr=cos[k],ci=sin[k];
            const br=re[b],bi=im[b],vr=br*cr-bi*ci,vi=br*ci+bi*cr,ar=re[a],ai=im[a];
            re[a]=ar+vr;im[a]=ai+vi;re[b]=ar-vr;im[b]=ai-vi;
          }
        }
      }
    }
    function transpose(){
      const block=32;
      for(let i0=0;i0<n;i0+=block)for(let j0=i0;j0<n;j0+=block){
        for(let i=i0;i<Math.min(i0+block,n);i++)for(let j=Math.max(j0,i+1);j<Math.min(j0+block,n);j++){
          const a=i*n+j,b=j*n+i;let t=re[a];re[a]=re[b];re[b]=t;t=im[a];im[a]=im[b];im[b]=t;
        }
      }
    }
    function roundEven(x){const a=Math.floor(x),d=x-a;return d===.5?(a%2?a+1:a):Math.round(x);}
    function compute(points,options={}){
      const started=performance.now(),gridSize=options.gridSize||4096,boxLength=options.boxLength||192,qMax=options.qMax||10;
      if(gridSize<2||(gridSize&(gridSize-1))||!(boxLength>0)||!(qMax>0))throw Error('Invalid diffraction grid.');
      const count=points.length/2;if(!count||!Number.isInteger(count))throw Error('No valid scattering vertices.');
      prepare(gridSize);const occupiedRows=new Uint8Array(n);let occupied=0;
      for(let k=0;k<points.length;k+=2){
        const x=roundEven((points[k]+boxLength/2)*n/boxLength),y=roundEven((points[k+1]+boxLength/2)*n/boxLength);
        if(x<0||x>=n||y<0||y>=n)throw Error('Scattering point is outside the Fourier box.');
        const index=y*n+x;if(!re[index])occupied++;re[index]++;occupiedRows[y]=1;
      }
      for(let y=0;y<n;y++)if(occupiedRows[y])rowFFT(y*n);
      transpose();
      for(let x=0;x<n;x++)rowFFT(x*n);
      const dq=2*Math.PI/boxLength,cut=Math.min(Math.floor(qMax/dq),n/2-1),size=2*cut+1;
      const intensity=new Float32Array(size*size),logs=new Float32Array(size*size);
      for(let y=0;y<size;y++)for(let x=0;x<size;x++){
        // Rows are qx after the transpose; output rows descend from +qy so
        // a canvas image has the conventional upward-positive qy axis.
        const kx=(x-cut+n)%n,ky=(cut-y+n)%n,index=kx*n+ky,j=y*size+x;
        const value=(re[index]*re[index]+im[index]*im[index])/count;
        intensity[j]=value;logs[j]=Math.log1p(value);
      }
      const sorted=logs.slice().sort(),rank=.9995*(sorted.length-1),lo=Math.floor(rank);
      const ceiling=sorted[lo]+(rank-lo)*(sorted[Math.ceil(rank)]-sorted[lo]);
      return {intensity,size,dq,cut,extent:(cut+.5)*dq,count,occupied,gridSize:n,boxLength,
        logCeiling:Math.max(ceiling,1e-6),milliseconds:performance.now()-started};
    }
    return {compute};
  }

  function createController({onResult,onPending,onError}){
    const source=`'use strict';const engine=(${createFourierEngine.toString()})();self.onmessage=e=>{try{const r=engine.compute(e.data.points);self.postMessage({key:e.data.key,result:r},[r.intensity.buffer]);}catch(error){self.postMessage({key:e.data.key,error:error.message});}};`;
    const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
    const worker=new Worker(url);URL.revokeObjectURL(url);
    const cache=new Map();let wanted=null,pending=null,busy=false,timer=null,latest=null,failed=false,errorMessage=null;
    function pump(){
      timer=null;if(busy||!pending||failed)return;
      const job=pending;pending=null;busy=true;
      worker.postMessage(job,[job.points.buffer]);
    }
    worker.onmessage=e=>{
      busy=false;const {key,result,error}=e.data;
      if(result){cache.set(key,result);if(cache.size>6)cache.delete(cache.keys().next().value);}
      if(key===wanted){if(error){errorMessage=error;onError(error);}else{errorMessage=null;latest={key,...result};onResult(latest);}}
      if(pending){clearTimeout(timer);timer=setTimeout(pump,0);}
    };
    worker.onerror=e=>{failed=true;busy=false;pending=null;onError(e.message||'Diffraction worker failed.');};
    return {
      request(key,points){
        if(key===wanted)return;wanted=key;pending=null;latest=null;errorMessage=null;clearTimeout(timer);
        if(cache.has(key)){latest={key,...cache.get(key)};onResult(latest);return;}
        onPending({key,count:points.length/2});
        if(failed){onError('Diffraction calculation is unavailable. Reload the page to retry.');return;}
        pending={key,points};timer=setTimeout(pump,100);
      },
      snapshot:()=>({requestedKey:wanted,completedKey:latest?.key||null,status:failed||errorMessage?'error':latest?'ready':'computing',
        vertexCount:latest?.count||null,gridSize:latest?.gridSize||4096,boxLength:192}),
      result:()=>latest,
      dispose(){clearTimeout(timer);worker.terminate();}
    };
  }
  const api={collectVertices,createFourierEngine,createController};
  if(typeof module!=='undefined')module.exports=api;root.CoveringDiffraction=api;
})(typeof window==='undefined'?globalThis:window);
