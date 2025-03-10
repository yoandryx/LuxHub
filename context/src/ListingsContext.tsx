import { createContext, useState, ReactNode, useContext } from "react";
import { PublicKey, Connection } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";
import { Program, AnchorProvider, web3 } from "@project-serum/anchor";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import * as IDL from "../../luxury-marketplace/target/idl/luxury_marketplace.json"; // Adjust this path

const PROGRAM_ID = new PublicKey("bVwtqr5iYzMPhiJWLsRFRre2QjjSjR6v7ksN2Z2ZzHY");

interface Listing {
  id: string;
  title: string;
  description: string;
  priceSol: number;
  serialNumber: string;
  owner: string;
  image?: string;  // Make 'image' optional
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
  const wallet = useWallet();
  const [listings, setListings] = useState<Listing[]>([]);

  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const provider = new AnchorProvider(connection, wallet as any, {});
  const program = new Program(IDL as any, PROGRAM_ID, provider);

  const addListing = async (newListing: Listing) => {

    if (!wallet || !wallet.publicKey || !wallet.signTransaction) {
      alert("Please connect your wallet.");
      return;
    }

    console.log("Wallet:", wallet);
    console.log("Public Key:", wallet.publicKey?.toBase58());


    const priceLamports = parseFloat(newListing.priceSol.toString()) * 10 ** 9;
    const listingId = Date.now().toString(); // Temp ID

    const mintKeypair = web3.Keypair.generate();
    const [metadataPDA] = await PublicKey.findProgramAddress(
      [
        Buffer.from("metadata"),
        new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s").toBuffer(),
        mintKeypair.publicKey.toBuffer(),
      ],
      new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s") // Metaplex program ID
    );

    const mintTx = await program.methods
      .mintNft(newListing.serialNumber || "N/A", newListing.title, "https://arweave.net/abc123")
      .accounts({
        mint: mintKeypair.publicKey,
        seller: wallet.publicKey,
        metadata: metadataPDA,
        tokenProgram: TOKEN_PROGRAM_ID,
        metadataProgram: new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"),
        systemProgram: web3.SystemProgram.programId,
        rent: web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([mintKeypair])
      .transaction();

    const signature = await wallet.sendTransaction(mintTx, connection);
    await connection.confirmTransaction(signature);

    const [escrowPDA] = await PublicKey.findProgramAddress(
      [Buffer.from("escrow"), wallet.publicKey.toBuffer(), Buffer.from(listingId)],
      PROGRAM_ID
    );

    const escrowTx = await program.methods
      .createEscrow(listingId, priceLamports)
      .accounts({
        escrow: escrowPDA,
        seller: wallet.publicKey,
        systemProgram: web3.SystemProgram.programId,
      })
      .transaction();

    const escrowSig = await wallet.sendTransaction(escrowTx, connection);
    await connection.confirmTransaction(escrowSig);

    setListings((prev) => [
      ...prev,
      { ...newListing, id: listingId, priceSol: newListing.priceSol, owner: wallet.publicKey!.toBase58() },
    ]);
  };

  const commitToBuy = async (listingId: string) => {
    if (!wallet.publicKey) {
      alert("Please connect your wallet.");
      return;
    }

    const [escrowPDA] = await PublicKey.findProgramAddress(
      [Buffer.from("escrow"), wallet.publicKey.toBuffer(), Buffer.from(listingId)],
      PROGRAM_ID
    );

    const tx = await program.methods
      .commitToBuy()
      .accounts({
        escrow: escrowPDA,
        buyer: wallet.publicKey,
        systemProgram: web3.SystemProgram.programId,
      })
      .transaction();

    const signature = await wallet.sendTransaction(tx, connection);
    await connection.confirmTransaction(signature);
  };

  const settleEscrow = async (listingId: string) => {
    if (!wallet.publicKey) {
      alert("Please connect your wallet.");
      return;
    }

    const [escrowPDA] = await PublicKey.findProgramAddress(
      [Buffer.from("escrow"), wallet.publicKey!.toBuffer(), Buffer.from(listingId)],
      PROGRAM_ID
    );

    const tx = await program.methods
      .settleEscrow()
      .accounts({
        escrow: escrowPDA,
        seller: wallet.publicKey,
        buyer: wallet.publicKey!, // Replace with buyer's public key in a real case
      })
      .transaction();

    const signature = await wallet.sendTransaction(tx, connection);
    await connection.confirmTransaction(signature);
  };

  return (
    <ListingsContext.Provider value={{ listings, setListings, addListing, commitToBuy, settleEscrow }}>
      {children}
    </ListingsContext.Provider>
  );
};
