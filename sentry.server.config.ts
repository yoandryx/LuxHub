import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NODE_ENV === 'production',
  tracesSampleRate: 0.1,
  integrations: [
    Sentry.captureConsoleIntegration({ levels: ['error'] }),
  ],
  beforeBreadcrumb(breadcrumb) {
    if (breadcrumb.category === 'console') {
      return breadcrumb;
    }
    return breadcrumb;
  },
});
