import {drawingFor} from './cad.mjs?v=20260921-compact';
import {sectionDrawingFor} from './cad-section.mjs?v=20260921-compact';

// Recompute travel first so both sheets always share the same workbook result.
export function drawingPairFor(result,options={}){
 const section=sectionDrawingFor(result,options),plan=drawingFor(section.result,options);
 const gap=1000,dx=plan.bounds.right+gap-section.bounds.left,dy=plan.bounds.top-section.bounds.top;
 const move=p=>[p[0]+dx,p[1]+dy];
 const shifted=section.entities.map(e=>e.type==='line'?{...e,x1:e.x1+dx,y1:e.y1+dy,x2:e.x2+dx,y2:e.y2+dy}:{...e,x:e.x+dx,y:e.y+dy});
 const dimensions=section.dimensions.map(d=>({...d,start:d.start+plan.entities.length,end:d.end+plan.entities.length,a:move(d.a),b:move(d.b),location:move(d.location),text:move(d.text)}));
 return {...plan,kind:'pair',sheets:{plan,section},entities:[...plan.entities,...shifted],dimensions:[...plan.dimensions,...dimensions],
  bounds:{left:plan.bounds.left,right:section.bounds.right+dx,top:plan.bounds.top,bottom:Math.min(plan.bounds.bottom,section.bounds.bottom+dy)},
  provenance:[...plan.provenance,`Two sheets, physical millimetres: MB-01 plan; MC-01 section. Section offset ${dx},${dy}.`,...section.provenance,...Object.entries(section.geometry.source).map(([k,v])=>`Section source ${k} = ${v.value} from ${v.cell}`),...Object.entries(section.geometry.manual).map(([k,v])=>`Section project input ${k} = ${v}`)],
  filename:plan.filename.replace('-PLAN-DRAFT',`-${section.geometry.stops}stops-PLAN-SECTION-DRAFT`)};
}
