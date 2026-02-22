import { Component, input, computed } from '@angular/core';
import { NgIconComponent } from '@ng-icons/core';
import { NgStyle } from '@angular/common';

const CUSTOM_SVG_FILES = ['logo', 'logo.svg', 'svg/logo.svg'];

const ICON_MAP: Record<string, string> = {
  calendar: 'heroCalendar',
  'calendar.svg': 'heroCalendar',
  'svg/calendar.svg': 'heroCalendar',
  user: 'heroUser',
  'user.svg': 'heroUser',
  'svg/user.svg': 'heroUser',
  users: 'heroUsers',
  'users.svg': 'heroUsers',
  'svg/users.svg': 'heroUsers',
  video: 'heroVideoCamera',
  'video.svg': 'heroVideoCamera',
  'svg/video.svg': 'heroVideoCamera',
  camera: 'heroCamera',
  'camera.svg': 'heroCamera',
  'svg/camera.svg': 'heroCamera',
  'camera-off': 'lucideCameraOff',
  'camera-off.svg': 'lucideCameraOff',
  'svg/camera-off.svg': 'lucideCameraOff',
  microphone: 'heroMicrophone',
  'microphone.svg': 'heroMicrophone',
  'svg/microphone.svg': 'heroMicrophone',
  'microphone-off': 'lucideMicOff',
  'microphone-off.svg': 'lucideMicOff',
  'svg/microphone-off.svg': 'lucideMicOff',
  phone: 'heroPhone',
  'phone.svg': 'heroPhone',
  'svg/phone.svg': 'heroPhone',
  'phone-off': 'lucidePhoneOff',
  'phone-off.svg': 'lucidePhoneOff',
  'svg/phone-off.svg': 'lucidePhoneOff',
  eye: 'heroEye',
  'eye.svg': 'heroEye',
  'svg/eye.svg': 'heroEye',
  'eye-crossed': 'heroEyeSlash',
  'eye-crossed.svg': 'heroEyeSlash',
  'svg/eye-crossed.svg': 'heroEyeSlash',
  check: 'heroCheck',
  'check.svg': 'heroCheck',
  'svg/check.svg': 'heroCheck',
  close: 'heroXMark',
  'close.svg': 'heroXMark',
  'svg/close.svg': 'heroXMark',
  plus: 'heroPlus',
  'plus.svg': 'heroPlus',
  'svg/plus.svg': 'heroPlus',
  search: 'heroMagnifyingGlass',
  'search.svg': 'heroMagnifyingGlass',
  'svg/search.svg': 'heroMagnifyingGlass',
  edit: 'heroPencil',
  'edit.svg': 'heroPencil',
  'svg/edit.svg': 'heroPencil',
  delete: 'heroTrash',
  'delete.svg': 'heroTrash',
  'svg/delete.svg': 'heroTrash',
  trash: 'heroTrash',
  'trash.svg': 'heroTrash',
  'svg/trash.svg': 'heroTrash',
  globe: 'heroGlobeAlt',
  'globe.svg': 'heroGlobeAlt',
  'svg/globe.svg': 'heroGlobeAlt',
  'chevron-down': 'heroChevronDown',
  'chevron-down.svg': 'heroChevronDown',
  'svg/chevron-down.svg': 'heroChevronDown',
  'chevron-left': 'heroChevronLeft',
  'chevron-left.svg': 'heroChevronLeft',
  'svg/chevron-left.svg': 'heroChevronLeft',
  'chevron-right': 'heroChevronRight',
  'chevron-right.svg': 'heroChevronRight',
  'svg/chevron-right.svg': 'heroChevronRight',
  'arrow-left': 'heroArrowLeft',
  'arrow-left.svg': 'heroArrowLeft',
  'svg/arrow-left.svg': 'heroArrowLeft',
  'arrow-right': 'heroArrowRight',
  'arrow-right.svg': 'heroArrowRight',
  'svg/arrow-right.svg': 'heroArrowRight',
  'arrow-down': 'heroArrowDown',
  'arrow-down.svg': 'heroArrowDown',
  'svg/arrow-down.svg': 'heroArrowDown',
  'arrow-up': 'heroArrowUp',
  'arrow-up.svg': 'heroArrowUp',
  'svg/arrow-up.svg': 'heroArrowUp',
  'log-out': 'heroArrowRightOnRectangle',
  'log-out.svg': 'heroArrowRightOnRectangle',
  'svg/log-out.svg': 'heroArrowRightOnRectangle',
  link: 'heroLink',
  'link.svg': 'heroLink',
  'svg/link.svg': 'heroLink',
  clipboard: 'heroClipboard',
  'clipboard.svg': 'heroClipboard',
  'svg/clipboard.svg': 'heroClipboard',
  copy: 'heroClipboard',
  'copy.svg': 'heroClipboard',
  'svg/copy.svg': 'heroClipboard',
  dashboard: 'lucideLayoutDashboard',
  'dashboard.svg': 'lucideLayoutDashboard',
  'svg/dashboard.svg': 'lucideLayoutDashboard',
  settings: 'lucideSettings',
  'settings.svg': 'lucideSettings',
  'svg/settings.svg': 'lucideSettings',
  report: 'heroDocumentText',
  'report.svg': 'heroDocumentText',
  'svg/report.svg': 'heroDocumentText',
  schedule: 'heroClock',
  'schedule.svg': 'heroClock',
  'svg/schedule.svg': 'heroClock',
  approve: 'heroCheckCircle',
  'approve.svg': 'heroCheckCircle',
  'svg/approve.svg': 'heroCheckCircle',
  reject: 'heroXCircle',
  'reject.svg': 'heroXCircle',
  'svg/reject.svg': 'heroXCircle',
  error: 'heroExclamationCircle',
  'error.svg': 'heroExclamationCircle',
  'svg/error.svg': 'heroExclamationCircle',
  email: 'heroEnvelope',
  'email.svg': 'heroEnvelope',
  'svg/email.svg': 'heroEnvelope',
  profile: 'heroUserCircle',
  'profile.svg': 'heroUserCircle',
  'svg/profile.svg': 'heroUserCircle',
  pause: 'heroPause',
  'pause.svg': 'heroPause',
  'svg/pause.svg': 'heroPause',
  speaker: 'heroSpeakerWave',
  'speaker.svg': 'heroSpeakerWave',
  'svg/speaker.svg': 'heroSpeakerWave',
  'speaker-off': 'heroSpeakerXMark',
  'speaker-off.svg': 'heroSpeakerXMark',
  'svg/speaker-off.svg': 'heroSpeakerXMark',
  'user-plus': 'heroUserPlus',
  'user-plus.svg': 'heroUserPlus',
  'svg/user-plus.svg': 'heroUserPlus',
  'user-check': 'heroCheckCircle',
  'user-check.svg': 'heroCheckCircle',
  'svg/user-check.svg': 'heroCheckCircle',
  'calendar-days': 'heroCalendarDays',
  'calendar-days.svg': 'heroCalendarDays',
  'svg/calendar-days.svg': 'heroCalendarDays',
  info: 'heroInformationCircle',
  'info.svg': 'heroInformationCircle',
  'svg/info.svg': 'heroInformationCircle',
  'alert-circle': 'heroExclamationCircle',
  'alert-circle.svg': 'heroExclamationCircle',
  'svg/alert-circle.svg': 'heroExclamationCircle',
  warning: 'heroExclamationTriangle',
  'warning.svg': 'heroExclamationTriangle',
  'svg/warning.svg': 'heroExclamationTriangle',
  menu: 'heroBars3',
  'menu.svg': 'heroBars3',
  'svg/menu.svg': 'heroBars3',
  clock: 'heroClock',
  'clock.svg': 'heroClock',
  'svg/clock.svg': 'heroClock',
  'activity-history': 'heroClock',
  'activity-history.svg': 'heroClock',
  'svg/activity-history.svg': 'heroClock',
  history: 'heroClock',
  'history.svg': 'heroClock',
  'svg/history.svg': 'heroClock',
  'select-arrow': 'heroChevronDown',
  'select-arrow.svg': 'heroChevronDown',
  'svg/select-arrow.svg': 'heroChevronDown',
  'video-off': 'lucideVideoOff',
  'video-off.svg': 'lucideVideoOff',
  'svg/video-off.svg': 'lucideVideoOff',
  send: 'heroPaperAirplane',
  'send.svg': 'heroPaperAirplane',
  'svg/send.svg': 'heroPaperAirplane',
  'logo-icon': 'heroHeart',
  'logo-icon.svg': 'heroHeart',
  'svg/logo-icon.svg': 'heroHeart',
  bell: 'heroBell',
  'bell.svg': 'heroBell',
  'svg/bell.svg': 'heroBell',
  notification: 'heroBell',
  'notification.svg': 'heroBell',
  'svg/notification.svg': 'heroBell',
  minus: 'heroMinus',
  'minus.svg': 'heroMinus',
  'svg/minus.svg': 'heroMinus',
  heart: 'heroHeart',
  'heart.svg': 'heroHeart',
  'svg/heart.svg': 'heroHeart',
  activity: 'heroChartBar',
  'activity.svg': 'heroChartBar',
  'svg/activity.svg': 'heroChartBar',
  thermometer: 'heroChartBar',
  'thermometer.svg': 'heroChartBar',
  'svg/thermometer.svg': 'heroChartBar',
  weight: 'heroScale',
  'weight.svg': 'heroScale',
  'svg/weight.svg': 'heroScale',
  paperclip: 'heroPaperClip',
  'paperclip.svg': 'heroPaperClip',
  'svg/paperclip.svg': 'heroPaperClip',
  x: 'heroXMark',
  'x.svg': 'heroXMark',
  'svg/x.svg': 'heroXMark',
  image: 'heroPhoto',
  'image.svg': 'heroPhoto',
  'svg/image.svg': 'heroPhoto',
  'file-text': 'heroDocumentText',
  'file-text.svg': 'heroDocumentText',
  'svg/file-text.svg': 'heroDocumentText',
  minimize: 'lucideMinimize2',
  'minimize.svg': 'lucideMinimize2',
  'svg/minimize.svg': 'lucideMinimize2',
  maximize: 'lucideMaximize2',
  'maximize.svg': 'lucideMaximize2',
  'svg/maximize.svg': 'lucideMaximize2',
  'screen-share': 'lucideScreenShare',
  'screen-share.svg': 'lucideScreenShare',
  'svg/screen-share.svg': 'lucideScreenShare',
  'screen-share-off': 'lucideScreenShareOff',
  'screen-share-off.svg': 'lucideScreenShareOff',
  'svg/screen-share-off.svg': 'lucideScreenShareOff',
  'message-square': 'lucideMessageSquare',
  'message-square.svg': 'lucideMessageSquare',
  'svg/message-square.svg': 'lucideMessageSquare',
  stethoscope: 'lucideStethoscope',
  'stethoscope.svg': 'lucideStethoscope',
  'svg/stethoscope.svg': 'lucideStethoscope',
  blur: 'lucideSparkles',
  'blur.svg': 'lucideSparkles',
  'svg/blur.svg': 'lucideSparkles',
  sparkles: 'lucideSparkles',
  'sparkles.svg': 'lucideSparkles',
  'svg/sparkles.svg': 'lucideSparkles',
  effects: 'lucideSparkles',
  'effects.svg': 'lucideSparkles',
  'svg/effects.svg': 'lucideSparkles',
  'shield-check': 'heroShieldCheck',
  'shield-check.svg': 'heroShieldCheck',
  'svg/shield-check.svg': 'heroShieldCheck',
  record: 'lucideCircleDot',
  'record.svg': 'lucideCircleDot',
  'svg/record.svg': 'lucideCircleDot',
  'record-stop': 'lucideSquare',
  'record-stop.svg': 'lucideSquare',
  'svg/record-stop.svg': 'lucideSquare',
};

