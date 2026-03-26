export interface CustomField {
  id: number;
  name: string;
  field_type: 'short_text' | 'long_text' | 'date' | 'number' | 'list';
  target_model: string;
  required: boolean;
  options: string[] | null;
  ordering: number;
}

export interface CustomFieldValue {
  field: number;
  field_name: string;
  field_type: string;
  value: string | null;
  options: string[] | null;
}

export interface User {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  picture?: string;
  mobile_phone_number?: string;
  is_online?: boolean;
  languages?: { id: number; code: string; name: string }[];
  preferred_language?: string;
  communication_method?: string;
  timezone?: string;
  temporary?: boolean;
  is_practitioner?: boolean;
}

export interface Queue {
  id: number;
  name: string;
  users: User[];
}

export interface Participant {
  id: number;
  user: User | null;
  is_active: boolean;
  status?: ParticipantStatus;
  requires_manual_access?: boolean;
}

export type ParticipantStatus =
  | 'draft'
  | 'invited'
  | 'confirmed'
  | 'unavailable'
  | 'cancelled';

export enum AppointmentStatus {
  DRAFT = 'draft',
  SCHEDULED = 'scheduled',
  CANCELLED = 'cancelled',
}

export enum AppointmentType {
  ONLINE = 'online',
  INPERSON = 'inPerson',
}

export interface Appointment {
  id: number;
  type: AppointmentType;
  title?: string | null;
  scheduled_at: string;
  end_expected_at: string | null;
  consultation: number;
  created_by: User;
  status: AppointmentStatus;
  created_at: string;
  participants: Participant[];
  consultation_id: number;
  consultation_title?: string | null;
  is_recording?: boolean;
  egress_id?: string | null;
  recording_started_at?: string | null;
  recording_stopped_at?: string | null;
}

export interface MessageAttachment {
  file_name: string;
  mime_type: string;
}

export interface ConsultationMessage {
  id: number;
  content: string | null;
  attachment: MessageAttachment | null;
  recording_url: string | null;
  created_at: string;
  updated_at: string;
  is_edited: boolean;
  deleted_at?: string | null;
  created_by: User;
}

export interface Consultation {
  id: number;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  title: string | null;
  description: string | null;
  beneficiary: User | null;
  beneficiary_id?: number;
  created_by: User;
  owned_by?: User | null;
  group: Queue | null;
  group_id?: number;
  visible_by_patient: boolean;
  custom_fields?: CustomFieldValue[];
  unread_count?: number;
  last_read_at?: string;
}

export interface CreateConsultationRequest {
  title?: string | null;
  description?: string | null;
  group_id?: number | null;
  beneficiary_id?: number | null;
  owned_by_id?: number | null;
  visible_by_patient?: boolean;
  custom_fields?: { field: number; value: string | null }[];
}

export interface Reason {
  id: number;
  name: string;
  duration: number;
  queue_assignee: number | null;
  user_assignee: number | null;
}

export enum RequestStatus {
  REQUESTED = 'requested',
  ACCEPTED = 'accepted',
  CANCELLED = 'cancelled',
  REFUSED = 'refused',
}

export enum RequestType {
  ONLINE = 'online',
  INPERSON = 'inPerson',
}

export interface ConsultationRequest {
  id: number;
  expected_at: string;
  expected_with: User | null;
  expected_with_id?: number;
  reason: Reason;
  reason_id?: number;
  created_by: User;
  comment: string;
  status: RequestStatus;
  type: RequestType;
}

export interface CreateConsultationRequestPayload {
  expected_at: string;
  expected_with_id?: number;
  reason_id: number;
  comment: string;
  type?: RequestType;
}

export interface BookingSlot {
  id: number;
  user: User;
  start_time: string;
  end_time: string;
  start_break: string | null;
  end_break: string | null;
  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
  saturday: boolean;
  sunday: boolean;
  valid_until: string | null;
}

export interface CreateBookingSlot {
  start_time: string;
  end_time: string;
  start_break?: string | null;
  end_break?: string | null;
  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
  saturday: boolean;
  sunday: boolean;
  valid_until?: string | null;
}

export interface AvailableSlot {
  date: string;
  start_time: string;
  end_time: string;
  duration: number;
  user_id: number;
  user_email: string;
  user_first_name: string;
  user_last_name: string;
}

export interface ITemporaryParticipant {
  first_name?: string;
  last_name?: string;
  email?: string;
  mobile_phone_number?: string;
  communication_method?: string;
  preferred_language?: string;
  timezone?: string;
}

export interface CreateAppointmentRequest {
  type?: AppointmentType;
  title?: string;
  status?: AppointmentStatus;
  scheduled_at?: string;
  end_expected_at?: string;
  participants_ids?: number[];
  temporary_participants?: ITemporaryParticipant[];
  dont_invite_beneficiary?: boolean;
  dont_invite_practitioner?: boolean;
  dont_invite_me?: boolean;
}

export interface UpdateAppointmentRequest {
  type?: AppointmentType;
  title?: string;
  status?: AppointmentStatus;
  scheduled_at?: string;
  end_expected_at?: string;
  participants_ids?: number[];
  temporary_participants?: ITemporaryParticipant[];
  consultation?: number;
}

export interface CreateParticipantRequest {
  user_id?: number;
  email?: string;
  mobile_phone_number?: string;
  first_name?: string;
  last_name?: string;
  timezone?: string;
  communication_method?: string;
  preferred_language?: string;
}

export interface DashboardNextAppointment {
  id: number | null;
  title: string | null;
  scheduled_at: string | null;
  end_expected_at: string | null;
  type: string | null;
  consultation_id: number | null;
  consultation_title: string | null;
  status: string | null;
  participants: Participant[];
  dont_invite_beneficiary: boolean;
  dont_invite_practitioner: boolean;
  dont_invite_me: boolean;
}

export interface DashboardResponse {
  next_appointment: DashboardNextAppointment | null;
  upcoming_appointments: Appointment[];
  overdue_consultations: Consultation[];
  overdue_total: number;
}

export interface IParticipantDetail {
  id: number;
  is_active: boolean;
  is_confirmed: boolean | null;
  is_invited: boolean;
  status: ParticipantStatus;
  appointment: Appointment;
  user: User | null;
}
