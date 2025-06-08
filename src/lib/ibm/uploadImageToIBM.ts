// lib/ibm/uploadImageToIBM.ts
import COS from "ibm-cos-sdk";

const config = {
  endpoint: "https://s3.us-south.cloud-object-storage.appdomain.cloud", // Change if your region differs
  apiKeyId: process.env.IBM_COS_API_KEY!,
  serviceInstanceId: process.env.IBM_COS_RESOURCE_INSTANCE_ID!, // you'll get this from "Service credentials"
};

const cos = new COS.S3({
  endpoint: config.endpoint,
  apiKeyId: config.apiKeyId,
  ibmAuthEndpoint: "https://iam.cloud.ibm.com/identity/token",
  serviceInstanceId: config.serviceInstanceId,
  signatureVersion: "iam",
});

export async function uploadToIBM(file: Buffer, fileName: string, mimeType: string) {
  const params = {
    Bucket: "luxhub-assets",
    Key: fileName,
    Body: file,
    ContentType: mimeType,
  };

  try {
    await cos.putObject(params).promise();
    return `${config.endpoint}/luxhub-assets/${fileName}`;
  } catch (err) {
    console.error("IBM Upload Error:", err);
    throw err;
  }
}
