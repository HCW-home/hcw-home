import { Component, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonComponent } from '../ui/button/button.component';
import { ButtonSize, ButtonVariant } from '../../constants/button.enums';

@Component({
  selector: 'app-invite-link',
  standalone: true,
  imports: [CommonModule, ButtonComponent],
  templateUrl: './invite-link.component.html',
  styleUrls: ['./invite-link.component.scss'],
})
export class InviteLinkComponent {
  /** Emit which type was chosen */
  @Output() selectType = new EventEmitter<'remote' | 'inPerson'>();
  /** Allow parent to cancel/close */
  @Output() close = new EventEmitter<void>();

  readonly ButtonSize = ButtonSize;
  readonly ButtonVariant = ButtonVariant;

  onRemote() {
    this.selectType.emit('remote');
  }

  onInPerson() {
    this.selectType.emit('inPerson');
  }
}
