import { Body, Controller, HttpStatus, Patch, Req, UseGuards } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { UpdateNotificationSettingDto } from './dto/update-notification-setting.dto'
import { ExtendedRequest } from 'src/types/request';
import { AuthGuard } from 'src/auth/guards/auth.guard';
import { ApiResponseDto } from 'src/common/helpers/response/api-response.dto';
import { Role } from 'src/auth/enums/role.enum';
import { RolesGuard } from 'src/auth/guards/roles.guard';

@UseGuards(AuthGuard,RolesGuard)
@Controller('notifications')
export class NotificationController {
    constructor(
        private readonly notificationService: NotificationService
    ) { }

    @Patch()
    async update(
        @Body() dto: UpdateNotificationSettingDto, @Req() req: ExtendedRequest
    ) {
        const userId = req.user?.id
        if (!userId) {
            throw new Error('User ID is required');
        }
        const result = await this.notificationService.updateNotificationSetting(userId, dto);
        return ApiResponseDto.success(result, "Notification Settings Updated succesfully", HttpStatus.OK);
    }

}
