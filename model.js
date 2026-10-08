(function(root){'use strict';
const names=['L5','L6','L8','L11','E20'];
function deleted(c,step,construction='E20'){return c.eligible[construction]&&step>0&&c.threshold<=step/100+1e-12;}
function sample(data,radius,step,construction='E20'){const ids=[];let removed=0;for(let i=0;i<data.centres.length;i++){const c=data.centres[i];if(Math.hypot(...c.x)<=radius+1e-10){ids.push(i);if(deleted(c,step,construction))removed++;}}return{ids,total:ids.length,removed,retained:ids.length-removed};}
function validate(radius,step,construction='E20'){if(!names.includes(construction))throw new Error('Unknown construction.');if(!Number.isInteger(radius)||radius<8||radius>60||!Number.isInteger(step)||step<0||step>100)throw new Error('Radius must be an integer from 8 to 60; progress must be an integer from 0 to 100.');}
const api={deleted,sample,validate};if(typeof module!=='undefined')module.exports=api;root.CoveringModel=api;
})(typeof window==='undefined'?globalThis:window);
