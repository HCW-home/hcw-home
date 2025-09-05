import { Component, inject, OnInit, signal } from '@angular/core';
import { TermService } from '../../services/term.service';
import { MarkdownModule } from 'ngx-markdown';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';

@Component({
  selector: 'app-term-box',
  templateUrl: './term-box.component.html',
  styleUrls: ['./term-box.component.scss'],
  imports: [MarkdownModule,CommonModule,ReactiveFormsModule],

})

export class TermBoxComponent implements OnInit {
  private termService = inject(TermService)
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  private termId = signal<number | null>(null);
  
  termsForm: FormGroup;
  markdownContent: string = '';
  returnUrl:string='';

  termsList = [
    'I accept all the Terms and Conditions',
    'I have read the agreement carefully',
    'I agree to share my data responsibly'
  ];

  constructor(private fb: FormBuilder) {
    this.termsForm = this.fb.group({});
    this.termsList.forEach((_, index) => {
      this.termsForm.addControl(`term${index}`, this.fb.control(false, Validators.requiredTrue));
    });
  }


  ngOnInit(): void {
    const term = this.termService.getLatestTrem()
    if (!term) {
      return
    }
    
    this.markdownContent = term.content ?? '*No terms found.*';
  }


  handleSubmit() {

    if (this.termsForm.valid) {
      const term = this.termService.getLatestTrem()
      const id = term?.id;
      
      const queryParams = this.route.snapshot.queryParams;
      this.returnUrl = queryParams['redirect'] || '/dashboard';
      if(id !=null){
      this.termService.acceptTerm(id).subscribe({
        next: (response) => {
          this.router.navigateByUrl(this.returnUrl)
        },
        error: (error) => {
          console.error('Failed to accept term', error);
        }
      });
    }
    }
  }
  
}
