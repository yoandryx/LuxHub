// src/lib/services/notificationService.ts
// Centralized notification service for in-app + email notifications
import { Notification } from '../models/Notification';
import { User } from '../models/User';
import VendorProfileModel from '../models/VendorProfile';
import InviteCodeModel from '../models/InviteCode';

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
  | 'pool_distribution'
  | 'order_refunded'
  | 'escrow_cancelled_external_sale'
  | 'delist_request_approved'
  | 'delist_request_rejected'
  | 'pool_wind_down_announced'
  | 'pool_snapshot_taken'
  | 'pool_distribution_complete'
  | 'offer_auto_rejected'
  | 'vendor_application_received'
  | 'vendor_application_submitted'
  | 'vendor_invite_sent'
  | 'dispute_created'
  | 'delist_request_submitted'
  | 'mint_request_submitted'
  | 'mint_request_approved'
  | 'mint_request_rejected'
  | 'mint_request_minted';

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
  // Offer-specific rich email fields
  imageUrl?: string;
  amountLabel?: string;
  counterpartyWallet?: string;
  counterpartyLabel?: string;
  ctaText?: string;
  eventBadge?: string;
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
    getHtml: (p) => offerEmailTemplate(p, '#c8a1ff'),
  },
  offer_accepted: {
    subject: () => 'Your Offer Was Accepted!',
    getHtml: (p) => offerEmailTemplate(p, '#22c55e'),
  },
  offer_rejected: {
    subject: () => 'Offer Update',
    getHtml: (p) => offerEmailTemplate(p, '#ef4444'),
  },
  offer_countered: {
    subject: () => 'Counter Offer Received',
    getHtml: (p) => offerEmailTemplate(p, '#f59e0b'),
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
  order_refunded: {
    subject: () => 'Refund Processed',
    getHtml: (p) => baseEmailTemplate(p, '#f59e0b'),
  },
  escrow_cancelled_external_sale: {
    subject: () => 'Order Cancelled - Item Sold Externally',
    getHtml: (p) => baseEmailTemplate(p, '#ef4444'),
  },
  delist_request_approved: {
    subject: () => 'Delist Request Approved',
    getHtml: (p) => baseEmailTemplate(p, '#22c55e'),
  },
  delist_request_rejected: {
    subject: () => 'Delist Request Update',
    getHtml: (p) => baseEmailTemplate(p, '#ef4444'),
  },
  pool_wind_down_announced: {
    subject: () => 'Pool Wind-Down Announced',
    getHtml: (p) => baseEmailTemplate(p, '#f59e0b'),
  },
  pool_snapshot_taken: {
    subject: () => 'Pool Snapshot Taken - Choose Your Option',
    getHtml: (p) => baseEmailTemplate(p, '#c8a1ff'),
  },
  pool_distribution_complete: {
    subject: () => 'Pool Distribution Complete',
    getHtml: (p) => baseEmailTemplate(p, '#22c55e'),
  },
  offer_auto_rejected: {
    subject: () => 'Offer Automatically Closed',
    getHtml: (p) => baseEmailTemplate(p, '#ef4444'),
  },
  vendor_application_received: {
    subject: () => 'New Vendor Application — Action Required',
    getHtml: (p) => baseEmailTemplate(p, '#c8a1ff'),
  },
  dispute_created: {
    subject: () => 'Dispute Opened - Action Required',
    getHtml: (p) => baseEmailTemplate(p, '#ef4444'),
  },
  delist_request_submitted: {
    subject: () => 'New Delist Request - Action Required',
    getHtml: (p) => baseEmailTemplate(p, '#f59e0b'),
  },
  vendor_application_submitted: {
    subject: () => 'Application Received - LuxHub',
    getHtml: (p) => baseEmailTemplate(p, '#c8a1ff'),
  },
  vendor_invite_sent: {
    subject: () => "You're Invited to Sell on LuxHub",
    getHtml: (p) => baseEmailTemplate(p, '#c8a1ff'),
  },
  mint_request_submitted: {
    subject: () => 'New Mint Request Submitted',
    getHtml: (p) => baseEmailTemplate(p, '#c8a1ff'),
  },
  mint_request_approved: {
    subject: () => 'Mint Request Approved',
    getHtml: (p) => baseEmailTemplate(p, '#22c55e'),
  },
  mint_request_rejected: {
    subject: () => 'Mint Request Not Approved',
    getHtml: (p) => baseEmailTemplate(p, '#ef4444'),
  },
  mint_request_minted: {
    subject: () => 'NFT Minted & Listed on Marketplace',
    getHtml: (p) => baseEmailTemplate(p, '#c8a1ff'),
  },
};

