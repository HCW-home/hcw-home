export const CONSULTATION_GATEWAY_TOKEN = 'CONSULTATION_GATEWAY_TOKEN';

export interface IConsultationGateway {
  server: any;
  emitToRoom(consultationId: number, event: string, data: any): void;
  emitToUser(userId: number, event: string, data: any): void;
  emitPatientJoinedToPractitioner(practitionerId: number, payload: any): void;
}
