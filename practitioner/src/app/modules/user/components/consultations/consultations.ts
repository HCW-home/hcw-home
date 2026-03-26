import {
  Component,
  OnInit,
  OnDestroy,
  signal,
  inject,
  computed,
} from '@angular/core';
import { Subject, takeUntil, debounceTime, distinctUntilChanged } from 'rxjs';
import { Router, ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Page } from '../../../../core/components/page/page';
import { Button } from '../../../../shared/ui-components/button/button';
import { Typography } from '../../../../shared/ui-components/typography/typography';
import { Input } from '../../../../shared/ui-components/input/input';
import { Tabs, TabItem } from '../../../../shared/components/tabs/tabs';
import { ConsultationRowItem } from '../../../../shared/components/consultation-row-item/consultation-row-item';
import {
  ButtonSizeEnum,
  ButtonStyleEnum,
} from '../../../../shared/constants/button';
import { TypographyTypeEnum } from '../../../../shared/constants/typography';
import { BadgeTypeEnum } from '../../../../shared/constants/badge';
import { Svg } from '../../../../shared/ui-components/svg/svg';
import { ConsultationService } from '../../../../core/services/consultation.service';
import { UserWebSocketService } from '../../../../core/services/user-websocket.service';
import { Consultation, Queue } from '../../../../core/models/consultation';
import { Loader } from '../../../../shared/components/loader/loader';
import { RoutePaths } from '../../../../core/constants/routes';
import { getErrorMessage } from '../../../../core/utils/error-helper';
import { ToasterService } from '../../../../core/services/toaster.service';
import { TranslatePipe } from '@ngx-translate/core';
import { TranslationService } from '../../../../core/services/translation.service';
import { UserSearchSelect } from '../../../../shared/components/user-search-select/user-search-select';
import { UserService } from '../../../../core/services/user.service';
import { IUser } from '../../models/user';

type ConsultationTabType = 'active' | 'past' | 'overdue';

interface TabCache {
  data: Consultation[];
  loaded: boolean;
  searchQuery: string;
  hasMore: boolean;
  currentPage: number;
}

