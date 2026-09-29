import { getPanelTheme, syncThemeForProfile, type PanelTheme } from './panelThemeStore';

function storageKeyForUser(email?: string): string {
  const norm = email?.trim().toLowerCase();
  return norm ? `marthi.operator.profile:${norm}` : 'marthi.operator.profile';
}

export const PROFILE_EVENT = 'marthi-profile-updated';

export type OperatorProfile = {
  displayName: string;
  /** Cargo/função — o próprio usuário não altera sem senha de gerente. */
  role: string;
  photo: string | null;
  email: string;
  phone: string;
  address: string;
  /** Tema da operação — segue este perfil em todos os apps. */
  theme: PanelTheme;
};

const DEFAULT_ROLE = 'Operador';

let memoryProfile: OperatorProfile | null = null;

function fallbackTheme(): PanelTheme {
  try {
    const raw = localStorage.getItem('marthi.panel.theme.v1');
    if (raw === 'dark' || raw === 'light') return raw;
  } catch {
    /* ignore */
  }
  return 'light';
}

function emptyProfile(
  fallbackName: string,
  fallbackEmail = '',
  defaultRole = DEFAULT_ROLE,
): OperatorProfile {
  return {
    displayName: fallbackName,
    role: defaultRole,
    photo: null,
    email: fallbackEmail,
    phone: '',
    address: '',
    theme: fallbackTheme(),
  };
}

function normalizeProfile(
  partial: Partial<OperatorProfile>,
  fallbackName: string,
  fallbackEmail = '',
  defaultRole = DEFAULT_ROLE,
): OperatorProfile {
  const normEmail = partial.email?.trim() || fallbackEmail;
  const isMock = normEmail === 'teste@marthi.com.br' && fallbackEmail && fallbackEmail !== 'teste@marthi.com.br';
  const roleRaw = partial.role?.trim();
  const effectiveRole =
    !roleRaw || (roleRaw === 'Operador' && defaultRole === 'Administrador')
      ? defaultRole
      : roleRaw;

  return {
    displayName: isMock ? fallbackName : partial.displayName?.trim() || fallbackName,
    role: effectiveRole,
    photo: partial.photo?.trim() || null,
    email: isMock ? fallbackEmail : normEmail,
    phone: partial.phone?.trim() || '',
    address: partial.address?.trim() || '',
    theme: partial.theme === 'dark' || partial.theme === 'light' ? partial.theme : fallbackTheme(),
  };
}

export function getOperatorProfile(
  fallbackName: string,
  fallbackEmail = '',
  fallbackRole = DEFAULT_ROLE,
): OperatorProfile {
  const targetEmail = fallbackEmail.trim().toLowerCase();

  if (memoryProfile) {
    const memEmail = memoryProfile.email.trim().toLowerCase();
    if (!targetEmail || memEmail === targetEmail) {
      return normalizeProfile(memoryProfile, fallbackName, targetEmail || memEmail, fallbackRole);
    }
    memoryProfile = null;
  }

  const key = storageKeyForUser(targetEmail);
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<OperatorProfile>;
      const parsedEmail = (parsed.email ?? '').trim().toLowerCase();
      // Não herda dados de teste@marthi.com.br se o usuário logado for diferente
      if (!targetEmail || !parsedEmail || parsedEmail === targetEmail) {
        return normalizeProfile(parsed, fallbackName, targetEmail || parsedEmail, fallbackRole);
      }
    }
  } catch {
    /* ignore */
  }

  return emptyProfile(fallbackName, targetEmail, fallbackRole);
}

export function replaceOperatorProfileCache(profile: OperatorProfile) {
  memoryProfile = normalizeProfile(profile, profile.displayName, profile.email);
  const key = storageKeyForUser(profile.email);
  localStorage.setItem(key, JSON.stringify(memoryProfile));
  syncThemeForProfile(memoryProfile.email || memoryProfile.displayName, memoryProfile.theme);
}

/** Mantém memoryProfile.theme alinhado ao toggle (evita PUT revertendo tema). */
export function patchOperatorProfileTheme(theme: PanelTheme) {
  if (!memoryProfile) {
    try {
      const key = storageKeyForUser();
      const raw = localStorage.getItem(key);
      if (raw) {
        memoryProfile = normalizeProfile(JSON.parse(raw) as Partial<OperatorProfile>, 'Operador');
      }
    } catch {
      /* ignore */
    }
  }
  if (!memoryProfile) return;
  memoryProfile = { ...memoryProfile, theme };
  try {
    const key = storageKeyForUser(memoryProfile.email);
    localStorage.setItem(key, JSON.stringify(memoryProfile));
  } catch {
    /* ignore */
  }
}

export async function saveOperatorProfile(
  profile: Omit<OperatorProfile, 'theme'> & { theme?: PanelTheme },
  options?: { allowRole?: boolean; defaultRole?: string },
) {
  const current = getOperatorProfile(profile.displayName, profile.email, options?.defaultRole || DEFAULT_ROLE);
  const next = normalizeProfile(
    {
      ...profile,
      role: options?.allowRole ? profile.role : current.role,
      theme: profile.theme ?? getPanelTheme() ?? current.theme,
    },
    profile.displayName,
    profile.email,
    options?.defaultRole || DEFAULT_ROLE,
  );

  const { isNestAuthed } = await import('../services/nestClient');
  if (isNestAuthed()) {
    const { apiPutOperatorProfile } = await import('../services/erpApi');
    const saved = await apiPutOperatorProfile({
      displayName: next.displayName,
      role: next.role,
      photo: next.photo,
      email: next.email,
      phone: next.phone,
      address: next.address,
      theme: next.theme,
    });
    const merged = normalizeProfile(
      { ...next, ...saved, theme: saved.theme ?? next.theme },
      next.displayName,
      next.email,
    );
    replaceOperatorProfileCache(merged);
    return merged;
  }

  replaceOperatorProfileCache(next);
  return next;
}

export function notifyProfileUpdated() {
  window.dispatchEvent(new Event(PROFILE_EVENT));
}

/** Iniciais no estilo do chip (ex.: Marthi Teste → MT). */
export function profileInitials(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

export function resolveProfilePhoto(profile: OperatorProfile, authPicture?: string | null) {
  return profile.photo || authPicture || null;
}

export async function fileToProfilePhoto(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    throw new Error('Não foi possível ler a foto.');
  }

  const scale = Math.max(size / bitmap.width, size / bitmap.height);
  const width = bitmap.width * scale;
  const height = bitmap.height * scale;
  ctx.drawImage(bitmap, (size - width) / 2, (size - height) / 2, width, height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.84);
}

/** Foto de produto/estoque (vitrine totem / ERP). */
export async function fileToProductImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const max = 960;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    throw new Error('Não foi possível ler a imagem.');
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.86);
}
