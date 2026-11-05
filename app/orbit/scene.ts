import {
 BoxGeometry, BufferAttribute, BufferGeometry, Color, ConeGeometry, DataTexture, EdgesGeometry, Group,
 LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, NearestFilter, OctahedronGeometry, OrthographicCamera,
 PerspectiveCamera, PlaneGeometry, Points, Raycaster, RGBAFormat, RingGeometry, Scene, ShaderMaterial,
 SphereGeometry, TorusGeometry, Vector2, Vector3, WebGLRenderer, WebGLRenderTarget,
 DoubleSide, AdditiveBlending, MathUtils, type Material,
} from 'three';

export type OrbitControls = {
 dispose:()=>void; select:(id:string|null)=>void; zoom:(direction:number)=>void;
 reset:()=>void; expand:(expanded:boolean)=>void; setAvailable:(ids:string[])=>void;
};

const ids=['telegram-bot','website','mini-app','video-editing','digital-products','custom'];
const tau=Math.PI*2;
const flatVertex='varying vec2 coord; void main(){coord=uv;gl_Position=vec4(position.xy,0.999,1.0);}';
const meshVertex='varying vec2 coord; void main(){coord=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}';
const backgroundFragment=`
 varying vec2 coord;
 uniform sampler2D stars;
 uniform vec2 lens;
 uniform float aspect, bend;
 uniform vec3 ink, violet;
 void main(){
  vec2 d=(coord-lens)*vec2(aspect,1.0);
  float r=length(d);
  vec2 mapped=coord + (bend*0.0018/(r*r+0.005))*d/vec2(aspect,1.0);
  float star=texture2D(stars,fract(mapped)).r;
  float haze=exp(-2.7*length(d*vec2(1.05,1.75)));
  gl_FragColor=vec4(ink+violet*(0.10*haze+star*0.60),1.0);
 }`;
const diskFragment=`
 varying vec2 coord;
 uniform float time;
 uniform vec3 indigo,violet,ice;
 void main(){
  vec2 p=(coord-.5)*2.0;
  float r=length(p), a=atan(p.y,p.x);
  float track=0.50+0.25*sin(r*72.0-a*4.0+time*.28)+0.14*sin(r*128.0+a*8.0-time*.16);
  float edge=smoothstep(.39,.47,r)*(1.0-smoothstep(.64,1.0,r));
  float bright=0.75+0.25*smoothstep(-1.0,1.0,p.x);
  vec3 light=mix(indigo,violet,track);
  light=mix(light,ice,smoothstep(.62,.84,track)*(1.0-smoothstep(.49,.77,r)));
  gl_FragColor=vec4(light*bright,edge*(.39+track*.57));
 }`;
const haloFragment=`
 varying vec2 coord;
 uniform vec3 color;
 uniform float soft;
 void main(){
  vec2 p=(coord-.5)*2.0;
  float r=length(p*vec2(1.0,.89));
  float glow=exp(-pow((r-.60)/.014,2.0))*.48+exp(-pow((r-.61)/.067,2.0))*(.10+soft*.09);
  gl_FragColor=vec4(color,glow*(.48+.45*abs(p.y)));
 }`;
const dustVertex=`
 attribute vec3 seed;
 uniform float time;
 varying float brightness;
 void main(){
  float angle=seed.y+time*(.022+.009/seed.x);
  vec3 p=vec3(cos(angle)*seed.x,seed.z,sin(angle)*seed.x);
  gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);
  gl_PointSize=1.15;
  brightness=.28+(seed.x-1.5)*.09;
 }`;
const dustFragment='varying float brightness; uniform vec3 color; void main(){gl_FragColor=vec4(color,brightness);}';

function stars(){
 const width=512,height=256,data=new Uint8Array(width*height*4);
 let seed=830417;
 const next=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 for(let i=0;i<740;i++){
  const pixel=(Math.floor(next()*height)*width+Math.floor(next()*width))*4;
  data[pixel]=Math.floor(35+next()*205);
 }
 const texture=new DataTexture(data,width,height,RGBAFormat);
 texture.minFilter=NearestFilter;
 texture.magFilter=NearestFilter;
 texture.needsUpdate=true;
 return texture;
}

