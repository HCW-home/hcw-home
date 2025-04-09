import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OpenConsultationsComponent } from './open-consultations.component';

describe('OpenConsultationsComponent', () => {
  let component: OpenConsultationsComponent;
  let fixture: ComponentFixture<OpenConsultationsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OpenConsultationsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(OpenConsultationsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
