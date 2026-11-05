'use client';

import {useEffect,useRef,useState,type KeyboardEvent} from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {ArrowLeft,ArrowRight,Expand,Minus,Plus,RotateCcw,X} from 'lucide-react';
import {defaultServices,type Service} from '../../lib/catalog';
import {readApiResponse} from '../../lib/api-client';
import type {OrbitControls} from './scene';
import en from './en';
import my,{serviceCopy} from './my';

const orbitIds=defaultServices.filter(service=>service.active).map(service=>service.id);

export default function Orbit(){
 const [language,setLanguage]=useState<'EN'|'MM'>('EN');
 const [services,setServices]=useState<Service[]>(defaultServices.filter(service=>service.active));
 const [selection,setSelection]=useState<string|null>(null);
 const [hovered,setHovered]=useState<string|null>(null);
 const [tour,setTour]=useState<number|null>(null);
 const [expanded,setExpanded]=useState(false);
 const [visual,setVisual]=useState<'loading'|'ready'|'still'|'motion'>('loading');
 const [catalog,setCatalog]=useState<'loading'|'ready'|'error'>('loading');
 const [reload,setReload]=useState(0);
 const canvas=useRef<HTMLCanvasElement>(null);
 const scene=useRef<OrbitControls|null>(null);
 const expandButton=useRef<HTMLButtonElement>(null);
 const closeButton=useRef<HTMLButtonElement>(null);
 const labels=useRef<HTMLDivElement>(null);
 const lastFocus=useRef(false);
 const words=language==='MM'?my:en;
 const featured=services.filter(service=>orbitIds.includes(service.id));
 const active=services.find(service=>service.id===selection);
 const hoverLabel=services.find(service=>service.id===hovered);
 const availableIds=featured.map(service=>service.id).join('|');
 const localCopy=(service:Service)=>{
  const original=defaultServices.find(item=>item.id===service.id);
  if(language==='EN'||!serviceCopy[service.id]||!original)return service;
  return {
   name:original.name===service.name?serviceCopy[service.id].name:service.name,
   description:original.description===service.description?serviceCopy[service.id].description:service.description
  };
 };

 useEffect(()=>{
  const tick=requestAnimationFrame(()=>{try{if(localStorage.getItem('k9-language')==='MM')setLanguage('MM');}catch{}});
  return ()=>cancelAnimationFrame(tick);
 },[]);
 useEffect(()=>{
  const request=new AbortController();
  fetch('/api/bootstrap',{signal:request.signal}).then(readApiResponse).then(data=>{
   if(request.signal.aborted)return;
   setServices((data.services as Service[]).filter(service=>service.active));
   setCatalog('ready');
  }).catch(()=>{if(!request.signal.aborted)setCatalog('error');});
  return ()=>request.abort();
 },[reload]);
 useEffect(()=>{
  let disposed=false;
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  const connection=(navigator as Navigator&{connection?:{saveData?:boolean}}).connection;
  let frame=0;
  const load=()=>{
   if(disposed)return;
   scene.current?.dispose();
   scene.current=null;
   if(motion.matches){setVisual('motion');return;}
   if(connection?.saveData){setVisual('still');return;}
   setVisual('loading');
   void import('./scene').then(({createOrbit})=>{
    if(disposed||motion.matches||!canvas.current||!labels.current)return;
    scene.current=createOrbit(canvas.current,labels.current,id=>{setSelection(id||null);setTour(null);},setHovered,()=>setVisual('still'));
    setVisual(scene.current?'ready':'still');
   }).catch(()=>{if(!disposed)setVisual('still');});
  };
  const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(load);};
  frame=requestAnimationFrame(()=>{frame=requestAnimationFrame(load);});
  motion.addEventListener('change',schedule);
  return ()=>{disposed=true;cancelAnimationFrame(frame);motion.removeEventListener('change',schedule);scene.current?.dispose();scene.current=null;};
 },[]);
 useEffect(()=>{if(visual==='ready'){scene.current?.setAvailable(availableIds.split('|'));scene.current?.select(active?.id??null);}},[active?.id,availableIds,visual]);
 useEffect(()=>{
  scene.current?.expand(expanded);
  if(!expanded){if(lastFocus.current)expandButton.current?.focus();return;}
  lastFocus.current=true;
  closeButton.current?.focus();
  const overflow=document.body.style.overflow;
  document.body.style.overflow='hidden';
  return ()=>{document.body.style.overflow=overflow;};
 },[expanded,visual]);

 function choose(id:string){setSelection(id);setTour(null);}
 function reset(){setSelection(null);setTour(null);scene.current?.reset();}
 function tourNext(){
  const next=(tour??-1)+1;
  if(next>=featured.length){reset();return;}
  setTour(next);
  setSelection(featured[next].id);
 }
 function onKeys(event:KeyboardEvent<HTMLElement>){
  if(event.key==='Escape'){
   if(expanded)setExpanded(false);else reset();
  }
  if(!expanded||event.key!=='Tab')return;
  const controls=Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
  const first=controls[0],last=controls.at(-1);
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
  if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
 }
 return <main className="orbit-page" lang={language==='MM'?'my':'en'}>
  <header className="orbit-bar orbit-wrap">
   <Link href="/" className="orbit-brand" prefetch={false}><ArrowLeft size={19}/><Image src="/brand/k9-mark.png" alt="" width={36} height={36} unoptimized/>{words.home}</Link>
   <div className="orbit-languages" aria-label={words.language}>
    {(['EN','MM'] as const).map(lang=><button key={lang} lang={lang==='MM'?'my':'en'} type="button" aria-pressed={language===lang}
      onClick={()=>{setLanguage(lang);try{localStorage.setItem('k9-language',lang);}catch{}}}>{lang==='EN'?'English':'မြန်မာ'}</button>)}
   </div>
  </header>
  <div className="orbit-wrap">
   <div className="orbit-intro"><p>{words.eyebrow}</p><h1>{words.title}</h1><p>{words.intro}</p></div>
   <div className="orbit-layout">
    <div className={expanded?'orbit-stage is-expanded':'orbit-stage'} role={expanded?'dialog':undefined} aria-modal={expanded||undefined}
      aria-label={words.scene} onKeyDown={onKeys}>
     <div className="orbit-viewport" data-visual={visual}>
      <canvas ref={canvas} aria-hidden="true"/>
      <div ref={labels} aria-hidden="true" className="orbit-marker">{(hoverLabel||active)&&<span>{localCopy((hoverLabel||active)!).name}</span>}</div>
      {expanded?<button ref={closeButton} className="orbit-expand" onClick={()=>setExpanded(false)}><X size={18}/>{words.close}</button>
        :<button ref={expandButton} className="orbit-expand" disabled={visual!=='ready'} onClick={()=>setExpanded(true)}><Expand size={18}/>{words.enter}</button>}
     </div>
     <div className="orbit-controls">
      <button onClick={()=>scene.current?.zoom(-1)} disabled={visual!=='ready'}><Plus size={17}/>{words.zoomIn}</button>
      <button onClick={()=>scene.current?.zoom(1)} disabled={visual!=='ready'}><Minus size={17}/>{words.zoomOut}</button>
      <button onClick={reset}><RotateCcw size={17}/>{words.reset}</button>
      <button onClick={tourNext} disabled={!featured.length}><ArrowRight size={17}/>{tour===null?words.tour:tour===featured.length-1?words.finish:words.next}</button>
     </div>
     <p className="orbit-scene-note" aria-live="polite">
      {tour!==null?words.count(tour+1,featured.length):visual==='ready'?words.instructions:visual==='motion'?words.motion:visual==='loading'?words.loading:words.fallback}
     </p>
     {expanded&&active&&<p className="orbit-expanded-selection" role="status">{localCopy(active).name}</p>}
    </div>
    <section className="orbit-panel" aria-labelledby="orbit-detail" onKeyDown={onKeys}>
     <div aria-live="polite">
      <p className="orbit-panel-label">{words.services}</p>
      <h2 id="orbit-detail">{active?localCopy(active).name:words.defaultTitle}</h2>
      <p className="orbit-description">{active?localCopy(active).description:words.defaultCopy}</p>
     </div>
     {active&&<div className="orbit-actions">
      {catalog==='ready'&&<Link className="orbit-primary" prefetch={false} href={'/?order='+encodeURIComponent(active.id)}>{words.quote}<ArrowRight size={18}/></Link>}
      <button onClick={reset}>{words.back}</button>
     </div>}
     {catalog==='error'&&<p role="alert">{words.catalogError} <button onClick={()=>{setCatalog('loading');setReload(value=>value+1);}}>{words.retry}</button></p>}
     {!services.length&&<p>{words.empty}</p>}
     <ul className="orbit-services" aria-label={words.list} onKeyDown={event=>{
      const keys=['ArrowDown','ArrowRight','ArrowUp','ArrowLeft'];
      if(!keys.includes(event.key))return;
      const items=Array.from(event.currentTarget.querySelectorAll('button'));
      const position=items.indexOf(document.activeElement as HTMLButtonElement);
      if(position<0)return;
      event.preventDefault();
      items[(position+(keys.indexOf(event.key)<2?1:-1)+items.length)%items.length]?.focus();
     }}>
      {services.map(service=><li key={service.id}><button type="button" aria-pressed={active?.id===service.id}
       onClick={()=>choose(service.id)}>{localCopy(service).name}<ArrowRight size={17} aria-hidden="true"/></button></li>)}
     </ul>
    </section>
   </div>
  </div>
 </main>;
}
