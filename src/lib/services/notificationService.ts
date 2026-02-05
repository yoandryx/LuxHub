// src/lib/services/notificationService.ts
// Centralized notification service for in-app + email notifications
import { Notification } from '../models/Notification';
import { User } from '../models/User';

// ========== TYPES ==========
export type NotificationType =
  | 'order_funded'
  | 'order_shipped'
  | 'order_delivered'
  | 'payment_released'
  | 'shipment_submitted'
  | 'shipment_verified'
  | 'shipment_rejected'
  | 'offer_received'
  | 'offer_accepted'
  | 'offer_rejected'
  | 'offer_countered'
  | 'vendor_approved'
  | 'vendor_rejected'
  | 'sale_request_approved'
  | 'sale_request_rejected'
  | 'pool_investment'
  | 'pool_distribution';

export interface NotificationMetadata {
  escrowId?: string;
  escrowPda?: string;
  offerId?: string;
  assetId?: string;
  vendorId?: string;
  poolId?: string;
  txSignature?: string;
  trackingNumber?: string;
  trackingCarrier?: string;
  actionUrl?: string;
  amount?: number;
  amountUSD?: number;
}

export interface CreateNotificationParams {
  userWallet: string;
  type: NotificationType;
  title: string;
  message: string;
  metadata?: NotificationMetadata;
  sendEmail?: boolean;
}

// ========== EMAIL TEMPLATES ==========
const emailTemplates: Record<
  NotificationType,
  { subject: (title: string) => string; getHtml: (params: EmailTemplateParams) => string }
> = {
  order_funded: {
    subject: () => 'New Order Received!',
    getHtml: (p) => baseEmailTemplate(p, '#22c55e'),
  },
  order_shipped: {
    subject: () => 'Your Order Has Shipped',
    getHtml: (p) => baseEmailTemplate(p, '#3b82f6'),
  },
  order_delivered: {
    subject: () => 'Delivery Confirmed',
    getHtml: (p) => baseEmailTemplate(p, '#22c55e'),
  },
  payment_released: {
    subject: () => 'Payment Released',
    getHtml: (p) => baseEmailTemplate(p, '#22c55e'),
  },
  shipment_submitted: {
    subject: () => 'Shipment Proof Submitted',
    getHtml: (p) => baseEmailTemplate(p, '#f59e0b'),
  },
  shipment_verified: {
    subject: () => 'Shipment Verified',
    getHtml: (p) => baseEmailTemplate(p, '#22c55e'),
  },
  shipment_rejected: {
    subject: () => 'Shipment Rejected - Action Required',
    getHtml: (p) => baseEmailTemplate(p, '#ef4444'),
  },
  offer_received: {
    subject: () => 'New Offer on Your Listing',
    getHtml: (p) => baseEmailTemplate(p, '#c8a1ff'),
  },
  offer_accepted: {
    subject: () => 'Your Offer Was Accepted!',
    getHtml: (p) => baseEmailTemplate(p, '#22c55e'),
  },
  offer_rejected: {
    subject: () => 'Offer Update',
    getHtml: (p) => baseEmailTemplate(p, '#ef4444'),
  },
  offer_countered: {
    subject: () => 'Counter Offer Received',
    getHtml: (p) => baseEmailTemplate(p, '#f59e0b'),
  },
  vendor_approved: {
    subject: () => 'Vendor Application Approved!',
    getHtml: (p) => baseEmailTemplate(p, '#22c55e'),
  },
  vendor_rejected: {
    subject: () => 'Vendor Application Update',
    getHtml: (p) => baseEmailTemplate(p, '#ef4444'),
  },
  sale_request_approved: {
    subject: () => 'Sale Request Approved',
    getHtml: (p) => baseEmailTemplate(p, '#22c55e'),
  },
  sale_request_rejected: {
    subject: () => 'Sale Request Update',
    getHtml: (p) => baseEmailTemplate(p, '#ef4444'),
  },
  pool_investment: {
    subject: () => 'Investment Confirmed',
    getHtml: (p) => baseEmailTemplate(p, '#c8a1ff'),
  },
  pool_distribution: {
    subject: () => 'Pool Distribution Received',
    getHtml: (p) => baseEmailTemplate(p, '#22c55e'),
  },
};

interface EmailTemplateParams {
  title: string;
  message: string;
  actionUrl?: string;
  type: NotificationType;
}

