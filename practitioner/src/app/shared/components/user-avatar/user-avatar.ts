import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-user-avatar',
  templateUrl: './user-avatar.html',
  styleUrl: './user-avatar.scss',
  imports: [CommonModule],
})
export class UserAvatar {
  @Input() firstName: string = '';
  @Input() lastName: string = '';
  @Input() email: string = '';
  @Input() picture: string = '';
  @Input() isOnline: boolean | undefined = undefined;
  @Input() size: 'sm' | 'md' | 'lg' = 'md';

  get initials(): string {
    const first = this.firstName?.charAt(0) || '';
    const last = this.lastName?.charAt(0) || '';
    if (first || last) {
      return (first + last).toUpperCase();
    }
    if (this.email) {
      return this.email.charAt(0).toUpperCase();
    }
    return '?';
  }

  get showOnlineIndicator(): boolean {
    return this.isOnline !== undefined;
  }
}
