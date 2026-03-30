import {
  Injectable,
} from '@nestjs/common';
import { HttpExceptionHelper } from '../common/helpers/execption/http-exception.helper';
import { DatabaseService } from '../database/database.service';
import { CreateAvailabilityDto } from './dto/create-availability.dto';
import { UpdateAvailabilityDto } from './dto/update-availability.dto';
import { CreateTimeSlotDto } from './dto/time-slot.dto';

@Injectable()
export class AvailabilityService {
  constructor(private databaseService: DatabaseService) { }

  async createAvailability(createAvailabilityDto: CreateAvailabilityDto) {
    const existingAvailability =
      await this.databaseService.practitionerAvailability.findFirst({
        where: {
          practitionerId: createAvailabilityDto.practitionerId,
          dayOfWeek: createAvailabilityDto.dayOfWeek,
          isActive: true,
        },
      });

    if (existingAvailability) {
      throw HttpExceptionHelper.conflict('Availability already exists for this day');
    }

    return this.databaseService.practitionerAvailability.create({
      data: createAvailabilityDto,
      include: {
        practitioner: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });
  }

  async findAllByPractitioner(practitionerId: number) {
    return this.databaseService.practitionerAvailability.findMany({
      where: {
        practitionerId,
        isActive: true,
      },
      include: {
        practitioner: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      orderBy: {
        dayOfWeek: 'asc',
      },
    });
  }

  async findAll() {
    return (this.databaseService as any).practitionerAvailability.findMany({
      where: {
        isActive: true,
      },
      include: {
        practitioner: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      orderBy: [{ practitionerId: 'asc' }, { dayOfWeek: 'asc' }],
    });
  }

  async findOne(id: number) {
    const availability =
      await this.databaseService.practitionerAvailability.findUnique({
        where: { id },
        include: {
          practitioner: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      });

    if (!availability) {
      throw HttpExceptionHelper.notFound('Availability not found');
    }

    return availability;
  }

  async update(id: number, updateAvailabilityDto: UpdateAvailabilityDto) {
    await this.findOne(id);

    return this.databaseService.practitionerAvailability.update({
      where: { id },
      data: updateAvailabilityDto,
      include: {
        practitioner: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });
  }

  async remove(id: number) {
    await this.findOne(id);

    return this.databaseService.practitionerAvailability.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async generateTimeSlots(
    practitionerId: number,
    startDate: Date,
    endDate: Date,
  ) {
    const availabilities = await this.findAllByPractitioner(practitionerId);
    const timeSlots: any[] = [];

    for (
      let date = new Date(startDate);
      date <= endDate;
      date.setDate(date.getDate() + 1)
    ) {
      const dayOfWeek = date.getDay();
      const availability = availabilities.find(
        (a) => a.dayOfWeek === dayOfWeek,
      );

      if (availability) {
        const slots = this.generateSlotsForDay(
          practitionerId,
          new Date(date),
          availability.startTime,
          availability.endTime,
          availability.slotDuration,
        );
        timeSlots.push(...slots);
      }
    }

    const existingSlots = await this.databaseService.timeSlot.findMany({
      where: {
        practitionerId,
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    const existingSlotKeys = new Set(
      existingSlots.map(
        (slot) => `${slot.date.toISOString().split('T')[0]}_${slot.startTime}`,
      ),
    );

    const newSlots = timeSlots.filter(
      (slot: any) =>
        !existingSlotKeys.has(
          `${slot.date.toISOString().split('T')[0]}_${slot.startTime}`,
        ),
    );

    if (newSlots.length > 0) {
      await this.databaseService.timeSlot.createMany({
        data: newSlots,
      });
    }

    return this.getAvailableSlots(practitionerId, startDate, endDate);
  }

  private generateSlotsForDay(
    practitionerId: number,
    date: Date,
    startTime: string,
    endTime: string,
    slotDuration: number,
  ): any[] {
    const slots: any[] = [];
    const [startHour, startMinute] = startTime.split(':').map(Number);
    const [endHour, endMinute] = endTime.split(':').map(Number);

    let currentTime = startHour * 60 + startMinute;
    const endTimeMinutes = endHour * 60 + endMinute;

    while (currentTime + slotDuration <= endTimeMinutes) {
      const slotStartHour = Math.floor(currentTime / 60);
      const slotStartMinute = currentTime % 60;
      const slotEndTime = currentTime + slotDuration;
      const slotEndHour = Math.floor(slotEndTime / 60);
      const slotEndMinute = slotEndTime % 60;

      slots.push({
        practitionerId,
        date: new Date(
          Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
        ),
        startTime: `${slotStartHour.toString().padStart(2, '0')}:${slotStartMinute.toString().padStart(2, '0')}`,
        endTime: `${slotEndHour.toString().padStart(2, '0')}:${slotEndMinute.toString().padStart(2, '0')}`,
        status: 'AVAILABLE',
      });

      currentTime += slotDuration;
    }

    return slots;
  }

  async getAvailableSlots(
    practitionerId: number,
    startDate: Date,
    endDate: Date,
  ) {

    const start = new Date(startDate);
    start.setUTCHours(0, 0, 0, 0);

    const end = new Date(endDate);
    end.setUTCHours(23, 59, 59, 999);

    return this.databaseService.timeSlot.findMany({
      where: {
        practitionerId,
        date: {
          gte: start,
          lte: end,
        },
        status: 'AVAILABLE',
      },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });
  }

  async bookTimeSlot(timeSlotId: number, consultationId: number) {
    const timeSlot = await this.databaseService.timeSlot.findUnique({
      where: { id: timeSlotId },
    });

    if (!timeSlot) {
      throw HttpExceptionHelper.notFound('Time slot not found');
    }

    if (timeSlot.status !== 'AVAILABLE') {
      throw HttpExceptionHelper.conflict('Time slot is not available');
    }

    return this.databaseService.timeSlot.update({
      where: { id: timeSlotId },
      data: {
        status: 'BOOKED',
        consultationId,
      },
    });
  }

  async releaseTimeSlot(timeSlotId: number) {
    return this.databaseService.timeSlot.update({
      where: { id: timeSlotId },
      data: {
        status: 'AVAILABLE',
        consultationId: null,
      },
    });
  }
}
