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
    Req,
    HttpStatus,
    UseGuards,
    ValidationPipe,
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiParam,
    ApiQuery,
} from '@nestjs/swagger';
import { ZodValidationPipe } from 'src/common/pipes/zod-validation.pipe';
import {
    ApiResponseDto,
    PaginatedApiResponseDto,
} from 'src/common/helpers/response/api-response.dto';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { AuthGuard } from 'src/auth/guards/auth.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from 'src/auth/enums/role.enum';
import { CreatetermDto, QueryTermsDto, UpdateTermDto } from './dto/terms.dto';
import { CreateTermSchema } from './validation/term.validation';
import { TermService } from './term.service';
import { ExtendedRequest } from 'src/types/request';
import { HttpExceptionHelper } from 'src/common/helpers/execption/http-exception.helper';



@Controller('term')
@UseGuards(AuthGuard, RolesGuard)
export class TermController {
    constructor(
        private readonly termsService: TermService
    ) { }

    @Get()
    async findAll(
        @Query(new ValidationPipe({ transform: true })) query: QueryTermsDto
    ) {
        const data = await this.termsService.findAll(query)
        return PaginatedApiResponseDto.paginatedSuccess(
            data.terms,
            data.total,
            data.page,
            data.limit,
            "Terms list retrieved"
        )

    }

    @Roles(Role.ADMIN)
    @Post('')
    @ApiOperation({ summary: 'Create new terms for an organization' })
    @ApiParam({ name: 'id', description: 'Organization ID', type: Number })
    @ApiResponse({ status: 201, description: 'Terms created successfully' })
    async createTerm(
        @Body(new ZodValidationPipe(CreateTermSchema)) dto: CreatetermDto,
    ) {
        const data = await this.termsService.create(dto.organizationId, dto);
        return ApiResponseDto.success(data, 'Term created successfully', HttpStatus.CREATED);
    }

    @Roles(Role.ADMIN)
    @Patch(':id')
    @ApiOperation({ summary: 'Update terms by ID for an organization' })
    @ApiParam({ name: 'termId', description: 'Term ID', type: Number })
    async updateTerm(
        @Param('id') termId: string,
        @Body() dto: UpdateTermDto,
    ) {
        const data = await this.termsService.update(+termId, dto);
        return ApiResponseDto.success(data, 'Term updated successfully', HttpStatus.OK);
    }

    @Roles(Role.ADMIN)
    @Delete(':id')
    @ApiOperation({ summary: 'Delete terms by ID ' })
    async delete(@Param('id') termId: string) {



        const data = await this.termsService.delete(+termId);
        return ApiResponseDto.success(data, 'Term deleted successfully', HttpStatus.OK);
    }

    @Roles(Role.ADMIN)
    @Get('organization/:id')
    @ApiOperation({ summary: 'List all terms for an organization' })
    @ApiQuery({ name: 'language', required: false })
    @ApiQuery({ name: 'country', required: false })
    @ApiQuery({ name: 'page', required: false })
    @ApiQuery({ name: 'limit', required: false })
    async list(
        @Param('id') orgId: string,
        @Query(new ValidationPipe({ transform: true })) query: QueryTermsDto
    ) {
        const data = await this.termsService.findAllunderOrg(query, +orgId);

        return PaginatedApiResponseDto.paginatedSuccess(
            data.terms,
            data.total,
            data.page,
            data.limit,
            "Terms list retrieved"
        )
    }

    @Roles(Role.ADMIN, Role.PATIENT, Role.PRACTITIONER)
    @Get('latest')
    @ApiOperation({ summary: 'Get latest terms for language and country in org' })
    @ApiQuery({ name: 'language', required: true })
    @ApiQuery({ name: 'country', required: true })
    async getLatest(@Req() req: ExtendedRequest) {
        const userId = req.user?.id;
        if (typeof userId !== 'number') {
            throw HttpExceptionHelper.unauthorized('Unauthorized');
        }
        const data = await this.termsService.getLatest(userId);
        return ApiResponseDto.success(data, 'Latest term retrieved');
    }

    @Roles(Role.ADMIN)
    @Get(':id')
    async getTermById(
        @Param('id', ParseIntPipe) termId: number,
    ): Promise<any> {
        const data = await this.termsService.findById(termId);
        return ApiResponseDto.success(data, ' term retrieved successfully');
    }


    // @Roles(Role.PRACTITIONER)
    @Post('accept-term/:id')
    async acceptTerms(@Param('id') termId: number, @Req() req: ExtendedRequest): Promise<ApiResponseDto<string>> {
        const userId = req.user?.id
        if (typeof userId !== 'number') {
            throw HttpExceptionHelper.unauthorized('Unauthorized');
        }
        const message = await this.termsService.acceptTerms({ userId, termId });
        return ApiResponseDto.success('', message);
    }





}
