// src/pages/api/offers/list.ts
// List offers - supports vendor view (by escrow) and buyer view (by wallet)
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { Offer } from '../../../lib/models/Offer';

interface ListOffersQuery {
  // For escrow-specific listing (vendor view)
  escrowPda?: string;

  // For buyer's offers
  buyerWallet?: string;

  // For vendor's received offers
  vendorWallet?: string;

  // Status filter
  status?: string;

  // Pagination
  page?: string;
  limit?: string;

  // Sort
  sortBy?: 'createdAt' | 'offerAmount' | 'offerPriceUSD';
  sortOrder?: 'asc' | 'desc';
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      escrowPda,
      buyerWallet,
      vendorWallet,
      status,
      page = '1',
      limit = '20',
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query as ListOffersQuery;

    // At least one filter must be provided
    if (!escrowPda && !buyerWallet && !vendorWallet) {
      return res.status(400).json({
        error: 'At least one filter required: escrowPda, buyerWallet, or vendorWallet',
      });
    }

    await dbConnect();

    // Build query
    const query: Record<string, any> = {
      deleted: { $ne: true },
    };

    if (escrowPda) {
      query.escrowPda = escrowPda;
    }

    if (buyerWallet) {
      query.buyerWallet = buyerWallet;
    }

    if (vendorWallet) {
      query.vendorWallet = vendorWallet;
    }

    if (status) {
      // Support comma-separated status values
      const statusArray = status.split(',').map((s) => s.trim());
      query.status = { $in: statusArray };
    }

    // Pagination
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = Math.min(parseInt(limit, 10) || 20, 100); // Max 100
    const skip = (pageNum - 1) * limitNum;

    // Sort
    const sortField = ['createdAt', 'offerAmount', 'offerPriceUSD'].includes(sortBy)
      ? sortBy
      : 'createdAt';
    const sortDirection = sortOrder === 'asc' ? 1 : -1;

    // Execute query
    const [offers, totalCount] = await Promise.all([
      Offer.find(query)
        .populate({
          path: 'asset',
          select: 'model priceUSD imageIpfsUrls images',
        })
        .populate({
          path: 'fromUser',
          select: 'wallet username',
        })
        .populate({
          path: 'toVendor',
          select: 'businessName',
        })
        .populate({
          path: 'escrowId',
          select: 'escrowPda status listingPrice listingPriceUSD saleMode',
        })
        .sort({ [sortField]: sortDirection })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Offer.countDocuments(query),
    ]);

    // Transform offers for response
    const transformedOffers = offers.map((offer: any) => ({
      _id: offer._id,
      escrowPda: offer.escrowPda,
      escrowId: offer.escrowId?._id,
      escrowStatus: offer.escrowId?.status,
      escrowListingPrice: offer.escrowId?.listingPriceUSD,

      // Asset info
      assetId: offer.asset?._id,
      assetModel: offer.asset?.model,
      assetImage: offer.asset?.imageIpfsUrls?.[0] || offer.asset?.images?.[0],
      assetListPrice: offer.asset?.priceUSD,

      // Offer details
      offerAmount: offer.offerAmount,
      offerPriceUSD: offer.offerPriceUSD,
      offerCurrency: offer.offerCurrency,
      message: offer.message,

      // Participants
      buyerWallet: offer.buyerWallet,
      buyerUsername: offer.fromUser?.username,
      vendorWallet: offer.vendorWallet,
      vendorName: offer.toVendor?.businessName,

      // Status
      status: offer.status,
      rejectionReason: offer.rejectionReason,
      autoRejectedReason: offer.autoRejectedReason,

      // Counter offers
      counterOffers: offer.counterOffers || [],
      latestCounterOffer:
        offer.counterOffers?.length > 0
          ? offer.counterOffers[offer.counterOffers.length - 1]
          : null,

      // Timestamps
      createdAt: offer.createdAt,
      respondedAt: offer.respondedAt,
      expiresAt: offer.expiresAt,
      settledAt: offer.settledAt,
    }));

    // Calculate stats
    const stats = {
      total: totalCount,
      pending: offers.filter((o: any) => o.status === 'pending').length,
      accepted: offers.filter((o: any) => o.status === 'accepted').length,
      rejected: offers.filter((o: any) => o.status === 'rejected').length,
      countered: offers.filter((o: any) => o.status === 'countered').length,
    };

    return res.status(200).json({
      success: true,
      offers: transformedOffers,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limitNum),
        hasMore: pageNum * limitNum < totalCount,
      },
      stats,
    });
  } catch (error: any) {
    console.error('[/api/offers/list] Error:', error);
    return res.status(500).json({
      error: 'Failed to list offers',
      details: error?.message || 'Unknown error',
    });
  }
}
