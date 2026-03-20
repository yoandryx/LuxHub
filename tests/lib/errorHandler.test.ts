// Test stubs for SEC-05: Sentry error monitoring integration
// Wave 1+ executors will implement these tests with real assertions

jest.mock('@sentry/nextjs', () => ({
  captureException: jest.fn(),
  captureMessage: jest.fn(),
}));

describe('ErrorMonitor', () => {
  test.todo('calls Sentry.captureException in production');
  test.todo('does not call Sentry in non-production');
  test.todo('withErrorMonitoring wrapper catches thrown errors');
});
