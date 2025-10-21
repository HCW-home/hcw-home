import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  ParseIntPipe,
  UseGuards,
  Req,
  Version,
  UseInterceptors,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AvailabilityService } from './availability.service';
import { CreateAvailabilityDto } from './dto/create-availability.dto';
import { UpdateAvailabilityDto } from './dto/update-availability.dto';
import { AvailabilityResponseDto } from './dto/availability-response.dto';
import { TimeSlotResponseDto } from './dto/time-slot.dto';
import { AuthGuard } from '../auth/guards/auth.guard';
// import { TypeTransformInterceptor } from '../common/interceptors/type-transform.interceptor';

@ApiTags('availability')
@ApiBearerAuth()
@UseGuards(AuthGuard)
// @UseInterceptors(TypeTransformInterceptor)
@Controller('availability')
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  @Post('debug')
  @ApiResponse({
    status: 200,
    description: 'Debug endpoint to test data reception.',
  })

  // debug-open endpoint removed. Use test harness or logs instead.
  
  @Post('direct')
  @ApiResponse({
    status: 201,
    description: 'Create availability directly without validation.',
  })
  async directCreate(@Body() body: any, @Req() req: any) {
    try {
      console.log('Direct create with body:', body);

      if (!req.user || !req.user.id) {
        return {
          status: 401,
          message: 'User not authenticated',
          error: true,
        };
      }

      const data = {
        dayOfWeek: Number(body.dayOfWeek),
        startTime: String(body.startTime || ''),
        endTime: String(body.endTime || ''),
        slotDuration: Number(body.slotDuration || 30),
        isActive: body.isActive === true || body.isActive === 'true',
        practitionerId: Number(req.user.id),
      };

      console.log('Processed data for direct create:', data);

      // Basic validation
      if (isNaN(data.dayOfWeek) || data.dayOfWeek < 0 || data.dayOfWeek > 6) {
        return {
          status: 400,
          message: 'Day of week must be between 0 and 6',
          error: true,
        };
      }

      if (!data.startTime || !data.endTime) {
        return {
          status: 400,
          message: 'Start time and end time are required',
          error: true,
        };
      }

      const result = await this.availabilityService.createAvailabilityRaw(data);

      return {
        status: 201,
        message: 'Availability created successfully using direct method',
        data: result,
      };
    } catch (error) {
      console.error('Direct create error:', error);
      return {
        status: 400,
        message: error.message || 'Failed to create availability',
        error: true,
      };
    }
  }

  @Get('test')
  @ApiResponse({
    status: 200,
    description: 'Test endpoint to verify authentication and routing.',
  })
  testEndpoint(@Req() req: any) {
    console.log(`[Controller] GET /availability/test called by user:`, req.user?.id);
    return {
      status: 200,
      message: 'Test endpoint working',
      user: req.user?.id,
      role: req.user?.role,
      timestamp: new Date().toISOString()
    };
  }

  @Post()
  @ApiResponse({
    status: 201,
    description: 'Availability created successfully.',
    type: AvailabilityResponseDto,
  })
  async create(@Body() createAvailabilityDto: CreateAvailabilityDto, @Req() req: any) {
    console.log(`[Controller] POST /availability called with:`, {
      dto: createAvailabilityDto,
      userFromToken: req.user?.id,
      userRole: req.user?.role
    });
    
    try {
      if (!req.user || !req.user.id) {
        console.error(`[Controller] No user in request:`, req.user);
        throw new UnauthorizedException('User not authenticated');
      }

      // Validate required fields
      if (!createAvailabilityDto.practitionerId) {
        throw new BadRequestException('practitionerId is required');
      }

      const data = {
        practitionerId: Number(createAvailabilityDto.practitionerId),
        dayOfWeek: Number(createAvailabilityDto.dayOfWeek),
        startTime: String(createAvailabilityDto.startTime || ''),
        endTime: String(createAvailabilityDto.endTime || ''),
        slotDuration: Number(createAvailabilityDto.slotDuration || 30),
        isActive: createAvailabilityDto.isActive === undefined ? true : Boolean(createAvailabilityDto.isActive),
      };

      console.log(`[Controller] Calling service with processed data:`, data);

      if (!data.practitionerId || data.practitionerId <= 0) {
        throw new BadRequestException('Valid practitionerId is required');
      }

      if (!data.startTime || !data.endTime) {
        throw new BadRequestException('Start time and end time are required');
      }

      const result = await this.availabilityService.createAvailabilityRaw(data);
      console.log(`[Controller] Successfully created availability:`, result);

      return {
        status: 201,
        message: 'Availability created successfully',
        data: result
      };
    } catch (error) {
      console.error(`[Controller] Error creating availability:`, error);

      return {
        status: error.status || 400,
        message: error.message || 'Failed to create availability',
        error: true
      };
    }
  }

  @Get('all')
  @ApiResponse({
    status: 200,
    description: 'All availabilities retrieved successfully (Admin only).',
    type: [AvailabilityResponseDto],
  })
  findAll() {
    return this.availabilityService.findAll();
  }

  @Get('practitioner/:practitionerId')
  @ApiResponse({
    status: 200,
    description: 'Practitioner availability retrieved successfully.',
    type: [AvailabilityResponseDto],
  })
  findAllByPractitioner(
    @Param('practitionerId', ParseIntPipe) practitionerId: number,
  ) {
    console.log(`[findAllByPractitioner] Looking for practitioner ${practitionerId}`);
    const result = this.availabilityService.findAllByPractitioner(practitionerId);
    console.log(`[findAllByPractitioner] Result:`, result);
    return result;
  }

  @Get(':id')
  @ApiResponse({
    status: 200,
    description: 'Availability retrieved successfully.',
    type: AvailabilityResponseDto,
  })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.availabilityService.findOne(id);
  }

  @Patch(':id')
  @ApiResponse({
    status: 200,
    description: 'Availability updated successfully.',
    type: AvailabilityResponseDto,
  })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateAvailabilityDto: UpdateAvailabilityDto,
  ) {
    return this.availabilityService.update(id, updateAvailabilityDto);
  }

  @Post('batch-deactivate')
  @ApiResponse({
    status: 200,
    description: 'Availabilities deactivated successfully.',
  })
  async batchDeactivateForPractitioner(
    @Body() body: { practitionerId: number, daysOfWeek: number[] },
    @Req() req: any,
  ) {
    console.log(`[batchDeactivateForPractitioner] practitionerId=${body.practitionerId}, days=${body.daysOfWeek}`);
    try {
      const result = await this.availabilityService.batchDeactivate(body.practitionerId, body.daysOfWeek);
      return {
        status: 200,
        message: `Deactivated availabilities for ${body.daysOfWeek.length} days`,
        data: result,
      };
    } catch (error) {
      console.error('Error in batch deactivate:', error);
      throw error;
    }
  }

  @Post('batch-create')
  @ApiResponse({
    status: 201,
    description: 'Create multiple availabilities at once.'
  })
  async batchCreate(
    @Body() body: { availabilities: any[] },
    @Req() req: any,
  ) {
    try {
      if (!Array.isArray(body.availabilities) || body.availabilities.length === 0) {
        return {
          status: 400,
          message: 'availabilities array is required',
          data: []
        };
      }

      const created = await this.availabilityService.batchCreateAvailabilities(body.availabilities);
      return {
        status: 201,
        message: `Created ${created.length} availabilities`,
        data: created,
      };
    } catch (error) {
      console.error('Error in batch create availabilities:', error);
      throw error;
    }
  }

  @Delete(':id')
  @ApiResponse({
    status: 200,
    description: 'Availability deleted successfully.',
  })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.availabilityService.remove(id);
  }

  @Post('generate-slots/:practitionerId')
  @ApiResponse({
    status: 201,
    description: 'Time slots generated successfully.',
    type: [TimeSlotResponseDto],
  })
  generateTimeSlots(
    @Param('practitionerId', ParseIntPipe) practitionerId: number,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.availabilityService.generateTimeSlots(
      practitionerId,
      new Date(startDate),
      new Date(endDate),
    );
  }

  @Get('slots/available')
  @ApiResponse({
    status: 200,
    description: 'Available slots retrieved successfully.',
    type: [TimeSlotResponseDto],
  })
  getAvailableSlots(
    @Query('practitionerId', ParseIntPipe) practitionerId: number,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.availabilityService.getAvailableSlots(
      practitionerId,
      new Date(startDate),
      new Date(endDate),
    );
  }
  
  @Get('slots/:practitionerId')
  @ApiResponse({
    status: 200,
    description: 'All slots for a practitioner retrieved successfully.',
    type: [TimeSlotResponseDto],
  })
  async getAllPractitionerSlots(
    @Param('practitionerId', ParseIntPipe) practitionerId: number,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    try {
      console.log(`[${new Date().toISOString()}] [getAllPractitionerSlots] practitionerId=${practitionerId}, startDate=${startDate}, endDate=${endDate}`);
      
      // Simple rate limiting
      const requestKey = `slots_${practitionerId}_${Date.now()}`;
      const now = Date.now();
      const recentRequests = (global as any).slotRequests = (global as any).slotRequests || {};
      
      // Check how many requests this practitioner has made in the last minute
      const requestsInLastMinute = Object.entries(recentRequests)
        .filter(([key, timestamp]: [string, number]) => 
          key.startsWith(`slots_${practitionerId}`) && 
          (now - timestamp) < 60000
        ).length;
      
      // If too many requests, return 429
      if (requestsInLastMinute > 5) {
        console.warn(`Rate limiting slots request for practitioner ${practitionerId} - ${requestsInLastMinute} requests in last minute`);
        // Clean up old entries
        Object.entries(recentRequests).forEach(([key, timestamp]: [string, number]) => {
          if ((now - timestamp as number) > 60000) {
            delete recentRequests[key];
          }
        });
        
        return {
          status: 429,
          message: 'Too many requests. Please try again later.',
          data: []
        };
      }
      
      // Record this request
      recentRequests[requestKey] = now;

      const start = startDate ? new Date(startDate) : undefined;
      const end = endDate ? new Date(endDate) : undefined;

      console.log('[getAllPractitionerSlots] computed dates', { start, end });
      console.log('[getAllPractitionerSlots] start date type:', typeof start, 'end date type:', typeof end);

      const slots = await this.availabilityService.getPractitionerSlots(
        practitionerId,
        start as any,
        end as any,
      );

      console.log(`[getAllPractitionerSlots] retrieved ${Array.isArray(slots) ? slots.length : 'unknown'} slots for practitioner ${practitionerId}`);
      if (Array.isArray(slots) && slots.length > 0) {
        console.log('[getAllPractitionerSlots] First slot:', slots[0]);
        console.log('[getAllPractitionerSlots] Last slot:', slots[slots.length - 1]);
        console.log('[getAllPractitionerSlots] Date range in results:', 
          'from', slots[0]?.date, 
          'to', slots[slots.length - 1]?.date);
      } else {
        console.log('[getAllPractitionerSlots] No slots found or invalid slots array');
      }
      
      return slots;
    } catch (error) {
      console.error('[getAllPractitionerSlots] error caught in controller:', error);
      if (error && (error as any).stack) {
        console.error((error as any).stack);
      }
      throw error;
    }
  }

  @Get('slots/:practitionerId/debug')
  @ApiResponse({
    status: 200,
    description: 'Debug practitioner slots (all slots without date filtering)',
  })
  async getDebugPractitionerSlots(
    @Param('practitionerId', ParseIntPipe) practitionerId: number,
  ) {
    try {
      console.log(`[DEBUG] Getting all slots for practitioner ${practitionerId} without date filtering`);
      
      const allSlots = await this.availabilityService.getAllPractitionerSlotsDebug(practitionerId);
      
      console.log(`[DEBUG] Found ${allSlots.length} total slots for practitioner ${practitionerId}`);
      if (allSlots.length > 0) {
        console.log('[DEBUG] First slot:', allSlots[0]);
        console.log('[DEBUG] Last slot:', allSlots[allSlots.length - 1]);
        
        // Group by date for debugging
        const slotsByDate = allSlots.reduce((acc, slot) => {
          const dateStr = slot.date.toISOString().split('T')[0];
          acc[dateStr] = (acc[dateStr] || 0) + 1;
          return acc;
        }, {});
        console.log('[DEBUG] Slots by date:', slotsByDate);
      }
      
      return allSlots;
    } catch (error) {
      console.error('[DEBUG] Error getting debug slots:', error);
      throw error;
    }
  }

  @Get('my-availability')
  @ApiResponse({
    status: 200,
    description: 'My availability retrieved successfully.',
    type: [AvailabilityResponseDto],
  })
  getMyAvailability(@Req() req: any) {
    const practitionerId = Number(req.user.id);
    return this.availabilityService.findAllByPractitioner(practitionerId);
  }

  @Get('my-slots')
  @ApiResponse({
    status: 200,
    description: 'My time slots retrieved successfully.',
    type: [TimeSlotResponseDto],
  })
  async getMyTimeSlots(
    @Req() req: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    console.log(`[${new Date().toISOString()}] GET my-slots request received:`, { 
      user: req.user?.id,
      startDate, 
      endDate 
    });
    
    const practitionerId = Number(req.user.id);
    
    // Validate practitioner ID
    if (!practitionerId || isNaN(practitionerId)) {
      return {
        status: 400,
        message: 'Invalid practitioner ID',
        data: []
      };
    }
    
    // Set default dates if not provided
    const start = startDate ? new Date(startDate) : new Date();
    const end = endDate
      ? new Date(endDate)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    
    try {
      // Simple in-memory rate limiting
      const requestKey = `slots_${practitionerId}_${Date.now()}`;
      const now = Date.now();
      const recentRequests = (global as any).slotRequests = (global as any).slotRequests || {};
      
      // Check how many requests this practitioner has made in the last minute
      const requestsInLastMinute = Object.entries(recentRequests)
        .filter(([key, timestamp]: [string, number]) => 
          key.startsWith(`slots_${practitionerId}`) && 
          (now - timestamp) < 60000
        ).length;
      
      // If too many requests, return 429
      if (requestsInLastMinute > 5) {
        console.warn(`Rate limiting slots request for practitioner ${practitionerId} - ${requestsInLastMinute} requests in last minute`);
        // Clean up old entries
        Object.entries(recentRequests).forEach(([key, timestamp]: [string, number]) => {
          if ((now - timestamp as number) > 60000) {
            delete recentRequests[key];
          }
        });
        
        return {
          status: 429,
          message: 'Too many requests. Please try again later.',
          data: []
        };
      }
      
      // Record this request
      recentRequests[requestKey] = now;
      
      console.log(`[${new Date().toISOString()}] Calling availabilityService.getAvailableSlots:`, {
        practitionerId,
        start,
        end
      });
      
      const slots = await this.availabilityService.getAvailableSlots(
        practitionerId,
        start,
        end,
      );
      
      console.log(`[${new Date().toISOString()}] Retrieved ${slots.length} slots`);
      
      return {
        status: 200,
        message: 'Time slots retrieved successfully',
        data: slots
      };
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error retrieving time slots:`, error);
      return {
        status: 200,
        message: 'No time slots found',
        data: []
      };
    }
  }

  @Post('generate-slots')
  @ApiResponse({
    status: 201,
    description: 'Time slots generated successfully.',
    type: [TimeSlotResponseDto],
  })
  async generateMyTimeSlots(
    @Body() body: { startDate: string; endDate: string },
    @Req() req: any,
  ) {
    try {
      if (!req.user || !req.user.id) {
        return {
          status: 401,
          message: 'User not authenticated',
          error: true
        };
      }

      // Validate dates
      if (!body.startDate || !body.endDate) {
        return {
          status: 400,
          message: 'Both startDate and endDate are required',
          error: true
        };
      }
      
      const startDate = new Date(body.startDate);
      const endDate = new Date(body.endDate);
      
      // Validate date formats
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return {
          status: 400,
          message: 'Invalid date format. Use YYYY-MM-DD format',
          error: true
        };
      }
      
      // Validate date range
      if (endDate < startDate) {
        return {
          status: 400,
          message: 'End date must be after start date',
          error: true
        };
      }
      
      // Limit range to 90 days to prevent excessive slot generation
      const maxDays = 90;
      const dayDiff = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      if (dayDiff > maxDays) {
        return {
          status: 400,
          message: `Date range exceeds maximum allowed (${maxDays} days)`,
          error: true
        };
      }
      
      const practitionerId = Number(req.user.id);
      console.log(`Generating slots for practitioner ${practitionerId} from ${startDate} to ${endDate}`);
      
      const slots = await this.availabilityService.generateTimeSlots(
        practitionerId,
        startDate,
        endDate,
      );
      
      return {
        status: 201,
        message: `Generated ${slots.length} time slots successfully`,
        data: slots
      };
    } catch (error) {
      console.error('Error generating time slots:', error);
      return {
        status: 400,
        message: error.message || 'Error generating time slots',
        error: true,
        data: []
      };
    }
  }

  @Patch('slots/:id')
  @ApiResponse({
    status: 200,
    description: 'Time slot status updated successfully.',
    type: TimeSlotResponseDto,
  })
  updateSlotStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { status: 'AVAILABLE' | 'BLOCKED' },
    @Req() req: any,
  ) {
    return this.availabilityService.updateSlotStatus(id, body.status, Number(req.user.id));
  }
  
  // Alternative endpoint that uses a different URL format (some frameworks prefer this)
  @Patch('slots/:slotId/status')
  @ApiResponse({
    status: 200,
    description: 'Time slot status updated via alternative endpoint.',
    type: TimeSlotResponseDto,
  })
  updateSlotStatusAlt(
    @Param('slotId', ParseIntPipe) slotId: number,
    @Body() body: { status: 'AVAILABLE' | 'BLOCKED' },
    @Req() req: any,
  ) {
    return this.availabilityService.updateSlotStatus(slotId, body.status, Number(req.user.id));
  }

  @Delete('slots/:id')
  @ApiResponse({
    status: 200,
    description: 'Time slot deleted successfully.',
  })
  deleteTimeSlot(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
  ) {
    return this.availabilityService.deleteTimeSlot(id, Number(req.user.id));
  }
  
  @Delete('slots/:slotId/delete')
  @ApiResponse({
    status: 200,
    description: 'Time slot deleted via alternative endpoint.',
  })
  deleteTimeSlotAlt(
    @Param('slotId', ParseIntPipe) slotId: number,
    @Req() req: any,
  ) {
    return this.availabilityService.deleteTimeSlot(slotId, Number(req.user.id));
  }
}