interface EmailTemplateParams {
  title: string;
  message: string;
  actionUrl?: string;
  type: NotificationType;
  // Offer-specific rich email fields
  imageUrl?: string;
  amountUSD?: number;
  amountLabel?: string;
  counterpartyWallet?: string;
  counterpartyLabel?: string;
  ctaText?: string;
  eventBadge?: string;
}

function baseEmailTemplate(params: EmailTemplateParams, accentColor: string): string {
  const { title, message, actionUrl, type } = params;
  const typeBadge = params.eventBadge || type.replace(/_/g, ' ').toUpperCase();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://luxhub.gold';

  return `<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark">
<style>:root{color-scheme:dark only;}body,html{background-color:#050507!important;}u+.body{background-color:#050507!important;}[data-ogsc] body{background-color:#050507!important;}@media(prefers-color-scheme:light){body,html,.cbg{background-color:#050507!important;}.t1{color:#ffffff!important;}.t2{color:#e0e0e0!important;}.t3{color:#999999!important;}}@media(prefers-color-scheme:dark){body,html,.cbg{background-color:#050507!important;}.t1{color:#ffffff!important;}.t2{color:#e0e0e0!important;}.t3{color:#999999!important;}}</style></head>
<body class="cbg" style="margin:0;padding:0;background-color:#050507;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<div style="display:none;font-size:0;color:#050507;line-height:0;max-height:0;overflow:hidden;">${title}&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" class="cbg" style="background-color:#050507;">
<tr><td align="center" style="padding:48px 16px 40px;background-color:#050507;">
<table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;width:100%;">
<tr><td align="center" style="padding-bottom:44px;"><img src="${appUrl}/images/purpleLGG.png" alt="LuxHub" width="44" height="44" style="display:block;border:0;" /></td></tr>
<tr><td class="cbg" style="background-color:#0a0a0c;border:1px solid #1a1a1f;border-radius:16px;overflow:hidden;">
<div style="height:2px;background:linear-gradient(90deg,transparent 5%,#c8a1ff 30%,#a855f7 50%,#c8a1ff 70%,transparent 95%);"></div>
<div style="padding:48px 44px 40px;">
<div style="display:inline-block;background:${accentColor}20;color:${accentColor};padding:6px 14px;border-radius:6px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:24px;">${typeBadge}</div>
${params.imageUrl ? `<div style="text-align:center;margin:0 0 24px;"><div style="display:inline-block;border-radius:12px;overflow:hidden;border:1px solid rgba(200,161,255,0.15);"><img src="${params.imageUrl}" alt="${title}" style="display:block;max-width:280px;width:100%;object-fit:cover;" /></div></div>` : ''}
<p class="t1" style="font-size:20px;font-weight:600;margin:0 0 12px;color:#ffffff;">${title}</p>
<p class="t2" style="font-size:15px;line-height:1.75;color:#e0e0e0;margin:0 0 28px;">${message}</p>
${actionUrl ? `<div style="text-align:center;margin:0 0 12px;"><a href="${actionUrl}" style="display:inline-block;min-width:200px;padding:16px 44px;background:linear-gradient(135deg,rgba(200,161,255,0.12),rgba(168,85,247,0.08));border:1px solid #c8a1ff50;color:#c8a1ff;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px;letter-spacing:0.8px;text-transform:uppercase;">${params.ctaText || 'View Details'}</a></div>` : ''}
</div></td></tr>
<tr><td style="padding:36px 16px 0;text-align:center;"><p style="margin:0;font-size:11px;color:#555555;"><a href="https://luxhub.gold" style="color:#777;text-decoration:none;">luxhub.gold</a>&nbsp;&nbsp;&#183;&nbsp;&nbsp;<a href="https://x.com/LuxHubStudio" style="color:#777;text-decoration:none;">@LuxHubStudio</a></p></td></tr>
</table></td></tr></table></body></html>`.trim();
}

