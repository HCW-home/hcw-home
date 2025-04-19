import { Body, Controller, Get, Param, ParseIntPipe, Post, Request ,Delete, UseGuards } from '@nestjs/common';
import { ConsultationService } from './consultation.service';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../auth/decorators/roles.docorator';


@Controller('consultation')
export class ConsultationController {

    constructor(private readonly consultationService: ConsultationService){}

    @Post(':id/join/patient')
    async joinPatient(@Param('id', ParseIntPipe) id: number,  @Body('userId') userId: number,) {    
        const res = await this.consultationService.joinAsPatient(id, userId);

        return { message: 'Patient joined consultation.', ...res };
    }

    @Post(':id/join/practitioner')
    async joinPractitioner(@Param('id', ParseIntPipe) id: number,  @Body('userId') userId: number,) {
        const res = await this.consultationService.joinAsPractitioner(id, userId);

        return {message: 'Practitioner joined consultation. ', ...res}
    }

    @Get('/waiting-room')
    async getWaitingRoom(@Body('userId') userId: number) {
        const consultations = await this.consultationService.getWaitingRoomConsultations(userId);
        return {success: true, consultations};
    }

    @Get()
    @UseGuards(AuthGuard('jwt'))
    findAll() {
        // This route is protected - only authenticated users can access it
        return this.consultationService.findAll();
    }

    @Post()
    @UseGuards(AuthGuard('jwt'))
    @Roles('ADMIN', 'Practitioner','Patient') // Only users with these roles can create consultations
    create(@Body() createConsultationDto: any) {
        return this.consultationService.create(createConsultationDto);
    }

    @Get(':id')
    @UseGuards(AuthGuard('jwt'))
    findOne(@Param('id') id: number) {
        return this.consultationService.findOne(id);
    }

    @Delete(':id')
    @UseGuards(AuthGuard('jwt'))
    @Roles('ADMIN')
    remove(@Param('id') id: number) {
        return this.consultationService.remove(id);
    }
}
