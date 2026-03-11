export interface Doctor {
  id?: number;
  pk?: number; // Django REST Framework uses pk instead of id
  first_name: string;
  last_name: string;
  email: string;
  picture?: string;
  specialities?: Speciality[];
  languages?: Language[];
  organisations?: Organisation[];
  main_organisation?: Organisation;
  is_online?: boolean;
  rating?: number;
  reviews_count?: number;
  experience_years?: number;
  consultation_fee?: number;
  about?: string;
  education?: string[];
  availability?: any;
}

export interface Speciality {
  id: number;
  name: string;
  description?: string;
  icon?: string;
}

export interface Language {
  id: number;
  name: string;
  code: string;
}

export interface Organisation {
  id: number;
  name: string;
  address?: string;
  phone?: string;
  logo?: string;
}