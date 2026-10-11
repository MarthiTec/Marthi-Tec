import { nestDelete, nestGet, nestPost, nestPut, nestRequest } from './nestClient';

export type AdsCheck = { id: string; ok: boolean; title: string; help: string };
export type AdsConnection = {
  status: 'connected' | 'needs_reconnect' | 'revoked' | 'error';
  userName: string;
  expiresAt: string | null;
  scopes: string[];
  page: { id: string; name: string } | null;
  adAccount: { id: string; name: string; currency: string; timezone: string; status: number | null } | null;
  instagram: { id: string; username: string } | null;
  lastCheckedAt: string | null;
  connectedBy: string;
  /** oauth = login pelo app do Marthi; store_token = token da própria loja (Operações › Meta). */
  mode?: 'oauth' | 'store_token';
} | null;
export type AdsStatus = {
  config: { appConfigured: boolean; vaultReady: boolean; loginMode: string; apiVersion: string; environment: 'test' | 'production'; redirectUri: string; scopes: string[] };
  connection: AdsConnection;
  canAdmin: boolean;
  phases: Record<string, 'available' | 'blocked'>;
};
export type AdsHealth = { connection: AdsConnection; checks: AdsCheck[]; canAdvertise: boolean };
export type AdsAssets = {
  pages: Array<{ id: string; name: string; canAdvertise: boolean; instagram: { id: string; username: string } | null }>;
  adAccounts: Array<{ id: string; name: string; status: number; statusLabel: string; currency: string; timezone: string }>;
};
export type AdsCta = 'LEARN_MORE' | 'SHOP_NOW' | 'BUY_NOW';
export type AdsContent = {
  headline: string;
  message: string;
  description: string;
  cta: AdsCta;
  media: { source: 'product' | 'library'; index?: number; mediaId?: string };
};
export type AdsAudience = { countries: string[]; cities: Array<{ key: string; name: string }>; ageMin: number; ageMax: number };
export type AdsOffer = {
  storeId: string;
  productId: string;
  variationId: string | null;
  title: string;
  brand: string;
  attrs: Array<{ name: string; value: string }>;
  condition: string;
  conditionLabel: string;
  batteryLevel: number | null;
  price: number;
  priceLabel: string;
  available: boolean;
  inStock: boolean;
  pickup: Array<{ kind: string; label: string; price: number }>;
  images: string[];
  details: string[];
  store: { name: string; phone: string; instagram: string; logo: string | null };
  url: string;
};
export type AdsCampaign = {
  id: string;
  productId: string;
  variationId: string | null;
  name: string;
  destinationUrl: string;
  content: AdsContent;
  audience: AdsAudience;
  budgetType: 'daily' | 'lifetime';
  budgetMinor: number;
  currency: string;
  startTime: string | null;
  endTime: string | null;
  requestedStatus: 'draft' | 'paused' | 'active';
  submitState: 'draft' | 'submitting' | 'submitted' | 'error';
  external: Record<string, string>;
  effectiveStatus: string;
  reviewFeedback: Record<string, unknown> | null;
  issues: unknown;
  lastError: string;
  authorizedBy: string;
  authorizedAt: string | null;
  createdAt: string;
  lastSyncedAt: string | null;
  display: { key: string; label: string; help: string };
  offer?: AdsOffer | null;
};
export type AdsIssue = { level: 'error' | 'warning'; message: string };
export type AdsInsights = {
  preset: string;
  data: null | Record<string, string>;
  fetchedAt: string | null;
  currency: string;
  conversionsTracked: boolean;
};
export type AdsMedia = {
  id: string;
  kind: 'image' | 'video';
  name: string;
  mime: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  durationSec: number | null;
  preview: string | null;
  status: string;
  rightsConfirmed: boolean;
  createdAt: string;
  warnings?: AdsIssue[];
};

export type AdsStoreTest = {
  user: string;
  granted: string[];
  instagram: { username: string; followers: number | null; mediaCount: number | null } | null;
  canPublishInstagram: boolean;
  instagramHelp: string;
  canAdvertise: boolean;
  adsHelp: string;
};
export type SocialPost = {
  id: string;
  network: 'instagram';
  caption: string;
  mediaId: string | null;
  mediaName: string;
  status: 'scheduled' | 'publishing' | 'published' | 'failed' | 'cancelled';
  scheduledAt: string;
  publishedAt: string | null;
  permalink: string;
  error: string;
  attempts: number;
  createdBy: string;
  createdAt: string;
};

