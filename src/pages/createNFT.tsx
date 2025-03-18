import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { getProgram } from "../utils/programUtils";
import { PublicKey, SystemProgram, Keypair, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";

// List of authorized wallets (dev and admin)
const AUTHORIZED_WALLETS = [
  "DjdHMCKioQ2NukbJVKupNgnt9pHvS1CLEii2NSPY8jyd", // Dev Account
  "6mst5P2CaiiAoQh426oxadGuksQgkHoUdQAWdeMQWE8X", // Admin
];

const CreateNFT = () => {
  const wallet = useWallet();
  const [fileCid, setFileCid] = useState<string>("");
  const [priceSol, setPriceSol] = useState<number>(0);
  const [title, setTitle] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [minting, setMinting] = useState<boolean>(false);

  // Check if the connected wallet is authorized to mint NFTs
  const isAuthorized = wallet.publicKey
    ? AUTHORIZED_WALLETS.includes(wallet.publicKey.toBase58())
    : false;

  // Handler for input changes
  const handleFileCidChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileCid(e.target.value);
  };
  const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPriceSol(parseFloat(e.target.value));
  };
  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value);
  };
  const handleDescriptionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDescription(e.target.value);
  };

  // Mint NFT using on-chain mint_nft instruction
  const mintNFT = async () => {
    if (!wallet.publicKey) {
      alert("Please connect your wallet.");
      return;
    }
    if (!isAuthorized) {
      alert("You are not authorized to mint NFTs.");
      return;
    }
    if (!fileCid) {
      alert("Please provide a valid CID.");
      return;
    }
  
    setMinting(true);
  
    try {
      const program = getProgram(wallet);

      console.log("✅ Using programId:", program.programId.toString());
      console.log("✅ Available accounts in program:", program.account);

  
      // Dynamically derive the Admin List PDA
      const [adminListPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("admin_list")],
        program.programId
      );
  
      // Check if adminList PDA exists
      const adminListAccount = await program.account.adminList.fetchNullable(adminListPda);
      
      if (!adminListAccount) {
        console.log("Admin list does not exist. Initializing...");
        await program.methods.initAdminList().accounts({
          adminList: adminListPda,
          payer: wallet.publicKey,
          systemProgram: SystemProgram.programId,
        }).rpc();
        console.log("Admin list initialized.");
      } else {
        console.log("Admin list already exists.");
      }
  
      // Generate a new mint keypair for the NFT
      const mintKeypair = Keypair.generate();
  
      // Derive the associated token account address for the recipient
      const recipientAta = await getAssociatedTokenAddress(
        mintKeypair.publicKey,
        wallet.publicKey
      );
  
      // Call the smart contract's mint_nft instruction.
      const tx = await program.methods.mintNft().accounts({
        adminList: adminListPda,
        admin: wallet.publicKey,
        recipient: wallet.publicKey,
        nftMint: mintKeypair.publicKey,
        recipientTokenAccount: recipientAta,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"),
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([mintKeypair])
      .rpc();
  
      console.log("NFT minted successfully, tx:", tx);
      alert("NFT minted successfully!");
    } catch (error) {
      console.error("Minting error:", error);
      alert("Minting failed.");
    } finally {
      setMinting(false);
    }
  };
  

  return (
    <div>
      <h1>Create and List NFT</h1>
      <div style={{ marginBottom: "2rem" }}>
        <input
          type="text"
          placeholder="Enter CID (e.g., Qm...)"
          value={fileCid}
          onChange={handleFileCidChange}
        />
        <input
          type="text"
          placeholder="Title"
          value={title}
          onChange={handleTitleChange}
        />
        <input
          type="text"
          placeholder="Description"
          value={description}
          onChange={handleDescriptionChange}
        />
        <input
          type="number"
          placeholder="Price in SOL"
          value={priceSol}
          onChange={handlePriceChange}
        />
        {isAuthorized ? (
          <button onClick={mintNFT} disabled={minting}>
            {minting ? "Minting..." : "Mint NFT"}
          </button>
        ) : (
          <p className="text-red-500">
            You are not authorized to mint NFTs.
          </p>
        )}
      </div>

      {/* NFT Preview */}
      {fileCid && (
        <div>
          <h2>NFT Preview</h2>
          <img
            src={`${process.env.NEXT_PUBLIC_GATEWAY_URL}${fileCid}`}
            alt="NFT Preview"
            style={{ maxWidth: "300px", marginTop: "20px" }}
          />
        </div>
      )}

      {/* Optionally display existing NFTs from Pinata */}
      <h2>Existing NFTs on IPFS</h2>
      {/* ... your existing code to display NFTs ... */}
    </div>
  );
};

export default CreateNFT;
