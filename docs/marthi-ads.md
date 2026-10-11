# Marthi ADS — anúncios e publicações pela Meta

Módulo do painel do lojista (**Anúncios Ads**) para criar anúncios reais a partir do cadastro de
produtos, acompanhar o estado e os resultados na Meta e, nas fases seguintes, publicar no Instagram.
Este documento registra a versão da API, as permissões, os endpoints, os requisitos externos e as
decisões em aberto. **Nada aqui foi validado ainda contra uma conta Meta real** — veja "Validação".

Pesquisa feita em 11/10/2026 na documentação oficial (fontes no fim).

## 1. Versão adotada

- **Graph API / Marketing API v26.0** (lançada em 29/07/2026, sem data de expiração publicada).
- A v24.0 do Marketing API expirou em 06/10/2026; a v25.0 segue disponível.
- A versão fica em uma única constante (`META_GRAPH_VERSION` em `apps/api/src/services/ads/metaGraph.ts`)
  e pode ser trocada por variável de ambiente `META_GRAPH_VERSION`.

Mudanças da v25/v26 que afetam o módulo:

| Mudança | Efeito no Marthi |
|---|---|
| `targeting_automation.advantage_audience` obrigatório (0/1) em parte dos conjuntos (v26) | Sempre enviado explicitamente (`0` = público definido pelo lojista). |
| Posicionamento Explorar do Instagram removido (v26) | Nunca enviado. |
| Campanhas Advantage+ de compras/apps não podem mais ser criadas (v25) | O Marthi cria campanha manual de Tráfego. |
| Criativos com loja podem cair em `WEBSITE_AND_SHOP` por padrão (v26) | O destino é a página pública do produto (site); a lojas com Shop pode ser necessário opt-out — **pendente de validação**. |

## 2. Fluxo da Fase 1 (Facebook)

Objetivo único habilitado: **Tráfego (`OUTCOME_TRAFFIC`) para a página pública do produto**, com imagem
ou vídeo. Mensagens, conversões e catálogo ficam **bloqueados** até terem requisitos implementados.

| Etapa | Endpoint (v26.0) | Observações |
|---|---|---|
| Conectar | `https://www.facebook.com/v26.0/dialog/oauth` (`client_id`, `redirect_uri`, `state`, `response_type=code`, `config_id` **ou** `scope`) | Facebook Login for Business usa `config_id`; sem configuração, `scope` com as permissões abaixo. |
| Trocar código | `GET /oauth/access_token?client_id&client_secret&redirect_uri&code` | Sempre no servidor. |
| Token de longa duração | `GET /oauth/access_token?grant_type=fb_exchange_token&client_id&client_secret&fb_exchange_token` | ~60 dias; token expirado exige novo login. |
| Permissões concedidas | `GET /me/permissions` | Mostra o que falta e como resolver. |
| Páginas | `GET /me/accounts?fields=id,name,tasks,access_token,instagram_business_account{id,username}` | Token da Página (não expira, pode ser invalidado). |
| Contas de anúncio | `GET /me/adaccounts?fields=id,account_id,name,account_status,disable_reason,currency,timezone_name,amount_spent,spend_cap` | `account_status` 1 = ativa (2 desativada, 3 pendência de pagamento, 7 análise de risco, 8 liquidação pendente, 9 período de carência, 100/101 encerramento). |
| Imagem | `POST /act_{id}/adimages` (`bytes` em base64, nome com extensão) | Retorna `hash`. |
| Vídeo | `POST /act_{id}/advideos` (`source` multipart) e `GET /{video_id}?fields=status` | Upload simples; vídeos grandes (resumable) ficam para depois. |
| Campanha | `POST /act_{id}/campaigns` `name, objective=OUTCOME_TRAFFIC, status=PAUSED, special_ad_categories=[]` | `special_ad_categories` é obrigatório. |
| Conjunto | `POST /act_{id}/adsets` `campaign_id, daily_budget|lifetime_budget(+end_time), start_time, billing_event=IMPRESSIONS, optimization_goal=LINK_CLICKS, bid_strategy=LOWEST_COST_WITHOUT_CAP, destination_type=WEBSITE, targeting{geo_locations, age_min, age_max, publisher_platforms:[facebook], facebook_positions:[feed], targeting_automation:{advantage_audience:0}}, status=PAUSED` | Orçamento na menor unidade da moeda (centavos). Mínimos da Meta variam por moeda/objetivo. |
| Criativo | `POST /act_{id}/adcreatives` `object_story_spec{page_id, link_data{link, message, name, description, image_hash, call_to_action{type, value{link}}}}` ou `video_data{video_id, image_url, title, message, call_to_action}` | `video_data.title/message`: **validar na primeira chamada real**. |
| Anúncio | `POST /act_{id}/ads` `name, adset_id, creative{creative_id}, status=PAUSED` | Anúncio novo entra em análise (`PENDING_REVIEW`). |
| Ativar / pausar | `POST /{campaign|adset|ad id}` `status=ACTIVE|PAUSED` | A referência mostra também `adgroup_status` no exemplo de anúncio — o Marthi usa `status` e o primeiro teste real confirma. |
| Estado | `GET /{ad_id}?fields=status,configured_status,effective_status,ad_review_feedback,issues_info` (+ campanha e conjunto) | `effective_status` do anúncio: ACTIVE, PAUSED, DELETED, PENDING_REVIEW, DISAPPROVED, PREAPPROVED, PENDING_BILLING_INFO, CAMPAIGN_PAUSED, ADSET_PAUSED, ARCHIVED, IN_PROCESS, WITH_ISSUES. |
| Resultados | `GET /{campaign_id}/insights?fields=spend,impressions,reach,clicks,inline_link_clicks,cpm,cpc,ctr,frequency&date_preset=…` | Requer `ads_read`. Sem rastreamento de conversão não exibimos conversões/ROI. |
| Revogar | `DELETE /me/permissions` | Ao desconectar. |

