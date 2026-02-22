import {
  Component,
  OnInit,
  OnDestroy,
  signal,
  computed,
  inject,
  ViewChild,
  ElementRef,
  DestroyRef,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule,
} from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Subject, takeUntil } from 'rxjs';

import { UserService } from '../../../../core/services/user.service';
import { Auth } from '../../../../core/services/auth';
import { ToasterService } from '../../../../core/services/toaster.service';
import {
  LiveKitService,
  ConnectionStatus,
} from '../../../../core/services/livekit.service';
import { IUser, IUserUpdateRequest, ILanguage } from '../../models/user';
import { CommunicationMethodEnum } from '../../constants/user';

import { Page } from '../../../../core/components/page/page';
import { Tabs, TabItem } from '../../../../shared/components/tabs/tabs';
import { Loader } from '../../../../shared/components/loader/loader';
import { Badge } from '../../../../shared/components/badge/badge';
import { Select } from '../../../../shared/ui-components/select/select';
import { Svg } from '../../../../shared/ui-components/svg/svg';
import { Button } from '../../../../shared/ui-components/button/button';

import { BadgeTypeEnum } from '../../../../shared/constants/badge';
import {
  ButtonSizeEnum,
  ButtonStyleEnum,
} from '../../../../shared/constants/button';
import { SelectOption } from '../../../../shared/models/select';
import { ValidationService } from '../../../../core/services/validation.service';
import { TranslationService } from '../../../../core/services/translation.service';
import { getErrorMessage } from '../../../../core/utils/error-helper';
import { TIMEZONE_OPTIONS } from '../../../../shared/constants/timezone';
import { TranslatePipe } from '@ngx-translate/core';
import { LocalVideoTrack, LocalAudioTrack } from 'livekit-client';

type TestStatus = 'idle' | 'testing' | 'working' | 'error' | 'playing';

@Component({
  selector: 'app-user-profile',
  templateUrl: './user-profile.html',
  styleUrl: './user-profile.scss',
  imports: [
    Svg,
    Page,
    Tabs,
    Loader,
    Badge,
    Select,
    Button,
    CommonModule,
    ReactiveFormsModule,
    TranslatePipe,
  ],
})
export class UserProfile implements OnInit, OnDestroy {
  @ViewChild('avatarFileInput') avatarFileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('videoElement') videoElement?: ElementRef<HTMLVideoElement>;

  private destroy$ = new Subject<void>();
  private destroyRef = inject(DestroyRef);
  public validationService = inject(ValidationService);
  private t = inject(TranslationService);
  private livekitService = inject(LiveKitService);

  protected readonly BadgeTypeEnum = BadgeTypeEnum;
  protected readonly ButtonSizeEnum = ButtonSizeEnum;
  protected readonly ButtonStyleEnum = ButtonStyleEnum;

  user = signal<IUser | null>(null);
  languages = signal<ILanguage[]>([]);
  isLoadingUser = signal(false);
  isSaving = signal(false);
  isUploadingAvatar = signal(false);

  profileForm: FormGroup;

  // Tab system
  activeTab = signal<'profile' | 'system-test'>('profile');
  tabItems = computed<TabItem[]>(() => [
    { id: 'profile', label: this.t.instant('userProfile.tabProfile') },
    { id: 'system-test', label: this.t.instant('userProfile.tabSystemTest') },
  ]);

  setActiveTab(tab: string): void {
    this.activeTab.set(tab as 'profile' | 'system-test');
  }

  // System test state
  connectionStatus = signal<ConnectionStatus>('disconnected');
  cameraStatus = signal<TestStatus>('idle');
  microphoneStatus = signal<TestStatus>('idle');
  speakerStatus = signal<TestStatus>('idle');

  private localVideoTrack: LocalVideoTrack | null = null;
  private localAudioTrack: LocalAudioTrack | null = null;
  private audioContext: AudioContext | null = null;
  private analyserNode: AnalyserNode | null = null;
  private animationFrame: number | null = null;
  private testAudio: HTMLAudioElement | null = null;
  private isConnecting = false;

