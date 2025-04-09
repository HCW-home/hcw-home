import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateConsultationDto } from './dto/create-consultation.dto';
import { UpdateConsultationDto } from './dto/update-consultation.dto';
import { QueryConsultationDto } from './dto/query-consultation.dto';
import { Consultation, ConsultationStatus } from '@prisma/client';
import { RemindersService } from '../reminders/reminders.service';

@Injectable()
export class ConsultationsService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly remindersService: RemindersService
  ) {}

  async create(createConsultationDto: CreateConsultationDto): Promise<Consultation> {
    // Create the consultation
    const consultation = await this.databaseService.consultation.create({
      data: {
        patientId: createConsultationDto.patientId,
        practitionerId: createConsultationDto.practitionerId,
        scheduledAt: new Date(createConsultationDto.scheduledAt),
        notes: createConsultationDto.notes,
      },
    });

    // Create reminders for the consultation
    await this.remindersService.createConsultationReminders(
      consultation.id,
      consultation.patientId,
      consultation.practitionerId,
      consultation.scheduledAt
    );

    return consultation;
  }

  async findAll(query: QueryConsultationDto): Promise<Consultation[]> {
    const filters: any = {};

    if (query.patientId) {
      filters.patientId = query.patientId;
    }

    if (query.practitionerId) {
      filters.practitionerId = query.practitionerId;
    }

    if (query.status) {
      filters.status = query.status;
    }

    if (query.startDate && query.endDate) {
      filters.scheduledAt = {
        gte: new Date(query.startDate),
        lte: new Date(query.endDate),
      };
    } else if (query.startDate) {
      filters.scheduledAt = {
        gte: new Date(query.startDate),
      };
    } else if (query.endDate) {
      filters.scheduledAt = {
        lte: new Date(query.endDate),
      };
    }

    // For patient name search, we need to include the patient relation
    const include: any = {};
    if (query.patientName) {
      include.patient = true;
    }

    const consultations = await this.databaseService.consultation.findMany({
      where: filters,
      include,
      orderBy: {
        scheduledAt: 'desc',
      },
    });

    // Filter by patient name if provided
    if (query.patientName) {
      return consultations.filter((consultation) =>
        consultation.patient.name
          ?.toLowerCase()
          .includes(query.patientName!.toLowerCase()),
      );
    }

    return consultations;
  }

  async findOne(id: number): Promise<Consultation> {
    const consultation = await this.databaseService.consultation.findUnique({
      where: { id },
      include: {
        patient: true,
        practitioner: true,
      },
    });

    if (!consultation) {
      throw new NotFoundException(`Consultation with ID ${id} not found`);
    }

    return consultation;
  }

  async update(
    id: number,
    updateConsultationDto: UpdateConsultationDto,
  ): Promise<Consultation> {
    // Check if consultation exists and get current data
    const existingConsultation = await this.findOne(id);

    const data: any = {};
    let isRescheduled = false;

    if (updateConsultationDto.scheduledAt) {
      data.scheduledAt = new Date(updateConsultationDto.scheduledAt);
      isRescheduled = true;
    }

    if (updateConsultationDto.endedAt) {
      data.endedAt = new Date(updateConsultationDto.endedAt);
    }

    if (updateConsultationDto.status) {
      data.status = updateConsultationDto.status;
    }

    if (updateConsultationDto.notes !== undefined) {
      data.notes = updateConsultationDto.notes;
    }

    // Update the consultation
    const updatedConsultation = await this.databaseService.consultation.update({
      where: { id },
      data,
    });

    // If the consultation was rescheduled, update the reminders
    if (isRescheduled) {
      // First, delete existing reminders for this consultation
      await this.databaseService.reminder.deleteMany({
        where: { consultationId: id, status: 'PENDING' },
      });

      // Create new reminders for the updated schedule
      await this.remindersService.createConsultationReminders(
        updatedConsultation.id,
        updatedConsultation.patientId,
        updatedConsultation.practitionerId,
        updatedConsultation.scheduledAt
      );
    }

    return updatedConsultation;
  }

  async remove(id: number): Promise<Consultation> {
    // Check if consultation exists
    await this.findOne(id);

    // Delete associated reminders first
    await this.databaseService.reminder.deleteMany({
      where: { consultationId: id },
    });

    // Then delete the consultation
    return this.databaseService.consultation.delete({
      where: { id },
    });
  }

  async getPractitionerHistory(
    practitionerId: number,
    query: QueryConsultationDto,
  ): Promise<Consultation[]> {
    // Set practitioner ID in the query
    query.practitionerId = practitionerId;

    // Only get completed consultations for history
    query.status = ConsultationStatus.COMPLETED;

    return this.findAll(query);
  }
}
