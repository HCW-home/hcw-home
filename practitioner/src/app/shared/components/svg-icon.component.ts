import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AngularSvgIconModule } from 'angular-svg-icon';

@Component({
  selector: 'app-svg-icon',
  standalone: true,
  imports: [CommonModule, AngularSvgIconModule],
  template: `
    <svg-icon [name]="src" [svgStyle]="svgStyle" [svgAriaLabel]="ariaLabel">
    </svg-icon>
  `,
})
export class SvgIconComponent {
  @Input() src!: string;
  @Input() svgStyle?: { [key: string]: any };
  @Input() ariaLabel?: string;
}