Reconciliação: toda campanha leva no nome a marca `[MARTHI:<id>]`. Se uma criação expirar sem resposta,
o Marthi procura o objeto pela marca (`GET /act_{id}/campaigns|adsets|ads?filtering=[{field:"name",operator:"CONTAIN",value:"[MARTHI:<id>]"}]`)
antes de tentar de novo — nunca repete às cegas.

## 3. Permissões solicitadas (somente as necessárias)

| Permissão | Para quê | Fase |
|---|---|---|
| `ads_management` | criar/pausar campanhas, conjuntos, criativos e anúncios | 1 |
| `ads_read` | resultados (Insights) | 1 |
| `pages_show_list` | listar as Páginas do lojista | 1 |
| `pages_read_engagement` | dependência de `ads_management`; dados da Página | 1 |
| `pages_manage_ads` | anúncios com a Página como identidade | 1 |
| `business_management` | **não solicitada** na Fase 1; só se as contas estiverem em portfólio que exija | — |
| `instagram_basic`, `instagram_content_publish` | publicações orgânicas | 3 |

Para atender lojistas que não são da empresa dona do app, as permissões precisam de **Acesso Avançado**
(Revisão do App) e o recurso **Marketing API Access Tier = Full Access**. A Meta exige **Verificação de
Empresa** para apps que pedem Acesso Avançado. Em Acesso Limitado (padrão), o app só funciona com
contas de quem tem papel no app e com limites de chamadas "apenas para desenvolvimento".

## 4. Requisitos externos (fora do código)

1. **App Meta do tipo Business**, ligado ao portfólio empresarial da Marthi.
2. **Facebook Login for Business** com uma *configuração* (token de usuário) contendo as permissões da tabela → gera `META_LOGIN_CONFIG_ID`.
3. **URL de retorno OAuth** cadastrada: `https://<domínio da API>/api/v1/ads/meta/callback`.
4. **Política de privacidade** e **URL de exclusão de dados**: `https://<domínio da API>/api/v1/ads/meta/data-deletion` (callback com `signed_request`) e página de status `/exclusao-dados`.
5. **Revisão do App** para `ads_management`, `ads_read`, `pages_show_list`, `pages_read_engagement`, `pages_manage_ads` + **Full Access** do Marketing API (≥500 chamadas bem-sucedidas em 15 dias, erro <15%).
6. **Verificação de Empresa** da Marthi na Meta.
7. Cada lojista precisa de: Página do Facebook onde é admin, conta de anúncios ativa com **forma de pagamento cadastrada na Meta**.