function offerEmailTemplate(params: EmailTemplateParams, accentColor: string): string {
  const {
    title,
    message,
    actionUrl,
    eventBadge,
    imageUrl,
    amountUSD,
    amountLabel,
    counterpartyWallet,
    counterpartyLabel,
    ctaText,
  } = params;

  const badge = eventBadge || params.type.replace(/_/g, ' ').toUpperCase();
  const truncWallet = counterpartyWallet
    ? `${counterpartyWallet.slice(0, 6)}...${counterpartyWallet.slice(-4)}`
    : '';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://luxhub.gold';

  return `<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark">
<style>:root{color-scheme:dark only;}body,html{background-color:#050507!important;}u+.body{background-color:#050507!important;}[data-ogsc] body{background-color:#050507!important;}@media(prefers-color-scheme:light){body,html,.cbg{background-color:#050507!important;}.t1{color:#ffffff!important;}.t2{color:#e0e0e0!important;}.t3{color:#999999!important;}}@media(prefers-color-scheme:dark){body,html,.cbg{background-color:#050507!important;}.t1{color:#ffffff!important;}.t2{color:#e0e0e0!important;}.t3{color:#999999!important;}}</style></head>
<body class="cbg" style="margin:0;padding:0;background-color:#050507;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<div style="display:none;font-size:0;color:#050507;line-height:0;max-height:0;overflow:hidden;">${title}&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" class="cbg" style="background-color:#050507;">
<tr><td align="center" style="padding:48px 16px 40px;background-color:#050507;">
<table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;width:100%;">
<tr><td align="center" style="padding-bottom:44px;"><img src="${appUrl}/images/purpleLGG.png" alt="LuxHub" width="44" height="44" style="display:block;border:0;" /></td></tr>
<tr><td class="cbg" style="background-color:#0a0a0c;border:1px solid #1a1a1f;border-radius:16px;overflow:hidden;">
<div style="height:2px;background:linear-gradient(90deg,transparent 5%,#c8a1ff 30%,#a855f7 50%,#c8a1ff 70%,transparent 95%);"></div>
<div style="padding:48px 44px 40px;">
<div style="display:inline-block;background:${accentColor}20;color:${accentColor};padding:6px 14px;border-radius:6px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:24px;">${badge}</div>
${imageUrl ? `<div style="text-align:center;margin:0 0 24px;"><div style="display:inline-block;border-radius:12px;overflow:hidden;border:1px solid rgba(200,161,255,0.15);"><img src="${imageUrl}" alt="Asset" style="display:block;max-width:280px;width:100%;object-fit:cover;" /></div></div>` : ''}
<p class="t1" style="font-size:20px;font-weight:600;margin:0 0 12px;color:#ffffff;">${title}</p>
${amountUSD !== undefined ? `<div style="margin:0 0 16px;"><span style="font-size:13px;color:#a1a1a1;text-transform:uppercase;letter-spacing:0.5px;">${amountLabel || 'Amount'}</span><div style="font-size:28px;font-weight:700;color:#c8a1ff;margin-top:4px;">$${amountUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</div></div>` : ''}
${counterpartyWallet ? `<div style="margin:0 0 20px;padding:10px 14px;background:rgba(200,161,255,0.06);border-radius:8px;border:1px solid rgba(200,161,255,0.08);"><span style="font-size:12px;color:#a1a1a1;">${counterpartyLabel || 'Wallet'}</span><div style="font-size:14px;color:#ffffff;font-family:'SF Mono','Fira Code',monospace;margin-top:2px;">${truncWallet}</div></div>` : ''}
<p class="t2" style="font-size:15px;line-height:1.75;color:#e0e0e0;margin:0 0 28px;">${message}</p>
${actionUrl ? `<div style="text-align:center;margin:0 0 12px;"><a href="${actionUrl}" style="display:inline-block;min-width:200px;padding:16px 44px;background:linear-gradient(135deg,rgba(200,161,255,0.12),rgba(168,85,247,0.08));border:1px solid #c8a1ff50;color:#c8a1ff;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px;letter-spacing:0.8px;text-transform:uppercase;">${ctaText || 'View Details'}</a></div>` : ''}
</div></td></tr>
<tr><td style="padding:36px 16px 0;text-align:center;"><p style="margin:0;font-size:11px;color:#555555;"><a href="https://luxhub.gold" style="color:#777;text-decoration:none;">luxhub.gold</a>&nbsp;&nbsp;&#183;&nbsp;&nbsp;<a href="https://x.com/LuxHubStudio" style="color:#777;text-decoration:none;">@LuxHubStudio</a></p></td></tr>
</table></td></tr></table></body></html>`.trim();
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
        from: process.env.RESEND_FROM_EMAIL || 'LuxHub <notifications@luxhub.gold>',
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

// ========== PREFERENCE HELPERS ==========

// Map notification types to user preference categories
function getNotificationCategory(type: NotificationType): string {
  const categoryMap: Record<NotificationType, string> = {
    order_funded: 'orderUpdates',
    order_shipped: 'orderUpdates',
    order_delivered: 'orderUpdates',
    order_refunded: 'orderUpdates',
    shipment_submitted: 'orderUpdates',
    shipment_verified: 'orderUpdates',
    shipment_rejected: 'orderUpdates',
    offer_received: 'offerAlerts',
    offer_accepted: 'offerAlerts',
    offer_rejected: 'offerAlerts',
    offer_countered: 'offerAlerts',
    offer_auto_rejected: 'offerAlerts',
    payment_released: 'paymentAlerts',
    pool_investment: 'poolUpdates',
    pool_distribution: 'poolUpdates',
    vendor_approved: 'securityAlerts',
    vendor_rejected: 'securityAlerts',
    sale_request_approved: 'orderUpdates',
    sale_request_rejected: 'orderUpdates',
    escrow_cancelled_external_sale: 'orderUpdates',
    delist_request_approved: 'orderUpdates',
    delist_request_rejected: 'orderUpdates',
    pool_wind_down_announced: 'poolUpdates',
    pool_snapshot_taken: 'poolUpdates',
    pool_distribution_complete: 'poolUpdates',
    vendor_application_received: 'securityAlerts',
    vendor_application_submitted: 'securityAlerts',
    vendor_invite_sent: 'securityAlerts',
    dispute_created: 'securityAlerts',
    delist_request_submitted: 'orderUpdates',
    mint_request_submitted: 'orderUpdates',
    mint_request_approved: 'orderUpdates',
    mint_request_rejected: 'orderUpdates',
    mint_request_minted: 'orderUpdates',
  };
  return categoryMap[type] || 'orderUpdates';
}

// ========== MAIN SERVICE FUNCTIONS ==========

/**
 * Create an in-app notification and optionally send email.
 * Respects user notification preferences (channel + category).
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
    }

    // Resolve email: User.email -> VendorProfile.email -> InviteCode.vendorEmail
    let resolvedEmail = user?.email;
    let emailSource = 'User.email';

    if (!resolvedEmail) {
      // Try VendorProfile
      const vendorProfile = (await VendorProfileModel.findOne({ wallet: userWallet })
        .select('email')
        .lean()) as any;
      if (vendorProfile?.email) {
        resolvedEmail = vendorProfile.email as string;
        emailSource = 'VendorProfile.email';
      }
    }

    if (!resolvedEmail) {
      // Try InviteCode (last resort -- vendor email stored at invite time)
      const invite = (await InviteCodeModel.findOne({
        vendorWallet: userWallet,
        vendorEmail: { $ne: null },
      })
        .select('vendorEmail')
        .lean()) as any;
      if (invite?.vendorEmail) {
        resolvedEmail = invite.vendorEmail as string;
        emailSource = 'InviteCode.vendorEmail';
      }
    }

    if (resolvedEmail && resolvedEmail !== user?.email) {
      console.log(
        `[NotificationService] Resolved email for ${userWallet.slice(0, 8)}... via ${emailSource}`
      );
    }

    // Check user notification preferences
    const prefs = user?.notificationPrefs || {};
    const category = getNotificationCategory(type);

    // Check if user has opted out of this category
    const categoryEnabled = prefs[category] !== false; // Default true if not set
    const inAppEnabled = prefs.inAppEnabled !== false;
    const emailEnabled = prefs.emailEnabled !== false;

    // Create in-app notification (if enabled)
    let notification = null;
    if (inAppEnabled && categoryEnabled) {
      notification = await Notification.create({
        user: user?._id,
        userWallet,
        type,
        title,
        message,
        metadata,
      });
    }

    // Send email if user has email, channel enabled, and category enabled
    let emailSent = false;
    let emailError: string | undefined;

    if (shouldSendEmail && resolvedEmail && emailEnabled && categoryEnabled) {
      const result = await sendEmail(resolvedEmail, type, {
        title,
        message,
        actionUrl: metadata.actionUrl,
        type,
        // Forward offer-specific fields from metadata for rich email templates
        imageUrl: metadata.imageUrl,
        amountUSD: metadata.amountUSD,
        amountLabel: metadata.amountLabel,
        counterpartyWallet: metadata.counterpartyWallet,
        counterpartyLabel: metadata.counterpartyLabel,
        ctaText: metadata.ctaText,
        eventBadge: metadata.eventBadge,
      });

      emailSent = result.success;
      emailError = result.error;

      // Update notification with email status
      if (notification) {
        notification.emailSent = emailSent;
        notification.emailSentAt = emailSent ? new Date() : undefined;
        notification.emailError = emailError;
        await notification.save();
      }
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
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://luxhub.gold';

  return notifyUser({
    userWallet: vendorWallet,
    type: 'order_funded',
    title: 'New Order Received!',
    message: `You have a new order for "${assetTitle}" ($${amountUSD.toFixed(2)} USD). Please ship the item and submit tracking information.`,
    metadata: {
      escrowId,
      escrowPda,
      amountUSD,
      actionUrl: `${appUrl}/vendor/vendorDashboard?tab=orders`,
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
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://luxhub.gold';

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
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://luxhub.gold';

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
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://luxhub.gold';

  return notifyUser({
    userWallet: vendorWallet,
    type: 'shipment_verified',
    title: 'Shipment Verified!',
    message: `Your shipment proof for "${assetTitle}" has been verified. Funds will be released once delivery is confirmed.`,
    metadata: {
      escrowId,
      escrowPda,
      actionUrl: `${appUrl}/vendor/vendorDashboard?tab=orders`,
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
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://luxhub.gold';

  return notifyUser({
    userWallet: vendorWallet,
    type: 'shipment_rejected',
    title: 'Shipment Rejected - Action Required',
    message: `Your shipment proof for "${assetTitle}" was rejected. Reason: ${reason}. Please submit new tracking information.`,
    metadata: {
      escrowId,
      escrowPda,
      actionUrl: `${appUrl}/vendor/vendorDashboard?tab=orders`,
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
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://luxhub.gold';

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
      actionUrl: `${appUrl}/vendor/vendorDashboard?tab=orders`,
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
  imageUrl?: string;
}) {
  const { vendorWallet, buyerWallet, offerId, escrowId, assetTitle, offerAmountUSD, imageUrl } =
    params;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://luxhub.gold';

  return notifyUser({
    userWallet: vendorWallet,
    type: 'offer_received',
    title: `New Offer — ${assetTitle}`,
    message: `You received an offer of $${offerAmountUSD.toFixed(2)} USD for "${assetTitle}".`,
    metadata: {
      offerId,
      escrowId,
      amountUSD: offerAmountUSD,
      actionUrl: `${appUrl}/vendor/vendorDashboard?tab=offers`,
      imageUrl,
      amountLabel: 'Offer Amount',
      counterpartyWallet: buyerWallet,
      counterpartyLabel: 'From Buyer',
      ctaText: 'Review Offer',
      eventBadge: 'NEW OFFER',
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
  imageUrl?: string;
}) {
  const { buyerWallet, offerId, escrowId, escrowPda, assetTitle, acceptedAmountUSD, imageUrl } =
    params;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://luxhub.gold';

  return notifyUser({
    userWallet: buyerWallet,
    type: 'offer_accepted',
    title: `Offer Accepted — ${assetTitle}`,
    message: `Congratulations! Your offer of $${acceptedAmountUSD.toFixed(2)} USD for "${assetTitle}" has been accepted. Complete your purchase now!`,
    metadata: {
      offerId,
      escrowId,
      escrowPda,
      amountUSD: acceptedAmountUSD,
      actionUrl: `${appUrl}/marketplace?pay=${escrowPda}`,
      imageUrl,
      amountLabel: 'Accepted Amount',
      counterpartyLabel: 'Vendor',
      ctaText: 'Complete Purchase',
      eventBadge: 'OFFER ACCEPTED',
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
  imageUrl?: string;
}) {
  const { buyerWallet, offerId, escrowId, assetTitle, reason, imageUrl } = params;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://luxhub.gold';

  return notifyUser({
    userWallet: buyerWallet,
    type: 'offer_rejected',
    title: `Offer Not Accepted — ${assetTitle}`,
    message: reason
      ? `Your offer for "${assetTitle}" was not accepted. Reason: ${reason}`
      : `Your offer for "${assetTitle}" was not accepted by the vendor.`,
    metadata: {
      offerId,
      escrowId,
      actionUrl: `${appUrl}/user/userDashboard?tab=offers`,
      imageUrl,
      eventBadge: 'OFFER REJECTED',
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
  imageUrl?: string;
}) {
  const { buyerWallet, offerId, escrowId, escrowPda, assetTitle, counterAmountUSD, imageUrl } =
    params;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://luxhub.gold';

  return notifyUser({
    userWallet: buyerWallet,
    type: 'offer_countered',
    title: `Counter Offer — ${assetTitle}`,
    message: `The vendor has countered with $${counterAmountUSD.toFixed(2)} USD for "${assetTitle}". Review and respond to the offer.`,
    metadata: {
      offerId,
      escrowId,
      escrowPda,
      amountUSD: counterAmountUSD,
      actionUrl: `${appUrl}/user/userDashboard?tab=offers`,
      imageUrl,
      amountLabel: 'Counter Amount',
      counterpartyLabel: 'From Vendor',
      ctaText: 'Review Counter',
      eventBadge: 'COUNTER OFFER',
    },
  });
}

/**
 * Notify buyer when their offer is auto-rejected (item purchased by another buyer)
 */
export async function notifyOfferAutoRejected(params: {
  buyerWallet: string;
  escrowPda: string;
  reason: string;
}) {
  const { buyerWallet, escrowPda, reason } = params;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://luxhub.gold';

  return notifyUser({
    userWallet: buyerWallet,
    type: 'offer_auto_rejected',
    title: 'Offer Automatically Closed',
    message: `Your offer was automatically closed because the item was purchased. ${reason}`,
    metadata: {
      escrowPda,
      actionUrl: `${appUrl}/marketplace`,
    },
  });
}

/**
 * Notify vendor when buyer accepts their counter-offer
 */
export async function notifyCounterAcceptedByBuyer(params: {
  vendorWallet: string;
  buyerWallet: string;
  offerId: string;
  escrowId: string;
  escrowPda: string;
  assetTitle: string;
  acceptedAmountUSD: number;
  imageUrl?: string;
}) {
  const {
    vendorWallet,
    buyerWallet,
    offerId,
    escrowId,
    escrowPda,
    assetTitle,
    acceptedAmountUSD,
    imageUrl,
  } = params;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://luxhub.gold';

  return notifyUser({
    userWallet: vendorWallet,
    type: 'offer_accepted',
    title: `Counter-Offer Accepted — ${assetTitle}`,
    message: `The buyer accepted your counter-offer of $${acceptedAmountUSD.toFixed(2)} USD for "${assetTitle}". Awaiting buyer payment.`,
    metadata: {
      offerId,
      escrowId,
      escrowPda,
      amountUSD: acceptedAmountUSD,
      actionUrl: `${appUrl}/vendor/vendorDashboard?tab=offers`,
      imageUrl,
      amountLabel: 'Accepted Amount',
      counterpartyWallet: buyerWallet,
      counterpartyLabel: 'Buyer',
      ctaText: 'View Order',
      eventBadge: 'COUNTER ACCEPTED',
    },
  });
}

/**
 * Notify vendor when buyer rejects their counter-offer
 */
export async function notifyCounterRejectedByBuyer(params: {
  vendorWallet: string;
  offerId: string;
  escrowId: string;
  escrowPda: string;
  assetTitle: string;
}) {
  const { vendorWallet, offerId, escrowId, escrowPda, assetTitle } = params;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://luxhub.gold';

  return notifyUser({
    userWallet: vendorWallet,
    type: 'offer_rejected',
    title: 'Counter-Offer Rejected',
    message: `The buyer rejected your counter-offer for "${assetTitle}".`,
    metadata: {
      offerId,
      escrowId,
      escrowPda,
      actionUrl: `${appUrl}/vendor/vendorDashboard?tab=offers`,
    },
  });
}

/**
 * Notify vendor when buyer submits a counter-offer
 */
export async function notifyBuyerCounteredVendor(params: {
  vendorWallet: string;
  buyerWallet: string;
  offerId: string;
  escrowId: string;
  escrowPda: string;
  assetTitle: string;
  counterAmountUSD: number;
}) {
  const { vendorWallet, offerId, escrowId, escrowPda, assetTitle, counterAmountUSD } = params;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://luxhub.gold';

  return notifyUser({
    userWallet: vendorWallet,
    type: 'offer_countered',
    title: 'Buyer Counter-Offer Received',
    message: `The buyer has countered with $${counterAmountUSD.toFixed(2)} USD for "${assetTitle}". Review and respond.`,
    metadata: {
      offerId,
      escrowId,
      escrowPda,
      amountUSD: counterAmountUSD,
      actionUrl: `${appUrl}/vendor/vendorDashboard?tab=offers`,
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
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://luxhub.gold';

  const result = await notifyUser({
    userWallet: vendorWallet,
    type: approved ? 'vendor_approved' : 'vendor_rejected',
    title: approved ? 'Vendor Application Approved!' : 'Vendor Application Update',
    message: approved
      ? `Congratulations${vendorName ? ` ${vendorName}` : ''}! Your vendor application has been approved. You can now access your Vendor Dashboard to set up your inventory and start listing luxury assets on LuxHub.`
      : `Thank you for your interest in becoming a LuxHub vendor.${reason ? ` ${reason}` : ' Unfortunately, we cannot approve your application at this time.'}`,
    metadata: {
      actionUrl: approved ? `${appUrl}/vendor/vendorDashboard` : `${appUrl}/vendor/apply`,
    },
  });

  // CC admin email on approval/rejection for record-keeping
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL;
  if (adminEmail) {
    const statusLabel = approved ? 'APPROVED' : 'REJECTED';
    try {
      await sendEmail(adminEmail, approved ? 'vendor_approved' : 'vendor_rejected', {
        title: `Vendor ${statusLabel}: ${vendorName || vendorWallet.slice(0, 8)}`,
        message: `Vendor ${vendorName ? `"${vendorName}" (${vendorWallet.slice(0, 8)}...)` : vendorWallet.slice(0, 8) + '...'} has been ${statusLabel.toLowerCase()}.${!approved && reason ? ` Reason: ${reason}` : ''}`,
        actionUrl: `${appUrl}/adminDashboard`,
        type: approved ? 'vendor_approved' : 'vendor_rejected',
      });
    } catch (emailErr) {
      console.error('[NotificationService] Admin CC email error:', emailErr);
    }
  }

  return result;
}

/**
 * Notify buyer when their order is refunded
 */
export async function notifyOrderRefunded(params: {
  buyerWallet: string;
  vendorWallet: string;
  escrowId: string;
  escrowPda: string;
  assetTitle: string;
  amountUSD: number;
  reason?: string;
}) {
  const { buyerWallet, vendorWallet, escrowId, escrowPda, assetTitle, amountUSD, reason } = params;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://luxhub.gold';

  // Notify buyer
  await notifyUser({
    userWallet: buyerWallet,
    type: 'order_refunded',
    title: 'Refund Processed',
    message: `Your $${amountUSD.toLocaleString()} USDC for "${assetTitle}" has been returned to your wallet.${reason ? ` Reason: ${reason}` : ''}`,
    metadata: {
      escrowId,
      escrowPda,
      amountUSD,
      actionUrl: `${appUrl}/orders`,
    },
  });

  // Notify vendor
  await notifyUser({
    userWallet: vendorWallet,
    type: 'order_refunded',
    title: 'Order Refunded',
    message: `The order for "${assetTitle}" ($${amountUSD.toLocaleString()} USDC) has been refunded to the buyer. Your NFT has been returned to your wallet.${reason ? ` Reason: ${reason}` : ''}`,
    metadata: {
      escrowId,
      escrowPda,
      amountUSD,
      actionUrl: `${appUrl}/vendor/vendorDashboard?tab=orders`,
    },
  });
}

/**
 * Notify all admins when a new vendor application is submitted
 */
export async function notifyNewVendorApplication(params: {
  vendorName: string;
  vendorWallet: string;
  vendorUsername: string;
  businessType?: string;
  primaryCategory?: string;
}) {
  const { vendorName, vendorWallet, vendorUsername, businessType, primaryCategory } = params;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://luxhub.gold';

  // Get admin wallets from env
  const adminWallets = (process.env.ADMIN_WALLETS || '')
    .split(',')
    .map((w) => w.trim())
    .filter(Boolean);

  const superAdminWallets = (process.env.SUPER_ADMIN_WALLETS || '')
    .split(',')
    .map((w) => w.trim())
    .filter(Boolean);

  const allAdmins = [...new Set([...adminWallets, ...superAdminWallets])];

  if (allAdmins.length === 0) {
    console.warn('[NotificationService] No admin wallets configured, skipping admin notification');
    return [];
  }

  const details = [
    `Business: ${vendorName} (@${vendorUsername})`,
    businessType ? `Type: ${businessType}` : null,
    primaryCategory ? `Category: ${primaryCategory}` : null,
    `Wallet: ${vendorWallet.slice(0, 8)}...${vendorWallet.slice(-4)}`,
  ]
    .filter(Boolean)
    .join(' | ');

  const results = await Promise.allSettled(
    allAdmins.map((adminWallet) =>
      notifyUser({
        userWallet: adminWallet,
        type: 'vendor_application_received',
        title: 'New Vendor Application',
        message: `A new vendor application needs your review. ${details}. Go to the Admin Dashboard to approve or reject.`,
        metadata: {
          vendorId: vendorWallet,
          actionUrl: `${appUrl}/adminDashboard`,
        },
      })
    )
  );

  // Also send directly to the admin notification email (fallback for when
  // admin wallets don't have User records with emails in the DB)
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL;
  if (adminEmail) {
    try {
      await sendEmail(adminEmail, 'vendor_application_received', {
        title: 'New Vendor Application',
        message: `A new vendor application needs your review.\n\n${details}\n\nLog in to the Admin Dashboard to approve or reject this application.`,
        actionUrl: `${appUrl}/adminDashboard`,
        type: 'vendor_application_received',
      });
    } catch (emailErr) {
      console.error('[NotificationService] Admin email fallback error:', emailErr);
    }
  }

  return results;
}

/**
 * Notify admins when a buyer opens a dispute
 */
export async function notifyDisputeCreated(params: {
  adminWallets: string[];
  buyerWallet: string;
  escrowId: string;
  escrowPda: string;
  assetTitle: string;
  reason: string;
}) {
  const { adminWallets, buyerWallet, escrowId, escrowPda, assetTitle, reason } = params;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://luxhub.gold';

  const results = await Promise.all(
    adminWallets.map((adminWallet) =>
      notifyUser({
        userWallet: adminWallet,
        type: 'dispute_created',
        title: 'New Dispute Opened',
        message: `Buyer ${buyerWallet.slice(0, 8)}... opened a dispute for "${assetTitle}". Reason: ${reason}. Review and resolve within 7 days.`,
        metadata: {
          escrowId,
          escrowPda,
          actionUrl: `${appUrl}/adminDashboard`,
        },
      })
    )
  );
  return results;
}

/**
 * Notify admins when a vendor submits a delist request
 */
export async function notifyDelistRequestSubmitted(params: {
  adminWallets: string[];
  vendorWallet: string;
  assetId: string;
  assetTitle: string;
  reason: string;
}) {
  const { adminWallets, vendorWallet, assetId, assetTitle, reason } = params;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://luxhub.gold';

  const results = await Promise.all(
    adminWallets.map((adminWallet) =>
      notifyUser({
        userWallet: adminWallet,
        type: 'delist_request_submitted',
        title: 'New Delist Request',
        message: `Vendor ${vendorWallet.slice(0, 8)}... requested to delist "${assetTitle}". Reason: ${reason}`,
        metadata: {
          assetId,
          vendorId: vendorWallet,
          actionUrl: `${appUrl}/adminDashboard`,
        },
      })
    )
  );
  return results;
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
  notifyOfferAutoRejected,
  notifyVendorApplicationResult,
  notifyOrderRefunded,
  notifyNewVendorApplication,
  notifyDisputeCreated,
  notifyDelistRequestSubmitted,
};
