import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TestCallComponent } from './test-call.component';

describe('TestCallComponent', () => {
  let component: TestCallComponent;
  let fixture: ComponentFixture<TestCallComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestCallComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TestCallComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
