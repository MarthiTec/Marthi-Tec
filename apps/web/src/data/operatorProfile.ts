import { syncThemeForProfile, type PanelTheme } from './panelThemeStore';

const STORAGE_KEY = 'marthi.operator.profile';
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

function emptyProfile(fallbackName: string, fallbackEmail = ''): OperatorProfile {
  return {
    displayName: fallbackName,
    role: DEFAULT_ROLE,
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
): OperatorProfile {
  return {
    displayName: partial.displayName?.trim() || fallbackName,
    role: partial.role?.trim() || DEFAULT_ROLE,
    photo: partial.photo?.trim() || null,
    email: partial.email?.trim() || fallbackEmail,
    phone: partial.phone?.trim() || '',
    address: partial.address?.trim() || '',
    theme: partial.theme === 'dark' || partial.theme === 'light' ? partial.theme : fallbackTheme(),
  };
}

export function getOperatorProfile(fallbackName: string, fallbackEmail = ''): OperatorProfile {
  if (memoryProfile) {
    return normalizeProfile(memoryProfile, fallbackName, fallbackEmail || memoryProfile.email);
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<OperatorProfile>;
      return normalizeProfile(parsed, fallbackName, fallbackEmail);
    }
  } catch {
    /* ignore */
  }
  return emptyProfile(fallbackName, fallbackEmail);
}

export function replaceOperatorProfileCache(profile: OperatorProfile) {
  memoryProfile = normalizeProfile(profile, profile.displayName, profile.email);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(memoryProfile));
  syncThemeForProfile(memoryProfile.email || memoryProfile.displayName, memoryProfile.theme);
}

export async function saveOperatorProfile(
  profile: Omit<OperatorProfile, 'theme'> & { theme?: PanelTheme },
  options?: { allowRole?: boolean },
) {
  const current = getOperatorProfile(profile.displayName, profile.email);
  const next = normalizeProfile(
    {
      ...profile,
      role: options?.allowRole ? profile.role : current.role,
      theme: profile.theme || current.theme,
    },
    profile.displayName,
    profile.email,
  );

  const { isNestAuthed } = await import('../services/nestClient');
  if (isNestAuthed()) {
    const { apiPutOperatorProfile } = await import('../services/erpApi');
    // Nest UpdateOperatorProfileDto: só displayName | role | photo (forbidNonWhitelisted).
    const saved = await apiPutOperatorProfile({
      displayName: next.displayName,
      role: next.role,
      photo: next.photo,
    });
    const merged = normalizeProfile(
      {
        ...next,
        displayName: saved.displayName ?? next.displayName,
        role: saved.role ?? next.role,
        photo: saved.photo !== undefined ? saved.photo : next.photo,
        theme: next.theme,
      },
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
