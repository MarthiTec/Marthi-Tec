const STORAGE_KEY = 'marthi.operator.profile';

export type OperatorProfile = {
  displayName: string;
  role: string;
  photo: string | null;
};

const DEFAULT_ROLE = 'Operador';

export function getOperatorProfile(fallbackName: string): OperatorProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<OperatorProfile>;
      return {
        displayName: parsed.displayName?.trim() || fallbackName,
        role: parsed.role?.trim() || DEFAULT_ROLE,
        photo: parsed.photo?.trim() || null,
      };
    }
  } catch {
    /* ignore */
  }
  return { displayName: fallbackName, role: DEFAULT_ROLE, photo: null };
}

export function saveOperatorProfile(profile: OperatorProfile) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      displayName: profile.displayName.trim(),
      role: profile.role.trim() || DEFAULT_ROLE,
      photo: profile.photo,
    }),
  );
}

export function notifyProfileUpdated() {
  window.dispatchEvent(new Event('marthi-profile-updated'));
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
