import { TestBed } from '@angular/core/testing';

import { GuidedTourService } from './guided-tour.service';

describe('GuidedTourService', () => {
  let service: GuidedTourService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(GuidedTourService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
