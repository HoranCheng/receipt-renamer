import ScanView from '../features/scan/ScanView';
import ReviewView from '../features/review/ReviewView';
import InboxView from '../features/inbox/InboxView';
import LogView from '../features/log/LogView';
import DetailView from '../features/log/DetailView';
import ConfigView from '../features/config/ConfigView';
import SetupView from '../features/config/SetupView';
import DashView from '../features/dashboard/DashView';

/**
 * TABS — navigation tab definitions.
 * Each tab has an id matching the view state value.
 * Views that require authentication are marked with requiresAuth.
 */
export const TABS = [
  { id: 'scan',   label: '扫描',  requiresAuth: true },
  { id: 'review', label: '待审',  requiresAuth: true },
  { id: 'log',    label: '记录',  requiresAuth: false },
  { id: 'cfg',    label: '设置',  requiresAuth: false },
];

/**
 * VIEW_MAP — maps view id to component.
 */
export const VIEW_MAP = {
  scan: ScanView,
  review: ReviewView,
  inbox: InboxView,
  log: LogView,
  logDetail: DetailView,
  cfg: ConfigView,
  setup: SetupView,
  dash: DashView,
};

/**
 * Views that require Google auth before navigating.
 */
export const AUTH_REQUIRED_VIEWS = ['review', 'inbox', 'scan'];
