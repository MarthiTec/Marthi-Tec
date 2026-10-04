# Revisão dos módulos — 04/10/2026

Esta revisão cobre o inventário estático de 131 páginas e os pontos de persistência associados. Isso não equivale a uma certificação visual de todas as telas nem à confirmação de todos os fluxos em produção.

## Correções neste lote

- Perfil: nome, telefone, endereço, foto e tema persistem em `users`; e-mail/cargo não podem ser elevados pelo próprio perfil. Migração 0026.
- Recebimentos da plataforma: conta bancária e chave Pix persistem no banco. A gravação não afirma validação de titularidade nem consulta ao DICT. Migração 0027.
- Promoções: critérios e descontos persistem por loja, com permissões e isolamento. Migração 0028.
- Planos: catálogo administrativo e contratação consultam o mesmo registro do banco, inclusive preço zero e limite de módulos. Cadastro público não confirma pagamentos, não coleta cartão sem checkout e não sobrescreve contratação existente. Migração 0029.
- Configurações de caixa, impressão de OS, atalhos, orçamentos, conciliação e históricos de inventário usam estado persistente por loja. A gravação só atualiza o cache após sucesso; versões conflitantes retornam 409. Migração 0030.
- Senha administrativa do caixa: hash com salt, consulta com limite de tentativas e sem retorno do hash/senha ao navegador. Não há senha padrão 1234.
- Inventário: aplicação das divergências ocorre em uma transação no banco com movimentos de estoque, verificação do saldo inicial, reservas de encomendas, isolamento e idempotência por balanço. Falha em um produto desfaz o lote. Migração 0031.
- Autenticação: removidos login especial por senha 123, tokens adivinháveis e sucesso baseado somente no JWT quando o usuário deixou de existir no banco. Rotas administrativas de clientes e segurança exigem administrador da plataforma.
- Dados simulados: removida a ação de popular CRM com demos, a emissão de boleto/Pix fictício, o arquivo pseudo-CNAB, a baixa bancária inferida de linhas arbitrárias e o peso padrão de demonstração. Prévia fiscal não mostra autorização SEFAZ fictícia.
- Impressão de OS usa dados da loja; não substitui dados ausentes pelo endereço/telefone/Instagram da Marthi.
- Layout: 30 arquivos de tabelas receberam o contêiner de rolagem padrão. Vendas externas recebeu grades adaptáveis, botões e campos padronizados, contraste para claro/escuro e modais com sobreposição, rolagem e campos adaptáveis. Recebimentos usa cores do tema e grade que cabe em telas pequenas.

## Verificação realizada

- Compilação completa da API e frontend aprovada; permanecem avisos de tamanho dos bundles já existentes.
- 66 testes aprovados, sem falhas, em PostgreSQL isolado via PGlite. Incluem os fluxos de pagamento, vendas, encomendas, autorização, tokens, perfil, recebimentos, promoções, versões concorrentes e inventário.
- Revisão visual do formulário de vendas externas em desktop e em contêineres de 360/768 px, com os dois temas; modal de recolhimento verificado no tema escuro. Os controles dentro do iframe de revisão tiveram limitação de interação; não foi validado todo modal em cada largura.
- Nenhum `<select>` nativo encontrado nas páginas inventariadas. Os indicadores de cores fixas no inventário são candidatos à revisão, não prova de erro: marca, cores de status e documentos impressos podem usá-las legitimamente.
- A massa de testes fica isolada e não é inserida no MarthiDB de produção. Os dados reais dos clientes não foram alterados para teste.

## Pendências que exigem integração ou revisão maior

| Área | Situação identificada |
|---|---|
| Pix/cartão recorrentes, boleto e CNAB | Dependem de provedor/conta comercial e adaptador bancário. As ações simuladas foram bloqueadas com mensagem explícita. Liberar acesso manualmente é confirmação administrativa persistente, não cobrança automática. |
| Emissão fiscal | Continua exigindo certificado, configuração e transmissão reais. Prévia não comprova autorização. |
| Cardápio, mesas e cozinha | Ainda usam armazenamento local e mesas/configurações iniciais de protótipo. O cardápio público não resolve corretamente um catálogo por loja/slug. Migrar isso com pedidos públicos, preços calculados no servidor, reservas e fila compartilhada exige uma alteração maior que o escopo de preservar a lógica atual. Não estão certificados como operacionais entre dispositivos. |
| Hardware do caixa | Balança/gaveta exigem conexão real. Ausência de leitura não cria peso; mensagem da gaveta não afirma acionamento. |
| Rascunhos offline | Contagem ativa e carrinho continuam locais para operação offline; relatórios finalizados, ajustes e vendas são fluxos distintos. A sincronização de rascunhos entre dispositivos não foi implementada neste lote. |
| Ambiente e credenciais legadas | A presença de DATABASE_URL e JWT_SECRET foi conferida nas variáveis do Discloud. Defaults sensíveis foram retirados do código: a conexão usa variáveis do ambiente e JWT_SECRET é obrigatório. Credenciais não são incluídas neste relatório. |

## Publicação

O repositório continua sendo `MarthiTec/Marthi-Tec`, conforme solicitado. O commit deste lote deve usar autoria Marcalinfo. O lote principal foi integrado no PR #7. Publicação e aplicação das migrações em produção são verificações separadas; a compilação local não comprova publicação. No Discloud, os logs confirmaram a aplicação de 0026–0031 com sucesso e a conexão com MarthiDB após o rebuild do lote principal.
