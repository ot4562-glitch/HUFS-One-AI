import type {PageRenderer} from '../App.js';
import {noticeDetailPage, noticesPage, opportunitiesPage, opportunityDetailPage, todayPage} from './feedPages.js';
import {reviewerInvitePage} from './reviewerPages.js';
import {graduationPage} from './graduationPage.js';

/** Feature pages, checked in order before the shell's placeholders. */
export const appPages: readonly PageRenderer[] = [
  todayPage, opportunitiesPage, opportunityDetailPage, noticesPage, noticeDetailPage, reviewerInvitePage, graduationPage,
];
