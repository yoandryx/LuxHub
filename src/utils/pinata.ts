// PATH utils/pinata.ts

import axios from "axios";

const PINATA_API_KEY = process.env.NEXT_PUBLIC_PINATA_API_KEY;
const NEXT_PINATA_SECRET_API_KEY = process.env.NEXT_PUBLIC_PINATA_SECRET_KEY;
const PINATA_GATEWAY_URL = "https://gateway.pinata.cloud/ipfs/";

/**
 * Uploads JSON metadata to Pinata and returns the IPFS URL.
 * @param metadataJson - The NFT metadata object
 * @param fileName - The name of the file to be stored in Pinata
 * @returns The full IPFS URL of the uploaded metadata
 */
export async function uploadToPinata(metadataJson: any, fileName: string): Promise<string> {
    if (!PINATA_API_KEY || !NEXT_PINATA_SECRET_API_KEY) {
        throw new Error("❌ Missing Pinata API credentials.");
    }

    try {
        const response = await axios.post(
            "https://api.pinata.cloud/pinning/pinJSONToIPFS",
            {
                pinataContent: metadataJson,
                pinataMetadata: {
                    name: fileName, // ✅ This assigns a name to the file in Pinata
                },
            },
            {
                headers: {
                    "Content-Type": "application/json",
                    pinata_api_key: PINATA_API_KEY,
                    pinata_secret_api_key: NEXT_PINATA_SECRET_API_KEY,
                },
            }
        );

        // Return the full IPFS URL of the metadata file
        return `${PINATA_GATEWAY_URL}${response.data.IpfsHash}`;
    } catch (error) {
        console.error("❌ Pinata Upload Error:", error);
        throw new Error("Failed to upload metadata to Pinata.");
    }
}

