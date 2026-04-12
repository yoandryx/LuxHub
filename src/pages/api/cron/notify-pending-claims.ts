// src/pages/api/cron/notify-pending-claims.ts
// Vercel Cron: daily notification emails for holders with unclaimed pool distributions.
// Sends reminder emails at 60, 30, 7, and 1 day(s) before claim deadline expiry.
// Each notification window is +/- 12 hours to ensure the once-daily cron catches every holder.

import type { NextApiRequest, NextApiResponse } from 'next';
import { withErrorMonitoring } from '../../../lib/monitoring/errorHandler';
import dbConnect from '../../../lib/database/mongodb';
import { PoolDistribution } from '../../../lib/models/PoolDistribution';
import { User } from '../../../lib/models/User';

const NOTIFICATION_WINDOWS = [
  { days: 60, field: 'notifiedAt60days' },
  { days: 30, field: 'notifiedAt30days' },
  { days: 7, field: 'notifiedAt7days' },
  { days: 1, field: 'notifiedAt1day' },
] as const;

interface NotifyResult {
  distributionId: string;
  wallet: string;
  daysRemaining: number;
}

/**
 * Send a claim expiry reminder email via Resend.
 * Uses raw Resend API (same pattern as notificationService.ts).
 * Email content uses wallet-truncated identifiers -- no PII leakage.
 */
