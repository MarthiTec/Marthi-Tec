# Totem — atualização de 06/10/2026

## Resultado
- Excluídos os 23 produtos de teste pelo painel autenticado da Cell Ponto. Preservado IPHONE 17 PRO MAX com as três variações; listagem confirmou 1 de 1 produto.
- Publicado o pacote validado pela API oficial da Discloud; resposta HTTP 200 confirmou atualização dos arquivos.
- Conferência ao vivo: Prateado/256GB R$ 7.500,00; única retirada Em mãos; Prateado/512GB R$ 8.999,00. Checkout manteve atributos, retirada e valor. Nenhum pedido de teste foi enviado.

## Funcionalidades
- Seleção padrão e troca de atributos completam uma variação real com preço positivo. Preço por retirada é respeitado mesmo quando o preço base da grade é zero.
- Atendimento guiado filtra disponibilidade por estoque ou Sob encomenda explicitamente precificada.
- Prévia de fotos do cadastro, carrossel e ajuda ilustrada confirmados publicados.
- Formulário do Totem utiliza o cadastro completo de produtos, incluindo Fiscal e logística.
- Configuração separa atendimento guiado da tela de abertura; remove edição de contato/endereço da loja; acrescenta atalhos.
- Conteúdo de abertura selecionável: logo e textos, somente textos ou somente fundo.
- Ofertas por produto/grade, preço anterior/especial, expiração, canais Totem/PDV/Venda externa e preço por retirada. Não foi criada uma oferta real sem preço e validade definidos pelo lojista.
- Ajuste mobile: uma coluna abaixo de 480 px.

## Validação
Compilação API/web e 22 testes direcionados passaram. Testes cobrem catálogo, isolamento de loja, sincronização, preços, retirada, ofertas, pedidos e limpeza. O script SQL alternativo de limpeza foi testado em banco isolado; a limpeza real utilizou a interface existente.

## Pendência de configuração
Nenhum vendedor apareceu nas opções do atendimento guiado. WhatsApp da Mariana solicitado ao usuário para vincular a assistente e o QR Code corretamente. Atendimento guiado ainda não ativado na loja. Avatar opcional pode ser enviado no cadastro. Entrega real pelo WhatsApp não foi testada.

## Comprovações
- docs/totem-cleanup-2026-10-06.png
- docs/totem-product-preview-2026-10-06.png
- docs/totem-mobile-published-2026-10-06.png

Pacote: marthi-catalog-update.zip, sem credenciais nem arquivos de backup.


Refinamento solicitado: configuração com interruptores compactos, envio de avatar/logo/fundo por cards com prévia, mensagens em etapas expansíveis e simulação da conversa. O cliente informa como prefere ser chamado; o nome completo escolhido substitui {nome}, sem limitar ao primeiro nome. Compilação API/web e teste adicional de Ana Paula passaram. Publicação final confirmada pela Discloud (HTTP 200).


## Correções para a TV vertical e operação contínua
- Erro real de produção identificado nos logs: INSERT do pedido omitindo product_name obrigatório no banco legado. Campo preenchido com o nome canônico do estoque e migration 0055 compatibiliza bancos novos.
- Vitrine, grid e checkout em até 18 parcelas; taxas por parcela da maquininha disponibilizadas na configuração pública sem dados identificadores da máquina. API calcula o preço final com a mesma taxa e respeita a taxa específica da variação.
- Fotos do checkout com altura limitada ao viewport, object-fit contain e layout de coluna na orientação vertical.
- Configuração aguarda leitura da API antes de permitir edição; falhas de autenticação/leitura não caem silenciosamente em valores padrão.
- Revisão pública por loja a cada 5 segundos detecta mudanças de produtos, preços e configurações. Polling completo a cada 45 segundos e retorno à abertura após 5 minutos sem interação. Atualizações de dados preservam o fluxo do cliente e preço final é validado pelo servidor.
- Não foram criados pedidos ou enviados WhatsApps de teste em produção. Validação de envio realizada em banco local; entrega real depende da conexão WhatsApp da loja.

- Publicação confirmada pela Discloud em 06/10/2026; migration 0055 aplicada com sucesso nos logs.
- Validação pública: revision HTTP 200, taxa em 18 parcelas 16,8%; vitrine real 7.500,00 / 18 × 486,67.
- Prévia 1080 × 1920: foto 440 px de altura, sem overflow horizontal, formulário e ações dentro da tela. Evidência: totem-tv-checkout-2026-10-06.png.
- Para ativar a nova versão já aberta no equipamento, reabrir o totem uma vez. As consultas automáticas atualizam os dados sem depender de recarga manual posterior.

- Integração real de WhatsApp: painel Operações → Comunicação indica ERROR/desconectado. URL configurada https://marthi-tec.discloud.app retorna HTTP 404; aplicativo correspondente offline na Discloud. Endereço correto da Evolution solicitado ao usuário. Pedido preservado na fila em falhas de envio. Nenhuma mensagem de teste enviada.