@Component({
  selector: 'app-svg',
  imports: [NgIconComponent, NgStyle],
  templateUrl: './svg.html',
  styleUrl: './svg.scss',
})
export class Svg {
  src = input<string>();
  svgStyle = input<Record<string, string | number> | null | undefined>();

  isCustomSvg = computed(() => {
    const source = this.src();
    if (!source) return false;
    return (
      CUSTOM_SVG_FILES.includes(source) ||
      CUSTOM_SVG_FILES.includes(source.replace('svg/', ''))
    );
  });

  customSvgPath = computed(() => {
    const source = this.src();
    if (!source) return '';
    if (source.startsWith('svg/')) return source;
    return `svg/${source}.svg`;
  });

  iconName = computed(() => {
    const source = this.src();
    if (!source || this.isCustomSvg()) return '';
    return ICON_MAP[source] || ICON_MAP[source.replace('svg/', '')] || '';
  });

  iconStyle = computed(() => {
    const style = this.svgStyle();
    if (!style) return {};

    const result: Record<string, string> = {};

    if (style['width.px']) {
      result['font-size'] = `${style['width.px']}px`;
      result['width'] = `${style['width.px']}px`;
    } else if (style['height.px']) {
      result['font-size'] = `${style['height.px']}px`;
    }

    if (style['height.px']) {
      result['height'] = `${style['height.px']}px`;
    }

    if (style['color']) {
      result['color'] = String(style['color']);
    }

    if (style['opacity']) {
      result['opacity'] = String(style['opacity']);
    }

    return result;
  });
}
