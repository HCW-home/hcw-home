import { TestBed } from '@angular/core/testing';

import { SpecialityService } from './speciality.service';

describe('SpecialityService', () => {
  let service: SpecialityService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SpecialityService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
