---
phase: 03
slug: marketplace-ux
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-21
nyquist_justification: "CSS-heavy UI phase — all tasks include grep/typecheck automated commands as sampling. Visual verification covered by Plan 04 human checkpoint. No unit test infrastructure needed for CSS/layout changes."
---

# Phase 03 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x |
| **Config file** | jest.config.js |
| **Quick run command** | `npm test -- --testPathPattern="marketplace-ux"` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --testPathPattern="marketplace-ux"`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | UX-02 | grep+file | `grep -c "Unworn" src/lib/models/Assets.ts && test -f scripts/migrate-condition-enum.js` | N/A | pending |
| 03-01-02 | 01 | 1 | UX-04 | grep+typecheck | `grep "PriceRangeSlider" src/pages/marketplace.tsx && npm run typecheck` | N/A | pending |
| 03-02-01 | 02 | 1 | UX-01 | grep+file | `grep "useEmblaCarousel" src/components/marketplace/ImageGallery.tsx && grep "Escape" src/components/marketplace/ImageLightbox.tsx` | N/A | pending |
| 03-02-02 | 02 | 1 | UX-01, UX-03 | grep+typecheck | `grep "ImageGallery" src/components/marketplace/NftDetailCard.tsx && grep -c "searchQuery" src/pages/marketplace.tsx && npm run typecheck` | N/A | pending |
| 03-03-01 | 03 | 2 | UX-01 | grep+file | `grep "SortableContext" src/components/common/ImageUploadZone.tsx && grep "@dnd-kit/core" package.json` | N/A | pending |
| 03-03-02 | 03 | 2 | UX-01 | grep+typecheck | `grep "ImageUploadZone" src/pages/createNFT.tsx && npm run typecheck` | N/A | pending |
| 03-04-01 | 04 | 3 | UX-05, UX-06 | grep+file | `test -f src/components/marketplace/FilterDrawer.tsx && grep "modalSlideUpMobile" src/styles/MakeOfferModal.module.css && grep "FilterDrawer" src/pages/marketplace.tsx` | N/A | pending |
| 03-04-02 | 04 | 3 | UX-06 | grep+typecheck | `grep "max-width: 600px" src/styles/MyOrders.module.css && grep "max-width: 600px" src/styles/VendorDashboard.module.css && npm run typecheck` | N/A | pending |
| 03-04-03 | 04 | 3 | UX-05, UX-06 | visual/manual | Browser: mobile verification at 393px and 768px viewports | N/A | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- Existing infrastructure covers all phase requirements
- Phase is primarily UI/visual — most verification is manual browser testing
- All automated verification uses grep checks for correct patterns and typecheck for type safety
- No additional test scaffolding needed

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Multi-image gallery displays 5+ photos | UX-01 | Visual layout, carousel behavior | Open listing detail with 5+ images, verify hero+thumbnails on desktop, swipeable carousel on mobile |
| Condition grade dropdown shows 5 grades | UX-02 | Form interaction | Open createNFT form, verify dropdown has Unworn/Excellent/Very Good/Good/Fair only |
| Price range slider filters listings | UX-04 | Interactive UI | Set min/max price, verify listing count updates |
| BuyModal bottom sheet on mobile | UX-05 | Responsive behavior | Open BuyModal at 600px viewport, verify slide-up animation |
| FilterDrawer slides in on mobile | UX-06 | Responsive behavior | Open FilterDrawer at 600px viewport, verify glass-morphism slide-in |
| Marketplace responsive layout | UX-06 | Layout responsiveness | Resize to 600px and 900px, verify single/two column layouts |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify commands (grep/typecheck sampling)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (none needed — existing infrastructure sufficient)
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved — CSS-heavy phase with grep/typecheck sampling + human checkpoint
