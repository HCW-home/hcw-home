import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatTabsModule } from '@angular/material/tabs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { SpecialityService } from '../services/speciality.service';
import { LanguageService } from '../services/language.service';
import { OrganizationService } from '../services/organization.service';
import { GroupService } from '../services/group.service';
import { SnackbarService } from '../services/snackbar.service';
import { AngularSvgIconModule } from 'angular-svg-icon';
import { ColorSketchModule } from 'ngx-color/sketch';
import { MarkdownModule } from 'ngx-markdown';
import { MdEditorComponent } from '../term-form/rich-text-editor.module';

@Component({
  selector: 'app-resource-manager',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatTabsModule,
    MatFormFieldModule,
    MatInputModule,
    MatTableModule,
    MatIconModule,
    MatButtonModule,
    MatSelectModule,
    AngularSvgIconModule,
    ColorSketchModule,
    MarkdownModule,
    MdEditorComponent,
  ],
  templateUrl: './resource-manager.component.html',
  styleUrls: ['./resource-manager.component.scss']
})
export class ResourceManagerComponent {
  selectedTabIndex = 0;
  resourceForm: FormGroup;
  resources: any[] = [];
  organizations: any[] = [];
  selectedOrganizationId: number | null = null;
  isEditMode = false;
  editResourceId: number | null = null;
  selectedLogoFile: File | null = null;
  existingLogoUrl: string = '';
  selectedLogoFileName: string | null = null;

  displayedColumns: string[] = ['name', 'actions'];

  tabs = [
    { label: 'Organizations', type: 'organization' },
    { label: 'Groups', type: 'group' },
    { label: 'Languages', type: 'language' },
    { label: 'Specialities', type: 'speciality' },
  ];

  constructor(
    private specialityService: SpecialityService,
    private languageService: LanguageService,
    private organizationService: OrganizationService,
    private groupService: GroupService,
    private snackBarService: SnackbarService,
    private fb: FormBuilder
  ) {
    this.resourceForm = this.fb.group({
      name: ['', Validators.required],
      logo: [''],
      primaryColor: [''],
      footerMarkdown: [''],
      description: ['']
    });
    this.loadResources();
    this.loadOrganizations();
  }

  onTabChange(index: number) {
    this.selectedTabIndex = index;
    if (this.tabs[index].type === 'group') {
      this.selectedOrganizationId = null;
      this.resources = [];
    } else {
      this.loadResources();
    }
    this.resetForm();
  }

  loadOrganizations() {
    this.organizationService.getAllOrganizations().subscribe({
      next: (data) => this.organizations = data,
      error: () => this.snackBarService.showError('Failed to load organizations')
    });
  }

  loadResources() {
    const type = this.tabs[this.selectedTabIndex].type;

    if (type === 'organization') {
      this.organizationService.getAllOrganizations().subscribe({
        next: (data) => this.resources = data,
        error: () => this.snackBarService.showError('Failed to load organizations')
      });
    } else if (type === 'group' && this.selectedOrganizationId) {
      this.groupService.getGroupsByOrganization(this.selectedOrganizationId).subscribe({
        next: (data) => this.resources = data,
        error: () => this.snackBarService.showError('Failed to load groups')
      });
    } else if (type === 'language') {
      this.languageService.getAllLanguages().subscribe({
        next: (data) => this.resources = data,
        error: () => this.snackBarService.showError('Failed to load languages')
      });
    } else if (type === 'speciality') {
      this.specialityService.getAllSpecialities().subscribe({
        next: (data) => this.resources = data,
        error: () => this.snackBarService.showError('Failed to load specialities')
      });
    }
  }

  onOrganizationChange() {
    this.loadResources();
    this.resetForm();
  }

  showColorPicker = false;

  toggleColorPicker(event: MouseEvent) {
    event.stopPropagation();
    this.showColorPicker = !this.showColorPicker;
  }

  onColorChange(event: any) {
    this.resourceForm.patchValue({ primaryColor: event.color.hex });
  }

  hideColorPicker() {
    this.showColorPicker = false;
  }

  onSubmit() {
    if (this.resourceForm.invalid) return;

    const type = this.tabs[this.selectedTabIndex].type;
    const payload: any = { name: this.resourceForm.value.name };

    if (type === 'organization') {
      payload.primaryColor = this.resourceForm.value.primaryColor;
      payload.footerMarkdown = this.resourceForm.value.footerMarkdown;

      if (this.selectedLogoFile) {
        this.uploadLogo(this.selectedLogoFile).subscribe({
          next: (res) => {
            console.log('Full upload response:', res);
            console.log('Logo uploaded successfully with URL:', res.url);
            payload.logo = res.url;
            console.log('Final Payload:', payload);
            this.saveResource(type, payload);
          },
          error: () => this.snackBarService.showError('Logo upload failed')
        });
      } else {
        payload.logo = this.resourceForm.value.logo;
        console.log('Final Payload:', payload);
        this.saveResource(type, payload);
      }
    } else if (type === 'group') {
      payload.description = this.resourceForm.value.description;
      this.saveResource(type, payload);
    } else {
      this.saveResource(type, payload);
    }
  }

  saveResource(type: string, payload: any) {
    if (this.isEditMode && this.editResourceId !== null) {
      this.updateResource(type, this.editResourceId, payload);
    } else {
      this.createResource(type, payload);
    }
  }

  onLogoSelected(event: any) {
    event.preventDefault();
    event.stopPropagation();
    this.selectedLogoFile = event.target.files[0];
    this.selectedLogoFileName = event.target.files[0] ? event.target.files[0].name : null;
  }

