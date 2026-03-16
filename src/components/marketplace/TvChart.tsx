import React, { memo, useRef, useEffect, useCallback } from 'react';

type ChartType = 'area' | 'candlestick' | 'line';

interface TvChartProps {
  data: number[];
  chartType?: ChartType;
  interactive?: boolean;
}

const TvChart = memo(({ data, chartType = 'area', interactive = false }: TvChartProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const roRef = useRef<ResizeObserver | null>(null);

  const cleanup = useCallback(() => {
    if (roRef.current) {
      roRef.current.disconnect();
      roRef.current = null;
    }
    if (chartRef.current) {
      try {
        chartRef.current.remove();
      } catch {
        // chart already removed
      }
      chartRef.current = null;
    }
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || data.length < 2) return;

    // Wait a tick for container to have dimensions
    const timer = setTimeout(() => {
      if (!el || el.clientWidth === 0 || el.clientHeight === 0) return;

      import('lightweight-charts').then((lc) => {
        if (!el) return;

        // Clean previous
        cleanup();

        const isUp = data[data.length - 1] >= data[0];
        const green = '#4ade80';
        const red = '#f87171';
        const lineColor = isUp ? green : red;

        const chart = lc.createChart(el, {
          width: el.clientWidth,
          height: el.clientHeight,
          layout: {
            background: { type: lc.ColorType.Solid, color: 'transparent' },
            textColor: '#d1d5db',
            fontSize: 11,
            fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
          },
          grid: {
            vertLines: { color: 'rgba(255,255,255,0.03)' },
            horzLines: { color: 'rgba(255,255,255,0.05)' },
          },
          crosshair: {
            mode: interactive ? 0 : 1,
            vertLine: {
              color: 'rgba(255,255,255,0.2)',
              width: 1,
              labelVisible: interactive,
              labelBackgroundColor: '#2d2d3d',
            },
            horzLine: {
              color: 'rgba(255,255,255,0.2)',
              width: 1,
              labelVisible: true,
              labelBackgroundColor: '#2d2d3d',
            },
          },
          rightPriceScale: {
            borderVisible: false,
            scaleMargins: { top: 0.08, bottom: 0.04 },
            entireTextOnly: true,
          },
          timeScale: {
            borderVisible: false,
            visible: interactive,
            timeVisible: true,
            secondsVisible: false,
            rightOffset: 3,
            barSpacing: interactive ? 8 : 6,
            fixLeftEdge: true,
            fixRightEdge: true,
          },
          handleScale: interactive,
          handleScroll: interactive,
          localization: {
            priceFormatter: (price: number) =>
              price < 0.01 ? price.toFixed(8) : price < 1 ? price.toFixed(6) : price.toFixed(2),
          },
        });

        // Generate proper time series — each point = 1 minute candle
        const now = Math.floor(Date.now() / 1000);
        const interval = 60; // 1 minute

        if (chartType === 'candlestick') {
          const series = chart.addSeries(lc.CandlestickSeries, {
            upColor: green,
            downColor: red,
            borderUpColor: green,
            borderDownColor: red,
            wickUpColor: green,
            wickDownColor: red,
            priceLineVisible: false,
            lastValueVisible: true,
          });

          const ohlc = data.map((close, i) => {
            const open = i > 0 ? data[i - 1] : close;
            const bodySize = Math.abs(close - open);
            const wickRange = bodySize * 0.8 + close * 0.005;
            const high = Math.max(open, close) + Math.random() * wickRange;
            const low = Math.min(open, close) - Math.random() * wickRange;
            return {
              time: (now - (data.length - 1 - i) * interval) as any,
              open,
              high: Math.max(high, open, close),
              low: Math.min(low, open, close),
              close,
            };
          });
          series.setData(ohlc);

          // Volume histogram below candles (DexScreener style)
          const volSeries = chart.addSeries(lc.HistogramSeries, {
            priceFormat: { type: 'volume' },
            priceScaleId: 'vol',
            lastValueVisible: false,
            priceLineVisible: false,
          });
          chart.priceScale('vol').applyOptions({
            scaleMargins: { top: 0.85, bottom: 0 },
          });
          volSeries.setData(
            ohlc.map((c) => ({
              time: c.time,
              value: Math.random() * 1000 + 100,
              color: c.close >= c.open ? 'rgba(74,222,128,0.2)' : 'rgba(248,113,113,0.2)',
            }))
          );
        } else if (chartType === 'line') {
          const series = chart.addSeries(lc.LineSeries, {
            color: lineColor,
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: true,
            crosshairMarkerVisible: true,
            crosshairMarkerRadius: 4,
            crosshairMarkerBorderColor: lineColor,
            crosshairMarkerBackgroundColor: '#0a0a0f',
          });

          series.setData(
            data.map((value, i) => ({
              time: (now - (data.length - 1 - i) * interval) as any,
              value,
            }))
          );
        } else {
          // Area chart — pump.fun / bags style
          const series = chart.addSeries(lc.AreaSeries, {
            lineColor,
            topColor: isUp ? 'rgba(74,222,128,0.25)' : 'rgba(248,113,113,0.25)',
            bottomColor: 'transparent',
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: true,
            crosshairMarkerVisible: true,
            crosshairMarkerRadius: 5,
            crosshairMarkerBorderWidth: 2,
            crosshairMarkerBorderColor: lineColor,
            crosshairMarkerBackgroundColor: '#0a0a0f',
          });

          series.setData(
            data.map((value, i) => ({
              time: (now - (data.length - 1 - i) * interval) as any,
              value,
            }))
          );
        }

        chart.timeScale().fitContent();
        chartRef.current = chart;

        // Resize observer
        const ro = new ResizeObserver((entries) => {
          if (!chartRef.current) return;
          const { width, height } = entries[0].contentRect;
          if (width > 0 && height > 0) {
            chartRef.current.applyOptions({ width, height });
          }
        });
        ro.observe(el);
        roRef.current = ro;
      });
    }, 50); // small delay for DOM layout

    return () => {
      clearTimeout(timer);
      cleanup();
    };
  }, [data, chartType, interactive, cleanup]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        minHeight: '120px',
      }}
    />
  );
});
TvChart.displayName = 'TvChart';

export default TvChart;

export function generatePriceHistory(basePrice: number, points: number = 50): number[] {
  if (basePrice <= 0) basePrice = 0.001;
  const prices: number[] = [basePrice];
  // Simulate bonding curve — slight upward bias like pump.fun early charts
  for (let i = 1; i < points; i++) {
    const volatility = basePrice * 0.03;
    const drift = basePrice * 0.002; // slight upward bias
    const noise = (Math.random() - 0.48) * volatility;
    const next = prices[i - 1] + drift + noise;
    prices.push(Math.max(basePrice * 0.5, next));
  }
  return prices;
}
