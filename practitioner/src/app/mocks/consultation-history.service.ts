import { ConsultationStatus } from '../constants/consultation-status.enum';
import { User } from '../models/consultations/consultation.model';
import { Consultation, Participant, Message, ConsultationHistoryItem, ConsultationDetail } from '../models/consultations/consultation.model';
export const mockUsers: User[] = [
  {
    id: 1,
    role: 'PATIENT',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@email.com',
    temporaryAccount: false,
    phoneNumber: '+1234567890',
    country: 'USA',
    sex: 'MALE',
    status: 'APPROVED',
    createdAt: new Date('2024-01-15T08:30:00Z'),
    updatedAt: new Date('2024-01-15T08:30:00Z'),
  },
  {
    id: 2,
    role: 'PRACTITIONER',
    firstName: 'Dr. Sarah',
    lastName: 'Johnson',
    email: 'sarah.johnson@clinic.com',
    temporaryAccount: false,
    phoneNumber: '+1234567891',
    country: 'USA',
    sex: 'FEMALE',
    status: 'APPROVED',
    createdAt: new Date('2023-12-01T10:00:00Z'),
    updatedAt: new Date('2024-01-10T14:20:00Z'),
  },
  {
    id: 3,
    role: 'PATIENT',
    firstName: 'Maria',
    lastName: 'Garcia',
    email: 'maria.garcia@email.com',
    temporaryAccount: true,
    phoneNumber: '+1234567892',
    country: 'Mexico',
    sex: 'FEMALE',
    status: 'APPROVED',
    createdAt: new Date('2024-02-01T12:15:00Z'),
    updatedAt: new Date('2024-02-01T12:15:00Z'),
  },
  {
    id: 4,
    role: 'ADMIN',
    firstName: 'Mike',
    lastName: 'Wilson',
    email: 'mike.wilson@admin.com',
    temporaryAccount: false,
    phoneNumber: null,
    country: 'Canada',
    sex: 'MALE',
    status: 'APPROVED',
    createdAt: new Date('2023-10-15T09:00:00Z'),
    updatedAt: new Date('2024-01-20T16:45:00Z'),
  },
  {
    id: 5,
    role: 'PATIENT',
    firstName: 'Anonymous',
    lastName: 'User',
    email: undefined,
    temporaryAccount: true,
    phoneNumber: null,
    country: null,
    sex: null,
    status: 'NOT_APPROVED',
    createdAt: new Date('2024-02-10T14:30:00Z'),
    updatedAt: new Date('2024-02-10T14:30:00Z'),
  },
];

// Mock Consultations
export const mockConsultations: Consultation[] = [
  {
    id: 101,
    scheduledDate: new Date('2024-02-15T10:00:00Z'),
    createdAt: new Date('2024-02-10T08:30:00Z'),
    startedAt: new Date('2024-02-15T10:05:00Z'),
    closedAt: new Date('2024-02-15T10:45:00Z'),
    createdBy: 1,
    groupId: 201,
    ownerId: 2,
    whatsappTemplateId: 301,
    status: ConsultationStatus.COMPLETED,
  },
  {
    id: 102,
    scheduledDate: new Date('2024-02-20T14:30:00Z'),
    createdAt: new Date('2024-02-18T09:15:00Z'),
    startedAt: new Date('2024-02-20T14:32:00Z'),
    closedAt: null,
    createdBy: 3,
    groupId: 202,
    ownerId: 2,
    whatsappTemplateId: null,
    status: ConsultationStatus.COMPLETED,
  },
  {
    id: 103,
    scheduledDate: new Date('2024-02-25T16:00:00Z'),
    createdAt: new Date('2024-02-22T11:00:00Z'),
    startedAt: null,
    closedAt: null,
    createdBy: 1,
    groupId: null,
    ownerId: 2,
    whatsappTemplateId: 302,
    status: ConsultationStatus.SCHEDULED,
  },
  {
    id: 104,
    scheduledDate: null,
    createdAt: new Date('2024-02-12T15:20:00Z'),
    startedAt: null,
    closedAt: null,
    createdBy: 5,
    groupId: null,
    ownerId: 2,
    whatsappTemplateId: null,
    status: ConsultationStatus.CANCELLED,
  },
];

