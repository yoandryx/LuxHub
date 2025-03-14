import { createContext, useState, ReactNode, useContext } from "react";
import { PublicKey, Connection, Transaction, VersionedTransaction } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton, WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { Program, AnchorProvider, web3, Wallet as AnchorWallet } from "@coral-xyz/anchor";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import * as IDL from "../../../Solana-Anchor/target/idl/anchor_escrow.json"; // Adjust this path

// Deployed program ID from anchor deploy
const PROGRAM_ID = new PublicKey("8667Wxa5U1LEviLgx8WedQPVH4PfnCfYGYYvHmeuZBUB");

console.log("IDL loaded:", IDL);

interface Listing {
  id: string;
  title: string;
  description: string;
  priceSol: number;
  serialNumber: string;
  owner?: string;
  image?: string;  // This will store the CID or complete URL for the NFT image
}

interface ListingsContextType {
  listings: Listing[];
  setListings: React.Dispatch<React.SetStateAction<Listing[]>>;
  addListing: (newListing: Listing) => void;
  commitToBuy: (listingId: string) => void;
  settleEscrow: (listingId: string) => void;
}

export const ListingsContext = createContext<ListingsContextType | undefined>(undefined);

export const useListings = (): ListingsContextType => {
  const context = useContext(ListingsContext);
  if (!context) {
    throw new Error("useListings must be used within a ListingsProvider");
  }
  return context;
};

interface ListingsProviderProps {
  children: ReactNode;
}

export const ListingsProvider = ({ children }: ListingsProviderProps) => {
  const { connected, publicKey, signTransaction, signAllTransactions, sendTransaction, ...wallet } = useWallet();
  const [listings, setListings] = useState<Listing[]>([]);
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");

  // Only proceed if the wallet is connected
  if (!connected || !publicKey || !signTransaction || !sendTransaction) {
    return <div>Please connect your wallet to proceed.<WalletMultiButton/></div> ;
  }

  // Create an Anchor wallet object with a dummy payer (for browser wallet, this is not used)
  const anchorWallet: AnchorWallet = {
    publicKey,
    signTransaction,
    signAllTransactions: signAllTransactions
      ? signAllTransactions
      : async <T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> => txs,
    payer: undefined as any,
  };

  const provider = new AnchorProvider(connection, anchorWallet, { commitment: "confirmed" });
  const program = new Program(IDL, provider);

  const addListing = async (newListing: Listing) => {
    if (!publicKey || !sendTransaction || !program) {
      alert("Please connect your wallet.");
      return;
    }

    console.log("Wallet:", publicKey.toBase58());
    const priceLamports = parseFloat(newListing.priceSol.toString()) * 10 ** 9;
    const listingId = Date.now().toString(); // Temporary ID

    const mintKeypair = web3.Keypair.generate();
    const [metadataPDA] = await PublicKey.findProgramAddress(
      [
        Buffer.from("metadata"),
        new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s").toBuffer(),
        mintKeypair.publicKey.toBuffer(),
      ],
      new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s")
    );

    const imageUrl = newListing.image
      ? `https://orange-petite-wolf-341.mypinata.cloud/ipfs/${newListing.image}`
      : "https://arweave.net/abc123";

    // Use sendTransaction instead of signTransaction to get a string signature.
    const mintTx = await program.methods
      .mintNft(newListing.serialNumber || "N/A", newListing.title, imageUrl)
      .accounts({
        mint: mintKeypair.publicKey,
        seller: publicKey,
        metadata: metadataPDA,
        tokenProgram: TOKEN_PROGRAM_ID,
        metadataProgram: new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"),
        systemProgram: web3.SystemProgram.programId,
        rent: web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([mintKeypair])
      .transaction();

    const signature = await sendTransaction(mintTx, connection);
    await connection.confirmTransaction(signature);

    const [escrowPDA] = await PublicKey.findProgramAddress(
      [Buffer.from("escrow"), publicKey.toBuffer(), Buffer.from(listingId)],
      PROGRAM_ID
    );

    const escrowTx = await program.methods
      .createEscrow(listingId, priceLamports)
      .accounts({
        escrow: escrowPDA,
        seller: publicKey,
        systemProgram: web3.SystemProgram.programId,
      })
      .transaction();

    const escrowSig = await sendTransaction(escrowTx, connection);
    await connection.confirmTransaction(escrowSig);

    setListings((prev) => [
      ...prev,
      { ...newListing, id: listingId, priceSol: newListing.priceSol, owner: publicKey.toBase58() },
    ]);
  };

  const commitToBuy = async (listingId: string) => {
    if (!publicKey) {
      alert("Please connect your wallet.");
      return;
    }
    const [escrowPDA] = await PublicKey.findProgramAddress(
      [Buffer.from("escrow"), publicKey.toBuffer(), Buffer.from(listingId)],
      PROGRAM_ID
    );

    const tx = await program.methods
      .commitToBuy()
      .accounts({
        escrow: escrowPDA,
        buyer: publicKey,
        systemProgram: web3.SystemProgram.programId,
      })
      .transaction();

    const signature = await sendTransaction(tx, connection);
    await connection.confirmTransaction(signature);
  };

  const settleEscrow = async (listingId: string) => {
    if (!publicKey) {
      alert("Please connect your wallet.");
      return;
    }
    const [escrowPDA] = await PublicKey.findProgramAddress(
      [Buffer.from("escrow"), publicKey.toBuffer(), Buffer.from(listingId)],
      PROGRAM_ID
    );

    const tx = await program.methods
      .settleEscrow()
      .accounts({
        escrow: escrowPDA,
        seller: publicKey,
        buyer: publicKey, // Replace with buyer's public key if needed
      })
      .transaction();

    const signature = await sendTransaction(tx, connection);
    await connection.confirmTransaction(signature);
  };

  return (
    <ListingsContext.Provider value={{ listings, setListings, addListing, commitToBuy, settleEscrow }}>
      {children}
    </ListingsContext.Provider>
  );
};