@Component({
  selector: 'app-consultations',
  imports: [
    CommonModule,
    FormsModule,
    Page,
    Button,
    Typography,
    Input,
    Tabs,
    Svg,
    Loader,
    ConsultationRowItem,
    TranslatePipe,
    UserSearchSelect,
  ],
  templateUrl: './consultations.html',
  styleUrl: './consultations.scss',
})
export class Consultations implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private searchSubject$ = new Subject<string>();
  private route = inject(ActivatedRoute);
  private toasterService = inject(ToasterService);
  private t = inject(TranslationService);
  private userService = inject(UserService);
  private userWsService = inject(UserWebSocketService);

  private tabCache: Record<ConsultationTabType, TabCache> = {
    active: {
      data: [],
      loaded: false,
      searchQuery: '',
      hasMore: false,
      currentPage: 1,
    },
    past: {
      data: [],
      loaded: false,
      searchQuery: '',
      hasMore: false,
      currentPage: 1,
    },
    overdue: {
      data: [],
      loaded: false,
      searchQuery: '',
      hasMore: false,
      currentPage: 1,
    },
  };

  private pageSize = 20;

  activeTab = signal<ConsultationTabType>('overdue');
  consultations = signal<Consultation[]>([]);
  activeCount = signal(0);
  pastCount = signal(0);
  overdueCount = signal(0);
  loading = signal<boolean>(false);
  loadingMore = signal<boolean>(false);
  hasMore = signal<boolean>(false);
  error = signal<string | null>(null);
  searchQuery = '';

  currentUser = signal<IUser | null>(null);

  // Filters
  showFilters = signal(false);
  queues = signal<Queue[]>([]);
  filterBeneficiary = signal<number | null>(null);
  filterCreatedBy = signal<number | null>(null);
  filterOwnedBy = signal<number | null>(null);
  filterGroup = signal<number | null>(null);
  filterBeneficiaryUser = signal<IUser | null>(null);
  filterCreatedByUser = signal<IUser | null>(null);
  filterOwnedByUser = signal<IUser | null>(null);
  activeFilterCount = computed(() => {
    let count = 0;
    if (this.filterBeneficiary()) count++;
    if (this.filterCreatedBy()) count++;
    if (this.filterOwnedBy()) count++;
    if (this.filterGroup()) count++;
    return count;
  });

  protected readonly ButtonSizeEnum = ButtonSizeEnum;
  protected readonly ButtonStyleEnum = ButtonStyleEnum;
  protected readonly TypographyTypeEnum = TypographyTypeEnum;
  protected readonly BadgeTypeEnum = BadgeTypeEnum;

  constructor(
    private router: Router,
    private consultationService: ConsultationService
  ) {}

  ngOnInit() {
    this.route.fragment.pipe(takeUntil(this.destroy$)).subscribe(fragment => {
      if (
        fragment === 'active' ||
        fragment === 'past' ||
        fragment === 'overdue'
      ) {
        this.activeTab.set(fragment);
      }
      this.loadConsultations();
    });

    this.loadCounts();
    this.loadQueues();

    this.userService.currentUser$
      .pipe(takeUntil(this.destroy$))
      .subscribe(user => this.currentUser.set(user));

    this.searchSubject$
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(() => {
        this.invalidateCache();
        this.loadConsultations();
      });

    this.userWsService.consultationEvent$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.invalidateCache();
        this.loadConsultations();
        this.loadCounts();
      });

    this.userWsService.consultationMessage$
      .pipe(takeUntil(this.destroy$))
      .subscribe(event => {
        if (event.state !== 'created') return;
        const senderId = event.data?.created_by?.id;
        const currentUserId = this.currentUser()?.pk;
        if (senderId && senderId !== currentUserId) {
          this.consultations.update(list =>
            list.map(c =>
              c.id === event.consultation_id
                ? { ...c, unread_count: (c.unread_count || 0) + 1 }
                : c
            )
          );
        }
      });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get tabItems(): TabItem[] {
    return [
      {
        id: 'overdue',
        label: this.t.instant('consultations.tabOverdue'),
        count: this.overdueCount(),
      },
      {
        id: 'active',
        label: this.t.instant('consultations.tabActive'),
        count: this.activeCount(),
      },
      {
        id: 'past',
        label: this.t.instant('consultations.tabClosed'),
        count: this.pastCount(),
      },
    ];
  }

  toggleFilters(): void {
    this.showFilters.update(v => !v);
  }

  onSearchChange(query: string): void {
    this.searchQuery = query;
    this.searchSubject$.next(query);
  }

  setActiveTab(tab: string) {
    this.activeTab.set(tab as ConsultationTabType);
    this.router.navigate([], { fragment: tab, replaceUrl: true });
    this.loadConsultations();
  }

  loadConsultations(): void {
    const currentTab = this.activeTab();
    const cache = this.tabCache[currentTab];

    if (cache.loaded && cache.searchQuery === this.searchQuery) {
      this.consultations.set(cache.data);
      this.hasMore.set(cache.hasMore);
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    const params: Record<string, any> = {
      page_size: this.pageSize,
      ...this.getFilterParams(),
    };
    if (currentTab === 'overdue') {
      params['is_closed'] = false;
      params['scheduled'] = false;
    } else if (currentTab === 'active') {
      params['is_closed'] = false;
      params['scheduled'] = true;
    } else {
      params['is_closed'] = true;
    }
    if (this.searchQuery) {
      params['search'] = this.searchQuery;
    }

    this.consultationService
      .getConsultations(params)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: response => {
          const hasMore = response.next !== null;
          this.consultations.set(response.results);
          this.hasMore.set(hasMore);
          this.tabCache[currentTab] = {
            data: response.results,
            loaded: true,
            searchQuery: this.searchQuery,
            hasMore,
            currentPage: 1,
          };
          this.loading.set(false);
        },
        error: err => {
          this.toasterService.show(
            'error',
            this.t.instant('consultations.errorLoading'),
            getErrorMessage(err)
          );
          this.loading.set(false);
        },
      });
  }

  loadMore(): void {
    if (this.loadingMore() || !this.hasMore()) return;

    const currentTab = this.activeTab();
    const cache = this.tabCache[currentTab];
    const nextPage = cache.currentPage + 1;

    this.loadingMore.set(true);

    const params: Record<string, any> = {
      page_size: this.pageSize,
      page: nextPage,
      ...this.getFilterParams(),
    };
    if (currentTab === 'overdue') {
      params['is_closed'] = false;
      params['scheduled'] = false;
    } else if (currentTab === 'active') {
      params['is_closed'] = false;
      params['scheduled'] = true;
    } else {
      params['is_closed'] = true;
    }
    if (this.searchQuery) {
      params['search'] = this.searchQuery;
    }

    this.consultationService
      .getConsultations(params)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: response => {
          const hasMore = response.next !== null;
          const newData = [...cache.data, ...response.results];
          this.consultations.set(newData);
          this.hasMore.set(hasMore);
          this.tabCache[currentTab] = {
            ...cache,
            data: newData,
            hasMore,
            currentPage: nextPage,
          };
          this.loadingMore.set(false);
        },
        error: err => {
          this.toasterService.show(
            'error',
            this.t.instant('consultations.errorLoading'),
            getErrorMessage(err)
          );
          this.loadingMore.set(false);
        },
      });
  }

  viewConsultationDetails(consultation: Consultation) {
    this.router.navigate([
      `/${RoutePaths.USER}/${RoutePaths.CONSULTATIONS}`,
      consultation.id,
    ]);
  }

  editConsultation(consultation: Consultation) {
    this.router.navigate([
      `/${RoutePaths.USER}/${RoutePaths.CONSULTATIONS}`,
      consultation.id,
      'edit',
    ]);
  }

  createConsultation() {
    this.router.navigate([
      `/${RoutePaths.USER}/${RoutePaths.CONSULTATIONS}/new`,
    ]);
  }

  retryLoadConsultations() {
    this.invalidateCache();
    this.loadConsultations();
  }

  getStatusBadgeType(): BadgeTypeEnum {
    switch (this.activeTab()) {
      case 'active':
        return BadgeTypeEnum.green;
      case 'past':
        return BadgeTypeEnum.gray;
      case 'overdue':
        return BadgeTypeEnum.orange;
    }
  }

  getStatusLabel(): string {
    switch (this.activeTab()) {
      case 'active':
        return this.t.instant('consultations.statusActive');
      case 'past':
        return this.t.instant('consultations.statusClosed');
      case 'overdue':
        return this.t.instant('consultations.statusOverdue');
    }
  }

  private invalidateCache(): void {
    this.tabCache = {
      active: {
        data: [],
        loaded: false,
        searchQuery: '',
        hasMore: false,
        currentPage: 1,
      },
      past: {
        data: [],
        loaded: false,
        searchQuery: '',
        hasMore: false,
        currentPage: 1,
      },
      overdue: {
        data: [],
        loaded: false,
        searchQuery: '',
        hasMore: false,
        currentPage: 1,
      },
    };
  }

  onBeneficiaryChange(user: IUser | null): void {
    this.filterBeneficiary.set(user?.pk ?? null);
    this.filterBeneficiaryUser.set(user);
    this.applyFilters();
  }

  onCreatedByChange(user: IUser | null): void {
    this.filterCreatedBy.set(user?.pk ?? null);
    this.filterCreatedByUser.set(user);
    this.applyFilters();
  }

  onOwnedByChange(user: IUser | null): void {
    this.filterOwnedBy.set(user?.pk ?? null);
    this.filterOwnedByUser.set(user);
    this.applyFilters();
  }

  onGroupChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.filterGroup.set(value ? +value : null);
    this.applyFilters();
  }

  private applyFilters(): void {
    this.invalidateCache();
    this.loadConsultations();
    this.loadCounts();
  }

  private getFilterParams(): Record<string, number> {
    const params: Record<string, number> = {};
    if (this.filterBeneficiary())
      params['beneficiary'] = this.filterBeneficiary()!;
    if (this.filterCreatedBy()) params['created_by'] = this.filterCreatedBy()!;
    if (this.filterOwnedBy()) params['owned_by'] = this.filterOwnedBy()!;
    if (this.filterGroup()) params['group'] = this.filterGroup()!;
    return params;
  }

  private loadQueues(): void {
    this.consultationService
      .getQueues()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: queues => this.queues.set(queues),
      });
  }

  private loadCounts(): void {
    const filters = this.getFilterParams();

    this.consultationService
      .getConsultations({ is_closed: false, scheduled: true, page_size: 1, ...filters })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: response => this.activeCount.set(response.count),
      });

    this.consultationService
      .getConsultations({ is_closed: true, page_size: 1, ...filters })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: response => this.pastCount.set(response.count),
      });

    this.consultationService
      .getConsultations({ is_closed: false, scheduled: false, page_size: 1, ...filters })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: response => this.overdueCount.set(response.count),
      });
  }
}
