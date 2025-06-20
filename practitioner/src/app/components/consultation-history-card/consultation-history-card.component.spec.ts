import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ConsultationHistoryCardComponent } from './consultation-history-card.component';

describe('ConsultationHistoryCardComponent', () => {
  let component: ConsultationHistoryCardComponent;
  let fixture: ComponentFixture<ConsultationHistoryCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConsultationHistoryCardComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ConsultationHistoryCardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
