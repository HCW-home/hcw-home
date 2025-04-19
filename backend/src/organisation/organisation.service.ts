import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateOrganisationDto } from './dto/create-organisation.dto';
import { UpdateOrganisationDto } from './dto/update-organisation.dto';
import { successResponse } from '../common/helpers/response-helper';

@Injectable()
export class OrganisationService {
  constructor(private readonly db: DatabaseService) {}

  async create(data: CreateOrganisationDto) {
    const organisation = await this.db.organisation.create({
      data,
    });
    return successResponse(
      organisation,
      'Organisation successfully created',
      201,
    );
  }

  async findAll() {
    const organisations = await this.db.organisation.findMany();
    return successResponse(organisations, 'Organisations successfully fetched');
  }

  async findOne(id: number) {
    const organisation = await this.db.organisation.findUnique({
      where: { id },
      include: {
        users: true,
      },
    });

    if (!organisation) {
      throw new NotFoundException(`Organisation with ID ${id} not found`);
    }

    return successResponse(organisation, 'Organisation successfully fetched');
  }

  async update(id: number, data: UpdateOrganisationDto) {
    // Check if organisation exists first
    const existingOrganisation = await this.db.organisation.findUnique({
      where: { id },
    });

    if (!existingOrganisation) {
      throw new NotFoundException(`Organisation with ID ${id} not found`);
    }

    const updatedOrganisation = await this.db.organisation.update({
      where: { id },
      data,
    });

    return successResponse(
      updatedOrganisation,
      'Organisation successfully updated',
    );
  }

  async remove(id: number) {
    // Check if organisation exists first
    const existingOrganisation = await this.db.organisation.findUnique({
      where: { id },
    });

    if (!existingOrganisation) {
      throw new NotFoundException(`Organisation with ID ${id} not found`);
    }

    await this.db.organisation.delete({
      where: { id },
    });

    return successResponse(null, 'Organisation successfully deleted');
  }
}
