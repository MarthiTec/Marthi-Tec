import {z} from 'zod';
import {loadCatalogDevice,encryptCatalogKey} from '../services/deviceCatalogApi.js';
import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { APPLE_REFERENCE_URL, matchReference, normalizeDeviceText, parseAppleModels, type DeviceReference } from '../services/deviceReference.js';
import { appleSpecsUrl, catalogSpecLines, parseAppleSpecs, type SpecLine } from '../services/appleSpecs.js';

export const deviceReferenceRouter = Router();
let refresh: Promise<DeviceReference[]> | null = null;

export async function loadReferences(): Promise<DeviceReference[]> {
  const saved = await pool.query('SELECT data, refreshed_at FROM device_reference_sources WHERE source_url = $1', [APPLE_REFERENCE_URL]);
  const row = saved.rows[0];
  // Cache salvo antes das fotos dos modelos (sem "image") é refeito para trazer as fotos.
  const hasImages = Array.isArray(row?.data) && row.data.some((model: DeviceReference) => model.image);
  if (row && hasImages && Date.now() - new Date(row.refreshed_at).getTime() < 86400000) return row.data;
  if (!refresh) {
    refresh = (async () => {
      const response = await fetch(APPLE_REFERENCE_URL, { signal: AbortSignal.timeout(10000), redirect: 'error' });
      if (!response.ok) throw new Error('Não foi possível consultar as especificações do fabricante.');
      const models = parseAppleModels(await response.text());
      if (!models.length) throw new Error('As especificações do fabricante estão indisponíveis.');
      await pool.query(`INSERT INTO device_reference_sources (source_url, data) VALUES ($1, $2::jsonb)
        ON CONFLICT (source_url) DO UPDATE SET data = EXCLUDED.data, refreshed_at = now()`, [APPLE_REFERENCE_URL, JSON.stringify(models)]);
      return models;
    })().finally(() => { refresh = null; });
  }
  try { return await refresh; }
  catch (error) { if (row) return row.data; throw error; }
}

deviceReferenceRouter.get('/api/v1/device-reference', requireAuth, async (req, res, next) => {
  try {
    const query = String(req.query.name ?? '').trim().slice(0, 160);
    if (!/\biphone\b/i.test(query)) { res.json({ success: true, data: await loadCatalogDevice(req.storeId!,query,String(req.query.brand??'')) }); return; }
    res.json({ success: true, data: matchReference(query, await loadReferences()) });
  } catch (error) { next(error); }
});

const SPECS_TTL = 30 * 86400000;
const specsRefresh = new Map<string, Promise<SpecLine[]>>();

/** Página oficial de especificações da Apple, lida uma vez e guardada no banco por 30 dias. */
async function appleSpecs(url: string, base: { model: string; capacities: string[] }): Promise<SpecLine[]> {
  const key = `specs:${url}`;
  const row = (await pool.query('SELECT data, refreshed_at FROM device_reference_sources WHERE source_url = $1', [key])).rows[0];
  if (row && Array.isArray(row.data) && row.data.length && Date.now() - new Date(row.refreshed_at).getTime() < SPECS_TTL) return row.data;
  if (!specsRefresh.has(key)) {
    specsRefresh.set(key, (async () => {
      const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
      const final = new URL(response.url || url);
      if (final.protocol !== 'https:' || final.hostname !== 'support.apple.com') throw new Error('Endereço de especificações inválido.');
      if (!response.ok) throw Object.assign(new Error('Não foi possível consultar a ficha técnica da Apple agora.'), { status: 502 });
      const lines = parseAppleSpecs(await response.text(), base);
      if (lines.length < 5) throw Object.assign(new Error('A página da Apple não trouxe a ficha técnica deste modelo.'), { status: 502 });
      await pool.query(`INSERT INTO device_reference_sources (source_url, data) VALUES ($1, $2::jsonb)
        ON CONFLICT (source_url) DO UPDATE SET data = EXCLUDED.data, refreshed_at = now()`, [key, JSON.stringify(lines)]);
      return lines;
    })().finally(() => specsRefresh.delete(key)));
  }
  try { return await specsRefresh.get(key)!; }
  catch (error) { if (row && Array.isArray(row.data) && row.data.length) return row.data; throw error; }
}

