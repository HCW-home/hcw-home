# Toast Notification System

This document explains how to use the global toast notification system implemented across the HCW-home platform.

## Overview

The toast notification system provides a consistent way to display feedback messages to users across all applications. It supports three types of notifications:

- **Success** (green): Confirms successful operations
- **Error** (red): Indicates errors and problems
- **Warning** (yellow): Displays warnings or important notices

## Implementation

The system has been implemented in all three applications (admin, practitioner, and patient) with a consistent approach:

1. **ToastService**: A service that manages toast messages
2. **ToastComponent**: A UI component that displays the toast messages
3. **ToastInterceptor**: An HTTP interceptor that automatically shows success/error messages based on API responses

## How to Use

### Automatic Toast Notifications (via HTTP Interceptor)

Toast notifications will be automatically displayed for:

- **Errors**: When an API call fails, an error toast is shown with the error message
- **Success**: When a POST/PUT/DELETE API call succeeds, a success toast is shown

The error message is extracted from `error.error.message`, falling back to "An error occurred" if no message is provided.
The success message is extracted from `response.body.message`, falling back to "Operation completed successfully" if no message is provided.

### Manual Toast Notifications

You can manually trigger toast notifications from any component or service by injecting the `ToastService`:

```typescript
import { Component } from '@angular/core';
import { ToastService } from 'path/to/services/toast.service';

@Component({
  selector: 'app-example',
  template: '...'
})
export class ExampleComponent {
  constructor(private toastService: ToastService) {}

  showSuccess() {
    this.toastService.show('Operation completed successfully', 'success');
  }

  showError() {
    this.toastService.show('Something went wrong', 'error');
  }

  showWarning() {
    this.toastService.show('Please review your data', 'warning');
  }
}
```

## Customizing the Toast Service

The ToastService supports the following methods:

- `show(message: string, type: 'success' | 'error' | 'warning' = 'success')`: Displays a toast with the specified message and type
- `hide()`: Manually hides the currently displayed toast

By default, toasts automatically disappear after 3 seconds, but you can manually hide them earlier if needed.

## UI Appearance

The toast notifications are positioned at:
- **Admin/Practitioner**: Bottom right corner of the screen
- **Patient**: Bottom center of the screen

Each toast type has its own distinct color to help users quickly identify the message type:
- Success: Green
- Error: Red
- Warning: Yellow/Orange

## Styling Customization

If you need to customize the appearance of the toast notifications, you can modify:
- For admin and practitioner: The SCSS files at `src/app/components/toast/toast.component.scss`
- For patient: The inline styles in `src/app/components/toast/toast.component.ts` 