import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';
import { HttpExceptionHelper } from 'src/common/helpers/execption/http-exception.helper';
import { Prisma, Terms } from '@prisma/client';
import { CreatetermDto, QueryTermsDto, UpdateTermDto } from 'src/term/dto/terms.dto';
import { UserService } from 'src/user/user.service';

@Injectable()
export class TermService {
  private readonly logger = new Logger(TermService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly userService: UserService
  ) { }

  private bumpVersion(current: number, increment = 0.01): number {
    return parseFloat((current + increment).toFixed(2));
  }

  async create(organizationId: number, dto: CreatetermDto): Promise<Terms> {
    this.logger.log('create term called')
    const latest = await this.databaseService.terms.findFirst({
      where: {
        organizationId,
        language: dto.language,
        country: dto.country,
      },
      orderBy: { version: 'desc' },
    });

    const nextVersion = latest ? Math.floor(latest.version) + 1 : 1;

    return this.databaseService.terms.create({
      data: {
        ...dto,
        organizationId,
        version: parseFloat(nextVersion.toFixed(2)),
      },
    });
  }

  async update(id: number, dto: UpdateTermDto): Promise<Terms> {
    this.logger.log('update term called')

    const exists = await this.databaseService.terms.findFirst({
      where: { id },
    });

    if (!exists) {
      this.logger.warn(`Terms with id ${id} not found `);
      throw HttpExceptionHelper.notFound(`Term with id:${id} not found `);
    }

    const newVersion = this.bumpVersion(exists.version);

    return this.databaseService.terms.update({
      where: { id },
      data: {
        content: dto.content,
        language: dto.language,
        country: dto.country,
        version: newVersion,
      },
    });
  }

  async delete(id: number): Promise<Terms> {
    this.logger.log('delete term called')
    const exists = await this.databaseService.terms.findFirst({
      where: { id },
    });

    if (!exists) {
      this.logger.warn(`Terms with id ${id} not found `);
      throw HttpExceptionHelper.notFound(`Terms with id ${id} not found`);
    }

    return this.databaseService.terms.delete({
      where: { id },
    });
  }

  async findAllunderOrg(query: QueryTermsDto, organizationId: number) {
    this.logger.log('find term with orgs called')
    const { language, country, page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.TermsWhereInput = {
      organizationId,
      ...(language && { language }),
      ...(country && { country }),
    };

    const [terms, total] = await Promise.all([
      this.databaseService.terms.findMany({
        where,
        skip,
        take: limit,
        orderBy: { version: 'desc' },
      }),
      this.databaseService.terms.count({ where }),
    ]);

    return {
      terms,
      total,
      page,
      limit,
    };
  }


  async findAll(query: QueryTermsDto) {
    this.logger.log('terms findAll function called');

    const {
      language,
      country,
      page = 1,
      limit = 10,
      organizationId,
      sortBy = 'version',
      order = 'desc',
    } = query;

    const skip = (page - 1) * limit;

    const where: Prisma.TermsWhereInput = {
      ...(organizationId && { organizationId }),
      ...(language && { language }),
      ...(country && { country }),
    };

    const orderBy: Prisma.TermsOrderByWithRelationInput = {
      [sortBy]: order,
    };

    const [terms, total] = await Promise.all([
      this.databaseService.terms.findMany({
        where,
        skip,
        take: limit,
        orderBy,
      }),
      this.databaseService.terms.count({ where }),
    ]);

    return {
      terms,
      total,
      page,
      limit,
    };
  }



  async findById(id: number) {
    this.logger.log('find term by id called')

    const term = await this.databaseService.terms.findUnique({
      where: { id },
    });

    if (!term) {
      throw HttpExceptionHelper.notFound(`Term with ID ${id} not found`);
    }

    return term;
  }


  async getLatest(userId: number): Promise<Terms> {
    this.logger.log('latest term called')

    // Step 1: Get user
    const user = await this.userService.findOne(userId);
    if (!user) throw HttpExceptionHelper.notFound('User not found');
    const organizationId = user.organizations?.[0]?.id;
    const country = user.country || 'US';
    const language = user.languages?.[0]?.name || 'English';

    const term = await this.databaseService.terms.findFirst({
      where: {
        organizationId,
        language,
        country,
      },
      orderBy: { version: 'desc' },
    });

    if (!term) {
      throw HttpExceptionHelper.notFound(
        `No latest terms found for ${language}-${country} in org ${organizationId}`,
      );
    }
    return term;
  }


  async acceptTerms(dto: { userId: number, termId: number }): Promise<string> {
    const { userId, termId } = dto;

    // Step 1: Get user
    const user = await this.userService.findOne(userId);
    if (!user) throw HttpExceptionHelper.notFound('User not found');

    const organizationId = user.organizations?.[0]?.id;
    if (!organizationId) {
      throw HttpExceptionHelper.badRequest('Update your profile to include an organization before accepting terms.');
    }
    // Step 2: Find matching Terms
    const term = await this.databaseService.terms.findFirst({
      where: {
        id: Number(termId)
      },
    });

    if (!term) throw HttpExceptionHelper.notFound('Terms not found for user context');

    if (term.organizationId !== organizationId) {
      throw HttpExceptionHelper.badRequest('You cannot accept terms for a different organization.');
    }
    // Step 3: Compare and update user if needed
    const currentVersion = user.termVersion || 0;

    if (currentVersion >= term.version) return 'No update needed';

    await this.databaseService.user.update({
      where: { id: userId },
      data: { termVersion: term.version, acceptedAt: new Date() },
    });

    return 'Terms version updated';
  }

  // Public method for getting latest terms without user context
  async getPublicLatest(language: string = 'en', country: string = 'US'): Promise<Terms | null> {
    this.logger.log('getPublicLatest term called');

    try {
      let term = await this.databaseService.terms.findFirst({
        where: {
          language,
          country,
        },
        orderBy: [
          { version: 'desc' },
          { updatedAt: 'desc' }
        ]
      });

      // Fallback: If no term found, try to return any available term
      if (!term) {
        term = await this.databaseService.terms.findFirst({
          orderBy: [
            { version: 'desc' },
            { updatedAt: 'desc' }
          ]
        });
        if (term) {
          this.logger.warn('No term found for requested language/country, returning fallback term.');
        }
      }

      return term;
    } catch (error) {
      this.logger.error('Error fetching public latest terms:', error);
      return null;
    }
  }
}
