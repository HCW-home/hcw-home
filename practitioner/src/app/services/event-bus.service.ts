import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class EventBusService {
  private subjects = new Map<string, Subject<any>>();

  on<T = any>(event: string): Observable<T> {
    if (!this.subjects.has(event)) this.subjects.set(event, new Subject<any>());
    return this.subjects.get(event)!.asObservable();
  }

  emit(event: string, payload?: any) {
    if (!this.subjects.has(event)) this.subjects.set(event, new Subject<any>());
    this.subjects.get(event)!.next(payload);
  }
}
