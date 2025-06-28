// term-form.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Observable, Subscription, forkJoin } from 'rxjs';
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
import { Term } from "../models/term.model"
import { AngularSvgIconModule } from 'angular-svg-icon';


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
  organizations: Organization[] = [];
  termId: number | null = null;
  languages: Language[] = [];
  countries: Country[] = [];
  private subscriptions = new Subscription();

  constructor(
    private route: ActivatedRoute,
    private fb: FormBuilder,
    private router: Router,
    private organizationService: OrganizationService,
    private snackBarService: SnackbarService,
    private termService: TermsService
  ) {}

  ngOnInit(): void {
    this.termForm = this.fb.group({
      organisationId: ['', Validators.required],
      language: ['', Validators.required],
      country: ['', Validators.required],
      content: ['', Validators.required]
    });

    this.route.paramMap.subscribe(params => {
      const id = params.get('id');
      this.termId = id ? +id : null;
      this.isEditMode = !!this.termId;
      this.loadFormData();
    });
    console.log(this.isEditMode,this.termId);


    this.loadLanguages();
    this.loadCountries();
  }

  loadFormData(): void {
    this.loading = true;
    const orgs$ = this.organizationService.getAllOrganizations();
    const observables: Observable<any>[] = [orgs$];

    if (this.isEditMode && this.termId !== null) {
      observables.push(this.termService.getById(this.termId)); // Use dynamic org ID if needed
      this.termForm.get('organisationId')?.disable()
    }

    this.subscriptions.add(
      forkJoin(observables).subscribe({
        next: (results: any[]) => {
          this.organizations = results[0];
          if (this.isEditMode && results[1]) {
            const termdata: Term = results[1];
            console.log(termdata);
            
            this.termForm.patchValue({
              organisationId: termdata.organizationId,
              language: termdata.language,
              country: termdata.country,
              content: termdata.content
            });
          }
          this.loading = false;
        },
        error: (error) => {
          this.snackBarService.showError(`Failed to load data: ${error.message || 'Unknown error'}`);
          this.loading = false;
        }
      })
    );
  }

  loadLanguages(): void {
    this.languages = [
      { id: 1, name: 'English' },
      { id: 2, name: 'Hindi' },
      { id: 3, name: 'German' },
      { id: 4, name: 'Japanese' },
      { id: 5, name: 'Portuguese' }
    ];
  }

  loadCountries(): void {
    this.countries = [
      { id: 1, name: 'India' },
      { id: 2, name: 'United States' },
      { id: 3, name: 'Germany' },
      { id: 4, name: 'Japan' },
      { id: 5, name: 'Brazil' }
    ];
  }

  onSubmit(): void {
    if (this.termForm.invalid) {
      this.termForm.markAllAsTouched();
      this.snackBarService.showError('Please fill out all required fields.');
      return;
    }

    const formValue = this.termForm.value;
    const payload = {
      organizationId: formValue.organisationId,
      language: formValue.language,
      country: formValue.country,
      content: formValue.content,
    };

    this.loading = true;
    console.log(this.isEditMode,this.termId);
    

    const operation = this.isEditMode && this.termId
      ? this.termService.update(payload.organizationId,this.termId, payload)
      : this.termService.create(payload);

    this.subscriptions.add(
      operation.subscribe({
        next: () => {
          this.snackBarService.showSuccess(`Term ${this.isEditMode ? 'updated' : 'created'} successfully!`);
          this.router.navigate(['/terms']);
        },
        error: (error) => {
          console.error('Error saving term:', error);
          this.snackBarService.showError(`Failed: ${error.message || 'Unknown error'}`);
          this.loading = false;
        }
      })
    );
  }

  cancel(): void {
    this.router.navigate(['/term']);
  }

  hasError(controlName: string, errorType: string): boolean | undefined {
    const control = this.termForm.get(controlName);
    return control?.hasError(errorType) && (control?.touched || control?.dirty);
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }
}
