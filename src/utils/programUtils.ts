import { Program, Idl, AnchorProvider } from "@coral-xyz/anchor";
import { Connection } from "@solana/web3.js";
import idl from "../../Solana-Anchor/target/idl/anchor_escrow.json";
import { WalletContextState } from "@solana/wallet-adapter-react";

/**
 * Returns a properly initialized Anchor `Program` instance.
 * No `programId` is required for this constructor.
 *
 * @param wallet - The connected Solana wallet from useWallet()
 * @returns The Anchor `Program` instance.
 */

export type Listing = {
  pubkey: string;
  initializer: string;
  nftMint: string;
  price: number;
  status: string;
};
  
export const getProgram = (wallet: WalletContextState): Program<Idl> => {
  if (!wallet || !wallet.publicKey) {
    throw new Error("❌ Wallet is not connected.");
  }
  
  const connection = new Connection("https://api.devnet.solana.com");
  const anchorWallet = {
    publicKey: wallet.publicKey,
    signTransaction: wallet.signTransaction || (async (tx) => tx),
    signAllTransactions: wallet.signAllTransactions || (async (txs) => txs),
  };
  
  const provider = new AnchorProvider(connection, anchorWallet as any, {});
  return new Program(idl as Idl, provider);
};
  
