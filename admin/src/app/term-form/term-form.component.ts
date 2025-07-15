import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { Observable, Subscription, forkJoin, take } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';

import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { MdEditorComponent } from './rich-text-editor.module';
import { OrganizationService } from '../services/organization.service';
import { SnackbarService } from '../services/snackbar.service';
import { Country, Language, Organization } from '../models/user.model';
import { TermsService } from '../services/term.service';
import { Term } from "../models/term.model";
import { AngularSvgIconModule } from 'angular-svg-icon';
import { ConfigService } from '../services/config.service';
import { LanguageService } from '../services/language.service';
import { RoutePaths } from '../constants/route-path.enum';

@Component({
  selector: 'app-term-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    MatFormFieldModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MdEditorComponent,
    AngularSvgIconModule
  ],
  templateUrl: './term-form.component.html',
  styleUrl: './term-form.component.scss'
})
export class TermFormComponent implements OnInit, OnDestroy {
  termForm!: FormGroup;
  loading = false;
  isEditMode = false;
  termId: number | null = null;
  organizations: Organization[] = [];
  languages: Language[] = [];
  countries: Country[] = [];
  private subscriptions = new Subscription();
  private initialFormValue: any;


  constructor(
    private route: ActivatedRoute,
    private fb: FormBuilder,
    private router: Router,
    private organizationService: OrganizationService,
    private snackBarService: SnackbarService,
    private termService: TermsService,
    private configService: ConfigService,
    private languageService: LanguageService
  ) {}

  ngOnInit(): void {
    this.initializeForm();
    this.parseRouteParams();
    this.loadInitialData();
  }

  private initializeForm(): void {
    this.termForm = this.fb.group({
      organisationId: ['', Validators.required],
      language: ['', Validators.required],
      country: ['', Validators.required],
      content: ['', Validators.required],
    });
  }
  


  private parseRouteParams(): void {
    this.route.paramMap.pipe(take(1)).subscribe(params => {
      const id = params.get('id');
      this.termId = id ? +id : null;
      this.isEditMode = !!this.termId;
    });

    const params = this.route.snapshot.queryParams;
    if (params['organization']) this.termForm.patchValue({ organisationId: +params['organization'] });
    if (params['language']) this.termForm.patchValue({ language: params['language'] });
    if (params['country']) this.termForm.patchValue({ country: params['country'] });
  }

  private loadInitialData(): void {
    const orgs$ = this.organizationService.getAllOrganizations();
    const observables: Observable<any>[] = [orgs$];

    if (this.isEditMode && this.termId !== null) {
      observables.push(this.termService.getById(this.termId));
      this.termForm.get('organisationId')?.disable();
    }

    this.loading = true;
    this.subscriptions.add(
      forkJoin(observables).subscribe({
        next: ([orgs, termData]) => {
          this.organizations = orgs;

          if (this.isEditMode && termData) {
            this.populateForm(termData);
            this.updateQueryParamsFromForm();
          }

          this.loading = false;
        },
        error: (error) => {
          this.snackBarService.showError(`Failed to load data: ${error.message || 'Unknown error'}`);
          this.loading = false;
        }
      })
    );

    this.loadLanguages();
    this.loadCountries();
  }

  private populateForm(term: Term): void {
    this.termForm.patchValue({
      organisationId: term.organizationId,
      language: term.language,
      country: term.country,
      content: term.content
    });
    this.initialFormValue = this.termForm.getRawValue();
  }
  get isFormChanged(): boolean {
    const currentValue = this.termForm.getRawValue();
    return JSON.stringify(currentValue) !== JSON.stringify(this.initialFormValue);
  }

  private updateQueryParamsFromForm(): void {
    const form = this.termForm.getRawValue();
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        organization: form.organisationId || null,
        language: form.language || null,
        country: form.country || null,
        isEditMode: this.isEditMode || null
      },
      queryParamsHandling: 'merge'
    });
  }

  onFilterChange(): void {
    this.updateQueryParamsFromForm();
  }
  

  onSubmit(): void {
    if (this.termForm.invalid) {
      this.termForm.markAllAsTouched();
      this.snackBarService.showError('Please fill out all required fields.');
      return;
    }

    let payload: any = {
      language: this.termForm.get('language')?.value,
      country: this.termForm.get('country')?.value,
      content: this.termForm.get('content')?.value,
    };
    if (!this.isEditMode) {
      payload.organizationId = this.termForm.get('organisationId')?.value;
    }
    
    console.log(payload);
    
    this.loading = true;
    const operation = this.isEditMode && this.termId
      ? this.termService.update(payload.organizationId, this.termId, payload)
      : this.termService.create(payload);

    this.subscriptions.add(
      operation.subscribe({
        next: () => {
          this.snackBarService.showSuccess(`Term ${this.isEditMode ? 'updated' : 'created'} successfully!`);
          this.router.navigate([RoutePaths.Terms]);
        },
        error: (error) => {
          this.snackBarService.showError(`${error.error.message || 'Unknown error'}`);
          console.log(error);
          
          this.loading = false;
        }
      })
    );
  }

  cancel(): void {
    this.router.navigate([RoutePaths.Terms]);
  }

  hasError(controlName: string, errorType: string): boolean | undefined {
    const control = this.termForm.get(controlName);
    return control?.hasError(errorType) && (control?.touched || control?.dirty);
  }

  loadLanguages(): void {
    this.languageService.getAllLanguages().subscribe({
      next: data => this.languages = data,
      error: err => console.error('Failed to load languages:', err)
    });
  }

  loadCountries(): void {
    this.configService.getCountries().subscribe({
      next: res => this.countries = res,
      error: err => console.error('Failed to load countries:', err)
    });
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }
}
