import {
  Component,
  ElementRef,
  forwardRef,
  HostBinding,
  HostListener,
  input,
  OnChanges,
  OnDestroy,
  OnInit,
  output,
  signal,
  SimpleChanges,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Observable, Subject, Subscription } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';
import { SelectOption } from '../../models/select';
import { Svg } from '../svg/svg';
import { Typography } from '../typography/typography';
import { TypographyTypeEnum } from '../../constants/typography';
import { ErrorMessage } from '../../components/error-message/error-message';
import { Loader } from '../../components/loader/loader';

export interface AsyncSearchResult {
  results: SelectOption[];
  hasMore: boolean;
}

export type AsyncSearchFn = (
  query: string,
  page: number
) => Observable<AsyncSearchResult>;

@Component({
  selector: 'app-select',
  imports: [CommonModule, Svg, Typography, ErrorMessage, Loader],
  templateUrl: './select.html',
  styleUrl: './select.scss',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => Select),
      multi: true,
    },
  ],
})
export class Select implements ControlValueAccessor, OnChanges, OnInit, OnDestroy {
  label = input<string>();
  name = input<string>();
  required = input<boolean>(false);
  options = input<SelectOption[]>([]);
  placeholder = input('Select…');
  multiSelect = input(false);
  searchable = input(true);
  invalid = input<boolean>(false);
  invalidMessage = input<string>('');
  creatable = input(false);
  createOptionLabel = input<string>('');
  clearable = input(false);
  openUp = input(false);
  asyncSearch = input<AsyncSearchFn | null>(null);
  initialOption = input<SelectOption | null>(null);
  createItem = output<string>();

  value: string | number | null = null;
  display = '';
  selectedValues: SelectOption[] = [];
  hoverIndex: number | null = null;
  searchTerm = '';

  // Async search state
  asyncOptions = signal<SelectOption[]>([]);
  asyncLoading = signal(false);
  asyncLoadingMore = signal(false);
  asyncHasMore = signal(false);
  private asyncPage = 1;
  private searchSubject = new Subject<string>();
  private destroy$ = new Subject<void>();
  private currentSearchSub: Subscription | null = null;
  // Store the selected option for display when in async mode
  selectedOption: SelectOption | null = null;

  @HostBinding('class.open') open = false;
  @HostBinding('class.disabled') disabled = false;
  @HostBinding('class.drop-up') dropUp = false;

  constructor(private elementRef: ElementRef<HTMLElement>) {}

