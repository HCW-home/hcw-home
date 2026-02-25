import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  applyPrimaryColor(hex: string): void {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);

    const mix = (color: number, target: number, weight: number) =>
      Math.round(color + (target - color) * weight);
    const lighten = (w: number) =>
      `#${[r, g, b].map(c => mix(c, 255, w).toString(16).padStart(2, '0')).join('')}`;
    const darken = (w: number) =>
      `#${[r, g, b].map(c => mix(c, 0, w).toString(16).padStart(2, '0')).join('')}`;

    const root = document.documentElement.style;
    root.setProperty('--primary-500-rgb', `${r}, ${g}, ${b}`);
    root.setProperty('--primary-50', lighten(0.95));
    root.setProperty('--primary-100', lighten(0.9));
    root.setProperty('--primary-200', lighten(0.7));
    root.setProperty('--primary-300', lighten(0.5));
    root.setProperty('--primary-400', lighten(0.3));
    root.setProperty('--primary-500', hex);
    root.setProperty('--primary-600', darken(0.15));
    root.setProperty('--primary-700', darken(0.3));
    root.setProperty('--primary-800', darken(0.45));
    root.setProperty('--primary-900', darken(0.6));
  }
}
