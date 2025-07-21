import { Component, inject, OnInit, signal } from '@angular/core';
import { TermService } from '../../services/term.service';
import { MarkdownModule } from 'ngx-markdown';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { SnackbarService } from '../../services/snackbar/snackbar.service';

@Component({
  selector: 'app-term',
  standalone: true,
  imports: [MarkdownModule,CommonModule,ReactiveFormsModule],
  templateUrl: './term.component.html',
  styleUrls: ['./term.component.scss']
})
export class TermComponent implements OnInit {
  private termService = inject(TermService)
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private snakebarservice=inject(SnackbarService)

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
    console.log(term.content);
    
    this.markdownContent = term.content ?? '*No terms found.*';
  }


  handleSubmit() {
    console.log('User accepted all terms');

    if (this.termsForm.valid) {
      console.log('User accepted all terms');
      const term = this.termService.getLatestTrem()
      const id = term?.id;
      console.log(id);
      
      const queryParams = this.route.snapshot.queryParams;
      this.returnUrl = queryParams['returnUrl'] || '/dashboard';
      if(id !=null){
      this.termService.acceptTerm(id).subscribe({
        next: (response) => {
          this.snakebarservice.showSuccess("New term accepted")
          this.termService.deletelatestTerm()
          console.log('Term accepted successfully', response);
          this.router.navigateByUrl(this.returnUrl)
        },
        error: (error) => {
          this.snakebarservice.showError(error.error.message)
          console.error('Failed to accept term', error);
        }
      });
    }
    }
  }
  
}
