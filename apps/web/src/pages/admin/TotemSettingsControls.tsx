import {useRef,useState} from 'react';

export function TotemSettingToggle({label,hint,checked,onChange}:{label:string;hint:string;checked:boolean;onChange:(value:boolean)=>void}) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className="totem-setting-toggle" onClick={()=>onChange(!checked)}><span><strong>{label}</strong><small>{hint}</small></span><span className="totem-setting-toggle__track" aria-hidden="true"><span/></span></button>;
}

export function TotemSettingsImage({label,hint,value,convert,onChange,portrait=false}:{label:string;hint:string;value:string|null;convert:(file:File)=>Promise<string>;onChange:(value:string|null)=>void;portrait?:boolean}) {
  const input=useRef<HTMLInputElement>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  async function upload(file:File) {
    setError('');setBusy(true);
    try {onChange(await convert(file));}catch{setError('Não foi possível abrir esta imagem. Escolha uma foto PNG, JPG ou WebP.');}finally{setBusy(false);}
  }
  return <div className={`totem-settings-media ${portrait?'totem-settings-media--portrait':''}`}>
    <div className="totem-settings-media__preview">{value?<img src={value} alt={label}/>:<span aria-hidden="true">＋</span>}</div>
    <div className="totem-settings-media__body"><strong>{label}</strong><p>{hint}</p><input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden aria-label={`Enviar ${label}`} onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)void upload(file);}}/>
      <div className="totem-settings-media__actions"><button type="button" className="btn btn--ghost" disabled={busy} onClick={()=>input.current?.click()}>{busy?'Preparando…':value?'Trocar imagem':'Escolher imagem'}</button>{value&&<button type="button" className="totem-settings-media__remove" disabled={busy} onClick={()=>onChange(null)}>Remover</button>}</div>
      {error&&<small role="alert">{error}</small>}
    </div>
  </div>;
}

/** Propagandas do topo do totem: várias imagens em carrossel, na ordem em que foram enviadas. */
export function TotemSettingsBanners({value,max,convert,onChange}:{value:string[];max:number;convert:(file:File)=>Promise<string>;onChange:(value:string[])=>void}) {
  const input=useRef<HTMLInputElement>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  async function upload(files:File[]) {
    setError('');setBusy(true);
    try {
      const room=max-value.length;
      const images=await Promise.all(files.slice(0,room).map(convert));
      onChange([...value,...images]);
      if(files.length>room)setError(`Cabem até ${max} imagens. As extras foram ignoradas.`);
    } catch {setError('Não foi possível abrir uma das imagens. Use PNG, JPG ou WebP.');} finally {setBusy(false);}
  }
  function move(index:number,delta:number) {
    const next=[...value];const target=index+delta;
    if(target<0||target>=next.length)return;
    [next[index],next[target]]=[next[target],next[index]];
    onChange(next);
  }
  return <div className="totem-settings-banners">
    <div className="totem-settings-banners__grid">
      {value.map((src,index)=><figure key={index} className="totem-settings-banners__item">
        <img src={src} alt={`Propaganda ${index+1}`}/>
        <figcaption>
          <span>{index+1}º</span>
          <button type="button" aria-label="Mover para a esquerda" disabled={busy||index===0} onClick={()=>move(index,-1)}>←</button>
          <button type="button" aria-label="Mover para a direita" disabled={busy||index===value.length-1} onClick={()=>move(index,1)}>→</button>
          <button type="button" className="totem-settings-banners__remove" disabled={busy} onClick={()=>onChange(value.filter((_,i)=>i!==index))}>Remover</button>
        </figcaption>
      </figure>)}
      {value.length<max&&<button type="button" className="totem-settings-banners__add" disabled={busy} onClick={()=>input.current?.click()}><span aria-hidden="true">＋</span>{busy?'Preparando…':'Adicionar imagem'}</button>}
    </div>
    <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden aria-label="Enviar propagandas" onChange={event=>{const files=[...(event.target.files??[])];event.target.value='';if(files.length)void upload(files);}}/>
    {error&&<small role="alert">{error}</small>}
  </div>;
}
