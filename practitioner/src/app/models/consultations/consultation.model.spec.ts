import { ConsultationService } from '../../services/consultations/consultation.service';

describe('Consultation', () => {
  it('should create an instance', () => {
    expect(new ConsultationService()).toBeTruthy();
  });
});