## 5. Variáveis de ambiente

| Variável | Uso |
|---|---|
| `META_APP_ID`, `META_APP_SECRET` | app Meta (segredo só no servidor) |
| `META_LOGIN_CONFIG_ID` | configuração do Facebook Login for Business (opcional; sem ela usa `scope`) |
| `META_TOKEN_KEY` | chave de 32 bytes (base64) para criptografar tokens (AES-256-GCM). **Obrigatória**: sem ela a conexão fica bloqueada. |
| `META_GRAPH_VERSION` | padrão `v26.0` |
| `PUBLIC_API_URL` | URL pública da API para o retorno OAuth (padrão: `FRONTEND_URL`) |
| `ADS_ENVIRONMENT` | `test` ou `production` — aparece na interface; em `test` o painel avisa que é ambiente de teste |

## 6. Quem paga a Meta (Fase 2 — decisão pendente)

**Modelo da Fase 1:** a campanha roda **na conta de anúncios do próprio lojista**, e a **Meta cobra o
lojista diretamente** pela forma de pagamento cadastrada nessa conta. O Marthi não recebe nem repassa
dinheiro de mídia e **não mostra "créditos" como saldo da Meta**. O limite de gasto é o orçamento do
conjunto (diário ou total) definido e autorizado pelo lojista.

**Fase 2 (créditos Marthi) está bloqueada** porque:
- Não há provedor de pagamento integrado ao sistema hoje (nenhum Mercado Pago/Asaas/Stripe no código).
- Não existe API genérica para transferir saldo à Meta; financiar campanhas com dinheiro recebido pelo
  Marthi exigiria contas de anúncio da Marthi (ou acordo de revenda/linha de crédito com a Meta) e
  conciliação do gasto — viabilidade contratual a confirmar com a Meta e com o jurídico.
- Decisões necessárias: provedor de pagamento, se o Marthi cobra apenas taxa de serviço (recomendado
  na largada) ou também mídia, política de estorno/saldo não utilizado.

Enquanto isso, a tela **Créditos e pagamentos** explica o modelo e não exibe saldo.

## 7. Instagram, Google e YouTube

- **Fase 3**: anúncios no Instagram usam a mesma integração (identidade `instagram_user_id` no criativo
  e posicionamentos `instagram_positions`), e publicações orgânicas usam a Instagram Platform
  (contêiner → publicação). Bloqueadas até validar a Fase 1. As telas mostram "disponível na Fase 3",
  sem botões que pareçam funcionar.
- **Fase 4**: Google Ads e YouTube Ads com integrações próprias. A arquitetura guarda `provider` em
  conexões e campanhas para receber novos provedores.

## 8. Segurança e confiabilidade

- Tokens criptografados (AES-256-GCM, chave própria), nunca enviados ao navegador; o Marthi nunca pede senha.
- Tudo por `store_id`: conexões, campanhas, mídias, resultados e auditoria.
- Permissões no Marthi: **criar/editar rascunho** — admin/gerente; **autorizar gasto (ativar)** e **administrar conexões** — admin.
- `state` do OAuth guardado no banco, de uso único, com validade de 10 minutos.
- Envio em etapas com checkpoint (IDs externos gravados após cada criação), chave de idempotência por
  envio e trava por campanha (sem envio duplicado); erros transitórios com retentativa limitada;
  timeout → reconciliação pela marca no nome antes de repetir.
- Token expirado/revogado (erro 190) → conexão marcada como "precisa reconectar"; nada é dado como enviado.
- Sincronização periódica do estado e dos resultados (a Meta não envia webhook de estado de anúncio
  para este fluxo; usamos consulta a cada 15 minutos para campanhas em andamento).
- Auditoria: cada ação (conectar, selecionar ativos, enviar, ativar, pausar, retomar, desconectar) gravada.

## 9. Validação

Validado no código com testes automatizados que simulam as respostas da Graph API (apenas em teste —
a interface de produção nunca usa dados simulados): isolamento entre lojas, `state` inválido, token
expirado, envio duplicado, timeout com reconciliação, reprovação, ativação sem confirmação, pausa.

**Não validado** (depende de app e conta Meta reais): conexão, criação real dos objetos, ativação,
análise/reprovação reais, resultados reais, campos marcados como "validar na primeira chamada".

