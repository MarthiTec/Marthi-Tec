# Validação operacional — 05/10/2026

## Resultado e escopo

Builds da API e do frontend concluídos. Suíte de 95 testes passou, cobrindo persistência, isolamento entre lojas, permissões, estoque, encomendas, retirada, pagamentos e Totem. A validação usa PostgreSQL embarcado isolado; não realiza vendas financeiras nem envia mensagens para clientes de produção.

## Correções

- Margem e markup: resumo na linha com modal próprio; custo de R$ 100 e margem de 20% resulta em R$ 125. Picker funciona dentro do modal. Conferência mobile de 390px sem aumento da largura da página.
- Encomendas: abertura na operação de pedidos, navegação e texto simplificados. Marcas padronizadas e responsivas. Campo Cor do upgrade alinhado. Taxas exibem parcelas de 1 a 18, preservando os percentuais existentes.
- Tabelas de preço e formas de pagamento: remoção dos registros fictícios do navegador, leitura do banco e vinculação validada à loja. Alteração da tabela de preço no pagamento passa a persistir.
- Pessoas: gravações exigem autenticação e banco disponível. Clientes sem telefone permanecem independentes; telefone duplicado não sobrescreve cadastro. Situação, bairro, complemento e tipo de documento persistem. Consulta após alteração não revela cliente de outra loja.
- Financeiro: conta de outra loja não pode liquidar título nem gerar lançamento.
- Totem: configurações não anunciam sucesso quando o banco falha; catálogo não injeta produtos de exemplo. Pedido usa produto, atributos e preço calculados pelo servidor. Reenvio do mesmo pedido não duplica a fila. Falha de WhatsApp conserva o pedido no caixa e informa o problema.

## Banco de produção

Aplicadas as migrações 0041–0044 no Discloud. Na loja Cell Ponto STR-PRT-MUM5YWBG8DSR, as tabelas anteriormente exibidas no navegador foram persistidas: À vista (0%), Atacado (-8%) e Cartão (+5%). Criadas as opções ausentes Dinheiro, Pix, débito e crédito, vinculadas às tabelas da própria loja. Migrações preservam registros existentes e não replicam opções para outras lojas.

## Limites práticos

Parcelas novas não inventam taxas negociadas com a adquirente: o lojista deve preencher os percentuais antes de utilizá-las. Entrega real de WhatsApp depende da configuração e disponibilidade do provedor; foi validada a retenção do pedido quando o envio falha. A suíte e a revisão dos fluxos citados não certificam todos os módulos fiscais e todas as integrações externas do ERP.