export const mockParticipants: Participant[] = [
  {
    id: 1001,
    consultationId: 101,
    userId: 1,
    isActive: false,
    isBeneficiary: true,
    token: 'token_abc123',
    joinedAt: new Date('2024-02-15T10:05:00Z'),
  },
  {
    id: 1002,
    consultationId: 101,
    userId: 2,
    isActive: false,
    isBeneficiary: false,
    token: 'token_def456',
    joinedAt: new Date('2024-02-15T10:03:00Z'),
  },
  {
    id: 1003,
    consultationId: 102,
    userId: 3,
    isActive: true,
    isBeneficiary: true,
    token: 'token_ghi789',
    joinedAt: new Date('2024-02-20T14:32:00Z'),
  },
  {
    id: 1004,
    consultationId: 102,
    userId: 2,
    isActive: true,
    isBeneficiary: false,
    token: 'token_jkl012',
    joinedAt: new Date('2024-02-20T14:30:00Z'),
  },
  {
    id: 1005,
    consultationId: 103,
    userId: 1,
    isActive: false,
    isBeneficiary: true,
    token: null,
    joinedAt: null,
  },
  {
    id: 1006,
    consultationId: 103,
    userId: 2,
    isActive: false,
    isBeneficiary: false,
    token: null,
    joinedAt: null,
  },
];

export const mockMessages: Message[] = [
  {
    id: 2001,
    userId: 1,
    content: "Hello, I'm here for my consultation.",
    consultationId: 101,
    createdAt: new Date('2024-02-15T10:06:00Z'),
  },
  {
    id: 2002,
    userId: 2,
    content: 'Good morning! How are you feeling today?',
    consultationId: 101,
    createdAt: new Date('2024-02-15T10:07:00Z'),
  },
  {
    id: 2003,
    userId: 1,
    content: "I've been having some headaches lately.",
    consultationId: 101,
    createdAt: new Date('2024-02-15T10:08:00Z'),
  },
  {
    id: 2004,
    userId: 2,
    content: 'Can you describe the frequency and intensity of these headaches?',
    consultationId: 101,
    createdAt: new Date('2024-02-15T10:09:00Z'),
  },
  {
    id: 2005,
    userId: 1,
    content: 'They occur about 3-4 times a week, moderate pain.',
    consultationId: 101,
    createdAt: new Date('2024-02-15T10:10:00Z'),
  },
  {
    id: 2006,
    userId: 3,
    content: "Hi doctor, I'm ready for my appointment.",
    consultationId: 102,
    createdAt: new Date('2024-02-20T14:33:00Z'),
  },
  {
    id: 2007,
    userId: 2,
    content: "Welcome! Let's start with your current concerns.",
    consultationId: 102,
    createdAt: new Date('2024-02-20T14:34:00Z'),
  },
  {
    id: 2008,
    userId: 1,
    content: 'Thank you for scheduling this follow-up.',
    consultationId: null,
    createdAt: new Date('2024-02-22T11:30:00Z'),
  },
];

export const mockConsultationHistory: ConsultationHistoryItem[] = [
  {
    consultation: mockConsultations[0],
    patient: mockUsers[0],
    participants: [mockParticipants[0], mockParticipants[1]],
    duration: '40 minutes',
  },
  {
    consultation: mockConsultations[1],
    patient: mockUsers[2],
    participants: [mockParticipants[2], mockParticipants[3]],
    duration: 'In progress',
  },
  {
    consultation: mockConsultations[2],
    patient: mockUsers[0],
    participants: [mockParticipants[4], mockParticipants[5]],
    duration: 'Not started',
  },
];

export const mockConsultationDetails: ConsultationDetail[] = [
  {
    consultation: mockConsultations[0],
    patient: mockUsers[0],
    participants: [mockParticipants[0], mockParticipants[1]],
    duration: '40 minutes',
    messages: mockMessages.filter((msg) => msg.consultationId === 101),
  },
  {
    consultation: mockConsultations[1],
    patient: mockUsers[2],
    participants: [mockParticipants[2], mockParticipants[3]],
    duration: 'In progress',
    messages: mockMessages.filter((msg) => msg.consultationId === 102),
  },
];

export const getMockUserById = (id: number): User | undefined => {
  return mockUsers.find((user) => user.id === id);
};

export const getMockConsultationById = (
  id: number
): Consultation | undefined => {
  return mockConsultations.find((consultation) => consultation.id === id);
};

export const getMockParticipantsByConsultationId = (
  consultationId: number
): Participant[] => {
  return mockParticipants.filter(
    (participant) => participant.consultationId === consultationId
  );
};

export const getMockMessagesByConsultationId = (
  consultationId: number
): Message[] => {
  return mockMessages.filter(
    (message) => message.consultationId === consultationId
  );
};

export const getMockConsultationDetailById = (
  id: number
): ConsultationDetail | undefined => {
  return mockConsultationDetails.find(
    (detail) => detail.consultation.id === id
  );
};