/**
 * Ficha técnica sugerida pelo nome do produto: iPhone pela página oficial da Apple; outras marcas pela
 * API de aparelhos da loja (quando configurada). Só sugere — quem grava é o cadastro do produto.
 */
deviceReferenceRouter.get('/api/v1/device-reference/specs', requireAuth, async (req, res, next) => {
  try {
    const name = String(req.query.name ?? '').trim().slice(0, 160);
    if (normalizeDeviceText(name).length < 3) throw Object.assign(new Error('Informe o nome do aparelho no cadastro.'), { status: 400 });
    if (/\biphone\b/i.test(name)) {
      const model = matchReference(name, await loadReferences());
      const url = model ? appleSpecsUrl(model.sourceUrl) : null;
      if (!model || !url) {
        res.json({ success: true, data: { found: false, specs: [], message: 'Não encontramos esse modelo de iPhone. Confira o nome (ex.: IPHONE 15 PRO MAX).' } });
        return;
      }
      const specs = await appleSpecs(url, { model: model.model, capacities: model.capacities });
      res.json({ success: true, data: { found: true, model: model.model, source: 'Apple', sourceUrl: url, specs } });
      return;
    }
    const device = await loadCatalogDevice(req.storeId!, name, String(req.query.brand ?? ''));
    if (!device) {
      res.json({ success: true, data: { found: false, specs: [], message: 'Não encontramos a ficha desse aparelho pelo nome. Confira marca e modelo.' } });
      return;
    }
    res.json({ success: true, data: { found: true, model: `${device.brand} ${device.model}`, source: 'API de aparelhos', sourceUrl: device.sourceUrl, specs: catalogSpecLines(device) } });
  } catch (error) { next(error); }
});

deviceReferenceRouter.get('/api/v1/device-reference/settings',requireAuth,async(req,res,next)=>{try{const s=(await pool.query('SELECT provider_id,enabled,cache_days,(api_key_encrypted<>$2) AS configured FROM device_catalog_settings WHERE store_id=$1',[req.storeId,''])).rows[0];res.json({success:true,data:{settings:s??null,providers:(await pool.query('SELECT id,name,docs_url FROM device_catalog_providers WHERE active=true')).rows,brands:(await pool.query('SELECT name FROM device_catalog_brands ORDER BY name')).rows}});}catch(e){next(e);}});
deviceReferenceRouter.put('/api/v1/device-reference/settings',requireAuth,async(req,res,next)=>{try{
 if(!['admin','manager','superadmin'].includes(req.user!.role||''))throw Object.assign(new Error('Sem permissão para configurar a API.'),{status:403});
 const b=z.object({providerId:z.string(),enabled:z.boolean(),cacheDays:z.number().int().min(1).max(365),apiKey:z.string().trim().max(1000).optional()}).parse(req.body);
 if(!(await pool.query('SELECT id FROM device_catalog_providers WHERE id=$1 AND active=true',[b.providerId])).rows.length)throw Object.assign(new Error('Fornecedor inválido.'),{status:400});
 const saved=(await pool.query('SELECT api_key_encrypted,provider_id FROM device_catalog_settings WHERE store_id=$1',[req.storeId])).rows[0];
 const key=b.apiKey?encryptCatalogKey(b.apiKey):saved?.provider_id===b.providerId?saved.api_key_encrypted:'';
 if(b.enabled&&!key)throw Object.assign(new Error('Informe a chave para ativar a consulta.'),{status:400});
 await pool.query('INSERT INTO device_catalog_settings(store_id,provider_id,enabled,cache_days,api_key_encrypted) VALUES($1,$2,$3,$4,$5) ON CONFLICT(store_id) DO UPDATE SET provider_id=EXCLUDED.provider_id,enabled=EXCLUDED.enabled,cache_days=EXCLUDED.cache_days,api_key_encrypted=EXCLUDED.api_key_encrypted,updated_at=now()',[req.storeId,b.providerId,b.enabled,b.cacheDays,key]);
 res.json({success:true,data:{configured:Boolean(key)}});
 }catch(e){next(e);}});
