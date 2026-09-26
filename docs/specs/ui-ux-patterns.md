# Especificação Técnica de Padrões UI/UX — Marthi

Este documento detalha os padrões de interface, componentes centrais, responsividade e regras de estilização que devem ser rigorosamente seguidos em todas as telas do sistema Marthi.

---

## 1. Paridade de Temas: Claro e Escuro

O sistema suporta alternância dinâmica entre Tema Claro e Tema Escuro. O tema escuro é ativado adicionando a classe `.is-theme-dark` ou `.admin--dark` no elemento raiz da aplicação ou layout.

### 1.1 Variáveis Semânticas Globais
Nunca utilize valores hexadecimais brutos para fundos ou textos em componentes compartilhados. Utilize as variáveis CSS do design system:

| Token Semântico | Tema Claro | Tema Escuro | Finalidade |
|-----------------|------------|-------------|------------|
| `--surface` | `#f8fafc` | `#0f141a` | Fundo principal da página e do shell |
| `--card` | `#ffffff` | `#171e27` | Cartões principais, seções e modais |
| `--card-2` | `#f1f5f9` | `#1c2430` | Cards aninhados, barras secundárias e hover |
| `--ink` | `#0f172a` | `#e8eef4` | Texto primário, títulos e valores em destaque |
| `--mute` | `#64748b` | `#94a3b8` | Texto secundário, legendas, placeholders |
| `--line` | `#e2e8f0` | `rgba(148, 163, 184, 0.22)` | Bordas de cards, tabelas e divisores |
| `--accent` | `#0f766e` | `#2dd4bf` | Cor de destaque primária / ação |

### 1.2 Regra de Implementação CSS
Sempre que criar um arquivo CSS para um módulo ou página, garanta que todos os elementos adaptem-se a ambos os temas:
```css
/* Card padrão */
.meu-card {
  background: var(--card, #ffffff);
  border: 1px solid var(--line, #e2e8f0);
  color: var(--ink, #0f172a);
}

.is-theme-dark .meu-card,
.admin--dark .meu-card {
  background: var(--card, #171e27);
  border-color: rgba(255, 255, 255, 0.08);
  color: var(--ink, #e8eef4);
}
```

---

## 2. Padrão de Combobox (`AdminPicker`)

Tags `<select>` nativas do HTML são **proibidas** em telas operacionais. Elas geram inconsistências estéticas entre navegadores e bugs visuais com setas repetidas (`vvvvvvvv`) sob temas escuros no Chromium.

### 2.1 Uso Obrigatório do `AdminPicker`
Importação:
```tsx
import { AdminPicker } from '../../components/AdminPicker';
```

Exemplo em Formulário com Rótulo Superior:
```tsx
<AdminPicker
  label="Local / Estoque"
  value={warehouseId}
  options={[
    { value: '', label: 'Loja Principal' },
    { value: 'wh-1', label: 'Depósito A (DepA)' },
  ]}
  onChange={(val) => setWarehouseId(val)}
/>
```

Exemplo Compacto (para Toolbars ou Tabelas):
```tsx
<div style={{ minWidth: '180px' }}>
  <AdminPicker
    compact
    label="Situação"
    value={status}
    options={[
      { value: 'all', label: 'Todos' },
      { value: 'active', label: 'Ativos' },
      { value: 'inactive', label: 'Inativos' },
    ]}
    onChange={(val) => setStatus(val)}
  />
</div>
```

---

## 3. Padrão de Ações em Grids / Tabelas (CRUD Completo)

Toda tela que exibir dados tabulares deve seguir o padrão consolidado do **Cadastro de Produtos** (`apps/web/src/pages/admin/StockPage.tsx`).

### 3.1 Botões de Ação Padronizados (`CrudRowActions`)
Importação:
```tsx
import { CrudNameButton, CrudRowActions, confirmDelete } from '../../components/CrudKit';
```

A coluna de ações deve ser a última coluna da tabela e fornecer as 4 operações:
1. **Visualizar (`onView`):** Abre a visualização em modo somente leitura ou auditoria.
2. **Editar (`onEdit`):** Abre o formulário ou gaveta de edição do registro.
3. **Duplicar (`onDuplicate`):** Clona os dados do item selecionado para criar um novo registro ágil.
4. **Excluir (`onDelete`):** Exclui o item solicitando confirmação explícita (`confirmDelete`).

Exemplo de Tabela Completa:
```tsx
<div className="admin-table-container">
  <table className="admin-table">
    <thead>
      <tr>
        <th>Código</th>
        <th>Nome</th>
        <th>Quantidade</th>
        <th className="admin-table__actions" style={{ textAlign: 'center', width: '130px' }}>
          Ações
        </th>
      </tr>
    </thead>
    <tbody>
      {items.map((item) => (
        <tr key={item.id}>
          <td>
            <CrudNameButton onClick={() => openView(item)}>
              <strong>{item.code}</strong>
            </CrudNameButton>
          </td>
          <td>
            <CrudNameButton onClick={() => openView(item)}>
              {item.name}
            </CrudNameButton>
          </td>
          <td>{item.qty}</td>
          <td className="admin-table__actions" onClick={(e) => e.stopPropagation()}>
            <CrudRowActions
              onView={() => openView(item)}
              onEdit={() => openEdit(item)}
              onDuplicate={() => handleDuplicate(item)}
              onDelete={() => handleDelete(item)}
            />
          </td>
        </tr>
      ))}
    </tbody>
  </table>
</div>
```

---

## 4. Responsividade e Suporte Mobile

Todas as telas devem redimensionar com fluidez para operar perfeitamente em smartphones:

### 4.1 Envolvimento de Tabelas
- Toda `<table>` deve estar dentro de `<div className="admin-table-container">` ou `.admin-table-wrap`.
- O container aplica:
  ```css
  .admin-table-container {
    width: 100%;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: thin;
  }
  ```

### 4.2 Toolbars e Filtros
- Utilize sempre `display: flex; flex-wrap: wrap; gap: 10px;`.
- Os campos de busca devem ter `flex: 1 1 200px;`.
- Em `@media (max-width: 768px)`, botões primários e ações de formulário devem ocupar `width: 100%;` para facilitar o toque na tela.

### 4.3 Breakpoints Padrão
- **Desktop:** > 1024px.
- **Tablet:** `<= 768px` — Grids de indicadores reduzem para 2 colunas; formulários empilham colunas duplas.
- **Mobile (Smartphones):** `<= 480px` — Indicadores em 1 coluna (`1fr`); padding de cards reduzido para 12px; modais ocupam `max-width: 96vw;`.

---

## 5. Checklist para Novas Implementações
Antes de finalizar qualquer tela ou componente novo:
- [ ] O componente foi verificado no Tema Claro e no Tema Escuro?
- [ ] Nenhum `<select>` nativo foi utilizado (apenas `<AdminPicker>`)?
- [ ] A tela se adapta a viewports móveis (360px–480px)?
- [ ] Toda tabela possui `<CrudRowActions>` com Visualizar, Editar, Duplicar e Excluir?
- [ ] O container da tabela possui rolagem horizontal suave sem quebrar a largura da página?
