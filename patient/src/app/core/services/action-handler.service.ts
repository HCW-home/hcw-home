import { Injectable } from '@angular/core';

export interface ActionConfig {
  route: string;
  requiresAuth: boolean;
  appendId: boolean;
  idAsQueryParam?: string;
}

export interface ActionRoute {
  path: string;
  queryParams?: Record<string, string>;
}

const ACTION_ROUTES: Record<string, ActionConfig> = {
  'presence': { route: '/confirm-presence', requiresAuth: true, appendId: true },
  'join': { route: '/confirm-presence', requiresAuth: true, appendId: true },
  'message': { route: '/home', requiresAuth: true, appendId: false },
  'consultation': { route: '/home', requiresAuth: true, appendId: false, idAsQueryParam: 'openChat' },
};

const DEFAULT_ACTION: ActionConfig = { route: '/home', requiresAuth: true, appendId: false };

@Injectable({
  providedIn: 'root'
})
export class ActionHandlerService {
  getRouteForAction(action: string | null, id: string | null = null): string {
    const result = this.getRouteWithParams(action, id);
    return result.path;
  }

  getRouteWithParams(action: string | null, id: string | null = null): ActionRoute {
    if (!action) {
      return { path: DEFAULT_ACTION.route };
    }
    const config = ACTION_ROUTES[action];
    if (!config) {
      return { path: DEFAULT_ACTION.route };
    }

    if (config.appendId && id) {
      return { path: `${config.route}/${id}` };
    }
    if (config.idAsQueryParam && id) {
      return { path: config.route, queryParams: { [config.idAsQueryParam]: id } };
    }
    return { path: config.route };
  }
}
