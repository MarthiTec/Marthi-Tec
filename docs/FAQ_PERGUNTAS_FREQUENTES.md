# PERGUNTAS FREQUENTES (FAQ) · SISTEMA MARTHI
### *Respostas Técnicas e Operacionais para Dúvidas do Dia a Dia*

---

### 1. CADASTROS E PRODUTOS

#### P: Como cadastrar um novo produto no sistema?
**R:** Acesse **Retaguarda → Produtos → Cadastro** (`/erp/produtos`), clique no botão **+ Novo Produto**, preencha a Descrição, Código de Barras (ou SKU interno), Preço de Custo, Preço de Venda, Estoque Atual e Estoque Mínimo, e clique em **Salvar**.

#### P: Como alterar o preço de venda de um produto que já está cadastrado?
**R:** Acesse `/erp/produtos`, localize o item na tabela pelo nome ou código, clique no botão de lápis ✏️ (**Editar**) na coluna Ações, altere o valor no campo **Preço de Venda Base** e clique em **Salvar**. O novo preço passa a vigorar imediatamente no PDV.

#### P: Posso cadastrar produtos vendidos por peso ou fração (como quilos ou metros)?
**R:** Sim. No cadastro do produto, altere o campo **Unidade de Medida** de `UN` (inteiro) para `KG` (pesável). O sistema passará a aceitar vendas fracionadas com até 3 casas decimais (ex: `0.750 kg` ou `1.450 kg`).

#### P: Como duplicar um produto existente para agilizar o cadastro?
**R:** Na tabela de produtos (`/erp/produtos`), clique no ícone de cópia 📋 (**Duplicar**) na linha do item. O sistema abrirá um novo formulário com todos os dados copiados (custos, categoria, classificações fiscais), restando apenas ajustar o nome, código de barras ou cor/tamanho.

---

### 2. FRENTE DE CAIXA E VENDAS (PDV)

#### P: O que é e quando devo utilizar a Venda Avulsa (`Alt+A`)?
**R:** A Venda Avulsa serve para lançar serviços rápidos, mão de obra ou cobranças de balcão que **não possuem produto físico cadastrado no estoque** (ex: *Instalação de torneira*, *Taxa de entrega*, *Conserto rápido*). Pressione `Alt+A` no caixa, informe a descrição e o valor, adicione ao carrinho e receba normalmente. A venda avulsa **não movimenta saldo de estoque**.

#### P: Como aplicar um desconto em uma venda no PDV?
**R:** No carrinho do caixa, você pode clicar no campo de desconto do item ou do subtotal geral. Caso o operador não possua autorização autônoma de desconto, o sistema solicitará a confirmação de senha do Gerente ou Administrador.

#### P: Como cancelar uma venda concluída por engano?
**R:** Acesse **Painel → Vendas → Consultar Vendas** (`/painel/pedidos`), localize a venda e clique no botão **Cancelar Venda**. É obrigatório informar a justificativa com no mínimo 15 caracteres. O sistema cancelará a movimentação financeira e devolverá as peças ao estoque físico automaticamente.

#### P: Como fazer uma venda a prazo (crediário da loja)?
**R:** No PDV, identifique o cliente no topo da tela (obrigatório para vendas a prazo), adicione os produtos e clique em **Finalizar Venda (F2)**. Escolha a forma de pagamento **A Prazo / Crediário**, selecione o parcelamento e confirme. O sistema baixará o estoque e gerará um título em **Contas a Receber** com o vencimento acordado.

---

### 3. CAMPANHAS E ORÇAMENTOS

#### P: Como criar uma promoção do tipo "Leve 3 Pague 2"?
**R:** Acesse **Retaguarda → Produtos → Campanhas** (`/erp/campanhas`), clique em **+ Nova Campanha**, defina o Tipo de Promoção como **Leve X Pague Y**, preencha `Compre 3` e `Pague 2`, selecione os produtos participantes e defina o período de validade. Salve a campanha. O caixa aplicará o abatimento automaticamente assim que 3 unidades forem bipadas.

