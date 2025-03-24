// components/NftForm.tsx
import React from "react";
import styles from "../../styles/CreateNFT.module.css";

interface NftFormProps {
  // Basic NFT fields
  fileCid: string;
  setFileCid: (val: string) => void;
  title: string;
  setTitle: (val: string) => void;
  description: string;
  setDescription: (val: string) => void;
  priceSol: number;
  setPriceSol: (val: number) => void;

  // Luxury watch attributes
  brand: string;
  setBrand: (val: string) => void;
  model: string;
  setModel: (val: string) => void;
  serialNumber: string;
  setSerialNumber: (val: string) => void;
  material: string;
  setMaterial: (val: string) => void;
  productionYear: string;
  setProductionYear: (val: string) => void;
  limitedEdition: string;
  setLimitedEdition: (val: string) => void;
  certificate: string;
  setCertificate: (val: string) => void;
  warrantyInfo: string;
  setWarrantyInfo: (val: string) => void;
  provenance: string;
  setProvenance: (val: string) => void;

  // Action
  mintNFT: () => Promise<void>;
  minting: boolean;
}

export const NftForm: React.FC<NftFormProps> = ({
  fileCid,
  setFileCid,
  title,
  setTitle,
  description,
  setDescription,
  priceSol,
  setPriceSol,
  brand,
  setBrand,
  model,
  setModel,
  serialNumber,
  setSerialNumber,
  material,
  setMaterial,
  productionYear,
  setProductionYear,
  limitedEdition,
  setLimitedEdition,
  certificate,
  setCertificate,
  warrantyInfo,
  setWarrantyInfo,
  provenance,
  setProvenance,
  mintNFT,
  minting
}) => {
  return (
    <div className={styles.formSidebar}>
      <h2>Mint a New NFT</h2>

      <input
        type="text"
        placeholder="Enter CID (e.g., Qm...)"
        value={fileCid}
        onChange={(e) => setFileCid(e.target.value)}
      />
      <input
        type="text"
        placeholder="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <input
        type="text"
        placeholder="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <input
        type="number"
        placeholder="Price in SOL"
        value={priceSol}
        onChange={(e) => setPriceSol(parseFloat(e.target.value))}
      />

      <input
        type="text"
        placeholder="Brand (e.g., Rolex)"
        value={brand}
        onChange={(e) => setBrand(e.target.value)}
      />
      <input
        type="text"
        placeholder="Model (e.g., Submariner)"
        value={model}
        onChange={(e) => setModel(e.target.value)}
      />
      <input
        type="text"
        placeholder="Serial Number (e.g., 123456789)"
        value={serialNumber}
        onChange={(e) => setSerialNumber(e.target.value)}
      />
      <input
        type="text"
        placeholder="Material (e.g., Stainless Steel)"
        value={material}
        onChange={(e) => setMaterial(e.target.value)}
      />
      <input
        type="text"
        placeholder="Production Year (e.g., 2023)"
        value={productionYear}
        onChange={(e) => setProductionYear(e.target.value)}
      />
      <input
        type="text"
        placeholder="Limited Edition (Yes/No)"
        value={limitedEdition}
        onChange={(e) => setLimitedEdition(e.target.value)}
      />
      <input
        type="text"
        placeholder="Certificate URL"
        value={certificate}
        onChange={(e) => setCertificate(e.target.value)}
      />
      <input
        type="text"
        placeholder="Warranty Info (e.g., 2-year warranty)"
        value={warrantyInfo}
        onChange={(e) => setWarrantyInfo(e.target.value)}
      />
      <input
        type="text"
        placeholder="Provenance (e.g., Purchased from authorized dealer)"
        value={provenance}
        onChange={(e) => setProvenance(e.target.value)}
      />

      <button onClick={mintNFT} disabled={minting}>
        {minting ? "Minting..." : "Mint NFT"}
      </button>
    </div>
  );
};
