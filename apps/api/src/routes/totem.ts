import {submitTotemLead as sendTotemWhatsApp} from '../services/evolutionWhatsApp.js';
import {quoteTotemCombination} from '../services/totemCombination.js';
import {listDayOffers,matchDayOffer} from '../services/dayOffers.js';
import {validateSaleAttributes} from '../services/saleAttributes.js';
import {pickupSelection,resolvePickup,recordPickup} from '../services/pickup.js';
import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { requireAuth, requireOrDemoAuth } from '../middlewares/authMiddleware.js';
import { formatStockRow } from './stock.js';

export const totemRouter = Router();

const defaultTotemSettings = {
  attractContent:'full',
  assistant:{enabled:false,name:'Mariana',avatar:null,whatsapp:'',sellerId:'',askIntent:true,askBrand:true,namePrompt:'Oi, meu nome é {vendedor}. Como você prefere ser chamado?',intentPrompt:'Oi, {nome}! O que está buscando hoje?',brandPrompt:'Qual marca te agrada mais, {nome}?',productsPrompt:'{nome}, estes são os produtos disponíveis. Qual faz mais sentido para você?',closingPrompt:'Ótima escolha, {nome}! Você pode finalizar comigo pelo WhatsApp ou na loja.'},
  mode: 'kiosk',
  exitPassword: '1234',
  shareStockWithErp: true,
  vertical: 'phones',
  columns: 2,
  showAttractScreen: true,
  showActionButtons: true,
  customGreetingText: '',
  customSubtitleText: '',
  storeName: 'Loja Principal',
  headerSubtitle: '',
  storeLogo: null,
  attractBackground: null,
  attractGradientColor: '#0f766e',
  attractLayout: 'standard',
  keyboardPlacement: 'bottom',
  askCustomerName: false,
  offerFulfillment: true,
  printTicket: false,
  audioAssist: false,
  storeWhatsApp: '',
  notifyCustomerOnLead: false,
  locationLabel: 'Loja Principal',
  cardFeePercent: 0,
};

const totemSettingsSchema = z.object({
  attractContent:z.enum(['full','text','background']).default('full'),
  assistant:z.object({enabled:z.boolean(),name:z.string().trim().min(1).max(80),avatar:z.string().nullable(),whatsapp:z.string().max(30),sellerId:z.string().max(100),askIntent:z.boolean(),askBrand:z.boolean(),namePrompt:z.string().max(300),intentPrompt:z.string().max(300),brandPrompt:z.string().max(300),productsPrompt:z.string().max(300),closingPrompt:z.string().max(300)}).optional(),
  mode: z.enum(['kiosk', 'catalog']).default('kiosk'),
  exitPassword: z.string().optional(),
  shareStockWithErp: z.boolean().default(true),
  vertical: z.enum(['general', 'food', 'retail', 'phones', 'optics']).default('phones'),
  columns: z.coerce.number().min(1).max(4).default(2),
  showAttractScreen: z.boolean().default(true),
  showActionButtons: z.boolean().default(true),
  customGreetingText: z.string().optional().default(''),
  customSubtitleText: z.string().optional().default(''),
  storeName: z.string().default('Loja Principal'),
  headerSubtitle: z.string().trim().max(140).default(''),
  storeLogo: z.string().nullable().optional(),
  attractBackground: z.string().nullable().optional(),
  attractGradientColor: z.string().default('#0f766e'),
  attractLayout: z.enum(['standard', 'logoPromo', 'greeting']).default('standard'),
  keyboardPlacement: z.enum(['top', 'bottom']).default('bottom'),
  askCustomerName: z.boolean().default(false),
  offerFulfillment: z.boolean().default(true),
  printTicket: z.boolean().default(false),
  audioAssist: z.boolean().default(false),
  storeWhatsApp: z.string().optional().default(''),
  notifyCustomerOnLead: z.boolean().default(false),
  locationLabel: z.string().optional().default(''),
  cardFeePercent: z.coerce.number().default(0),
});

