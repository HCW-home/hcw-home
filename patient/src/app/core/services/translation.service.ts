import { inject, Injectable, Injector, signal } from '@angular/core';
import { HttpClient, HttpBackend } from '@angular/common/http';
import { TranslateService, TranslationObject } from '@ngx-translate/core';
import { catchError, EMPTY } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface AppLanguage {
  code: string;
  name: string;
  nativeName: string;
}

const DEFAULT_FALLBACK: AppLanguage[] = [
  { code: 'en', name: 'English', nativeName: 'English' },
];

const STORAGE_KEY = 'app_language';
const DEFAULT_LANGUAGE = 'en';

const NATIVE_NAMES: Record<string, string> = {
  en: 'English',
  fr: 'Français',
  de: 'Deutsch',
  es: 'Español',
  it: 'Italiano',
  pt: 'Português',
  nl: 'Nederlands',
  ar: 'العربية',
  tr: 'Türkçe',
  ro: 'Română',
  pl: 'Polski',
  ru: 'Русский',
  uk: 'Українська',
  zh: '中文',
  ja: '日本語',
  ko: '한국어',
};

@Injectable({
  providedIn: 'root',
})
export class TranslationService {
  private currentLanguageSignal = signal<string>(DEFAULT_LANGUAGE);
  private availableLanguagesSignal = signal<AppLanguage[]>(DEFAULT_FALLBACK);
  private http = new HttpClient(inject(HttpBackend));
  private injector = inject(Injector);
  private initialized = false;

  readonly currentLanguage = this.currentLanguageSignal.asReadonly();
  readonly availableLanguages = this.availableLanguagesSignal.asReadonly();

  constructor(private translate: TranslateService) {
    this.initializeLanguage();
  }

  private initializeLanguage(): void {
    this.translate.addLangs(this.availableLanguagesSignal().map(lang => lang.code));
    this.translate.setDefaultLang(DEFAULT_LANGUAGE);

    const savedLanguage = localStorage.getItem(STORAGE_KEY);
    const browserLang = this.translate.getBrowserLang();
    const langs = this.availableLanguagesSignal();
    const langToUse = savedLanguage ||
      (browserLang && langs.some(l => l.code === browserLang)
        ? browserLang
        : DEFAULT_LANGUAGE);

    this.setLanguage(langToUse);
  }

  loadLanguages(languages: { code: string; name: string }[]): void {
    if (languages && languages.length > 0) {
      const mapped = languages.map(l => ({
        code: l.code,
        name: l.name,
        nativeName: NATIVE_NAMES[l.code] || l.name,
      }));
      this.availableLanguagesSignal.set(mapped);
      this.translate.addLangs(mapped.map(l => l.code));

      // Re-initialize language selection with the new available languages
      const savedLanguage = localStorage.getItem(STORAGE_KEY);
      if (!savedLanguage) {
        const browserLang = this.translate.getBrowserLang();
        const langToUse = browserLang && mapped.some(l => l.code === browserLang)
          ? browserLang
          : this.currentLanguageSignal();
        if (langToUse !== this.currentLanguageSignal()) {
          this.setLanguage(langToUse);
        }
      }
    }
  }

  setLanguage(langCode: string): void {
    const currentLang = this.currentLanguageSignal();
    this.translate.use(langCode);
    this.fetchAndApplyOverrides(langCode);
    if (this.initialized && langCode !== currentLang) {
      import('./auth.service').then(m => this.injector.get(m.AuthService).invalidateConfigCache());
    }
    this.initialized = true;
    this.currentLanguageSignal.set(langCode);
    localStorage.setItem(STORAGE_KEY, langCode);
    document.documentElement.lang = langCode;
  }

  getCurrentLanguage(): AppLanguage | undefined {
    return this.availableLanguagesSignal().find(l => l.code === this.currentLanguageSignal());
  }

  instant(key: string, params?: Record<string, string>): string {
    return this.translate.instant(key, params);
  }

  private fetchAndApplyOverrides(langCode: string): void {
    this.http.get<Record<string, string>>(`${environment.apiUrl}/translations/patient/${langCode}/`)
      .pipe(catchError(() => EMPTY))
      .subscribe(overrides => {
        if (overrides && Object.keys(overrides).length > 0) {
          const nested = this.expandDotNotation(overrides);
          this.translate.setTranslation(langCode, nested, true);
        }
      });
  }

  private expandDotNotation(flat: Record<string, string>): TranslationObject {
    const result: TranslationObject = {};
    for (const key of Object.keys(flat)) {
      const parts = key.split('.');
      let current: TranslationObject = result;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!current[parts[i]] || typeof current[parts[i]] !== 'object') {
          current[parts[i]] = {};
        }
        current = current[parts[i]] as TranslationObject;
      }
      current[parts[parts.length - 1]] = flat[key];
    }
    return result;
  }
}