function baseEmailTemplate(params: EmailTemplateParams, accentColor: string): string {
  const { title, message, actionUrl, type } = params;
  const typeBadge = type.replace(/_/g, ' ').toUpperCase();

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background-color: #0d0d0d;
      color: #ffffff;
      margin: 0;
      padding: 0;
    }
    .container {
      max-width: 600px;
      margin: 40px auto;
      background: linear-gradient(135deg, rgba(17, 17, 17, 0.95), rgba(13, 13, 13, 0.9));
      border: 1px solid #222222;
      border-radius: 12px;
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #c8a1ff 0%, #8b5cf6 100%);
      padding: 30px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      color: #ffffff;
      font-size: 24px;
      font-weight: 600;
      letter-spacing: 2px;
    }
    .content {
      padding: 40px 30px;
    }
    .type-badge {
      display: inline-block;
      background: ${accentColor}20;
      color: ${accentColor};
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 20px;
    }
    .title {
      font-size: 22px;
      font-weight: 600;
      margin-bottom: 16px;
      color: #ffffff;
    }
    .message {
      font-size: 16px;
      line-height: 1.7;
      color: #a1a1a1;
      margin-bottom: 30px;
    }
    .button {
      display: inline-block;
      background: linear-gradient(135deg, #c8a1ff 0%, #8b5cf6 100%);
      color: #ffffff !important;
      text-decoration: none;
      padding: 14px 32px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 16px;
    }
    .footer {
      padding: 30px;
      text-align: center;
      font-size: 14px;
      color: #666666;
      border-top: 1px solid #222222;
    }
    .footer a {
      color: #c8a1ff;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>LUXHUB</h1>
    </div>
    <div class="content">
      <div class="type-badge">${typeBadge}</div>
      <div class="title">${title}</div>
      <div class="message">${message}</div>
      ${actionUrl ? `<a href="${actionUrl}" class="button">View Details</a>` : ''}
    </div>
    <div class="footer">
      <p>Decentralized Luxury Marketplace on Solana</p>
      <p style="font-size: 12px; margin-top: 10px;">
        You received this email because you have notifications enabled on your LuxHub account.
      </p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

// ========== RESEND EMAIL SENDER ==========
async function sendEmail(
  to: string,
  type: NotificationType,
  params: EmailTemplateParams
): Promise<{ success: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.warn('[NotificationService] RESEND_API_KEY not configured, skipping email');
    return { success: false, error: 'API key not configured' };
  }

  try {
    const template = emailTemplates[type];
    const subject = `LuxHub: ${template.subject(params.title)}`;
    const html = template.getHtml(params);

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || 'LuxHub <notifications@luxhub.io>',
        to: [to],
        subject,
        html,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[NotificationService] Resend error:', error);
      return { success: false, error };
    }

    return { success: true };
  } catch (error: any) {
    console.error('[NotificationService] Email send failed:', error);
    return { success: false, error: error?.message || 'Unknown error' };
  }
}

// ========== MAIN SERVICE FUNCTIONS ==========

/**
 * Create an in-app notification and optionally send email
 */
export async function notifyUser(params: CreateNotificationParams): Promise<{
  notification: any;
  emailSent: boolean;
  emailError?: string;
}> {
  const {
    userWallet,
    type,
    title,
    message,
    metadata = {},
    sendEmail: shouldSendEmail = true,
  } = params;

  try {
    // Find user to get ObjectId and email
    const user = await User.findOne({
      $or: [{ wallet: userWallet }, { 'linkedWallets.address': userWallet }],
    });

    if (!user) {
      console.warn(`[NotificationService] User not found for wallet: ${userWallet}`);
      // Still create notification with just wallet address
    }

    // Create in-app notification
    const notification = await Notification.create({
      user: user?._id,
      userWallet,
      type,
      title,
      message,
      metadata,
    });

    // Send email if user has email and sendEmail is true
    let emailSent = false;
    let emailError: string | undefined;

    if (shouldSendEmail && user?.email) {
      const result = await sendEmail(user.email, type, {
        title,
        message,
        actionUrl: metadata.actionUrl,
        type,
      });

      emailSent = result.success;
      emailError = result.error;

      // Update notification with email status
      notification.emailSent = emailSent;
      notification.emailSentAt = emailSent ? new Date() : undefined;
      notification.emailError = emailError;
      await notification.save();
    }

    return { notification, emailSent, emailError };
  } catch (error: any) {
    console.error('[NotificationService] Error creating notification:', error);
    throw error;
  }
}

// ========== CONVENIENCE FUNCTIONS ==========

/**
 * Notify vendor when they receive a new order
 */
export async function notifyNewOrder(params: {
  vendorWallet: string;
  buyerWallet: string;
  escrowId: string;
  escrowPda: string;
  assetTitle: string;
  amountUSD: number;
}) {
  const { vendorWallet, escrowId, escrowPda, assetTitle, amountUSD } = params;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://luxhub.io';

  return notifyUser({
    userWallet: vendorWallet,
    type: 'order_funded',
    title: 'New Order Received!',
    message: `You have a new order for "${assetTitle}" ($${amountUSD.toFixed(2)} USD). Please ship the item and submit tracking information.`,
    metadata: {
      escrowId,
      escrowPda,
      amountUSD,
      actionUrl: `${appUrl}/vendor/orders`,
    },
  });
}

