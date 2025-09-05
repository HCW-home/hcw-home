export const RoutePaths = {
  // Main Dashboard - Primary patient entry point
  PatientDashboard: 'dashboard',
  Dashboard: 'dashboard', // Alias for backwards compatibility

  // Core User Routes
  Login: 'login',
  Profile: 'profile',

  // Consultation Flow - Essential functionality
  ConsultationRequest: 'consultation-request',
  PostConsultationFeedback: 'post-consultation-feedback',
  WaitingRoom: 'waiting-room',
  ConsultationRoom: 'consultation-room',
  JoinConsultation: 'join-consultation',

  // Terms and Legal Routes  
  AcceptTerm: 'accept-terms',

  // Route Generators - Helper functions for dynamic routes
  generateWaitingRoomRoute: (consultationId: number | string) => `waiting-room/${consultationId}`,
  generateConsultationRoomRoute: (consultationId: number | string) => `consultation-room/${consultationId}`,
  generateJoinConsultationRoute: (id: number | string) => `join-consultation/${id}`,
  generateJoinConsultationTokenRoute: (token: string) => `join-consultation/token/${token}`,
};
