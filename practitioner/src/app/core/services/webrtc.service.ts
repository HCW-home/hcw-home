import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { ConsultationWebSocketService } from './consultation-websocket.service';
import {
  LocalStream,
  RemoteStream,
  WebRTCConfig,
  JanusJsep,
  JanusParticipant,
} from '../models/webrtc';

@Injectable({
  providedIn: 'root',
})
export class WebRTCService {
  private localStreamSubject = new BehaviorSubject<LocalStream | null>(null);
  private remoteStreamsSubject = new BehaviorSubject<RemoteStream[]>([]);
  private isPublishingSubject = new BehaviorSubject<boolean>(false);
  private errorSubject = new Subject<string>();

  public localStream$: Observable<LocalStream | null> = this.localStreamSubject.asObservable();
  public remoteStreams$: Observable<RemoteStream[]> = this.remoteStreamsSubject.asObservable();
  public isPublishing$: Observable<boolean> = this.isPublishingSubject.asObservable();
  public error$: Observable<string> = this.errorSubject.asObservable();

  private publisherPeerConnection: RTCPeerConnection | null = null;
  private iceConfig: RTCConfiguration | null = null;

  constructor(private wsService: ConsultationWebSocketService) {
    this.setupWebSocketListeners();
  }

  private setupWebSocketListeners(): void {
    this.wsService.allEvents$.subscribe(event => {
      const eventType = (event as { type?: string }).type;
      switch (eventType) {
        case 'ice_config':
          {
            const iceEvent = event as { data: { iceServers: RTCIceServer[]; iceCandidatePoolSize: number; bundlePolicy: string; rtcpMuxPolicy: string; iceTransportPolicy: string } };
            this.iceConfig = {
              iceServers: iceEvent.data.iceServers,
              iceCandidatePoolSize: iceEvent.data.iceCandidatePoolSize,
              bundlePolicy: iceEvent.data.bundlePolicy as RTCBundlePolicy,
              rtcpMuxPolicy: iceEvent.data.rtcpMuxPolicy as RTCRtcpMuxPolicy,
              iceTransportPolicy: iceEvent.data.iceTransportPolicy as RTCIceTransportPolicy,
            };
          }
          break;

        case 'room_created':
          break;

        case 'janus_event':
          {
            const janusEvent = event as { payload: { janus?: string; jsep?: JanusJsep; feed_id?: number; plugindata?: unknown } };
            this.handleJanusEvent(janusEvent.payload);
          }
          break;

        case 'participants':
          {
            const participantsEvent = event as { data: JanusParticipant[] };
            this.handleParticipants(participantsEvent.data);
          }
          break;
      }
    });
  }

