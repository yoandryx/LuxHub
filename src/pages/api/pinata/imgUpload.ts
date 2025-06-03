// File: /pages/api/pinata/imgUpload.ts
import type { NextApiRequest, NextApiResponse } from "next";
import multer from "multer";
import fs from "fs";
import path from "path";
import axios from "axios";
import { Readable } from "stream";
import next from "next";

// Configure multer to use /tmp folder
const upload = multer({ dest: "/tmp" });

// Disable body parsing for file upload
export const config = {
  api: {
    bodyParser: false,
  },
};

// Middleware wrapper for multer (no next-connect)
function runMiddleware(req: NextApiRequest, res: NextApiResponse, fn: Function) {
  return new Promise((resolve, reject) => {
    fn(req, res, (result: any) => {
      if (result instanceof Error) return reject(result);
      return resolve(result);
    });
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    await runMiddleware(req, res, upload.single("file"));

    const file = (req as any).file;
    if (!file) return res.status(400).json({ error: "No file uploaded" });

    const formData = new (require("form-data"))();
    formData.append("file", fs.createReadStream(file.path));
    formData.append(
      "pinataMetadata",
      JSON.stringify({
        name: file.originalname,
        keyvalues: {
          folder: "profileImages",
        },
      })
    );

    const pinataRes = await axios.post(
      "https://api.pinata.cloud/pinning/pinFileToIPFS",
      formData,
      {
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        headers: {
          ...formData.getHeaders(),
          Authorization: `Bearer ${process.env.PINATA_JWT}`,
        },
      }
    );

    fs.unlinkSync(file.path); // Clean up temp file

    const ipfsHash = pinataRes.data.IpfsHash;
    const gateway = "https://gateway.pinata.cloud/ipfs/";

    return res.status(200).json({
      ipfsHash,
      uri: `${gateway}${ipfsHash}`,
    });
  } catch (err: any) {
    console.error("Upload failed", err);
    return res.status(500).json({ error: "Upload failed." });
  }
}
