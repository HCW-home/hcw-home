import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import {
  ButtonVariant,
  ButtonSize,
  ButtonType,
} from '../../../constants/button.enums';

@Component({
  selector: 'app-button',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './button.component.html',
  styleUrls: ['./button.component.scss'],
})
export class ButtonComponent {
  @Input() variant: ButtonVariant = ButtonVariant.Primary;
  @Input() size: ButtonSize = ButtonSize.Medium;
  @Input() type: ButtonType = ButtonType.Button;
  @Input() disabled = false;
  @Input() routerLink?: string;

  readonly ButtonVariant = ButtonVariant;
  readonly ButtonSize = ButtonSize;
  readonly ButtonType = ButtonType;
}