const leadSchema = z.object({
  pickupMethodId:pickupSelection.pickupMethodId,deliveryAddress:pickupSelection.deliveryAddress,
  requestKey:z.string().min(8).max(100).optional(),
  destination:z.enum(['cashier','whatsapp']).default('cashier'),
  stockId:z.string().min(1),
  payment:z.enum(['À vista','Parcelado']).default('À vista'),installment:z.string().nullable().optional(),priceLabel:z.string().optional(),
  customerName: z.string().trim().min(1).max(100),
  customerPhone: z.string().max(30).default(''),
  productName: z.string().default('Produto'),
  attributes: z.array(z.object({ id: z.string(), name: z.string(), value: z.string() })).optional(),
  color: z.string().optional().default(''),
  storage: z.string().optional().default(''),
  fulfillment: z.string().optional().default(''),
  notes: z.string().optional().default(''),
});

async function resolveStoreId(req: Request): Promise<string> {
  if (req.storeId) return req.storeId;
  const selected=req.header('x-store-id')?.trim() || (typeof req.query.storeId === 'string' ? req.query.storeId.trim() : '');
  if (!selected) throw Object.assign(new Error('Informe a loja do totem.'), {status:400});
  const result=await pool.query('SELECT id FROM stores WHERE id=$1 AND active=true',[selected]);
  if (!result.rows.length) throw Object.assign(new Error('Loja não encontrada.'), {status:404});
  return selected;
}

async function getStoreTotemSettings(storeId: string) {
  if (pool) {
    try {
      const res = await pool.query(
        `SELECT id, trade_name, totem_exit_password, totem_settings FROM stores WHERE id = $1`,
        [storeId],
      );

      if (res.rows.length > 0) {
        const row = res.rows[0];
        const rawSettings = typeof row.totem_settings === 'string' 
          ? JSON.parse(row.totem_settings) 
          : (row.totem_settings || {});
        
        const machines=(await pool.query("SELECT data FROM store_module_state WHERE store_id=$1 AND module_key='card-rates'",[storeId])).rows[0]?.data;
        const active=Array.isArray(machines)?machines.filter((m:any)=>m.active):[];
        const machine=active.find((m:any)=>m.isDefaultTotem)??active[0];
        const brand=machine?.brands?.find((b:any)=>b.id===machine.defaultBrandId&&b.active)??machine?.brands?.find((b:any)=>b.active);
        const cardInstallmentRates=brand?.installments?.length?Object.fromEntries(Array.from({length:18},(_,i)=>[i+1,Number(brand.installments.find((entry:any)=>entry.installment===i+1)?.rate??brand.installments[brand.installments.length-1].rate)])):{};
        return {
          ...defaultTotemSettings,
          ...rawSettings,
          cardInstallmentRates,
          storeName: rawSettings.storeName || row.trade_name || defaultTotemSettings.storeName,
          exitPassword: row.totem_exit_password || rawSettings.exitPassword || defaultTotemSettings.exitPassword,
        };
      }
    } catch (err) {
      throw err;
    }
  }

  throw Object.assign(new Error('Loja indisponível.'),{status:404});
}

async function handleGetSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const storeId = await resolveStoreId(req);
    const settings = await getStoreTotemSettings(storeId);
    if (!req.user) { const {exitPassword, ...publicSettings}=settings; res.json({success:true,data:publicSettings}); return; }
    res.json({ success: true, data: settings });
  } catch (error) {
    next(error);
  }
}

async function handleSaveSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const storeId = await resolveStoreId(req);
    const parsed = totemSettingsSchema.partial().parse(req.body);
    if(parsed.assistant?.sellerId && !(await pool.query('SELECT id FROM sellers WHERE id=$1 AND store_id=$2 AND active=true',[parsed.assistant.sellerId,storeId])).rows.length)throw Object.assign(new Error('Escolha um vendedor ativo desta loja.'),{status:400});

    const current = await getStoreTotemSettings(storeId);
    const nextExitPassword = (parsed.exitPassword !== undefined && parsed.exitPassword.trim() !== '')
      ? parsed.exitPassword.trim()
      : current.exitPassword;

    const merged = {
      ...current,
      ...parsed,
      exitPassword: nextExitPassword,
    };

    const saved=await pool.query(
      `UPDATE stores SET totem_exit_password=$1,totem_settings=$2::jsonb,updated_at=now()
       WHERE id=$3 AND active=true RETURNING id`,
      [nextExitPassword,JSON.stringify(merged),storeId],
    );
    if(!saved.rows.length)throw Object.assign(new Error('Loja indisponível.'),{status:404});
    res.json({ success: true, data: merged });
  } catch (error) {
    next(error);
  }
}

