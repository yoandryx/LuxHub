// src/pages/api/escrow/purchase.ts
// Buyer initiates a direct purchase at the listed price
// Creates a pending purchase record and stores shipping address
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { Escrow } from '../../../lib/models/Escrow';
import { User } from '../../../lib/models/User';
import { Asset } from '../../../lib/models/Assets';
import {
  notifyNewOrder,
  notifyUser,
  notifyOfferAutoRejected,
} from '../../../lib/services/notificationService';
import { Transaction } from '../../../lib/models/Transaction';
import { Offer } from '../../../lib/models/Offer';
import { strictLimiter } from '../../../lib/middleware/rateLimit';
import { verifyTransactionForWallet } from '../../../lib/services/txVerification';

interface ShippingAddress {
  fullName: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone?: string;
  email?: string;
  deliveryInstructions?: string;
}

interface PurchaseRequest {
  escrowPda?: string;
  mintAddress?: string; // Alternative lookup by NFT mint
  buyerWallet: string;
  txSignature?: string; // On-chain exchange transaction signature
  swapTxSignature?: string; // Jupiter swap tx (if buyer paid with SOL)
  paymentToken?: 'SOL' | 'USDC'; // Which token buyer paid with
  shippingAddress: ShippingAddress;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      escrowPda,
      mintAddress,
      buyerWallet,
      txSignature,
      swapTxSignature,
      paymentToken,
      shippingAddress,
    } = req.body as PurchaseRequest;

    // Validation
    if ((!escrowPda && !mintAddress) || !buyerWallet) {
      return res.status(400).json({
        error: 'Missing required fields: (escrowPda or mintAddress) and buyerWallet',
      });
    }

    // Validate shipping address
    if (!shippingAddress) {
      return res.status(400).json({
        error: 'Shipping address is required for purchase',
      });
    }

    const { fullName, street1, city, state, postalCode, country } = shippingAddress;
    if (!fullName || !street1 || !city || !state || !postalCode || !country) {
      return res.status(400).json({
        error:
          'Incomplete shipping address. Required: fullName, street1, city, state, postalCode, country',
      });
    }

    await dbConnect();

    // Find the escrow
    let escrow;
    if (escrowPda) {
      escrow = await Escrow.findOne({ escrowPda, deleted: false })
        .populate('seller')
        .populate('asset');
    } else if (mintAddress) {
      escrow = await Escrow.findOne({ nftMint: mintAddress, deleted: false })
        .populate('seller')
        .populate('asset');
    }

    if (!escrow) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    // Check escrow status - must be listed, initiated, or offer_accepted (buyer paying after acceptance)
    const allowedStatuses = ['initiated', 'listed', 'offer_accepted'];
    if (!allowedStatuses.includes(escrow.status)) {
      return res.status(400).json({
        error: `Cannot purchase. Current status: ${escrow.status}`,
      });
    }

    // Prevent seller from buying their own listing
    if (escrow.sellerWallet === buyerWallet) {
      return res.status(400).json({
        error: 'Seller cannot purchase their own listing',
      });
    }

    // Check if there's already a pending purchase on this escrow
    if (escrow.buyerWallet && escrow.status === 'funded') {
      return res.status(400).json({
        error: 'This item already has a pending purchase',
      });
    }

    // ========== ON-CHAIN TX VERIFICATION ==========
    // Verify the payment transaction actually exists and is confirmed on Solana
    if (txSignature) {
      const txResult = await verifyTransactionForWallet(txSignature, buyerWallet);
      if (!txResult.verified) {
        return res.status(400).json({
          error: 'Transaction verification failed',
          details: txResult.error,
          message:
            'The on-chain payment could not be verified. Please ensure the transaction is confirmed.',
        });
      }
    } else {
      // If no txSignature provided, mark as pending (not funded) until on-chain proof is given
      // This prevents marking escrow as "funded" without payment
      return res.status(400).json({
        error: 'Transaction signature required',
        message: 'Provide the on-chain transaction signature (txSignature) to prove payment.',
      });
    }

    // Get or create buyer user
    const buyerUser = await User.findOneAndUpdate(
      { wallet: buyerWallet },
      { $setOnInsert: { wallet: buyerWallet, role: 'user' } },
      { upsert: true, new: true }
    );

    // Get asset info
    const asset = await Asset.findById(escrow.asset);

    // Update escrow with buyer info and shipping address
    const updatedEscrow = await Escrow.findByIdAndUpdate(
      escrow._id,
      {
        $set: {
          buyer: buyerUser._id,
          buyerWallet,
          buyerShippingAddress: {
            fullName: shippingAddress.fullName,
            street1: shippingAddress.street1,
            street2: shippingAddress.street2,
            city: shippingAddress.city,
            state: shippingAddress.state,
            postalCode: shippingAddress.postalCode,
            country: shippingAddress.country,
            phone: shippingAddress.phone,
            email: shippingAddress.email,
            deliveryInstructions: shippingAddress.deliveryInstructions,
          },
          status: 'funded', // Mark as funded/purchased
          fundedAt: new Date(),
          fundedAmount: escrow.listingPrice,
          // Store on-chain transaction signature if provided
          ...(txSignature && { txSignature, lastTxSignature: txSignature }),
          // USDC payment tracking
          ...(swapTxSignature && { swapTxSignature }),
          ...(paymentToken && { paymentMint: paymentToken === 'SOL' ? 'SOL' : 'USDC' }),
        },
      },
      { new: true }
    );

    // Record purchase transaction
    Transaction.create({
      type: 'sale',
      escrow: updatedEscrow._id,
      asset: updatedEscrow.asset,
      fromWallet: buyerWallet,
      toWallet: updatedEscrow.escrowPda,
      amountUSD: updatedEscrow.listingPriceUSD || 0,
      txSignature: txSignature || undefined,
      status: 'success',
    }).catch((err: any) => console.error('[/api/escrow/purchase] Transaction record error:', err));

    // Close all other pending/countered offers on this escrow — deal is done
    try {
      // Query for offers that will be auto-rejected (for notification dispatch)
      const offersToReject = await Offer.find({
        escrowPda: updatedEscrow.escrowPda,
        status: { $in: ['pending', 'countered'] },
        buyerWallet: { $ne: buyerWallet },
      })
        .select('buyerWallet')
        .lean();

      await Offer.updateMany(
        {
          escrowPda: updatedEscrow.escrowPda,
          status: { $in: ['pending', 'countered'] },
          buyerWallet: { $ne: buyerWallet }, // Don't touch the buyer's own accepted offer
        },
        {
          $set: {
            status: 'auto_rejected',
            autoRejectedReason: 'Item has been purchased by another buyer',
            respondedAt: new Date(),
          },
        }
      );

      // Send auto-reject notifications to each affected buyer (FLOW-10)
      for (const offer of offersToReject) {
        notifyOfferAutoRejected({
          buyerWallet: offer.buyerWallet,
          escrowPda: updatedEscrow.escrowPda,
          reason: 'Item has been purchased by another buyer',
        }).catch((err: any) => console.error('[purchase] auto-reject notification error:', err));
      }
    } catch (err) {
      console.error('[/api/escrow/purchase] Offer cleanup error:', err);
    }

    // Send notifications
    try {
      const assetTitle = asset?.title || asset?.model || 'Luxury item';

      // Notify vendor of new order
      if (updatedEscrow.sellerWallet) {
        await notifyNewOrder({
          vendorWallet: updatedEscrow.sellerWallet,
          buyerWallet,
          escrowId: updatedEscrow._id.toString(),
          escrowPda: updatedEscrow.escrowPda,
          assetTitle,
          amountUSD: updatedEscrow.listingPriceUSD || 0,
        });
      }

      // Notify buyer of purchase confirmation
      await notifyUser({
        userWallet: buyerWallet,
        type: 'order_funded',
        title: 'Purchase Confirmed',
        message: `Your purchase of "${assetTitle}" has been confirmed. $${updatedEscrow.listingPriceUSD?.toLocaleString() || '0'} USDC is secured in escrow. The vendor will ship your item soon!`,
        metadata: {
          escrowId: updatedEscrow._id.toString(),
          escrowPda: updatedEscrow.escrowPda,
          amountUSD: updatedEscrow.listingPriceUSD,
          actionUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'https://luxhub.gold'}/orders`,
        },
      });
    } catch (notifyError) {
      // Don't fail the request if notification fails
      console.error('[/api/escrow/purchase] Notification error:', notifyError);
    }

    return res.status(200).json({
      success: true,
      message: 'Purchase initiated successfully. Vendor will be notified to ship the item.',
      purchase: {
        escrowId: updatedEscrow._id,
        escrowPda: updatedEscrow.escrowPda,
        nftMint: updatedEscrow.nftMint,
        buyerWallet,
        sellerWallet: updatedEscrow.sellerWallet,
        amount: updatedEscrow.listingPrice,
        amountUSD: updatedEscrow.listingPriceUSD,
        status: updatedEscrow.status,
        shippingAddress: {
          fullName: shippingAddress.fullName,
          city: shippingAddress.city,
          state: shippingAddress.state,
          country: shippingAddress.country,
        },
      },
      asset: asset
        ? {
            title: asset.title || asset.model,
            brand: asset.brand,
            imageUrl: asset.imageUrl || asset.imageIpfsUrls?.[0],
          }
        : null,
      nextSteps: [
        'Vendor will review and ship the item',
        'You will receive tracking information once shipped',
        'Confirm delivery once you receive the item',
        'USDC released to vendor (97%) after your confirmation',
        'If rejected, USDC is returned to you automatically',
      ],
    });
  } catch (error: any) {
    console.error('[/api/escrow/purchase] Error:', error);
    return res.status(500).json({
      error: 'Failed to process purchase',
      details: error?.message || 'Unknown error',
    });
  }
}

// Rate limit purchases: 5 per minute per IP
export default strictLimiter(handler);