  volumeBars = signal<number[]>(Array(20).fill(0));

  get communicationMethods(): SelectOption[] {
    return [
      {
        label: this.t.instant('userProfile.commSms'),
        value: CommunicationMethodEnum.SMS,
      },
      {
        label: this.t.instant('userProfile.commEmail'),
        value: CommunicationMethodEnum.EMAIL,
      },
      {
        label: this.t.instant('userProfile.commWhatsApp'),
        value: CommunicationMethodEnum.WHATSAPP,
      },
      {
        label: this.t.instant('userProfile.commPush'),
        value: CommunicationMethodEnum.PUSH,
      },
      {
        label: this.t.instant('userProfile.commManual'),
        value: CommunicationMethodEnum.MANUAL,
      },
    ];
  }
  timezoneOptions: SelectOption[] = TIMEZONE_OPTIONS;
  languageOptions = signal<SelectOption[]>([]);
  preferredLanguageOptions = signal<SelectOption[]>([]);

  constructor(
    private fb: FormBuilder,
    private userService: UserService,
    private authService: Auth,
    private toasterService: ToasterService
  ) {
    this.profileForm = this.fb.group({
      first_name: [{ value: '', disabled: true }],
      last_name: [{ value: '', disabled: true }],
      email: [{ value: '', disabled: true }],
      mobile_phone_number: [''],
      communication_method: ['email', [Validators.required]],
      preferred_language: [null],
      timezone: ['UTC', Validators.required],
      language_ids: [[]],
    });
  }

  ngOnInit(): void {
    this.loadUserProfile();
    this.loadDropdownData();
    this.setupLivekitSubscriptions();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.cleanup();
  }

