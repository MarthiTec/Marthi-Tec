# Especificação de Implementação Backend (NestJS + Prisma) — Paridade Marthi-Tec

Este documento contém todas as instruções, schemas Prisma, DTOs, regras de negócio e rotas que devem ser implementadas no repositório **`Backend`** (`Backend/src/modules/`) para dar suporte completo a todas as melhorias e novos módulos já construídos no Frontend.

---

## 🏛 Diretrizes de Arquitetura & Boas Práticas
1. **Multi-tenancy por Loja (`storeId`)**:
   - Todo acesso, busca, listagem ou mutação **DEVE** garantir o isolamento por `storeId`, extraído do token via `@CurrentUser() user: AuthUser`.
2. **Atomicidade e Transações**:
   - Operações compostas (como cancelamento de venda estornando financeiro e estoque, ou aplicação de balanço de estoque) **DEVEM** rodar dentro de `this.prisma.$transaction(async (tx) => { ... })`.
3. **Validação de Payload**:
   - Utilizar `class-validator` e `class-transformer` em todos os DTOs.
4. **Rotas e Documentação**:
   - Todas as rotas são prefixadas com `/api/v1`.
   - Adicionar tags Swagger `@ApiTags(...)`, `@ApiBearerAuth()` e `@ApiOperation(...)`.
5. **Erros HTTP Nativos**:
   - Utilizar exceções nativas do NestJS: `NotFoundException`, `BadRequestException`, `ConflictException`, etc.

---

# FASE 1 (Prioridade P0): Compatibilidade do PDV & Vendas

### 1.1 Venda Avulsa (Sem Estoque) e Idempotência (`/pos/sales`)
- **Objetivo**: O PDV agora suporta Venda Avulsa (`isAdHoc: true`, `itemType: 'ad_hoc'`) sem código de barras/cadastro prévio e envia chave de idempotência para reconexão pós-queda.

#### 1.1.1 Schema Prisma (`prisma/schema.prisma`)
Atualizar os modelos `SalesOrder` e `SalesOrderLine`:
```prisma
model SalesOrder {
  id                String           @id
  storeId           String           @map("store_id")
  store             Store            @relation(fields: [storeId], references: [id])
  ticketId          String?          @map("ticket_id")
  ticket            PosTicket?       @relation(fields: [ticketId], references: [id])
  customerId        String?          @map("customer_id")
  customer          Customer?        @relation(fields: [customerId], references: [id])
  customerName      String           @map("customer_name")
  customerPhone     String           @default("") @map("customer_phone")
  customerDocument  String           @default("") @map("customer_document")
  productName       String           @map("product_name")
  amount            Decimal          @db.Decimal(12, 2)
  discount          Decimal          @default(0) @db.Decimal(12, 2)
  surcharge         Decimal          @default(0) @db.Decimal(12, 2)
  status            TicketStatus
  payment           String
  paymentMethodId   String?          @map("payment_method_id")
  paymentMethod     PaymentMethod?   @relation(fields: [paymentMethodId], references: [id])
  priceTableId      String?          @map("price_table_id")
  priceTable        PriceTable?      @relation(fields: [priceTableId], references: [id])
  sellerId          String           @default("") @map("seller_id")
  sellerName        String           @default("") @map("seller_name")
  idempotencyKey    String?          @map("idempotency_key")
  localId           String?          @map("local_id")
  cancelledAt       DateTime?        @map("cancelled_at")
  cancelReason      String?          @map("cancel_reason")
  createdAt         DateTime         @default(now()) @map("created_at")
  lines             SalesOrderLine[]

  @@index([storeId, createdAt(sort: Desc)], map: "idx_orders_store_created")
  @@index([storeId, idempotencyKey], map: "idx_sales_orders_idempotency")
  @@map("sales_orders")
}

model SalesOrderLine {
  id        String     @id
  orderId   String     @map("order_id")
  order     SalesOrder @relation(fields: [orderId], references: [id], onDelete: Cascade)
  stockId   String?    @map("stock_id")
  stock     StockItem? @relation(fields: [stockId], references: [id])
  name      String
  qty       Decimal    @db.Decimal(10, 3)
  unitPrice Decimal    @map("unit_price") @db.Decimal(12, 2)
  imei      String     @default("")
  isAdHoc   Boolean    @default(false) @map("is_ad_hoc")
  itemType  String     @default("product") @map("item_type")

  @@map("sales_order_lines")
}
```

