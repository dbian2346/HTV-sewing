declare module '@pattern-studio/penelope-engine' {
  export const Design: new (config: Record<string, unknown>) => new (settings: unknown) => import('./freesewing/types.js').FSDraft;
  export class Path {
    move(point: import('./geometry.js').Point): this;
    line(point: import('./geometry.js').Point): this;
    curve(cp1: import('./geometry.js').Point, cp2: import('./geometry.js').Point, to: import('./geometry.js').Point): this;
    length(): number;
  }
}
declare module '@pattern-studio/penelope-engine' {
  export const Penelope: { designConfig: Record<string, unknown> & { parts: { options?: Record<string, unknown>; measurements?: string[] }[] } };
  export const front: unknown;
  export const back: unknown;
  export const waistband: unknown;
}
declare module '@pattern-studio/catalog-engine' {
  export const designs: Record<string, import('./freesewing/catalog-runtime.js').NativeConstructor>;
  export const i18n: Record<string, Record<string, { p?: Record<string, string>; s?: Record<string, string> }>>;
  export const annotationI18n: Record<string, Record<string, string>>;
  export const themePlugin: unknown;
  export const i18nPlugin: unknown;
}
declare module 'pdfkit' {
  export function registerStdFonts(...fonts: unknown[]): void;
  export default class PDFKitDocument {
    constructor(options: unknown);
    on(event: 'data', listener: (chunk: Uint8Array) => void): this;
    on(event: 'end', listener: () => void): this;
    on(event: 'error', listener: (error: Error) => void): this;
    end(): void;
  }
}

declare module "pdfkit/standard-fonts/*" { const font: unknown; export default font; }
