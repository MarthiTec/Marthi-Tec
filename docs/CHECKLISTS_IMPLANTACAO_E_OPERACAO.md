# CHECKLISTS OFICIAIS DO SISTEMA MARTHI
### *Checklist de Implantação (Administrador) & Checklist de Rotina Diária (Operadores)*

---

## 1. CHECKLIST DE IMPLANTAÇÃO DA LOJA (ADMINISTRADOR)

Este checklist deve ser executado pelo Administrador da Empresa ou equipe de implantação técnica antes de liberar o sistema para o atendimento ao público.

### Fase 1: Cadastro da Empresa e Filiais
- [ ] **Acesso Inicial:** Realizar o primeiro login com a credencial mestre.
- [ ] **Dados Cadastrais da Matriz:** Em **Lojas & Licenças (`/painel/lojas`)**, preencher Razão Social, Nome Fantasia, CNPJ e Inscrições Estadual/Municipal.
- [ ] **Endereço Fiscal:** Preencher endereço completo com CEP e Código IBGE do município (7 dígitos).
- [ ] **Regime Tributário:** Selecionar corretamente Simples Nacional, MEI, Lucro Presumido ou Lucro Real.
- [ ] **Filiais Adicionais (se houver):** Cadastrar as demais lojas do grupo na aba Unidades & Filiais.
- [ ] **Ramo de Atuação:** Em **Configurações → Ramo da Loja (`/painel/ramo`)**, definir o segmento correto (Assistência Técnica, Moda, Restaurante, Varejo ou Personalizado) para calibrar os campos visíveis.

### Fase 2: Usuários e Segurança
- [ ] **Criar Funcionários:** Cadastrar todos os colaboradores em **Retaguarda → Pessoas → Funcionários (`/erp/funcionarios`)**.
- [ ] **Vincular Credenciais:** Informar e-mail de acesso e senha provisória para cada usuário.
- [ ] **Revisar Permissões:** Em **Permissões (`/erp/permissoes`)**, validar o perfil de cada um (Admin, Gerente, Operador de Caixa, Técnico).
- [ ] **Autorizações de Caixa:** Definir quem tem permissão para cancelar vendas, conceder descontos e lançar Venda Avulsa.

### Fase 3: Parâmetros Comerciais e PDV
- [ ] **Formas de Pagamento:** Revisar os métodos em **Painel → Vendas → Formas de Pagamento (`/painel/pagamentos`)**: Dinheiro, Cartões, PIX e A Prazo.
- [ ] **Almoxarifado Principal:** Confirmar os locais de estoque em **Retaguarda → Produtos → Almoxarifado (`/erp/almoxarifado`)**.
- [ ] **Regras de Orçamento:** Definir o prazo padrão de validade das propostas em **Orçamentos (`/erp/orcamentos`)**.
- [ ] **Vendedores e Comissões:** Cadastrar os vendedores e suas respectivas taxas de comissão em `/erp/vendedores`.

### Fase 4: Catálogo e Estoque Inicial
- [ ] **Cadastrar Produtos:** Cadastrar o catálogo em `/erp/produtos` com nomes, SKUs, códigos de barras (EAN), custos e preços de venda.
- [ ] **Inventário / Balanço Inicial:** Realizar a contagem física inicial e aplicar ajustes em `/erp/balanco`.
- [ ] **Estoque Mínimo:** Definir a quantidade mínima de alerta para os produtos essenciais.
- [ ] **Campanhas Promocionais (se houver):** Configurar promoções ativas em `/erp/campanhas` (Leve X Pague Y, Faixas de Volume, etc.).

### Fase 5: Emissor Fiscal (quando contratado)
- [ ] **Certificado Digital A1:** Efetuar o upload do arquivo `.pfx` e informar a senha em `/fiscal/config`.
- [ ] **Ambiente SEFAZ:** Iniciar os testes em ambiente de *Homologação* e migrar para *Produção* antes da inauguração comercial.
- [ ] **Parâmetros NFC-e:** Informar o Id do CSC e Código Token CSC da SEFAZ estadual.
- [ ] **Séries e Numeração:** Definir as séries das notas e o próximo número a emitir.
- [ ] **Classificações Fiscais (NCM/CST):** Revisar as alíquotas vinculadas aos grupos de produtos em `/painel/classificacao-fiscal`.

