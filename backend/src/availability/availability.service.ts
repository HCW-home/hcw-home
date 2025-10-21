import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateAvailabilityDto } from './dto/create-availability.dto';
import { UpdateAvailabilityDto } from './dto/update-availability.dto';
import { CreateTimeSlotDto } from './dto/time-slot.dto';

// Interface for raw availability data
interface RawAvailabilityData {
  practitionerId: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  slotDuration: number;
  isActive: boolean;
}

@Injectable()
export class AvailabilityService {
  constructor(private databaseService: DatabaseService) {}

  async createAvailabilityRaw(data: RawAvailabilityData) {
    try {
      console.log('Service: Creating availability with raw data:', data);
      
      // All data should already be of the correct type, just double-checking
      if (typeof data.practitionerId !== 'number' || data.practitionerId <= 0) {
        throw new BadRequestException('Valid practitionerId is required');
      }
      
      if (typeof data.dayOfWeek !== 'number' || data.dayOfWeek < 0 || data.dayOfWeek > 6) {
        throw new BadRequestException('dayOfWeek must be between 0 and 6');
      }
      
      if (!data.startTime || typeof data.startTime !== 'string') {
        throw new BadRequestException('Valid startTime is required');
      }
      
      if (!data.endTime || typeof data.endTime !== 'string') {
        throw new BadRequestException('Valid endTime is required');
      }
      
      if (typeof data.slotDuration !== 'number' || data.slotDuration < 15 || data.slotDuration > 120) {
        throw new BadRequestException('slotDuration must be between 15 and 120 minutes');
      }
      
      // Check if availability already exists for this day
      const existingAvailability =
        await this.databaseService.practitionerAvailability.findFirst({
          where: {
            practitionerId: data.practitionerId,
            dayOfWeek: data.dayOfWeek,
            isActive: true,
          },
        });

      if (existingAvailability) {
        console.log('Service: Availability already exists, updating instead');
        // Instead of throwing an error, update the existing availability
        const updatedAvailability = await this.databaseService.practitionerAvailability.update({
          where: { id: existingAvailability.id },
          data: {
            startTime: data.startTime,
            endTime: data.endTime,
            slotDuration: data.slotDuration,
            isActive: data.isActive
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
        });
        
        console.log('Service: Successfully updated existing availability:', updatedAvailability);
        return updatedAvailability;
      }

      // Data is already prepared with proper types
      console.log('Service: Creating new availability');
      
      const result = await this.databaseService.practitionerAvailability.create({
        data: {
          practitionerId: data.practitionerId,
          dayOfWeek: data.dayOfWeek,
          startTime: data.startTime,
          endTime: data.endTime,
          slotDuration: data.slotDuration,
          isActive: data.isActive
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
      });

      console.log('Service: Successfully created availability:', result);
      
      // Immediately test if we can find this record
      const testFind = await this.databaseService.practitionerAvailability.findMany({
        where: {
          practitionerId: data.practitionerId,
          isActive: true,
        }
      });
      console.log(`Service: Test find after creation found ${testFind.length} records for practitioner ${data.practitionerId}:`, testFind);
      
      return result;
    } catch (error) {
      console.error('Service: Error in createAvailabilityRaw:', error);
      throw error;
    }
  }
  
  // Keep the original method for backward compatibility
  async createAvailability(data: CreateAvailabilityDto) {
    try {
      // Convert the DTO to raw data
      const rawData: RawAvailabilityData = {
        practitionerId: Number(data.practitionerId),
        dayOfWeek: Number(data.dayOfWeek),
        startTime: data.startTime,
        endTime: data.endTime,
        slotDuration: Number(data.slotDuration || 30),
        isActive: data.isActive !== false
      };
      
      return this.createAvailabilityRaw(rawData);
    } catch (error) {
      console.error('Service: Error in createAvailability:', error);
      throw error;
    }
  }

  async findAllByPractitioner(practitionerId: number) {
    console.log(`[Service] findAllByPractitioner called with practitionerId: ${practitionerId}`);
    const result = await this.databaseService.practitionerAvailability.findMany({
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
    console.log(`[Service] findAllByPractitioner found ${result.length} records:`, result);
    return result;
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
      throw new NotFoundException('Availability not found');
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

  /**
   * Bulk deactivate availabilities for a practitioner for the given days of week
   * and delete future time slots for those weekdays (skipping booked slots).
   * Returns a summary of actions performed.
   */
  async batchDeactivate(practitionerId: number, daysOfWeek: number[]) {
    try {
      console.log(`[batchDeactivate] practitioner=${practitionerId}, days=${JSON.stringify(daysOfWeek)}`);

      if (!practitionerId || isNaN(practitionerId)) {
        throw new BadRequestException('Valid practitionerId is required');
      }

      if (!Array.isArray(daysOfWeek) || daysOfWeek.length === 0) {
        return {
          deactivatedAvailabilities: 0,
          deletedTimeSlots: 0,
          skippedBookedSlots: 0,
          skippedBookedSlotIds: [],
        };
      }

      // Normalize days array to valid integers 0-6
      const validDays = Array.from(new Set(daysOfWeek.map((d) => Number(d)).filter((d) => !isNaN(d) && d >= 0 && d <= 6)));

      if (validDays.length === 0) {
        throw new BadRequestException('daysOfWeek must contain integers between 0 and 6');
      }

      // Deactivate availability records in bulk
      const deactivateResult = await this.databaseService.practitionerAvailability.updateMany({
        where: {
          practitionerId,
          dayOfWeek: { in: validDays as any },
          isActive: true,
        },
        data: { isActive: false },
      });

      const deactivatedCount = (deactivateResult && (deactivateResult as any).count) || 0;
      console.log(`[batchDeactivate] deactivated availabilities: ${deactivatedCount}`);

      // Compute future dates (up to 90 days) that match the provided weekdays
      const datesToDelete: Date[] = [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const horizonDays = 90; // match generate-time limit
      const end = new Date(today.getTime() + horizonDays * 24 * 60 * 60 * 1000);

      for (let d = new Date(today); d <= end; d.setDate(d.getDate() + 1)) {
        const dow = d.getDay();
        if (validDays.includes(dow)) {
          // Use UTC midnight same as generator
          datesToDelete.push(new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0)));
        }
      }

      console.log(`[batchDeactivate] computed ${datesToDelete.length} dates to consider for deletion`);

      let skippedBookedSlotIds: number[] = [];
      let deletedCount = 0;

      if (datesToDelete.length > 0) {
        // Find booked slots that should be skipped
        const bookedSlots = await this.databaseService.timeSlot.findMany({
          where: {
            practitionerId,
            date: { in: datesToDelete as any },
            status: 'BOOKED',
          },
          select: { id: true },
        });

        skippedBookedSlotIds = bookedSlots.map((s: any) => s.id);
        console.log(`[batchDeactivate] found ${skippedBookedSlotIds.length} booked slots that will be skipped`);

        // Delete non-booked slots in bulk
        const deleteResult = await this.databaseService.timeSlot.deleteMany({
          where: {
            practitionerId,
            date: { in: datesToDelete as any },
            status: { not: 'BOOKED' },
          },
        });

        deletedCount = (deleteResult && (deleteResult as any).count) || 0;
        console.log(`[batchDeactivate] deleted ${deletedCount} time slots`);
      }

      return {
        deactivatedAvailabilities: deactivatedCount,
        deletedTimeSlots: deletedCount,
        skippedBookedSlots: skippedBookedSlotIds.length,
        skippedBookedSlotIds,
      };
    } catch (error) {
      console.error('[batchDeactivate] error:', error);
      throw error;
    }
  }

  /**
   * Create multiple availabilities in bulk. Expects each item to contain
   * practitionerId, dayOfWeek, startTime, endTime, slotDuration, isActive
   */
  async batchCreateAvailabilities(availabilities: any[]) {
    try {
      if (!Array.isArray(availabilities) || availabilities.length === 0) return [];

      // Validate basic shape and sanitize
      const sanitized = availabilities.map(a => ({
        practitionerId: Number(a.practitionerId),
        dayOfWeek: Number(a.dayOfWeek),
        startTime: String(a.startTime || '').trim(),
        endTime: String(a.endTime || '').trim(),
        slotDuration: Number(a.slotDuration || 30),
        isActive: a.isActive === undefined ? true : Boolean(a.isActive)
      })).filter(a => a.practitionerId && !isNaN(a.dayOfWeek));

      if (sanitized.length === 0) return [];

      // createMany for efficiency (note: createMany may not return created records depending on DB, so read them back)
      await this.databaseService.practitionerAvailability.createMany({ data: sanitized, skipDuplicates: true });

      // Return all availabilities for these practitioners and days that match our sanitized input
      const practitionerId = sanitized[0].practitionerId;
      const days = Array.from(new Set(sanitized.map(s => s.dayOfWeek)));

      const found = await this.databaseService.practitionerAvailability.findMany({
        where: {
          practitionerId,
          dayOfWeek: { in: days as any },
        }
      });

      return found;
    } catch (error) {
      console.error('Error in batchCreateAvailabilities:', error);
      throw error;
    }
  }

  async generateTimeSlots(
    practitionerId: number,
    startDate: Date,
    endDate: Date,
  ) {
    try {
      console.log(`Generating time slots for practitioner ${practitionerId} from ${startDate} to ${endDate}`);
      
      // Get all active availabilities for this practitioner
      const availabilities = await this.findAllByPractitioner(practitionerId);
      console.log(`Found ${availabilities.length} availability configurations`);
      
      if (availabilities.length === 0) {
        return [];
      }
      
      const timeSlots: any[] = [];

      // Create a new date object to avoid mutating the input
      for (
        let currentDate = new Date(startDate);
        currentDate <= endDate;
        currentDate.setDate(currentDate.getDate() + 1)
      ) {
        const dayOfWeek = currentDate.getDay();
        const availability = availabilities.find(
          (a) => a.dayOfWeek === dayOfWeek && a.isActive === true,
        );

        if (availability) {
          console.log(`Generating slots for ${new Date(currentDate).toISOString().split('T')[0]} (day ${dayOfWeek})`);
          
          // Clone the date to avoid mutation
          const slots = this.generateSlotsForDay(
            practitionerId,
            new Date(currentDate),
            availability.startTime,
            availability.endTime,
            availability.slotDuration,
          );
          
          console.log(`Generated ${slots.length} slots for ${new Date(currentDate).toISOString().split('T')[0]}`);
          timeSlots.push(...slots);
        }
      }

      console.log(`Total generated slots: ${timeSlots.length}`);
      
      // Find existing slots to avoid duplicates
      const existingSlots = await this.databaseService.timeSlot.findMany({
        where: {
          practitionerId,
          date: {
            gte: startDate,
            lte: endDate,
          },
        },
      });
      
      console.log(`Found ${existingSlots.length} existing slots`);

      // Create a set of existing slot keys for efficient lookup
      const existingSlotKeys = new Set(
        existingSlots.map(
          (slot) => `${slot.date.toISOString().split('T')[0]}_${slot.startTime}`,
        ),
      );

      // Filter out slots that already exist
      const newSlots = timeSlots.filter(
        (slot: any) => {
          const key = `${slot.date.toISOString().split('T')[0]}_${slot.startTime}`;
          return !existingSlotKeys.has(key);
        }
      );
      
      console.log(`New slots to be created: ${newSlots.length}`);

      if (newSlots.length > 0) {
        await this.databaseService.timeSlot.createMany({
          data: newSlots,
        });
        console.log(`Successfully created ${newSlots.length} new time slots`);
      }

      // Return all slots for the date range
      return this.getPractitionerSlots(practitionerId, startDate, endDate);
    } catch (error) {
      console.error('Error generating time slots:', error);
      throw error;
    }
  }

  private generateSlotsForDay(
    practitionerId: number,
    date: Date,
    startTime: string,
    endTime: string,
    slotDuration: number,
  ): any[] {
    try {
      const slots: any[] = [];
      
      // Parse start and end times
      const [startHour, startMinute] = startTime.split(':').map(Number);
      const [endHour, endMinute] = endTime.split(':').map(Number);

      // Convert times to minutes for easier calculation
      let currentTime = startHour * 60 + startMinute;
      const endTimeMinutes = endHour * 60 + endMinute;

      // Validate inputs
      if (isNaN(currentTime) || isNaN(endTimeMinutes)) {
        console.error(`Invalid time format: start=${startTime}, end=${endTime}`);
        return [];
      }

      if (isNaN(slotDuration) || slotDuration <= 0) {
        console.error(`Invalid slot duration: ${slotDuration}`);
        return [];
      }
      
      console.log(`Generating slots for day: ${date.toISOString().split('T')[0]}, ` +
                  `startTime: ${startTime}, endTime: ${endTime}, duration: ${slotDuration}min`);
      
      // Generate slots until we reach or exceed end time
      while (currentTime + slotDuration <= endTimeMinutes) {
        const slotStartHour = Math.floor(currentTime / 60);
        const slotStartMinute = currentTime % 60;
        const slotEndTime = currentTime + slotDuration;
        const slotEndHour = Math.floor(slotEndTime / 60);
        const slotEndMinute = slotEndTime % 60;

        // Format times with leading zeros
        const formattedStartTime = `${slotStartHour.toString().padStart(2, '0')}:${slotStartMinute.toString().padStart(2, '0')}`;
        const formattedEndTime = `${slotEndHour.toString().padStart(2, '0')}:${slotEndMinute.toString().padStart(2, '0')}`;
        
        // Create UTC date at midnight for consistent storage
        const slotDate = new Date(
          Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0)
        );
        
        slots.push({
          practitionerId,
          date: slotDate,
          startTime: formattedStartTime,
          endTime: formattedEndTime,
          status: 'AVAILABLE',
        });

        // Move to next slot start time
        currentTime += slotDuration;
      }

      console.log(`Generated ${slots.length} slots for ${date.toISOString().split('T')[0]}`);
      return slots;
    } catch (error) {
      console.error('Error generating slots for day:', error);
      return [];
    }
  }

  async getAvailableSlots(
    practitionerId: number,
    startDate: Date,
    endDate: Date,
  ) {
    try {
      const start = new Date(startDate);
      start.setUTCHours(0, 0, 0, 0);
  
      const end = new Date(endDate);
      end.setUTCHours(23, 59, 59, 999);
  
      // Get the current date and time to filter out past slots
      const now = new Date();
      const currentDate = new Date();
      currentDate.setHours(0, 0, 0, 0);
  
      return this.databaseService.timeSlot.findMany({
        where: {
          practitionerId,
          date: {
            gte: start,
            lte: end,
          },
          OR: [
            {
              // Future dates
              date: {
                gt: currentDate
              }
            },
            {
              // Today but future time
              date: {
                equals: currentDate
              },
              startTime: {
                gt: `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
              }
            }
          ]
        },
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      });
    } catch (error) {
      console.error('Error getting available slots:', error);
      return []; // Return empty array instead of failing
    }
  }
  
  async getPractitionerSlots(
    practitionerId: number,
    startDate?: Date,
    endDate?: Date,
  ) {
    try {
      console.log(`[getPractitionerSlots] Called with practitioner ${practitionerId}, startDate: ${startDate}, endDate: ${endDate}`);
      
      // If dates are missing or invalid, provide sensible defaults
      const now = new Date();
      console.log(`[getPractitionerSlots] Current time: ${now.toISOString()} (${now.toDateString()})`);
      
      const start = startDate && !isNaN(new Date(startDate).getTime())
        ? new Date(startDate)
        : new Date(now);
        
      // DON'T set hours to 0 UTC as this might exclude current day in some timezones
      // Instead, use local date comparison
      start.setHours(0, 0, 0, 0);
      console.log(`[getPractitionerSlots] Start date before UTC conversion: ${start.toISOString()} (local: ${start.toDateString()})`);

      const defaultEnd = new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000);
      const end = endDate && !isNaN(new Date(endDate).getTime())
        ? new Date(endDate)
        : defaultEnd;
      // Set to end of day
      end.setHours(23, 59, 59, 999);
      console.log(`[getPractitionerSlots] End date before UTC conversion: ${end.toISOString()} (local: ${end.toDateString()})`);

      console.log(`[getPractitionerSlots] Final date range for DB query: ${start.toISOString()} to ${end.toISOString()}`);
      console.log(`[getPractitionerSlots] Local dates: ${start.toDateString()} to ${end.toDateString()}`);

      // Get all slots regardless of status
      const slots = await this.databaseService.timeSlot.findMany({
        where: {
          practitionerId,
          date: {
            gte: start,
            lte: end,
          },
        },
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      });
      
      console.log(`[getPractitionerSlots] Found ${slots.length} slots in database for practitioner ${practitionerId}`);
      if (slots.length > 0) {
        console.log(`[getPractitionerSlots] Sample slots:`, slots.slice(0, 3).map(s => ({
          id: s.id,
          date: s.date,
          startTime: s.startTime,
          status: s.status
        })));
      }
      
      return slots;
    } catch (error) {
      console.error('Error getting practitioner slots:', error);
      return []; // Return empty array instead of failing
    }
  }

  async getAllPractitionerSlotsDebug(practitionerId: number) {
    try {
      console.log(`[DEBUG] Getting all slots for practitioner ${practitionerId} without date filtering`);
      
      const slots = await this.databaseService.timeSlot.findMany({
        where: {
          practitionerId,
        },
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      });
      
      console.log(`[DEBUG] Found ${slots.length} total slots in database for practitioner ${practitionerId}`);
      return slots;
    } catch (error) {
      console.error('Error getting all practitioner slots (debug):', error);
      return [];
    }
  }

  async bookTimeSlot(timeSlotId: number, consultationId: number) {
    const timeSlot = await this.databaseService.timeSlot.findUnique({
      where: { id: timeSlotId },
    });

    if (!timeSlot) {
      throw new NotFoundException('Time slot not found');
    }

    if (timeSlot.status !== 'AVAILABLE') {
      throw new ConflictException('Time slot is not available');
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

  async updateSlotStatus(slotId: number, status: 'AVAILABLE' | 'BLOCKED', practitionerId: number) {
    // First check if the slot belongs to this practitioner
    const timeSlot = await this.databaseService.timeSlot.findFirst({
      where: {
        id: slotId,
        practitionerId,
      },
    });

    if (!timeSlot) {
      throw new NotFoundException('Time slot not found or you do not have permission to modify it');
    }

    if (timeSlot.status === 'BOOKED') {
      throw new ConflictException('Cannot modify a booked time slot');
    }

    return this.databaseService.timeSlot.update({
      where: { id: slotId },
      data: { status },
    });
  }

  async deleteTimeSlot(slotId: number, practitionerId: number) {
    // Check if the slot exists and belongs to the practitioner
    const timeSlot = await this.databaseService.timeSlot.findFirst({
      where: {
        id: slotId,
        practitionerId,
      },
    });

    if (!timeSlot) {
      throw new NotFoundException('Time slot not found or you do not have permission to delete it');
    }

    if (timeSlot.status === 'BOOKED') {
      throw new ConflictException('Cannot delete a booked time slot');
    }

    // Delete the time slot
    return this.databaseService.timeSlot.delete({
      where: { id: slotId },
    });
  }
}
