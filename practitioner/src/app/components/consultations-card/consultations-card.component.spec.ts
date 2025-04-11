import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ConsultationCardComponent } from './consultations-card.component';

describe('ConsultationCardComponent', () => {
  let component: ConsultationCardComponent;
  let fixture: ComponentFixture<ConsultationCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConsultationCardComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ConsultationCardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
