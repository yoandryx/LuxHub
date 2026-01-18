// src/pages/api/asset/createPending.ts
import { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { Asset } from '../../../lib/models/Assets';
import { User } from '../../../lib/models/User';
import { Vendor } from '../../../lib/models/Vendor';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  await dbConnect();

  const {
    wallet,
    title,
    brand,
    model,
    serialNumber,
    description,
    priceUSD,
    imageCids, // array from client Pinata uploads
    metadataCid,
    attributes, // full array from form
  } = req.body;

  try {
    const user = await User.findOne({ wallet });
    if (!user || user.role !== 'vendor') return res.status(403).json({ error: 'Vendor only' });

    // Prevent duplicate serial
    const existing = await Asset.findOne({ serial: serialNumber });
    if (existing) return res.status(400).json({ error: 'Serial number already used' });

    const asset = await Asset.create({
      vendor: user._id, // or Vendor ref if preferred
      model: title || `${brand} ${model}`,
      serial: serialNumber,
      description,
      priceUSD,
      currentValueUSD: priceUSD,
      imageIpfsUrls: imageCids,
      metadataIpfsUrl: `ipfs://${metadataCid}`, // or full gateway URL
      status: 'pending',
      nftOwnerWallet: wallet,
      metaplexMetadata: { attributes },
      authenticityProofs: [], // future expansion
    });

    res.status(200).json({ success: true, assetId: asset._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
}
