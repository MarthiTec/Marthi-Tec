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