async function handleGetCatalog(req: Request, res: Response, next: NextFunction) {
  try {
    const storeId = await resolveStoreId(req);

    if (pool) {
      try {
        const sql = `
          SELECT id, name, sku, barcode, imei, unit, qty, min_qty, cost, price,
                 kind, condition, category, brand, supplier_id, track_lot, is_kit, active,
                 pickup_prices, attrs, color, capacity, card_rate, show_on_totem, images, variations, created_at, updated_at
          FROM stock_items
          WHERE store_id = $1
            AND active = true
            AND (show_on_totem = true OR show_on_totem IS NULL)
          ORDER BY name ASC
        `;
        const result = await pool.query(sql, [storeId]);
        res.json({ success: true, data: result.rows.map(formatStockRow) });
        return;
      } catch (dbErr) {
        throw dbErr;
      }
    }

    throw Object.assign(new Error('Banco de dados indisponível.'),{status:503});
  } catch (error) {
    next(error);
  }
}

async function handleGetAttributes(req: Request, res: Response, next: NextFunction) {
  try {
    const storeId = await resolveStoreId(req);

    if (pool) {
      const attrsRes = await pool.query(
        `SELECT id, name, use_on_totem, filter_on_totem, use_on_stock, use_on_pdv, use_on_external_sale, sort, active
         FROM product_attributes
         WHERE store_id = $1
           AND active = true
           AND use_on_totem = true
         ORDER BY sort ASC, name ASC`,
        [storeId],
      );

      if (attrsRes.rows.length > 0) {
        const items = [];
        for (const row of attrsRes.rows) {
          const valRes = await pool.query(
            `SELECT value, price_delta, sort FROM product_attribute_values WHERE attribute_id = $1 ORDER BY sort ASC, id ASC`,
            [row.id],
          );
          const values: string[] = [];
          const priceDeltas: Record<string, number> = {};
          for (const v of valRes.rows) {
            values.push(v.value);
            if (Number(v.price_delta) !== 0) {
              priceDeltas[v.value] = Number(v.price_delta);
            }
          }
          items.push({
            id: row.id,
            name: row.name,
            values,
            priceDeltas,
            useOnTotem: Boolean(row.use_on_totem),
            filterOnTotem: Boolean(row.filter_on_totem),
            useOnStock: Boolean(row.use_on_stock),
            useOnPdv: Boolean(row.use_on_pdv),
            useOnExternalSale: Boolean(row.use_on_external_sale),
            sort: Number(row.sort) || 0,
            active: Boolean(row.active),
          });
        }
        res.json({ success: true, data: items });
        return;
      }
    }

    res.json({ success: true, data: [] });
  } catch (error) {
    next(error);
  }
}

