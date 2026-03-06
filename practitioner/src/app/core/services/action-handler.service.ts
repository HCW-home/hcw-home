import { Injectable } from '@angular/core';
import { RoutePaths } from '../constants/routes';

export interface IActionConfig {
  route: string;
  requiresAuth: boolean;
  appendId: boolean;
}

const ACTION_ROUTES: Record<string, IActionConfig> = {
  'presence': { route: `/${RoutePaths.CONFIRM_PRESENCE}`, requiresAuth: true, appendId: true },
  'join': { route: `/${RoutePaths.CONFIRM_PRESENCE}`, requiresAuth: true, appendId: true },
  'message': { route: `/${RoutePaths.USER}/${RoutePaths.CONSULTATIONS}`, requiresAuth: true, appendId: false },
  'consultation': { route: `/${RoutePaths.USER}/${RoutePaths.CONSULTATIONS}`, requiresAuth: true, appendId: true },
};

const DEFAULT_ACTION: IActionConfig = { route: `/${RoutePaths.USER}/${RoutePaths.DASHBOARD}`, requiresAuth: true, appendId: false };

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
