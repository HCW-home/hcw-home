import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateMediasoupServerDto } from './dto/create-mediasoup-server.dto';
import { UpdateMediasoupServerDto } from './dto/update-mediasoup-server.dto';
import { QueryMediasoupServerDto } from './dto/query-mediasoup-server.dto';
import { MediasoupServerResponseDto } from './dto/mediasoup-server-response.dto';
import { plainToInstance } from 'class-transformer';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { HttpExceptionHelper } from '../common/helpers/execption/http-exception.helper';

@Injectable()
export class MediasoupServerService {
  private readonly logger = new Logger(MediasoupServerService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  async create(
    createMediasoupServerDto: CreateMediasoupServerDto,
  ): Promise<MediasoupServerResponseDto> {
    const { url, password, maxNumberOfSessions, active, ...rest } =
      createMediasoupServerDto;

    const existingServer = await this.databaseService.mediasoupServer.findFirst(
      {
        where: { url },
      },
    );

    if (existingServer) {
      this.logger.warn(`Attempt to create duplicate server URL: ${url}`);
      throw HttpExceptionHelper.conflict('Mediasoup server URL already exists');
    }

    // Hash the password securely
    const hashedPassword = await bcrypt.hash(password, 10);

    const serverData = {
      ...rest,
      url,
      password: hashedPassword,
      maxNumberOfSessions:
        maxNumberOfSessions !== undefined ? maxNumberOfSessions : 100,
      active: active ?? true,
    };

    const server = await this.databaseService.mediasoupServer.create({
      data: serverData,
    });

    this.logger.log(`Created Mediasoup server with ID: ${server.id}`);

    return plainToInstance(MediasoupServerResponseDto, server, {
      excludeExtraneousValues: true,
    });
  }

  async findAll(query: QueryMediasoupServerDto) {
    const {
      page = 1,
      limit = 10,
      search,
      active,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;

    const pageNumber = Math.max(1, Number(page));
    const limitNumber = Math.max(1, Number(limit));
    const skip = (pageNumber - 1) * limitNumber;

    const where: Prisma.MediasoupServerWhereInput = {
      ...(search && {
        OR: [
          { url: { contains: search, mode: 'insensitive' } },
          { username: { contains: search, mode: 'insensitive' } },
        ],
      }),
      ...(active !== undefined && { active }),
    };

    const orderBy: Prisma.MediasoupServerOrderByWithRelationInput = {
      [sortBy]: sortOrder,
    };

    const [servers, total] = await Promise.all([
      this.databaseService.mediasoupServer.findMany({
        where,
        skip,
        take: limit,
        orderBy,
      }),
      this.databaseService.mediasoupServer.count({ where }),
    ]);

    const items = servers.map((server) =>
      plainToInstance(MediasoupServerResponseDto, server, {
        excludeExtraneousValues: true,
      }),
    );

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string): Promise<MediasoupServerResponseDto> {
    const server = await this.databaseService.mediasoupServer.findUnique({
      where: { id },
    });

    if (!server) {
      this.logger.warn(`Mediasoup server not found with ID: ${id}`);
      throw HttpExceptionHelper.notFound('Mediasoup server not found');
    }

    return plainToInstance(MediasoupServerResponseDto, server, {
      excludeExtraneousValues: true,
    });
  }

  async update(
    id: string,
    updateMediasoupServerDto: UpdateMediasoupServerDto,
  ): Promise<MediasoupServerResponseDto> {
    const existingServer =
      await this.databaseService.mediasoupServer.findUnique({
        where: { id },
        select: { id: true, url: true },
      });

    if (!existingServer) {
      this.logger.warn(`Update failed, server not found with ID: ${id}`);
      throw HttpExceptionHelper.notFound('Mediasoup server not found');
    }

    if (
      updateMediasoupServerDto.url &&
      updateMediasoupServerDto.url !== existingServer.url
    ) {
      const urlExists = await this.databaseService.mediasoupServer.findFirst({
        where: {
          url: updateMediasoupServerDto.url,
          id: { not: id },
        },
        select: { id: true },
      });

      if (urlExists) {
        this.logger.warn(
          `Update failed, duplicate URL: ${updateMediasoupServerDto.url}`,
        );
        throw HttpExceptionHelper.conflict(
          'Mediasoup server URL already exists',
        );
      }
    }

    const server = await this.databaseService.mediasoupServer.update({
      where: { id },
      data: updateMediasoupServerDto,
    });

    this.logger.log(`Updated Mediasoup server with ID: ${id}`);

    return plainToInstance(MediasoupServerResponseDto, server, {
      excludeExtraneousValues: true,
    });
  }

  async toggleActive(id: string): Promise<MediasoupServerResponseDto> {
    const existingServer =
      await this.databaseService.mediasoupServer.findUnique({
        where: { id },
        select: { id: true, active: true },
      });

    if (!existingServer) {
      this.logger.warn(`Toggle active failed, server not found with ID: ${id}`);
      throw HttpExceptionHelper.notFound('Mediasoup server not found');
    }

    const server = await this.databaseService.mediasoupServer.update({
      where: { id },
      data: { active: !existingServer.active },
    });

    this.logger.log(
      `Toggled active status for Mediasoup server with ID: ${id}`,
    );

    return plainToInstance(MediasoupServerResponseDto, server, {
      excludeExtraneousValues: true,
    });
  }

  async remove(id: string): Promise<MediasoupServerResponseDto> {
    const existingServer =
      await this.databaseService.mediasoupServer.findUnique({
        where: { id },
        select: { id: true },
      });

    if (!existingServer) {
      this.logger.warn(`Remove failed, server not found with ID: ${id}`);
      throw HttpExceptionHelper.notFound('Mediasoup server not found');
    }

    const server = await this.databaseService.mediasoupServer.delete({
      where: { id },
    });

    this.logger.log(`Removed Mediasoup server with ID: ${id}`);

    return plainToInstance(MediasoupServerResponseDto, server, {
      excludeExtraneousValues: true,
    });
  }

  async getAvailableServer(): Promise<MediasoupServerResponseDto | null> {
    const server = await this.databaseService.mediasoupServer.findFirst({
      where: { active: true },
      orderBy: { maxNumberOfSessions: 'desc' },
    });

    return server
      ? plainToInstance(MediasoupServerResponseDto, server, {
          excludeExtraneousValues: true,
        })
      : null;
  }
}