async function handleCreateLead(req: Request, res: Response, next: NextFunction) {
  try {
    const body = leadSchema.parse(req.body);
    const storeId = await resolveStoreId(req);
    const ticketId = `TCK-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const code = Math.floor(100 + Math.random() * 900);



    if (pool) {
      const client=await pool.connect();
      try{await client.query('BEGIN');
      if(body.requestKey){
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[storeId+':totem:'+body.requestKey]);
        const existing=(await client.query('SELECT * FROM pos_tickets WHERE store_id=$1 AND request_key=$2',[storeId,body.requestKey])).rows[0];
        if(existing){await client.query('COMMIT');res.status(200).json({success:true,data:{...existing.configuration,notificationWarning:existing.configuration.whatsappStatus==='pending'?'Pedido registrado. O envio do WhatsApp ainda não foi confirmado; procure o atendente.':existing.configuration.notificationWarning,id:existing.id,code:existing.code,status:existing.status}});return;}
      }
      const serviceOptions=body.attributes?.filter(a=>a.id==='TOTEM-DINE')??[];
      if(serviceOptions.length){const settings=await getStoreTotemSettings(storeId);if(settings.vertical!=='food'||serviceOptions.some(a=>!['Consumir no local','Retirada'].includes(a.value)))throw Object.assign(new Error('Opção de atendimento indisponível.'),{status:400});}
      await validateSaleAttributes(client,storeId,[{stockId:body.stockId,attributes:body.attributes?.filter(a=>a.id!=='TOTEM-DINE')}],'totem');
      if(body.stockId){const stock=(await client.query('SELECT name,color,capacity,card_rate FROM stock_items WHERE id=$1 AND store_id=$2 AND active=true',[body.stockId,storeId])).rows[0];if(stock){body.productName=stock.name;body.color=stock.color||body.color;body.storage=stock.capacity||body.storage;(body as any).cardFeePercent=stock.card_rate===null||stock.card_rate===undefined?(await getStoreTotemSettings(storeId)).cardFeePercent:Number(stock.card_rate);}}

      let pickup:any;
      if(body.stockId){if(!(await client.query('SELECT id FROM stock_items WHERE id=$1 AND store_id=$2 AND show_on_totem=true AND active=true',[body.stockId,storeId])).rows.length)throw Object.assign(new Error('Produto não disponível no Totem.'),{status:404});if(!body.pickupMethodId)throw Object.assign(new Error('Escolha o tipo de retirada.'),{status:400});pickup=await resolvePickup(client,storeId,body.stockId,body.pickupMethodId,body.deliveryAddress);if(pickup.kind==='order'&&!body.customerPhone.trim())throw Object.assign(new Error('Informe o telefone para acompanhar a encomenda.'),{status:400});}
      if(pickup && body.stockId){pickup=await quoteTotemCombination(client,storeId,body.stockId,pickup,body.attributes?.filter(a=>a.id!=='TOTEM-DINE'));const offer=matchDayOffer(await listDayOffers(client,storeId,'totem'),body.stockId,Object.fromEntries((body.attributes??[]).map(a=>[a.id,a.value])),pickup.unitPrice);if(offer){pickup.unitPrice=Number(offer.promoPrice);(body as any).offerId=offer.id;}}
      if(pickup) {
        const money=(amount:number)=>amount.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
        if(body.payment==='Parcelado') {
          const count=Number(String(body.installment??'').replace(/x$/i,''));
          if(!Number.isInteger(count)||count<1||count>18) throw Object.assign(new Error('Parcelamento inválido.'),{status:400});
          const settings=await getStoreTotemSettings(storeId);
          const fee=Number(pickup.cardRate)>0?Number(pickup.cardRate):settings.cardInstallmentRates?.[count]??(body as any).cardFeePercent;
          const total=pickup.unitPrice*(1+Math.max(0,Number(fee)||0)/100);
          body.priceLabel=count+'x · '+count+' X '+money(Math.round(total/count*100)/100);
        } else {body.priceLabel=money(pickup.unitPrice);body.installment=null;}
      }
      await client.query(
        `INSERT INTO pos_tickets (id, store_id, code, customer_name, customer_phone, status, source, notes, request_key, product_name)
         VALUES ($1, $2, $3, $4, $5, 'open', 'totem', $6, $7, $8)`,
        [ticketId, storeId, code, body.customerName, body.customerPhone, `${body.productName} · ${body.color || ''} ${body.storage || ''}\n${body.notes}`.trim(),body.requestKey??null,body.productName],
      );
      if(pickup){const token=await recordPickup(client,storeId,ticketId,body,{...body,qty:1,unitPrice:pickup.unitPrice});(body as any).trackingToken=token;(body as any).quotedPrice=pickup.unitPrice;}
      const settings=await getStoreTotemSettings(storeId);
      const assistant=(settings as any).assistant;
      const seller=assistant?.sellerId?(await client.query('SELECT name,phone FROM sellers WHERE id=$1 AND store_id=$2 AND active=true',[assistant.sellerId,storeId])).rows[0]:null;
      const whatsapp=String(assistant?.whatsapp||seller?.phone||settings.storeWhatsApp||'').replace(/\D/g,'');
      if(whatsapp.length>=10){const destination=whatsapp.length<=11?'55'+whatsapp:whatsapp;const message=[`Olá, ${seller?.name||assistant?.name||'equipe'}! Quero finalizar meu pedido ${ticketId}.`,`Cliente: ${body.customerName}`,`Telefone: ${body.customerPhone}`,`Produto: ${body.productName}`,...(body.attributes??[]).map(a=>`${a.name}: ${a.value}`),`Retirada: ${pickup?.name||''}`,`Valor: ${body.priceLabel}`].join('\n');(body as any).whatsappUrl=`https://wa.me/${destination}?text=${encodeURIComponent(message)}`;(body as any).storeWhatsApp=destination;}
      (body as any).sellerId=assistant?.sellerId||null;
      await client.query('UPDATE pos_tickets SET configuration=$2 WHERE id=$1 AND store_id=$3',[ticketId,JSON.stringify({...body,cashPrice:pickup?.unitPrice,whatsappStatus:body.destination==='whatsapp'?'pending':'not_requested'}),storeId]);
      await client.query('COMMIT');}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
    }

    let customerNotified=false;
    let whatsappStatus=body.destination==='whatsapp'?'pending':'not_requested';
    let notificationWarning:string|undefined;
    if(body.destination==='whatsapp'){
      try {
        const settings=await getStoreTotemSettings(storeId);
        const result=await sendTotemWhatsApp({...body,storeId,installment:body.installment??null,priceLabel:body.priceLabel||'',locationLabel:settings.locationLabel});
        customerNotified=result.customerNotified;whatsappStatus='accepted';
      } catch {
        whatsappStatus='unconfirmed';
        notificationWarning='Pedido registrado na fila do caixa. O WhatsApp não confirmou o envio; procure o atendente.';
      }
      await pool.query(`UPDATE pos_tickets SET configuration=configuration || $2::jsonb WHERE id=$1 AND store_id=$3`,[ticketId,JSON.stringify({customerNotified,whatsappStatus,notificationWarning}),storeId]);
    }
    res.status(201).json({
      success: true,
      data: {
        customerNotified,whatsappStatus,notificationWarning,
        trackingToken:(body as any).trackingToken,
        quotedPrice:(body as any).quotedPrice,
        whatsappUrl:(body as any).whatsappUrl,
        id: ticketId,
        code,
        customerName: body.customerName,
        customerPhone: body.customerPhone,
        productName: body.productName,
        priceLabel: body.priceLabel,
        status: 'open',
        source: 'totem',
      },
    });
  } catch (error) {
    next(error);
  }
}

