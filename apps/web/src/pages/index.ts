import type {PageRenderer} from '../App.js';
import {noticeDetailPage, noticesPage, opportunitiesPage, opportunityDetailPage, todayPage} from './feedPages.js';
import {reviewerInvitePage} from './reviewerPages.js';
import {graduationPage} from './graduationPage.js';
import {experiencePage, savedPage, settingsPage} from './sandboxPages.js';
import {applicationsPage} from './applicationsPage.js';
import {menuPage} from './menuPage.js';
import {clubDetailPage, clubsPage} from './clubPages.js';
import {ownerDemoProfilePage} from './ownerDemoProfilePage.js';
import {ownerAcademicsPage} from './ownerAcademicsPage.js';
import {ownerCatalogPage} from './ownerCatalogPage.js';

/** Feature pages, checked in order before the shell's placeholders. */
export const appPages: readonly PageRenderer[] = [
  todayPage, opportunitiesPage, opportunityDetailPage, noticesPage, noticeDetailPage, reviewerInvitePage, graduationPage,
  savedPage, experiencePage, settingsPage, applicationsPage, menuPage, clubsPage, clubDetailPage,
  ownerDemoProfilePage,ownerAcademicsPage,ownerCatalogPage,
];
