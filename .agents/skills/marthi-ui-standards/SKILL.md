---
name: marthi-ui-standards
description: >-
  Regras e padrões visuais obrigatórios para telas do Marthi (ERP, OS, PDV, Fiscal, CRM).
  Use SEMPRE que criar ou alterar telas, componentes, formulários, tabelas ou filtros para
  garantir: tema claro e escuro (.is-theme-dark), uso de AdminPicker em vez de select nativo,
  responsividade mobile (telas pequenas/celular), e ações CRUD completas em grids
  (Visualizar, Editar, Duplicar, Excluir via CrudRowActions).
---

# Padrões Visuais e Arquitetura UI/UX do Marthi

Este guia é a especificação obrigatória para qualquer tela ou componente desenvolvido no sistema Marthi. Toda implementação nova ou manutenção deve aderir a estes quatro pilares fundamentais.

---

## 1. Paridade de Temas: Claro e Escuro (`.is-theme-dark` / `.admin--dark`)

Todo componente e tela deve funcionar harmoniosamente tanto no **Tema Claro** quanto no **Tema Escuro**.

### Regras Mandatórias:
1. **Nunca use cores estáticas em inline-styles**:
   - ❌ `style={{ background: '#ffffff', color: '#0f172a' }}` (causa blocos brancos ofuscantes no tema escuro).
   - ❌ `style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}` (ilegível ou estourado no tema escuro).
2. **Consuma os Tokens Semânticos do Marthi**:
   - `var(--surface)`: Superfície de fundo da página (`#0f141a` no escuro).
   - `var(--card)`: Superfície de cards e painéis (`#171e27` no escuro).
   - `var(--card-2)`: Superfície secundária/aninhada (`#1c2430` no escuro).
   - `var(--ink)`: Texto primário (`#e8eef4` no escuro).
   - `var(--mute)`: Texto secundário/cinza (`#94a3b8` no escuro).
   - `var(--line)`: Bordas e divisores (`rgba(148, 163, 184, 0.22)` no escuro).
   - `var(--accent)`: Destaques primários (`#2dd4bf` no escuro).
3. **Regra de Estilização em CSS**:
   Sempre implemente a regra base e o override escuro:
   ```css
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

## 2. Combobox Padronizado (`AdminPicker`)

Tags `<select>` nativas do HTML são **terminantemente proibidas** em telas do sistema.
No Chromium/WebKit, `<select>` gera setas SVG repetidas (`vvvvvvvv`) e falhas de layout.

### Regra Mandatória:
Todo dropdown, combobox ou seletor de opções deve utilizar `<AdminPicker>`:

```tsx
import { AdminPicker } from '../../components/AdminPicker';

// Exemplo com label visível superior
<AdminPicker
  label="Local / Estoque"
  value={warehouseId}
  options={[
    { value: '', label: 'Loja / Estoque Principal' },
    { value: 'wh-1', label: 'Depósito Geral (DEP1)' },
  ]}
  onChange={(val) => setWarehouseId(val)}
/>

// Exemplo compacto (ótimo para toolbars e cabeçalhos de tabela)
<div style={{ minWidth: '180px' }}>
  <AdminPicker
    compact
    label="Situação"
    value={statusFilter}
    options={[
      { value: 'all', label: 'Todos' },
      { value: 'active', label: 'Ativos' },
      { value: 'inactive', label: 'Inativos' },
    ]}
    onChange={(val) => setStatusFilter(val)}
  />
</div>
```

---

## 3. Responsividade Mobile Nativa

Todas as telas devem redimensionar e funcionar em celulares (360px–480px), tablets (768px) e desktops:

### Regras Mandatórias:
1. **Container de Tabela Obrigatório**:
   Toda tabela deve estar envolvida em `<div className="admin-table-container">`. Isso garante rolagem horizontal suave no celular sem quebrar a largura da página.
2. **Toolbars e Barras de Filtro Flexíveis**:
   Use `display: flex; flex-wrap: wrap; gap: 10px;`. Campos de pesquisa recebem `flex: 1 1 200px;`.
3. **Empilhamento Mobile (`@media (max-width: 768px)`)**:
   - Botões principais de formulários recebem `width: 100%` para clique com o polegar.
   - Indicadores / métricas dividem-se em 2 colunas em tablets e 1 coluna em celulares (`<= 480px`).
   - Modais ocupam `max-width: 96vw; max-height: 94vh;` com padding ajustado.

---

## 4. Grids com Padrão CRUD Completo (`CrudRowActions`)

Toda tela contendo grid ou tabela de listagem deve replicar o padrão consolidado do **Cadastro de Produtos** (`apps/web/src/pages/admin/StockPage.tsx`):

### 4 Ações Obrigatórias:
1. **Visualizar (`onView`):** Abre a consulta/detalhes.
2. **Editar (`onEdit`):** Abre a edição do registro.
3. **Duplicar (`onDuplicate`):** Clona ou inicia novo item com base no selecionado.
4. **Excluir (`onDelete`):** Remove o item com confirmação (`confirmDelete`).

### Código Padrão na Tabela:
```tsx
import { CrudNameButton, CrudRowActions, confirmDelete } from '../../components/CrudKit';

// Na tabela:
<thead>
  <tr>
    <th>Código</th>
    <th>Identificação</th>
    <th>Valor</th>
    <th className="admin-table__actions" style={{ textAlign: 'center', width: '130px' }}>
      Ações
    </th>
  </tr>
</thead>
<tbody>
  {items.map((item) => (
    <tr key={item.id}>
      <td>
        <CrudNameButton onClick={() => handleView(item)}>
          <strong className="stock-inv-badge-code">{item.code}</strong>
        </CrudNameButton>
      </td>
      <td>
        <CrudNameButton onClick={() => handleView(item)}>
          <strong>{item.name}</strong>
        </CrudNameButton>
      </td>
      <td>{item.price}</td>
      <td className="admin-table__actions" onClick={(e) => e.stopPropagation()}>
        <CrudRowActions
          onView={() => handleView(item)}
          onEdit={() => handleEdit(item)}
          onDuplicate={() => handleDuplicate(item)}
          onDelete={() => handleDelete(item)}
        />
      </td>
    </tr>
  ))}
</tbody>
```

---

## Checklist de Validação Antes de Commitar:
- [ ] Testou com `.is-theme-dark` / tema escuro ativado? (Sem blocos brancos, contrastes perfeitos)
- [ ] Testou com tema claro?
- [ ] Algum `<select>` foi usado? Se sim, substitua por `<AdminPicker>`.
- [ ] Redimensionou para largura mobile (360px a 480px)?
- [ ] As tabelas estão dentro de `.admin-table-container`?
- [ ] A tabela possui `<CrudRowActions>` com Visualizar, Editar, Duplicar e Excluir?
