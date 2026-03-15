import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Only send errors in production
  enabled: process.env.NODE_ENV === 'production',

  // Sample 100% of errors, 10% of transactions (adjust as traffic grows)
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,

  integrations: [
    Sentry.replayIntegration(),
  ],

  // Filter out noisy browser extension errors
  ignoreErrors: [
    'ResizeObserver loop',
    'Non-Error promise rejection',
    /^Extensions/,
    /^chrome-extension/,
  ],
});
