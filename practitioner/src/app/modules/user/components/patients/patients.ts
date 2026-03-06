import { Component, signal, inject, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil, debounceTime, distinctUntilChanged } from 'rxjs';
import { Page } from '../../../../core/components/page/page';
import { Svg } from '../../../../shared/ui-components/svg/svg';
import { Typography } from '../../../../shared/ui-components/typography/typography';
import { Button } from '../../../../shared/ui-components/button/button';
import { Input } from '../../../../shared/ui-components/input/input';
import { Loader } from '../../../../shared/components/loader/loader';
import { Badge } from '../../../../shared/components/badge/badge';
import { Tabs, TabItem } from '../../../../shared/components/tabs/tabs';
import { ListItem } from '../../../../shared/components/list-item/list-item';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { AddEditPatient } from '../add-edit-patient/add-edit-patient';
import { TypographyTypeEnum } from '../../../../shared/constants/typography';
import { ButtonSizeEnum, ButtonStyleEnum } from '../../../../shared/constants/button';
import { RoutePaths } from '../../../../core/constants/routes';
import { PatientService } from '../../../../core/services/patient.service';
import { ToasterService } from '../../../../core/services/toaster.service';
import { IUser } from '../../models/user';
import { getOnlineStatusBadgeType } from '../../../../shared/tools/helper';
import { getErrorMessage } from '../../../../core/utils/error-helper';
import { TranslatePipe } from '@ngx-translate/core';
import { TranslationService } from '../../../../core/services/translation.service';

type PatientTabType = 'all' | 'registered' | 'temporary';

interface TabCache {
  data: IUser[];
  loaded: boolean;
  searchQuery: string;
  hasMore: boolean;
  currentPage: number;
}