  private onChange: (value: string | number | (string | number)[] | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  ngOnInit(): void {
    this.searchSubject
      .pipe(debounceTime(300), takeUntil(this.destroy$))
      .subscribe(query => {
        this.asyncPage = 1;
        this.asyncOptions.set([]);
        this.asyncHasMore.set(false);
        this.performAsyncSearch(query, 1);
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.currentSearchSub?.unsubscribe();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['options'] && !changes['options'].firstChange) {
      this.writeValue(this.value);
    }
    if (changes['initialOption']) {
      const opt = this.initialOption();
      if (opt) {
        this.selectedOption = opt;
        this.value = opt.value;
        this.display = opt.label;
      }
    }
  }

  writeValue(obj: string | number | (string | number)[] | null): void {
    if (this.multiSelect()) {
      const arr = Array.isArray(obj) ? obj : [];
      this.selectedValues = this.options().filter(o => arr.includes(o.value));
    } else {
      this.value = Array.isArray(obj) ? null : obj;
      if (this.asyncSearch()) {
        // In async mode, check initialOption first, then selectedOption
        const initial = this.initialOption();
        if (initial && initial.value === obj) {
          this.selectedOption = initial;
        }
        this.display = this.selectedOption?.label ?? '';
      } else {
        const match = this.options().find(o => o.value === obj);
        this.display = match ? match.label : '';
      }
    }
  }

  registerOnChange(fn: (value: string | number | (string | number)[] | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  toggleDropdown(): void {
    if (this.disabled) return;
    if (this.open) {
      this.open = false;
      this.dropUp = false;
    } else {
      this.openDropdown();
    }
  }

  openDropdown(): void {
    if (this.disabled || this.open) return;
    this.open = true;
    this.onTouched();
    this.updateDropDirection();

    // Load initial results for async mode
    if (this.asyncSearch() && this.asyncOptions().length === 0) {
      this.asyncPage = 1;
      this.performAsyncSearch('', 1);
    }
  }

  private updateDropDirection(): void {
    if (this.openUp()) {
      this.dropUp = true;
      return;
    }
    const el = this.elementRef.nativeElement;
    const rect = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    this.dropUp = spaceBelow < 220;
  }

  onSearchInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.searchTerm = target.value;

    if (this.asyncSearch()) {
      this.searchSubject.next(this.searchTerm);
      return;
    }

    if (!this.multiSelect() && this.open) {
      const match = this.filteredOptions.find(
        opt => opt.label.toLowerCase() === this.searchTerm.toLowerCase()
      );
      if (match) {
        this.selectOption(match);
      }
    }
  }

  get filteredOptions(): SelectOption[] {
    let base: SelectOption[];

    if (this.asyncSearch()) {
      base = this.asyncOptions();
    } else {
      const search = this.searchTerm.toLowerCase();
      base = this.options().filter(opt =>
        opt.label.toLowerCase().includes(search)
      );
    }

    // Add creatable option if enabled and search term is not empty
    if (this.creatable() && this.searchTerm && !base.some(o => o.label.toLowerCase() === this.searchTerm.toLowerCase())) {
      const fake: SelectOption = {
        value: this.createOptionLabel(),
        label: `${this.createOptionLabel()} ${this.searchTerm}`,
        disabled: false,
        isNew: true,
      };
      return [...base, fake];
    }

    return base;
  }

  searchInputValue(): string {
    if (this.multiSelect()) {
      return this.searchTerm;
    }
    return this.open ? this.searchTerm : this.display;
  }

  onOptionClick(opt: SelectOption): void {
    if (opt.disabled) return;

    if (!opt.isNew) {
      if (this.multiSelect()) {
        const idx = this.selectedValues.findIndex(o => o.value === opt.value);
        if (idx !== -1) {
          this.selectedValues.splice(idx, 1);
        } else {
          this.selectedValues.push(opt);
        }
        this.onChange(this.selectedValues.map(o => o.value));
      } else {
        this.selectOption(opt);
      }
    } else {
      this.createItem.emit(this.searchTerm);
    }
  }

  isSelected(opt: SelectOption): boolean {
    if (this.multiSelect()) {
      return this.selectedValues.some(o => o.value === opt.value);
    }
    return this.value === opt.value;
  }

  selectOption(opt: SelectOption): void {
    this.value = opt.value;
    this.display = opt.label;
    this.selectedOption = opt;
    this.searchTerm = '';
    this.onChange(opt.value);
    this.open = false;
  }

  clearValue(event: Event): void {
    event.stopPropagation();
    this.value = null;
    this.display = '';
    this.searchTerm = '';
    this.selectedOption = null;
    this.onChange(null);
  }

  removeSelected(item: SelectOption): void {
    this.selectedValues = this.selectedValues.filter(
      o => o.value !== item.value
    );
    this.onChange(this.selectedValues.map(o => o.value));
  }

  onOptionsScroll(event: Event): void {
    if (!this.asyncSearch()) return;
    const el = event.target as HTMLElement;
    const threshold = 50;
    const isNearBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    if (isNearBottom && this.asyncHasMore() && !this.asyncLoadingMore() && !this.asyncLoading()) {
      this.asyncPage++;
      this.performAsyncSearch(this.searchTerm, this.asyncPage, true);
    }
  }

  private performAsyncSearch(query: string, page: number, loadMore = false): void {
    const searchFn = this.asyncSearch();
    if (!searchFn) return;

    if (loadMore) {
      this.asyncLoadingMore.set(true);
    } else {
      this.asyncLoading.set(true);
    }

    this.currentSearchSub?.unsubscribe();
    this.currentSearchSub = searchFn(query, page)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: result => {
          if (loadMore) {
            this.asyncOptions.update(current => [...current, ...result.results]);
          } else {
            this.asyncOptions.set(result.results);
          }
          this.asyncHasMore.set(result.hasMore);
          this.asyncLoading.set(false);
          this.asyncLoadingMore.set(false);
        },
        error: () => {
          this.asyncLoading.set(false);
          this.asyncLoadingMore.set(false);
        },
      });
  }

  // Check if any option has rich content (avatar/secondary label)
  get hasRichOptions(): boolean {
    const opts = this.asyncSearch() ? this.asyncOptions() : this.options();
    return opts.some(o => o.image || o.initials || o.secondaryLabel);
  }

  @HostListener('document:click', ['$event'])
  onClickOutside(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target as Node)) {
      this.open = false;
    }
  }

  protected readonly TypographyTypeEnum = TypographyTypeEnum;
}
