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
  default_term?: number | null;
  footer_patient?: string | null;
  footer_practitioner?: string | null;
}

export interface User {
  id: number;
  pk: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  picture?: string;
  preferred_language?: string;
  timezone?: string;
  mobile_phone_number?: string;
  communication_method?: 'email' | 'sms' | 'whatsapp' | 'push' | 'manual';
  is_online?: boolean;
  app_preferences?: any;
  location?: string;
  date_joined?: string;
  last_login?: string;
  weight: string;
  height: string;
  blood_type: string;
  gender: string;
  phone: string;
  date_of_birth: string;
  address: string;
  specialities?: { id: number; name: string }[];
  main_organisation?: IOrganisation | null;
  accepted_term?: number | null;
  is_first_login?: boolean;
  one_time_auth_token?: string;
  verification_code?: number | null;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  key?: string;
  access?: string;
  refresh?: string;
  user?: User;
}

export interface RegisterRequest {
  email: string;
  password1: string;
  password2: string;
  first_name?: string;
  last_name?: string;
}

export interface MagicLinkRequest {
  email?: string;
  phone?: string;
}

export interface MagicLinkVerify {
  token: string;
}

export interface TokenAuthRequest {
  auth_token: string;
  verification_code?: string;
}

export interface TokenAuthResponse {
  access?: string;
  refresh?: string;
  user_id?: number;
  requires_verification?: boolean;
  message?: string;
  error?: string;
}
