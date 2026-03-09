import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OfflineService } from '../services/offline.service';
import { TranslationService } from '../services/translation.service';

@Component({
  selector: 'app-offline-indicator',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if ((offlineService.online$ | async) === false) {
      <div class="offline-banner">
        <div class="offline-content">
          <svg class="offline-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3" />
          </svg>
          <span class="offline-text">
            {{ translationService.instant('common.offlineMode') }}
          </span>
          <span class="offline-subtext">
            {{ translationService.instant('common.offlineModeDescription') }}
          </span>
        </div>
      </div>
    }
  `,
  styles: [`
    .offline-banner {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 0.75rem 1rem;
      z-index: 9999;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
      animation: slideDown 0.3s ease-out;
    }

    @keyframes slideDown {
      from {
        transform: translateY(-100%);
        opacity: 0;
      }
      to {
        transform: translateY(0);
        opacity: 1;
      }
    }

    .offline-content {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      max-width: 1200px;
      margin: 0 auto;
    }

    .offline-icon {
      width: 1.5rem;
      height: 1.5rem;
      flex-shrink: 0;
    }

    .offline-text {
      font-weight: 600;
      font-size: 0.875rem;
    }

    .offline-subtext {
      font-size: 0.75rem;
      opacity: 0.9;
      display: none;
    }

    @media (min-width: 640px) {
      .offline-subtext {
        display: inline;
      }
    }
  `]
})
export class OfflineIndicatorComponent {
  offlineService = inject(OfflineService);
  translationService = inject(TranslationService);
}
