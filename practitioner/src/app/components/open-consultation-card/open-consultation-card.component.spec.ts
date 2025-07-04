import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OpenConsultationCardComponent } from './open-consultation-card.component';

describe('OpenConsultationCardComponent', () => {
  let component: OpenConsultationCardComponent;
  let fixture: ComponentFixture<OpenConsultationCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OpenConsultationCardComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(OpenConsultationCardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
