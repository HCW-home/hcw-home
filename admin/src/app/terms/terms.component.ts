
import { Component, OnInit, OnDestroy } from '@angular/core';
import { UserService } from '../services/user.service';
import { Subscription, Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { SnackbarService } from '../services/snackbar.service';
import { Term,TermQuery } from '../models/term.model';
import { TermsService } from '../services/term.service';
import { OrganizationService } from '../services/organization.service';
import { Organization } from "../models/user.model"
import { AngularSvgIconModule } from 'angular-svg-icon';
import { MatTooltipModule } from '@angular/material/tooltip';
@Component({
  selector: 'app-terms',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatTableModule,
    MatPaginatorModule,
    MatIconModule,
    MatChipsModule,
    AngularSvgIconModule,
    MatTooltipModule
  ],
  templateUrl: './terms.component.html',
  styleUrls: ['./terms.component.scss']
})
export class TermsComponent implements OnInit, OnDestroy {
  terms: Term[] = [];
  totalTerms: number = 0;
  currentPage: number = 1;
  pageSize: number = 10;
  loading: boolean = false;
  
  displayedColumns: string[] = ['termId', 'country', 'language', 'version', 'organizationName', 'actions'];


  filterCountry: string = ''
  filterLanguage:string = '';
  filterOrganization: number | '' = '';

  countryOptions: string[] = [];
  languageOptions: string[] = [];
  organizations: Organization[] = [];



  
  private subscriptions: Subscription = new Subscription();

  constructor(
    private router: Router,
    private snackBarService: SnackbarService,
    private termService: TermsService,
    private organizationService: OrganizationService
  ) { }

  ngOnInit(): void {
    this.loadOrganizations()
    this.findOptions();
    this.loadTerms();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  loadTerms(): void {
    this.loading = true;
    const query: TermQuery = {
      language: this.filterLanguage || undefined,
      country: this.filterCountry || undefined,
      organizationId: this.filterOrganization === '' ? undefined : +this.filterOrganization,
      page: this.currentPage,
      limit: this.pageSize
    };
  
    this.subscriptions.add(
      this.termService.getAll(query).subscribe({
        next: (response) => {
          this.terms = (response.data as Term[]).map((term): Term => ({
            ...term,
            organizationName: this.organizations.find(org => org.id === term.organizationId)?.name || 'Unknown'
          }));
          console.log(response);
          
          this.totalTerms = response.pagination.total;
          this.currentPage = response.pagination.page;
          this.pageSize = response.pagination.limit;
          this.loading = false;
        },
        error: (error: any) => {
          this.snackBarService.showError(`Failed to load users: ${error.message || 'Unknown error'}`);
          this.terms = [];
          this.totalTerms = 0;
          this.loading = false;
        }
      })
    );
  }
  
  findOptions(): void {
    this.termService.getAll({}).subscribe({
      next: (response) => {
        const terms = response.data as Term[];
        const countriesSet = new Set<string>();
        const languagesSet = new Set<string>();
  
        terms.forEach(term => {
          if (term.country) countriesSet.add(term.country);
          if (term.language) languagesSet.add(term.language);
        });
  
        this.countryOptions = Array.from(countriesSet).sort();
        this.languageOptions = Array.from(languagesSet).sort();
      },
      error: (error) => {
        console.error('Failed to load options:', error);
      }
    });
  }
  



  loadOrganizations(): void {
    this.organizationService.getAllOrganizations().subscribe({
      next: (orgs) => {
        this.organizations = orgs;
        console.log('Organizations loaded:', this.organizations);
      },
      error: (error) => {
        console.error('Failed to load organizations:', error);
      }
    });
  }


  pageChange(event: PageEvent): void {
    this.currentPage = event.pageIndex + 1;
    this.pageSize = event.pageSize;
    this.loadTerms();
  }

  deleteTerm(term: Term): void {
    if (confirm(`Are you sure you want to delete this Term`)) {
      this.loading = true;
      this.subscriptions.add(
        this.termService.delete(term.id).subscribe({
          next: () => {
            this.snackBarService.showSuccess('Term deleted successfully!');
            this.loadTerms();
          },
          error: (error: any) => {
            this.snackBarService.showError(`Failed to delete user: ${error.message || 'Unknown error'}`);
            this.loading = false;
          }
        })
      );
    }
  }

  addNewTerm(): void {
    this.router.navigate(['/term/new']);
  }

  editTerm(TermId: number,): void {
    this.router.navigate([`/term/${TermId}`]);
  }


}
