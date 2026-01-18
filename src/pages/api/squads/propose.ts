// src/pages/api/squads/propose.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { Connection, Keypair, PublicKey, TransactionMessage } from '@solana/web3.js';
import * as multisig from '@sqds/multisig';
import { readFileSync } from 'fs';

type IxKey = { pubkey: string; isSigner: boolean; isWritable: boolean };

export const config = {
  runtime: 'nodejs', // ensure we’re not on Edge (fs needed)
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const {
      programId,
      keys,
      dataBase64,
      vaultIndex = 0,
      transactionIndex,
      rpc = process.env.NEXT_PUBLIC_SOLANA_ENDPOINT,
      multisigPda = process.env.NEXT_PUBLIC_SQUADS_MSIG,
    } = req.body as {
      programId?: string;
      keys?: IxKey[];
      dataBase64?: string;
      vaultIndex?: number;
      transactionIndex?: string | number;
      rpc?: string;
      multisigPda?: string;
    };

    if (!programId || !keys || !dataBase64) {
      return res.status(400).json({ error: 'Missing programId, keys, or dataBase64' });
    }
    if (!Array.isArray(keys)) {
      return res.status(400).json({ error: 'keys must be an array' });
    }
    if (!rpc || !multisigPda) {
      return res.status(500).json({ error: 'RPC or MULTISIG env is not set' });
    }
    if (!process.env.SQUADS_MEMBER_KEYPAIR_PATH && !process.env.SQUADS_MEMBER_KEYPAIR_JSON) {
      return res
        .status(500)
        .json({ error: 'Missing SQUADS_MEMBER_KEYPAIR_PATH or SQUADS_MEMBER_KEYPAIR_JSON env' });
    }

    // Load a Squads member keypair (must be a member of the multisig)
    const payer = (() => {
      const path = process.env.SQUADS_MEMBER_KEYPAIR_PATH;
      const json = process.env.SQUADS_MEMBER_KEYPAIR_JSON;
      const secret = path ? JSON.parse(readFileSync(path, 'utf-8')) : JSON.parse(json!);
      return Keypair.fromSecretKey(Uint8Array.from(secret));
    })();

    const connection = new Connection(rpc, 'confirmed');
    const programPk = new PublicKey(programId);
    const msigPk = new PublicKey(multisigPda);

    // Basic existence check on the multisig account
    const msigInfo = await connection.getAccountInfo(msigPk);
    if (!msigInfo) {
      return res
        .status(400)
        .json({ error: `Multisig account ${msigPk.toBase58()} not found on this cluster` });
    }

    const [vaultPda] = multisig.getVaultPda({ multisigPda: msigPk, index: vaultIndex });

    // Build the instruction from the client payload
    const ix = {
      programId: programPk,
      keys: keys.map((k) => ({
        pubkey: new PublicKey(k.pubkey),
        isSigner: k.isSigner,
        isWritable: k.isWritable,
      })),
      data: Buffer.from(dataBase64, 'base64'),
    };

    const { blockhash } = await connection.getLatestBlockhash();

    // IMPORTANT: pass the TransactionMessage (builder), NOT a compiled MessageV0
    const message = new TransactionMessage({
      payerKey: vaultPda, // Squads vault pays fees when executed
      recentBlockhash: blockhash,
      instructions: [ix],
    });

    // Choose a transaction index (unique per (vaultIndex, index))
    let indexBig = BigInt(transactionIndex ?? (await connection.getSlot()));

    const tryCreate = async (idx: bigint) => {
      return multisig.rpc.vaultTransactionCreate({
        connection,
        feePayer: payer, // payer for proposal creation
        multisigPda: msigPk,
        transactionIndex: idx,
        creator: payer.publicKey,
        vaultIndex,
        ephemeralSigners: 0,
        transactionMessage: message, // <-- pass the builder
      });
    };

    try {
      await tryCreate(indexBig);
    } catch (e: any) {
      const msg = String(e?.message ?? '');
      // If the same (vaultIndex, transactionIndex) already exists, bump and retry a few times
      if (/already|exists|duplicate/i.test(msg)) {
        let attempts = 0;
        while (attempts < 5) {
          attempts++;
          indexBig = BigInt(await connection.getSlot()) + BigInt(attempts);
          try {
            await tryCreate(indexBig);
            break;
          } catch (inner: any) {
            if (!/already|exists|duplicate/i.test(String(inner?.message ?? ''))) throw inner;
            if (attempts === 5) throw inner;
          }
        }
      } else {
        throw e;
      }
    }

    // Optional: you could also compute the vault transaction PDA here for deep links
    // const [vaultTxPda] = multisig.getVaultTransactionPda({
    //   multisigPda: msigPk,
    //   index: indexBig,
    //   vaultIndex,
    // });

    return res.status(200).json({
      ok: true,
      multisigPda: msigPk.toBase58(),
      vaultIndex,
      transactionIndex: indexBig.toString(),
      // vaultTransactionPda: vaultTxPda.toBase58(),
    });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: e?.message ?? 'Unknown error' });
  }
}
