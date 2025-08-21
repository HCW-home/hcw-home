import { Component, input, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ButtonVariant ,ButtonSize,  ButtonType, } from '../../../../constants/button.enums';

@Component({
  selector: 'app-button',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './button.component.html',
  styleUrls: ['./button.component.scss'],
})
export class ButtonComponent {
  variant = input<ButtonVariant | string>(ButtonVariant.Primary);
  size = input<ButtonSize | string>(ButtonSize.Medium);
  type = input<ButtonType | string>(ButtonType.Button);
  disabled = input<boolean>(false);
  routerLink = input<string>();

  readonly ButtonVariant = ButtonVariant;
  readonly ButtonSize = ButtonSize;
  readonly ButtonType = ButtonType;
}
