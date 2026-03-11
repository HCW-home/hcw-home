import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, takeUntil } from 'rxjs';
import { IonIcon } from '@ionic/angular/standalone';
import { UserWebSocketService } from '../../../core/services/user-websocket.service';
import { TranslatePipe } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import { cloudOfflineOutline, syncOutline } from 'ionicons/icons';
import { WebSocketState } from '../../../core/models/websocket.model';

@Component({
  selector: 'app-offline-indicator',
  standalone: true,
  imports: [CommonModule, IonIcon, TranslatePipe],
  templateUrl: './offline-indicator.component.html',
  styleUrls: ['./offline-indicator.component.scss'],
})
export class OfflineIndicatorComponent implements OnInit, OnDestroy {
  connectionState: WebSocketState = WebSocketState.DISCONNECTED;
  WebSocketState = WebSocketState;
  private destroy$ = new Subject<void>();
  private wasConnected = false;

  constructor(private userWebSocket: UserWebSocketService) {
    addIcons({ cloudOfflineOutline, syncOutline });
  }

  ngOnInit(): void {
    this.userWebSocket.connectionState$
      .pipe(takeUntil(this.destroy$))
      .subscribe(state => {
        this.connectionState = state;
        if (state === WebSocketState.CONNECTED) {
          this.wasConnected = true;
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get isOffline(): boolean {
    return this.wasConnected && this.connectionState !== WebSocketState.CONNECTED;
  }

  get isReconnecting(): boolean {
    return this.connectionState === WebSocketState.RECONNECTING ||
           this.connectionState === WebSocketState.CONNECTING;
  }
}
