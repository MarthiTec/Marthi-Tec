import { nestDelete, nestGet, nestPost } from './nestClient';

/** Telas mais acessadas (contadas no banco, por loja e por usuário). */
export type ScreenVisit = { path: string; visits: number; lastAt: string };

export const apiRecordScreenVisit = (path: string) => nestPost<unknown>('/screen-visits', { path });
export const apiTopScreens = (limit = 10) => nestGet<ScreenVisit[]>(`/screen-visits/top?limit=${limit}`);
export const apiResetScreenVisits = () => nestDelete<unknown>('/screen-visits');
