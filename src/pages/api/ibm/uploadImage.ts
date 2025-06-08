// /api/ibm/uploadImage.ts

import type { NextApiRequest, NextApiResponse } from "next";
import multer from "multer";
import fs from "fs";
import COS from "ibm-cos-sdk";

export const config = { api: { bodyParser: false } };
const upload = multer({ dest: "/tmp" });

function runMiddleware(req: NextApiRequest, res: NextApiResponse, fn: Function) {
  return new Promise((resolve, reject) => {
    fn(req, res, (result: any) => {
      if (result instanceof Error) return reject(result);
      return resolve(result);
    });
  });
}

const cos = new COS.S3({
  endpoint: "https://s3.us-south.cloud-object-storage.appdomain.cloud",
  apiKeyId: process.env.IBM_COS_API_KEY,
  serviceInstanceId: process.env.IBM_COS_RESOURCE_INSTANCE_ID,
  signatureVersion: "iam",
});

const BUCKET_NAME = "luxhub-assets";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  const { wallet, type } = req.query;

  if (!wallet || !type) {
    return res.status(400).json({ error: "Missing wallet or type in query params" });
  }

  try {
    await runMiddleware(req, res, upload.single("file"));

    const file = (req as any).file;
    if (!file) return res.status(400).json({ error: "No file uploaded" });

    const cleanKey = `profile-images/${wallet}_${type}.png`;

    const uploadParams = {
      Bucket: BUCKET_NAME,
      Key: cleanKey,
      Body: fs.createReadStream(file.path),
      ACL: "public-read",
      ContentType: file.mimetype,
    };

    await cos.putObject(uploadParams).promise();
    fs.unlinkSync(file.path); // cleanup

    const publicUrl = `https://${BUCKET_NAME}.s3.us-south.cloud-object-storage.appdomain.cloud/${cleanKey}`;
    return res.status(200).json({ url: publicUrl });
  } catch (err) {
    console.error("IBM Upload failed:", err);
    return res.status(500).json({ error: "Upload failed" });
  }
}
