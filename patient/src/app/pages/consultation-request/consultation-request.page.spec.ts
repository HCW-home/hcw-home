import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ConsultationRequestPage } from './consultation-request.page';

describe('ConsultationRequestPage', () => {
  let component: ConsultationRequestPage;
  let fixture: ComponentFixture<ConsultationRequestPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(ConsultationRequestPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
