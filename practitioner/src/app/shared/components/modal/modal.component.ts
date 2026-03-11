import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Svg } from '../../ui-components/svg/svg';
import { Typography } from '../../ui-components/typography/typography';
import { TypographyTypeEnum } from '../../constants/typography';

@Component({
  selector: 'app-modal',
  imports: [CommonModule, Svg, Typography],
  templateUrl: './modal.component.html',
  styleUrl: './modal.component.scss'
})
export class ModalComponent {
  isOpen = input<boolean>(false);
  title = input<string>('');
  size = input<'small' | 'medium' | 'large' | 'xlarge'>('medium');
  showCloseButton = input<boolean>(true);
  closeOnBackdropClick = input<boolean>(true);

  closed = output<void>();

  protected readonly TypographyTypeEnum = TypographyTypeEnum;

  close(): void {
    this.closed.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if (this.closeOnBackdropClick() && (event.target as HTMLElement).classList.contains('modal-backdrop')) {
      this.close();
    }
  }
}