/**
 * Notify buyer when their order ships
 */
export async function notifyOrderShipped(params: {
  buyerWallet: string;
  escrowId: string;
  escrowPda: string;
  assetTitle: string;
  trackingNumber: string;
  trackingCarrier: string;
  trackingUrl?: string;
}) {
  const {
    buyerWallet,
    escrowId,
    escrowPda,
    assetTitle,
    trackingNumber,
    trackingCarrier,
    trackingUrl,
  } = params;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://luxhub.io';

  return notifyUser({
    userWallet: buyerWallet,
    type: 'order_shipped',
    title: 'Your Order Has Shipped!',
    message: `"${assetTitle}" is on its way! Tracking: ${trackingCarrier} - ${trackingNumber}`,
    metadata: {
      escrowId,
      escrowPda,
      trackingNumber,
      trackingCarrier,
      actionUrl: trackingUrl || `${appUrl}/orders`,
    },
  });
}

/**
 * Notify admin when shipment proof is submitted
 */
export async function notifyShipmentProofSubmitted(params: {
  adminWallets: string[];
  vendorWallet: string;
  escrowId: string;
  escrowPda: string;
  assetTitle: string;
}) {
  const { adminWallets, escrowId, escrowPda, assetTitle } = params;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://luxhub.io';

  const results = await Promise.all(
    adminWallets.map((adminWallet) =>
      notifyUser({
        userWallet: adminWallet,
        type: 'shipment_submitted',
        title: 'Shipment Proof Pending Verification',
        message: `Vendor submitted shipment proof for "${assetTitle}". Please verify the tracking and proof images.`,
        metadata: {
          escrowId,
          escrowPda,
          actionUrl: `${appUrl}/admin/shipments`,
        },
      })
    )
  );

  return results;
}

/**
 * Notify vendor when shipment is verified
 */
export async function notifyShipmentVerified(params: {
  vendorWallet: string;
  escrowId: string;
  escrowPda: string;
  assetTitle: string;
}) {
  const { vendorWallet, escrowId, escrowPda, assetTitle } = params;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://luxhub.io';

  return notifyUser({
    userWallet: vendorWallet,
    type: 'shipment_verified',
    title: 'Shipment Verified!',
    message: `Your shipment proof for "${assetTitle}" has been verified. Funds will be released once delivery is confirmed.`,
    metadata: {
      escrowId,
      escrowPda,
      actionUrl: `${appUrl}/vendor/orders`,
    },
  });
}

/**
 * Notify vendor when shipment is rejected
 */
export async function notifyShipmentRejected(params: {
  vendorWallet: string;
  escrowId: string;
  escrowPda: string;
  assetTitle: string;
  reason: string;
}) {
  const { vendorWallet, escrowId, escrowPda, assetTitle, reason } = params;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://luxhub.io';

  return notifyUser({
    userWallet: vendorWallet,
    type: 'shipment_rejected',
    title: 'Shipment Rejected - Action Required',
    message: `Your shipment proof for "${assetTitle}" was rejected. Reason: ${reason}. Please submit new tracking information.`,
    metadata: {
      escrowId,
      escrowPda,
      actionUrl: `${appUrl}/vendor/orders`,
    },
  });
}

/**
 * Notify buyer when delivery is confirmed
 */
export async function notifyDeliveryConfirmed(params: {
  buyerWallet: string;
  vendorWallet: string;
  escrowId: string;
  escrowPda: string;
  assetTitle: string;
}) {
  const { buyerWallet, vendorWallet, escrowId, escrowPda, assetTitle } = params;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://luxhub.io';

  // Notify buyer
  await notifyUser({
    userWallet: buyerWallet,
    type: 'order_delivered',
    title: 'Delivery Confirmed',
    message: `Your purchase of "${assetTitle}" has been confirmed as delivered. Thank you for shopping with LuxHub!`,
    metadata: {
      escrowId,
      escrowPda,
      actionUrl: `${appUrl}/orders`,
    },
  });

  // Notify vendor about fund release
  await notifyUser({
    userWallet: vendorWallet,
    type: 'payment_released',
    title: 'Payment Released!',
    message: `Payment for "${assetTitle}" has been released to your wallet. Thank you for selling with LuxHub!`,
    metadata: {
      escrowId,
      escrowPda,
      actionUrl: `${appUrl}/vendor/orders`,
    },
  });
}

