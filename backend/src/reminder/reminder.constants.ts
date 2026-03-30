export enum ReminderType {
  UPCOMING_APPOINTMENT_24H = 'UPCOMING_APPOINTMENT_24H',
  UPCOMING_APPOINTMENT_1H = 'UPCOMING_APPOINTMENT_1H',
  UPCOMING_APPOINTMENT_2M = 'UPCOMING_APPOINTMENT_2M', // 2 minutes before - final reminder with join link
}

export enum ReminderStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export const REMINDER_TIMING = {
  [ReminderType.UPCOMING_APPOINTMENT_24H]: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
  [ReminderType.UPCOMING_APPOINTMENT_1H]: 60 * 60 * 1000, // 1 hour in milliseconds
  [ReminderType.UPCOMING_APPOINTMENT_2M]: 2 * 60 * 1000, // 2 minutes in milliseconds
};

export const DEFAULT_REMINDER_TYPES = [
  ReminderType.UPCOMING_APPOINTMENT_24H,
  ReminderType.UPCOMING_APPOINTMENT_1H,
  ReminderType.UPCOMING_APPOINTMENT_2M, // Include 2-minute reminder
];
