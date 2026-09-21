import {cadReference} from './cad-reference.mjs?v=20260921-compact';
import {evaluate,models,Workbook,display} from './chooser.mjs?v=20260921-compact';
import {cadCanvas} from './cad-primitives.mjs';

const number=n=>String(Math.round(n*1000)/1000);
const level=z=>(z>=0?'+':'')+(z/1000).toFixed(3);
const positive=(v,name)=>{const n=Number(v);if(!Number.isFinite(n)||n<=0)throw new Error(`${name}: nhập số lớn hơn 0.`);return n};

// Stop count is a project input, never inferred from workbook travel or rated capacity.
export function sectionGeometry(result,options={}){
 const stops=Number(options.stops??5);
 if(!Number.isInteger(stops)||stops<2||stops>60)throw new Error('Số điểm dừng: nhập số nguyên từ 2 đến 60.');
 let heights;
 if(Array.isArray(options.floorHeights))heights=options.floorHeights.map(v=>positive(v,'Chiều cao từng tầng'));
 else if(String(options.floorHeights??'').trim())heights=String(options.floorHeights).trim().split(/[\s,;]+/).map(v=>positive(v,'Chiều cao từng tầng'));
 else heights=Array(stops-1).fill(positive(options.floorHeight??3300,'Chiều cao tầng'));
 if(heights.length!==stops-1)throw new Error(`Cần đúng ${stops-1} chiều cao tầng cho ${stops} điểm dừng, tính từ dưới lên.`);
 if(heights.some(v=>v>20000))throw new Error('Bản vẽ dự thảo hỗ trợ chiều cao từng tầng đến 20000 mm.');
 const levels=[0];for(const height of heights)levels.push(levels.at(-1)+height);
 const travel=levels.at(-1),inputs={...result.inputs};
 const model=models.find(m=>m.id===result.model);if(!model)throw new Error('Không tìm thấy dòng thang.');
 if(model.inputs.TR)inputs.TR=model.id==='LEHY-L-G'?(travel<=30000?'<=30':'>30'):travel/1000;
 const r=evaluate(result.model,inputs,{en81:result.en81!==false});
 if(r.errors.length)throw new Error('Cấu hình chưa hợp lệ ở hành trình '+number(travel/1000)+' m: '+r.errors.map(e=>e.text).join(' '));
 const w=new Workbook(model).set(r.inputs),source={};
 for(const key of ['BH','OH','PD','HC','HL','HH','BB','B_3','BS','DKWC','KAKK']){
  const value=w.get(key);if(typeof value!=='number'||!Number.isFinite(value)||value<0)throw new Error(`Thiếu kích thước nguồn ${key}.`);
  source[key]={value,cell:model.inputs[key]??model.outputs[key]??model.names[key.toUpperCase()]};
 }
 if(model.inputs.TR)source.TR={value:r.inputs.TR,cell:model.inputs.TR};
 if(model.outputs.HM)source.HM={value:r.outputs.HM,cell:model.outputs.HM};
 const roughHead=['LEHY-G','LEHY-Pro','LEHY-S LEHY-III-S'].includes(r.model)?70:0;
 const openingHeight=r.inputs.HH+roughHead;
 const wall=positive(options.wallThickness??200,'Dày vách / sàn dự thảo');
 if(wall>1000)throw new Error('Dày vách / sàn dự thảo không quá 1000 mm.');
 // Door heads and floor slabs must not overlap. This is a drawing geometry check,
 // not a manufacturer minimum inter-floor height rule.
 if(heights.some(v=>v<openingHeight+wall))throw new Error(`Chiều cao tầng phải từ ${number(openingHeight+wall)} mm để lỗ cửa và sàn dự thảo không chồng nhau.`);
 const mrl=r.model.startsWith('LEHY-L-');
 if(mrl&&Number(options.machineRoomHeight)>0)throw new Error('Dòng không phòng máy: không nhập chiều cao phòng máy.');
 const room=options.machineRoomHeight==null||options.machineRoomHeight===''?(r.outputs.HM??0):Number(options.machineRoomHeight);
 if(!Number.isFinite(room)||room<0||room>10000)throw new Error('Cao phòng máy: nhập 0–10000 mm, hoặc để trống dùng HM nếu nguồn có.');
 if(r.outputs.HM&&room<r.outputs.HM)throw new Error(`Cao phòng máy không được nhỏ hơn HM = ${r.outputs.HM} mm trong bảng tính.`);
 const carFront=source.B_3.value+source.DKWC.value+source.KAKK.value;
 if(carFront+r.inputs.BB>r.outputs.BH||source.B_3.value+source.BS.value>r.outputs.BH)throw new Error('Bao cabin vượt chiều sâu giếng theo dữ liệu nguồn.');
 const top=travel+r.outputs.OH,pit=-r.outputs.PD;
 return {result:r,source,manual:{stops,floorHeights:heights.join(';'),wallThickness:wall,...options.machineRoomHeight!=null&&options.machineRoomHeight!==''?{machineRoomHeight:room}:{}},stops,heights,levels,travel,wall,room,top,pit,carFront,mrl,openingHeight,roughHead,
  warnings:[...!model.inputs.TR?['Dòng này không có đầu vào TR; bảng tính không kiểm tra giới hạn hành trình.']:[],...!room&&!mrl?['Chưa bố trí phòng máy: nguồn không có HM; bổ sung nếu công trình yêu cầu.']:[],...r.inputs.ENTR==='1D/2D-2G'?['Cửa xuyên cabin đang thể hiện hai phía tại mọi điểm dừng; cần xác nhận lịch mở cửa.']:[]]};
}

