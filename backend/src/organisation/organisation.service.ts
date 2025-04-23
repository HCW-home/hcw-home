import { HttpStatus, Injectable } from '@nestjs/common';
import { CreateOrganisationDto } from './dto/create-organisation.dto';
import { DatabaseService } from 'src/database/database.service';
import { log } from 'console';
import { successResponse } from 'src/common/helpers/response-helper';

@Injectable()
export class OrganisationService {
  constructor(private readonly database: DatabaseService) {}

  async createOrganization(request, organisationDto: CreateOrganisationDto) {
    try {
      const { name, logo, footerMarkdown, primaryColor } = organisationDto;

      const organization = await this.database.organisation.create({
        data: {
          name,
          logo,
          footerMarkdown,
          primaryColor,
        },
      });

      return successResponse({
        data: organization,
        message: 'Organization Successfully Created',
        status: HttpStatus.OK,
      });
    } catch (error) {
      throw new Error('Error creating organisation: ' + error.message);
    }
  }
}
