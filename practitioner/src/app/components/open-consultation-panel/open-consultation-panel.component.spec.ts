import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OpenConsultationPanelComponent } from './open-consultation-panel.component';

describe('OpenConsultationPanelComponent', () => {
  let component: OpenConsultationPanelComponent;
  let fixture: ComponentFixture<OpenConsultationPanelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OpenConsultationPanelComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(OpenConsultationPanelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
