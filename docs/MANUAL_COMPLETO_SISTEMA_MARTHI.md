# MARTHI TECNOLOGIA · MANUAL COMPLETO DO SISTEMA
### *Manual Oficial do Usuário & Ebook de Apresentação Operacional*

**Versão do Sistema:** 2.6.0  
**Versão do Manual:** 1.0.0  
**Data de Atualização:** 28/09/2026  
**Empresa Desenvolvedora:** Marthi Tecnologia  
**Canal de Suporte & Central:** Menu Lateral → Central de Ajuda (`/painel/ajuda`)

---

## SUMÁRIO GERAL

1. [Apresentação e Boas-Vindas](#1-apresentação-e-boas-vindas)
2. [Conhecendo o Ecossistema Marthi](#2-conhecendo-o-ecossistema-marthi)
3. [Primeiros Passos e Primeiro Acesso](#3-primeiros-passos-e-primeiro-acesso)
4. [Configuração da Empresa, Matriz e Filiais (Multi-Lojas)](#4-configuração-da-empresa-matriz-e-filiais-multi-lojas)
5. [Licenciamento por CNPJ e Regras Comerciais](#5-licenciamento-por-cnpj-e-regras-comerciais)
6. [Usuários, Perfis e Controle de Permissões](#6-usuários-perfis-e-controle-de-permissões)
7. [Configuração de Ramo da Loja & Personalização](#7-configuração-de-ramo-da-loja--personalização)
8. [Configuração Operacional antes da Primeira Venda](#8-configuração-operacional-antes-da-primeira-venda)
9. [Cadastro Completo de Produtos e Variações](#9-cadastro-completo-de-produtos-e-variações)
10. [Gestão e Controle Físico de Estoque](#10-gestão-e-controle-físico-de-estoque)
11. [Balanço e Inventário com Trava de Segurança](#11-balanço-e-inventário-com-trava-de-segurança)
12. [Movimentações de Estoque e Almoxarifados](#12-movimentações-de-estoque-e-almoxarifados)
13. [Cadastro de Clientes (Pessoa Física e Jurídica)](#13-cadastro-de-clientes-pessoa-física-e-jurídica)
14. [Cadastro de Fornecedores](#14-cadastro-de-fornecedores)
15. [Funcionários e Vendedores (Comissões)](#15-funcionários-e-vendedores-comissões)
16. [Campanhas Promocionais e Descontos Comerciais](#16-campanhas-promocionais-e-descontos-comerciais)
17. [Orçamentos e Propostas Comerciais](#17-orçamentos-e-propostas-comerciais)
18. [Frente de Caixa (PDV) - Abertura e Operação](#18-frente-de-caixa-pdv---abertura-e-operação)
19. [Venda Normal no PDV Passo a Passo](#19-venda-normal-no-pdv-passo-a-passo)
20. [Venda com Aplicação Automática de Campanhas](#20-venda-com-aplicação-automática-de-campanhas)
21. [Venda a Prazo e Crediário](#21-venda-a-prazo-e-crediário)
22. [Venda Avulsa (Serviço Rápido sem Estoque)](#22-venda-avulsa-serviço-rápido-sem-estoque)
23. [Cancelamentos, Sangria e Suprimento de Caixa](#23-cancelamentos-sangria-e-suprimento-de-caixa)
24. [Módulo Fiscal - Configurações Iniciais (Certificado A1 & CSC)](#24-módulo-fiscal---configurações-iniciais-certificado-a1--csc)
25. [Emissão de NF-e (Entrada, Saída, Devolução e Transferência)](#25-emissão-de-nf-e-entrada-saída-devolução-e-transferência)
26. [Emissão de NFC-e no Caixa](#26-emissão-de-nfc-e-no-caixa)
27. [Emissão de NFS-e (DPS Nacional)](#27-emissão-de-nfs-e-dps-nacional)
28. [Ordem de Serviço (OS) - Abertura e Triagem](#28-ordem-de-serviço-os---abertura-e-triagem)
29. [Kanban da Oficina e Acompanhamento Técnico](#29-kanban-da-oficina-e-acompanhamento-técnico)
30. [OS de Garantia e Certificado em PDF](#30-os-de-garantia-e-certificado-em-pdf)
31. [Cardápio Digital, Mesas e KDS de Cozinha (Food)](#31-cardápio-digital-mesas-e-kds-de-cozinha-food)
32. [Totem de Autoatendimento](#32-totem-de-autoatendimento)
33. [E-commerce e Marketplaces (Hub Integrador)](#33-e-commerce-e-marketplaces-hub-integrador)
34. [CRM - Gestão de Leads e Funil de Vendas](#34-crm---gestão-de-leads-e-funil-de-vendas)
35. [Módulo Financeiro (Contas a Pagar, Receber e DRE)](#35-módulo-financeiro-contas-a-pagar-receber-e-dre)
36. [Relatórios e Auditoria](#36-relatórios-e-auditoria)
37. [Guia por Perfil de Usuário](#37-guia-por-perfil-de-usuário)
38. [Solução de Dúvidas e Problemas Frequentes](#38-solução-de-dúvidas-e-problemas-frequentes)
39. [Glossário de Termos do Marthi](#39-glossário-de-termos-do-marthi)

---

## 1. APRESENTAÇÃO E BOAS-VINDAS

Seja bem-vindo ao **Marthi**, a plataforma integrada de gestão empresarial (ERP), Ponto de Venda (PDV), Emissão Fiscal, Assistência Técnica (OS), Cardápio Digital e CRM desenvolvida para impulsionar a operação do seu negócio com agilidade, controle e segurança jurídica.

Este manual foi elaborado especificamente para a **versão atual da aplicação**. Nenhum procedimento aqui descrito é fruto de suposição teórica: cada rota, botão, campo, diálogo de confirmação e resultado visual reflete a arquitetura real do sistema.

### Princípios do Sistema Marthi
- **Operação Híbrida e Resiliente:** Toda a aplicação funciona em sincronia com o backend central e mantém cópias seguras e reativas na camada local (`localStorage`), garantindo que a sua frente de caixa nunca trave mesmo em instabilidades de rede.
- **Ecossistema Modular:** A loja ativa apenas os módulos pertinentes ao seu modelo de negócio (Varejo, Assistência Técnica, Restaurante, Prestador de Serviços).
- **Paridade Visual Clara/Escura:** 100% das telas contam com modo escuro (`.admin--dark` / `.is-theme-dark`) e modo claro de alto contraste, desenhados para conforto visual do operador durante longas jornadas de trabalho.
- **Multi-Dispositivo Nativo:** Layouts responsivos adaptados para monitores Full HD, notebooks compactos (1366x768), tablets de atendimento (768px a 1024px) e smartphones (360px a 430px).

---

## 2. CONHECENDO O ECOSSISTEMA MARTHI

O Marthi é organizado em módulos especializados acessíveis pelo menu de navegação e pelo **Seletor de Ecossistema** (ícone de grade no topo das telas):

```text
ECOSSISTEMA MARTHI
│
├── 🏢 PAINEL ADMINISTRATIVO (/painel)
│   ├── Visão Geral e Indicadores
│   ├── Lojas & Licenças por CNPJ (/painel/lojas)
│   ├── Operações & Parâmetros (/painel/operacoes)
│   ├── Ramo da Loja & Personalização (/painel/ramo)
│   ├── Central de Ajuda (/painel/ajuda)
│   └── Gestão de Pedidos e Consultas (/painel/pedidos)
│
├── 📦 RETAGUARDA / ERP (/erp)
│   ├── Produtos & Catálogo (/erp/produtos)
│   ├── Balanço de Estoque (/erp/balanco)
│   ├── Movimentações de Estoque (/erp/movimentos)
│   ├── Atributos, Kits, Lotes e Almoxarifados
│   ├── Tabelas de Preço & Campanhas Promocionais (/erp/campanhas)
│   ├── Orçamentos Comerciais (/erp/orcamentos)
│   ├── Clientes, Funcionários, Vendedores e Fornecedores
│   ├── Permissões de Acesso (/erp/permissoes)
│   ├── Financeiro, Boletos, Relatórios e Auditoria
│   └── Cardápio Digital (quando ramo Food ativo)
│
├── 🛒 FRENTE DE CAIXA / PDV (/caixa)
│   ├── Abertura, Conferência e Fechamento de Caixa
│   ├── Venda Normal de Produtos
│   ├── Venda com Aplicação de Campanhas
│   ├── Venda a Prazo / Crediário
│   ├── Venda Avulsa (Alt+A) sem movimentação de estoque
│   ├── Suprimento, Sangria e Cancelamento com Autorização
│   └── Emissão de Cupom Fiscal Eletrônico (NFC-e)
│
├── 🔧 ORDENS DE SERVIÇO / OFICINA (/os)
│   ├── Kanban de Fluxo Técnico (7 Colunas de Status)
│   ├── Nova OS com Checklist de Entrada e Assinatura Digital
│   ├── Alocação de Peças, Insumos e Mão de Obra
│   ├── Cronômetro de Bancada e Laudos Técnicos
│   ├── Termo de Garantia com QR Code e PDF
│   └── Agenda da Oficina (/os/agenda)
│
├── 🧾 EMISSOR FISCAL (/fiscal e /painel/notas)
│   ├── Gestão de Certificado Digital A1
│   ├── Configuração de Série e CSC para NFC-e
│   ├── Emissão de NF-e (Saída, Entrada, Devolução, Transferência e Bonificação)
│   ├── Emissão de NFS-e (Padrão DPS Nacional)
│   └── Tabela de Classificação Fiscal, CFOPs e Tributos (IBS/CBS 2026+)
│
├── 🍔 FOOD & RESTAURANTES (/cardapio, /mesa, /cozinha)
│   ├── Gestão de Pratos do Dia e Categorias (/painel/cardapio)
│   ├── Display de Mesa para Impressão com QR Code (/painel/cardapio/imprimir)
│   ├── Abertura e Fechamento de Mesas/Comandas (/mesa)
│   └── Fila de Preparo da Cozinha / KDS (/cozinha)
│
├── 🖥️ TOTEM DE AUTOATENDIMENTO (/totem e /painel/totem)
│   ├── Navegação Visual com Fotos Grandes e Adicionais
│   ├── Pagamento via PIX Integrado no Terminal
│   └── Envio do Pedido para a Fila do Caixa
│
├── 🌐 E-COMMERCE & MARKETPLACES (/ecommerce)
│   ├── Hub de Conexão: Mercado Livre, Shopee, Tray, Amazon e iFood
│   ├── Anúncios Vinculados ao Estoque Físico
│   └── Importação de Pedidos Online
│
└── 🤝 CRM & NEGÓCIOS (/crm)
    ├── Funil de Vendas (Kanban de Leads)
    ├── Atribuição Exclusiva de Vendedor (Claim)
    ├── Caixa de Entrada de Conversas (Inbox)
    └── Histórico e Fechamento de Contratos
```

---

## 3. PRIMEIROS PASSOS E PRIMEIRO ACESSO

### Acessando a Aplicação
1. Abra seu navegador web (Google Chrome, Microsoft Edge ou Firefox atualizados).
2. Acesse o endereço da sua loja ou ambiente Marthi (ex: `http://localhost:5173/login` ou domínio contratado).
3. A tela **Entrar** será exibida.

> [!NOTE]
> **Modelo de Credenciais do Marthi:**  
> A Marthi Tecnologia fornece o acesso administrador inicial contratado. Operadores não criam contas sozinhos na tela de login; o administrador da loja cria cada operador com e-mail, senha e nível de acesso dentro de **Pessoas → Funcionários**.

### Tela de Login (`/login`)
- **Campo E-mail:** Digite o e-mail cadastrado (ex: `voce@loja.com.br` ou o e-mail administrador).
- **Campo Senha:** Digite a senha cadastrada. Clique no ícone de olho para exibir ou ocultar os caracteres.
- **Botão Entrar:** Valida a credencial e redireciona automaticamente o usuário para a sua área de trabalho de acordo com sua função:
  - *Administrador / Gestor:* Redirecionado para o **Painel Geral (`/painel`)**.
  - *Operador de Caixa:* Redirecionado diretamente para o **Caixa (`/caixa`)**.
  - *Técnico de Oficina:* Redirecionado para as **Ordens de Serviço (`/os`)**.
  - *Emissor Fiscal:* Redirecionado para o **Módulo Fiscal (`/fiscal`)**.
  - *Vendedor / Comercial:* Redirecionado para **CRM (`/crm`)** ou **Orçamentos (`/erp/orcamentos`)**.

### Recuperação de Senha
1. Na tela de login, clique no link **Esqueci minha senha**.
2. Preencha seu e-mail cadastrado.
3. Clique em **Enviar pedido**. O gestor da loja receberá a solicitação na auditoria de acessos para redefinir sua credencial.

### Alternando entre Tema Claro e Escuro
No topo superior direito de qualquer módulo administrativo ou operacional, localize o botão com o ícone de **Sol / Lua**:
- Clique para alternar instantaneamente entre **Tema Claro** e **Tema Escuro**.
- A preferência do operador fica salva no navegador e permanece ativa nos próximos acessos.

---

## 4. CONFIGURAÇÃO DA EMPRESA, MATRIZ E FILIAIS (MULTI-LOJAS)

O gerenciamento de lojas do Marthi é centralizado no Painel Administrativo.

### Localização no Sistema:
> **Menu Lateral → Lojas & Licenças** (rota `/painel/lojas`)

### Cadastrando uma Nova Loja / Filial:
1. Acesse o menu **Lojas & Licenças**.
2. Na aba **Unidades & Filiais**, clique no botão superior **+ Nova Loja**.
3. O modal de cadastro será aberto. Preencha os campos estruturados:
   - **Razão Social:** Nome empresarial registrado no contrato social ou cartão CNPJ. *Exemplo: Alpha Varejo e Serviços Ltda.* (Obrigatório).
   - **Nome Fantasia:** Nome de fachada da loja. *Exemplo: Marthi Store Centro.* (Obrigatório).
   - **CNPJ:** Número do documento. Suporta tanto o formato tradicional numérico (14 dígitos) quanto o **CNPJ Alfanumérico RFB 2026+**. (Obrigatório).
   - **Inscrição Estadual (IE):** Número da IE para operações de ICMS. Se isento, informe `ISENTO`.
   - **Inscrição Municipal (IM):** Número da IM junto à prefeitura (essencial para emissão de NFS-e).
   - **Regime Tributário:** Selecione no combobox padronizado:
     - *Simples Nacional*
     - *Lucro Presumido*
     - *Lucro Real*
     - *Microempreendedor Individual (MEI)*
   - **E-mail & Telefone Comercial:** Contatos principais da unidade.
   - **Endereço Completo:** CEP, Logradouro, Número, Complemento, Bairro, Município, UF e **Código IBGE do Município** (7 dígitos, obrigatório para transmissão fiscal).
   - **Definir como Matriz:** Marque esta opção caso esta loja seja a sede principal do grupo econômico.
4. Clique em **Salvar Loja**.
5. A nova filial aparecerá imediatamente na listagem, com indicador de Matriz ou Filial.

### Alternando a Loja Ativa na Operação:
No cabeçalho do sistema, ao lado do logo do Marthi, localize o botão com o **ícone de Loja**:
1. Clique no botão de Loja.
2. A lista com todas as lojas cadastradas no grupo será exibida.
3. Clique sobre a loja desejada.
4. O sistema atualiza o contexto instantaneamente: estoque, caixas, vendas e relatórios passam a refletir exclusivamente os dados da loja selecionada.

> [!IMPORTANT]
> **Isolamento de Dados Multi-Loja:**  
> Cada loja possui controle independente de saldos de estoque físico e caixas terminais. O catálogo de produtos cadastrado pode ser compartilhado globalmente, mas a quantidade física em estoque é controlada por filial.

---

## 5. LICENCIAMENTO POR CNPJ E REGRAS COMERCIAIS

### Localização no Sistema:
> **Painel → Lojas & Licenças → Aba "Licenciamento & Contrato"**

### Informações Apresentadas:
- **Titular da Conta:** Razão Social e CNPJ principal da empresa contratante.
- **Plano Vigente:** Nome do plano (ex: *Marthi Pro*, *Marthi Enterprise*).
- **Lojas Contratadas vs Cadastradas:** Exibe o número de lojas liberadas na licença e quantas estão atualmente ativas.
- **Valor Mensal Consolidado:** Mensalidade total calculada automaticamente somando a matriz e as filiais adicionais.
- **Status da Licença:** Situação da licença (*Ativa*, *Em período de teste*, *Bloqueada por fatura*).
- **Próximo Vencimento:** Data limite para renovação da licença.

### Regras Comerciais de Escala (Descontos Multi-Loja):
Na aba **Regras Comerciais**, o administrador pode configurar tabelas de desconto progressivo por quantidade de filiais:
- *Exemplo real:* A partir da 2ª loja: 15% de desconto na mensalidade da unidade adicional; a partir da 3ª loja: 25% de desconto.
- O sistema calcula o valor líquido mensal na aba Licenciamento de forma transparente.

---

## 6. USUÁRIOS, PERFIS E CONTROLE DE PERMISSÕES

O Marthi possui uma estrutura rigorosa de controle de acesso para garantir que cada colaborador visualize e execute apenas o que compete à sua função.

### Perfis de Usuário Nativos:
1. **Administrador (`admin`):** Acesso irrestrito a todos os módulos, configurações da loja, planos, cadastros, cancelamentos no PDV, relatórios financeiros e emissão fiscal.
2. **Gerente (`manager`):** Acesso operacional amplo, cadastro de produtos, autorização de descontos e cancelamentos no PDV, visualização de relatórios operacionais. Não altera dados de contrato ou plano Marthi.
3. **Operador de Caixa (`operator`):** Focado exclusivamente na frente de caixa (`/caixa`), abertura/fechamento do seu turno, lançamento de vendas e consulta rápida de produtos.
4. **Técnico (`operator` com foco em OS):** Acesso direcionado ao módulo de Ordens de Serviço (`/os`), bancada técnica, inclusão de peças utilizadas e emissão de laudos.
5. **Vendedor (`seller`):** Acesso a clientes, orçamentos e lançamentos no PDV com vínculo de comissão percentual.

### Cadastrando um Novo Funcionário / Usuário:
1. Acesse **Retaguarda → Pessoas → Funcionários** (`/erp/funcionarios`).
2. Clique no botão **+ Novo Funcionário**.
3. Preencha os dados:
   - **Nome:** Nome completo do colaborador.
   - **E-mail:** E-mail individual do colaborador (será o login de acesso).
   - **Telefone / WhatsApp:** Contato direto.
   - **CPF:** Documento pessoal.
   - **Função:** Escolha entre *Administrador*, *Gerente*, *Operador* ou *Vendedor*.
   - **Usuário do Sistema:** Marque a caixa se este funcionário terá login e senha no Marthi.
   - **Permissões de Caixa:**
     - *Cancelar venda no PDV:* Permite cancelar uma venda sem exigir senha de supervisor.
     - *Cancelar item no PDV:* Permite remover um item já lançado no carrinho.
     - *Lançar Venda Avulsa:* Autoriza o operador a usar o atalho `Alt+A` para serviços sem estoque.
     - *Configurar Venda Avulsa:* Permite definir limites de valor e regras.
4. Clique em **Salvar Funcionário**.

### Definindo Áreas de Acesso Específicas:
Acesse **Retaguarda → Pessoas → Permissões** (`/erp/permissoes`):
- Selecione o funcionário na listagem.
- Marque individualmente quais áreas ele pode acessar:
  - `PDV / Pedidos`
  - `Ordens de Serviço`
  - `Produtos & Estoque`
  - `Clientes & CRM`
  - `Financeiro`
  - `Fiscal (NCM/CFOP/Notas)`
  - `E-commerce`
  - `Totem`
- Clique em **Salvar Permissões**. Ao fazer login, o menu lateral do colaborador exibirá unicamente as áreas autorizadas.

---

## 7. CONFIGURAÇÃO DE RAMO DA LOJA & PERSONALIZAÇÃO

O Marthi adapta sua interface e campos obrigatórios de acordo com o segmento comercial da sua loja, evitando telas poluídas com campos inúteis.

### Localização no Sistema:
> **Painel → Configurações → Ramo da Loja & Personalização** (rota `/painel/ramo`)

### Segmentos Pré-Configurados:
1. **Oficina, Assistência Técnica & Acessórios:**
   - *O que ativa:* Campo de IMEI/Número de Série do aparelho, Senha de Desbloqueio para testes, Checklist de entrada, Bancada técnica de reparo.
   - *O que oculta:* Comandas de mesas e fila de cozinha.
2. **Moda, Vestuário & Calçados:**
   - *O que ativa:* Grade de Tamanho e Cor nos produtos, variações de atributos no PDV.
   - *O que oculta:* IMEI, senhas e módulos de restaurante.
3. **Restaurante, Bar & Gastronomia:**
   - *O que ativa:* Gestão de Mesas e Salão (`/mesa`), KDS / Fila de Preparo da Cozinha (`/cozinha`), Cardápio Digital do Dia (`/painel/cardapio`) e Display de Mesa com QR Code.
   - *O que oculta:* IMEI e senhas de aparelhos.
4. **Varejo em Geral, Mercados & Lojas de Conveniência:**
   - *O que ativa:* Leitura ultra-rápida de código de barras (EAN), balança de peso com unidades KG (3 casas decimais), controle rigoroso de estoque mínimo.
5. **Personalizado:**
   - Permite que o administrador ligue e desligue manualmente cada alternador (toggles):
     - `Exibir campo IMEI / Série em produtos e OS`
     - `Exibir campo de Senha do Aparelho na entrada de OS`
     - `Exibir Mesas e Fila da Cozinha`
     - `Exibir Cardápio Digital`
     - `Exibir Bancada Técnica e Checklist na OS`
     - `Exibir Grade de Tamanho / Cor`

---

## 8. CONFIGURAÇÃO OPERACIONAL ANTES DA PRIMEIRA VENDA

Antes de iniciar as vendas diárias, realize a seguinte parametrização inicial:

### Checklist do Administrador:
- [ ] **Empresa e Loja:** Confirmar Razão Social, Nome Fantasia, CNPJ e Regime Tributário.
- [ ] **Almoxarifado:** Verificar o Almoxarifado Principal (`/erp/almoxarifado`).
- [ ] **Formas de Pagamento:** Conferir os métodos aceitos em **Painel → Vendas → Formas de Pagamento** (`/painel/pagamentos`): Dinheiro, Cartão de Débito, Cartão de Crédito, PIX, Boleto Bancário e Crediário/Prazo.
- [ ] **Certificado Digital A1:** Se for emitir cupom fiscal, cadastrar o Certificado A1 e CSC em **Emissor Fiscal → Configuração** (`/fiscal/config`).
- [ ] **Usuários:** Criar o usuário do operador de caixa com perfil `operator`.
- [ ] **Terminal de Caixa:** Abrir o caixa na rota `/caixa` e informar o saldo inicial (fundo de troco).

---

## 9. CADASTRO COMPLETO DE PRODUTOS E VARIAÇÕES

### Localização no Sistema:
> **Retaguarda → Produtos → Cadastro** (rota `/erp/produtos`)

### Passo a Passo para Criar um Produto:
1. Acesse `/erp/produtos`.
2. No topo da página, clique no botão **+ Novo Produto**.
3. O formulário de produto será aberto. Preencha os campos organizados por blocos:

#### Bloco 1: Identificação Principal
- **Nome / Descrição:** Nome completo do produto que sairá no cupom e na listagem. *Exemplo: Cimento CP II-E-32 Todas as Obras 50kg Votoran.* (Obrigatório).
- **Código Interno (SKU):** Código de controle próprio da loja. Se deixado em branco, o sistema gera automaticamente. *Exemplo: CIM-50KG-01.*
- **Código de Barras (EAN / GTIN):** Número do código de barras da embalagem (lido com leitor óptico ou digitado). Se o produto não possui código de barras de fábrica, marque a opção correspondente ou deixe vazio para usar o SKU interno.
- **Tipo de Item:** Selecione entre:
  - *Mercadoria / Aparelho (`device`):* Produto final de revenda.
  - *Peça de Reposição (`part`):* Item utilizado em manutenções e OS.
  - *Insumo / Suprimento (`supply`):* Material de consumo interno.
- **Condição do Item:** Selecione entre *Novo*, *Usado* ou *Recondicionado*.
- **Unidade de Medida:**
  - `UN (Unidade Inteira):` Venda por peça, pacote, caixa. Quantidades inteiras (1, 2, 3...).
  - `KG (Pesável / Balança):` Venda a granel por peso. Aceita até 3 casas decimais (ex: `1.450 kg`).

#### Bloco 2: Preços e Custos
- **Custo de Compra (R$):** Valor unitário pago ao fornecedor na última aquisição. *Exemplo: R$ 28,50.*
- **Preço de Venda Base (R$):** Valor cobrado do cliente no balcão / à vista. *Exemplo: R$ 42,00.*
- **Margem de Lucro (%):** O sistema calcula automaticamente a margem bruta sobre o custo.

#### Bloco 3: Controle Físico de Estoque
- **Quantidade em Estoque:** Saldo atual físico disponível na loja.
- **Estoque Mínimo:** Nível crítico de reposição. Quando o saldo atingir este valor, o produto entra na lista de alerta de compras.
- **Estoque Máximo Sugerido:** Teto de armazenamento para evitar excesso de capital parado.
- **Almoxarifado Padrão:** Selecione o local físico de estocagem (ex: *Loja Principal*, *Depósito Geral*).
- **Controlar Lote / Rastro:** Marque para rastrear lote de fabricação e data de validade (obrigatório para medicamentos, perecíveis e químicos).

#### Bloco 4: Classificação Fiscal & Fornecedor
- **Classificação Fiscal:** Selecione o grupo fiscal vinculado (NCM, CEST, CST de ICMS, PIS, COFINS e regras de IBS/CBS 2026+).
- **Fornecedor Habitual:** Selecione o fornecedor padrão cadastrado para reposição.

#### Bloco 5: Canais & Fotos
- **Exibir no Totem:** Marque se o produto deve aparecer no Totem de Autoatendimento.
- **Fotos do Produto:** Clique em **Adicionar Foto** para selecionar imagens do computador. As imagens são redimensionadas automaticamente e ficam disponíveis no PDV, Totem e OS.

4. Clique no botão superior **Salvar**.
5. O produto constará imediatamente na listagem, com badges coloridos de estoque e código.

### Ações na Tabela de Produtos (`CrudRowActions`):
Na coluna **Ações** de cada produto, você encontra 4 botões padronizados:
- 👁️ **Visualizar:** Abre a ficha cadastral do produto em modo somente-leitura.
- ✏️ **Editar:** Permite alterar qualquer campo e recalcular preços.
- 📋 **Duplicar:** Cria uma cópia exata do produto (útil para cadastrar itens semelhantes mudando apenas cor, tamanho ou voltagem).
- 🗑️ **Excluir:** Remove o produto com confirmação de segurança (não permite exclusão de itens com histórico fiscal registrado).

---

## 10. GESTÃO E CONTROLE FÍSICO DE ESTOQUE

O Marthi mantém rastreabilidade total das movimentações de estoque.

### Regras Fundamentais:
1. **Vendas no PDV (Normal ou com Campanha):** Diminuem imediatamente a quantidade em estoque do almoxarifado vinculado à loja ativa.
2. **Ordens de Serviço (OS):** Ao adicionar uma peça na bancada técnica da OS e aprová-la, a peça tem seu estoque baixado automaticamente.
3. **Venda Avulsa (`Alt+A`):** **NÃO movimenta estoque**, pois representa mão de obra ou serviços sem matéria-prima física controlada.
4. **Notas Fiscais de Entrada:** Ao importar ou lançar uma nota fiscal de entrada de fornecedor, o saldo de estoque é creditado e o custo médio é recalculado.

---

## 11. BALANÇO E INVENTÁRIO COM TRAVA DE SEGURANÇA

### Localização no Sistema:
> **Retaguarda → Estoque → Balanço** (rota `/erp/balanco`)

O Balanço de Estoque é a ferramenta para contagem física periódica das mercadorias da loja e ajuste de divergências (perdas, avarias ou sobras).

### Passo a Passo para Realizar um Balanço:
1. Acesse `/erp/balanco`.
2. Clique em **Iniciar Nova Contagem**.
3. Selecione a Loja e o Almoxarifado.
4. O sistema gera uma lista com todos os itens cadastrados.
5. Com um leitor de código de barras ou teclado, bipe ou digite a contagem física real de cada item na coluna **Qtd Contada**.
6. O sistema exibe em tempo real a coluna **Divergência**:
   - `0 (Verde):` Estoque físico bate perfeitamente com o sistema.
   - `Negativo (Vermelho):` Faltando no estoque físico (possível perda ou furto).
   - `Positivo (Azul):` Sobrando no estoque físico.
7. **Trava de Proteção:** Enquanto o balanço está com status *Em Andamento*, o sistema protege os registros contra alterações externas acidentais.
8. Após conferir todas as divergências, clique em **Aplicar Ajustes e Concluir**.
9. O sistema atualiza o saldo de todos os produtos instantaneamente e registra uma movimentação de auditoria do tipo *Inventário/Balanço*.

---

## 12. MOVIMENTAÇÕES DE ESTOQUE E ALMOXARIFADOS

### Localização no Sistema:
> **Retaguarda → Estoque → Movimentos** (rota `/erp/movimentos`)

### Lançando uma Movimentação Manual:
1. Acesse `/erp/movimentos` e clique em **+ Nova Movimentação**.
2. Selecione o **Tipo de Movimentação**:
   - *Entrada Avulsa:* Aquisição sem NF ou retorno de demonstração.
   - *Saída por Avaria / Perda:* Produto danificado ou vencido.
   - *Transferência entre Almoxarifados:* Move itens da Loja Principal para o Depósito Geral (ou vice-versa).
   - *Ajuste Manual de Saldo:* Correção administrativa.
3. Escolha o Produto, a Quantidade e o Almoxarifado de Origem/Destino.
4. Informe o **Motivo / Justificativa**.
5. Clique em **Confirmar Movimentação**. O extrato de movimentações exibirá a data, hora, operador responsável e novos saldos.

---

## 13. CADASTRO DE CLIENTES (PESSOA FÍSICA E JURÍDICA)

### Localização no Sistema:
> **Retaguarda → Pessoas → Clientes** (rota `/erp/clientes`)

### Passo a Passo para Cadastrar um Cliente:
1. Acesse `/erp/clientes` e clique em **+ Novo Cliente**.
2. Preencha os campos obrigatórios e complementares:
   - **Nome / Razão Social:** Nome do cliente ou empresa. (Obrigatório).
   - **CPF / CNPJ:** Documento oficial. O Marthi valida o algoritmo de dígitos verificadores e aceita o formato alfanumérico RFB 2026+.
   - **Telefone / WhatsApp:** Com código de área (ex: `(24) 99999-8888`). Permite disparo de mensagens direto do sistema.
   - **E-mail:** E-mail para envio automático de DANFE, orçamentos e comprovantes.
   - **Endereço Completo:** CEP (com busca automática), Logradouro, Número, Complemento, Bairro, Cidade e UF.
   - **Limite de Crédito para Venda a Prazo (R$):** Valor máximo autorizado para compras no crediário da loja.
   - **Observações:** Histórico de preferências ou restrições comerciais.
3. Clique em **Salvar Cliente**.

O cliente estará disponível imediatamente para seleção no PDV, Orçamentos, Ordens de Serviço e Notas Fiscais.

---

## 14. CADASTRO DE FORNECEDORES

### Localização no Sistema:
> **Retaguarda → Pessoas → Fornecedores** (rota `/erp/fornecedores`)

1. Acesse `/erp/fornecedores` e clique em **+ Novo Fornecedor**.
2. Preencha **Razão Social**, **Nome Fantasia**, **CNPJ**, **Inscrição Estadual**, **Telefone**, **E-mail de Compras** e **Cidade/UF**.
3. No campo **Notas**, registre condições comerciais acordadas (ex: *Faturamento 28 dias via boleto*).
4. Clique em **Salvar Fornecedor**.

---

## 15. FUNCIONÁRIOS E VENDEDORES (COMISSÕES)

O Marthi separa a gestão de colaboradores entre **Funcionários** (contrato, usuário e permissões) e **Vendedores** (metas e comissionamento de vendas).

### Cadastrando Vendedores e Comissões:
1. Acesse **Retaguarda → Pessoas → Vendedores** (`/erp/vendedores`).
2. Clique em **+ Novo Vendedor**.
3. Informe o Nome, E-mail, Telefone e o **Percentual de Comissão Base (%)** (ex: `2.5%`).
4. Clique em **Salvar**.
5. No PDV e nos Orçamentos, o vendedor pode ser selecionado para pontuar a comissão sobre os itens vendidos.

---

## 16. CAMPANHAS PROMOCIONAIS E DESCONTOS COMERCIAIS

O módulo de Campanhas do Marthi permite criar regras de preços inteligentes que são executadas **em tempo real pelo motor de cálculo do PDV**.

### Localização no Sistema:
> **Retaguarda → Produtos → Campanhas** (rota `/erp/campanhas`)

### Modalidades Reais de Campanhas Suportadas:
1. **Percentual de Desconto (`% Desconto`):** Aplica um abatimento percentual direto (ex: 10% OFF em tintas).
2. **Desconto Fixo em Reais (`R$ OFF Fixo`):** Desconto em dinheiro (ex: R$ 5,00 de desconto por unidade).
3. **Preço Promocional Especial (`Preço Especial`):** Define um valor final fechado temporário (ex: De R$ 45,00 por R$ 38,90).
4. **Faixas de Volume / Atacarejo (`Faixas de Volume`):** Preço escalonado por quantidade comprada:
   - *Exemplo de configuração:*  
     `3=100` (Ao comprar 3 unidades, o pacote sai por R$ 100,00)  
     `5=150` (Ao comprar 5 unidades, sai por R$ 150,00)
5. **Leve X Pague Y (`buy_x_pay_y`):** Promoção clássica de volume (ex: *Leve 3 Pague 2*).
6. **Brinde por Volume (`Brinde por Volume`):** Concede um produto de brinde ao atingir uma quantidade mínima de outro item.

### Passo a Passo para Criar uma Campanha:
1. Acesse `/erp/campanhas` e clique em **+ Nova Campanha**.
2. Preencha os campos da regra:
   - **Nome da Campanha:** Nome descritivo. *Exemplo: Festival da Construção - Cimento 10% OFF.*
   - **Tipo de Promoção:** Escolha a modalidade desejada no seletor.
   - **Regra de Valor:** Preencha a porcentagem, valor fixo ou faixas de volume conforme o tipo escolhido.
   - **Produtos Participantes:** Selecione se a promoção vale para:
     - *Todos os produtos de uma Categoria*
     - *Todos os produtos de uma Marca*
     - *Produtos específicos selecionados na lista*
   - **Quantidade Mínima:** Quantidade mínima no carrinho para ativar o desconto (ex: a partir de 5 unidades).
   - **Período de Vigência:** Data de Início e Data de Término.
   - **Prioridade de Aplicação:** Número inteiro (1 a 10). Se o produto participar de duas promoções, a de maior prioridade vence.
   - **Campanha Ativa:** Deixe marcado como `Sim`.
3. Clique em **Salvar Campanha**.

---

## 17. ORÇAMENTOS E PROPOSTAS COMERCIAIS

O módulo de Orçamentos permite gerar propostas completas com preços congelados, cálculo de campanhas e conversão em venda com 1 clique.

### Localização no Sistema:
> **Retaguarda → Produtos → Orçamentos** (rota `/erp/orcamentos`) ou **Painel → Vendas → Orçamentos**

### Criando um Orçamento:
1. Clique no botão **🛒 Abrir PDV / Novo Orçamento** ou acesse a gaveta de Orçamentos no Caixa.
2. Selecione o Cliente.
3. Adicione os produtos e informe as quantidades negociadas.
4. Clique em **Salvar como Orçamento** no rodapé do PDV.
5. Defina a validade (ex: 5 dias, 15 dias ou data fixa).
6. O orçamento recebe um número exclusivo (ex: `ORC-00104`) e entra com o status **Aberta / Em Negociação**.

### Imprimindo e Enviando a Proposta:
1. Na lista de orçamentos, localize a proposta e clique no botão **Imprimir / Compartilhar**.
2. O sistema gera a Proposta Comercial em PDF profissional contendo o logotipo da loja, dados do cliente, itens, formas de pagamento aceitas e termos de garantia.
3. Clique em **Enviar WhatsApp** para abrir o WhatsApp Web com texto formatado pronto para envio.

### Convertendo Orçamento em Venda no PDV:
1. No Caixa (`/caixa`), abra a gaveta **Orçamentos**.
2. Localize o orçamento pelo número ou nome do cliente.
3. Clique no botão **Converter para Venda**:
   - *Se o orçamento estiver dentro da validade:* O sistema transfere todos os itens para o carrinho mantendo os preços negociados.
   - *Se o orçamento estiver expirado:* O sistema pergunta se deseja atualizar para os preços vigentes de hoje ou manter os preços originais mediante senha de supervisor.
4. O carrinho é carregado imediatamente. Basta clicar em **Finalizar Venda** e receber o pagamento!

---

## 18. FRENTE DE CAIXA (PDV) - ABERTURA E OPERAÇÃO

O Caixa do Marthi (`/caixa`) é construído com tecnologia de alta disponibilidade.

### Abertura de Caixa (Início do Turno):
1. Ao acessar `/caixa`, se o terminal estiver fechado, a tela de **Abertura de Caixa** será exibida.
2. Confira a Loja e o Operador logado.
3. No campo **Fundo de Troco (Suprimento Inicial)**, digite o valor físico em dinheiro deixado na gaveta (ex: `R$ 150,00`).
4. Clique em **Confirmar Abertura de Caixa**.
5. O painel de vendas é liberado imediatamente.

---

## 19. VENDA NORMAL NO PDV PASSO A PASSO

### Exemplo Prático Real:
- **Cliente:** Balcão (Não identificado) ou João da Silva
- **Item:** 2 unidades de Cimento 50kg (R$ 42,00 cada = R$ 84,00)
- **Pagamento:** PIX

### Procedimento Passo a Passo:
1. **Adicionar o Produto:**
   - Com o cursor no campo de busca/código de barras, bipe o leitor ou digite o código/nome do produto e pressione `Enter`.
   - O item é adicionado ao carrinho na lateral direita.
2. **Alterar Quantidade (se necessário):**
   - Clique nos botões `+` / `-` no item do carrinho ou digite `2 * [Código do Produto]` no campo de busca.
3. **Identificar o Cliente (Opcional):**
   - Clique na barra superior de cliente para buscar por CPF, CNPJ ou Nome.
4. **Finalizar Venda:**
   - Clique no botão verde **Finalizar Venda (F2)** ou pressione a tecla de atalho `F2`.
5. **Escolher a Forma de Pagamento:**
   - No modal de pagamento, clique em **PIX**.
   - O sistema exibe o QR Code dinâmico do PIX para o cliente escanear no aplicativo bancário.
6. **Confirmar:**
   - Ao receber o comprovante ou confirmação, clique em **Confirmar Pagamento**.
7. **Emissão e Comprovante:**
   - O Marthi exibe o diálogo de conclusão, imprime o comprovante de venda ou transmite a NFC-e.
   - O caixa é limpo automaticamente para o próximo cliente.

---

## 20. VENDA COM APLICAÇÃO AUTOMÁTICA DE CAMPANHAS

### Exemplo Prático Real:
- **Produto:** Cimento 50kg (Preço Normal: R$ 40,00)
- **Campanha Ativa:** 10% de desconto para compras a partir de 10 unidades.
- **Venda Realizada:** 10 unidades.

### Comportamento no Sistema:
1. O operador adiciona 10 unidades do Cimento no carrinho.
2. O motor de cálculo do Marthi detecta imediatamente que a regra de volume foi atingida:
   - *Preço Original sem Desconto:* 10 x R$ 40,00 = R$ 400,00.
   - *Desconto Aplicado (10%):* - R$ 40,00.
   - *Valor Final a Pagar:* **R$ 360,00**.
3. No carrinho, o item recebe o badge destacado:  
   `🏷️ Campanha: 10% OFF Cimento 10un (-R$ 40,00)`.
4. O operador não precisa dar desconto manual: o sistema protege a margem da empresa aplicando apenas as regras homologadas pela gerência.

---

## 21. VENDA COM PRAZO DE PAGAMENTO (CREDIÁRIO)

### Exemplo Prático Real:
- **Cliente:** Construtora Triângulo Ltda (CNPJ 12.345.678/0001-90)
- **Valor da Venda:** R$ 1.500,00
- **Condição:** Faturado 30 dias (Boleto / Crediário da Loja)

### Procedimento Passo a Passo:
1. No PDV, **obrigatoriamente identifique o cliente** pesquisando pela Razão Social ou CNPJ.
2. Adicione os itens da venda no carrinho.
3. Clique em **Finalizar Venda (F2)**.
4. Nas formas de pagamento, selecione **A Prazo / Crediário**.
5. O sistema verifica o **Limite de Crédito** do cliente:
   - Se o cliente possuir limite suficiente e não tiver títulos vencidos, a venda é autorizada.
   - Se o limite for excedido, o sistema solicita autorização com senha do Gerente ou Administrador.
6. Escolha a condição de parcelamento (ex: *1x 30 dias* ou *3x 30/60/90 dias*).
7. Clique em **Confirmar Venda a Prazo**.
8. **Efeito no Sistema:**
   - A venda é concluída e o estoque é baixado.
   - No **Módulo Financeiro (`/erp/financeiro`)**, é gerado automaticamente um título em **Contas a Receber** com vencimento para 30 dias vinculado ao cliente.

---

## 22. VENDA AVULSA (SERVIÇO RÁPIDO SEM ESTOQUE)

### Quando Utilizar?
A Venda Avulsa é destinada a cobranças esporádicas de serviços, instalações ou itens de balcão sem cadastro prévio no almoxarifado (ex: *Instalação de torneira*, *Mão de obra rápida de bancada*, *Taxa de entrega emergencial*).

### Exemplo Prático Real:
- **Descrição:** Instalação de torneira
- **Valor:** R$ 80,00
- **Atalho no Teclado:** `Alt + A`

### Passo a Passo:
1. No Caixa (`/caixa`), pressione `Alt + A` ou clique no botão **+ Venda Avulsa**.
2. No modal que se abre, preencha:
   - **Descrição do Item / Serviço:** `Instalação de torneira`.
   - **Valor Unitário (R$):** `80,00`.
   - **Quantidade:** `1`.
3. Clique em **Adicionar ao Carrinho**.
4. O item entra no carrinho identificado com o ícone de serviço.
5. Finalize a venda normalmente escolhendo a forma de pagamento.
6. **Por que NÃO movimenta estoque?**  
   Porque o Marthi reconhece este lançamento como receita de serviço, creditando o caixa físico e o financeiro sem exigir código SKU nem debitar saldo de mercadorias.

> [!PERMISSÃO]
> **Controle de Acesso:** Apenas operadores autorizados com a permissão `posAdHocLaunch` podem lançar Venda Avulsa. A configuração e limites máximos de valor são definidos exclusivamente pelo Gerente em **Operações da Loja**.

---

## 23. CANCELAMENTOS, SANGRIA E SUPRIMENTO DE CAIXA

### Cancelamento de Item no Carrinho:
- Clique no ícone de **Lixeira** ao lado do item antes de fechar a venda. Se o operador não tiver permissão autônoma, o sistema exibirá o diálogo para o Gerente digitar sua senha.

### Cancelamento de Venda Concluída:
1. Acesse o menu lateral do caixa ou **Painel → Vendas → Consultar Vendas** (`/painel/pedidos`).
2. Localize a venda pelo número do cupom ou horário.
3. Clique em **Cancelar Venda**.
4. Informe o **Motivo do Cancelamento** (obrigatório, mínimo 15 caracteres para fins de auditoria).
5. O sistema estorna o valor do caixa, cancela a cobrança financeira e devolve as mercadorias automaticamente para o estoque físico.

### Sangria de Caixa (Retirada de Dinheiro):
- Utilizada para transferir excesso de dinheiro da gaveta para o cofre com segurança.
- Clique em **Menu do Caixa → Sangria**. Informe o valor e o destino do dinheiro. O sistema imprime o comprovante de sangria para assinatura do operador.

### Suprimento de Caixa (Entrada de Troco Adicional):
- Utilizado para reforçar moedas ou cédulas para troco durante o dia.
- Clique em **Menu do Caixa → Suprimento**. Informe o valor e confirme.

---

## 24. MÓDULO FISCAL - CONFIGURAÇÕES INICIAIS (CERTIFICADO A1 & CSC)

### Localização no Sistema:
> **Emissor Fiscal → Configuração** (rota `/fiscal/config`)

### Parâmetros Obrigatórios:
1. **Ambiente SEFAZ:**
   - *Homologação (Testes):* Para treinamento da equipe sem validade jurídica.
   - *Produção:* Para emissão fiscal oficial com validade perante a Receita Estadual.
2. **Certificado Digital A1 (.PFX):**
   - Faça o upload do arquivo do Certificado Digital A1 da empresa.
   - Digite a senha do certificado. O sistema valida a data de validade do certificado automaticamente.
3. **Código de Segurança do Contribuinte (CSC / Token NFC-e):**
   - Preencha o Identificador do CSC (ex: `000001`) e o Código CSC fornecido pela Secretaria de Fazenda do seu estado. Este dado é essencial para gerar o QR Code no cupom fiscal.
4. **Séries e Numeração:**
   - Série da NF-e (Modelo 55): geralmente `1`.
   - Série da NFC-e (Modelo 65): geralmente `1`.
   - Próximo número de nota fiscal a emitir.

---

## 25. EMISSÃO DE NF-E (ENTRADA, SAÍDA, DEVOLUÇÃO E TRANSFERÊNCIA)

### Localização no Sistema:
> **Painel → Emissor Fiscal → Notas Emitidas** (rota `/painel/notas` ou `/fiscal/nfe`)

### Modalidades de NF-e Suportadas no Marthi:
- **NF-e de Saída / Venda (Normal):** Faturamento comercial de produtos com destaque de impostos.
- **NF-e de Devolução:** Devolução de mercadoria para fornecedor ou de cliente.
  - *Campo Obrigatório:* **Chave de Acesso Referenciada (44 dígitos)** da nota original de compra/venda.
  - *CFOP Automático:* O sistema preenche com CFOPs de devolução (ex: 5202/6202 ou 5411/6411).
- **NF-e de Transferência entre Lojas:** Remessa de mercadorias entre matriz e filiais do mesmo grupo.
  - *Seleção de Filial:* Escolha a filial de destino no combobox. O sistema puxa automaticamente o CNPJ, IE e endereço da filial receptora e aplica os CFOPs 5152/6152.
- **NF-e de Bonificação, Doação ou Brinde:** Emissão com CFOP 5910/6910 sem cobrança financeira.
- **NF-e de Entrada (Emissão Própria):** Aquisição de produtor rural, devolução de pessoa física ou transporte.

### Passo a Passo de Emissão:
1. Acesse `/painel/notas` e clique em **+ Nova Nota Fiscal**.
2. Selecione o **Tipo de Nota** (Saída, Entrada, Devolução, Transferência ou Bonificação).
3. Selecione o Destinatário (Cliente, Fornecedor ou Filial).
4. Adicione os itens com suas respectivas classificações fiscais (NCM, CST, alíquotas).
5. Clique em **Validar & Transmitir SEFAZ**.
6. O Marthi monta o arquivo XML 4.00, assina digitalmente com o certificado A1 e realiza a transmissão.
7. Com a nota autorizada (Protocolo 100), clique em **Visualizar DANFE** para abrir o documento em PDF pronto para impressão ou clique em **Baixar XML**.

---

## 26. EMISSÃO DE NFC-E NO CAIXA

A emissão de NFC-e (Nota Fiscal de Consumidor Eletrônica) é integrada diretamente ao fechamento de venda no PDV:
1. No Caixa, ao finalizar a venda, marque a opção **Emitir NFC-e**.
2. Se o cliente solicitar CPF na nota, digite o CPF no campo apropriado.
3. Ao confirmar o pagamento, o sistema transmite a NFC-e para a SEFAZ em segundo plano.
4. O comprovante é impresso com o **QR Code da SEFAZ** para consulta no celular do consumidor.

---

## 27. EMISSÃO DE NFS-E (DPS NACIONAL)

### Localização no Sistema:
> **Emissor Fiscal → NFS-e** (rota `/fiscal/nfse`)

O Marthi é preparado para a emissão de Nota Fiscal de Serviços Eletrônica seguindo o padrão da **Declaração de Prestação de Serviço (DPS) do Emissor Nacional**:
1. Acesse `/fiscal/nfse`.
2. Clique em **Emitir NFS-e**.
3. Informe o Tomador do Serviço (Cliente), Código de Tributação Municipal / LC 116 e a descrição detalhada do serviço prestado.
4. Informe o valor bruto, retenções de ISS/PIS/COFINS (se aplicável).
5. Clique em **Transmitir NFS-e**.

---

## 28. ORDEM DE SERVIÇO (OS) - ABERTURA E TRIAGEM

O módulo de OS é ideal para assistências técnicas, oficinas mecânicas, reparos de eletrônicos e prestadores de serviço em geral.

### Passo a Passo para Abrir uma OS:
1. Acesse **OS → Nova OS** (`/os/nova`).
2. **Cliente:** Selecione o cliente ou faça o cadastro rápido no botão ao lado.
3. **Equipamento / Aparelho:**
   - Tipo de Aparelho (Smartphone, Notebook, Ferramenta, etc.).
   - Marca e Modelo (ex: *iPhone 13 128GB Azul*).
   - Número de Série / IMEI (se aplicável no ramo).
   - Senha de Desbloqueio (para realização de testes de bancada).
   - Estado Estético na Entrada (arranhões, trincados ou marcas de uso).
   - Acessórios Deixados (cabos, capinhas, fontes).
4. **Relato do Defeito:** Descreva a reclamação do cliente (ex: *Aparelho caiu no chão, tela trincada não dá imagem*).
5. **Checklist de Inspeção:** Marque os itens testados na bancada de entrada (Câmera, Conector de Carga, Alto-falante, Touch, Wi-Fi).
6. **Assinatura Digital do Cliente:** O cliente pode assinar diretamente na tela sensível ao toque ou mesa digitalizadora.
7. Clique em **Salvar e Abrir OS**. O sistema gera o comprovante de entrada com código de barras para colar no aparelho.

---

## 29. KANBAN DA OFICINA E ACOMPANHAMENTO TÉCNICO

### Localização no Sistema:
> **OS → Abrir Oficina** (rota `/os`)

O painel exibe um quadro Kanban visual intuitivo com as seguintes colunas oficiais:

```text
[ ABERTA ] → [ DIAGNÓSTICO ] → [ AGUARDANDO ] → [ EM SERVIÇO ] → [ REPROVADA ] → [ PRONTA ] → [ ENTREGUE ]
```

### Significado dos Status Oficiais:
- **Aberta (`open`):** Aparelho deu entrada na loja e aguarda fila da bancada.
- **Diagnóstico (`diagnosis`):** Técnico está analisando o defeito e orçando peças.
- **Aguardando (`waiting`):** Orçamento enviado aguardando aprovação do cliente ou aguardando chegada de peças do fornecedor.
- **Em Serviço (`progress`):** Reparo em execução efetiva na bancada (técnico pode acionar o cronômetro de tempo).
- **Reprovada (`reproved`):** Cliente não aprovou o valor do orçamento.
- **Pronta (`ready`):** Serviço concluído e aparelho testado, pronto para retirada.
- **Entregue (`delivered`):** Aparelho retirado pelo cliente com pagamento registrado e garantia ativada.

### Movimentando Cards:
O operador pode simplesmente **arrastar e soltar (drag and drop)** o card do chamado de uma coluna para outra ou clicar no chamado e alterar o status pelo menu superior.

---

## 30. OS DE GARANTIA E CERTIFICADO EM PDF

O Marthi possui um fluxo exclusivo para emissão e controle de garantia pós-serviço.

### Emitindo o Certificado de Garantia:
1. Abra os detalhes da OS concluída (`/os/:id`).
2. Clique no botão **🛡️ Termo de Garantia**.
3. O modal de garantia será aberto:
   - *Data de Início:* Puxa automaticamente a data de entrega do aparelho.
   - *Prazos Individuais:* Configure o prazo em dias para cada item (ex: 90 dias para a Peça / Tela e 90 dias para a Mão de Obra).
   - O sistema calcula e exibe a data final exata da cobertura.
4. Clique em **Baixar PDF do Certificado** ou **Enviar via WhatsApp**.
5. O documento impresso contém o **QR Code de Validação**, permitindo que o cliente ou atendente escaneie para consultar a validade da garantia a qualquer momento.

---

## 31. CARDÁPIO DIGITAL, MESAS E KDS DE COZINHA (FOOD)

Para clientes do ramo de alimentação e gastronomia:

### Gestão do Cardápio Digital (`/painel/cardapio`):
- Cadastro de pratos do dia, lanches, bebidas e sobremesas com fotos atraentes, preços e adicionais.
- Alternador de disponibilidade (ligar/desligar itens que esgotaram no dia).

### Display de Mesa para Impressão (`/painel/cardapio/imprimir`):
- Gera displays prontos para impressão em folha A4 ou acrílico de mesa contendo o QR Code exclusivo da loja. O cliente aponta a câmera do smartphone e acessa o cardápio interativo sem precisar instalar nenhum aplicativo.

### Gestão de Mesas e Salão (`/mesa`):
- Abertura de mesas por número ou comanda.
- Lançamento contínuo de pedidos.
- Fechamento da conta com divisão por pessoas.

### KDS da Cozinha (`/cozinha`):
- Tela de toque para os cozinheiros visualizarem os pedidos em tempo real por ordem de chegada, com botões para marcar pedidos *Em Preparo* e *Pronto*.

---

## 32. TOTEM DE AUTOATENDIMENTO

### Localização no Sistema:
> **Rota do Totem:** `/totem`  
> **Configurações do Totem:** `/painel/totem/config`

- Interface orientada ao toque desenvolvida para totens verticais ou tablets no balcão.
- O cliente escolhe produtos, personaliza ingredientes/adicionais e realiza o pagamento via PIX exibido na tela.
- O pedido entra automaticamente na fila do caixa e da cozinha.

---

## 33. E-COMMERCE E MARKETPLACES (HUB INTEGRADOR)

### Localização no Sistema:
> **Painel → E-commerce** (rota `/ecommerce` e `/ecommerce/conexoes`)

- **Canais Homologados no Hub:** Mercado Livre, Shopee, Tray E-commerce, Amazon e iFood.
- **Configuração de Conexão:** Cada canal possui sua tela de credenciais (App ID, Secret Key, Token de Acesso).
- **Sincronização:** Permite vincular os anúncios das lojas virtuais aos produtos físicos do estoque, unificando os saldos e evitando vendas sem estoque real.

---

## 34. CRM - GESTÃO DE LEADS E FUNIL DE VENDAS

### Localização no Sistema:
> **Painel → CRM → Abrir CRM** (rota `/crm`)

### Etapas do Funil de Vendas:
1. **Novos Leads (`leads`):** Contatos capturados pela homepage, WhatsApp ou cadastrados manualmente.
2. **Aguardando Retorno (`waiting`):** Lead qualificado aguardando resposta da proposta.
3. **Em Atendimento (`attending`):** Negociação ativa por vendedor responsável.
4. **Em Pagamento (`payment`):** Proposta aceita aguardando faturamento.
5. **Ganhos (`won`):** Contratos fechados que viraram clientes no ERP.
6. **Perdidos (`lost`):** Negócios não concretizados com registro do motivo.

> [!TIP]
> **Atribuição Exclusiva (Claim):** O vendedor clica em **Atender Lead (Claim)** para assumir o contato com exclusividade, evitando que dois vendedores abordem o mesmo cliente.

---

## 35. MÓDULO FINANCEIRO (CONTAS A PAGAR, RECEBER E DRE)

### Localização no Sistema:
> **Retaguarda → Financeiro** (rota `/erp/financeiro`)

### Contas a Receber:
- Títulos gerados automaticamente por vendas a prazo, crediário ou parcelamentos de OS.
- Ações: Dar Baixa / Liquidar título, Estornar, Renegociar vencimento.

### Contas a Pagar:
- Registro de despesas operacionais da loja (Aluguel, Energia, Salários, Boletos de Fornecedores).
- Previsão de desembolso mensal.

### Demonstrativo de Resultados (DRE & Fluxo de Caixa):
- Visualização de Receita Bruta, Deduções, Custo de Mercadorias Vendidas (CMV) e Lucro Líquido do período selecionado.

---

## 36. RELATÓRIOS E AUDITORIA

### Relatórios Gerenciais (`/erp/relatorios`):
- Relatório de Vendas por Período, Operador e Forma de Pagamento.
- Curva ABC de Produtos mais vendidos e lucrativos.
- Relatório de Peças e Serviços mais demandados na assistência técnica.
- Relatório de Comissões de Vendedores.

### Trilha de Auditoria (`/erp/auditoria`):
- Registro detalhado de logs: quem fez login, quem cancelou vendas, quem alterou preços de produtos e quem realizou movimentações manuais de estoque, com data, hora e IP.

---

## 37. GUIA POR PERFIL DE USUÁRIO

### Para o Administrador da Loja:
- Configure lojas, licenças, regras tributárias e permissões de funcionários.
- Monitore relatórios consolidados de vendas, DRE financeiro e auditoria.

### Para o Operador de Caixa:
- Abra o caixa no início do turno informando o fundo de troco.
- Execute vendas com agilidade pelo leitor de código de barras ou atalhos de teclado.
- Aplique campanhas e consulte orçamentos para conversão em venda.
- Efetue o fechamento de caixa e conferência cega ao término do turno.

### Para o Técnico de Assistência Técnica:
- Consulte as OS na coluna *Diagnóstico* do Kanban.
- Registre laudo técnico, aponte peças do estoque utilizadas e acione o cronômetro de bancada.
- Ao finalizar, mova para *Pronta* e emita o Certificado de Garantia.

### Para o Vendedor:
- Atenda leads no CRM, elabore Orçamentos e envie propostas em PDF com link no WhatsApp.
- Acompanhe suas metas e comissões acumuladas no painel de vendedores.

---

## 38. SOLUÇÃO DE DÚVIDAS E PROBLEMAS FREQUENTES (FAQ OPERACIONAL)

### P: O que fazer se o leitor de código de barras não encontrar o produto?
**R:** Verifique se o produto está cadastrado e ativo em **Retaguarda → Produtos**. Se o código de barras cadastrado tiver zeros à esquerda, certifique-se de que o leitor óptico está configurado para ler todos os dígitos ou digite o nome do produto no campo de pesquisa.

### P: Como cancelar uma venda após o cupom ter sido impresso?
**R:** Acesse **Painel → Vendas → Consultar Vendas**, localize o pedido e clique em **Cancelar Venda**. Digite a justificativa com mais de 15 caracteres. O sistema estornará o financeiro e devolverá as peças ao estoque.

### P: Como trocar de filial ativa no sistema?
**R:** No cabeçalho superior de qualquer tela, clique no **ícone de Loja** (ao lado do logo do Marthi) e clique sobre a filial desejada.

### P: Por que uma Venda Avulsa não diminuiu o estoque?
**R:** Porque a Venda Avulsa (`Alt+A`) é projetada para serviços, taxas ou cobranças rápidas de mão de obra sem mercadoria física associada. Para vendas que movimentam estoque físico, cadastre o produto previamente em `/erp/produtos`.

### P: Como imprimir a proposta comercial de um orçamento em PDF?
**R:** Em **Orçamentos**, clique no botão **Imprimir / Compartilhar** da proposta. O PDF formatado com o logotipo da sua loja será gerado instantaneamente para download ou envio por e-mail/WhatsApp.

---

## 39. GLOSSÁRIO DE TERMOS DO MARTHI

- **Almoxarifado:** Espaço físico onde as mercadorias ficam armazenadas (ex: Loja Física, Depósito Fechado).
- **Balanço / Inventário:** Processo de contagem física dos produtos da loja para confronto com o saldo do sistema.
- **CSC (Código de Segurança do Contribuinte):** Código alfanumérico fornecido pela SEFAZ para autenticar o QR Code da NFC-e.
- **DRE:** Demonstrativo do Resultado do Exercício (relatório contábil de receitas, custos e lucro líquido).
- **EAN / GTIN:** Código de barras comercial padrão internacional de 13 dígitos impresso nas embalagens.
- **KDS (Kitchen Display System):** Sistema visual de pedidos na tela para a equipe da cozinha de restaurantes.
- **NFC-e:** Nota Fiscal de Consumidor Eletrônica (modelo 65), que substitui o cupom fiscal tradicional de balcão.
- **NF-e:** Nota Fiscal Eletrônica (modelo 55), utilizada para vendas entre empresas, faturamento com frete, transferências e devoluções.
- **NFS-e:** Nota Fiscal de Serviços Eletrônica, emitida para documentar a prestação de serviços e retenções municipais.
- **Ordem de Serviço (OS):** Documento formal de entrada de um equipamento para conserto, contendo histórico, laudos, peças e garantia.
- **PDV:** Ponto de Venda ou Frente de Caixa.
- **Sangria:** Retirada de dinheiro da gaveta do caixa durante o expediente para guarda no cofre.
- **SKU (Stock Keeping Unit):** Código identificador único interno de cada mercadoria no catálogo da loja.
- **Suprimento:** Entrada de dinheiro na gaveta do caixa destinada a troco.
- **Venda Avulsa:** Lançamento rápido de serviço ou valor no PDV sem débito de estoque físico.

---
*Marthi Tecnologia — Plataforma de Gestão Comercial e Operacional Inteligente.*  
*Todos os direitos reservados.*
