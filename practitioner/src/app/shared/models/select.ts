export interface SelectOption {
  label: string;
  value: number | string;
  disabled?: boolean;
  isNew?: boolean;
  image?: string;
  secondaryLabel?: string;
  initials?: string;
  isCurrentUser?: boolean;
  isPractitioner?: boolean;
}
