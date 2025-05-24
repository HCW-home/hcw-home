import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { of } from 'rxjs';
import { WaitingRoomComponent } from './waiting-room.component';
import { ConsultationService } from '../services/consultations/consultation.service';
import { ConsultationSocketService } from '../services/consultations/consultation-socket.service';
import { ToastService } from '../services/toast.service';

describe('WaitingRoomComponent', () => {
  let component: WaitingRoomComponent;
  let fixture: ComponentFixture<WaitingRoomComponent>;
  let mockConsultationService: any;
  let mockSocketService: any;
  let mockToastService: any;

  beforeEach(waitForAsync(() => {
    mockConsultationService = {
      getWaitingConsultations: jasmine
        .createSpy('getWaitingConsultations')
        .and.returnValue(of([])),
    };
    mockSocketService = {
      patientJoined$: of({ consultationId: 1, patientId: 99 }),
    };
    mockToastService = {
      show: jasmine.createSpy('show'),
    };

    TestBed.configureTestingModule({
      declarations: [WaitingRoomComponent],
      providers: [
        { provide: ConsultationService, useValue: mockConsultationService },
        { provide: ConsultationSocketService, useValue: mockSocketService },
        { provide: ToastService, useValue: mockToastService },
      ],
    }).compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(WaitingRoomComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the waiting room component', () => {
    expect(component).toBeTruthy();
  });

  it('should load consultations on init', () => {
    expect(mockConsultationService.getWaitingConsultations).toHaveBeenCalled();
  });

  it('should subscribe to patientJoined$ and show toast', () => {
    expect(mockToastService.show).toHaveBeenCalledWith(
      'A patient joined consultation 1',
      jasmine.objectContaining({ type: 'info' })
    );
  });

  it('should have empty consultations initially', () => {
    expect(component.consultations.length).toBe(0);
  });
});
