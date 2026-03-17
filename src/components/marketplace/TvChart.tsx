import React, { memo, useRef, useEffect, useCallback, useState } from 'react';

type ChartType = 'area' | 'candlestick' | 'line';
type TimeFrame = '1m' | '5m' | '15m' | '1h' | '4h' | '1D';
type DataMode = 'mcap' | 'price';

interface TvChartProps {
  data: number[];
  chartType?: ChartType;
  interactive?: boolean;
  showTimeframes?: boolean;
  showToolbar?: boolean;
  totalSupply?: number; // Token total supply — used to derive market cap from price
  defaultDataMode?: DataMode; // 'mcap' (default) or 'price'
  onTimeframeChange?: (tf: TimeFrame) => void;
}

const TIMEFRAME_INTERVALS: Record<TimeFrame, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 14400,
  '1D': 86400,
};

const TvChart = memo(
  ({
    data,
    chartType: initialChartType = 'area',
    interactive = false,
    showTimeframes = false,
    showToolbar = false,
    totalSupply = 1_000_000_000,
    defaultDataMode = 'mcap',
    onTimeframeChange,
  }: TvChartProps) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<any>(null);
    const roRef = useRef<ResizeObserver | null>(null);
    const [activeTimeframe, setActiveTimeframe] = useState<TimeFrame>('1m');
    const [activeChartType, setActiveChartType] = useState<ChartType>(initialChartType);
    const [dataMode, setDataMode] = useState<DataMode>(defaultDataMode);

    // Transform price data to market cap if needed
    const chartData = dataMode === 'mcap' && totalSupply > 0
      ? data.map((p) => p * totalSupply)
      : data;

    const chartType = showToolbar ? activeChartType : initialChartType;

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

    const handleTimeframeClick = useCallback(
      (tf: TimeFrame) => {
        setActiveTimeframe(tf);
        onTimeframeChange?.(tf);
      },
      [onTimeframeChange]
    );

    useEffect(() => {
      const el = containerRef.current;
      if (!el || chartData.length < 2) return;

      const timer = setTimeout(() => {
        if (!el || el.clientWidth === 0 || el.clientHeight === 0) return;

        import('lightweight-charts').then((lc) => {
          if (!el) return;
          cleanup();

          const isUp = chartData[chartData.length - 1] >= chartData[0];

          // Standard trading colors
          const green = '#26a69a';
          const red = '#ef5350';
          const lineColor = isUp ? green : red;

          const chart = lc.createChart(el, {
            width: el.clientWidth,
            height: el.clientHeight,
            layout: {
              background: { type: lc.ColorType.Solid, color: 'transparent' },
              textColor: '#9ca3af',
              fontSize: 11,
              fontFamily:
                '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            },
            grid: {
              vertLines: { color: 'rgba(255,255,255,0.04)' },
              horzLines: { color: 'rgba(255,255,255,0.04)' },
            },
            crosshair: {
              mode: interactive ? 0 : 1,
              vertLine: {
                color: 'rgba(255,255,255,0.3)',
                width: 1,
                style: 3, // Dashed
                labelVisible: interactive,
                labelBackgroundColor: '#1e1e2e',
              },
              horzLine: {
                color: 'rgba(255,255,255,0.3)',
                width: 1,
                style: 3,
                labelVisible: true,
                labelBackgroundColor: '#1e1e2e',
              },
            },
            rightPriceScale: {
              borderVisible: false,
              scaleMargins: {
                top: chartType === 'candlestick' ? 0.1 : 0.08,
                bottom: chartType === 'candlestick' ? 0.2 : 0.04,
              },
              entireTextOnly: true,
            },
            timeScale: {
              borderVisible: false,
              visible: interactive || showTimeframes,
              timeVisible: true,
              secondsVisible: false,
              rightOffset: 5,
              barSpacing: interactive ? 8 : 6,
              fixLeftEdge: true,
              fixRightEdge: true,
            },
            handleScale: interactive,
            handleScroll: interactive,
            localization: {
              priceFormatter: (price: number) => {
                if (dataMode === 'mcap') {
                  if (price >= 1_000_000) return '$' + (price / 1_000_000).toFixed(2) + 'M';
                  if (price >= 1_000) return '$' + (price / 1_000).toFixed(1) + 'K';
                  return '$' + price.toFixed(2);
                }
                if (price < 0.0001) return price.toFixed(10);
                if (price < 0.01) return price.toFixed(8);
                if (price < 1) return price.toFixed(6);
                return '$' + price.toFixed(2);
              },
            },
          });

          const now = Math.floor(Date.now() / 1000);
          const interval = TIMEFRAME_INTERVALS[activeTimeframe];

          if (chartType === 'candlestick') {
            const series = chart.addSeries(lc.CandlestickSeries, {
              upColor: green,
              downColor: red,
              borderUpColor: green,
              borderDownColor: red,
              wickUpColor: green,
              wickDownColor: red,
              priceLineVisible: true,
              priceLineColor: 'rgba(255,255,255,0.15)',
              priceLineStyle: 2,
              lastValueVisible: true,
            });

            const ohlc = chartData.map((close, i) => {
              const open = i > 0 ? chartData[i - 1] : close;
              const bodySize = Math.abs(close - open);
              const wickRange = bodySize * 0.8 + close * 0.005;
              const high = Math.max(open, close) + Math.random() * wickRange;
              const low = Math.min(open, close) - Math.random() * wickRange;
              return {
                time: (now - (chartData.length - 1 - i) * interval) as any,
                open,
                high: Math.max(high, open, close),
                low: Math.min(low, open, close),
                close,
              };
            });
            series.setData(ohlc);

            // Volume histogram
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
                color:
                  c.close >= c.open
                    ? 'rgba(38,166,154,0.25)'
                    : 'rgba(239,83,80,0.25)',
              }))
            );
          } else if (chartType === 'line') {
            const series = chart.addSeries(lc.LineSeries, {
              color: lineColor,
              lineWidth: 2,
              priceLineVisible: true,
              priceLineColor: 'rgba(255,255,255,0.1)',
              priceLineStyle: 2,
              lastValueVisible: true,
              crosshairMarkerVisible: true,
              crosshairMarkerRadius: 4,
              crosshairMarkerBorderColor: lineColor,
              crosshairMarkerBackgroundColor: '#0a0a0f',
            });

            series.setData(
              chartData.map((value, i) => ({
                time: (now - (chartData.length - 1 - i) * interval) as any,
                value,
              }))
            );
          } else {
            // Area chart
            const series = chart.addSeries(lc.AreaSeries, {
              lineColor,
              topColor: isUp
                ? 'rgba(38,166,154,0.28)'
                : 'rgba(239,83,80,0.28)',
              bottomColor: 'transparent',
              lineWidth: 2,
              priceLineVisible: true,
              priceLineColor: 'rgba(255,255,255,0.1)',
              priceLineStyle: 2,
              lastValueVisible: true,
              crosshairMarkerVisible: true,
              crosshairMarkerRadius: 5,
              crosshairMarkerBorderWidth: 2,
              crosshairMarkerBorderColor: lineColor,
              crosshairMarkerBackgroundColor: '#0a0a0f',
            });

            series.setData(
              chartData.map((value, i) => ({
                time: (now - (chartData.length - 1 - i) * interval) as any,
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
      }, 50);

      return () => {
        clearTimeout(timer);
        cleanup();
      };
    }, [chartData, chartType, interactive, activeTimeframe, showTimeframes, dataMode, cleanup]);

    const timeframes: TimeFrame[] = ['1m', '5m', '15m', '1h', '4h', '1D'];
    const chartTypes: { type: ChartType; label: string }[] = [
      { type: 'candlestick', label: 'Candles' },
      { type: 'line', label: 'Line' },
      { type: 'area', label: 'Area' },
    ];
    const dataModes: { mode: DataMode; label: string }[] = [
      { mode: 'mcap', label: 'MCap' },
      { mode: 'price', label: 'Price' },
    ];

    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
        {(showTimeframes || showToolbar) && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '2px',
              padding: '4px 8px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              flexShrink: 0,
            }}
          >
            {showTimeframes &&
              timeframes.map((tf) => (
                <button
                  key={tf}
                  onClick={() => handleTimeframeClick(tf)}
                  style={{
                    background:
                      activeTimeframe === tf
                        ? 'rgba(200,161,255,0.15)'
                        : 'transparent',
                    color: activeTimeframe === tf ? '#c8a1ff' : '#6b7280',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '3px 8px',
                    fontSize: '11px',
                    fontWeight: activeTimeframe === tf ? 600 : 400,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  {tf}
                </button>
              ))}
            {showTimeframes && showToolbar && (
              <div
                style={{
                  width: '1px',
                  height: '16px',
                  background: 'rgba(255,255,255,0.1)',
                  margin: '0 6px',
                }}
              />
            )}
            {showToolbar &&
              chartTypes.map((ct) => (
                <button
                  key={ct.type}
                  onClick={() => setActiveChartType(ct.type)}
                  style={{
                    background:
                      activeChartType === ct.type
                        ? 'rgba(200,161,255,0.15)'
                        : 'transparent',
                    color:
                      activeChartType === ct.type ? '#c8a1ff' : '#6b7280',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '3px 8px',
                    fontSize: '11px',
                    fontWeight: activeChartType === ct.type ? 600 : 400,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  {ct.label}
                </button>
              ))}
            {showToolbar && (
              <>
                <div
                  style={{
                    width: '1px',
                    height: '16px',
                    background: 'rgba(255,255,255,0.1)',
                    margin: '0 6px',
                  }}
                />
                {dataModes.map((dm) => (
                  <button
                    key={dm.mode}
                    onClick={() => setDataMode(dm.mode)}
                    style={{
                      background:
                        dataMode === dm.mode
                          ? 'rgba(200,161,255,0.15)'
                          : 'transparent',
                      color: dataMode === dm.mode ? '#c8a1ff' : '#6b7280',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '3px 8px',
                      fontSize: '11px',
                      fontWeight: dataMode === dm.mode ? 600 : 400,
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    {dm.label}
                  </button>
                ))}
              </>
            )}
          </div>
        )}
        <div
          ref={containerRef}
          style={{ width: '100%', flex: 1, minHeight: '120px' }}
        />
      </div>
    );
  }
);
TvChart.displayName = 'TvChart';

export default TvChart;

export function generatePriceHistory(
  basePrice: number,
  points: number = 50
): number[] {
  if (basePrice <= 0) basePrice = 0.001;
  const prices: number[] = [basePrice];
  for (let i = 1; i < points; i++) {
    const volatility = basePrice * 0.03;
    const drift = basePrice * 0.002;
    const noise = (Math.random() - 0.48) * volatility;
    const next = prices[i - 1] + drift + noise;
    prices.push(Math.max(basePrice * 0.5, next));
  }
  return prices;
}
