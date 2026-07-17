import en from './en.json';
import ar from './ar.json';
import he from './he.json';

export const translations = { en, ar, he };
export type Language = keyof typeof translations;
export type TranslationKeys = typeof en;
