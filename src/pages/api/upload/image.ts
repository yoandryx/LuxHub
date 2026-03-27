import type { NextApiRequest, NextApiResponse } from "next";
import multer from "multer";
import fs from "fs";
import { uploadImage } from "../../../lib/storage/uploadImage";

export const config = { api: { bodyParser: false } };
const upload = multer({ dest: "/tmp" });

function runMiddleware(
  req: NextApiRequest,
  res: NextApiResponse,
  fn: Function
) {
  return new Promise((resolve, reject) => {
    fn(req, res, (result: any) => {
      if (result instanceof Error) return reject(result);
      return resolve(result);
    });
  });
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method Not Allowed" });

  const { wallet, type } = req.query;

  if (!wallet || !type) {
    return res
      .status(400)
      .json({ error: "Missing wallet or type in query params" });
  }

  try {
    await runMiddleware(req, res, upload.single("file"));

    const file = (req as any).file;
    if (!file) return res.status(400).json({ error: "No file uploaded" });

    const cleanKey = `profile-images/${wallet}_${type}.png`;
    const fileBuffer = fs.readFileSync(file.path);
    const publicUrl = await uploadImage(
      fileBuffer,
      cleanKey,
      file.mimetype
    );
    fs.unlinkSync(file.path); // cleanup temp file

    return res.status(200).json({ url: publicUrl });
  } catch (err) {
    console.error("R2 Upload failed:", err);
    return res.status(500).json({ error: "Upload failed" });
  }
}
