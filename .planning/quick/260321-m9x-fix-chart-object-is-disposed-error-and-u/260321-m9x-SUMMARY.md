---
phase: quick
plan: 260321-m9x
subsystem: ui
tags: [lightweight-charts, css-modules, crosshair, ohlcv, volume, chart]

requires:
  - phase: none
    provides: existing TvChart component and pools page
provides:
  - Unified TvChart with OHLCV crosshair tooltip and volume histogram on all chart types
  - pools.tsx using shared TvChart (no inline duplicate)
  - TvChart.module.css with tooltip and toolbar styles
affects: [pools, pool-detail, any page using TvChart]

tech-stack:
  added: []
  patterns: [crosshair-subscribe-tooltip, volume-histogram-all-chart-types, css-module-toolbar]

key-files:
  created:
    - src/styles/TvChart.module.css
  modified:
    - src/components/marketplace/TvChart.tsx
    - src/pages/pools.tsx

key-decisions:
  - "Volume bars use synthetic data derived from price changes for all chart types"
  - "OHLCV tooltip only shows in interactive mode to avoid clutter on mini-cards"

patterns-established:
  - "Chart crosshair tooltip: subscribe to crosshairMove, store series in refs, render overlay"
  - "Volume histogram on all chart types with shared priceScale 'vol' at bottom 15%"

requirements-completed: [CHART-FIX, CHART-UPGRADE]

duration: 6min
completed: 2026-03-21
---

# Quick Task 260321-m9x: Fix Chart "Object is disposed" and Upgrade TvChart Summary

**Eliminated inline TvChart duplicate from pools.tsx and added DexScreener-style OHLCV crosshair tooltip with volume histogram bars on all chart types**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-21T20:05:26Z
- **Completed:** 2026-03-21T20:11:53Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Removed ~170 lines of duplicated TvChart code from pools.tsx, eliminating the "Object is disposed" error source
- Added floating OHLCV tooltip (O/H/L/C/V for candles, Price/V for line/area) on crosshair hover
- Volume histogram bars now appear beneath all chart types (candlestick, line, area)
- Refactored toolbar from inline styles to CSS module classes

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove inline TvChart duplicate from pools.tsx** - `94d28d8` (feat)
2. **Task 2: Add OHLCV crosshair tooltip, volume bars, and CSS module** - `d018bba` (feat)

## Files Created/Modified
- `src/styles/TvChart.module.css` - New CSS module with tooltip overlay, toolbar button, and divider styles
- `src/components/marketplace/TvChart.tsx` - Added crosshair subscribe for OHLCV tooltip, volume bars on line/area charts, CSS module integration, formatPrice helper
- `src/pages/pools.tsx` - Removed inline TvChart + generatePriceHistory, added import from shared component

## Decisions Made
- Volume bars use synthetic data derived from price changes (`Math.abs(data[i] - data[i-1]) / data[i-1] * 10000`) since real volume data is not yet available from the API
- OHLCV tooltip is only rendered when `interactive` prop is true, keeping mini-card charts clean
- Series references stored in useRef to avoid stale closures in the crosshair callback
- Bottom scale margin increased to 0.2 for all chart types to accommodate volume histogram

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- TvChart component is now the single source of truth for all chart rendering
- Ready for real volume data integration when price-history API returns volume
- PoolDetail modal already uses the shared TvChart and will automatically get the new features

---
*Plan: 260321-m9x*
*Completed: 2026-03-21*
