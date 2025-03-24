export interface NFTMetadata {
  name: string;
  symbol: string;
  description: string;
  image: string;
  external_url?: string;
  attributes?: { trait_type: string; value: string }[];
  seller_fee_basis_points: number;
  animation_url?: string;
  properties: {
    creators: { address: string; share: number }[];
    files: { uri: string; type: string }[];
    category?: string;
  };
}

export const createMetadata = (
  name: string,
  description: string,
  imageCid: string,
  walletAddress: string,
  brand: string,
  model: string,
  serialNumber: string,
  material: string,
  productionYear: string,
  limitedEdition: string,
  certificate: string,
  warrantyInfo: string,
  provenance: string,
  movement?: string,
  caseSize?: string,
  waterResistance?: string,
  dialColor?: string,
  country?: string,
  releaseDate?: string
): NFTMetadata => {
  const gateway =
    process.env.NEXT_PUBLIC_GATEWAY_URL || "https://gateway.pinata.cloud/ipfs/";
  const attributes = [
    { trait_type: "Brand", value: brand },
    { trait_type: "Model", value: model },
    { trait_type: "Serial Number", value: serialNumber },
    { trait_type: "Material", value: material },
    { trait_type: "Production Year", value: productionYear },
    { trait_type: "Limited Edition", value: limitedEdition },
    { trait_type: "Certificate", value: certificate },
    { trait_type: "Warranty Info", value: warrantyInfo },
    { trait_type: "Provenance", value: provenance },
  ];

  // Optionally add additional watch attributes if provided.
  if (movement) attributes.push({ trait_type: "Movement", value: movement });
  if (caseSize) attributes.push({ trait_type: "Case Size", value: caseSize });
  if (waterResistance) attributes.push({ trait_type: "Water Resistance", value: waterResistance });
  if (dialColor) attributes.push({ trait_type: "Dial Color", value: dialColor });
  if (country) attributes.push({ trait_type: "Country", value: country });
  if (releaseDate) attributes.push({ trait_type: "Release Date", value: releaseDate });

  return {
    name,
    symbol: "LUXHUB",
    description,
    image: `${gateway}${imageCid}`,
    external_url: "",
    seller_fee_basis_points: 300,
    attributes,
    properties: {
      creators: [
        {
          address: walletAddress,
          share: 100,
        },
      ],
      files: [
        {
          uri: `${gateway}${imageCid}`,
          type: "image/png",
        },
      ],
      category: "Timepieces",
    },
  };
};