/**
 * Notify vendor when they receive an offer
 */
export async function notifyOfferReceived(params: {
  vendorWallet: string;
  buyerWallet: string;
  offerId: string;
  escrowId: string;
  assetTitle: string;
  offerAmountUSD: number;
}) {
  const { vendorWallet, offerId, escrowId, assetTitle, offerAmountUSD } = params;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://luxhub.io';

  return notifyUser({
    userWallet: vendorWallet,
    type: 'offer_received',
    title: 'New Offer Received!',
    message: `You received an offer of $${offerAmountUSD.toFixed(2)} USD for "${assetTitle}".`,
    metadata: {
      offerId,
      escrowId,
      amountUSD: offerAmountUSD,
      actionUrl: `${appUrl}/vendor/offers`,
    },
  });
}

/**
 * Notify buyer when their offer is accepted
 */
export async function notifyOfferAccepted(params: {
  buyerWallet: string;
  offerId: string;
  escrowId: string;
  escrowPda: string;
  assetTitle: string;
  acceptedAmountUSD: number;
}) {
  const { buyerWallet, offerId, escrowId, escrowPda, assetTitle, acceptedAmountUSD } = params;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://luxhub.io';

  return notifyUser({
    userWallet: buyerWallet,
    type: 'offer_accepted',
    title: 'Your Offer Was Accepted!',
    message: `Congratulations! Your offer of $${acceptedAmountUSD.toFixed(2)} USD for "${assetTitle}" has been accepted. Complete your purchase now!`,
    metadata: {
      offerId,
      escrowId,
      escrowPda,
      amountUSD: acceptedAmountUSD,
      actionUrl: `${appUrl}/marketplace/${escrowPda}`,
    },
  });
}

/**
 * Notify buyer when their offer is rejected
 */
export async function notifyOfferRejected(params: {
  buyerWallet: string;
  offerId: string;
  escrowId: string;
  assetTitle: string;
  reason?: string;
}) {
  const { buyerWallet, offerId, escrowId, assetTitle, reason } = params;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://luxhub.io';

  return notifyUser({
    userWallet: buyerWallet,
    type: 'offer_rejected',
    title: 'Offer Not Accepted',
    message: reason
      ? `Your offer for "${assetTitle}" was not accepted. Reason: ${reason}`
      : `Your offer for "${assetTitle}" was not accepted by the vendor.`,
    metadata: {
      offerId,
      escrowId,
      actionUrl: `${appUrl}/marketplace`,
    },
  });
}

/**
 * Notify buyer when vendor makes a counter-offer
 */
export async function notifyOfferCountered(params: {
  buyerWallet: string;
  offerId: string;
  escrowId: string;
  escrowPda: string;
  assetTitle: string;
  counterAmountUSD: number;
}) {
  const { buyerWallet, offerId, escrowId, escrowPda, assetTitle, counterAmountUSD } = params;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://luxhub.io';

  return notifyUser({
    userWallet: buyerWallet,
    type: 'offer_countered',
    title: 'Counter Offer Received',
    message: `The vendor has countered with $${counterAmountUSD.toFixed(2)} USD for "${assetTitle}". Review and respond to the offer.`,
    metadata: {
      offerId,
      escrowId,
      escrowPda,
      amountUSD: counterAmountUSD,
      actionUrl: `${appUrl}/offers`,
    },
  });
}

/**
 * Notify vendor of application approval/rejection
 */
export async function notifyVendorApplicationResult(params: {
  vendorWallet: string;
  approved: boolean;
  vendorName?: string;
  reason?: string;
}) {
  const { vendorWallet, approved, vendorName, reason } = params;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://luxhub.io';

  return notifyUser({
    userWallet: vendorWallet,
    type: approved ? 'vendor_approved' : 'vendor_rejected',
    title: approved ? 'Vendor Application Approved!' : 'Vendor Application Update',
    message: approved
      ? `Congratulations${vendorName ? ` ${vendorName}` : ''}! Your vendor application has been approved. Start listing your luxury assets now!`
      : `Thank you for your interest in becoming a LuxHub vendor.${reason ? ` ${reason}` : ' Unfortunately, we cannot approve your application at this time.'}`,
    metadata: {
      actionUrl: approved ? `${appUrl}/vendor/dashboard` : `${appUrl}/apply`,
    },
  });
}

export default {
  notifyUser,
  notifyNewOrder,
  notifyOrderShipped,
  notifyShipmentProofSubmitted,
  notifyShipmentVerified,
  notifyShipmentRejected,
  notifyDeliveryConfirmed,
  notifyOfferReceived,
  notifyOfferAccepted,
  notifyOfferRejected,
  notifyOfferCountered,
  notifyVendorApplicationResult,
};
