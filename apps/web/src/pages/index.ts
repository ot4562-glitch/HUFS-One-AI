import type {PageRenderer} from '../App.js';
import {noticeDetailPage, noticesPage, opportunitiesPage, opportunityDetailPage, todayPage} from './feedPages.js';
import {reviewerInvitePage} from './reviewerPages.js';
import {graduationPage} from './graduationPage.js';
import {whatIfPage} from './whatIfPage.js';
import {experiencePage, savedPage, settingsPage} from './sandboxPages.js';
import {applicationsPage} from './applicationsPage.js';
import {menuPage} from './menuPage.js';
import {clubDetailPage, clubsPage} from './clubPages.js';
import {ownerDemoProfilePage} from './ownerDemoProfilePage.js';
import {ownerAcademicsPage} from './ownerAcademicsPage.js';
import {ownerIntakePage} from './ownerIntakePage.js';
import {ownerProviderPage} from './ownerProviderPage.js';

/** Feature pages, checked in order before the shell's placeholders. */
export const appPages: readonly PageRenderer[] = [
  ownerIntakePage, todayPage, opportunitiesPage, opportunityDetailPage, noticesPage, noticeDetailPage, reviewerInvitePage, graduationPage, whatIfPage,
  savedPage, experiencePage, settingsPage, applicationsPage, menuPage, clubsPage, clubDetailPage,
  ownerDemoProfilePage,ownerAcademicsPage,ownerProviderPage,
];
