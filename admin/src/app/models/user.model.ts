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

export interface Organization {
  id: number;
  name: string;
  logo?: string | null;
  primaryColor?: string | null;
  footerMarkdown?: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface Group {
  id: number;
  organizationId: number;
  name: string;
  description?: string | null;
  sharedOnlyIncomingConsultation: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface Language {
  id: number;
  name: string;
}
export interface Country {
  code: string;
  name: string;
}

export interface Speciality {
  id: number;
  name: string;
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

  organizations: {
    id: number;
    name: string;
  }[];

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


export interface LoginUser {
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
  accessToken :string;
  refreshToken:string
  organizations: {
    id: number;
    name: string;
  }[];

  groups: {
    id: number;
    name: string;
  }[];

  languages: {
    id: number;
    name: string;
  }[];
}


export interface CreateUserDto {
  role: UserRole;
  firstName: string;
  lastName: string;
  email: string;
  password?: string;
  temporaryAccount?: boolean;
  phoneNumber?: string;
  country?: string;
  sex?: UserSex;
  status?: UserStatus;
  organisationIds: number[];
  groupIds?: number[];      
  languageIds?: number[];   
  specialityIds?: number[]; 
}

export interface UpdateUserDto extends Partial<Omit<CreateUserDto, 'password'>> {
}