#### 1.1.2 DTOs (`src/modules/sales/dto/close-pos-sale.dto.ts`)
```typescript
export class PosSaleLineDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  stockId?: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(180)
  name!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0.001) // Suporta unidades pesadas / balança (KG)
  qty!: number;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPrice!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  imei?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isAdHoc?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  itemType?: 'product' | 'ad_hoc';
}

export class ClosePosSaleDto {
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  ticketId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  localId?: string;

  @ApiProperty()
  @IsString()
  @MaxLength(180)
  customerName!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(20)
  customerPhone!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(18)
  customerDocument?: string;

  @ApiProperty()
  @IsString()
  @MaxLength(80)
  paymentName!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(80)
  priceTableName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  paymentMethodId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  priceTableId?: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discount!: number;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  surcharge!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sellerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sellerName?: string;

  @ApiProperty({ type: [PosSaleLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PosSaleLineDto)
  lines!: PosSaleLineDto[];
}
```

#### 1.1.3 Service (`src/modules/sales/sales.service.ts`)
- No início de `closeSale`:
  ```typescript
  if (dto.idempotencyKey) {
    const existing = await this.prisma.salesOrder.findFirst({
      where: { storeId: user.storeId, idempotencyKey: dto.idempotencyKey },
      include: { lines: true },
    });
    if (existing) {
      return this.toOrderDetail(existing);
    }
  }
  ```
- No loop de processamento das linhas:
  ```typescript
  for (const line of dto.lines) {
    const isAdHoc = Boolean(line.isAdHoc || line.itemType === 'ad_hoc' || !line.stockId);
    if (isAdHoc) {
      // Venda avulsa: Não valida no stockItem e não diminui estoque físico
      continue;
    }
    const stock = await tx.stockItem.findFirst({
      where: { id: line.stockId, storeId },
    });
    if (!stock) {
      throw notFound(`Item de estoque não encontrado: ${line.stockId}`);
    }
    await tx.stockItem.update({
      where: { id: stock.id },
      data: { qty: { decrement: line.qty } },
    });
  }
  ```

---

### 1.2 Cancelamento / Estorno de Pedidos de Venda (`POST /orders/:id/cancel`)
- **Controller**: `src/modules/sales/sales.controller.ts` (em `OrdersController`)
  ```typescript
  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancelar / estornar pedido de venda' })
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: { reason?: string },
  ) {
    return this.sales.cancelOrder(user, id, dto?.reason ?? 'Cancelamento de venda');
  }
  ```
- **Service (`sales.service.ts`)**:
  ```typescript
  async cancelOrder(user: AuthUser, orderId: string, reason: string) {
    const storeId = user.storeId;
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.salesOrder.findFirst({
        where: { id: orderId, storeId },
        include: { lines: true },
      });
      if (!order) throw notFound('Pedido não encontrado.');
      if (order.status === TicketStatus.cancelled) {
        throw conflict('Este pedido já foi cancelado.');
      }

      // 1. Atualiza status do pedido
      const updated = await tx.salesOrder.update({
        where: { id: order.id },
        data: {
          status: TicketStatus.cancelled,
          cancelledAt: new Date(),
          cancelReason: reason,
        },
      });

      // 2. Lançamento financeiro de estorno
      await tx.financeEntry.create({
        data: {
          id: `FIN-CXL-${order.id}`,
          storeId,
          type: 'out',
          label: `Estorno Venda ${order.id} · ${reason}`,
          amount: order.amount,
          source: 'pos',
          refId: order.id,
        },
      });

      // 3. Devolução de estoque para itens com cadastro (não avulsos)
      for (const line of order.lines) {
        if (!line.isAdHoc && line.stockId) {
          await tx.stockItem.updateMany({
            where: { id: line.stockId, storeId },
            data: { qty: { increment: line.qty } },
          });
        }
      }

      return this.toOrderDetail(updated);
    });
  }
  ```

