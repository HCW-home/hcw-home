import { Injectable } from '@angular/core';
import { BehaviorSubject, fromEvent, merge, Observable, of } from 'rxjs';
import { map, startWith, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { SwUpdate } from '@angular/service-worker';

@Injectable({
  providedIn: 'root',
})
export class OfflineService {
  private onlineSubject = new BehaviorSubject<boolean>(navigator.onLine);
  private backendOnlineSubject = new BehaviorSubject<boolean>(true);

  public online$: Observable<boolean> = this.onlineSubject.asObservable();
  public backendOnline$: Observable<boolean> = this.backendOnlineSubject.asObservable();

  constructor(private swUpdate: SwUpdate) {
    this.initializeOnlineStatus();
  }

  private initializeOnlineStatus(): void {
    // Monitor browser online/offline events
    merge(
      fromEvent(window, 'online').pipe(map(() => true)),
      fromEvent(window, 'offline').pipe(map(() => false))
    )
      .pipe(
        startWith(navigator.onLine),
        debounceTime(300),
        distinctUntilChanged()
      )
      .subscribe(isOnline => {
        this.onlineSubject.next(isOnline);
      });
  }

  /**
   * Signal that the backend is offline (network error detected)
   */
  setBackendOffline(): void {
    this.backendOnlineSubject.next(false);
  }

  /**
   * Signal that the backend is online (successful request detected)
   */
  setBackendOnline(): void {
    this.backendOnlineSubject.next(true);
  }

  isOnline(): boolean {
    return this.onlineSubject.value;
  }

  isOffline(): boolean {
    return !this.onlineSubject.value;
  }

  isBackendOnline(): boolean {
    return this.backendOnlineSubject.value;
  }

  isBackendOffline(): boolean {
    return !this.backendOnlineSubject.value;
  }

  /**
   * Check if the service worker is enabled and ready
   */
  async isServiceWorkerReady(): Promise<boolean> {
    if (!this.swUpdate.isEnabled) {
      return false;
    }
    try {
      const registration = await navigator.serviceWorker.ready;
      return !!registration;
    } catch {
      return false;
    }
  }

  /**
   * Get cached data size estimate (if available)
   */
  async getCacheSize(): Promise<{ usage: number; quota: number } | null> {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      try {
        const estimate = await navigator.storage.estimate();
        return {
          usage: estimate.usage || 0,
          quota: estimate.quota || 0,
        };
      } catch {
        return null;
      }
    }
    return null;
  }

  /**
   * Clear all caches (useful for troubleshooting)
   */
  async clearAllCaches(): Promise<void> {
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));
    }
  }
}
