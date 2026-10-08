import {submitTotemLead as sendTotemWhatsApp,renderTotemCustomerMessage,DEFAULT_TOTEM_CUSTOMER_MESSAGE} from '../services/evolutionWhatsApp.js';

/** "MATHEUS SILVA" (teclado do totem em maiúsculas) vira "Matheus Silva" na mensagem. */
function titleCase(value: string) {
  return value.trim().toLocaleLowerCase('pt-BR').replace(/(^|\s)(\p{L})/gu, (_, space: string, letter: string) => space + letter.toLocaleUpperCase('pt-BR'));
}
function customerFirstName(value: string) {
  return titleCase(value).split(/\s+/)[0] || '';
}
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
  customerWhatsAppMessage: DEFAULT_TOTEM_CUSTOMER_MESSAGE,
  theme: 'light',
  catalogNav: 'top',
  navGroup: 'brand',
  topBanners: [] as string[],
  cartEnabled: false,
  checkoutGesture: 'button',
  whatsAppCheckout: true,
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
  customerWhatsAppMessage: z.string().trim().max(1500).optional(),
  // Visual e navegação: cada loja monta o totem do seu jeito; o padrão é o totem de sempre.
  theme: z.enum(['light', 'dark']).default('light'),
  catalogNav: z.enum(['top', 'sidebar']).default('top'),
  navGroup: z.enum(['brand', 'category']).default('brand'),
  topBanners: z.array(z.string().startsWith('data:image/').max(1_500_000)).max(5).default([]),
  cartEnabled: z.boolean().default(false),
  checkoutGesture: z.enum(['button', 'swipe']).default('button'),
  /** Botão "Concluir pelo WhatsApp" no fim do pedido. Desligado: só caixa (e ticket impresso). */
  whatsAppCheckout: z.boolean().default(true),
});

const leadSchema = z.object({
  pickupMethodId:pickupSelection.pickupMethodId,deliveryAddress:pickupSelection.deliveryAddress,
  requestKey:z.string().min(8).max(100).optional(),
  destination:z.enum(['cashier','whatsapp']).default('cashier'),
  stockId:z.string().min(1).optional(),
  /** Carrinho: vários itens no mesmo pedido. Sem items, vale o produto único de stockId. */
  items:z.array(z.object({
    stockId:z.string().min(1),
    pickupMethodId:pickupSelection.pickupMethodId,
    deliveryAddress:pickupSelection.deliveryAddress,
    attributes:z.array(z.object({ id: z.string(), name: z.string(), value: z.string() })).optional(),
    qty:z.coerce.number().int().min(1).max(99).default(1),
  })).min(1).max(30).optional(),
  payment:z.enum(['À vista','Parcelado']).default('À vista'),installment:z.string().nullable().optional(),priceLabel:z.string().optional(),
  customerName: z.string().trim().min(1).max(100),
  customerPhone: z.string().max(30).default(''),
  productName: z.string().default('Produto'),
  attributes: z.array(z.object({ id: z.string(), name: z.string(), value: z.string() })).optional(),
  color: z.string().optional().default(''),
  storage: z.string().optional().default(''),
  fulfillment: z.string().optional().default(''),
  notes: z.string().optional().default(''),
}).refine(body=>Boolean(body.stockId||body.items?.length),{message:'Escolha um produto.',path:['stockId']});

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
        `SELECT id, trade_name, totem_exit_password, totem_settings, logo FROM stores WHERE id = $1`,
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
          // Sem logo própria no totem, vale a logo cadastrada em Operações › Dados da loja.
          storeLogo: rawSettings.storeLogo || row.logo || null,
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

type LeadItem = {
  stockId: string;
  pickupMethodId?: string;
  deliveryAddress?: any;
  attributes?: { id: string; name: string; value: string }[];
  qty: number;
};

type PreparedLeadItem = LeadItem & {
  productName: string;
  color: string;
  storage: string;
  cardFeePercent: number;
  pickup: any;
  offerId?: string;
  unitPrice: number;
  priceLabel: string;
  /** Total da linha já com a taxa do parcelamento, quando parcelado. */
  lineTotal: number;
};

