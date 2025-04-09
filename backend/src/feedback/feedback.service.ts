import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateFeedbackDto, UpdateFeedbackDto } from './dto/feedback.dto';
import { ConsultationStatus } from '@prisma/client';

@Injectable()
export class FeedbackService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.feedback.findMany({
      include: {
        consultation: {
          include: {
            patient: true,
            practitioner: true,
          },
        },
      },
    });
  }

  async findOne(id: number) {
    const feedback = await this.prisma.feedback.findUnique({
      where: { id },
      include: {
        consultation: {
          include: {
            patient: true,
            practitioner: true,
          },
        },
      },
    });

    if (!feedback) {
      throw new NotFoundException(`Feedback with ID ${id} not found`);
    }

    return feedback;
  }

  async findByConsultationId(consultationId: number) {
    const feedback = await this.prisma.feedback.findUnique({
      where: { consultationId },
      include: {
        consultation: {
          include: {
            patient: true,
            practitioner: true,
          },
        },
      },
    });

    if (!feedback) {
      throw new NotFoundException(`Feedback for consultation ID ${consultationId} not found`);
    }

    return feedback;
  }

  async create(createFeedbackDto: CreateFeedbackDto) {
    const { consultationId } = createFeedbackDto;

    // Check if consultation exists
    const consultation = await this.prisma.consultation.findUnique({
      where: { id: consultationId },
    });

    if (!consultation) {
      throw new NotFoundException(`Consultation with ID ${consultationId} not found`);
    }

    // Check if consultation is completed
    if (consultation.status !== ConsultationStatus.COMPLETED) {
      throw new BadRequestException(
        `Cannot provide feedback for consultation with status ${consultation.status}`,
      );
    }

    // Check if feedback already exists
    const existingFeedback = await this.prisma.feedback.findUnique({
      where: { consultationId },
    });

    if (existingFeedback) {
      throw new BadRequestException(
        `Feedback already exists for consultation with ID ${consultationId}`,
      );
    }

    // Create feedback
    return this.prisma.feedback.create({
      data: createFeedbackDto,
      include: {
        consultation: {
          include: {
            patient: true,
            practitioner: true,
          },
        },
      },
    });
  }

  async update(id: number, updateFeedbackDto: UpdateFeedbackDto) {
    // Check if feedback exists
    await this.findOne(id);

    return this.prisma.feedback.update({
      where: { id },
      data: updateFeedbackDto,
      include: {
        consultation: {
          include: {
            patient: true,
            practitioner: true,
          },
        },
      },
    });
  }

  async remove(id: number) {
    // Check if feedback exists
    await this.findOne(id);

    await this.prisma.feedback.delete({
      where: { id },
    });

    return { message: `Feedback with ID ${id} deleted successfully` };
  }
}
