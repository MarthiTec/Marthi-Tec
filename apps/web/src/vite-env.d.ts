/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  readonly VITE_TOTEM_EXIT_PASSWORD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module 'xlsx' {
  export const utils: {
    sheet_to_json<T = any>(sheet: any, options?: any): T[];
    [key: string]: any;
  };
  export const writeFile: (workbook: any, filename: string) => void;
  export const read: (data: any, options?: any) => any;
  const content: any;
  export default content;
}

declare module 'jspdf' {
  export class jsPDF {
    constructor(options?: any);
    [key: string]: any;
  }
  export default jsPDF;
}
