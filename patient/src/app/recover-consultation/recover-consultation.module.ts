import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';
import { ReactiveFormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';

import { RecoverConsultationComponent } from './recover-consultation.component';

const routes: Routes = [
  { path: '', component: RecoverConsultationComponent }
];

@NgModule({
  declarations: [
    RecoverConsultationComponent
  ],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    HttpClientModule,
    RouterModule.forChild(routes)
  ]
})
export class RecoverConsultationModule { } 