function satellite(index:number,materials:Material[]){
 const [surface,edge]=materials;
 const object=new Group();
 const shape=(geometry:BufferGeometry,x=0,y=0,z=0,wire=false)=>{
  if(!wire){const mesh=new Mesh(geometry,surface);mesh.position.set(x,y,z);object.add(mesh);}
  const lines=new LineSegments(new EdgesGeometry(geometry,24),edge);
  lines.position.set(x,y,z);object.add(lines);
  if(wire)geometry.dispose();
 };
 if(index===0){
  shape(new BoxGeometry(.66,.47,.42));shape(new ConeGeometry(.072,.32,8),0,.33,0);
 }else if(index===1){
  shape(new BoxGeometry(.76,.47,.095));shape(new BoxGeometry(.57,.057,.028),0,.13,.052);
 }else if(index===2){
  shape(new BoxGeometry(.37,.68,.09));shape(new BoxGeometry(.14,.04,.021),0,-.24,.05);
 }else if(index===3){
  shape(new TorusGeometry(.27,.07,6,24));shape(new ConeGeometry(.16,.28,3),0,0,.04);
  object.children.slice(-2).forEach(part=>{part.rotation.z=-Math.PI/2;});
 }else if(index===4){
  shape(new OctahedronGeometry(.35));object.scale.y=1.35;
 }else{
  shape(new BoxGeometry(.52,.52,.52),0,0,0,true);
 }
 return object;
}

function initialTier(){
 const device=navigator as Navigator&{deviceMemory?:number};
 const cores=device.hardwareConcurrency||4;
 if((device.deviceMemory??4)<=2||cores<=2)return 1;
 if(matchMedia('(pointer:coarse)').matches||cores<=6)return 2;
 return 3;
}