// A senha de saída nunca vai para o totem público; ele pergunta ao servidor se a senha
// digitada confere. Limitamos as tentativas por loja para não virar força bruta.
const UNLOCK_WINDOW_MS = 5 * 60_000;
const UNLOCK_MAX_FAILURES = 10;
const unlockFailures = new Map<string, { count: number; since: number }>();

async function handleUnlock(req: Request, res: Response, next: NextFunction) {
  try {
    const storeId = await resolveStoreId(req);
    const { password } = z.object({ password: z.string().max(64) }).parse(req.body);
    const now = Date.now();
    const failures = unlockFailures.get(storeId);
    if (failures && now - failures.since > UNLOCK_WINDOW_MS) unlockFailures.delete(storeId);
    const current = unlockFailures.get(storeId);
    if (current && current.count >= UNLOCK_MAX_FAILURES) {
      res.status(429).json({ success: false, error: { code: 'TOO_MANY_ATTEMPTS', message: 'Muitas tentativas. Aguarde alguns minutos.' } });
      return;
    }
    const settings = await getStoreTotemSettings(storeId);
    if (password.trim() !== String(settings.exitPassword)) {
      unlockFailures.set(storeId, { count: (current?.count ?? 0) + 1, since: current?.since ?? now });
      res.status(403).json({ success: false, error: { code: 'INVALID_PASSWORD', message: 'Senha incorreta. Só a loja pode fechar o totem.' } });
      return;
    }
    unlockFailures.delete(storeId);
    res.json({ success: true, data: { unlocked: true } });
  } catch (error) {
    next(error);
  }
}

totemRouter.post('/api/v1/totem/unlock', handleUnlock);

