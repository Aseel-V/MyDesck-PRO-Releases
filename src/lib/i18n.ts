import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { translations } from '../i18n/translations';

i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources: {
            en: { translation: translations.en },
            ar: { translation: translations.ar },
            he: { translation: translations.he },
        },
        fallbackLng: 'en',
        supportedLngs: ['en', 'ar', 'he'],
        debug: false,

        interpolation: {
            escapeValue: false, // not needed for react as it escapes by default
        },

        detection: {
            order: ['localStorage', 'navigator'],
            caches: ['localStorage'],
            lookupLocalStorage: 'elite_travels_language',
        }
    });

export default i18n;
