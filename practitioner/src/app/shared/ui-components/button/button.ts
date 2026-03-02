import { Component, HostBinding, input, OnInit, output } from '@angular/core';
import { NgClass } from '@angular/common';
import {
  ButtonSize,
  ButtonType,
  ButtonState,
  ButtonStyle,
} from '../../models/button';
import { Svg } from '../svg/svg';
import {
  ButtonTypeEnum,
  ButtonSizeEnum,
  ButtonStateEnum,
  ButtonStyleEnum,
} from '../../constants/button';

@Component({
  selector: 'app-button',
  imports: [NgClass, Svg],
  templateUrl: './button.html',
  styleUrl: './button.scss',
})
export class Button implements OnInit {
  buttonClick = output<MouseEvent>();
  block = input<boolean>();
  disabled = input<boolean>();
  loading = input<boolean>();
  fullWidth = input<boolean>();
  leftIcon = input<string>();
  rightIcon = input<string>();
  backgroundColor = input<string>();
  boxShadow = input<string>();
  padding = input<string>();
  buttonClass = input<string>('');
  color = input<string>();
  type = input<ButtonType>(ButtonTypeEnum.button);
  size = input<ButtonSize>(ButtonSizeEnum.large);
  style = input<ButtonStyle>(ButtonStyleEnum.primary);
  state = input<ButtonState>(ButtonStateEnum.default);
  text = input<string>('');
  title = input<string>();

  @HostBinding('class.block') hostBlockClass = false;

  ngOnInit(): void {
    if (this.block()) {
      this.hostBlockClass = true;
    }
  }

  onClickHandler(event: MouseEvent) {
    this.buttonClick.emit(event);
  }
}