// ── Rotas do Totem e Configurações da Empresa (/store/totem-settings) ────────
totemRouter.get('/api/v1/store/totem-settings', requireOrDemoAuth, handleGetSettings);
totemRouter.get('/store/totem-settings', requireOrDemoAuth, handleGetSettings);
totemRouter.put('/api/v1/store/totem-settings', requireOrDemoAuth, handleSaveSettings);
totemRouter.put('/store/totem-settings', requireOrDemoAuth, handleSaveSettings);

// ── Rotas Públicas do Totem (cliente / terminal sem autenticação) ────────────
totemRouter.get('/api/v1/totem/settings', handleGetSettings);
totemRouter.get('/totem/settings', handleGetSettings);
totemRouter.put('/api/v1/totem/settings', requireAuth, handleSaveSettings);
totemRouter.put('/totem/settings', requireAuth, handleSaveSettings);

totemRouter.get('/api/v1/totem/revision',async(req,res,next)=>{
  try {
    const storeId=await resolveStoreId(req);
    const result=await pool.query(`SELECT md5(COALESCE((SELECT string_agg(id || ':' || updated_at::text, ',' ORDER BY id) FROM stock_items WHERE store_id=$1),'') || ':' || COALESCE((SELECT updated_at::text FROM stores WHERE id=$1),'')) AS revision`,[storeId]);
    res.set('Cache-Control','no-store').json({success:true,data:{revision:result.rows[0].revision}});
  }catch(error){next(error);}
});
totemRouter.get('/api/v1/totem/catalog', handleGetCatalog);
totemRouter.get('/totem/catalog', handleGetCatalog);
totemRouter.get('/api/v1/totem/offers',async(req,res,next)=>{try{const storeId=await resolveStoreId(req);res.json({success:true,data:await listDayOffers(pool,storeId,'totem')});}catch(error){next(error);}});

totemRouter.get('/api/v1/totem/attributes', handleGetAttributes);
totemRouter.get('/totem/attributes', handleGetAttributes);

totemRouter.post('/api/v1/totem/leads', handleCreateLead);
totemRouter.post('/totem/leads', handleCreateLead);

totemRouter.get('/api/v1/totem/pickup-methods',async(req,res,next)=>{try{const storeId=await resolveStoreId(req);res.json({success:true,data:(await pool.query('SELECT id,name,kind,active,lead_days FROM pickup_methods WHERE store_id=$1 AND active=true ORDER BY kind,name',[storeId])).rows});}catch(e){next(e);}});

totemRouter.get('/api/v1/totem/pickup-quote',async(req,res,next)=>{try{const storeId=await resolveStoreId(req);const q=z.object({stockId:z.string(),methodId:z.string()}).parse(req.query);if(!(await pool.query('SELECT id FROM stock_items WHERE id=$1 AND store_id=$2 AND show_on_totem=true AND active=true',[q.stockId,storeId])).rows.length)throw Object.assign(new Error('Produto não disponível no Totem.'),{status:404});const p=await resolvePickup(pool,storeId,q.stockId,q.methodId,undefined,true);res.json({success:true,data:{unitPrice:p.unitPrice,estimatedDate:p.estimatedDate}});}catch(e){next(e);}});

totemRouter.get('/api/v1/pos/tickets',requireAuth,async(req,res,next)=>{try{const r=await pool.query('SELECT * FROM pos_tickets WHERE store_id=$1 ORDER BY created_at DESC LIMIT 300',[req.storeId]);res.json({success:true,data:{items:r.rows.map(t=>({...t.configuration,id:t.id,status:t.status,source:t.source,customerName:t.customer_name,customerPhone:t.customer_phone,productName:t.configuration.productName||t.notes,color:t.configuration.color||'',storage:t.configuration.storage||'',fulfillment:t.configuration.fulfillment||'',payment:t.configuration.payment||'À vista',installment:t.configuration.installment||null,priceLabel:t.configuration.priceLabel||'',createdAt:t.created_at,closedAt:null}))}});}catch(e){next(e);}});
totemRouter.patch('/api/v1/pos/tickets/:id',requireAuth,async(req,res,next)=>{try{const {status}=z.object({status:z.enum(['open','sold','cancelled'])}).parse(req.body);await pool.query('UPDATE pos_tickets SET status=$3 WHERE id=$1 AND store_id=$2',[req.params.id,req.storeId,status]);res.json({success:true,data:{status}});}catch(e){next(e);}});
