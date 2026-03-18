# Pitfalls Research

**Domain:** RWA luxury asset marketplace on Solana (devnet to mainnet migration with physical goods escrow)
**Researched:** 2026-03-18
**Confidence:** HIGH (based on codebase audit + domain research + Solana security ecosystem data)

## Critical Pitfalls

### Pitfall 1: Silent Devnet Fallback in Production

**What goes wrong:**
The codebase has 25+ instances of `process.env.NEXT_PUBLIC_SOLANA_ENDPOINT || 'https://api.devnet.solana.com'` as a fallback. If the Vercel environment variable is missing, misconfigured, or temporarily unset during a deploy, the app silently connects to devnet while users think they are on mainnet. Transactions appear to "work" but funds go nowhere real. Worse, `_app.tsx` line 40 hardcodes `WalletAdapterNetwork.Devnet` and line 67 hardcodes `chain: 'devnet'` for mobile wallet adapter.

**Why it happens:**
During development, fallback defaults are convenient. The pattern `X || devnet` is copy-pasted everywhere rather than centralized. When switching to mainnet, developers update the env var but miss the hardcoded values scattered across 25+ files.

**How to avoid:**
1. Create a single `getConnection()` utility that throws an error if `NEXT_PUBLIC_SOLANA_ENDPOINT` is not set, rather than falling back silently.
2. Replace all 25+ fallback patterns with this centralized function.
3. Make `_app.tsx` network and chain values environment-driven, not hardcoded.
4. Add a build-time check: if `NODE_ENV=production` and endpoint contains "devnet", fail the build.
5. Replace all hardcoded `?cluster=devnet` Solscan/Explorer URLs with a dynamic cluster parameter.

**Warning signs:**
- Explorer links in production UI showing `?cluster=devnet`
- Transactions not appearing on mainnet Solscan
- "Transaction not found" errors after purchase
- Users reporting 0 SOL balance when they have mainnet funds

**Phase to address:**
Pre-launch hardening (before any real money touches the system). This is the single highest-risk item -- every file listed in the grep results must be audited.

---

### Pitfall 2: Transaction Verification Insufficient for Real Money

**What goes wrong:**
The current `txVerification.ts` checks: (1) transaction exists, (2) transaction succeeded, (3) wallet is in account keys. It does NOT verify: the correct program was called, the correct amount was transferred, the correct escrow PDA was funded, or the correct token mint (USDC) was used. An attacker could submit any successful transaction signature involving their wallet and the server would mark the escrow as "funded."

**Why it happens:**
On devnet with test wallets, transaction replay and amount verification feel unnecessary. The verification was built for "does the chain agree this happened" rather than "does the chain agree the exact right thing happened."

**How to avoid:**
1. Parse the transaction's inner instructions to verify the SPL token transfer.
2. Confirm the transfer destination is the escrow PDA's USDC vault.
3. Confirm the transfer amount matches the expected sale price.
4. Confirm the token mint is mainnet USDC (`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`).
5. Add a nonce or unique identifier to prevent transaction signature replay (same txSignature used for two different escrows).
6. Store processed txSignatures in MongoDB to prevent replay.

**Warning signs:**
- Escrow marked as "funded" but vault balance is 0
- Multiple escrows referencing the same txSignature
- Escrow funded with wrong token (SOL instead of USDC, or devnet USDC)

**Phase to address:**
Pre-launch security hardening. Must be resolved before first real purchase.

---

### Pitfall 3: Program Deployed to Mainnet Without Audit

**What goes wrong:**
The Anchor program handles real USDC custody (escrow vaults hold buyer funds until delivery confirmation). An unaudited program with a vulnerability in `confirm_delivery`, `exchange`, or `refund_buyer` could result in: funds locked permanently, unauthorized fund withdrawal, NFT theft, or fee calculation exploits. Sec3's 2025 Solana security report found an average of 10 vulnerabilities per audit, with 85.5% being business logic, permissions, or validation errors -- exactly the categories that apply to escrow programs.

**Why it happens:**
Audits cost $15K-$100K+ and take weeks. Solo developers skip them because of cost and time pressure, especially with a vendor waiting. "It works on devnet" creates false confidence.

