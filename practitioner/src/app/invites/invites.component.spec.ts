import { ComponentFixture, TestBed } from '@angular/core/testing';

import { InvitesComponent } from './invites.component';

describe('InvitesComponent', () => {
  let component: InvitesComponent;
  let fixture: ComponentFixture<InvitesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InvitesComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(InvitesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
