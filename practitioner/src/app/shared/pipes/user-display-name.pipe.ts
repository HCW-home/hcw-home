import { Pipe, PipeTransform, inject } from '@angular/core';
import { IUser } from '../../modules/user/models/user';
import { TranslationService } from '../../core/services/translation.service';

@Pipe({
  name: 'userDisplayName',
  standalone: true,
})
export class UserDisplayNamePipe implements PipeTransform {
  private t = inject(TranslationService);

  transform(user: IUser | null | undefined, currentUser: IUser | null | undefined): string {
    if (!user) {
      return '';
    }

    // If this is the current user, show "Me" translation
    if (currentUser && user.pk === currentUser.pk) {
      return this.t.instant('userSearchSelect.me');
    }

    // Otherwise show the full name or email
    const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim();
    return fullName || user.email || user.username || this.t.instant('participantItem.unknown');
  }
}
