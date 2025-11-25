declare module 'arabic-reshaper' {
  export function reshape(text: string): string;
  export function convert(text: string): string;
  export const defaultOptions: {
    letters: {
      [key: string]: [string, string, string, string];
    };
    ligatures: boolean;
  };
}
