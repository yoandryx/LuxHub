import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const getR2Client = () =>
  new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });

const BUCKET = "luxhub-assets";

export async function uploadImage(
  file: Buffer,
  fileName: string,
  mimeType: string
): Promise<string> {
  const r2 = getR2Client();
  await r2.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: fileName,
      Body: file,
      ContentType: mimeType,
    })
  );
  return `https://${process.env.R2_PUBLIC_DOMAIN}/${fileName}`;
}