// Build in the original installation-template axes, then turn upright for SMEC.
// Both orientations retain physical millimetres.
export function sectionDrawingFor(result,options={}){
 const g=sectionGeometry(result,options),r=g.result,i=r.inputs,o=r.outputs;
 const {wall,travel,top,pit,levels,heights,room}=g;
 const reference=cadReference(r,'section');
 const vertical=options.orientation!=='horizontal';
 const h=110,step=400;
 const {entities,dimensions,line,text,rect,axis,dh,dv,wallRect}=cadCanvas(h);
 const slabReach=850;
 const sectionWall=side=>{
  let cursor=pit;
  for(const z of levels){wallRect(-z,side,z-cursor,wall);cursor=z+g.openingHeight;}
  wallRect(-top,side,top-cursor,wall);
 };
 sectionWall(-wall);
 if(i.ENTR==='1D/2D-2G')sectionWall(o.BH);else wallRect(-top,o.BH,top-pit,wall);
 wallRect(-top-wall,-wall,wall,o.BH+2*wall);wallRect(-pit,-wall,wall,o.BH+2*wall);
 for(const [n,z] of levels.entries()){
  const x=-z;
  wallRect(x,-slabReach,wall,slabReach-wall);
  line(x,-slabReach,x,0,'WALL');
  // Door leaf in section, with clear opening HH. No invented lintel/reinforcement detail.
  line(x,0,x-i.HH,0,'DOOR');line(x,35,x-i.HH,35,'DOOR');line(x-i.HH,0,x-i.HH,35,'DOOR');
  if(i.ENTR==='1D/2D-2G'){
   wallRect(x,o.BH+wall,wall,slabReach-wall);
   line(x,o.BH,x-i.HH,o.BH,'DOOR');line(x,o.BH-35,x-i.HH,o.BH-35,'DOOR');
  }
  axis(x,-slabReach-100,x,o.BH+wall+150);
  // Repeated floor markers and levels, following the source sheet's reading direction.
  line(x,-1050,x,-1690,'DIM');line(x,-1050,x-100,-1200,'TEXT');line(x-100,-1200,x+100,-1200,'TEXT');line(x+100,-1200,x,-1050,'TEXT');
  text(x+140,-1390,`ĐD ${String(n+1).padStart(2,'0')}`,'TEXT',h);
  text(x+140,-1580,level(z),'TEXT',h);
  if(n<heights.length)dh(-levels[n+1],x,o.BH+wall,o.BH+wall+step,number(heights[n]));
 }
 // Cabin body at lowest stop. HC/HL and front offset are source-derived; the
 // assembly below the floor, sling, buffers and roping are deliberately unspecified.
 const y=g.carFront,outerY=g.source.B_3.value,outerDepth=g.source.BS.value;
 rect(-o.HC,outerY,o.HC,outerDepth,'CABIN');
 rect(-i.HL,y,i.HL,i.BB,'CABIN');
 line(-i.HH,outerY,-i.HH,y,'DOOR');
 line(0,y,-i.HL,y+i.BB,'CENTER');line(0,y+i.BB,-i.HL,y,'CENTER');
 text(-i.HL+120,y+i.BB/2,'CABIN','CABIN',h*.85);
 dh(-i.HL,0,outerY,-560,`HL = ${number(i.HL)}`);
 dh(-i.HH,0,0,-950,`HH = ${number(i.HH)}`);
 dh(-top,-travel,o.BH+wall,o.BH+wall+step*2,`OH = ${number(o.OH)}`);
 dh(-travel,0,o.BH+wall,o.BH+wall+step*2,`TR = ${number(travel)}`);
 dh(0,-pit,o.BH+wall,o.BH+wall+step*2,`PIT = ${number(o.PD)}`);
 dh(-top,-pit,o.BH+wall,o.BH+wall+step*3,`OH + TR + PIT = ${number(top-pit)}`);
 dv(0,o.BH,-pit,-pit+step*1.7,`BH = ${number(o.BH)}`);
 let left=-top-wall;
 if(room){
  const roomFloor=top+wall,roomTop=roomFloor+room;
  wallRect(-roomTop,-wall,room,wall);wallRect(-roomTop,o.BH,room,wall);wallRect(-roomTop-wall,-wall,wall,o.BH+2*wall);
  text(-roomTop+200,o.BH/2,'PHÒNG MÁY','TEXT',h);
  dh(-roomTop,-roomFloor,o.BH+wall,o.BH+wall+step*2,`HM = ${number(room)}`);
  left=-roomTop-wall;
 }
 if(vertical){
  const point=([x,y])=>[y,-x];
  for(const e of entities){
   if(e.type==='line'){[e.x1,e.y1]=point([e.x1,e.y1]);[e.x2,e.y2]=point([e.x2,e.y2]);}
   else{[e.x,e.y]=point([e.x,e.y]);if(e.layer==='DIMTEXT')e.rotation=e.rotation===90?0:90;}
  }
  for(const d of dimensions){
   for(const k of ['a','b','location','text'])d[k]=point(d[k]);d.rotation=d.rotation===90?0:90;
   if(d.rotation===90){
    const e=entities[d.end-1],mid=(d.a[1]+d.b[1])/2;
    e.x=d.location[0]-h*.4;e.y=mid-d.label.length*h*.22;
    d.text=[e.x,mid];
   }
  }
  // Keep the floor name and elevation on separate lines after turning the section.
  for(const [n,z] of levels.entries()){
   const name=entities.find(e=>e.type==='text'&&e.value===`ĐD ${String(n+1).padStart(2,'0')}`);
   const elevation=entities.find(e=>e.type==='text'&&e.value===level(z));
   name.x=-2050;name.y=z+150;elevation.x=-2050;elevation.y=z-80;
  }
 }
 // The SMEC manufacturer sections are upright. Keep a compact, readable title strip.
 const drawingTop=room?top+wall+room+wall:top+wall;
 left=vertical?-2200:left-700;
 const right=vertical?o.BH+wall+step*4.8:-pit+1700;
 const upper=vertical?drawingTop+900:o.BH+wall+step*4.8;
 const bottom=vertical?pit-2400:-3600;
 const stripTop=vertical?pit-600:-1980;
 text(left+250,upper-300,`MẶT CẮT DỌC HỐ THANG · ${g.stops} ĐIỂM DỪNG`,'TEXT',h*1.35);
 const mid=left+(right-left)*.52;
 line(left,stripTop,right,stripTop,'FRAME');line(mid,stripTop,mid,bottom,'FRAME');
 const size=Math.min(h,(mid-left-400)/70/.6);
 const yy=n=>stripTop-260-n*220;
 text(left+220,yy(0),`${r.model} · ${i.CAP} kg · ${i.SPD} m/s · ${display(i.DRKI)}`,'TEXT',size*1.15);
 text(left+220,yy(1),`Giếng AH × BH: ${o.AH} × ${o.BH} | Cabin AA × BB: ${i.AA} × ${i.BB} mm`,'TEXT',size);
 text(left+220,yy(2),`Hành trình ${number(travel/1000)} m | OH ${o.OH} | PIT ${o.PD} | HC ${o.HC} mm`,'TEXT',size);
 text(left+220,yy(3),'Cốt ±0.000 tại điểm dừng thấp nhất; cao độ ghi bằng m. Hình học / DIM: mm.','NOTES',size);
 text(left+220,yy(4),`Vách / sàn ${wall} mm dự thảo. ${g.roughHead?`Lỗ cửa HH+${g.roughHead}=${g.openingHeight} mm theo mẫu.`:'Cửa thể hiện thông thủy HH.'}`,'NOTES',size);
 text(left+220,yy(5),'Chưa triển khai máy kéo, cáp, giảm chấn, dầm và liên kết ray.','NOTES',size);
 const noteSize=Math.min(h,(right-mid-420)/87/.6);
 text(mid+220,yy(0),'VIỆT CHÀO | MẶT CẮT DỰ THẢO | MC-01','TEXT',noteSize*1.2);
 text(mid+220,yy(1),g.mrl?'KHÔNG PHÒNG MÁY':room?'CÓ PHÒNG MÁY':'PHÒNG MÁY: CHƯA CÓ CHIỀU CAO','TEXT',noteSize);
 text(mid+220,yy(5),reference.file?'Mẫu: '+reference.file:reference.basis,'NOTES',noteSize*.85);
 for(const [n,note] of g.warnings.entries())text(mid+220,yy(2+n),note,'NOTES',noteSize);
 text(mid+220,bottom+170,`${r.en81===false?'EN 81-20: OFF | ':''}Nguồn: ${r.file}`,'NOTES',noteSize*.8);
 rect(left,bottom,right-left,upper-bottom,'FRAME');
 return {kind:'section',reference,orientation:vertical?'vertical':'horizontal',entities,dimensions,bounds:{left:left-150,right:right+150,bottom:bottom-150,top:upper+150},result:r,geometry:g,
  provenance:[reference.file?`Section reference: ${reference.file}; SHA-256: ${reference.sha256}`:reference.basis,vertical?'Section axes: X=shaft depth; Y=elevation.':'Section axes: X=-elevation; Y=shaft depth.',`Stops = ${g.stops}; floor heights bottom-up mm = ${heights.join(';')}`,`Datum lowest stop=0; travel=${travel} mm; top=${top} mm; pit=${pit} mm`,...g.warnings],
  filename:`VietChao-${r.model.replace(/[^a-zA-Z0-9-]/g,'_')}-${i.CAP}kg-${g.stops}stops-SECTION-DRAFT`};
}
