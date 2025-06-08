const { PublicKey } = require("@solana/web3.js");
const { BN } = require("@coral-xyz/anchor");

const programId = new PublicKey("GRE7cbpBscopx6ygmCvhPqMNEUDWtu9gBVSzNMSPWkLX");
const expectedVault = new PublicKey("EK1rHjGdirRvboAEQJMApoTbLv8e1W7HwnSCEKj3icjk");

(async () => {
  const start = 1747846242000; // May 21, 2025 15:10:42 UTC
  const end = 1747847262000;   // May 21, 2025 15:27:42 UTC
  const step = 1; // 10ms

  console.log(`🔍 Scanning from ${start} to ${end}...`);

  for (let seed = start; seed <= end; seed += step) {
    const [pda] = await PublicKey.findProgramAddress(
      [Buffer.from("state"), new BN(seed).toArrayLike(Buffer, "le", 8)],
      programId
    );

    if (pda.equals(expectedVault)) {
      console.log(`✅ Found matching seed: ${seed}`);
      return;
    }
  }

  console.log("❌ No matching seed found in that earlier range.");
})();
