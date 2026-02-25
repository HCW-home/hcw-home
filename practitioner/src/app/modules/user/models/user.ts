import { CommunicationMethodType } from '../constants/user';

export interface ITerm {
  id: number;
  name: string;
  content: string;
  use_for_patient: boolean;
}

export interface IOrganisation {
  id: number;
  name: string;
  logo_color?: string;
  logo_white?: string;
  favicon?: string;
  primary_color_patient?: string;
  primary_color_practitioner?: string;
  default_term?: number;
  footer_patient?: string | null;
  footer_practitioner?: string | null;
  location_latitude?: number;
  location_longitude?: number;
  street?: string;
  city?: string;
  postal_code?: string;
  country?: string;
}

export interface ILanguage {
  id: number;
  name: string;
  code: string;
}

export interface ISpeciality {
  id: number;
  name: string;
  name_hy?: string;
}

export interface IUser {
  pk: number;
  username?: string;
  email: string;
  first_name: string;
  last_name: string;
  picture?: string;
  is_active: boolean;
  is_staff: boolean;
  is_superuser: boolean;
  date_joined: string;
  last_login?: string;

  communication_method: CommunicationMethodType;
  mobile_phone_number?: string;
  preferred_language?: number | null;
  timezone: string;
  languages?: ILanguage[];
  language_ids?: number[];

  app_preferences?: Record<string, unknown>;
  encrypted?: boolean;
  main_organisation?: IOrganisation;
  organisations?: IOrganisation[];
  specialities?: ISpeciality[];
  accepted_term?: number | null;
  is_online?: boolean;
  temporary?: boolean;
  is_practitioner?: boolean;
  is_first_login?: boolean;
  custom_fields?: import('../../../core/models/consultation').CustomFieldValue[];
}

export interface IUserUpdateRequest {
  first_name?: string;
  last_name?: string;
  mobile_phone_number?: string;
  communication_method?: CommunicationMethodType;
  preferred_language?: number | null;
  timezone?: string;
  language_ids?: number[];
  is_first_login?: boolean;
}
