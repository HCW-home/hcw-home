import {
  Injectable,
} from '@nestjs/common';
import { HttpExceptionHelper } from '../common/helpers/execption/http-exception.helper';
import { DatabaseService } from '../database/database.service';
import { CreateSmsProviderDto } from './dto/create-sms_provider.dto';
import { UpdateSmsProviderDto } from './dto/update-sms_provider.dto';
import { QuerySmsProviderDto } from './dto/query-sms_provider.dto';
import { SmsProviderResponseDto } from './dto/sms_provider-response.dto';
import { plainToInstance } from 'class-transformer';
import { Prisma } from '@prisma/client';

@Injectable()
export class SmsProviderService {
  constructor(private readonly databaseService: DatabaseService) { }

  async create(
    createSmsProviderDto: CreateSmsProviderDto,
  ): Promise<SmsProviderResponseDto> {
    try {
      // Get the next order number if not provided
      let orderValue = createSmsProviderDto.order;

      if (!orderValue) {
        const maxOrder = await this.databaseService.smsProvider.findFirst({
          orderBy: { order: 'desc' },
          select: { order: true }
        });
        orderValue = (maxOrder?.order || 0) + 1;
      }

      // Create SMS provider with auto-incremented order
      const smsProviderData = {
        ...createSmsProviderDto,
        order: orderValue,
        provider: createSmsProviderDto.provider || null,
        prefix: createSmsProviderDto.prefix || null,
        isWhatsapp: createSmsProviderDto.isWhatsapp ?? false,
        isDisabled: createSmsProviderDto.isDisabled ?? false,
      };

      const smsProvider = await this.databaseService.smsProvider.create({
        data: smsProviderData,
      });

      return plainToInstance(SmsProviderResponseDto, smsProvider, {
        excludeExtraneousValues: false,
      });
    } catch (error) {
      if (error.code === 'P2002' && error.meta?.target?.includes('order')) {
        throw HttpExceptionHelper.badRequest('Order number already exists');
      }
      throw error;
    }
  }

  async findAll(query: QuerySmsProviderDto) {
    const {
      page = 1,
      limit = 10,
      search,
      isWhatsapp,
      isDisabled,
      sortBy = 'order',
      sortOrder = 'asc',
    } = query;
    const skip = (page - 1) * limit;

    // Build where clause
    const where: Prisma.SmsProviderWhereInput = {};

    if (search) {
      where.OR = [
        {
          provider: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          prefix: {
            contains: search,
            mode: 'insensitive',
          },
        },
      ];
    }

    if (isWhatsapp !== undefined) {
      where.isWhatsapp = isWhatsapp;
    }

    if (isDisabled !== undefined) {
      where.isDisabled = isDisabled;
    }

    // Build orderBy clause
    const orderBy: Prisma.SmsProviderOrderByWithRelationInput = {};
    orderBy[sortBy] = sortOrder;

    // Execute queries in parallel
    const [smsProviders, total] = await Promise.all([
      this.databaseService.smsProvider.findMany({
        where,
        skip,
        take: limit,
        orderBy,
      }),
      this.databaseService.smsProvider.count({ where }),
    ]);

    // Transform SMS providers to response DTOs
    const transformedSmsProviders = smsProviders.map((smsProvider) =>
      plainToInstance(SmsProviderResponseDto, smsProvider, {
        excludeExtraneousValues: false,
      }),
    );

    return {
      smsProviders: transformedSmsProviders,
      total,
      page,
      limit,
    };
  }

  async findOne(id: number): Promise<SmsProviderResponseDto> {
    const smsProvider = await this.databaseService.smsProvider.findUnique({
      where: { id },
    });

    if (!smsProvider) {
      throw HttpExceptionHelper.notFound('SMS provider not found');
    }

    return plainToInstance(SmsProviderResponseDto, smsProvider, {
      excludeExtraneousValues: false,
    });
  }


  async update(
    id: number,
    updateSmsProviderDto: UpdateSmsProviderDto,
  ): Promise<SmsProviderResponseDto> {
    // Check if SMS provider exists
    const existingSmsProvider =
      await this.databaseService.smsProvider.findUnique({
        where: { id },
        select: { id: true, order: true },
      });

    if (!existingSmsProvider) {
      throw HttpExceptionHelper.notFound('SMS provider not found');
    }

    try {
      // If order is being updated, handle order rebalancing
      if (updateSmsProviderDto.order !== undefined &&
        updateSmsProviderDto.order !== existingSmsProvider.order) {
        return await this.updateProviderOrder(id, updateSmsProviderDto.order, updateSmsProviderDto);
      }

      // Prepare update data for non-order updates
      const updateData = {
        ...updateSmsProviderDto,
        provider:
          updateSmsProviderDto.provider !== undefined
            ? updateSmsProviderDto.provider || null
            : undefined,
        prefix:
          updateSmsProviderDto.prefix !== undefined
            ? updateSmsProviderDto.prefix || null
            : undefined,
      };

      const smsProvider = await this.databaseService.smsProvider.update({
        where: { id },
        data: updateData,
      });

      return plainToInstance(SmsProviderResponseDto, smsProvider, {
        excludeExtraneousValues: false,
      });
    } catch (error) {
      if (error.code === 'P2002' && error.meta?.target?.includes('order')) {
        throw HttpExceptionHelper.badRequest('Order number already exists');
      }
      throw error;
    }
  }

