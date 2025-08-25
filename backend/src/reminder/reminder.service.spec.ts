import { Test, TestingModule } from '@nestjs/testing';
import { ReminderService } from './reminder.service';
import { DatabaseService } from 'src/database/database.service';
import { ConfigService } from 'src/config/config.service';
import { SmsProviderService } from 'src/sms_provider/sms_provider.service';
import { ReminderType, ReminderStatus } from './reminder.constants';
import { ConsultationStatus, ReminderStatus as PrismaReminderStatus } from '@prisma/client';
import { Logger } from '@nestjs/common';

describe('ReminderService', () => {
  let service: ReminderService;
  let dbServiceMock: any;
  let configServiceMock: any;
  let smsProviderServiceMock: any;

  beforeEach(async () => {
    // Create mocks
    dbServiceMock = {
      consultationReminder: {
        create: jest.fn(),
        updateMany: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      consultation: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    configServiceMock = {};
    smsProviderServiceMock = {};

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReminderService,
        {
          provide: DatabaseService,
          useValue: dbServiceMock,
        },
        {
          provide: ConfigService,
          useValue: configServiceMock,
        },
        {
          provide: SmsProviderService,
          useValue: smsProviderServiceMock,
        },
      ],
    }).compile();

    service = module.get<ReminderService>(ReminderService);
    // Mock Logger to avoid console output during tests
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('scheduleReminders', () => {
    it('should schedule reminders for future consultation', async () => {
      const consultationId = 1;
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1); // Tomorrow

      await service.scheduleReminders(consultationId, futureDate);

      // Should call cancelReminders first
      expect(dbServiceMock.consultationReminder.updateMany).toHaveBeenCalledWith({
        where: {
          consultationId,
          status: PrismaReminderStatus.PENDING,
        },
        data: {
          status: PrismaReminderStatus.CANCELLED,
        },
      });

      // Should create reminders for default types
      expect(dbServiceMock.consultationReminder.create).toHaveBeenCalledTimes(2);
    });

    it('should not schedule reminders for past consultations', async () => {
      const consultationId = 1;
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1); // Yesterday

      await service.scheduleReminders(consultationId, pastDate);

      // Should call cancelReminders
      expect(dbServiceMock.consultationReminder.updateMany).toHaveBeenCalled();
      // Should not create any reminders
      expect(dbServiceMock.consultationReminder.create).not.toHaveBeenCalled();
    });
  });

  describe('cancelReminders', () => {
    it('should cancel all pending reminders for a consultation', async () => {
      const consultationId = 1;

      await service.cancelReminders(consultationId);

      expect(dbServiceMock.consultationReminder.updateMany).toHaveBeenCalledWith({
        where: {
          consultationId,
          status: PrismaReminderStatus.PENDING,
        },
        data: {
          status: PrismaReminderStatus.CANCELLED,
        },
      });
    });
  });

  describe('processDueReminders', () => {
    it('should process due reminders', async () => {
      const mockReminders = [
        {
          id: 1,
          consultationId: 1,
          type: ReminderType.UPCOMING_APPOINTMENT_24H,
          scheduledFor: new Date(),
          status: PrismaReminderStatus.PENDING,
          consultation: {
            id: 1,
            status: ConsultationStatus.SCHEDULED,
            scheduledDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
            remindersSent: {},
            owner: {
              id: 2,
              firstName: 'Doctor',
              lastName: 'Smith',
              phoneNumber: '+1234567890',
              role: 'PRACTITIONER',
            },
            participants: [
              {
                userId: 3,
                user: {
                  id: 3,
                  firstName: 'John',
                  lastName: 'Doe',
                  phoneNumber: '+9876543210',
                  role: 'PATIENT',
                },
              },
            ],
          },
        },
      ];

      dbServiceMock.consultationReminder.findMany.mockResolvedValue(mockReminders);
      dbServiceMock.consultation.findUnique.mockResolvedValue({
        remindersSent: {},
      });

      await service.processDueReminders();

      // Should update reminder status to SENT
      expect(dbServiceMock.consultationReminder.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: PrismaReminderStatus.SENT, sentAt: expect.any(Date) },
      });

      // Should update consultation remindersSent field
      expect(dbServiceMock.consultation.update).toHaveBeenCalled();
    });

    it('should cancel reminders for non-scheduled consultations', async () => {
      const mockReminders = [
        {
          id: 1,
          consultationId: 1,
          type: ReminderType.UPCOMING_APPOINTMENT_24H,
          scheduledFor: new Date(),
          status: PrismaReminderStatus.PENDING,
          consultation: {
            id: 1,
            status: ConsultationStatus.CANCELLED, // Cancelled status
            scheduledDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
            owner: {
              id: 2,
              firstName: 'Doctor',
              lastName: 'Smith',
              phoneNumber: '+1234567890',
            },
            participants: [
              {
                userId: 3,
                user: {
                  id: 3,
                  firstName: 'John',
                  lastName: 'Doe',
                  phoneNumber: '+9876543210',
                  role: 'PATIENT',
                },
              },
            ],
          },
        },
      ];

      dbServiceMock.consultationReminder.findMany.mockResolvedValue(mockReminders);

      await service.processDueReminders();

      // Should update reminder status to CANCELLED
      expect(dbServiceMock.consultationReminder.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: PrismaReminderStatus.CANCELLED, sentAt: undefined },
      });
    });
  });
});
