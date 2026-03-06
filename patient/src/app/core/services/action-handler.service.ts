import { Injectable } from '@angular/core';

export interface ActionConfig {
  route: string;
  requiresAuth: boolean;
  appendId: boolean;
}

const ACTION_ROUTES: Record<string, ActionConfig> = {
  'presence': { route: '/confirm-presence', requiresAuth: true, appendId: true },
  'join': { route: '/confirm-presence', requiresAuth: true, appendId: true },
  'message': { route: '/home', requiresAuth: true, appendId: false },
  'consultation': { route: '/consultation', requiresAuth: true, appendId: true },
};

const DEFAULT_ACTION: ActionConfig = { route: '/home', requiresAuth: true, appendId: false };

@Injectable({
  providedIn: 'root'
})
export class ActionHandlerService {
  getRouteForAction(action: string | null, id: string | null = null): string {
    if (!action) {
      return DEFAULT_ACTION.route;
    }
    const config = ACTION_ROUTES[action];
    if (!config) {
      return DEFAULT_ACTION.route;
    }

    if (config.appendId && id) {
      return `${config.route}/${id}`;
    }
    return config.route;
  }
}
