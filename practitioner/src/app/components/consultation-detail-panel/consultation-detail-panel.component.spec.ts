import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ConsultationDetailPanelComponent } from './consultation-detail-panel.component';

describe('ConsultationDetailPanelComponent', () => {
  let component: ConsultationDetailPanelComponent;
  let fixture: ComponentFixture<ConsultationDetailPanelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConsultationDetailPanelComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ConsultationDetailPanelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