  uploadLogo(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    return this.organizationService.uploadLogo(formData);
  }

  createResource(type: string, payload: any) {
    if (type === 'organization') {
      this.organizationService.createOrganization(payload).subscribe({
        next: () => {
          this.snackBarService.showSuccess('Organization created successfully');
          this.postSave();
        },
        error: (err) => {
          const message = err?.error?.message;
          if (Array.isArray(message)) {
            this.snackBarService.showError(message[0]);
          } else if (typeof message === 'string') {
            this.snackBarService.showError(message);
          } else {
            this.snackBarService.showError('Failed to create organization');
          }
        }

      });
    } else if (type === 'group' && this.selectedOrganizationId) {
      this.groupService.createGroup(this.selectedOrganizationId, payload).subscribe({
        next: () => {
          this.snackBarService.showSuccess('Group created successfully');
          this.postSave();
        },
        error: (err) => {
          const message = err?.error?.message;
          if (Array.isArray(message)) {
            this.snackBarService.showError(message[0]);
          } else if (typeof message === 'string') {
            this.snackBarService.showError(message);
          } else {
            this.snackBarService.showError('Failed to create group');
          }
        }
      });
    } else if (type === 'language') {
      this.languageService.createLanguage(payload).subscribe({
        next: () => {
          this.snackBarService.showSuccess('Language created successfully');
          this.postSave();
        },
        error: (err) => {
          const message = err?.error?.message;
          if (Array.isArray(message)) {
            this.snackBarService.showError(message[0]);
          } else if (typeof message === 'string') {
            this.snackBarService.showError(message);
          } else {
            this.snackBarService.showError('Failed to create language')
          }
        }



      });
    } else if (type === 'speciality') {
      this.specialityService.createSpeciality(payload).subscribe({
        next: () => {
          this.snackBarService.showSuccess('Speciality created successfully');
          this.postSave();
        },
        error: (err) => {
          const message = err?.error?.message;
          if (Array.isArray(message)) {
            this.snackBarService.showError(message[0]);
          } else if (typeof message === 'string') {
            this.snackBarService.showError(message);
          } else {
            this.snackBarService.showError('Failed to create speciality')
          }
        }
      });
    }
  }

  updateResource(type: string, id: number, payload: any) {
    if (type === 'organization') {
      this.organizationService.updateOrganization(id, payload).subscribe({
        next: () => {
          this.snackBarService.showSuccess('Organization updated successfully');
          this.postSave();
        },
        error: () => this.snackBarService.showError('Failed to update organization')
      });
    } else if (type === 'group' && this.selectedOrganizationId) {
      this.groupService.updateGroup(this.selectedOrganizationId, id, payload).subscribe({
        next: () => {
          this.snackBarService.showSuccess('Group updated successfully');
          this.postSave();
        },
        error: () => this.snackBarService.showError('Failed to update group')
      });
    } else if (type === 'language') {
      this.languageService.updateLanguage(id, payload).subscribe({
        next: () => {
          this.snackBarService.showSuccess('Language updated successfully');
          this.postSave();
        },
        error: () => this.snackBarService.showError('Failed to update language')
      });
    } else if (type === 'speciality') {
      this.specialityService.updateSpeciality(id, payload).subscribe({
        next: () => {
          this.snackBarService.showSuccess('Speciality updated successfully');
          this.postSave();
        },
        error: () => this.snackBarService.showError('Failed to update speciality')
      });
    }
  }

  deleteResource(id: number) {
    const type = this.tabs[this.selectedTabIndex].type;

    if (type === 'organization') {
      this.organizationService.deleteOrganization(id).subscribe({
        next: () => {
          this.snackBarService.showSuccess('Organization deleted successfully');
          this.loadResources();
        },
        error: () => this.snackBarService.showError('Failed to delete organization')
      });
    } else if (type === 'group' && this.selectedOrganizationId) {
      this.groupService.deleteGroup(this.selectedOrganizationId, id).subscribe({
        next: () => {
          this.snackBarService.showSuccess('Group deleted successfully');
          this.loadResources();
        },
        error: () => this.snackBarService.showError('Failed to delete group')
      });
    } else if (type === 'language') {
      this.languageService.deleteLanguage(id).subscribe({
        next: () => {
          this.snackBarService.showSuccess('Language deleted successfully');
          this.loadResources();
        },
        error: () => this.snackBarService.showError('Failed to delete language')
      });
    } else if (type === 'speciality') {
      this.specialityService.deleteSpeciality(id).subscribe({
        next: () => {
          this.snackBarService.showSuccess('Speciality deleted successfully');
          this.loadResources();
        },
        error: () => this.snackBarService.showError('Failed to delete speciality')
      });
    }
  }
  editResource(resource: any) {
    this.isEditMode = true;
    this.editResourceId = resource.id;
    const patchData: any = { name: resource.name };
    this.existingLogoUrl = resource.logo || '';
    this.selectedLogoFileName = resource.logo;

    if (this.tabs[this.selectedTabIndex].type === 'organization') {
      patchData.logo = resource.logo || '';
      patchData.primaryColor = resource.primaryColor || '';
      patchData.footerMarkdown = resource.footerMarkdown || '';
    } else if (this.tabs[this.selectedTabIndex].type === 'group') {
      patchData.description = resource.description || '';
    }
    this.resourceForm.patchValue(patchData);
  }

  resetForm() {
    this.resourceForm.reset();
    this.isEditMode = false;
    this.editResourceId = null;
    this.selectedLogoFile = null;
    this.existingLogoUrl = '';
    this.selectedLogoFileName = null;
  }

  postSave() {
    this.resetForm();
    this.loadResources();
  }
}