const money = (amount: number) => amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Valida e cota um item do totem no banco: produto, atributos, retirada, oferta do dia e parcelamento. */
async function prepareTotemItem(
  client: any,
  storeId: string,
  settings: any,
  offers: any[],
  item: LeadItem,
  payment: string,
  installmentCount: number,
  customerPhone: string,
): Promise<PreparedLeadItem> {
  const serviceOptions = item.attributes?.filter(a => a.id === 'TOTEM-DINE') ?? [];
  if (serviceOptions.length && (settings.vertical !== 'food' || serviceOptions.some(a => !['Consumir no local', 'Retirada'].includes(a.value)))) {
    throw Object.assign(new Error('Opção de atendimento indisponível.'), { status: 400 });
  }
  const productAttributes = item.attributes?.filter(a => a.id !== 'TOTEM-DINE');
  await validateSaleAttributes(client, storeId, [{ stockId: item.stockId, attributes: productAttributes }], 'totem');
  const stock = (await client.query(
    'SELECT name,color,capacity,card_rate FROM stock_items WHERE id=$1 AND store_id=$2 AND show_on_totem=true AND active=true',
    [item.stockId, storeId],
  )).rows[0];
  if (!stock) throw Object.assign(new Error('Produto não disponível no Totem.'), { status: 404 });
  if (!item.pickupMethodId) throw Object.assign(new Error('Escolha o tipo de retirada.'), { status: 400 });
  let pickup = await resolvePickup(client, storeId, item.stockId, item.pickupMethodId, item.deliveryAddress);
  if (pickup.kind === 'order' && !customerPhone.trim()) throw Object.assign(new Error('Informe o telefone para acompanhar a encomenda.'), { status: 400 });
  pickup = await quoteTotemCombination(client, storeId, item.stockId, pickup, productAttributes);
  const offer = matchDayOffer(offers, item.stockId, Object.fromEntries((item.attributes ?? []).map(a => [a.id, a.value])), pickup.unitPrice);
  if (offer) pickup.unitPrice = Number(offer.promoPrice);
  const cardFeePercent = stock.card_rate === null || stock.card_rate === undefined ? settings.cardFeePercent : Number(stock.card_rate);

  let priceLabel = money(pickup.unitPrice);
  let lineTotal = pickup.unitPrice * item.qty;
  if (payment === 'Parcelado') {
    const fee = Number(pickup.cardRate) > 0 ? Number(pickup.cardRate) : settings.cardInstallmentRates?.[installmentCount] ?? cardFeePercent;
    const total = pickup.unitPrice * (1 + Math.max(0, Number(fee) || 0) / 100);
    priceLabel = installmentCount + 'x · ' + installmentCount + ' X ' + money(Math.round(total / installmentCount * 100) / 100);
    lineTotal = total * item.qty;
  }
  return {
    ...item,
    productName: stock.name,
    color: stock.color || '',
    storage: stock.capacity || '',
    cardFeePercent,
    pickup,
    offerId: offer?.id,
    unitPrice: pickup.unitPrice,
    priceLabel,
    lineTotal,
  };
}

