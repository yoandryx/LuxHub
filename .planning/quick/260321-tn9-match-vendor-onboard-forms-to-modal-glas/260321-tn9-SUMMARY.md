# Quick Task 260321-tn9: Summary

**Task:** Match vendor onboard forms to modal glass border pattern
**Status:** Complete
**Commit:** f2fdbb9

## Changes Made

**File:** `src/styles/VendorOnboard.module.css` (197 insertions, 72 deletions)

### Inputs (formInput, formTextarea)
- Background: `rgba(20,20,20,0.9)` → `transparent`
- Border: `1px solid var(--border)` → `box-shadow: inset 0 0 0 1px rgba(185,145,255,0.12)`
- Focus: outer glow → inset shadow intensification + subtle outer ring
- Placeholder: `var(--text-muted)` → `rgba(255,255,255,0.2)`

### Buttons (nextButton, submitButton)
- Background: `linear-gradient(135deg, var(--accent), #a855f7)` → `transparent`
- Color: `#000` → `var(--text-primary)`
- Border: none → gradient mask `::before` pseudo-element
- Added `::after` radial glow effect
- Hover: glow intensifies, text becomes `#d4b8ff`

### Back Button
- Border: `1px solid var(--border)` → gradient mask `::before` pseudo-element
- Hover: gradient mask intensifies (matches MakeOfferModal)

### Wizard Card
- Background: gradient → `rgba(8,8,10,0.88)` glass surface
- Border: `1px solid` → gradient mask `::before`
- Added `::after` top radial glow
- Border-radius: 20px → 24px (matches modal)
- Backdrop blur: 40px → 48px

### Other
- Page title: removed shimmer animation, static gradient text
- Labels: 11px/600 weight (matching modal inputLabel)
- Review items, checkbox, profile preview: solid borders → inset box-shadow
- CSS vars: aligned to modal values (text-secondary 65%, text-muted 40%)
