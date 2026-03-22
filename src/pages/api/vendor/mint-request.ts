// src/pages/api/vendor/mint-request.ts
// Vendors submit mint requests here - admins approve/reject later
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import MintRequest from '../../../lib/models/MintRequest';
import { Vendor } from '../../../lib/models/Vendor';
import VendorProfile from '../../../lib/models/VendorProfile';
import { notifyUser } from '../../../lib/services/notificationService';
import { getAdminConfig } from '../../../lib/config/adminConfig';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb', // For base64 images
    },
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await dbConnect();

  // GET: Fetch vendor's own mint requests
  if (req.method === 'GET') {
    const wallet = req.query.wallet as string;
    if (!wallet) {
      return res.status(400).json({ error: 'Missing wallet' });
    }

    try {
      const requests = await MintRequest.find({ wallet })
        .sort({ createdAt: -1 })
        .select('-imageBase64') // Exclude large base64 data from response
        .lean();

      // Add imageUrl for requests that have a stored base64 image but no URL
      const enrichedRequests = requests.map((r: any) => ({
        ...r,
        // If no imageUrl exists, the image is stored as base64 — serve via API
        imageUrl: r.imageUrl || `/api/vendor/mint-request-image?id=${r._id}&wallet=${wallet}`,
      }));

      // Get counts by status
      const stats = {
        total: requests.length,
        pending: requests.filter((r: any) => r.status === 'pending').length,
        approved: requests.filter((r: any) => r.status === 'approved').length,
        minted: requests.filter((r: any) => r.status === 'minted').length,
        rejected: requests.filter((r: any) => r.status === 'rejected').length,
      };

      return res.status(200).json({ requests: enrichedRequests, stats });
    } catch (error) {
      console.error('[vendor/mint-request] GET error:', error);
      return res.status(500).json({ error: 'Failed to fetch requests' });
    }
  }

  // POST: Submit new mint request
  if (req.method === 'POST') {
    const {
      wallet,
      title,
      brand,
      model,
      referenceNumber,
      serialNumber, // Internal tracking only — never goes on-chain
      description,
      priceUSD,
      imageBase64, // Primary image as base64
      imageUrl, // Alternative: direct URL
      // Optional attributes
      material,
      productionYear,
      movement,
      caseSize,
      waterResistance,
      dialColor,
      country,
      condition,
      boxPapers,
      limitedEdition,
      certificate,
      warrantyInfo,
      provenance,
      features,
      releaseDate,
    } = req.body;

    // Validation
    if (!wallet) {
      return res.status(400).json({ error: 'Wallet address required' });
    }

    if (!brand || !model) {
      return res.status(400).json({ error: 'Brand and model are required' });
    }

    if (!referenceNumber && !serialNumber) {
      return res.status(400).json({ error: 'Reference/serial number is required' });
    }

    if (!priceUSD || priceUSD <= 0) {
      return res.status(400).json({ error: 'Valid price in USD is required' });
    }

    if (!imageBase64 && !imageUrl) {
      return res.status(400).json({ error: 'Image is required (base64 or URL)' });
    }

    try {
      // Verify vendor exists and is approved
      const vendorProfile = await VendorProfile.findOne({ wallet });
      if (!vendorProfile) {
        return res.status(404).json({ error: 'Vendor profile not found' });
      }

      if (!vendorProfile.approved) {
        return res.status(403).json({ error: 'Vendor must be approved to submit mint requests' });
      }

      // Check for duplicate reference number
      const existingRequest = await MintRequest.findOne({
        referenceNumber: referenceNumber || serialNumber,
        status: { $ne: 'rejected' }, // Allow resubmission if previously rejected
      });

      if (existingRequest) {
        return res.status(400).json({
          error: 'A mint request with this reference number already exists',
          existingStatus: existingRequest.status,
        });
      }

      // Determine if imageBase64 is actually a URL
      let finalImageBase64 = imageBase64;
      let finalImageUrl = imageUrl;

      if (imageBase64 && !imageBase64.startsWith('data:')) {
        // It's a URL, not base64 - store in imageUrl instead
        if (imageBase64.startsWith('http://') || imageBase64.startsWith('https://')) {
          finalImageUrl = imageBase64;
          finalImageBase64 = ''; // Don't store URL in base64 field
        }
      }

      // Create the mint request
      const mintRequest = await MintRequest.create({
        wallet,
        title: title || `${brand} ${model}`,
        brand,
        model,
        referenceNumber: referenceNumber || serialNumber,
        description,
        priceUSD,
        imageBase64: finalImageBase64,
        imageUrl: finalImageUrl,
        timestamp: Date.now(),
        // Optional attributes
        material,
        productionYear,
        movement,
        caseSize,
        waterResistance,
        dialColor,
        country,
        condition,
        boxPapers,
        limitedEdition,
        certificate,
        warrantyInfo,
        provenance,
        features,
        releaseDate,
        serialNumber: serialNumber || undefined, // Internal only — never on-chain
        status: 'pending',
      });

      // Notify admins about new mint request + send email
      try {
        const adminWalletList = (process.env.ADMIN_WALLETS || '')
          .split(',')
          .map((w) => w.trim())
          .filter(Boolean);
        const superAdminList = (process.env.SUPER_ADMIN_WALLETS || '')
          .split(',')
          .map((w) => w.trim())
          .filter(Boolean);
        const allAdmins = [...new Set([...adminWalletList, ...superAdminList])];
        console.log(
          `[mint-request] Notifying ${allAdmins.length} admins:`,
          allAdmins.map((w) => w.slice(0, 8))
        );

        for (const adminWallet of allAdmins) {
          try {
            const result = await notifyUser({
              userWallet: adminWallet,
              type: 'mint_request_submitted',
              title: 'New Mint Request',
              message: `${brand} ${model} submitted by vendor ${wallet.slice(0, 8)}...`,
              metadata: { actionUrl: '/adminDashboard' },
            });
            console.log(
              `[mint-request] Notified ${adminWallet.slice(0, 8)}: notification=${!!result.notification}, email=${result.emailSent}`
            );
          } catch (err: any) {
            console.error(
              `[mint-request] Failed to notify ${adminWallet.slice(0, 8)}:`,
              err.message || err
            );
          }
        }

        // Also send admin email directly
        const adminEmail = process.env.ADMIN_EMAIL || 'yoandry@luxhub.gold';
        const resendKey = process.env.RESEND_API_KEY;
        const fromEmail = process.env.RESEND_FROM_EMAIL || 'LuxHub <notifications@luxhub.gold>';
        if (resendKey) {
          fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from: fromEmail,
              to: [adminEmail],
              subject: `New listing request — ${brand} ${model}`,
              html: `<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark">
<style>:root{color-scheme:dark only;}body,html{background-color:#050507!important;}u+.body{background-color:#050507!important;}[data-ogsc] body{background-color:#050507!important;}@media(prefers-color-scheme:light){body,html,.cbg{background-color:#050507!important;}.t1{color:#ffffff!important;}.t2{color:#e0e0e0!important;}.t3{color:#999999!important;}}@media(prefers-color-scheme:dark){body,html,.cbg{background-color:#050507!important;}.t1{color:#ffffff!important;}.t2{color:#e0e0e0!important;}.t3{color:#999999!important;}}</style></head>
<body class="cbg" style="margin:0;padding:0;background-color:#050507;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<div style="display:none;font-size:0;color:#050507;line-height:0;max-height:0;overflow:hidden;">New listing request: ${brand} ${model}&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" class="cbg" style="background-color:#050507;">
<tr><td align="center" style="padding:48px 16px 40px;background-color:#050507;">
<table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;width:100%;">
<tr><td align="center" style="padding-bottom:44px;"><img src="${process.env.NEXT_PUBLIC_APP_URL || 'https://luxhub.gold'}/images/purpleLGG.png" alt="LuxHub" width="44" height="44" style="display:block;border:0;" /></td></tr>
<tr><td class="cbg" style="background-color:#0a0a0c;border:1px solid #1a1a1f;border-radius:16px;overflow:hidden;">
<div style="height:2px;background:linear-gradient(90deg,transparent 5%,#c8a1ff 30%,#a855f7 50%,#c8a1ff 70%,transparent 95%);"></div>
<div style="padding:48px 44px 40px;">
<p class="t1" style="margin:0 0 20px;font-size:18px;font-weight:600;color:#ffffff;">New Listing Request</p>
${finalImageUrl ? `<div style="text-align:center;margin:0 0 24px;"><div style="display:inline-block;border-radius:12px;overflow:hidden;border:1px solid rgba(200,161,255,0.15);"><img src="${finalImageUrl}" alt="${brand} ${model}" style="display:block;max-width:100%;width:100%;object-fit:cover;" /></div></div>` : ''}
<p class="t1" style="margin:0 0 8px;font-size:16px;color:#ffffff;">${brand} ${model}</p>
<p style="margin:0 0 12px;font-size:20px;font-weight:600;color:#c8a1ff;">$${Number(priceUSD).toLocaleString()} USD</p>
${referenceNumber ? `<p class="t3" style="margin:0 0 4px;font-size:14px;color:#999999;">Ref: ${referenceNumber}</p>` : ''}
${condition ? `<p class="t3" style="margin:0 0 4px;font-size:14px;color:#999999;">Condition: ${condition}</p>` : ''}
<p style="margin:12px 0 0;font-size:13px;color:#666666;">Submitted by vendor ${wallet.slice(0, 8)}...${wallet.slice(-4)}</p>
<div style="text-align:center;margin:24px 0 0;">
<a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://luxhub.gold'}/adminDashboard" style="display:inline-block;min-width:200px;padding:16px 44px;background:linear-gradient(135deg,rgba(200,161,255,0.12),rgba(168,85,247,0.08));border:1px solid #c8a1ff50;color:#c8a1ff;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px;letter-spacing:0.8px;text-transform:uppercase;">Review in Dashboard</a>
</div>
</div></td></tr>
<tr><td style="padding:36px 16px 0;text-align:center;"><p style="margin:0;font-size:11px;color:#555555;"><a href="https://luxhub.gold" style="color:#777;text-decoration:none;">luxhub.gold</a>&nbsp;&nbsp;&#183;&nbsp;&nbsp;<a href="https://x.com/LuxHubStudio" style="color:#777;text-decoration:none;">@LuxHubStudio</a></p></td></tr>
</table></td></tr></table></body></html>`,
            }),
          }).catch((err) => console.error('[mint-request] Admin email error:', err));
        }
      } catch (notifErr) {
        console.error('[mint-request] Admin notification error:', notifErr);
      }

      return res.status(201).json({
        success: true,
        message: 'Mint request submitted successfully',
        request: {
          _id: mintRequest._id,
          title: mintRequest.title,
          brand: mintRequest.brand,
          model: mintRequest.model,
          referenceNumber: mintRequest.referenceNumber,
          priceUSD: mintRequest.priceUSD,
          status: mintRequest.status,
          createdAt: mintRequest.createdAt,
        },
      });
    } catch (error) {
      console.error('[vendor/mint-request] POST error:', error);
      return res.status(500).json({ error: 'Failed to submit mint request' });
    }
  }

  // DELETE: Cancel a pending mint request
  if (req.method === 'DELETE') {
    const { requestId, wallet } = req.body;

    if (!requestId || !wallet) {
      return res.status(400).json({ error: 'Request ID and wallet required' });
    }

    try {
      const request = await MintRequest.findById(requestId);

      if (!request) {
        return res.status(404).json({ error: 'Mint request not found' });
      }

      if (request.wallet !== wallet) {
        return res.status(403).json({ error: 'Not authorized to delete this request' });
      }

      if (request.status !== 'pending') {
        return res.status(400).json({
          error: `Cannot delete request with status "${request.status}"`,
        });
      }

      await MintRequest.deleteOne({ _id: requestId });

      return res.status(200).json({
        success: true,
        message: 'Mint request cancelled',
      });
    } catch (error) {
      console.error('[vendor/mint-request] DELETE error:', error);
      return res.status(500).json({ error: 'Failed to cancel request' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
