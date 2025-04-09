import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { 
  CreateConsultationDto, 
  UpdateConsultationDto, 
  UpdateConsultationStatusDto,
  BookingRequestDto
} from './dto/consultation.dto';
import { ConsultationStatus } from '@prisma/client';
import * as crypto from 'crypto';

@Injectable()
export class ConsultationService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.consultation.findMany({
      include: {
        patient: true,
        practitioner: true,
      },
    });
  }

  async findOne(id: number) {
    const consultation = await this.prisma.consultation.findUnique({
      where: { id },
      include: {
        patient: true,
        practitioner: true,
        feedback: true,
      },
    });

    if (!consultation) {
      throw new NotFoundException(`Consultation with ID ${id} not found`);
    }

    return consultation;
  }

  async findByPatientId(patientId: number) {
    return this.prisma.consultation.findMany({
      where: { patientId },
      include: {
        patient: true,
        practitioner: true,
        feedback: true,
      },
      orderBy: {
        scheduledStart: 'desc',
      },
    });
  }

  async findByPractitionerId(practitionerId: number) {
    return this.prisma.consultation.findMany({
      where: { practitionerId },
      include: {
        patient: true,
        practitioner: true,
        feedback: true,
      },
      orderBy: {
        scheduledStart: 'desc',
      },
    });
  }

  async create(createConsultationDto: CreateConsultationDto) {
    const { patientId, practitionerId } = createConsultationDto;

    // Check if patient exists
    const patient = await this.prisma.user.findUnique({
      where: { id: patientId },
    });

    if (!patient) {
      throw new NotFoundException(`Patient with ID ${patientId} not found`);
    }

    // Check if practitioner exists if provided
    if (practitionerId) {
      const practitioner = await this.prisma.user.findUnique({
        where: { id: practitionerId },
      });

      if (!practitioner) {
        throw new NotFoundException(`Practitioner with ID ${practitionerId} not found`);
      }
    }

    // Create consultation
    return this.prisma.consultation.create({
      data: createConsultationDto,
      include: {
        patient: true,
        practitioner: true,
      },
    });
  }

  async update(id: number, updateConsultationDto: UpdateConsultationDto) {
    // Check if consultation exists
    await this.findOne(id);

    // Check if practitioner exists if provided
    if (updateConsultationDto.practitionerId) {
      const practitioner = await this.prisma.user.findUnique({
        where: { id: updateConsultationDto.practitionerId },
      });

      if (!practitioner) {
        throw new NotFoundException(
          `Practitioner with ID ${updateConsultationDto.practitionerId} not found`,
        );
      }
    }

    return this.prisma.consultation.update({
      where: { id },
      data: updateConsultationDto,
      include: {
        patient: true,
        practitioner: true,
      },
    });
  }

  async updateStatus(id: number, updateStatusDto: UpdateConsultationStatusDto) {
    // Check if consultation exists
    await this.findOne(id);

    return this.prisma.consultation.update({
      where: { id },
      data: {
        status: updateStatusDto.status,
        ...(updateStatusDto.status === ConsultationStatus.ACTIVE && {
          actualStart: new Date(),
        }),
        ...(updateStatusDto.status === ConsultationStatus.COMPLETED && {
          actualEnd: new Date(),
        }),
      },
      include: {
        patient: true,
        practitioner: true,
      },
    });
  }

  async remove(id: number) {
    // Check if consultation exists
    await this.findOne(id);

    await this.prisma.consultation.delete({
      where: { id },
    });

    return { message: `Consultation with ID ${id} deleted successfully` };
  }

  async generateJoinLink(id: number) {
    // Check if consultation exists
    const consultation = await this.findOne(id);

    // Only generate join link for upcoming or active consultations
    if (
      ![
        ConsultationStatus.SCHEDULED,
        ConsultationStatus.CONFIRMED,
        ConsultationStatus.ACTIVE,
      ].includes(consultation.status)
    ) {
      throw new BadRequestException(
        `Cannot generate join link for consultation with status ${consultation.status}`,
      );
    }

    // Generate a unique token
    const token = crypto.randomBytes(32).toString('hex');
    
    // Create a join link
    const joinLink = `${process.env.FRONTEND_URL}/consultation/join/${id}?token=${token}`;

    // Update the consultation with the join link
    await this.prisma.consultation.update({
      where: { id },
      data: { joinLink },
    });

    return { joinLink };
  }

  async createBookingRequest(bookingRequestDto: BookingRequestDto) {
    const { patientId } = bookingRequestDto;

    // Check if patient exists
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
    });

    if (!patient) {
      throw new NotFoundException(`Patient with ID ${patientId} not found`);
    }

    // Create booking request
    return this.prisma.bookingRequest.create({
      data: bookingRequestDto,
      include: {
        patient: {
          include: {
            user: true,
          },
        },
      },
    });
  }

  async approveBookingRequest(bookingRequestId: number, consultationData: CreateConsultationDto) {
    // Check if booking request exists
    const bookingRequest = await this.prisma.bookingRequest.findUnique({
      where: { id: bookingRequestId },
      include: {
        patient: true,
      },
    });

    if (!bookingRequest) {
      throw new NotFoundException(`Booking request with ID ${bookingRequestId} not found`);
    }

    // Create consultation from booking request
    const consultation = await this.create(consultationData);

    // Update booking request status and link to consultation
    await this.prisma.bookingRequest.update({
      where: { id: bookingRequestId },
      data: {
        status: 'APPROVED',
        consultationId: consultation.id,
      },
    });

    return consultation;
  }
}
