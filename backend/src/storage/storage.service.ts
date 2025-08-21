import { Injectable } from '@nestjs/common';
import { CloudinaryService } from 'nestjs-cloudinary';

@Injectable()
export class StorageService {
  constructor(private readonly cloudinaryService: CloudinaryService) {}

  async uploadFile(file: Express.Multer.File): Promise<string> {
    const result = await this.cloudinaryService.uploadFile(file);
    return result.url;
  }
}