  loadUserProfile(): void {
    this.isLoadingUser.set(true);
    this.userService
      .getCurrentUser()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: user => {
          this.user.set(user);
          this.populateForm(user);
          this.isLoadingUser.set(false);
        },
        error: error => {
          this.isLoadingUser.set(false);
          this.toasterService.show(
            'error',
            this.t.instant('userProfile.errorLoadingProfile'),
            getErrorMessage(error)
          );
        },
      });
  }

  private populateForm(user: IUser): void {
    const languageIds = user.languages?.map(lang => lang.id) || [];

    this.profileForm.patchValue({
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      email: user.email,
      mobile_phone_number: user.mobile_phone_number || '',
      communication_method: user.communication_method || 'email',
      preferred_language: user.preferred_language || null,
      timezone: user.timezone || 'UTC',
      language_ids: languageIds,
    });
  }

  saveProfile(): void {
    if (this.profileForm.valid && !this.isSaving()) {
      this.isSaving.set(true);

      const formValue = this.profileForm.value;
      const updateData: IUserUpdateRequest = {
        mobile_phone_number: formValue.mobile_phone_number || undefined,
        communication_method: formValue.communication_method,
        preferred_language: formValue.preferred_language,
        timezone: formValue.timezone,
        language_ids: this.getLanguageIds(formValue.language_ids),
      };

      this.userService
        .updateCurrentUser(updateData)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: updatedUser => {
            this.user.set(updatedUser);
            this.isSaving.set(false);
            if (formValue.preferred_language) {
              this.t.setLanguage(formValue.preferred_language);
            }
            this.toasterService.show(
              'success',
              this.t.instant('userProfile.profileUpdated'),
              this.t.instant('userProfile.profileUpdatedMessage')
            );
          },
          error: error => {
            this.isSaving.set(false);
            this.toasterService.show(
              'error',
              this.t.instant('userProfile.errorUpdatingProfile'),
              getErrorMessage(error)
            );
          },
        });
    } else {
      this.validationService.validateAllFormFields(this.profileForm);
    }
  }

  loadDropdownData(): void {
    this.authService
      .getOpenIDConfig()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: config => {
          this.preferredLanguageOptions.set(
            (config.languages || []).map(lang => ({
              label: lang.name,
              value: lang.code,
            }))
          );
        },
      });

    this.userService
      .getLanguages()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: languages => {
          this.languages.set(languages);
          this.languageOptions.set(
            languages.map(lang => ({
              label: lang.name,
              value: lang.code,
            }))
          );
        },
        error: error => {
          this.toasterService.show(
            'error',
            this.t.instant('userProfile.errorLoadingLanguages'),
            getErrorMessage(error)
          );
        },
      });
  }

  private getLanguageIds(languageIds: number[]): number[] {
    return languageIds || [];
  }

  getInitials(): string {
    const user = this.user();
    if (!user) return '';
    const first = user.first_name?.charAt(0) || '';
    const last = user.last_name?.charAt(0) || '';
    return (first + last).toUpperCase();
  }

  openAvatarFilePicker(): void {
    this.avatarFileInput.nativeElement.click();
  }

  onAvatarFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      if (file.type.startsWith('image/')) {
        this.uploadAvatar(file);
      } else {
        this.toasterService.show(
          'error',
          this.t.instant('userProfile.invalidFile'),
          this.t.instant('userProfile.invalidFileMessage')
        );
      }
    }
    input.value = '';
  }

  uploadAvatar(file: File): void {
    this.isUploadingAvatar.set(true);
    this.userService
      .uploadProfilePicture(file)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: updatedUser => {
          this.user.set(updatedUser);
          this.isUploadingAvatar.set(false);
          this.toasterService.show(
            'success',
            this.t.instant('userProfile.pictureUpdated'),
            this.t.instant('userProfile.pictureUpdatedMessage')
          );
        },
        error: error => {
          this.isUploadingAvatar.set(false);
          this.toasterService.show(
            'error',
            this.t.instant('userProfile.errorUploadingPicture'),
            getErrorMessage(error)
          );
        },
      });
  }

  // ===== System Test Methods =====

  private setupLivekitSubscriptions(): void {
    this.livekitService.connectionStatus$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(status => {
        this.connectionStatus.set(status);
      });

    this.livekitService.localVideoTrack$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(track => {
        if (this.localVideoTrack && this.videoElement?.nativeElement) {
          this.localVideoTrack.detach(this.videoElement.nativeElement);
        }
        this.localVideoTrack = track;
        if (track) {
          if (this.cameraStatus() === 'testing') {
            this.cameraStatus.set('working');
          }
          setTimeout(() => this.attachLocalVideo(), 50);
        }
      });

    this.livekitService.localAudioTrack$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(track => {
        this.localAudioTrack = track;
        if (track) {
          this.setupAudioVisualization(track);
          if (this.microphoneStatus() === 'testing') {
            this.microphoneStatus.set('working');
          }
        } else {
          this.stopAudioVisualization();
        }
      });

    this.livekitService.error$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(error => {
        this.toasterService.show(
          'error',
          this.t.instant('common.error'),
          error
        );
      });
  }

  private async ensureConnected(): Promise<boolean> {
    if (this.livekitService.isConnected()) {
      return true;
    }

    if (this.isConnecting) {
      return false;
    }

    this.isConnecting = true;

    try {
      const config = await this.userService
        .getTestRtcInfo()
        .pipe(takeUntilDestroyed(this.destroyRef))
        .toPromise();

      if (!config) {
        throw new Error(this.t.instant('configuration.failedToGetTestInfo'));
      }

      await this.livekitService.connect({
        url: config.url,
        token: config.token,
        room: config.room,
      });

      return true;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : this.t.instant('configuration.failedToConnect');
      this.toasterService.show(
        'error',
        this.t.instant('configuration.connectionError'),
        message
      );
      return false;
    } finally {
      this.isConnecting = false;
    }
  }

  getConnectionStatusText(): string {
    switch (this.connectionStatus()) {
      case 'disconnected':
        return this.t.instant('configuration.connectionNotConnected');
      case 'connecting':
        return this.t.instant('configuration.connectionConnecting');
      case 'connected':
        return this.t.instant('configuration.connectionConnected');
      case 'reconnecting':
        return this.t.instant('configuration.connectionReconnecting');
      case 'failed':
        return this.t.instant('configuration.connectionFailed');
      default:
        return '';
    }
  }

  getConnectionStatusColor(): string {
    switch (this.connectionStatus()) {
      case 'connected':
        return 'var(--emerald-500)';
      case 'connecting':
      case 'reconnecting':
        return 'var(--amber-500)';
      case 'failed':
        return 'var(--rose-500)';
      default:
        return 'var(--slate-400)';
    }
  }

  getCameraStatusText(): string {
    switch (this.cameraStatus()) {
      case 'idle':
        return this.t.instant('configuration.statusNotTested');
      case 'testing':
        return this.t.instant('configuration.statusTesting');
      case 'working':
        return this.t.instant('configuration.statusWorking');
      case 'error':
        return this.t.instant('configuration.statusError');
      default:
        return '';
    }
  }

  getCameraPlaceholderText(): string {
    if (this.connectionStatus() === 'connecting') {
      return this.t.instant('configuration.connectingToServer');
    }
    switch (this.cameraStatus()) {
      case 'idle':
        return this.t.instant('configuration.cameraClickToBegin');
      case 'testing':
        return this.t.instant('configuration.cameraAccessing');
      case 'error':
        return this.t.instant('configuration.cameraDenied');
      default:
        return this.t.instant('configuration.cameraPreviewHere');
    }
  }

  async testCamera(): Promise<void> {
    this.cameraStatus.set('testing');

    try {
      const connected = await this.ensureConnected();
      if (!connected) {
        this.cameraStatus.set('error');
        return;
      }

      await this.livekitService.enableCamera(true);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : this.t.instant('configuration.cameraTestFailed');
      this.toasterService.show(
        'error',
        this.t.instant('configuration.cameraError'),
        message
      );
      this.cameraStatus.set('error');
    }
  }

  private attachLocalVideo(): void {
    if (!this.videoElement?.nativeElement || !this.localVideoTrack) {
      return;
    }
    this.localVideoTrack.attach(this.videoElement.nativeElement);
  }

  async stopCamera(): Promise<void> {
    try {
      if (this.localVideoTrack && this.videoElement?.nativeElement) {
        this.localVideoTrack.detach(this.videoElement.nativeElement);
      }
      await this.livekitService.enableCamera(false);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : this.t.instant('configuration.failedToStopCamera');
      this.toasterService.show(
        'error',
        this.t.instant('configuration.cameraError'),
        message
      );
    }
    this.cameraStatus.set('idle');
  }

  getMicrophoneStatusText(): string {
    switch (this.microphoneStatus()) {
      case 'idle':
        return this.t.instant('configuration.statusNotTested');
      case 'testing':
        return this.t.instant('configuration.statusTesting');
      case 'working':
        return this.t.instant('configuration.statusWorking');
      case 'error':
        return this.t.instant('configuration.statusError');
      default:
        return '';
    }
  }

  async testMicrophone(): Promise<void> {
    this.microphoneStatus.set('testing');

    try {
      const connected = await this.ensureConnected();
      if (!connected) {
        this.microphoneStatus.set('error');
        return;
      }

      await this.livekitService.enableMicrophone(true);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : this.t.instant('configuration.microphoneTestFailed');
      this.toasterService.show(
        'error',
        this.t.instant('configuration.microphoneError'),
        message
      );
      this.microphoneStatus.set('error');
    }
  }

  async stopMicrophone(): Promise<void> {
    this.stopAudioVisualization();
    try {
      await this.livekitService.enableMicrophone(false);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : this.t.instant('configuration.failedToStopMicrophone');
      this.toasterService.show(
        'error',
        this.t.instant('configuration.microphoneError'),
        message
      );
    }
    this.microphoneStatus.set('idle');
  }

  private setupAudioVisualization(track: LocalAudioTrack): void {
    this.stopAudioVisualization();
    try {
      const mediaStream = new MediaStream([track.mediaStreamTrack]);
      this.audioContext = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext)();
      const source = this.audioContext.createMediaStreamSource(mediaStream);
      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = 64;
      source.connect(this.analyserNode);

      this.visualizeAudio();
    } catch (error) {
      this.toasterService.show(
        'error',
        this.t.instant('configuration.audioError'),
        this.t.instant('configuration.audioVisualizationFailed')
      );
    }
  }

  private visualizeAudio(): void {
    if (!this.analyserNode) return;

    const bufferLength = this.analyserNode.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const analyze = () => {
      if (!this.analyserNode || this.microphoneStatus() !== 'working') return;

      this.analyserNode.getByteFrequencyData(dataArray);

      const bars = Array.from({ length: 20 }, (_, i) => {
        const dataIndex = Math.floor((i * bufferLength) / 20);
        return (dataArray[dataIndex] / 255) * 100;
      });

      this.volumeBars.set(bars);
      this.animationFrame = requestAnimationFrame(analyze);
    };

    analyze();
  }

  private stopAudioVisualization(): void {
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
      this.analyserNode = null;
    }

    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }

    this.volumeBars.set(Array(20).fill(0));
  }

  getSpeakerStatusText(): string {
    switch (this.speakerStatus()) {
      case 'idle':
        return this.t.instant('configuration.statusNotTested');
      case 'playing':
        return this.t.instant('configuration.statusPlaying');
      case 'working':
        return this.t.instant('configuration.statusWorking');
      case 'error':
        return this.t.instant('configuration.statusError');
      default:
        return '';
    }
  }

  testSpeakers(): void {
    this.speakerStatus.set('playing');

    try {
      this.testAudio = new Audio();
      this.testAudio.src = this.generateTestTone();
      this.testAudio
        .play()
        .then(() => {
          setTimeout(() => {
            if (this.speakerStatus() === 'playing') {
              this.speakerStatus.set('idle');
            }
          }, 3000);
        })
        .catch(() => {
          this.toasterService.show(
            'error',
            this.t.instant('configuration.speakerError'),
            this.t.instant('configuration.speakerTestFailed')
          );
          this.speakerStatus.set('error');
        });
    } catch (error) {
      this.toasterService.show(
        'error',
        this.t.instant('configuration.speakerError'),
        this.t.instant('configuration.speakerSetupFailed')
      );
      this.speakerStatus.set('error');
    }
  }

  confirmSpeakers(): void {
    if (this.testAudio) {
      this.testAudio.pause();
      this.testAudio = null;
    }

    this.speakerStatus.set('working');
  }

  private generateTestTone(): string {
    const sampleRate = 44100;
    const duration = 2;
    const frequency = 440;
    const samples = duration * sampleRate;
    const buffer = new ArrayBuffer(44 + samples * 2);
    const view = new DataView(buffer);

    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + samples * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, samples * 2, true);

    let offset = 44;
    for (let i = 0; i < samples; i++) {
      const sample = Math.sin((2 * Math.PI * frequency * i) / sampleRate) * 0.3;
      view.setInt16(offset, sample * 0x7fff, true);
      offset += 2;
    }

    const blob = new Blob([buffer], { type: 'audio/wav' });
    return URL.createObjectURL(blob);
  }

  allTestsCompleted(): boolean {
    return (
      this.cameraStatus() === 'working' &&
      this.microphoneStatus() === 'working' &&
      this.speakerStatus() === 'working'
    );
  }

  async testAllSystems(): Promise<void> {
    const connected = await this.ensureConnected();
    if (!connected) {
      return;
    }

    if (this.cameraStatus() === 'idle') {
      await this.testCamera();
    }

    if (this.microphoneStatus() === 'idle') {
      await this.testMicrophone();
    }

    if (this.speakerStatus() === 'idle') {
      this.testSpeakers();
    }
  }

  private cleanup(): void {
    if (this.localVideoTrack && this.videoElement?.nativeElement) {
      this.localVideoTrack.detach(this.videoElement.nativeElement);
    }

    this.stopAudioVisualization();

    if (this.testAudio) {
      this.testAudio.pause();
      this.testAudio = null;
    }

    this.livekitService.disconnect();
  }
}