@Component({
  selector: 'app-patients',
  imports: [CommonModule, FormsModule, Page, Svg, Typography, Button, Input, Loader, Badge, Tabs, ListItem, ModalComponent, AddEditPatient, TranslatePipe],
  templateUrl: './patients.html',
  styleUrl: './patients.scss',
})
export class Patients implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private searchSubject$ = new Subject<string>();
  private patientService = inject(PatientService);
  private toasterService = inject(ToasterService);
  private router = inject(Router);
  private t = inject(TranslationService);

  private tabCache: Record<PatientTabType, TabCache> = {
    all: { data: [], loaded: false, searchQuery: '', hasMore: false, currentPage: 1 },
    registered: { data: [], loaded: false, searchQuery: '', hasMore: false, currentPage: 1 },
    temporary: { data: [], loaded: false, searchQuery: '', hasMore: false, currentPage: 1 }
  };

  private pageSize = 20;

  protected readonly TypographyTypeEnum = TypographyTypeEnum;
  protected readonly ButtonSizeEnum = ButtonSizeEnum;
  protected readonly ButtonStyleEnum = ButtonStyleEnum;
  protected readonly getOnlineStatusBadgeType = getOnlineStatusBadgeType;

  loading = signal(false);
  loadingMore = signal(false);
  hasMore = signal(false);
  patients = signal<IUser[]>([]);
  totalCount = signal(0);
  permanentCount = signal(0);
  temporaryCount = signal(0);
  searchQuery = '';
  showAddModal = signal(false);
  activeTab = signal<PatientTabType>('registered');

  get tabItems(): TabItem[] {
    return [
      { id: 'registered', label: this.t.instant('patients.tabPermanent'), count: this.permanentCount() },
      { id: 'temporary', label: this.t.instant('patients.tabTemporary'), count: this.temporaryCount() },
      { id: 'all', label: this.t.instant('patients.tabAll'), count: this.totalCount() }
    ];
  }

  ngOnInit(): void {
    this.loadPatients();
    this.loadCounts();

    this.searchSubject$.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(query => {
      this.invalidateCache();
      this.loadPatients();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadPatients(): void {
    const currentTab = this.activeTab();
    const cache = this.tabCache[currentTab];

    if (cache.loaded && cache.searchQuery === this.searchQuery) {
      this.patients.set(cache.data);
      this.hasMore.set(cache.hasMore);
      return;
    }

    this.loading.set(true);
    const params: { search?: string; page_size?: number; temporary?: boolean } = { page_size: this.pageSize };
    if (this.searchQuery) {
      params.search = this.searchQuery;
    }

    if (currentTab === 'registered') {
      params.temporary = false;
    } else if (currentTab === 'temporary') {
      params.temporary = true;
    }

    this.patientService.getPatients(params).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (response) => {
        const hasMore = response.next !== null;
        this.patients.set(response.results);
        this.hasMore.set(hasMore);
        this.tabCache[currentTab] = {
          data: response.results,
          loaded: true,
          searchQuery: this.searchQuery,
          hasMore,
          currentPage: 1
        };
        this.loading.set(false);
      },
      error: (err) => {
        this.toasterService.show('error', this.t.instant('patients.errorLoading'), getErrorMessage(err));
        this.loading.set(false);
      }
    });
  }

  loadMore(): void {
    if (this.loadingMore() || !this.hasMore()) return;

    const currentTab = this.activeTab();
    const cache = this.tabCache[currentTab];
    const nextPage = cache.currentPage + 1;

    this.loadingMore.set(true);
    const params: { search?: string; page_size?: number; page?: number; temporary?: boolean } = {
      page_size: this.pageSize,
      page: nextPage
    };
    if (this.searchQuery) {
      params.search = this.searchQuery;
    }

    if (currentTab === 'registered') {
      params.temporary = false;
    } else if (currentTab === 'temporary') {
      params.temporary = true;
    }

    this.patientService.getPatients(params).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (response) => {
        const hasMore = response.next !== null;
        const newData = [...cache.data, ...response.results];
        this.patients.set(newData);
        this.hasMore.set(hasMore);
        this.tabCache[currentTab] = {
          ...cache,
          data: newData,
          hasMore,
          currentPage: nextPage
        };
        this.loadingMore.set(false);
      },
      error: (err) => {
        this.toasterService.show('error', this.t.instant('patients.errorLoading'), getErrorMessage(err));
        this.loadingMore.set(false);
      }
    });
  }

  setActiveTab(tabId: string): void {
    this.activeTab.set(tabId as PatientTabType);
    this.loadPatients();
  }

  onSearchChange(query: string): void {
    this.searchQuery = query;
    this.searchSubject$.next(query);
  }

  getInitials(patient: IUser): string {
    const first = patient.first_name?.charAt(0) || '';
    const last = patient.last_name?.charAt(0) || '';
    return (first + last).toUpperCase() || 'U';
  }

  getFullName(patient: IUser): string {
    return `${patient.first_name || ''} ${patient.last_name || ''}`.trim() || patient.email;
  }

  viewPatient(patient: IUser): void {
    this.router.navigate([RoutePaths.USER, 'patients', patient.pk]);
  }

  openAddModal(): void {
    this.showAddModal.set(true);
  }

  closeAddModal(): void {
    this.showAddModal.set(false);
  }

  onPatientCreated(): void {
    this.closeAddModal();
    this.invalidateCache();
    this.loadPatients();
    this.loadCounts();
  }

  private invalidateCache(): void {
    this.tabCache = {
      all: { data: [], loaded: false, searchQuery: '', hasMore: false, currentPage: 1 },
      registered: { data: [], loaded: false, searchQuery: '', hasMore: false, currentPage: 1 },
      temporary: { data: [], loaded: false, searchQuery: '', hasMore: false, currentPage: 1 }
    };
  }

  private loadCounts(): void {
    this.patientService.getPatients({ page_size: 1 }).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (response) => this.totalCount.set(response.count)
    });

    this.patientService.getPatients({ page_size: 1, temporary: false }).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (response) => this.permanentCount.set(response.count)
    });

    this.patientService.getPatients({ page_size: 1, temporary: true }).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (response) => this.temporaryCount.set(response.count)
    });
  }
}
