/**
 * Canonical UI primitives — re-exports only.
 * Implementations stay in `apps/web/src/components/` so existing deep imports keep working.
 * New screens should import from `@/design-system` (or `../design-system`) so token/component
 * fixes propagate without hunting every file.
 */

/* Combobox — never use native <select> in panel UI */
export { AdminPicker, type AdminPickerOption } from '../../components/AdminPicker';

/* Icons */
export { AdminIcon, type AdminIconName } from '../../components/AdminIcons';

/* CRUD list / row actions */
export {
  CrudListBar,
  CrudIconButton,
  CrudRowActions,
  CrudNameButton,
  CrudSelectionBar,
  crudFormTitle,
  matchesQuery,
  matchesStatus,
  confirmDelete,
  confirmDeleteMany,
  toggleIdInSet,
  setAllVisibleIds,
  type CrudStatusFilter,
} from '../../components/CrudKit';

/* Sticky heading actions (Salvar / Cancelar / Novo / Editar / nav) */
export {
  InlineHeadingActions,
  PageHeadingActions,
  HeadingSaveButton,
  HeadingCancelButton,
  HeadingNewButton,
  HeadingEditButton,
  HeadingFormActions,
  HeadingRecordNav,
} from '../../components/PageHeadingActions';

/* Page back stack + discreet Voltar */
export {
  PageBackProvider,
  RegisterPageBack,
  usePageBackHandler,
  usePageBackHandlerState,
} from '../../components/pageBack';
export { ScreenBackButton } from '../../components/ScreenBackButton';

/* Workspace hub (tabs) */
export { HubPage, type HubTab } from '../../components/HubPage';

/* Theme + confirms */
export { PanelThemeToggle } from '../../components/PanelThemeToggle';
export { ConfirmDialog, type ConfirmDialogProps } from '../../components/ConfirmDialog';

/* Apps / bento grid launcher (Painel + Retaguarda) */
export { AppsGridMenu, type AppsGridItem } from '../../components/AppsGridMenu';
export { PanelAppsMenu } from '../../components/PanelAppsMenu';
export { ErpAppsMenu } from '../../components/ErpAppsMenu';
