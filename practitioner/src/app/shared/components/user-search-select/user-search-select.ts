import {
  Component,
  ElementRef,
  forwardRef,
  inject,
  input,
  OnDestroy,
  OnInit,
  output,
  signal,
  ViewChild,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { NG_VALUE_ACCESSOR, ControlValueAccessor } from '@angular/forms';
import { Subject } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';
import { UserService } from '../../../core/services/user.service';
import { IUser } from '../../../modules/user/models/user';
import { Typography } from '../../ui-components/typography/typography';
import { Svg } from '../../ui-components/svg/svg';
import { Loader } from '../loader/loader';
import { TypographyTypeEnum } from '../../constants/typography';

@Component({
  selector: 'app-user-search-select',
  templateUrl: './user-search-select.html',
  styleUrl: './user-search-select.scss',
  imports: [CommonModule, Typography, Svg, Loader, TranslatePipe],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => UserSearchSelect),
      multi: true,
    },
  ],
})
export class UserSearchSelect
  implements OnInit, OnDestroy, ControlValueAccessor
{
  @ViewChild('searchInputWrapper')
  searchInputWrapper!: ElementRef<HTMLDivElement>;

  label = input<string>('Select contact');
  placeholder = input<string>('Search by name or email...');
  required = input<boolean>(false);
  initialUser = input<IUser | null>(null);
  temporary = input<boolean | undefined>(undefined);
  hasGroupPermissions = input<boolean | undefined>(undefined);
  isPractitioner = input<boolean | undefined>(undefined);
  meUser = input<IUser | null>(null);
  excludeUserIds = input<number[]>([]);

  userSelected = output<IUser | null>();

  protected readonly TypographyTypeEnum = TypographyTypeEnum;

  searchQuery = signal('');
  users = signal<IUser[]>([]);
  selectedUser = signal<IUser | null>(null);
  isLoading = signal(false);
  isLoadingMore = signal(false);
  hasMore = signal(true);
  currentPage = signal(1);
  showDropdown = signal(false);
  dropdownStyle = signal<{ top: string; left: string; width: string }>({
    top: '0',
    left: '0',
    width: '0',
  });
  pageSize = 20;

  private searchSubject = new Subject<string>();
  private destroy$ = new Subject<void>();
  private userService = inject(UserService);

  onChange: (value: number | null) => void = () => {};
  onTouched: () => void = () => {};

  constructor() {
    effect(() => {
      const user = this.initialUser();
      if (user) {
        this.selectedUser.set(user);
      }
    });
  }

  ngOnInit(): void {
    this.searchSubject
      .pipe(debounceTime(300), takeUntil(this.destroy$))
      .subscribe(query => {
        this.performSearch(query);
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onSearchInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    const query = target.value || '';
    this.searchQuery.set(query);
    this.searchSubject.next(query);
    this.showDropdown.set(true);
  }

  onSearchFocus(): void {
    this.updateDropdownPosition();
    this.showDropdown.set(true);
    if (this.users().length === 0) {
      this.loadUsers();
    }
  }

  private updateDropdownPosition(): void {
    if (!this.searchInputWrapper) return;
    const rect = this.searchInputWrapper.nativeElement.getBoundingClientRect();
    this.dropdownStyle.set({
      top: `${rect.bottom + 2}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
    });
  }

  private performSearch(query: string): void {
    this.currentPage.set(1);
    this.users.set([]);
    this.hasMore.set(true);
    this.loadUsers(query);
  }

  loadUsers(search?: string): void {
    if (this.isLoading()) return;

    this.isLoading.set(true);
    const query = search ?? this.searchQuery() ?? '';

    this.userService
      .searchUsers(
        query,
        this.currentPage(),
        this.pageSize,
        this.temporary(),
        this.hasGroupPermissions(),
        this.isPractitioner()
      )
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: response => {
          const excluded = this.excludeUserIds();
          const filtered =
            excluded.length > 0
              ? response.results.filter(u => !excluded.includes(u.pk))
              : response.results;
          if (this.currentPage() === 1) {
            this.users.set(filtered);
          } else {
            this.users.update(current => [...current, ...filtered]);
          }
          this.hasMore.set(response.next !== null);
          this.isLoading.set(false);
          this.isLoadingMore.set(false);
        },
        error: () => {
          this.isLoading.set(false);
          this.isLoadingMore.set(false);
        },
      });
  }

  loadMore(): void {
    if (!this.hasMore() || this.isLoadingMore() || this.isLoading()) return;

    this.isLoadingMore.set(true);
    this.currentPage.update(p => p + 1);
    this.loadUsers();
  }

  selectUser(user: IUser): void {
    this.selectedUser.set(user);
    this.showDropdown.set(false);
    this.searchQuery.set('');
    this.onChange(user.pk);
    this.userSelected.emit(user);
  }

  clearSelection(): void {
    this.selectedUser.set(null);
    this.onChange(null);
    this.userSelected.emit(null);
  }

  onDropdownScroll(event: Event): void {
    const element = event.target as HTMLElement;
    const threshold = 50;
    const isNearBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight <
      threshold;

    if (
      isNearBottom &&
      this.hasMore() &&
      !this.isLoadingMore() &&
      !this.isLoading()
    ) {
      this.loadMore();
    }
  }

  closeDropdown(): void {
    this.showDropdown.set(false);
  }

  getUserDisplayName(user: IUser): string {
    const name = `${user.first_name || ''} ${user.last_name || ''}`.trim();
    return name || user.email || user.username || 'User';
  }

  getUserInitials(user: IUser): string {
    const firstName = user.first_name || '';
    const lastName = user.last_name || '';
    if (firstName && lastName) {
      return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
    }
    return (firstName || lastName || user.email || 'U').charAt(0).toUpperCase();
  }

  writeValue(value: number | null): void {
    if (value === null) {
      this.selectedUser.set(null);
    }
  }

  registerOnChange(fn: (value: number | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
}