**How to avoid:**
1. At minimum, use free/low-cost automated tools: `cargo clippy`, `cargo audit`, and sec3's X-ray scanner.
2. Get a peer review from another Anchor developer (Solana ecosystem Discord, Superteam).
3. For the short term, limit escrow amounts (cap at $5K per escrow initially).
4. Deploy with upgrade authority retained so vulnerabilities can be patched.
5. Budget for a professional audit before scaling past the first 10 watches.
6. The Squads CPI gate on `confirm_delivery` is good -- verify the same pattern exists on `refund_buyer`.

**Warning signs:**
- Stuck escrows that cannot complete or refund
- Fee calculations that leave dust in vaults
- Edge cases in u64 arithmetic (checked_mul/checked_div rounding)

**Phase to address:**
Pre-launch (automated tools) + Post-launch Phase 1 (professional audit before scaling).

---

### Pitfall 4: Physical Asset Custody Gap -- The "Ship and Pray" Problem

**What goes wrong:**
The escrow protects digital funds, but nothing protects the physical asset in transit. Buyer claims "never received" (even if they did), vendor ships an empty box, item is damaged/swapped in transit, or insurance doesn't cover crypto-purchased luxury goods. For a $10K+ watch, the incentive to exploit this gap is enormous.

**Why it happens:**
On-chain escrow solves the digital trust problem elegantly. But the physical-to-digital bridge requires off-chain trust that smart contracts cannot enforce. Most RWA projects focus on the tokenization and ignore the logistics.

**How to avoid:**
1. Require signature-on-delivery with photo verification (EasyPost integration already exists -- enforce it).
2. Require shipping insurance for items above a threshold (e.g., $1K+).
3. Store tracking + delivery confirmation photos in IPFS/Irys as immutable evidence.
4. Implement a mandatory inspection period (48-72 hours after delivery) before auto-confirming.
5. For high-value items ($5K+), require third-party authentication service (Entrupy, WatchCSA) before releasing funds.
6. Build the dispute resolution flow with clear evidence requirements, not just "buyer says vs vendor says."

**Warning signs:**
- Dispute rate above 5% (industry average for luxury e-commerce is 1-2%)
- Multiple disputes from same buyer or against same vendor
- Vendor shipping to addresses different from buyer's registered address

**Phase to address:**
Launch phase -- must be operational before first real shipment. The 7-day SLA dispute system exists but needs the evidence/proof layer.

---

### Pitfall 5: USDC Mint Address Mismatch Between Devnet and Mainnet

**What goes wrong:**
The codebase references `USDC_MINT_DEVNET` (`4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`) and `USDC_MINT_MAINNET` in `squadsTransferService.ts`. If any endpoint, the Anchor program's `mint_a` parameter, or the frontend buy flow uses the wrong USDC mint on mainnet, funds go to wrong token accounts, transactions fail silently, or the escrow initializes with devnet USDC mint (which doesn't exist on mainnet) and becomes permanently stuck.

**Why it happens:**
SPL token mints are just public keys -- there is no on-chain label saying "this is USDC." The program accepts any `mint_a` without validating it's the expected USDC mint. The devnet/mainnet switch changes which mint is "correct."

**How to avoid:**
1. Add a USDC mint validation to the Anchor program's `initialize` instruction (constrain `mint_a` to match a known USDC mint stored in `EscrowConfig`).
2. Or validate USDC mint address server-side before creating escrow proposals.
3. Add integration tests that verify the correct USDC mint is used in each environment.
4. Consider making the accepted payment mint part of `EscrowConfig` so it is set once and validated on-chain.

**Warning signs:**
- Escrow initialization fails with "constraint violated" on mainnet
- Buyer's USDC doesn't match escrow's expected mint
- Token account creation fails because mint doesn't exist on target cluster

**Phase to address:**
Pre-launch hardening -- must verify before first mainnet escrow initialization.

---

### Pitfall 6: Solo Operator Single Point of Failure

**What goes wrong:**
As a solo developer who is also the admin, you are the only person who can: approve vendors, confirm deliveries via Squads, resolve disputes, execute refunds, mint NFTs, and respond to emergencies. If you are unavailable for 24 hours (sick, traveling, internet outage), all escrows are stuck, disputes miss their 7-day SLA, and the vendor cannot get paid.

