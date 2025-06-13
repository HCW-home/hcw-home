import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PostConsultationFeedbackPage } from './post-consultation-feedback.page';

describe('PostConsultationFeedbackPage', () => {
  let component: PostConsultationFeedbackPage;
  let fixture: ComponentFixture<PostConsultationFeedbackPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(PostConsultationFeedbackPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
