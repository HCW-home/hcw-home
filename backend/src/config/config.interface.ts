import { Environment } from './environment.enum';

export interface AppConfig {
  port: number;
  environment: Environment;
  database: {
    url: string;
  };
  jwt: {
    accessSecret: string,
    accessExpiresIn: string,
    refreshSecret: string,
    refreshExpiresIn: string,
  };
  cors: {
    origin: string;
  };
  swagger: {
    title: string;
    description: string;
    version: string;
  };
}
