import { Pipe, PipeTransform, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { parseDateWithoutTimezone } from '../tools/helper';
import { TranslationService } from '../../core/services/translation.service';

@Pipe({
  name: 'localDate',
  standalone: true,
  pure: false,
})
export class LocalDatePipe implements PipeTransform {
  private t = inject(TranslationService);

  transform(value: string | null | undefined, format: string = 'MMM d, y, HH:mm'): string {
    if (!value) return '';

    const date = parseDateWithoutTimezone(value);
    if (!date) return '';

    const locale = this.t.currentLanguage() || 'en';
    const datePipe = new DatePipe(locale);
    return datePipe.transform(date, format) || '';
  }
}