**Why it happens:**
Solo dev launches are inherently single-threaded. Squads multisig is set up but with only one member, it is not actually a multisig -- it is a single-sig with extra steps.

**How to avoid:**
1. Add at least one trusted co-signer to the Squads multisig (can be JC Gold's owner for vendor-side actions).
2. Implement a dead-man's switch: if admin doesn't respond to a dispute within 5 days, auto-refund the buyer.
3. Set up Sentry + PagerDuty/Opsgenie alerts for critical failures (stuck escrows, failed transactions).
4. Document runbooks for common operations so a trusted person could step in.
5. Consider a "vacation mode" that pauses new listings while you are unavailable.

**Warning signs:**
- Dispute approaching 7-day SLA with no admin action
- Vendor asking "when will my payment be released?" with no response
- Multiple pending Squads proposals with no approvals

**Phase to address:**
Launch phase -- before onboarding the first real vendor. Minimum: add one backup signer and set up monitoring alerts.

---

### Pitfall 7: Anchor Program Upgrade Authority Lost or Mismanaged

**What goes wrong:**
After deploying to mainnet, the upgrade authority controls whether the program can be patched. If it is set to a wallet you lose access to, the program is frozen forever. If it is set to a single hot wallet, an attacker who compromises it can replace the program with a malicious version that drains all escrow vaults.

**Why it happens:**
On devnet, upgrade authority defaults to the deployer wallet. Developers deploy to mainnet with the same pattern and forget to transfer upgrade authority to the Squads multisig.

**How to avoid:**
1. After mainnet deployment, immediately transfer program upgrade authority to the Squads multisig PDA.
2. Verify with `solana program show <program_id>` that upgrade authority is the multisig.
3. Never store the upgrade authority private key on a server or in environment variables.
4. Test the upgrade flow on devnet first: propose upgrade via Squads, approve, execute.

**Warning signs:**
- `solana program show` shows upgrade authority as a single wallet
- No documented process for program upgrades
- Upgrade authority wallet stored in a JSON file on a development machine

**Phase to address:**
Mainnet deployment phase -- must be done as part of the deployment checklist, not after.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Devnet fallback in 25+ files | Development convenience | Silent production failures, real money on wrong network | Never in production -- must be removed before launch |
| JWT auth instead of wallet-only auth | Simpler session management | JWT can be stolen; wallet signatures are unforgeable | MVP only -- migrate critical endpoints to wallet auth |
| MongoDB as source of truth for escrow state | Fast reads, simple queries | MongoDB can desync from on-chain state (network errors, missed webhooks) | Acceptable if periodic on-chain sync job exists |
| Hardcoded Solscan URLs with `?cluster=devnet` | Quick dev feedback | Broken explorer links in production, user confusion | Never in production |
| Single admin wallet for all operations | Fast iteration, no coordination needed | Single point of failure, no accountability trail | Only during private beta with 1 vendor |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Helius RPC | Using public rate-limited endpoint; not handling 429 errors | Use dedicated Helius API key with paid tier; implement exponential backoff; have a fallback RPC (Alchemy/Triton) |
| Jupiter Swap | Using deprecated `quote-api.jup.ag` endpoint | Use `public.jupiterapi.com` (already corrected in codebase per memory) |
| Irys Storage | Uploading to devnet Irys (free) then expecting data on mainnet Irys | Devnet and mainnet Irys are separate networks; metadata uploaded on devnet will NOT be accessible from mainnet Irys. Re-upload or use Arweave gateway URLs which are network-agnostic |
| Bags API | Assuming bonding curve tokens are transferable like normal SPL tokens | Bags tokens on bonding curves have specific lifecycle constraints; test full lifecycle on mainnet before marketing pools |
| EasyPost Shipping | Using test API key in production | EasyPost test keys generate fake tracking numbers that return fake delivery statuses; switch to production key and verify real shipment tracking works |
| Pyth Price Oracle | Hardcoding SOL/USD price feed ID | Pyth feed IDs differ between devnet and mainnet; use environment variable for feed ID |
| Squads Protocol | Testing with 1-of-1 multisig | A 1-of-1 multisig provides no additional security over a single wallet; configure at least 2-of-3 threshold before real funds |
| Resend Email | Not verifying sender domain | Emails from unverified domains go to spam; verify `luxhub.gold` domain in Resend dashboard before launch |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Creating new `Connection` objects per API call | Memory leaks, RPC rate limit exhaustion | Singleton connection pool or reuse connection objects | 50+ concurrent users hitting API routes |
| Fetching all escrows from MongoDB without pagination | Slow admin dashboard, timeouts | Add cursor-based pagination to all list endpoints | 100+ escrows in database |
| DAS API calls on every page load (user profiles) | Slow page loads, Helius rate limits | Cache DAS results with 5-minute TTL in MongoDB or Redis | 20+ profile views per minute |
| On-chain `getProgramAccounts` for marketplace listings | RPC timeout, 413 response body too large | Use Helius DAS `searchAssets` instead; index on-chain state to MongoDB via webhooks | 50+ active escrows |
| No CDN for NFT images (Pinata/Irys gateway direct) | Slow image loads, gateway rate limits | Use Vercel Image Optimization (`next/image`) with Pinata/Arweave as origin | Any scale -- IPFS gateways are slow by default |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| TX signature replay (same sig used for multiple escrows) | Attacker funds one escrow, replays signature to "fund" others | Store processed txSignatures in MongoDB with unique index; reject duplicates |
| No amount verification in tx verification | Attacker sends 0.001 USDC, claims they paid full price | Parse transaction instructions to verify transfer amount matches expected price |
| `ADMIN_WALLETS` env var as only admin gate | Env var misconfiguration grants admin access to wrong wallet | Store admin list in MongoDB with on-chain verification; require wallet signature for admin actions |
| PII encryption key in environment variable | Vercel env var leak exposes all shipping addresses | Rotate encryption key periodically; consider using Vercel's encrypted environment variables feature |
| No CSRF protection on state-changing API routes | Cross-site request forgery on purchase/approve endpoints | Require wallet signature (not just JWT) for all fund-moving and admin operations |
| Explorer links expose internal PDAs | Competitors/attackers can monitor all escrow activity | Not preventable on public blockchain -- but avoid exposing treasury strategy in UI |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Transaction fails with generic "something went wrong" | User doesn't know if money was sent, panics | Parse Solana error codes into human-readable messages; show txSignature with explorer link even on failure |
| No loading states during on-chain transactions | User clicks "Buy" again thinking it didn't work, gets double-charged | Disable button immediately, show step-by-step progress (signing, confirming, verifying) |
| Wallet disconnects mid-transaction | Escrow stuck in partial state | Implement transaction recovery: detect incomplete escrows on page load, offer retry/cancel |
| SOL/USD price changes between "Add to Cart" and "Confirm" | User pays more than expected | Show real-time price with staleness indicator; if price moves more than 2%, require re-confirmation |
| Vendor gets USDC but expected fiat | Vendor doesn't understand crypto, can't cash out | Provide clear payout documentation; consider offering Coinbase Commerce or similar off-ramp guidance for JC Gold |

## "Looks Done But Isn't" Checklist

- [ ] **Escrow flow:** Tested on devnet but `_app.tsx` still hardcodes `WalletAdapterNetwork.Devnet` -- verify network enum is mainnet
- [ ] **USDC payments:** Works with devnet USDC but mainnet USDC mint (`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`) never tested in the program
- [ ] **Squads multisig:** API endpoints exist but Squads multisig on mainnet has 0 SOL and no members beyond deployer
- [ ] **Irys uploads:** Devnet Irys is free; mainnet Irys requires SOL funding -- verify Irys wallet has balance
- [ ] **Dispute system:** 7-day SLA logic exists but no cron job or scheduled function to enforce auto-escalation
- [ ] **Timeout enforcement:** `enforce-timeouts.ts` exists but needs a Vercel cron or external scheduler to actually run
- [ ] **Notifications:** 17 types defined but delivery verified at "every lifecycle step" is still an active TODO
- [ ] **Rate limiting:** Exists on critical endpoints but not on pool fund endpoints (noted in PROJECT.md active items)
- [ ] **Mobile responsive:** Glass-morphism modals may not render correctly on mobile Safari -- test buy/offer flows on iPhone
- [ ] **Error monitoring:** Sentry integration mentioned but `Sentry error monitoring enabled` is still unchecked in active items
- [ ] **Program deploy cost:** Mainnet program deployment costs 2-3 SOL for rent; treasury has 0 SOL on mainnet
- [ ] **EscrowConfig initialization:** Must be called on mainnet with correct treasury, authority (Squads PDA), and fee_bps before any escrow can be created

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Escrow stuck (funds locked, can't confirm) | HIGH | Use Squads to execute `refund_buyer` instruction; if program is bugged, upgrade program via Squads then retry |
| Wrong network (devnet operations in production) | MEDIUM | No real funds lost (devnet), but user trust damaged; communicate transparently, fix env vars, redeploy |
| TX signature replay exploit | HIGH | Immediately pause protocol via `update_config(paused=true)`; audit all escrows for duplicate txSignatures; manually refund affected users |
| Physical item dispute (buyer says not received) | MEDIUM | Check shipping carrier tracking + delivery signature; if inconclusive, default to buyer refund (better to eat the loss than damage reputation) |
| Program upgrade authority compromised | CRITICAL | If upgrade authority is Squads multisig, rotate multisig members immediately; if single wallet, no recovery -- attacker controls program forever |
| MongoDB desynced from on-chain state | LOW | Run sync script (`/api/squads/sync` pattern) to reconcile all escrow PDAs with MongoDB records |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Silent devnet fallback | Pre-launch hardening | `grep -r "devnet" src/` returns 0 hardcoded references; build fails without SOLANA_ENDPOINT |
| TX verification insufficient | Pre-launch security | Unit tests verify amount, mint, and destination checks; replay test confirms rejection |
| No program audit | Pre-launch (automated) + Post-first-10-sales (professional) | `cargo clippy` clean; sec3 X-ray report reviewed; professional audit report received |
| Physical custody gap | Launch phase | Dispute flow tested end-to-end with evidence uploads; insurance requirement documented |
| USDC mint mismatch | Pre-launch hardening | Integration test on mainnet-beta with real USDC mint; escrow config stores accepted mint |
| Solo operator SPOF | Launch phase | Squads shows 2+ members; PagerDuty/Sentry alerting active; dispute auto-escalation works |
| Upgrade authority | Mainnet deployment | `solana program show` confirms Squads PDA as upgrade authority |
| Devnet Irys metadata | Pre-launch hardening | All NFT metadata URLs resolve on mainnet; Arweave gateway used for cross-network access |
| Cron jobs not running | Launch phase | Vercel cron configured; timeout enforcement and dispute escalation execute on schedule |
| Sentry not enabled | Pre-launch hardening | Trigger a test error; verify it appears in Sentry dashboard |
| Treasury unfunded | Mainnet deployment | Treasury has minimum 5 SOL for operations (deploy, initialize_config, partner PDA) |

## Sources

- LuxHub codebase audit (25+ devnet fallback patterns found via grep)
- [Solana Program Security Checklist: 14 Critical Checks Before Mainnet](https://dev.to/ohmygod/solana-program-security-checklist-14-critical-checks-before-you-deploy-to-mainnet-2d66)
- [Top 6 Challenges in RWA Tokenization](https://www.debutinfotech.com/blog/top-rwa-tokenization-challenges)
- [Solana Security Ecosystem Review 2025 | Sec3](https://solanasec25.sec3.dev/) -- 163 audits, 1,669 vulnerabilities analyzed
- [Securing Solana: A Developer's Guide | Cantina](https://cantina.xyz/blog/securing-solana-a-developers-guide)
- [NFT Marketplace Security Best Practices | HackenProof](https://hackenproof.com/blog/for-business/how-to-secure-nft-marketplace)
- [RWA in DeFi: Structured Finance & Risk Mitigation | Aurum Law](https://aurum.law/newsroom/Real-World-Assets-in-DeFi)
- [Solana Program Deploying Docs](https://solana.com/docs/programs/deploying)

---
*Pitfalls research for: RWA luxury asset marketplace on Solana (LuxHub mainnet launch)*
*Researched: 2026-03-18*
