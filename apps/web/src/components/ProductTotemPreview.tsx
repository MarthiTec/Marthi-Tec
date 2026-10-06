import {useEffect} from 'react';
import {ProductCarousel} from '../pages/totem/ProductCarousel';
import '../pages/totem/totem.css';
import './productTotemPreview.css';
export function ProductTotemPreview({name,images,price,attributes,onClose}:{name:string;images:string[];price:number;attributes:Record<string,string>;onClose:()=>void}){
 useEffect(()=>{const close=(event:KeyboardEvent)=>{if(event.key==='Escape')onClose();};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close);},[onClose]);
 return <div className="product-preview-overlay" onClick={onClose}><section className="product-preview-dialog" role="dialog" aria-modal="true" aria-label="Prévia do produto no totem" onClick={e=>e.stopPropagation()}>
 <div className="admin-toolbar"><h2>Prévia no totem</h2><button type="button" className="btn btn--ghost" onClick={onClose}>Fechar</button></div>
 <article className="totem-card"><div className="totem-card__media"><ProductCarousel images={images} alt={name||'Produto'} /></div><div className="totem-card__body"><h2>{name||'Nome do produto'}</h2><p>{Object.values(attributes).filter(Boolean).join(' · ')}</p><div className="totem-card__price"><span>À vista</span><strong>{price>0?price.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'Defina o preço da variação'}</strong></div></div></article>
 <h3>Como preparar suas fotos</h3><img className="product-preview-guide" src="/images/product-photo-guide.svg" alt="Exemplo: produto inteiro, centralizado, com espaço ao redor e fundo branco ou transparente"/>
 <p>Use uma foto nítida do produto inteiro, centralizado, sem textos nas bordas. Prefira fundo branco ou transparente. A imagem mantém a proporção e cabe nesta área, sem corte ou deformação. Fotos muito aproximadas não mostram o produto inteiro, mesmo com o ajuste correto.</p><p>Confira todas as fotos no carrossel antes de salvar. Esta prévia usa as imagens ainda em edição.</p>
 </section></div>;
}
