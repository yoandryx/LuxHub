import { useState, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { getProgram } from "../utils/programUtils";
import {
  PublicKey,
  SystemProgram,
  Keypair,
  SYSVAR_RENT_PUBKEY,
  Connection,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  getMint,
  getAccount,
} from "@solana/spl-token";
import { Metaplex, walletAdapterIdentity } from "@metaplex-foundation/js";
import { uploadToPinata } from "../utils/pinata";
import { createMetadata } from "../utils/metadata";
import { NftDetailCard } from "../components/marketplace/NftDetailCard";
import { NftForm } from "../components/admins/NftForm";
import styles from "../styles/CreateNFT.module.css";

interface MintedNFT {
  title: string;
  description: string;
  image: string;
  priceSol: number;
  metadataUri: string;
}

const CreateNFT = () => {
  const wallet = useWallet();

  // Basic NFT fields
  const [fileCid, setFileCid] = useState<string>("");
  const [priceSol, setPriceSol] = useState<number>(0);
  const [title, setTitle] = useState<string>("");
  const [description, setDescription] = useState<string>("");

  // Additional luxury watch attributes
  const [brand, setBrand] = useState<string>("");
  const [model, setModel] = useState<string>("");
  const [serialNumber, setSerialNumber] = useState<string>("");
  const [material, setMaterial] = useState<string>("");
  const [productionYear, setProductionYear] = useState<string>("");
  const [limitedEdition, setLimitedEdition] = useState<string>("");
  const [certificate, setCertificate] = useState<string>("");
  const [warrantyInfo, setWarrantyInfo] = useState<string>("");
  const [provenance, setProvenance] = useState<string>("");

  // Additional optional watch attributes
  const [movement, setMovement] = useState<string>("Automatic");
  const [caseSize, setCaseSize] = useState<string>("42mm");
  const [waterResistance, setWaterResistance] = useState<string>("300m");
  const [dialColor, setDialColor] = useState<string>("Black");
  const [country, setCountry] = useState<string>("Switzerland");
  const [releaseDate, setReleaseDate] = useState<string>("2023-05-01");

  // Minting state and progress bar
  const [minting, setMinting] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>("");

  // For showing minted NFTs
  const [mintedNFTs, setMintedNFTs] = useState<MintedNFT[]>([]);
  const [selectedMetadataUri, setSelectedMetadataUri] = useState<string | null>(null);

  // -----------------------------
  // 1. Fetch existing NFTs on load
  // -----------------------------
  useEffect(() => {
    const fetchExistingNFTs = async () => {
      try {
        console.log("🔍 Fetching existing NFTs from /api/pinata/nfts...");
        const res = await fetch("/api/pinata/nfts");
        if (!res.ok) throw new Error("Failed to fetch existing NFTs");
        const data = await res.json();
        console.log("Raw data from /api/pinata/nfts:", data);

        const transformed: MintedNFT[] = await Promise.all(
          data.map(async (nft: any) => {
            const ipfsHash = nft.ipfs_pin_hash;
            try {
              console.log(`🔗 Fetching JSON metadata from IPFS hash: ${ipfsHash}`);
              const ipfsRes = await fetch(`${process.env.NEXT_PUBLIC_GATEWAY_URL}${ipfsHash}`);
              const contentType = ipfsRes.headers.get("Content-Type");
              if (!contentType || !contentType.includes("application/json")) {
                console.warn(
                  `Skipping pin ${ipfsHash} due to non-JSON content type: ${contentType}`
                );
                return null as any;
              }
              const jsonData = await ipfsRes.json();
              console.log("✅ Fetched JSON metadata:", jsonData);
              return {
                title: jsonData.name || "No Title",
                description: jsonData.description || "No Description",
                image: jsonData.image || `${process.env.NEXT_PUBLIC_GATEWAY_URL}${ipfsHash}`,
                priceSol: jsonData.priceSol ? parseFloat(jsonData.priceSol) : 0,
                metadataUri: `${process.env.NEXT_PUBLIC_GATEWAY_URL}${ipfsHash}`,
              };
            } catch (err) {
              console.error("Error fetching JSON for hash:", ipfsHash, err);
              return null as any;
            }
          })
        );
        const validNFTs = transformed.filter((item) => item !== null) as MintedNFT[];
        setMintedNFTs(validNFTs);
      } catch (error) {
        console.error("Error fetching existing NFTs:", error);
      }
    };
    fetchExistingNFTs();
  }, []);

  // -----------------------------
  // 2. Mint NFT function
  // -----------------------------
  const mintNFT = async () => {
    if (!wallet.publicKey) {
      alert("Please connect your wallet.");
      return;
    }
    if (!fileCid) {
      alert("Please provide a valid CID.");
      return;
    }

    setMinting(true);
    setProgress(0);
    setStatusMessage("Starting NFT mint process...");

    try {
      // 1. Get on-chain program
      const program = getProgram(wallet);
      console.log("✅ Using programId:", program.programId.toBase58());
      setProgress(10);
      setStatusMessage("Program loaded. Deriving admin list PDA...");

      // 2. Derive the admin list PDA
      const [adminListPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("admin_list")],
        program.programId
      );
      console.log("✅ adminListPda:", adminListPda.toBase58());

      // 3. Generate a new mint keypair
      const mintKeypair = Keypair.generate();
      console.log("🔑 New Mint Keypair:", mintKeypair.publicKey.toBase58());
      setProgress(20);
      setStatusMessage("Generated new mint keypair...");

      // 4. Derive associated token account (ATA) for recipient
      const recipientAta = await getAssociatedTokenAddress(
        mintKeypair.publicKey,
        wallet.publicKey,
        false,
        TOKEN_PROGRAM_ID
      );
      console.log("✅ Recipient ATA:", recipientAta.toBase58());
      setProgress(30);
      setStatusMessage("Created recipient ATA...");

      // 5. Create NFT metadata JSON, upload to Pinata
      setStatusMessage("Uploading metadata to Pinata...");
      const metadataJson = createMetadata(
        title,
        description,
        fileCid,
        wallet.publicKey.toBase58(),
        brand,
        model,
        serialNumber,
        material,
        productionYear,
        limitedEdition,
        certificate,
        warrantyInfo,
        provenance,
        movement,
        caseSize,
        waterResistance,
        dialColor,
        country,
        releaseDate
      );
      console.log("📝 Created metadata JSON:", metadataJson);
      const metadataUri = await uploadToPinata(metadataJson, title);
      console.log("✅ Metadata uploaded to Pinata. URI:", metadataUri);
      setProgress(40);

      // 6. Mint the NFT on-chain
      setStatusMessage("Minting NFT on-chain...");
      const tx = await program.methods
        .mintNft()
        .accounts({
          adminList: adminListPda,
          admin: wallet.publicKey,
          recipient: wallet.publicKey,
          nftMint: mintKeypair.publicKey,
          recipientTokenAccount: recipientAta,
          mintAuthority: wallet.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"),
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([mintKeypair])
        .rpc();
      console.log("✅ NFT minted successfully, tx signature:", tx);
      setProgress(50);

      // 7. Wait for on-chain state propagation
      console.log("⏳ Waiting 15 seconds for on-chain propagation...");
      setStatusMessage("Waiting for on-chain propagation...");
      await new Promise((resolve) => setTimeout(resolve, 15000));
      setProgress(60);

      // 8. Confirm mint supply and ATA balance
      setStatusMessage("Verifying mint supply & token balance...");
      const connection = new Connection(
        process.env.NEXT_PUBLIC_ENDPOINT || "https://api.devnet.solana.com"
      );
      const mintState = await getMint(connection, mintKeypair.publicKey, "finalized");
      console.log("Mint supply before metadata creation:", mintState.supply.toString());
      const ataState = await getAccount(connection, recipientAta, "finalized", TOKEN_PROGRAM_ID);
      console.log("Recipient ATA balance before metadata creation:", ataState.amount.toString());
      if (mintState.supply !== BigInt(1) || ataState.amount !== BigInt(1)) {
        throw new Error("Mint supply or ATA balance is not exactly 1");
      }
      setProgress(70);

      // 9. Create Metaplex instance & build metadata
      setStatusMessage("Building transaction for NFT metadata...");
      const metaplex = Metaplex.make(connection).use(walletAdapterIdentity(wallet));
      console.log("✅ Creating NFT metadata using Metaplex builder API...");

      // 10. Build the metadata creation transaction
      const createNftBuilder = await metaplex.nfts().builders().create({
        useExistingMint: mintKeypair.publicKey,
        tokenOwner: wallet.publicKey,
        uri: metadataUri,
        name: title,
        sellerFeeBasisPoints: 300,
        symbol: "LUXHUB",
        creators: [
          {
            address: wallet.publicKey,
            share: 100,
          },
        ],
        maxSupply: 0,
        mintTokens: false,
      });
      console.log("✅ Metadata builder created.");
      setProgress(80);

      // 11. Get latest blockhash
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("finalized");
      console.log("🧱 Latest blockhash:", blockhash);

      // 12. Convert builder to transaction
      const transaction = createNftBuilder.toTransaction({ blockhash, lastValidBlockHeight });
      console.log("📝 Transaction built.");
      setStatusMessage("Requesting wallet signature...");
      setProgress(85);

      // 13. Request wallet signature
      if (!wallet.signTransaction) {
        throw new Error("Wallet does not support transaction signing.");
      }
      const signedTx = await wallet.signTransaction(transaction);

      // 14. Send the signed transaction
      console.log("📡 Sending transaction...");
      setStatusMessage("Sending transaction to network...");
      const txId = await connection.sendRawTransaction(signedTx.serialize());
      console.log("📡 Transaction sent, signature:", txId);
      setProgress(90);

      // 15. Confirm the transaction
      setStatusMessage("Confirming transaction on-chain...");
      await connection.confirmTransaction({
        signature: txId,
        blockhash,
        lastValidBlockHeight,
      });
      console.log("✅ NFT metadata transaction confirmed:", txId);
      setProgress(95);

      // 16. Fetch NFT metadata using the mint address
      setStatusMessage("Fetching NFT metadata...");
      const mintAddress = mintKeypair.publicKey;
      const fetchedNft = await metaplex.nfts().findByMint({ mintAddress });
      if (!fetchedNft.json) {
        throw new Error("Fetched NFT metadata is null");
      }
      console.log("✅ Fetched NFT data:", fetchedNft.json);

      // 17. Update local state
      setMintedNFTs((prev) => [
        ...prev,
        {
          title: fetchedNft.json?.name || "Unknown Title",
          description: fetchedNft.json?.description || "No Description",
          image: fetchedNft.json?.image || "",
          priceSol,
          metadataUri,
        },
      ]);

      setProgress(100);
      setStatusMessage("NFT minted successfully!");
      alert("🎉 NFT minted successfully with metadata!");
    } catch (error: any) {
      console.error("❌ Minting error:", error);
      alert("Minting failed: " + error.message);
    } finally {
      setMinting(false);
    }
  };

  // -----------------------------
  // 3. Render
  // -----------------------------
  return (
    <div className={styles.pageContainer}>
      {/* SIDEBAR: NFT creation form (using separate component) */}
      <div className={styles.sidebar}>
        <NftForm
          fileCid={fileCid}
          setFileCid={setFileCid}
          title={title}
          setTitle={setTitle}
          description={description}
          setDescription={setDescription}
          priceSol={priceSol}
          setPriceSol={setPriceSol}
          brand={brand}
          setBrand={setBrand}
          model={model}
          setModel={setModel}
          serialNumber={serialNumber}
          setSerialNumber={setSerialNumber}
          material={material}
          setMaterial={setMaterial}
          productionYear={productionYear}
          setProductionYear={setProductionYear}
          limitedEdition={limitedEdition}
          setLimitedEdition={setLimitedEdition}
          certificate={certificate}
          setCertificate={setCertificate}
          warrantyInfo={warrantyInfo}
          setWarrantyInfo={setWarrantyInfo}
          provenance={provenance}
          setProvenance={setProvenance}
          mintNFT={mintNFT}
          minting={minting}
        />
      </div>

      {/* MAIN CONTENT: Preview and Minted NFT Grid */}
      <div className={styles.mainContent}>
        <div className={styles.previewSection}>
          <h2>NFT Preview</h2>
          {fileCid ? (
            <img
              src={`${process.env.NEXT_PUBLIC_GATEWAY_URL}${fileCid}`}
              alt="NFT Preview"
              style={{ maxWidth: "200px", marginTop: "20px" }}
            />
          ) : (
            <p>No image selected</p>
          )}
          <div>Title: {title}</div>
          <div>Description: {description}</div>
          <div>Price: {priceSol}</div>
        </div>

        {/* Progress Bar UI (Shown only while minting) */}
        {minting && (
          <div className={styles.mintProgressContainer}>
            <p>{statusMessage}</p>
            <div className={styles.progressBar}>
              <div
                className={styles.progress}
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            <p>{progress}%</p>
          </div>
        )}

        <div className={styles.mintedSection}>
          <h2>Minted NFTs</h2>
          <div className={styles.grid}>
            {mintedNFTs.length > 0 ? (
              mintedNFTs.map((nft, index) => (
                <div key={index} className={styles.nftCard}>
                  <img src={nft.image} alt={nft.title} />
                  <h3>{nft.title}</h3>
                  <p>{nft.description}</p>
                  <p>Price: {nft.priceSol} SOL</p>
                  <button onClick={() => setSelectedMetadataUri(nft.metadataUri)}>
                    View Details
                  </button>
                </div>
              ))
            ) : (
              <p>No minted NFTs yet.</p>
            )}
          </div>
        </div>
      </div>

      {/* Detail overlay for NFT metadata */}
      {selectedMetadataUri && (
        <div className={styles.detailOverlay}>
          <div className={styles.detailContainer}>
            <button
              className={styles.closeButton}
              onClick={() => setSelectedMetadataUri(null)}
            >
              Close
            </button>
            <NftDetailCard metadataUri={selectedMetadataUri} />
          </div>
        </div>
      )}
    </div>
  );
};

export default CreateNFT;
