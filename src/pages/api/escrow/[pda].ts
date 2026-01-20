// src/pages/api/escrow/[pda].ts
// Fetch a single escrow by PDA
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { Escrow } from '../../../lib/models/Escrow';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { pda } = req.query;

    if (!pda || typeof pda !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid escrow PDA' });
    }

    await dbConnect();

    const escrow = await Escrow.findOne({ escrowPda: pda, deleted: { $ne: true } })
      .populate(
        'asset',
        'model serial brand priceUSD description imageUrl imageIpfsUrls images category'
      )
      .populate('buyer', 'wallet username email')
      .populate('seller', 'businessName username verified wallet')
      .lean();

    if (!escrow) {
      return res.status(404).json({ error: 'Escrow not found' });
    }

    return res.status(200).json({
      success: true,
      escrow: {
        _id: escrow._id,
        escrowPda: escrow.escrowPda,
        nftMint: escrow.nftMint,
        status: escrow.status,
        saleMode: escrow.saleMode,
        acceptingOffers: escrow.acceptingOffers,
        // Pricing
        listingPrice: escrow.listingPrice,
        listingPriceUSD: escrow.listingPriceUSD,
        minimumOffer: escrow.minimumOffer,
        minimumOfferUSD: escrow.minimumOfferUSD,
        amountUSD: escrow.amountUSD,
        royaltyAmount: escrow.royaltyAmount,
        // Asset
        asset: escrow.asset,
        // Participants
        buyer: escrow.buyer,
        seller: escrow.seller,
        sellerWallet: escrow.sellerWallet,
        // Shipment tracking
        shipmentStatus: escrow.shipmentStatus,
        trackingCarrier: escrow.trackingCarrier,
        trackingNumber: escrow.trackingNumber,
        shipmentProofUrls: escrow.shipmentProofUrls,
        shipmentSubmittedAt: escrow.shipmentSubmittedAt,
        shipmentVerifiedAt: escrow.shipmentVerifiedAt,
        shipmentVerifiedBy: escrow.shipmentVerifiedBy,
        // Pool conversion
        convertedToPool: escrow.convertedToPool,
        poolId: escrow.poolId,
        // Offers
        activeOfferCount: escrow.activeOfferCount,
        highestOffer: escrow.highestOffer,
        acceptedOfferId: escrow.acceptedOfferId,
        // Squads
        squadsTransactionIndex: escrow.squadsTransactionIndex,
        squadsExecutionSignature: escrow.squadsExecutionSignature,
        confirmDeliveryProposalIndex: escrow.confirmDeliveryProposalIndex,
        // Timestamps
        createdAt: escrow.createdAt,
        updatedAt: escrow.updatedAt,
        expiresAt: escrow.expiresAt,
      },
    });
  } catch (error: any) {
    console.error('[/api/escrow/[pda]] Error:', error);
    return res.status(500).json({
      error: 'Failed to fetch escrow',
      details: error?.message || 'Unknown error',
    });
  }
}
