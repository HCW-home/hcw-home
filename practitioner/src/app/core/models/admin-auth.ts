import { IUser } from '../../modules/user/models/user';

export interface IBodyLogin {
  email: string;
  password: string;
}

export interface IResponseLogin {
  access: string;
  refresh: string;
  user: IUser;
}

export interface IBodyForgotPassword {
  email: string;
}

export interface IBodySetPassword {
  uid: string;
  token: string;
  new_password1: string;
  new_password2: string;
}

export interface ITokenAuthRequest {
  auth_token: string;
  verification_code?: string;
}

export interface ITokenAuthResponse {
  access?: string;
  refresh?: string;
  user_id?: number;
  requires_verification?: boolean;
  message?: string;
  error?: string;
}

export interface IConfigLanguage {
  code: string;
  name: string;
}

export interface IOrganization {
  id: number;
  name: string;
  logo_color: string | null;
  logo_white: string | null;
  login_text_patient: string | null;
  login_text_practitioner: string | null;
  footer_patient: string | null;
  footer_practitioner: string | null;
  default_term?: number;
  [key: string]: unknown;
}

export interface IOpenIDConfig {
  enabled: boolean;
  client_id: string | null;
  authorization_url: string | null;
  provider_name: string | null;
  disable_password_login: boolean;
  languages: IConfigLanguage[];
  branding: string;
  site_logo: string | null;
  site_logo_white: string | null;
  site_favicon: string | null;
  main_organization: IOrganization | null;
  primary_color_patient: string | null;
  primary_color_practitioner: string | null;
  communication_methods: string[];
  consultation_auto_delete_hours: number;
  appointment_early_join_minutes: number;
}

export interface IOpenIDLoginBody {
  code: string;
  callback_url: string;
}
