import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ConsultationHistoryComponent } from './consultation-history.component';

describe('ConsultationHistoryComponent', () => {
  let component: ConsultationHistoryComponent;
  let fixture: ComponentFixture<ConsultationHistoryComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConsultationHistoryComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ConsultationHistoryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
