// PinCraft no longer uses a push-notification service worker (previous ad
// provider removed 2026-11-25). Any previously installed worker updates to
// this file and unregisters itself, so old push subscriptions stop cleanly.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.registration.unregister());
