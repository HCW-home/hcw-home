import { User } from './consultation.model';

export enum WebSocketState {
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  DISCONNECTED = 'DISCONNECTED',
  RECONNECTING = 'RECONNECTING',
  FAILED = 'FAILED',
}

export interface WebSocketMessage<T = unknown> {
  type: string;
  data?: T;
  timestamp?: number;
}

export interface PingMessage {
  type: 'ping';
  timestamp: number;
}

export interface GetStatusMessage {
  type: 'get_status';
}

export interface SendMessageData {
  target_user_id: number;
  message: string;
  message_type?: string;
}

export interface SendMessageMessage {
  type: 'send_message';
  data: SendMessageData;
  timestamp: number;
}

export interface JoinGroupMessage {
  type: 'join_group';
  data: {
    group_name: string;
  };
}

export interface LeaveGroupMessage {
  type: 'leave_group';
  data: {
    group_name: string;
  };
}

export type UserOutgoingMessage =
  | PingMessage
  | GetStatusMessage
  | SendMessageMessage
  | JoinGroupMessage
  | LeaveGroupMessage;

export interface StatusChangedEvent {
  type: 'status_changed';
  data: {
    user_id: number;
    is_online: boolean;
    connection_count: number;
    connection_id: string;
  };
}

export interface StatusResponseEvent {
  type: 'status_response';
  data: {
    user_id: number;
    is_online: boolean;
    connection_count: number;
    connection_id: string;
  };
}

export interface PongEvent {
  type: 'pong';
  timestamp: number;
}

export interface UserMessageEvent {
  type: 'user_message';
  data: {
    message_type: string;
    from_user_id: number;
    from_username: string;
    message: string;
    timestamp: number;
  };
}

export interface NotificationEvent {
  type: 'notification';
  data: Record<string, unknown>;
}

export interface SystemBroadcastEvent {
  type: 'system_broadcast';
  data: {
    message_type: string;
    from_user_id: number;
    message: string;
    timestamp: number;
  };
}

export interface GroupJoinedEvent {
  type: 'group_joined';
  data: {
    group_name: string;
  };
}

export interface GroupLeftEvent {
  type: 'group_left';
  data: {
    group_name: string;
  };
}

export interface ErrorEvent {
  type: 'error';
  message: string;
}

export interface AppointmentJoinedEvent {
  type: 'appointment';
  consultation_id: number;
  appointment_id: number;
  state: 'participant_joined';
  data: {
    user_id: number;
    user_name: string;
  };
}

export interface CallRequestEvent {
  event: 'call_request';
  consultation_id: number;
  caller_id: number;
  caller_name: string;
}

export interface AppointmentChangedEvent {
  type: 'appointment';
  consultation_id: number;
  appointment_id: number;
  state: 'updated' | 'cancelled' | 'created';
}

export interface ConsultationChangedEvent {
  type: 'consultation';
  consultation_id: number;
  state: 'created' | 'updated' | 'closed';
}

export type UserIncomingEvent =
  | StatusChangedEvent
  | StatusResponseEvent
  | PongEvent
  | UserMessageEvent
  | NotificationEvent
  | SystemBroadcastEvent
  | GroupJoinedEvent
  | GroupLeftEvent
  | ErrorEvent
  | AppointmentJoinedEvent
  | AppointmentChangedEvent
  | ConsultationChangedEvent
  | MessageEvent;

export interface ConsultationMessageEvent {
  type: 'consultation_message';
  data: {
    id: number;
    consultation_id: number;
    user_id: number;
    username: string;
    message: string;
    timestamp: string;
    is_edited?: boolean;
    updated_at?: string;
    state?: 'created' | 'updated';
  };
}

export interface MessageAttachment {
  file_name: string;
  mime_type: string;
}

export interface MessageEventData {
  id: number;
  content: string;
  attachment: MessageAttachment | null;
  created_at: string;
  updated_at: string;
  created_by: User;
  is_edited: boolean;
  deleted_at: string | null;
}

export interface MessageEvent {
  type: 'message';
  event?: 'message';
  consultation_id: number;
  message_id: number;
  state: 'created' | 'updated' | 'deleted';
  data: MessageEventData;
  consultation?: unknown;
}

export interface ParticipantJoinedEvent {
  type: 'participant_joined';
  data: {
    participant_id: number;
    username: string;
    timestamp: string;
  };
}

export interface ParticipantLeftEvent {
  type: 'participant_left';
  data: {
    participant_id: number;
    username: string;
    timestamp: string;
  };
}

export interface AppointmentUpdatedEvent {
  type: 'appointment_updated';
  data: {
    appointment_id: number;
    status: string;
    timestamp: string;
  };
}

export interface ParticipantsEvent {
  type: 'participants';
  data: {
    id: number;
    username: string;
    is_online: boolean;
  }[];
}

export type ConsultationIncomingEvent =
  | ConsultationMessageEvent
  | MessageEvent
  | ParticipantJoinedEvent
  | ParticipantLeftEvent
  | AppointmentUpdatedEvent
  | ParticipantsEvent
  | GroupJoinedEvent
  | GroupLeftEvent
  | ErrorEvent;

export interface WebSocketConfig {
  url: string;
  urlProvider?: () => Promise<string | null>;
  reconnect?: boolean;
  reconnectInterval?: number;
  reconnectAttempts?: number;
  pingInterval?: number;
}