export const adsApi = {
  storeConnect: (body: { token: string; pageId?: string; adAccountId?: string }) =>
    nestPost<{ pages: Array<{ id: string; name: string; instagram: string }>; adAccounts: Array<{ id: string; name: string }>; health: AdsHealth }>('/ads/meta/store-connection', body),
  storeTest: () => nestGet<AdsStoreTest>('/ads/meta/store-test'),
  socialPosts: () => nestGet<SocialPost[]>('/ads/social-posts'),
  createSocialPost: (body: { caption: string; mediaId: string; scheduledAt: string | null }) => nestPost<SocialPost>('/ads/social-posts', body),
  cancelSocialPost: (id: string) => nestPost<{ ok: true }>(`/ads/social-posts/${encodeURIComponent(id)}/cancel`, {}),
  retrySocialPost: (id: string) => nestPost<SocialPost | null>(`/ads/social-posts/${encodeURIComponent(id)}/retry`, {}),
  status: () => nestGet<AdsStatus>('/ads/status'),
  connect: () => nestPost<{ url: string }>('/ads/meta/connect', {}),
  assets: () => nestGet<AdsAssets>('/ads/meta/assets'),
  selectAssets: (body: { pageId: string; adAccountId: string }) => nestPut<AdsHealth>('/ads/meta/assets', body),
  health: () => nestGet<AdsHealth>('/ads/meta/health'),
  disconnect: () => nestDelete<{ ok: true }>('/ads/meta/connection'),
  audit: () => nestGet<Array<{ actor: string; action: string; entity_id: string; details: unknown; created_at: string }>>('/ads/audit'),
  campaigns: () => nestGet<AdsCampaign[]>('/ads/campaigns'),
  campaign: (id: string) => nestGet<AdsCampaign>(`/ads/campaigns/${encodeURIComponent(id)}`),
  createDraft: (body: { productId: string; variationId: string | null }) => nestPost<AdsCampaign>('/ads/campaigns', body),
  updateDraft: (id: string, body: { name?: string; content?: AdsContent; audience?: AdsAudience; budget?: { budgetType: 'daily' | 'lifetime'; budgetMinor: number; startTime: string; endTime?: string | null } }) =>
    nestPut<AdsCampaign>(`/ads/campaigns/${encodeURIComponent(id)}`, body),
  deleteDraft: (id: string) => nestDelete<{ ok: true }>(`/ads/campaigns/${encodeURIComponent(id)}`),
  validation: (id: string) => nestGet<{ issues: AdsIssue[]; canSubmit: boolean }>(`/ads/campaigns/${encodeURIComponent(id)}/validation`),
  submit: (id: string, submitKey: string) => nestPost<AdsCampaign>(`/ads/campaigns/${encodeURIComponent(id)}/submit`, { confirm: true, submitKey }),
  resubmit: (id: string) => nestPost<AdsCampaign>(`/ads/campaigns/${encodeURIComponent(id)}/resubmit`, {}),
  activate: (id: string, acknowledgedBudgetMinor: number) => nestPost<AdsCampaign>(`/ads/campaigns/${encodeURIComponent(id)}/activate`, { confirm: true, acknowledgedBudgetMinor }),
  pause: (id: string) => nestPost<AdsCampaign>(`/ads/campaigns/${encodeURIComponent(id)}/pause`, {}),
  sync: (id: string) => nestPost<AdsCampaign>(`/ads/campaigns/${encodeURIComponent(id)}/sync`, {}),
  insights: (id: string, preset: string) => nestGet<AdsInsights>(`/ads/campaigns/${encodeURIComponent(id)}/insights?preset=${encodeURIComponent(preset)}`),
  cities: (q: string) => nestGet<Array<{ key: string; name: string }>>(`/ads/meta/cities?q=${encodeURIComponent(q)}`),
  media: () => nestGet<AdsMedia[]>('/ads/media'),
  uploadImage: (body: { name: string; dataUrl: string; rightsConfirmed: true }) => nestPost<AdsMedia>('/ads/media/image', body),
  /** Vídeo vai direto para a conta de anúncios (o arquivo bruto, sem base64). */
  uploadVideo: (file: File) =>
    nestRequest<AdsMedia>('/ads/media/video', { method: 'POST', body: file, headers: { 'Content-Type': file.type, 'x-file-name': encodeURIComponent(file.name), 'x-rights-confirmed': 'true' } }),
  refreshMedia: (id: string) => nestPost<AdsMedia>(`/ads/media/${encodeURIComponent(id)}/refresh`, {}),
  deleteMedia: (id: string) => nestDelete<{ ok: true }>(`/ads/media/${encodeURIComponent(id)}`),
  publicOffer: (storeId: string, productId: string, variationId: string | null) =>
    nestGet<AdsOffer>(`/public/offers/${encodeURIComponent(storeId)}/${encodeURIComponent(productId)}${variationId ? `?v=${encodeURIComponent(variationId)}` : ''}`),
};

export const formatMinor = (minor: number, currency = 'BRL') => (minor / 100).toLocaleString('pt-BR', { style: 'currency', currency: currency || 'BRL' });
