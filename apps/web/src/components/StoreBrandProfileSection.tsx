import { useEffect, useState } from 'react';
import { TotemSettingsImage } from '../pages/admin/TotemSettingsControls';
import { fileToStoreLogo } from '../data/totemSettings';
import { STORE_CONTEXT_CHANGED_EVENT } from '../data/multiStoreStore';
import { apiGetStoreBrandProfile, apiSaveStoreBrandProfile, type ApiStoreBrandProfile } from '../services/erpApi';
import '../pages/admin/totemSettings.css';

type Form = { logo: string | null; phone: string; email: string; instagram: string; facebook: string; website: string; signature: string };

const toForm = (p: ApiStoreBrandProfile): Form => ({
  logo: p.logo,
  phone: p.phone,
  email: p.email,
  instagram: p.instagram,
  facebook: p.facebook,
  website: p.website,
  signature: p.signature,
});

/**
 * Dados da loja que aparecem no comprovante, nas mensagens de WhatsApp e no totem: logo,
 * contatos, redes sociais e a assinatura das mensagens. Tudo gravado no banco da loja.
 */
export function StoreBrandProfileSection() {
  const [profile, setProfile] = useState<ApiStoreBrandProfile | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => {
      setForm(null);
      void apiGetStoreBrandProfile()
        .then((data) => {
          if (!alive) return;
          setProfile(data);
          setForm(toForm(data));
        })
        .catch((err) => alive && setMessage({ ok: false, text: err instanceof Error ? err.message : 'Não foi possível carregar os dados da loja.' }));
    };
    load();
    window.addEventListener(STORE_CONTEXT_CHANGED_EVENT, load);
    return () => {
      alive = false;
      window.removeEventListener(STORE_CONTEXT_CHANGED_EVENT, load);
    };
  }, []);

  if (!form || !profile) {
    return <article className="admin-card">{message ? <p role="alert" className="qty-low">{message.text}</p> : <p className="empty">Carregando dados da loja…</p>}</article>;
  }

  const set = (patch: Partial<Form>) => {
    setForm({ ...form, ...patch });
    setMessage(null);
  };

  async function save() {
    if (!form) return;
    setSaving(true);
    setMessage(null);
    try {
      const saved = await apiSaveStoreBrandProfile(form);
      setProfile(saved);
      setForm(toForm(saved));
      setMessage({ ok: true, text: 'Dados da loja salvos. Já valem no comprovante, no WhatsApp e no totem.' });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Não foi possível salvar.' });
    } finally {
      setSaving(false);
    }
  }

  const instagramPreview = form.instagram.trim()
    ? /^https?:\/\//i.test(form.instagram.trim())
      ? form.instagram.trim()
      : `https://instagram.com/${form.instagram.trim().replace(/^@/, '')}`
    : '';

  return (
    <article className="admin-card">
      <h2>Dados da loja</h2>
      <p className="empty">
        Aparecem no comprovante de venda (impresso e em PDF), nas mensagens de WhatsApp e no totem. O QR Code do
        comprovante leva para o Instagram da loja (sem Instagram, para o site).
      </p>
      <div className="admin-form" style={{ marginTop: 12 }}>
        <div className="span-2">
          <TotemSettingsImage
            label="Logo da loja"
            hint={
              profile.logoFromTotem
                ? 'Esta é a logo que já estava no totem. Troque aqui para usar outra no comprovante e no totem.'
                : 'Usada no comprovante, no PDF e no totem (se o totem não tiver uma própria). PNG com fundo transparente fica melhor.'
            }
            value={form.logo}
            convert={fileToStoreLogo}
            onChange={(logo) => set({ logo })}
          />
        </div>
        <label>
          Telefone de contato
          <input value={form.phone} inputMode="tel" placeholder="(24) 99999-0000" onChange={(e) => set({ phone: e.target.value })} />
        </label>
        <label>
          E-mail
          <input value={form.email} type="email" placeholder="contato@sualoja.com.br" onChange={(e) => set({ email: e.target.value })} />
        </label>
        <label>
          Instagram
          <input value={form.instagram} placeholder="@sualoja" onChange={(e) => set({ instagram: e.target.value })} />
          {instagramPreview ? <small className="empty">QR Code abre: {instagramPreview}</small> : null}
        </label>
        <label>
          Facebook
          <input value={form.facebook} placeholder="facebook.com/sualoja" onChange={(e) => set({ facebook: e.target.value })} />
        </label>
        <label className="span-2">
          Site
          <input value={form.website} placeholder="www.sualoja.com.br" onChange={(e) => set({ website: e.target.value })} />
        </label>
        <label className="span-2">
          Assinatura das mensagens
          <textarea
            rows={3}
            maxLength={600}
            value={form.signature}
            placeholder={`${profile.name}\nSeu celular em boas mãos 📱`}
            onChange={(e) => set({ signature: e.target.value })}
          />
          <small className="empty">Vai no fim das mensagens de WhatsApp para o cliente. Em branco, o sistema usa o nome da loja com telefone, Instagram e site.</small>
        </label>
      </div>
      {message ? <p role={message.ok ? 'status' : 'alert'} className={message.ok ? 'ops-page__flash' : 'qty-low'}>{message.text}</p> : null}
      <div className="settings-form-actions" style={{ marginTop: 12 }}>
        <button type="button" className="btn btn--primary" disabled={saving} onClick={() => void save()}>
          {saving ? 'Salvando…' : 'Salvar dados da loja'}
        </button>
      </div>
    </article>
  );
}