---

### 1.3 Permissões Granulares em Funcionários (`Employee`)
- **Schema Prisma (`prisma/schema.prisma`)**:
  ```prisma
  model Employee {
    // ... campos existentes
    permissions  Json?        @default("{}")
  }
  ```
- **DTOs (`src/modules/registry/dto/employee.dto.ts`)**:
  Adicionar no `CreateEmployeeDto` e `UpdateEmployeeDto`:
  ```typescript
  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  permissions?: {
    canEdit?: boolean;
    canDelete?: boolean;
    posCancelSale?: boolean;
    posCancelItem?: boolean;
    posAdHocConfigure?: boolean;
    posAdHocLaunch?: boolean;
  };
  ```

---

### 1.4 Configurações de Terminal e Balança do PDV (`/cash/settings`)
- **Controller**: `src/modules/cash/cash.controller.ts`
  ```typescript
  @Get('settings')
  @ApiOperation({ summary: 'Obter configurações de terminais e balança do PDV' })
  getSettings(@CurrentUser() user: AuthUser) {
    return this.cash.getSettings(user.storeId);
  }

  @Put('settings')
  @ApiOperation({ summary: 'Atualizar configurações de terminais e balança' })
  putSettings(@CurrentUser() user: AuthUser, @Body() body: any) {
    return this.cash.putSettings(user.storeId, body);
  }
  ```

---

# FASE 2 (Prioridade P1): Orçamentos, Promoções & Balanço

### 2.1 Módulo de Orçamentos Comerciais (`/quotes`)
- **Criar Diretório**: `src/modules/quotes/`
- **Schema Prisma (`prisma/schema.prisma`)**:
  ```prisma
  enum PosQuoteStatus {
    draft
    open
    sent
    pending_approval
    approved
    rejected
    expired
    cancelled
    converted
    @@map("pos_quote_status")
  }

  model PosQuote {
    id                String           @id
    storeId           String           @map("store_id")
    store             Store            @relation(fields: [storeId], references: [id])
    quoteNumber       String           @map("quote_number")
    sequenceNumber    Int              @map("sequence_number")
    customerId        String?          @map("customer_id")
    customer          Customer?        @relation(fields: [customerId], references: [id])
    customerName      String           @map("customer_name")
    customerPhone     String           @default("") @map("customer_phone")
    customerEmail     String           @default("") @map("customer_email")
    customerDocument  String           @default("") @map("customer_document")
    customerAddress   String           @default("") @map("customer_address")
    sellerId          String           @default("") @map("seller_id")
    sellerName        String           @default("") @map("seller_name")
    status            PosQuoteStatus   @default(open)
    subtotal          Decimal          @db.Decimal(12, 2)
    discount          Decimal          @default(0) @db.Decimal(12, 2)
    surcharge         Decimal          @default(0) @db.Decimal(12, 2)
    totalAmount       Decimal          @map("total_amount") @db.Decimal(12, 2)
    validityDays      Int              @default(7) @map("validity_days")
    expiresAt         DateTime         @map("expires_at")
    priceTableId      String?          @map("price_table_id")
    priceTableName    String?          @map("price_table_name")
    paymentMethodId   String?          @map("payment_method_id")
    paymentMethodName String?          @map("payment_method_name")
    notes             String           @default("")
    convertedOrderId  String?          @map("converted_order_id")
    history           Json             @default("[]")
    createdAt         DateTime         @default(now()) @map("created_at")
    updatedAt         DateTime         @updatedAt @map("updated_at")
    lines             PosQuoteLine[]

    @@unique([storeId, quoteNumber], map: "uq_quote_store_number")
    @@index([storeId, status], map: "idx_quote_store_status")
    @@map("pos_quotes")
  }

  model PosQuoteLine {
    id          String    @id
    quoteId     String    @map("quote_id")
    quote       PosQuote  @relation(fields: [quoteId], references: [id], onDelete: Cascade)
    stockId     String?   @map("stock_id")
    name        String
    sku         String    @default("")
    qty         Decimal   @db.Decimal(10, 3)
    basePrice   Decimal   @map("base_price") @db.Decimal(12, 2)
    unitPrice   Decimal   @map("unit_price") @db.Decimal(12, 2)
    discount    Decimal   @default(0) @db.Decimal(12, 2)
    total       Decimal   @db.Decimal(12, 2)
    isAdHoc     Boolean   @default(false) @map("is_ad_hoc")

    @@map("pos_quote_lines")
  }
  ```

