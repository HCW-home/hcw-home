import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ClosedConsultationsComponent } from './closed-consultations.component';

describe('ClosedConsultationsComponent', () => {
  let component: ClosedConsultationsComponent;
  let fixture: ComponentFixture<ClosedConsultationsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ClosedConsultationsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ClosedConsultationsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