  async initializeMedia(config: WebRTCConfig = {}): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: config.audio !== false,
        video: config.video !== false ? {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user',
          ...(typeof config.video === 'object' ? config.video : {})
        } : false,
      });

      this.localStreamSubject.next({
        stream,
        audioEnabled: true,
        videoEnabled: config.video !== false,
      });
    } catch (error) {
      console.error('Failed to get user media:', error);
      this.errorSubject.next('Failed to access camera/microphone');
      throw error;
    }
  }

  async joinRoom(displayName: string): Promise<void> {
    if (!this.wsService.isConnected()) {
      this.errorSubject.next('WebSocket not connected');
      return;
    }

    this.wsService.send({
      type: 'join',
      data: { display_name: displayName },
    });
  }

  async publishStream(): Promise<void> {
    const localStream = this.localStreamSubject.value;
    if (!localStream) {
      this.errorSubject.next('No local stream available');
      return;
    }

    if (!this.iceConfig) {
      this.errorSubject.next('ICE configuration not received');
      return;
    }

    try {
      this.isPublishingSubject.next(true);

      this.publisherPeerConnection = new RTCPeerConnection(this.iceConfig);

      localStream.stream.getTracks().forEach(track => {
        this.publisherPeerConnection?.addTrack(track, localStream.stream);
      });

      this.publisherPeerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          this.wsService.send({
            type: 'trickle',
            data: { candidate: event.candidate.toJSON() },
          });
        } else {
          this.wsService.send({
            type: 'trickle',
            data: { candidate: null },
          });
        }
      };

      const offer = await this.publisherPeerConnection.createOffer();
      await this.publisherPeerConnection.setLocalDescription(offer);

      const jsep: JanusJsep = {
        type: 'offer',
        sdp: offer.sdp!,
      };

      this.wsService.send({
        type: 'publish',
        data: { jsep },
      });

    } catch (error) {
      console.error('Failed to publish stream:', error);
      this.errorSubject.next('Failed to publish video stream');
      this.isPublishingSubject.next(false);
    }
  }

  private async handleJanusEvent(payload: { janus?: string; jsep?: JanusJsep; feed_id?: number; plugindata?: unknown }): Promise<void> {
    if (payload.jsep) {
      if (payload.jsep.type === 'answer') {
        if (payload.feed_id) {
          await this.handleSubscriberAnswer(payload.feed_id, payload.jsep);
        } else {
          await this.handlePublisherAnswer(payload.jsep);
        }
      }
    }

    if (payload.plugindata) {
      const data = (payload.plugindata as { data?: { publishers?: JanusParticipant[]; unpublished?: number } }).data;
      if (data?.publishers) {
        data.publishers.forEach(publisher => {
          this.subscribeToFeed(publisher.id);
        });
      }

      if (data?.unpublished) {
        this.removeRemoteStream(data.unpublished);
      }
    }
  }

  private async handlePublisherAnswer(jsep: JanusJsep): Promise<void> {
    if (!this.publisherPeerConnection) return;

    try {
      await this.publisherPeerConnection.setRemoteDescription(new RTCSessionDescription(jsep));
      this.isPublishingSubject.next(true);
    } catch (error) {
      console.error('Failed to set remote description:', error);
      this.errorSubject.next('Failed to establish connection');
    }
  }

  private async subscribeToFeed(feedId: number): Promise<void> {
    const existing = this.remoteStreamsSubject.value.find(s => s.feedId === feedId);
    if (existing) return;

    if (!this.iceConfig) return;

    try {
      const pc = new RTCPeerConnection(this.iceConfig);

      pc.ontrack = (event) => {
        console.log('Received remote track:', feedId);
        const [remoteStream] = event.streams;

        const newRemote: RemoteStream = {
          feedId,
          stream: remoteStream,
          participant: { id: feedId, display: `User ${feedId}` },
          peerConnection: pc,
        };

        this.remoteStreamsSubject.next([...this.remoteStreamsSubject.value, newRemote]);
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          this.wsService.send({
            type: 'trickle',
            data: { candidate: event.candidate.toJSON(), feed_id: feedId },
          });
        } else {
          this.wsService.send({
            type: 'trickle',
            data: { candidate: null, feed_id: feedId },
          });
        }
      };

      pc.addTransceiver('audio', { direction: 'recvonly' });
      pc.addTransceiver('video', { direction: 'recvonly' });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      this.wsService.send({
        type: 'subscribe',
        data: { feed_id: feedId },
      });

    } catch (error) {
      console.error('Failed to subscribe to feed:', error);
    }
  }

  private async handleSubscriberAnswer(feedId: number, jsep: JanusJsep): Promise<void> {
    const remote = this.remoteStreamsSubject.value.find(s => s.feedId === feedId);
    if (!remote) return;

    try {
      await remote.peerConnection.setRemoteDescription(new RTCSessionDescription(jsep));

      this.wsService.send({
        type: 'start',
        data: { jsep: { type: 'answer', sdp: '' }, feed_id: feedId },
      });
    } catch (error) {
      console.error('Failed to handle subscriber answer:', error);
    }
  }

  private handleParticipants(participants: JanusParticipant[]): void {
    const remotes = this.remoteStreamsSubject.value;
    remotes.forEach(remote => {
      const participant = participants.find(p => p.id === remote.feedId);
      if (participant) {
        remote.participant = participant;
      }
    });
    this.remoteStreamsSubject.next([...remotes]);
  }

  private removeRemoteStream(feedId: number): void {
    const remotes = this.remoteStreamsSubject.value;
    const filtered = remotes.filter(r => {
      if (r.feedId === feedId) {
        r.peerConnection.close();
        return false;
      }
      return true;
    });
    this.remoteStreamsSubject.next(filtered);
  }

  toggleAudio(): void {
    const local = this.localStreamSubject.value;
    if (!local) return;

    const audioTrack = local.stream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      local.audioEnabled = audioTrack.enabled;
      this.localStreamSubject.next({ ...local });
    }
  }

  toggleVideo(): void {
    const local = this.localStreamSubject.value;
    if (!local) return;

    const videoTrack = local.stream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      local.videoEnabled = videoTrack.enabled;
      this.localStreamSubject.next({ ...local });
    }
  }

  cleanup(): void {
    const local = this.localStreamSubject.value;
    if (local) {
      local.stream.getTracks().forEach(track => track.stop());
      this.localStreamSubject.next(null);
    }

    if (this.publisherPeerConnection) {
      this.publisherPeerConnection.close();
      this.publisherPeerConnection = null;
    }

    this.remoteStreamsSubject.value.forEach(remote => {
      remote.peerConnection.close();
    });
    this.remoteStreamsSubject.next([]);

    this.isPublishingSubject.next(false);
  }
}
