// Tests for SEC-05: Sentry error monitoring integration

const mockCaptureException = jest.fn();
const mockCaptureMessage = jest.fn();

jest.mock('@sentry/nextjs', () => ({
  captureException: mockCaptureException,
  captureMessage: mockCaptureMessage,
}));

// The ErrorMonitor is a singleton that checks NODE_ENV in its constructor.
// We need to test production vs non-production behavior.

describe('ErrorMonitor', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    jest.clearAllMocks();
    process.env.NODE_ENV = originalNodeEnv;
  });

  test('calls Sentry.captureException in production', async () => {
    process.env.NODE_ENV = 'production';

    // Force fresh module load
    jest.resetModules();
    jest.mock('@sentry/nextjs', () => ({
      captureException: mockCaptureException,
      captureMessage: mockCaptureMessage,
    }));

    const { errorMonitor } = await import('@/lib/monitoring/errorHandler');
    const err = new Error('test production error');
    errorMonitor.captureException(err, { endpoint: '/api/test' });

    expect(mockCaptureException).toHaveBeenCalledWith(
      err,
      expect.objectContaining({
        extra: expect.objectContaining({ endpoint: '/api/test' }),
      })
    );
  });

  test('does not call Sentry in non-production', async () => {
    process.env.NODE_ENV = 'development';

    jest.resetModules();
    jest.mock('@sentry/nextjs', () => ({
      captureException: mockCaptureException,
      captureMessage: mockCaptureMessage,
    }));

    const { errorMonitor } = await import('@/lib/monitoring/errorHandler');
    const err = new Error('test dev error');
    errorMonitor.captureException(err, { endpoint: '/api/test' });

    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  test('withErrorMonitoring wrapper catches thrown errors', async () => {
    process.env.NODE_ENV = 'test';

    jest.resetModules();
    jest.mock('@sentry/nextjs', () => ({
      captureException: mockCaptureException,
      captureMessage: mockCaptureMessage,
    }));

    const { withErrorMonitoring } = await import('@/lib/monitoring/errorHandler');

    const throwingHandler = async () => {
      throw new Error('handler boom');
    };

    const wrapped = withErrorMonitoring(throwingHandler as any);

    const mockReq = { method: 'POST', url: '/api/test' } as any;
    const mockRes = {
      setHeader: jest.fn(),
      statusCode: 200,
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    } as any;

    await wrapped(mockReq, mockRes);

    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
  });
});