#### P: O que acontece quando tento transformar um orçamento expirado em venda?
**R:** Ao abrir a gaveta de Orçamentos no caixa e clicar em **Converter para Venda** em um orçamento com a validade vencida, o Marthi exibirá um alerta inteligente perguntando: *"Deseja atualizar os itens para os preços vigentes de hoje ou manter os preços congelados da proposta original?"*. O operador pode optar por reajustar ou manter (mediante liberação da gerência).

#### P: Como enviar a proposta comercial de um orçamento para o cliente via WhatsApp?
**R:** Em **Orçamentos (`/erp/orcamentos`)**, localize a proposta e clique em **Imprimir / Compartilhar**. Na tela de visualização, clique em **Enviar WhatsApp**. O sistema abrirá o WhatsApp com a mensagem personalizada e o link do orçamento formatado.

---

### 4. ORDENS DE SERVIÇO E OFICINA (OS)

#### P: Como colocar uma Ordem de Serviço em garantia?
**R:** Abra os detalhes da OS concluída (`/os/:id`) e clique no botão **🛡️ Termo de Garantia**. O sistema abre o modal com a data de entrega e permite configurar o prazo de cobertura individual para peças e serviços (ex: 90 dias). Ao clicar em **Baixar PDF**, é gerado o Certificado Oficial de Garantia com QR Code para consulta rápida.

#### P: Para que serve a coluna "Reprovada" no Kanban de OS?
**R:** Quando um cliente não autoriza o orçamento do conserto, o chamado é movido para **Reprovada**. O sistema desvincula as peças reservadas do estoque e deixa o aparelho disponível para ser devolvido ao proprietário sem faturamento de serviço.

---

### 5. EMISSÃO FISCAL

#### P: Como emitir uma Nota Fiscal de Devolução para fornecedor?
**R:** Acesse **Painel → Emissor Fiscal → Notas Emitidas** (`/painel/notas`), clique em **+ Nova Nota**, escolha o Tipo **Devolução**, selecione o Fornecedor e obrigatoriamente preencha o campo **Chave de Acesso da NF-e Original (44 dígitos)**. O sistema preencherá os CFOPs de devolução apropriados e validará o arquivo antes do envio para a SEFAZ.

#### P: O que significa quando a SEFAZ retorna uma rejeição de nota fiscal?
**R:** A rejeição ocorre quando alguma regra tributária ou cadastral da SEFAZ estadual não foi atendida (ex: *Rejeição 539: Duplicidade de NF-e*, *Rejeição 778: Informado NCM inexistente*). Na listagem de notas, o status aparecerá em vermelho; clique sobre a nota para ler o código exato da rejeição e a descrição enviada pela Fazenda para corrigir o campo no cadastro do cliente ou produto.

---

### 6. MULTI-LOJAS E ACESSO

#### P: Como cadastrar uma segunda filial no sistema?
**R:** Acesse **Painel → Lojas & Licenças** (`/painel/lojas`), clique na aba **Unidades & Filiais** e clique em **+ Nova Loja**. Preencha a Razão Social, CNPJ da filial, endereço completo com código IBGE e regime tributário, e clique em **Salvar Loja**.

#### P: Como trocar de loja na tela para visualizar o estoque de outra filial?
**R:** Clique no botão com o **ícone de Loja** no cabeçalho superior (ao lado do logo do Marthi). Uma lista com todas as lojas cadastradas aparecerá; clique sobre a loja que deseja acessar.

#### P: Como criar um novo usuário e definir suas permissões?
**R:** Acesse **Retaguarda → Pessoas → Funcionários**, clique em **+ Novo Funcionário**, informe o nome e e-mail e marque **Usuário do Sistema**. Em seguida, vá para **Retaguarda → Pessoas → Permissões** para selecionar exatamente quais módulos (PDV, OS, Estoque, Financeiro, Fiscal) aquele usuário poderá acessar.
