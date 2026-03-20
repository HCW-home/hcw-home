import { registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';
import localeDe from '@angular/common/locales/de';
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

registerLocaleData(localeFr);
registerLocaleData(localeDe);

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
