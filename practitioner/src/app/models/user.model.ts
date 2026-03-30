export enum UserRole {
  PATIENT = 'PATIENT',
  PRACTITIONER = 'PRACTITIONER',
  ADMIN = 'ADMIN',
}

export enum UserSex {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
  OTHER = 'OTHER',
}

export enum UserStatus {
  APPROVED = 'APPROVED',
  NOT_APPROVED = 'NOT_APPROVED',
}

export interface Language {
  id: number;
  name: string;
  code?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface Speciality {
  id: number;
  name: string;
  description?: string | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface Organization {
  id: number;
  name: string;
  logo?: string | null;
  primaryColor?: string | null;
  footerMarkdown?: string | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface Group {
  id: number;
  organizationId: number;
  name: string;
  description?: string | null;
  sharedOnlyIncomingConsultation: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface User {
  id: number;
  role: UserRole;
  firstName: string;
  lastName: string;
  email: string;
  temporaryAccount: boolean;
  phoneNumber?: string | null;
  country?: string | null;
  sex?: UserSex | null;
  status: UserStatus;
  createdAt: string | Date;
  updatedAt: string | Date;
  UserNotificationSetting:NotificationSettings| null;

  //term data 
  termVersion: number;
  acceptedAt: string | Date;

  organizations: {
    id: number;
    name: string;
  }[];
  // Tokens
  accessToken: string;
  refreshToken: string;

  groups: {
    id: number;
    name: string;
  }[];

  languages: {
    id: number;
    name: string;
  }[];

  specialities: {
    id: number;
    name: string;
  }[];
}
export interface UpdateUserProfileDto {
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  country?: string;
  sex?: UserSex;
  languageIds?: number[];
  specialityIds?: number[];
}


export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
  statusCode: number;
}




export interface Term {
  id: number;
  language: string;
  country: string;
  content: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  organizationId: number;
}
export interface NotificationSettings {
  enabled: boolean;
  phone?: string;
}