  async remove(id: number): Promise<SmsProviderResponseDto> {
    // Check if SMS provider exists
    const existingSmsProvider =
      await this.databaseService.smsProvider.findUnique({
        where: { id },
        select: { id: true, order: true },
      });

    if (!existingSmsProvider) {
      throw HttpExceptionHelper.notFound('SMS provider not found');
    }

    try {
      // Use transaction to delete and reorder
      const deletedProvider = await this.databaseService.$transaction(async (tx) => {
        // Delete the provider
        const deleted = await tx.smsProvider.delete({
          where: { id },
        });

        // Reorder all providers that have order greater than deleted one
        await tx.smsProvider.updateMany({
          where: {
            order: {
              gt: existingSmsProvider.order!
            }
          },
          data: {
            order: {
              decrement: 1
            }
          }
        });

        return deleted;
      });

      return plainToInstance(SmsProviderResponseDto, deletedProvider, {
        excludeExtraneousValues: false,
      });
    } catch (error) {
      throw error;
    }
  }


  // Update provider order with proper rebalancing
  private async updateProviderOrder(
    id: number,
    newOrder: number,
    additionalUpdateData?: Partial<UpdateSmsProviderDto>
  ): Promise<SmsProviderResponseDto> {
    return await this.databaseService.$transaction(async (tx) => {
      // Get current provider
      const currentProvider = await tx.smsProvider.findUnique({
        where: { id },
        select: { order: true }
      });

      if (!currentProvider) {
        throw HttpExceptionHelper.notFound('Provider not found');
      }

      const currentOrder = currentProvider.order!;

      if (newOrder > currentOrder) {
        // Moving down: shift others up
        await tx.smsProvider.updateMany({
          where: {
            AND: [
              { order: { gt: currentOrder } },
              { order: { lte: newOrder } },
              { id: { not: id } }
            ]
          },
          data: {
            order: { decrement: 1 }
          }
        });
      } else if (newOrder < currentOrder) {
        // Moving up: shift others down
        await tx.smsProvider.updateMany({
          where: {
            AND: [
              { order: { gte: newOrder } },
              { order: { lt: currentOrder } },
              { id: { not: id } }
            ]
          },
          data: {
            order: { increment: 1 }
          }
        });
      }

      // Update the current provider's order and other data
      const updateData = {
        ...additionalUpdateData,
        order: newOrder,
        provider: additionalUpdateData?.provider !== undefined
          ? additionalUpdateData.provider || null
          : undefined,
        prefix: additionalUpdateData?.prefix !== undefined
          ? additionalUpdateData.prefix || null
          : undefined,
      };

      const updatedProvider = await tx.smsProvider.update({
        where: { id },
        data: updateData
      });

      return plainToInstance(SmsProviderResponseDto, updatedProvider, {
        excludeExtraneousValues: false,
      });
    });
  }

  // Fix order sequence (utility method for data corruption)
  async fixOrderSequence(): Promise<{ message: string; fixedCount: number }> {
    try {
      const providers = await this.databaseService.smsProvider.findMany({
        orderBy: { order: 'asc' }
      });

      await this.databaseService.$transaction(
        providers.map((provider, index) =>
          this.databaseService.smsProvider.update({
            where: { id: provider.id },
            data: { order: index + 1 }
          })
        )
      );

      return {
        message: 'Order sequence fixed successfully',
        fixedCount: providers.length
      };
    } catch (error) {
      throw error;
    }
  }

  // Bulk reorder providers
  async reorderProviders(providerOrders: { id: number; order: number }[]): Promise<SmsProviderResponseDto[]> {
    try {
      // Validate no duplicate order numbers in the request
      const orderNumbers = providerOrders.map(p => p.order);
      const uniqueOrders = new Set(orderNumbers);
      if (orderNumbers.length !== uniqueOrders.size) {
        throw HttpExceptionHelper.badRequest('Duplicate order numbers in reorder request');
      }

      // Method 1: Use temporary negative values to avoid conflicts
      const updatedProviders = await this.databaseService.$transaction(async (tx) => {
        // Step 1: Set all orders to temporary negative values
        const tempUpdates = await Promise.all(
          providerOrders.map(({ id }, index) =>
            tx.smsProvider.update({
              where: { id },
              data: { order: -(index + 1) } // Use negative values temporarily
            })
          )
        );

        // Step 2: Set the actual order values
        const finalUpdates = await Promise.all(
          providerOrders.map(({ id, order }) =>
            tx.smsProvider.update({
              where: { id },
              data: { order }
            })
          )
        );

        return finalUpdates;
      });

      return updatedProviders.map((provider) =>
        plainToInstance(SmsProviderResponseDto, provider, {
          excludeExtraneousValues: false,
        })
      );
    } catch (error) {
      if (error instanceof HttpExceptionHelper.badRequest) {
        throw error;
      }
      if (error.code === 'P2002' && error.meta?.target?.includes('order')) {
        throw HttpExceptionHelper.badRequest('Duplicate order numbers in reorder request');
      }
      throw error;
    }
  }
}
