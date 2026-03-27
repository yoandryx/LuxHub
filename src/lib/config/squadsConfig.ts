/**
 * Centralized Squads configuration.
 * SQUADS_AUTO_APPROVE must be exactly 'true' to enable.
 * Default: false (safe for mainnet).
 */
export function getSquadsAutoApprove(): boolean {
  return process.env.SQUADS_AUTO_APPROVE === 'true';
}
