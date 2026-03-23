// src/pages/api/email-preview.ts
// Dev-only endpoint to preview all email templates
// Usage: /api/email-preview (gallery) or /api/email-preview?type=offer_received (single)
import type { NextApiRequest, NextApiResponse } from 'next';
import notificationService from '../../lib/services/notificationService';
const { generateEmailPreview } = notificationService;

// All notification types grouped by category
const EMAIL_CATEGORIES: Record<string, { label: string; types: { type: string; label: string; color: string }[] }> = {
  orders: {
    label: 'Orders & Shipping',
    types: [
      { type: 'order_funded', label: 'New Order Received', color: '#22c55e' },
      { type: 'order_shipped', label: 'Order Shipped', color: '#3b82f6' },
      { type: 'order_delivered', label: 'Delivery Confirmed', color: '#22c55e' },
      { type: 'payment_released', label: 'Payment Released', color: '#22c55e' },
      { type: 'order_refunded', label: 'Refund Processed', color: '#f59e0b' },
      { type: 'shipment_submitted', label: 'Shipment Proof Submitted', color: '#f59e0b' },
      { type: 'shipment_verified', label: 'Shipment Verified', color: '#22c55e' },
      { type: 'shipment_rejected', label: 'Shipment Rejected', color: '#ef4444' },
    ],
  },
  offers: {
    label: 'Offers & Negotiation',
    types: [
      { type: 'offer_received', label: 'New Offer', color: '#c8a1ff' },
      { type: 'offer_accepted', label: 'Offer Accepted', color: '#22c55e' },
      { type: 'offer_rejected', label: 'Offer Rejected', color: '#ef4444' },
      { type: 'offer_countered', label: 'Counter Offer', color: '#f59e0b' },
      { type: 'offer_auto_rejected', label: 'Auto-Rejected', color: '#ef4444' },
    ],
  },
  vendor: {
    label: 'Vendor Management',
    types: [
      { type: 'vendor_approved', label: 'Vendor Approved', color: '#22c55e' },
      { type: 'vendor_rejected', label: 'Vendor Rejected', color: '#ef4444' },
      { type: 'vendor_application_received', label: 'Application Received (Admin)', color: '#c8a1ff' },
      { type: 'vendor_application_submitted', label: 'Application Submitted', color: '#c8a1ff' },
      { type: 'vendor_invite_sent', label: 'Vendor Invite', color: '#c8a1ff' },
      { type: 'delist_request_submitted', label: 'Delist Request', color: '#f59e0b' },
      { type: 'delist_request_approved', label: 'Delist Approved', color: '#22c55e' },
      { type: 'delist_request_rejected', label: 'Delist Rejected', color: '#ef4444' },
    ],
  },
  pools: {
    label: 'Pools',
    types: [
      { type: 'pool_investment', label: 'Investment Confirmed', color: '#c8a1ff' },
      { type: 'pool_distribution', label: 'Distribution Received', color: '#22c55e' },
      { type: 'pool_wind_down_announced', label: 'Wind-Down Announced', color: '#f59e0b' },
      { type: 'pool_snapshot_taken', label: 'Snapshot Taken', color: '#c8a1ff' },
      { type: 'pool_distribution_complete', label: 'Distribution Complete', color: '#22c55e' },
    ],
  },
  admin: {
    label: 'Admin & Disputes',
    types: [
      { type: 'sale_request_approved', label: 'Sale Approved', color: '#22c55e' },
      { type: 'sale_request_rejected', label: 'Sale Rejected', color: '#ef4444' },
      { type: 'escrow_cancelled_external_sale', label: 'Escrow Cancelled', color: '#ef4444' },
      { type: 'dispute_created', label: 'Dispute Opened', color: '#ef4444' },
    ],
  },
  mint: {
    label: 'NFT Minting',
    types: [
      { type: 'mint_request_submitted', label: 'Mint Submitted', color: '#c8a1ff' },
      { type: 'mint_request_approved', label: 'Mint Approved', color: '#22c55e' },
      { type: 'mint_request_rejected', label: 'Mint Rejected', color: '#ef4444' },
      { type: 'mint_request_minted', label: 'NFT Minted', color: '#c8a1ff' },
    ],
  },
};

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only allow in development
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }

  const { type } = req.query;

  // Single email preview
  if (type && typeof type === 'string') {
    try {
      const html = generateEmailPreview(type as any);
      res.setHeader('Content-Type', 'text/html');
      return res.status(200).send(html);
    } catch {
      return res.status(400).json({ error: `Unknown type: ${type}` });
    }
  }

  // Gallery view — render all emails in a scrollable page
  const galleryHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>LuxHub Email Templates — Preview Gallery</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: #0a0a0a;
    color: #fff;
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    padding: 40px 20px;
  }
  .header {
    text-align: center;
    margin-bottom: 48px;
  }
  .header h1 {
    font-size: 28px;
    font-weight: 700;
    margin-bottom: 8px;
    background: linear-gradient(135deg, #c8a1ff, #a855f7);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .header p {
    color: #888;
    font-size: 14px;
  }
  .category {
    max-width: 700px;
    margin: 0 auto 48px;
  }
  .category-title {
    font-size: 13px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: #c8a1ff;
    margin-bottom: 16px;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(200,161,255,0.1);
  }
  .type-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .type-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 10px;
    color: #e0e0e0;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.2s;
    text-decoration: none;
  }
  .type-btn:hover {
    border-color: rgba(200,161,255,0.3);
    background: rgba(200,161,255,0.06);
    transform: translateY(-1px);
  }
  .type-btn .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .preview-frame {
    max-width: 640px;
    margin: 32px auto;
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 16px;
    overflow: hidden;
    background: #050507;
    display: none;
  }
  .preview-frame.active { display: block; }
  .preview-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 20px;
    background: rgba(255,255,255,0.03);
    border-bottom: 1px solid rgba(255,255,255,0.06);
  }
  .preview-label {
    font-size: 12px;
    color: #888;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .preview-close {
    background: none;
    border: none;
    color: #666;
    font-size: 18px;
    cursor: pointer;
    padding: 4px 8px;
  }
  .preview-close:hover { color: #fff; }
  .preview-frame iframe {
    width: 100%;
    height: 700px;
    border: none;
    background: #050507;
  }
</style>
</head>
<body>
<div class="header">
  <h1>LuxHub Email Templates</h1>
  <p>${Object.values(EMAIL_CATEGORIES).reduce((n, c) => n + c.types.length, 0)} notification emails &middot; Click to preview</p>
</div>

${Object.entries(EMAIL_CATEGORIES).map(([, cat]) => `
<div class="category">
  <div class="category-title">${cat.label}</div>
  <div class="type-grid">
    ${cat.types.map(t => `<a class="type-btn" href="#" onclick="showPreview('${t.type}','${t.label}');return false;">
      <span class="dot" style="background:${t.color}"></span>
      ${t.label}
    </a>`).join('\n    ')}
  </div>
</div>
`).join('')}

<div id="preview" class="preview-frame">
  <div class="preview-header">
    <span id="previewLabel" class="preview-label">Preview</span>
    <button class="preview-close" onclick="hidePreview()">&times;</button>
  </div>
  <iframe id="previewFrame" title="Email Preview"></iframe>
</div>

<script>
function showPreview(type, label) {
  const frame = document.getElementById('preview');
  const iframe = document.getElementById('previewFrame');
  const labelEl = document.getElementById('previewLabel');
  iframe.src = '/api/email-preview?type=' + type;
  labelEl.textContent = label + ' — ' + type;
  frame.classList.add('active');
  frame.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function hidePreview() {
  document.getElementById('preview').classList.remove('active');
}
</script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html');
  return res.status(200).send(galleryHtml);
}
