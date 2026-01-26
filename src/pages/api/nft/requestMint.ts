// /pages/api/nft/requestMint.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import MintRequest from '../../../lib/models/MintRequest';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const {
    // Required fields
    title,
    brand,
    model,
    referenceNumber,
    priceUSD,
    imageBase64,
    wallet,
    timestamp,
    // Optional fields
    description,
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
    imageCid,
    imageUrl,
    // Legacy fields (for backwards compatibility)
    serialNumber,
    priceSol,
  } = req.body;

  // Validate required fields
  if (!wallet || !title || !imageBase64 || !timestamp) {
    return res
      .status(400)
      .json({ error: 'Missing required fields: wallet, title, imageBase64, timestamp' });
  }

  if (!brand || !model) {
    return res.status(400).json({ error: 'Missing required fields: brand, model' });
  }

  // Handle legacy field mapping
  const finalReferenceNumber = referenceNumber || serialNumber;
  const finalPriceUSD = priceUSD !== undefined ? priceUSD : priceSol ? priceSol * 200 : 0; // Rough conversion if only priceSol provided

  if (!finalReferenceNumber) {
    return res.status(400).json({ error: 'Missing required field: referenceNumber' });
  }

  if (finalPriceUSD === undefined || finalPriceUSD <= 0) {
    return res
      .status(400)
      .json({ error: 'Missing required field: priceUSD (must be greater than 0)' });
  }

  try {
    await dbConnect();

    await MintRequest.create({
      // Required
      title,
      brand,
      model,
      referenceNumber: finalReferenceNumber,
      priceUSD: finalPriceUSD,
      imageBase64,
      wallet,
      timestamp,
      // Optional
      description,
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
      imageCid,
      imageUrl,
      // Legacy (stored for backwards compatibility)
      serialNumber: serialNumber || finalReferenceNumber,
      priceSol,
      // Status
      status: 'pending',
    });

    return res.status(200).json({ message: 'Mint request submitted successfully' });
  } catch (error) {
    console.error('Mint request error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