### Fase 6: Homologação e Testes Finais
- [ ] **Teste de Venda no PDV:** Abrir o caixa, passar um item, finalizar no PIX ou Dinheiro e emitir comprovante.
- [ ] **Teste de Venda Avulsa:** Pressionar `Alt+A`, lançar um serviço rápido e confirmar que não afeta estoque.
- [ ] **Teste de Venda a Prazo:** Lançar uma venda para um cliente cadastrado e verificar se o título apareceu no Financeiro.
- [ ] **Teste de OS (se aplicável):** Abrir uma Ordem de Serviço, movimentar no Kanban e gerar o Termo de Garantia em PDF.
- [ ] **Teste de Impressão:** Validar se a impressora térmica não-fiscal (80mm ou 58mm) imprime o cupom perfeitamente.

---

## 2. CHECKLIST DE ROTINA DIÁRIA DO OPERADOR DE CAIXA

Checklist para ser executado no dia a dia da operação de loja.

### Início do Turno / Abertura de Caixa
- [ ] **Login:** Acessar a aplicação com seu e-mail e senha individual.
- [ ] **Conferir Loja Ativa:** Verificar no cabeçalho se a loja selecionada corresponde à sua unidade de trabalho.
- [ ] **Abrir Frente de Caixa:** Entrar na rota `/caixa`.
- [ ] **Contar Fundo de Troco:** Contar as notas e moedas físicas na gaveta.
- [ ] **Registrar Abertura:** Informar o valor contado no campo de Suprimento Inicial e clicar em **Confirmar Abertura**.
- [ ] **Testar Periféricos:** Verificar se o leitor de código de barras e a impressora térmica estão ligados e operantes.

### Durante o Expediente
- [ ] **Atendimento Ágil:** Bipar os produtos e acompanhar a formação do carrinho.
- [ ] **Identificação de Cliente:** Perguntar se o cliente deseja CPF no cupom ou buscar o cadastro para vendas a prazo.
- [ ] **Campanhas Promocionais:** Observar os badges de campanha aplicados automaticamente pelo sistema.
- [ ] **Consultar Orçamentos:** Quando um cliente trouxer uma proposta negociada, abrir a gaveta de Orçamentos e clicar em **Converter para Venda**.
- [ ] **Sangria Preventiva:** Quando a gaveta acumular excesso de cédulas, solicitar ao gerente a realização da Sangria de Caixa para guarda no cofre.
- [ ] **Suprimento:** Caso falte troco, registrar a entrada de moedas via Suprimento.

### Término do Turno / Fechamento de Caixa
- [ ] **Conferência de Vendas:** Clicar no menu lateral do caixa e acessar **Fechamento de Caixa**.
- [ ] **Contagem Cega dos Valores:** Contar fisicamente cada forma de pagamento presente na gaveta:
  - Total em Dinheiro (R$)
  - Comprovantes de Cartão de Débito (POS/TEF)
  - Comprovantes de Cartão de Crédito
  - Total recebido via PIX
  - Canhotos assinados de Vendas a Prazo / Promissórias
- [ ] **Digitar Valores:** Informar os valores contados nos respectivos campos da tela de fechamento.
- [ ] **Conferir Divergências:** Observar o resumo de diferenças (sobra ou falta).
- [ ] **Concluir Fechamento:** Clicar em **Confirmar Fechamento de Caixa** e imprimir o extrato de fechamento de turno para assinatura.
- [ ] **Logout:** Efetuar o logout da sua conta para segurança da operação.

---

## 3. CHECKLIST DIÁRIO DO TÉCNICO DE OFICINA (ORDENS DE SERVIÇO)

- [ ] **Revisão da Bancada:** Abrir o Kanban de OS (`/os`) e filtrar pelos chamados atribuídos ao seu nome.
- [ ] **Triagem de Entrada:** Conferir o checklist de entrada e as fotos dos aparelhos que entraram na coluna *Aberta*.
- [ ] **Diagnóstico:** Mover para *Diagnóstico*, testar o equipamento e orçar as peças necessárias no estoque.
- [ ] **Acompanhamento de Aprovação:** Aguardar o cliente aprovar o orçamento antes de iniciar o reparo.
- [ ] **Execução:** Mover para *Em Serviço*, acionar o cronômetro de bancada e lançar as peças utilizadas no chamado.
- [ ] **Conclusão:** Mover para *Pronta*, emitir o Termo de Garantia com QR Code e notificar a recepção para entrega.
