import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreatePatientDto, UpdatePatientDto } from './dto/patient.dto';

@Injectable()
export class PatientService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.patient.findMany({
      include: {
        user: true,
      },
    });
  }

  async findOne(id: number) {
    const patient = await this.prisma.patient.findUnique({
      where: { id },
      include: {
        user: true,
      },
    });

    if (!patient) {
      throw new NotFoundException(`Patient with ID ${id} not found`);
    }

    return patient;
  }

  async findByUserId(userId: number) {
    const patient = await this.prisma.patient.findUnique({
      where: { userId },
      include: {
        user: true,
      },
    });

    if (!patient) {
      throw new NotFoundException(`Patient with User ID ${userId} not found`);
    }

    return patient;
  }

  async create(createPatientDto: CreatePatientDto) {
    const { userId, ...patientData } = createPatientDto;

    // Check if user exists
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    // Update user role to PATIENT
    await this.prisma.user.update({
      where: { id: userId },
      data: { role: 'PATIENT' },
    });

    // Create patient profile
    return this.prisma.patient.create({
      data: {
        userId,
        ...patientData,
      },
      include: {
        user: true,
      },
    });
  }

  async update(id: number, updatePatientDto: UpdatePatientDto) {
    // Check if patient exists
    await this.findOne(id);

    return this.prisma.patient.update({
      where: { id },
      data: updatePatientDto,
      include: {
        user: true,
      },
    });
  }

  async remove(id: number) {
    // Check if patient exists
    const patient = await this.findOne(id);

    // Delete patient
    await this.prisma.patient.delete({
      where: { id },
    });

    // Update user role back to default if needed
    await this.prisma.user.update({
      where: { id: patient.userId },
      data: { role: 'PATIENT' }, // Keep as PATIENT or change as needed
    });

    return { message: `Patient with ID ${id} deleted successfully` };
  }
}
