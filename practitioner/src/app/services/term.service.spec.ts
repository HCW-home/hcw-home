import { TestBed } from '@angular/core/testing';

import { TermService } from './term.service';

describe('TermService', () => {
  let service: TermService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(TermService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