## 10. Implantação (passo a passo)

1. No portfólio empresarial da Marthi na Meta, criar um app do tipo **Business** e adicionar os produtos
   **Facebook Login for Business** e **Marketing API**.
2. Em Facebook Login for Business, criar a configuração (token de **usuário**) com as permissões da seção 3
   e anotar o ID → `META_LOGIN_CONFIG_ID`.
3. Cadastrar a URL de retorno `https://<API>/api/v1/ads/meta/callback`, a URL de exclusão de dados
   `https://<API>/api/v1/ads/meta/data-deletion`, a política de privacidade e o domínio do app.
4. Gerar a chave dos tokens: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
   → `META_TOKEN_KEY` (guardar fora do repositório; trocar a chave invalida as conexões existentes).
5. Configurar no Discloud: `META_APP_ID`, `META_APP_SECRET`, `META_LOGIN_CONFIG_ID`, `META_TOKEN_KEY`,
   `PUBLIC_API_URL`, `ADS_ENVIRONMENT=test` (até concluir a validação) e fazer Rebuild.
6. Validar com uma conta autorizada (pessoa com papel no app, em Acesso Limitado): conectar, escolher
   Página e conta de anúncios, criar um anúncio de produto, enviar (pausado), autorizar um orçamento
   pequeno, conferir o estado na Meta, consultar resultados e pausar.
7. Pedir a **Revisão do App** (screencast desse fluxo), **Full Access** do Marketing API e concluir a
   **Verificação de Empresa**. Só então trocar para `ADS_ENVIRONMENT=production` e liberar aos lojistas.

## 11. Pendências de validação (bloqueiam só o item citado)

| Item | Situação |
|---|---|
| Parâmetro de atualização de status (`status` x `adgroup_status` no anúncio) | O Marthi usa `status`; confirmar no primeiro teste real. |
| `video_data.title` e `video_data.message` | Enviados conforme o padrão; confirmar no primeiro anúncio com vídeo. |
| Opt-out de `WEBSITE_AND_SHOP` (v26) para lojas com Shop | Confirmar se o destino continua sendo a página do produto. |
| Raio em volta da cidade | Não confirmado na documentação lida; a Fase 1 segmenta cidade inteira ou o país. |
| Orçamento mínimo em BRL | A Meta publica mínimos em USD e por moeda; o Marthi não inventa valor — mostra a recusa da Meta. |
| Webhooks de estado de anúncio | Não usados; consulta periódica a cada 15 min. |
| Fase 2 (créditos) | Bloqueada: falta provedor de pagamento e definição do modelo financeiro (seção 6). |
| Fase 3 e 4 | Não iniciadas; telas explicam, sem botões de ação. |

## Fontes

- Versões: https://developers.facebook.com/docs/graph-api/changelog/versions/
- v26.0: https://developers.facebook.com/docs/graph-api/changelog/version26.0/
- v25.0: https://developers.facebook.com/docs/graph-api/changelog/version25.0/
- Campanha: https://developers.facebook.com/docs/marketing-api/reference/ad-campaign-group/
- Conjunto: https://developers.facebook.com/docs/marketing-api/reference/ad-campaign/
- Criativo: https://developers.facebook.com/docs/marketing-api/reference/ad-creative/
- Anúncio: https://developers.facebook.com/docs/marketing-api/reference/adgroup/
- Imagem: https://developers.facebook.com/docs/marketing-api/reference/ad-image/
- Vídeo: https://developers.facebook.com/docs/marketing-api/reference/ad-account/advideos/
- Conta de anúncios: https://developers.facebook.com/docs/marketing-api/reference/ad-account/
- Insights: https://developers.facebook.com/docs/marketing-api/insights/
- Facebook Login for Business: https://developers.facebook.com/docs/facebook-login/facebook-login-for-business/
- Token de longa duração: https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived/
- Autorização / níveis de acesso: https://developers.facebook.com/docs/marketing-api/get-started/authorization/
- Permissões: https://developers.facebook.com/docs/permissions/
- Exclusão de dados: https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback/
- Especificações de anúncio (Tráfego, Feed): https://www.facebook.com/business/ads-guide/update/image/facebook-feed/link-clicks