async function sendClaimExpiryEmail(params: {
  to: string;
  daysRemaining: number;
  payoutUsd: number;
  poolId: string;
  claimDeadline: Date;
}): Promise<{ success: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[notify-pending-claims] RESEND_API_KEY not configured, skipping email');
    return { success: false, error: 'API key not configured' };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://luxhub.gold';
  const deadlineStr = params.claimDeadline.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const amountStr = `$${params.payoutUsd.toFixed(2)}`;
  const urgencyLabel =
    params.daysRemaining <= 1
      ? 'FINAL NOTICE'
      : params.daysRemaining <= 7
        ? 'EXPIRING SOON'
        : 'REMINDER';
  const urgencyColor =
    params.daysRemaining <= 1
      ? '#ef4444'
      : params.daysRemaining <= 7
        ? '#f59e0b'
        : '#c8a1ff';

  const subject = `${urgencyLabel}: ${amountStr} LuxHub distribution waiting - claim by ${deadlineStr}`;
  const claimUrl = `${appUrl}/pools/${params.poolId}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta name="color-scheme" content="dark"></head>
<body style="margin:0;padding:0;background-color:#050507;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#050507;">
<tr><td align="center" style="padding:48px 16px 40px;">
<table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;width:100%;">
<tr><td align="center" style="padding-bottom:44px;"><img src="${appUrl}/images/purpleLGG.png" alt="LuxHub" width="44" height="44" style="display:block;border:0;" /></td></tr>
<tr><td style="background-color:#0a0a0c;border:1px solid #1a1a1f;border-radius:16px;overflow:hidden;box-shadow:0 12px 48px rgba(0,0,0,0.5);">
<div style="height:2px;background:linear-gradient(90deg,transparent 5%,${urgencyColor} 30%,${urgencyColor}90 50%,${urgencyColor} 70%,transparent 95%);"></div>
<div style="padding:44px 40px 36px;">
<div style="display:inline-block;background:${urgencyColor}18;color:${urgencyColor};padding:6px 16px;border-radius:20px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:20px;border:1px solid ${urgencyColor}25;">${urgencyLabel}</div>
<p style="font-size:20px;font-weight:600;margin:0 0 16px;color:#ffffff;line-height:1.3;">You have an unclaimed distribution</p>
<div style="margin:0 0 24px;padding:24px 28px;background:linear-gradient(135deg,rgba(200,161,255,0.06) 0%,rgba(168,85,247,0.03) 100%);border:1px solid rgba(200,161,255,0.12);border-radius:14px;text-align:center;">
<div style="font-size:11px;color:#a1a1a1;text-transform:uppercase;letter-spacing:1.2px;font-weight:600;margin-bottom:8px;">Unclaimed Amount</div>
<div style="font-size:36px;font-weight:700;color:#c8a1ff;letter-spacing:-0.5px;line-height:1.1;">${amountStr}</div>
<div style="font-size:13px;color:#777;margin-top:4px;">USD</div>
</div>
<p style="font-size:14px;line-height:1.75;color:#c0c0c0;margin:0 0 8px;">Your pool distribution of <strong style="color:#fff;">${amountStr}</strong> is waiting to be claimed.</p>
<p style="font-size:14px;line-height:1.75;color:#c0c0c0;margin:0 0 24px;">Claim deadline: <strong style="color:${urgencyColor};">${deadlineStr}</strong> (${params.daysRemaining} day${params.daysRemaining === 1 ? '' : 's'} remaining). After this date, unclaimed funds will be swept to the LuxHub treasury.</p>
<div style="text-align:center;margin:0 0 8px;"><a href="${claimUrl}" style="display:inline-block;min-width:220px;padding:16px 48px;background:linear-gradient(135deg,${urgencyColor}18,${urgencyColor}0c);border:1px solid ${urgencyColor}40;color:${urgencyColor};border-radius:12px;text-decoration:none;font-weight:600;font-size:14px;letter-spacing:0.8px;text-transform:uppercase;">Claim Now</a></div>
</div></td></tr>
<tr><td style="padding:36px 16px 0;text-align:center;"><p style="margin:0;font-size:11px;color:#555555;"><a href="https://luxhub.gold" style="color:#777;text-decoration:none;">luxhub.gold</a></p></td></tr>
</table></td></tr></table></body></html>`;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || 'LuxHub <notifications@luxhub.gold>',
        to: [params.to],
        subject,
        html,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[notify-pending-claims] Resend error:', error);
      return { success: false, error };
    }
    return { success: true };
  } catch (error: any) {
    console.error('[notify-pending-claims] Email send failed:', error);
    return { success: false, error: error?.message || 'Unknown error' };
  }
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers['authorization'];
  const isValidCron =
    typeof authHeader === 'string' &&
    authHeader === `Bearer ${process.env.CRON_SECRET}`;

  if (!isValidCron && process.env.NODE_ENV === 'production') {
    return res.status(401).json({ error: 'unauthorized' });
  }

  await dbConnect();
  const now = new Date();
  const results: NotifyResult[] = [];

  for (const window of NOTIFICATION_WINDOWS) {
    const targetDate = new Date(now.getTime() + window.days * 24 * 60 * 60 * 1000);
    const windowStart = new Date(targetDate.getTime() - 12 * 60 * 60 * 1000);
    const windowEnd = new Date(targetDate.getTime() + 12 * 60 * 60 * 1000);

    const dists = await PoolDistribution.find({
      status: { $in: ['pending', 'distributed'] },
      claimDeadlineAt: { $gte: windowStart, $lte: windowEnd },
    });

    for (const dist of dists) {
      for (const entry of dist.distributions || []) {
        if (entry.claimedAt) continue;
        if ((entry as any)[window.field]) continue; // already notified for this window

        // Look up the user's email via wallet address
        const wallet = entry.payoutWallet || entry.wallet;
        if (!wallet) continue;

        const user = await User.findOne({
          $or: [{ wallet }, { 'linkedWallets.address': wallet }],
        });
        if (!user?.email) continue;

        await sendClaimExpiryEmail({
          to: user.email,
          daysRemaining: window.days,
          payoutUsd: entry.payoutUSD || 0,
          poolId: dist.pool?.toString() || '',
          claimDeadline: dist.claimDeadlineAt,
        });

        // Mark as notified for this window
        await PoolDistribution.updateOne(
          { _id: dist._id, 'distributions.payoutWallet': wallet },
          { $set: { [`distributions.$.${window.field}`]: new Date() } }
        );

        results.push({
          distributionId: dist._id.toString(),
          wallet: `${wallet.slice(0, 6)}...${wallet.slice(-4)}`,
          daysRemaining: window.days,
        });
      }
    }
  }

  return res.status(200).json({
    success: true,
    notified: results.length,
    details: results,
  });
}

// Export for testing
export { sendClaimExpiryEmail, NOTIFICATION_WINDOWS };

export default withErrorMonitoring(handler);
