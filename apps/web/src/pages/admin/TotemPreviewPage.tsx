import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminPicker } from '../../components/AdminPicker';
import './totemPreview.css';

/** A real iframe viewport keeps media queries identical to the selected kiosk. */
export function TotemPreviewPage() {
  const host = useRef<HTMLDivElement>(null);
  const [orientation, setOrientation] = useState('portrait');
  const [size, setSize] = useState({ width: 320, height: 600 });
  const width = orientation === 'portrait' ? 1080 : 1920;
  const height = orientation === 'portrait' ? 1920 : 1080;
  useEffect(() => {
    const update = () => {
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const top = host.current?.getBoundingClientRect().top ?? 0;
      setSize({ width: host.current?.clientWidth ?? 320, height: Math.max(120, viewportHeight - Math.max(0, top) - 24) });
    };
    const observer = new ResizeObserver(update);
    if (host.current) observer.observe(host.current);
    window.addEventListener('resize',update);update();
    window.visualViewport?.addEventListener('resize', update);
    return () => {observer.disconnect();window.removeEventListener('resize',update);window.visualViewport?.removeEventListener('resize', update);};
  }, []);
  const scale = Math.min(size.width / width,size.height / height,1);
  return <section className="admin-page totem-preview">
    <article className="admin-card">
      <h2>Prévia do Totem</h2>
      <p>Visualize as configurações e os produtos salvos da loja na proporção do equipamento. Esta prévia não envia pedidos.</p>
      <div className="totem-preview__toolbar">
        <AdminPicker label="Tela do equipamento" value={orientation} options={[{value:'portrait',label:'Vertical · 1080 × 1920'},{value:'landscape',label:'Horizontal · 1920 × 1080'}]} onChange={setOrientation} />
        <Link className="btn btn--ghost" to="/painel/totem/config">Configurar Totem</Link>
      </div>
    </article>
    <div ref={host} className="totem-preview__host">
      <div className="totem-preview__frame" style={{width:width*scale,height:height*scale}}>
        <iframe title="Prévia real do Totem da loja" src="/totem?preview=1" style={{width,height,transform:`scale(${scale})`}} />
      </div>
    </div>
  </section>;
}