- **Endpoints a implementar no `QuotesController` (`/quotes`)**:
  1. `GET /api/v1/quotes` — Listar com filtros (`status`, `customerId`, `q`, `from`, `to`).
  2. `GET /api/v1/quotes/:id` — Obter com linhas e histórico.
  3. `POST /api/v1/quotes` — Criar novo orçamento gerando número sequencial (`ORC-000123`).
  4. `PATCH /api/v1/quotes/:id` — Atualizar dados do orçamento.
  5. `POST /api/v1/quotes/:id/status` — Atualizar status com registro no histórico (`actorName`, `action`, `details`).
  6. `POST /api/v1/quotes/:id/duplicate` — Duplicar orçamento gerando um novo número sequencial.
  7. `POST /api/v1/quotes/:id/convert` — Vincular ao `orderId` gerado pela venda e atualizar status para `converted`.

---

### 2.2 Módulo de Campanhas Promocionais (`/promotions`)
- **Criar Diretório**: `src/modules/promotions/`
- **Schema Prisma (`prisma/schema.prisma`)**:
  ```prisma
  enum PromoKind {
    percent
    fixed
    promo_price
    tier
    buy_x_pay_y
    gift
    @@map("promo_kind")
  }

  model PromoCampaign {
    id              String    @id
    storeId         String    @map("store_id")
    store           Store     @relation(fields: [storeId], references: [id])
    name            String
    kind            PromoKind
    active          Boolean   @default(true)
    priority        Int       @default(0)
    criteria        Json      @default("{}") // { supplierId, category, brand, stockIds, minQty, minAmount, customerGroup }
    discountPercent Decimal?  @map("discount_percent") @db.Decimal(5, 2)
    discountAmount  Decimal?  @map("discount_amount") @db.Decimal(12, 2)
    promoPrice      Decimal?  @map("promo_price") @db.Decimal(12, 2)
    tiers           Json      @default("[]") // [{ qty: 3, totalPrice: 10.00 }]
    buyQty          Int?      @map("buy_qty")
    payQty          Int?      @map("pay_qty")
    giftStockId     String?   @map("gift_stock_id")
    giftMinQty      Int?      @map("gift_min_qty")
    startDate       DateTime? @map("start_date")
    endDate         DateTime? @map("end_date")
    createdAt       DateTime  @default(now()) @map("created_at")
    updatedAt       DateTime  @updatedAt @map("updated_at")

    @@index([storeId, active], map: "idx_promos_store_active")
    @@map("promo_campaigns")
  }
  ```
- **Endpoints a implementar no `PromotionsController` (`/promotions`)**:
  1. `GET /api/v1/promotions/campaigns` (query `activeOnly?: boolean`).
  2. `GET /api/v1/promotions/campaigns/:id`.
  3. `POST /api/v1/promotions/campaigns`.
  4. `PATCH /api/v1/promotions/campaigns/:id`.
  5. `DELETE /api/v1/promotions/campaigns/:id`.

---

### 2.3 Balanço de Estoque / Inventário Físico (`/stock/balances`)
- **Local**: `src/modules/stock/`
- **Schema Prisma (`prisma/schema.prisma`)**:
  ```prisma
  enum StockBalanceStatus {
    in_progress
    completed
    cancelled
    @@map("stock_balance_status")
  }

  model StockBalanceAudit {
    id              String             @id
    storeId         String             @map("store_id")
    store           Store              @relation(fields: [storeId], references: [id])
    code            String             @map("code")
    title           String
    status          StockBalanceStatus @default(in_progress)
    warehouseId     String?            @map("warehouse_id")
    responsibleUser String             @map("responsible_user")
    startedAt       DateTime           @default(now()) @map("started_at")
    completedAt     DateTime?          @map("completed_at")
    summary         Json               @default("{}")
    duplicateRule   String             @default("sum") @map("duplicate_rule")
    notes           String             @default("")
    items           Json               @default("[]")
    createdAt       DateTime           @default(now()) @map("created_at")
    updatedAt       DateTime           @updatedAt @map("updated_at")

    @@index([storeId, status], map: "idx_stock_balances_store")
    @@map("stock_balance_audits")
  }
  ```
