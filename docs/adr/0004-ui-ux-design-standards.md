# ADR 0004 — Padrões Visuais, Tema Claro/Escuro, Comboboxes e Ações CRUD em Grids

- **Status:** Accepted  
- **Date:** 2026-09-26  
- **Deciders:** MarthiTec (Matheus), Antigravity AI  

## Context

O sistema Marthi possui múltiplos módulos integrados (ERP, Ordem de Serviço, PDV/Caixa, CRM, Fiscal, E-commerce, Totem) que necessitam de consistência visual, funcional e comportamental rigorosa.

Durante a evolução das telas do sistema, foram identificados pontos recorrentes de divergência:
1. Telas que funcionavam em tema claro mas quebravam no tema escuro (ex.: cards com background `#ffffff` estático gerando blocos brancos ofuscantes em tema escuro, e fontes escuras `#0f172a` ilegíveis sobre fundos escuros).
2. Uso de tags `<select>` nativas do HTML, que além de fugirem da identidade visual do sistema geram bugs de renderização no Chromium (como setas SVG repetidas `vvvvvvvv` em seletores estilizados com cores escuras).
3. Telas e toolbars que não dimensionavam adequadamente em smartphones e tablets, quebrando a largura e impedindo o uso em dispositivos móveis.
4. Tabelas/grids com ações heterogêneas ou botões isolados de texto, em vez de seguir o padrão do Catálogo de Produtos (`StockPage.tsx`).

## Decision

Fica estabelecido como **regra de arquitetura e padrão obrigatório** para qualquer tela nova ou refatoração no ecossistema Marthi:

### 1. Paridade Obrigatória de Temas (Claro e Escuro)
- Toda implementação de tela ou componente deve ser projetada e testada **obrigatoriamente no Tema Claro e no Tema Escuro** (`.is-theme-dark` e `.admin--dark`).
- É proibido utilizar cores fixas em inline-styles (`background: #ffffff`, `#f8fafc`, `color: #0f172a`, `#334155`) sem as devidas regras e variáveis de tema.
- Devem ser consumidos os tokens semânticos do sistema definidos em `operatorThemeDark.css`:
  - `--surface`: Fundo principal da página.
  - `--card` / `--card-2`: Superfície de cartões, painéis e formulários.
  - `--ink`: Cor de texto primária.
  - `--mute`: Cor de texto secundária/metadados.
  - `--line`: Cor de bordas e divisores.
- Para cards específicos de módulos, deve ser assegurada a regra correspondente sob `.is-theme-dark` e `.admin--dark`.

### 2. Combobox Padronizado (`AdminPicker`)
- **É terminantemente proibido o uso de `<select>` nativo do HTML** em telas de cadastro, filtros, configurações e formulários.
- Todo combobox/dropdown deve utilizar o componente padronizado `<AdminPicker>` (`apps/web/src/components/AdminPicker.tsx`).
- O `AdminPicker` garante:
  - Estilização completa e harmoniosa em tema claro e escuro.
  - Busca automática (`searchable`) quando houver mais de 7 itens.
  - Suporte a teclado (Esc para fechar, navegação) e clique externo.
  - Ícones, legendas (`hint`) e opções desabilitadas.

### 3. Responsividade Mobile Nativa (Smartphones e Tablets)
- As telas do sistema devem ser **totalmente responsivas**, operando perfeitamente desde telas móveis (360px–480px) até monitores ultrawide.
- Regras de responsividade:
  - Toolbars e cabeçalhos de ação devem utilizar `flex-wrap: wrap` com `gap` padronizado.
  - Campos de entrada e pickers devem usar larguras flexíveis (`flex: 1 1 240px;`).
  - Todas as tabelas e grids devem ser envolvidas por container com rolagem horizontal suave (`.admin-table-container` com `overflow-x: auto; -webkit-overflow-scrolling: touch;`).
  - Em telas menores que 768px, botões operacionais e ações de formulário devem se empilhar ou expandir para largura completa, garantindo área de toque mínima confortável (44px).
  - Cards de indicadores e métricas devem adotar `grid-template-columns: repeat(2, 1fr)` em tablets e `1fr` em celulares.

### 4. Ações Padronizadas em Grids/Tabelas (CRUD Completo)
- Toda tela que possuir listagem, grid ou tabela de registros deve seguir o padrão visual consolidado do **Cadastro de Produtos** (`apps/web/src/pages/admin/StockPage.tsx`).
- A coluna de ações deve conter o componente `<CrudRowActions>` (`apps/web/src/components/CrudKit.tsx`) com os quatro botões padronizados:
  - **Visualizar (`onView`):** Abre a visualização/consulta detalhada do registro.
  - **Editar (`onEdit`):** Abre o formulário ou modal de edição dos dados.
  - **Duplicar (`onDuplicate`):** Cria um novo registro clonado a partir dos dados do item existente.
  - **Excluir (`onDelete`):** Executa a exclusão com diálogo de confirmação (`confirmDelete`).
- A coluna de nome/código principal deve utilizar `<CrudNameButton>` para que o clique no nome também abra a visualização do registro.

## Consequences

### Positivas
- Experiência do usuário (UX) coesa, previsível e profissional em todos os módulos da plataforma.
- Zero quebras visuais ao alternar entre tema claro e tema escuro.
- Acessibilidade e ergonomia garantidas tanto no desktop quanto no celular.
- Facilidade de manutenção e aceleração no desenvolvimento de novas telas com padrões reutilizáveis.

### Negativas / Recomendações
- Exige validação em ambos os temas (`.is-theme-dark` ativado/desativado) e teste em viewport mobile antes de submeter alterações.

## References

- Componente: `apps/web/src/components/AdminPicker.tsx`
- Componente: `apps/web/src/components/CrudKit.tsx`
- Tema Escuro Base: `apps/web/src/styles/operatorThemeDark.css`
- Referência de Grid CRUD: `apps/web/src/pages/admin/StockPage.tsx`
- Implementação de Referência: `apps/web/src/pages/erp/StockBalancePage.tsx`
