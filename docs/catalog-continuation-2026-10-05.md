# Auditoria e continuidade do Totem — 05/10/2026

## Correções verificadas
- Cell Ponto: uma matriz; documento corrigido a partir da própria conta comercial. Gilvan e Mariana ativos; usuário adicional desativado. Credenciais preservadas.
- Demonstração identificada explicitamente e excluída das métricas comerciais; filial fictícia desativada.
- Cor e Capacidade ativos. Retirada é modalidade operacional fixa, separada dos atributos.
- Confirmação PIX já existente reconhecida pelo painel; valores contratuais não foram inventados.

## Falhas encontradas e corrigidas
A consulta pública do Totem não selecionava `variations`, embora o cadastro gravasse a grade. A consulta agora devolve todas as variações do produto. A hidratação dos atributos usa a loja explícita do link público, mesmo quando há uma sessão do painel aberta.
Eventos emitidos pela própria hidratação iniciavam novas atualizações. A sincronização agora bloqueia chamadas recursivas e sobrepostas, pausa consulta em segundo plano e remove ouvintes/timers ao sair da tela.
Uma falha transitória apagava o catálogo e os atributos. O último catálogo confirmado permanece somente para a mesma loja, com aviso de conexão e nova tentativa. Troca de loja ou revogação de acesso não reutiliza esse catálogo.

## Interface
Descrição no cabeçalho configurável no painel do lojista; campo vazio usa a descrição padrão. Cards com área de foto em proporção fixa, imagem inteira sem corte, tratamento para foto indisponível. Seletores e botão de pedido organizados sem ultrapassar o card estreito; claro/escuro validados em 360, 390 e 768 px na validação local. Retirada sempre aparece no card e sua escolha é levada ao pedido. Modal mantém endereço e prazo quando aplicáveis.
Referência FMX consultada em Forms/Totem: seleção de Cor/Capacidade e passagem para pedido; imagens originalmente usam TileStretch. No web foi preservada a proporção para evitar deformação.

## Validação
Compilação API e web concluída. 14 testes direcionados passaram: persistência de um produto/SKU com múltiplas fotos e grades, devolução das grades pelo catálogo público, isolamento de loja, resiliência após falha, sincronização sem recursão, configuração do cabeçalho, pedido idempotente e persistência operacional. Auditoria anterior de 71 testes passou antes das correções finais do Totem.

## Produção e dados
Backup consistente de todas as 149 tabelas criado antes das correções de metadados em `/home/node/incident-backups/catalog-before-20261005.json.gz`, fora da pasta pública, acesso restrito.
Nenhum produto foi excluído. O iPhone 17 Pro Max recém-cadastrado é preservado. Duas grades com preço zero refletem o cadastro informado; custo não foi convertido em preço de venda.
A exclusão dos 23 produtos fictícios continua pendente de confirmação específica. O script antigo de limpeza aborta ao encontrar novos produtos, portanto não deve ser executado integralmente após esse cadastro.
Pacote `marthi-catalog-update.zip` enviado à Discloud com autorização explícita do usuário, sem credenciais, backups ou arquivos da validação local. Resultado da publicação será registrado após confirmação no painel.

## Imagens: limite atual
O cadastro ainda pode armazenar imagens em data URL; URLs HTTPS também são aceitas. Armazenamento externo automático não foi configurado. Para volume alto, usar armazenamento de objetos com URLs e metadados no banco, autorização por loja e versões menores para catálogo. A mudança exige configuração do serviço escolhido e migração controlada das imagens existentes.

## Conferência publicada
A primeira atualização desta etapa foi confirmada pela Discloud como Commit concluído. No catálogo real, o iPhone 17 Pro Max mostrou Cor/Capacidade e três fotos; Laranja-cósmico/256GB atualizou para R$ 7.500,00 e quantidade 1. Em mãos foi levado à tela de pedido com os atributos e preço. Nenhum pedido de teste foi enviado. Sem erros registrados no navegador durante a conferência. A checagem de 390 px encontrou uma regra geral de botão sobrescrevendo a quebra de texto; a especificidade foi corrigida e uma atualização final foi enviada. A operação por 24 horas não foi observada integralmente nesta sessão.