- **Endpoints a implementar**:
  1. `GET /api/v1/stock/balances` — Histórico de balanços realizados.
  2. `GET /api/v1/stock/balances/active` — Sessão de inventário atualmente em andamento (ou null).
  3. `POST /api/v1/stock/balances` — Iniciar nova sessão de balanço.
  4. `PUT /api/v1/stock/balances/:id/items` — Salvar lotes de contagens físicas.
  5. `POST /api/v1/stock/balances/:id/apply` — Concluir balanço: em transação, ajusta o `StockItem.qty` com as contagens físicas e registra auditoria.
  6. `POST /api/v1/stock/balances/:id/cancel` — Cancelar/descartar o inventário.

---

# FASE 3 (Prioridade P2): Restaurante, Cardápio & Customizações

### 3.1 Cardápio Digital & Reservas (`/cardapio`)
- **Criar Diretório**: `src/modules/cardapio/`
- **Rotas Públicas (com `@Public()`)**:
  - `GET /api/v1/cardapio/public/:slug`: Retorna cardápio público da loja com pratos, categorias, cores e banner.
  - `POST /api/v1/cardapio/public/:slug/orders`: Enviar pedido (mesa, delivery ou retirada).
  - `POST /api/v1/cardapio/public/:slug/reservations`: Solicitar reserva de mesa.
- **Rotas Administrativas**:
  - `GET /api/v1/cardapio/config` e `PUT /api/v1/cardapio/config`
  - `GET /api/v1/cardapio/items`, `POST /api/v1/cardapio/items`, `PATCH /api/v1/cardapio/items/:id`, `DELETE /api/v1/cardapio/items/:id`
  - `GET /api/v1/cardapio/orders` e `PATCH /api/v1/cardapio/orders/:id`
  - `GET /api/v1/cardapio/reservations` e `PATCH /api/v1/cardapio/reservations/:id`

### 3.2 Cozinha KDS & Mesas (`/kitchen`)
- **Criar Diretório**: `src/modules/kitchen/`
- **Rotas**:
  - `GET /api/v1/kitchen/orders` — Listar pedidos da fila da cozinha.
  - `POST /api/v1/kitchen/orders` — Lançar pedido na produção.
  - `PATCH /api/v1/kitchen/orders/:id/status` — Atualizar status (`queued` -> `preparing` -> `ready` -> `delivered` -> `cancelled`).
  - `GET /api/v1/kitchen/tables` e `PATCH /kitchen/tables/:id` — Status da mesa (`free`, `occupied`, `reserved`, `closing`).

### 3.3 Customização de Ramo da Loja & Atalhos de Operações (`/store`)
- **No Controller `StoreController` (`src/modules/store/store.controller.ts`)**:
  - `GET /api/v1/store/customization` e `PUT /api/v1/store/customization`: Salvar `segmentId` (`assistencia_tecnica`, `vestuario_moda`, `restaurante_gastronomia`, `varejo_geral`), `showImei`, `showDevicePassword`, `showTablesAndKitchen`, `showSizeColorGrid`.
  - `GET /api/v1/store/operations` e `PUT /api/v1/store/operations`: Salvar lista de atalhos e cores da operação da retaguarda.

---

## 🏁 Checklist Final de Conclusão
- [ ] Executar `npx prisma migrate dev --name feat_erp_pos_quotes_promos_kitchen` com sucesso.
- [ ] Registrar todos os novos módulos em `src/app.module.ts`.
- [ ] Garantir que o comando `npm run build` do backend conclua com **0 erros** de compilação TypeScript.
- [ ] Testar chamadas no Swagger (`http://localhost:3000/docs`).