export function createOrbit(canvas:HTMLCanvasElement,marker:HTMLElement,onSelect:(id:string)=>void,onHover:(id:string|null)=>void,onLoss:()=>void):OrbitControls|null{
 let gl:WebGL2RenderingContext|null=null;
 try{gl=canvas.getContext('webgl2',{alpha:false,antialias:false,powerPreference:'low-power'});}catch{return null;}
 if(!gl)return null;
 let renderer:WebGLRenderer;
 try{renderer=new WebGLRenderer({canvas,context:gl,antialias:false});}catch{return null;}
 const css=getComputedStyle(canvas);
 const token=(name:string)=>css.getPropertyValue('--orbit-'+name).trim();
 const palette={void:token('void'),core:'#000000',ink:token('scene-ink'),indigo:token('scene-indigo'),violet:token('violet'),ice:token('scene-ice')};
 renderer.autoClear=false;
 renderer.info.autoReset=false;
 renderer.debug.onShaderError=()=>{queueMicrotask(()=>{dispose();onLoss();});};
 renderer.setClearColor(palette.void);
 const scene=new Scene();
 const camera=new PerspectiveCamera(40,1,.1,80);
 const screen=new OrthographicCamera(-1,1,1,-1,0,1);
 const starMap=stars();
 const background=new Scene();
 const composite=new Scene();
 const fullscreen=new PlaneGeometry(2,2);
 const lens=new ShaderMaterial({
  vertexShader:flatVertex,fragmentShader:backgroundFragment,depthTest:false,depthWrite:false,
  uniforms:{stars:{value:starMap},lens:{value:new Vector2(.5,.5)},bend:{value:1},aspect:{value:1},
   ink:{value:new Color(palette.void)},violet:{value:new Color(palette.violet)}},
 });
 const screenTexture=new ShaderMaterial({
  vertexShader:flatVertex,depthTest:false,depthWrite:false,uniforms:{image:{value:null}},
  fragmentShader:'varying vec2 coord; uniform sampler2D image; void main(){gl_FragColor=texture2D(image,coord);}',
 });
 background.add(new Mesh(fullscreen,lens));
 composite.add(new Mesh(fullscreen,screenTexture));
 const lensTarget=new WebGLRenderTarget(1,1,{depthBuffer:false});
 const core=new Mesh(new SphereGeometry(1.08,32,24),new MeshBasicMaterial({color:palette.core}));
 scene.add(core);
 const disk=new Mesh(new RingGeometry(1.09,2.78,84),new ShaderMaterial({
  vertexShader:meshVertex,fragmentShader:diskFragment,transparent:true,depthWrite:false,side:DoubleSide,
  uniforms:{time:{value:0},indigo:{value:new Color(palette.indigo)},violet:{value:new Color(palette.violet)},ice:{value:new Color(palette.ice)}},
 }));
 disk.rotation.x=-Math.PI/2;
 scene.add(disk);
 const halo=new Mesh(new PlaneGeometry(3.9,3.9),new ShaderMaterial({
  vertexShader:meshVertex,fragmentShader:haloFragment,transparent:true,depthWrite:false,blending:AdditiveBlending,
  uniforms:{color:{value:new Color(palette.ice)},soft:{value:0}},
 }));
 halo.renderOrder=2;
 scene.add(halo);
 const dustGeometry=new BufferGeometry();
 const positions=new Float32Array(8000*3);
 const seeds=new Float32Array(8000*3);
 for(let i=0;i<8000;i++){
  seeds[i*3]=1.45+Math.random()*1.7;
  seeds[i*3+1]=Math.random()*tau;
  seeds[i*3+2]=(Math.random()-.5)*.18;
 }
 dustGeometry.setAttribute('position',new BufferAttribute(positions,3));
 dustGeometry.setAttribute('seed',new BufferAttribute(seeds,3));
 const dust=new Points(dustGeometry,new ShaderMaterial({
  vertexShader:dustVertex,fragmentShader:dustFragment,transparent:true,depthWrite:false,blending:AdditiveBlending,
  uniforms:{time:{value:0},color:{value:new Color(palette.ice)}},
 }));
 dust.frustumCulled=false;
 scene.add(dust);
 const fullMaterials=[new MeshBasicMaterial({color:palette.ink}),new LineBasicMaterial({color:palette.ice})];
 const dimMaterials=[new MeshBasicMaterial({color:palette.void}),new LineBasicMaterial({color:palette.indigo,transparent:true,opacity:.53})];
 const objects=ids.map((id,index)=>{
  const object=satellite(index,fullMaterials);
  object.userData.service=id;
  scene.add(object);
  return object;
 });
 const cameraTarget=new Vector3();
 const desiredTarget=new Vector3();
 const projection=new Vector3();
 const pointing=new Vector2();
 const ray=new Raycaster();
 ray.params.Line={threshold:.10};
 const pointers=new Map<number,{x:number;y:number}>();
 let selected:string|null=null,hovered:string|null=null,gesture=false,expanded=false,visible=true,disposed=false;
 let tier=initialTier(),clock=0,raf=0,last=0,lastFrame=0,resizeNeeded=true,activeUntil=0;
 let performanceSince=0,frameCount=0,frameTime=0,lastTap=0;
 let azimuth=.15,polar=1.04,distance=11.9,targetAzimuth=azimuth,targetPolar=polar,targetDistance=distance;
 let pinch=0,width=1,height=1,hold=0;
 const setHover=(id:string|null)=>{if(id!==hovered){hovered=id;onHover(id);}};
 const wake=(activity=false)=>{
  if(activity)activeUntil=performance.now()+1500;
  if(!raf&&visible&&!document.hidden&&!disposed)raf=requestAnimationFrame(frame);
 };
 const resize=()=>{
  const bounds=canvas.getBoundingClientRect();
  width=Math.max(1,Math.round(bounds.width));height=Math.max(1,Math.round(bounds.height));
  const cap=[1,1,1.5,2][tier];
  const dpr=Math.min(devicePixelRatio||1,cap,activeUntil>performance.now()?1.35:cap);
  renderer.setPixelRatio(dpr);
  renderer.setSize(width,height,false);
  camera.aspect=width/height;camera.updateProjectionMatrix();
  lens.uniforms.aspect.value=camera.aspect;
  const scale=tier===3?.75:.5;
  if(tier>1)lensTarget.setSize(Math.max(1,Math.round(width*scale)),Math.max(1,Math.round(height*scale)));
  resizeNeeded=false;
 };
 const center=(object:Group)=>{
  projection.copy(object.position).project(camera);
  marker.style.left=`${(projection.x+1)*50}%`;
  marker.style.top=`${(1-projection.y)*50}%`;
  marker.style.display=projection.z<1?'block':'none';
 };
 function frame(now:number){
  raf=0;
  if(disposed||!visible||document.hidden)return;
  const engaged=now<activeUntil;
  const targetFps=engaged?60:30;
  if(lastFrame&&now-lastFrame<1000/targetFps-1.5){wake();return;}
  const elapsed=lastFrame?now-lastFrame:0;
  const delta=Math.min(.1,last?(now-last)/1000:1/30);
  lastFrame=now;last=now;clock+=delta;
  if(engaged&&tier>1&&elapsed>0){
   performanceSince ||= now;frameCount++;frameTime+=elapsed;
   if(now-performanceSince>=2000){
    if(frameTime/frameCount>25){tier--;resizeNeeded=true;}
    performanceSince=0;frameCount=0;frameTime=0;
   }
  }else if(!engaged){performanceSince=0;frameCount=0;frameTime=0;}
  const desiredDpr=Math.min(devicePixelRatio||1,[1,1,1.5,2][tier],engaged?1.35:2);
  if(resizeNeeded||Math.abs(renderer.getPixelRatio()-desiredDpr)>.01)resize();
  disk.material.uniforms.time.value=clock;
  dust.material.uniforms.time.value=clock;
  dust.visible=tier>1;dustGeometry.setDrawRange(0,tier===3?8000:2000);
  halo.material.uniforms.soft.value=tier===3?1:0;
  objects.forEach((object,index)=>{
   const angle=index*tau/objects.length+clock*tau/(108+index*12);
   object.position.set(Math.sin(angle)*(3.56+(index%2)*.26),Math.sin(angle*2+index)*.31,Math.cos(angle)*(3.56+(index%2)*.26));
   object.rotation.y=angle+.25;object.rotation.x=Math.sin(angle)*.19;
  });
  const focus=objects.find(object=>object.userData.service===selected&&object.visible);
  if(focus)desiredTarget.copy(focus.position).multiplyScalar(.39);else desiredTarget.set(0,0,0);
  const damping=1-Math.exp(-delta*4.3);
  cameraTarget.lerp(desiredTarget,damping);
  azimuth=MathUtils.lerp(azimuth,targetAzimuth,damping);
  polar=MathUtils.lerp(polar,targetPolar,damping);
  distance=MathUtils.lerp(distance,targetDistance,damping);
  const fit=Math.max(1,1/camera.aspect);
  const radius=distance*fit;
  camera.position.set(cameraTarget.x+radius*Math.sin(polar)*Math.sin(azimuth),
   cameraTarget.y+radius*Math.cos(polar),cameraTarget.z+radius*Math.sin(polar)*Math.cos(azimuth));
  camera.lookAt(cameraTarget);camera.updateMatrixWorld();
  halo.quaternion.copy(camera.quaternion);
  projection.set(0,0,0).project(camera);
  lens.uniforms.lens.value.set((projection.x+1)/2,(projection.y+1)/2);
  lens.uniforms.bend.value=tier>1?1:0;
  renderer.info.reset();
  if(tier>1){
   renderer.setRenderTarget(lensTarget);renderer.clear();renderer.render(background,screen);
   renderer.setRenderTarget(null);renderer.clear();
   screenTexture.uniforms.image.value=lensTarget.texture;renderer.render(composite,screen);
  }else{renderer.clear();renderer.render(background,screen);}
  renderer.render(scene,camera);
  const calls=String(renderer.info.render.calls);
  if(canvas.dataset.drawCalls!==calls)canvas.dataset.drawCalls=calls;
  if(canvas.dataset.tier!==String(tier))canvas.dataset.tier=String(tier);
  const mark=objects.find(object=>object.visible&&object.userData.service===(hovered||selected));
  if(mark)center(mark);else marker.style.display='none';
  wake();
 }
 const reset=()=>{targetAzimuth=.15;targetPolar=1.04;targetDistance=11.9;wake(true);};
 const pick=(event:PointerEvent)=>{
  const box=canvas.getBoundingClientRect();
  pointing.set((event.clientX-box.left)/box.width*2-1,1-(event.clientY-box.top)/box.height*2);
  ray.setFromCamera(pointing,camera);
  const hits=ray.intersectObjects([core,...objects.filter(object=>object.visible)],true);
  let object=hits[0]?.object;
  while(object&&!object.userData.service&&object.parent)object=object.parent;
  return object?.userData.service as string|undefined;
 };
 const zoom=(direction:number)=>{targetDistance=MathUtils.clamp(targetDistance+direction*1.5,9.6,17.2);wake(true);};
 const down=(event:PointerEvent)=>{
  if(event.button!==0)return;
  if(!pointers.size)gesture=false;
  pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
  canvas.setPointerCapture(event.pointerId);
  if(pointers.size>1){gesture=true;clearTimeout(hold);}
  else if(event.pointerType==='touch')hold=window.setTimeout(()=>{setHover(pick(event)??null);},380);
  wake(true);
 };
 const move=(event:PointerEvent)=>{
  const previous=pointers.get(event.pointerId);
  if(!previous){
   if(event.pointerType==='mouse'){setHover(pick(event)??null);canvas.style.cursor=hovered?'pointer':'grab';}
   return;
  }
  pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
  if(pointers.size===2&&expanded){
   const [a,b]=Array.from(pointers.values());
   const length=Math.hypot(a.x-b.x,a.y-b.y);
   if(pinch)targetDistance=MathUtils.clamp(targetDistance+(pinch-length)*.037,9.6,17.2);
   pinch=length;
  }else if(pointers.size===1){
   const dx=event.clientX-previous.x,dy=event.clientY-previous.y;
   if(Math.abs(dx)+Math.abs(dy)>2||gesture){
    gesture=true;clearTimeout(hold);setHover(null);targetAzimuth-=dx*.008;
    targetPolar=MathUtils.clamp(targetPolar-dy*.006,MathUtils.degToRad(20),MathUtils.degToRad(80));
   }
  }
  wake(true);
 };
 const release=(event:PointerEvent)=>{
  if(!pointers.delete(event.pointerId))return;
  pinch=0;clearTimeout(hold);setHover(null);
  if(pointers.size||gesture||event.type==='pointercancel')return;
  const time=performance.now();
  if(time-lastTap<310){reset();onSelect('');lastTap=0;return;}
  lastTap=time;
  const hit=pick(event);if(hit)onSelect(hit);
 };
 const leave=()=>setHover(null);
 const wheel=(event:WheelEvent)=>{if(expanded){event.preventDefault();zoom(Math.sign(event.deltaY)*.45);}};
 const resizeObserver=new ResizeObserver(()=>{resizeNeeded=true;wake();});
 resizeObserver.observe(canvas);
 const visibilityObserver=new IntersectionObserver(entries=>{
  visible=!!entries[0]?.isIntersecting;last=0;lastFrame=0;
  if(visible)wake();else{cancelAnimationFrame(raf);raf=0;}
 });
 visibilityObserver.observe(canvas);
 const visibility=()=>{last=0;lastFrame=0;if(document.hidden){cancelAnimationFrame(raf);raf=0;}else wake();};
 const contextLost=(event:Event)=>{event.preventDefault();dispose();onLoss();};
 canvas.addEventListener('pointerdown',down);
 canvas.addEventListener('pointermove',move);
 canvas.addEventListener('pointerup',release);
 canvas.addEventListener('pointercancel',release);
 canvas.addEventListener('pointerleave',leave);
 canvas.addEventListener('wheel',wheel,{passive:false});
 canvas.addEventListener('webglcontextlost',contextLost);
 document.addEventListener('visibilitychange',visibility);
 function dispose(){
  if(disposed)return;
  disposed=true;cancelAnimationFrame(raf);clearTimeout(hold);
  resizeObserver.disconnect();visibilityObserver.disconnect();
  document.removeEventListener('visibilitychange',visibility);
  canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);
  canvas.removeEventListener('pointerup',release);canvas.removeEventListener('pointercancel',release);
  canvas.removeEventListener('pointerleave',leave);canvas.removeEventListener('wheel',wheel);
  canvas.removeEventListener('webglcontextlost',contextLost);
  scene.traverse(object=>{if(object instanceof Mesh||object instanceof LineSegments||object instanceof Points)object.geometry.dispose();});
  [core.material,disk.material,halo.material,dust.material,lens,screenTexture,...fullMaterials,...dimMaterials].forEach(material=>material.dispose());
  fullscreen.dispose();lensTarget.dispose();starMap.dispose();renderer.dispose();marker.style.display='none';
 }
 wake();
 return {
  dispose,zoom,reset,
  expand(value){expanded=value;resizeNeeded=true;wake(true);},
  setAvailable(available){objects.forEach(object=>{object.visible=available.includes(object.userData.service);});wake();},
  select(id){
   selected=id;
   targetDistance=id?10.6:11.9;
   objects.forEach(object=>{
    const material=!id||object.userData.service===id?fullMaterials:dimMaterials;
    object.children.forEach(part=>{
     if(part instanceof Mesh)part.material=material[0];
     if(part instanceof LineSegments)part.material=material[1];
    });
   });
   wake(true);
  },
 };
}
