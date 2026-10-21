# Marthi Design System (web)

Central hub for **tokens** and **shared UI primitives** used by the lojista panel and module apps (`apps/web`).

## Goals

- One import path so changes to buttons, fonts, fields, combobox, colors, and spacing can propagate.
- Reuse what already exists — do **not** invent a parallel theme or clone Caixa onto every screen.
- Preserve light/dark (`.is-theme-dark` / `.admin--dark`), `AdminPicker`, `HeadingFormActions`, `CrudRowActions`, and PageBack patterns.

## Import

```ts
import {
  AdminPicker,
  CrudRowActions,
  HeadingFormActions,
  ScreenBackButton,
  colorTokens,
  space,
} from '../../design-system';
```

Deep imports into `src/components/…` still work (backward compatible). Prefer this hub for **new** code and for gradual migrations.

## Tokens

| Token | CSS var | Role |
|---|---|---|
| surface | `--surface` | Page background |
| card / card-2 | `--card` / `--card-2` | Panels |
| ink / mute | `--ink` / `--mute` | Text |
| line | `--line` | Borders |
| accent | `--accent` | Primary action (module may override) |

Live values live in `styles/global.css` and module shells (`admin.css`, `caixa.css`, …). The TS maps in `tokens/` point at those vars — they do not redefine a purple/marketing theme.

Dark theme: always support `.is-theme-dark` and `.admin--dark`. Never hardcode light-only hex in inline styles.

## Canonical primitives

| Need | Export |
|---|---|
| Combobox | `AdminPicker` (never native `<select>`) |
| Grid row actions | `CrudRowActions` (+ `confirmDelete`) |
| Sticky form actions | `HeadingFormActions` / `PageHeadingActions` |
| Voltar / ficha back | `ScreenBackButton`, `RegisterPageBack`, `PageBackProvider` |
| Icons | `AdminIcon` |
| Workspace tabs | `HubPage` |

## Quality bar

**Caixa** is the visual/UX reference for density and polish. Raise other modules toward that quality **without** cloning Caixa layout or business flows.

## Out of scope (this foundation)

- Mass migration of every screen
- Changing routes, permissions, or business logic
- Rebuilding modules or menus
- Storybook (no existing pattern — skip)

## Related docs

- Project store: `docs/design-system-marthi.md`
- UI skill: `.cursor/skills/marthi-ui-standards/SKILL.md`
- UX reorg (sibling): `docs/reorganizacao-ux-sistema.md`
- Visual audit (sibling): `docs/auditoria-visual-modulos.md`
