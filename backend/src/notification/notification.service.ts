import { Injectable } from '@nestjs/common';
import { UpdateNotificationSettingDto } from './dto/update-notification-setting.dto';
import { DatabaseService } from 'src/database/database.service';

@Injectable()
export class NotificationService {
    constructor(
        private readonly databaseSevice:DatabaseService
    ) {}

    async updateNotificationSetting(userId: number, updateDto: UpdateNotificationSettingDto) {
        const { enabled, phone } = updateDto;

        let setting = await this.databaseSevice.userNotificationSetting.findUnique({
            where: { userId },
          });
        if (!setting) {
            setting = await this.databaseSevice.userNotificationSetting.create({
                data: { userId, enabled: enabled ?? false, phone: phone ?? null },
            });
        } else {
            setting = await this.databaseSevice.userNotificationSetting.update({
                where: { userId },
                data: {
                    enabled: enabled !== undefined ? enabled : setting.enabled,
                    phone: phone !== undefined ? phone : setting.phone,
                },
            });
        }
        return setting;
    }

}
