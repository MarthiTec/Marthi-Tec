# Regras comerciais por ramo no Marthi

Atualização: 04/10/2026. Implementação opcional por loja, sem ativar regras Cellponto para outros clientes.

## O que foi implementado

- Perfil comercial no MarthiDB vinculado ao ramo: ativação, categorias, comparação de fornecedores, margens por modalidade, troca de usado, garantias e agenda. O botão de modelo Cellponto preenche o formulário; a política só vale após salvar.
- Ramo e personalização persistem no banco. O armazenamento do navegador serve como cache de apresentação após confirmação do servidor.
- Ofertas reais vinculadas a fornecedores da loja, com variante exata, condição, data, validade, disponibilidade e garantia. Edição cria versão; retirada preserva o histórico. Atualização posterior prevalece. Divergências simultâneas bloqueiam a variante.
- Importação de listas estruturadas por tabulação ou separador vertical, com conferência antes de gravar. Informações ausentes exigem preenchimento; não há dedução automática de listas livres de WhatsApp.
- Menor custo atual para novos quando a comparação está ativa. Seminovo Apple encomendado exige garantia do fornecedor no prazo configurado. A referência do usado considera o menor custo equivalente, independentemente da garantia de compra do aparelho desejado.
- Pronta entrega considera somente saldo físico não reservado e custo real. Lacre exige registro de conferência no produto; condição nova isolada não comprova lacre. Outras categorias Apple permanecem sob encomenda quando essa política está ativa.
- Propostas editáveis e duplicáveis; encomendas confirmadas, compradas, em trânsito, recebidas, entregues ou canceladas. Preços, custo e política ficam congelados na negociação.
- Upgrade com avaliação individual e oferta manual abaixo da referência, pagamento antecipado da diferença, usado com o cliente durante a espera, reavaliação e conferência de dados na conclusão. O usado só entra no estoque na entrega efetiva.
- Pagamentos e devoluções gravam movimento financeiro e saldo da conta, com proteção contra repetição. Compra cria conta a pagar; entrega vincula a venda e o recebível, sem gerar uma segunda entrada financeira.
- Reserva impede consumo pelo PDV/venda externa e alterações incompatíveis no cadastro do produto. Recebíveis de encomendas são movimentados pelo próprio fluxo para evitar baixas duplicadas.
- Cancelamento após entrega exige devolução física, verifica disponibilidade do usado e reverte estoque. Devolução de dinheiro é explícita; obrigação com fornecedor não é apagada automaticamente.
- Tabela WhatsApp com preços finais, separação entre custo de referência e oferta, condições e garantias; sem fornecedores ou percentuais internos. O texto é copiado pelo usuário, sem envio externo automático.
- Agenda usa dias, horários e rotas salvos e previsões confirmadas das remessas. Mercadoria em trânsito não vira pronta entrega, e chegada diária não é prometida automaticamente.

## Uso

1. Em Ramo da Loja, salvar o segmento e a personalização.
2. Revisar e salvar as regras comerciais. Se aplicável, preencher o modelo Cellponto.
3. Em ERP > Encomendas & Ofertas, cadastrar fornecedores/clientes/contas previamente nos cadastros existentes, registrar ofertas e conferir variantes.
4. Criar proposta, confirmar, registrar recebimento financeiro e avançar pelas etapas efetivas da operação.
5. Gerar a tabela comercial e revisar os alertas antes de copiar.

As telas novas usam a API autenticada e a conexão PostgreSQL existente. Não há catálogo fictício, fornecedor inventado, estoque simulado ou contingência em memória no fluxo comercial. Os testes usam PostgreSQL isolado por PGlite, sem tocar em cadastros de produção.

## Banco e compatibilidade

O Studio do Discloud foi consultado após a ativação do plano Ruby. A estrutura real diverge da instalação criada pelas migrações: vendas utilizam status `sold`, campos canônicos `amount/payment/product_name`, pagamentos possuem `method_name/type`, e faltavam colunas de compatibilidade e saldo de conta. A migração 0024 preserva essas colunas, reconstrói saldo apenas quando a coluna não existe e acrescenta tabelas comerciais e restrições por loja. As migrações 0021 a 0023 também precisam estar aplicadas; o processo de inicialização executa as pendentes.

Não inserir dados comerciais de teste em produção nem ativar o perfil de uma loja sem revisão de suas próprias regras.

## Cobrança automática Pix/cartão

As formas de pagamento cadastradas e os recebimentos existentes registram operações financeiras; não há integração de cobrança automática com um provedor verificada no projeto. A integração precisa de escolha do provedor e credenciais próprias, emissão de cobrança no servidor, checkout hospedado para cartão/Pix, referência da loja/encomenda, confirmação autenticada por webhook e consulta do pagamento no provedor antes da baixa idempotente. Retorno do navegador ou comprovante não deve aprovar automaticamente pagamento. O provedor ainda depende da escolha do usuário; nenhuma cobrança externa foi criada.

## Validação

- Build da API e frontend.
- Testes comerciais com SQL real: isolamento de loja, configuração, variantes, versões, garantia, oferta manual, antecipação, reserva, reavaliação, entrega, estorno e catálogo.
- Segunda execução comercial reproduz os campos obrigatórios e status do esquema Prisma encontrados no MarthiDB.
- Regressões de persistência de vendas/PDV/financeiro e renderização de e-mail.
- A suíte legada de segurança apresentou cinco falhas em funcionalidades de autenticação/ativação anteriores a este trabalho; não se declara aprovação global de segurança. O fluxo comercial verifica usuário ativo e privilégio administrativo no banco.
- Não foram feitos pagamentos reais, movimentações comerciais de teste em produção ou certificação de transporte/garantias.
