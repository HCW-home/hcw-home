import { Component, OnInit, OnDestroy } from '@angular/core';
import { UserService } from '../services/user.service';
import { User, UserRole, UserStatus, UserSex } from '../models/user.model'; 
import { Subscription, Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatTableModule,
    MatPaginatorModule,
    MatIconModule,
    MatChipsModule
  ],
  templateUrl: './users.component.html',
  styleUrls: ['./users.component.scss']
})
export class UsersComponent implements OnInit, OnDestroy {
  users: User[] = [];
  totalUsers: number = 0;
  currentPage: number = 1;
  pageSize: number = 10;
  loading: boolean = false;
  
  searchQuery: string = '';
  filterRole: UserRole | '' = '';
  filterStatus: UserStatus | '' = '';
  filterSex: UserSex | '' = '';

  displayedColumns: string[] = [
    'name', 'email', 'phoneNumber', 'country',
    'sex', 'role', 'status', 'temporaryAccount', 'actions'
  ];

  private searchSubject = new Subject<string>();
  private subscriptions: Subscription = new Subscription();

  constructor(
    private userService: UserService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadUsers();

    this.subscriptions.add(
      this.searchSubject.pipe(
        debounceTime(300),
        distinctUntilChanged()
      ).subscribe(() => {
        this.currentPage = 1;
        this.loadUsers();
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  loadUsers(): void {
    this.loading = true;
    this.subscriptions.add(
      this.userService.getUsers(
        this.currentPage,
        this.pageSize,
        this.searchQuery,
        this.filterRole === '' ? undefined : this.filterRole,
        this.filterStatus === '' ? undefined : this.filterStatus,
        this.filterSex === '' ? undefined : this.filterSex
      ).subscribe({
        next: (response) => {
          console.log( 'fetched data:', response);
          console.log('users:', response.users);
          this.users = response.users;
          this.totalUsers = response.total;
          this.currentPage = response.page;
          this.pageSize = response.limit;
          this.loading = false;
        },
        error: (error: any) => {
          console.error('Error loading users:', error);
          alert(`Failed to load users: ${error.message || 'Unknown error'}`);
          this.users = [];
          this.totalUsers = 0;
          this.loading = false;
        }
      })
    );
  }

  applyFilter(event: KeyboardEvent): void {
    const filterValue = (event.target as HTMLInputElement).value.trim().toLowerCase();
    this.searchQuery = filterValue;
    this.searchSubject.next(filterValue);
  }

  pageChange(event: { pageIndex: number; pageSize: number; length: number }): void {
    this.currentPage = event.pageIndex + 1;
    this.pageSize = event.pageSize;
    this.loadUsers();
  }

  deleteUser(user: User): void {
    if (confirm(`Are you sure you want to delete user ${user.firstName} ${user.lastName}?`)) {
      this.loading = true;
      this.subscriptions.add(
        this.userService.deleteUser(user.id).subscribe({
          next: () => {
            alert('User deleted successfully!');
            this.loadUsers();
          },
          error: (error: any) => {
            console.error('Error deleting user:', error);
            alert(`Failed to delete user: ${error.message || 'Unknown error'}`);
            this.loading = false;
          }
        })
      );
    }
  }

  addNewUser(): void {
    this.router.navigate(['/user-form']);
  }

  editUser(userId: number): void {
    this.router.navigate(['/users', userId, 'edit']);
  }

  formatColumnHeader(col: string): string {
    return col.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase());
  }
}
