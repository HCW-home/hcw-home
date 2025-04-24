import { Body, Controller, Get, Param, ParseIntPipe, Post, Request, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ConsultationService } from './consultation.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { v4 as uuidv4 } from 'uuid';

// Define a file interface to avoid import errors
interface FileUpload {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  destination: string;
  filename: string;
  path: string;
  size: number;
}

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

    @Get(':id/messages')
    async getConsultationMessages(
        @Param('id', ParseIntPipe) id: number,
        @Query('limit') limit: number = 50,
        @Query('before') before?: number
    ) {
        const messages = await this.consultationService.getConsultationMessages(id, limit, before);
        return { success: true, messages };
    }

    @Post(':id/upload')
    @UseInterceptors(FileInterceptor('file', {
        storage: diskStorage({
            destination: './uploads/chat',
            filename: (req, file, cb) => {
                // Generate a unique filename with timestamp and original extension
                const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
                const fileExt = extname(file.originalname);
                cb(null, `${uniqueSuffix}${fileExt}`);
            },
        }),
        limits: {
            fileSize: 10 * 1024 * 1024, // 10MB max file size
        },
    }))
    async uploadFile(
        @Param('id', ParseIntPipe) id: number,
        @Body('userId') userId: number,
        @UploadedFile() file: FileUpload
    ) {
        if (!file) {
            return { success: false, message: 'No file uploaded' };
        }

        const fileUrl = `uploads/chat/${file.filename}`;
        const contentType = file.mimetype.startsWith('image/') ? 'IMAGE' : 'FILE';
        
        return {
            success: true,
            fileUrl,
            contentType,
            originalName: file.originalname,
            size: file.size
        };
    }
}
