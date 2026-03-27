// tests/lib/squadsAutoApprove.test.ts
// Tests for centralized Squads auto-approve configuration toggle

describe('getSquadsAutoApprove', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  async function importConfig() {
    const mod = await import('@/lib/config/squadsConfig');
    return mod;
  }

  it('returns false when SQUADS_AUTO_APPROVE is undefined', async () => {
    delete process.env.SQUADS_AUTO_APPROVE;
    const { getSquadsAutoApprove } = await importConfig();
    expect(getSquadsAutoApprove()).toBe(false);
  });

  it('returns false when SQUADS_AUTO_APPROVE is "false"', async () => {
    process.env.SQUADS_AUTO_APPROVE = 'false';
    const { getSquadsAutoApprove } = await importConfig();
    expect(getSquadsAutoApprove()).toBe(false);
  });

  it('returns true when SQUADS_AUTO_APPROVE is "true"', async () => {
    process.env.SQUADS_AUTO_APPROVE = 'true';
    const { getSquadsAutoApprove } = await importConfig();
    expect(getSquadsAutoApprove()).toBe(true);
  });

  it('returns false for any other string value like "yes"', async () => {
    process.env.SQUADS_AUTO_APPROVE = 'yes';
    const { getSquadsAutoApprove } = await importConfig();
    expect(getSquadsAutoApprove()).toBe(false);
  });

  it('returns false for "1"', async () => {
    process.env.SQUADS_AUTO_APPROVE = '1';
    const { getSquadsAutoApprove } = await importConfig();
    expect(getSquadsAutoApprove()).toBe(false);
  });

  it('returns false for empty string', async () => {
    process.env.SQUADS_AUTO_APPROVE = '';
    const { getSquadsAutoApprove } = await importConfig();
    expect(getSquadsAutoApprove()).toBe(false);
  });
});