async function handleCreateLead(req: Request, res: Response, next: NextFunction) {
  try {
    const body = leadSchema.parse(req.body);
    const storeId = await resolveStoreId(req);
    const ticketId = `TCK-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const code = Math.floor(100 + Math.random() * 900);
    const isCart = Boolean(body.items?.length);
    const { items: _cartItems, ...leadBase } = body;
    const items: LeadItem[] = isCart
      ? body.items!
      : [{ stockId: body.stockId!, pickupMethodId: body.pickupMethodId, deliveryAddress: body.deliveryAddress, attributes: body.attributes, qty: 1 }];

    // A mensagem vai para o telefone que o cliente digitou; sem ele não há para quem enviar.
    if(body.destination==='whatsapp'&&(await getStoreTotemSettings(storeId) as any).whatsAppCheckout===false)throw Object.assign(new Error('Esta loja finaliza os pedidos do totem no caixa.'),{status:400});
    if(body.destination==='whatsapp'&&body.customerPhone.replace(/\D/g,'').length<10)throw Object.assign(new Error('Informe um telefone com DDD para receber a mensagem no WhatsApp.'),{status:400});
    let installmentCount = 0;
    if (body.payment === 'Parcelado') {
      installmentCount = Number(String(body.installment ?? '').replace(/x$/i, ''));
      if (!Number.isInteger(installmentCount) || installmentCount < 1 || installmentCount > 18) throw Object.assign(new Error('Parcelamento inválido.'), { status: 400 });
    }
    const installment = body.payment === 'Parcelado' ? body.installment ?? null : null;

    let customerMessage = '';
    let prepared: PreparedLeadItem[] = [];
    const ticketIds: string[] = [];
    let first: Record<string, any> = {};

    const client=await pool.connect();
    try{await client.query('BEGIN');
      if(body.requestKey){
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[storeId+':totem:'+body.requestKey]);
        const existing=(await client.query('SELECT * FROM pos_tickets WHERE store_id=$1 AND request_key=$2',[storeId,body.requestKey])).rows[0];
        if(existing){await client.query('COMMIT');res.status(200).json({success:true,data:{...existing.configuration,notificationWarning:existing.configuration.whatsappStatus==='pending'?'Pedido registrado. O envio do WhatsApp ainda não foi confirmado; procure o atendente.':existing.configuration.notificationWarning,id:existing.id,code:existing.code,status:existing.status}});return;}
      }
      const settings: any = await getStoreTotemSettings(storeId);
      const offers = await listDayOffers(client, storeId, 'totem');
      for (const item of items) {
        prepared.push(await prepareTotemItem(client, storeId, settings, offers, item, body.payment, installmentCount, body.customerPhone));
      }

      const assistant=settings.assistant;
      const seller=assistant?.sellerId?(await client.query('SELECT name,phone FROM sellers WHERE id=$1 AND store_id=$2 AND active=true',[assistant.sellerId,storeId])).rows[0]:null;
      const pickupNames = [...new Set(prepared.map(line => line.pickup?.name).filter(Boolean))].join(' / ');
      const cashTotal = prepared.reduce((sum, line) => sum + line.unitPrice * line.qty, 0);
      const chargedTotal = prepared.reduce((sum, line) => sum + line.lineTotal, 0);
      const lineText = (line: PreparedLeadItem) => {
        const attrs = (line.attributes ?? []).filter(a => a.value.trim()).map(a => `${a.name}: ${a.value}`).join(' · ');
        return `${line.qty > 1 ? `${line.qty}x ` : ''}${line.productName}${attrs ? ` (${attrs})` : ''}`;
      };

      let whatsappUrl: string | undefined;
      let storeWhatsApp: string | undefined;
      const whatsapp=String(assistant?.whatsapp||seller?.phone||settings.storeWhatsApp||'').replace(/\D/g,'');
      if(whatsapp.length>=10){
        storeWhatsApp=whatsapp.length<=11?'55'+whatsapp:whatsapp;
        const message=[`Olá, ${seller?.name||assistant?.name||'equipe'}! Quero finalizar meu pedido ${ticketId}.`,`Cliente: ${body.customerName}`,`Telefone: ${body.customerPhone}`,...prepared.map(line=>`Produto: ${lineText(line)} · ${line.priceLabel}`),`Retirada: ${pickupNames}`,...(isCart?[`Total: ${money(cashTotal)}`]:[])].join('\n');
        whatsappUrl=`https://wa.me/${storeWhatsApp}?text=${encodeURIComponent(message)}`;
      }

      for (const [index, line] of prepared.entries()) {
        const lineTicketId = index === 0 ? ticketId : `${ticketId}-${index + 1}`;
        ticketIds.push(lineTicketId);
        await client.query(
          `INSERT INTO pos_tickets (id, store_id, code, customer_name, customer_phone, status, source, notes, request_key, product_name)
           VALUES ($1, $2, $3, $4, $5, 'open', 'totem', $6, $7, $8)`,
          [lineTicketId, storeId, code, body.customerName, body.customerPhone, `${line.productName} · ${line.color || ''} ${line.storage || ''}\n${body.notes}`.trim(), index === 0 ? body.requestKey ?? null : null, line.productName],
        );
        const lineData = {
          ...leadBase,
          stockId: line.stockId, pickupMethodId: line.pickupMethodId, deliveryAddress: line.deliveryAddress, attributes: line.attributes,
          productName: line.productName,
          color: line.color || body.color,
          storage: line.storage || body.storage,
          cardFeePercent: line.cardFeePercent,
          offerId: line.offerId,
          installment,
          priceLabel: line.priceLabel,
          qty: line.qty,
          whatsappUrl, storeWhatsApp,
          sellerId: assistant?.sellerId || null,
          ...(isCart ? { cartId: ticketId, cartIndex: index + 1, cartSize: prepared.length } : {}),
        };
        const trackingToken = await recordPickup(client, storeId, lineTicketId, body, { ...lineData, unitPrice: line.unitPrice });
        const config = { ...lineData, trackingToken, quotedPrice: line.unitPrice, cashPrice: line.unitPrice, whatsappStatus: body.destination === 'whatsapp' ? 'pending' : 'not_requested' };
        await client.query('UPDATE pos_tickets SET configuration=$2 WHERE id=$1 AND store_id=$3', [lineTicketId, JSON.stringify(config), storeId]);
        if (index === 0) first = config;
      }

      if(body.destination==='whatsapp'){
        const single = prepared[0];
        const productAttributes=isCart?[]:(single.attributes??[]).filter(a=>a.id!=='TOTEM-DINE'&&a.value.trim());
        customerMessage=renderTotemCustomerMessage(String(settings.customerWhatsAppMessage||DEFAULT_TOTEM_CUSTOMER_MESSAGE),{
          ...Object.fromEntries(productAttributes.map(a=>[a.name,a.value])),
          nome:customerFirstName(body.customerName),
          cliente:titleCase(body.customerName),
          vendedor:seller?.name||assistant?.name||settings.storeName,
          loja:settings.storeName,
          produto:isCart?prepared.map(line=>`${line.qty}x ${line.productName}`).join(' + '):single.productName,
          atributos:isCart?'':productAttributes.length?productAttributes.map(a=>`${a.name}: ${a.value}`).join(' · '):[single.color,single.storage].filter(Boolean).join(' · '),
          itens:prepared.map(line=>`• ${lineText(line)} — ${line.priceLabel}`).join('\n'),
          pagamento:installmentCount>0?`Parcelado em ${installmentCount}x`:'À vista',
          valor:isCart?(installmentCount>0?`${installmentCount}x de ${money(Math.round(chargedTotal/installmentCount*100)/100)}`:money(cashTotal)):single.priceLabel,
          total:money(isCart?cashTotal:single.unitPrice),
          retirada:pickupNames,
          pedido:ticketId,
        });
      }
      await client.query('COMMIT');}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}

    let customerNotified=false;
    let whatsappStatus=body.destination==='whatsapp'?'pending':'not_requested';
    let notificationWarning:string|undefined;
    if(body.destination==='whatsapp'){
      try {
        const result=await sendTotemWhatsApp({storeId,customerName:body.customerName,customerPhone:body.customerPhone,customerMessage});
        customerNotified=result.customerNotified;whatsappStatus='accepted';
      } catch (error) {
        console.warn('[totem] WhatsApp automático não confirmado:', error instanceof Error ? error.message : error);
        whatsappStatus='unconfirmed';
        notificationWarning='Pedido registrado na fila da loja. Não conseguimos enviar a mensagem no seu WhatsApp agora; um atendente vai te chamar.';
      }
      await pool.query(`UPDATE pos_tickets SET configuration=configuration || $2::jsonb WHERE id = ANY($1::text[]) AND store_id=$3`,[ticketIds,JSON.stringify({customerNotified,whatsappStatus,notificationWarning}),storeId]);
    }
    res.status(201).json({
      success: true,
      data: {
        customerNotified,whatsappStatus,notificationWarning,
        trackingToken:first.trackingToken,
        quotedPrice:first.quotedPrice,
        whatsappUrl:first.whatsappUrl,
        id: ticketId,
        code,
        customerName: body.customerName,
        customerPhone: body.customerPhone,
        productName: first.productName,
        priceLabel: first.priceLabel,
        status: 'open',
        source: 'totem',
        ...(isCart ? {
          ticketIds,
          total: prepared.reduce((sum, line) => sum + line.unitPrice * line.qty, 0),
          items: prepared.map(line => ({ stockId: line.stockId, productName: line.productName, qty: line.qty, unitPrice: line.unitPrice, priceLabel: line.priceLabel })),
        } : {}),
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
// Marcas ativas com o ícone, para a navegação da vitrine (lateral ou abas só com o ícone).
totemRouter.get('/api/v1/totem/brands', async (req, res, next) => {
  try {
    const storeId = await resolveStoreId(req);
    const result = await pool.query('SELECT slug, name, logo FROM store_brands WHERE store_id = $1 AND active = true ORDER BY name', [storeId]);
    res.json({ success: true, data: result.rows.map((row) => ({ slug: row.slug, name: row.name, logo: row.logo || null })) });
  } catch (error) {
    next(error);
  }
});
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
