import {InjectionToken} from '@angular/core';
import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  IChartApi,
  ISeriesApi,
  UTCTimestamp,
  createChart,
} from 'lightweight-charts';

import {Candle} from '../core/ohlc';
import {ChartKind} from '../core/layout';

/** Colours the chart needs, read from the CSS tokens of the active theme. */
export interface ChartColors {
  readonly up: string;
  readonly down: string;
  readonly accent: string;
  readonly line: string;
  readonly muted: string;
}

/** What the chart panel needs from a chart library: nothing more. */
export interface ChartHandle {
  /** Draws candles or an area of closes. */
  setData(candles: readonly Candle[], kind: ChartKind): void;
  /** Repaints with new theme colours. */
  applyTheme(colors: ChartColors): void;
  /** Scrolls to the newest bar. */
  follow(): void;
  /** Releases the canvas and listeners. */
  destroy(): void;
}

/** Creates a chart inside an element. */
export type ChartFactory = (
  el: HTMLElement,
  colors: ChartColors
) => ChartHandle;

/**
 * Reads the theme colours from the element's computed CSS variables.
 *
 * @param el Any element inside the themed document.
 * @return Resolved colours.
 */
export function readColors(el: HTMLElement): ChartColors {
  const style = getComputedStyle(el);
  const get = (name: string, fallback: string): string =>
    style.getPropertyValue(name).trim() || fallback;
  return {
    up: get('--up', '#2ee6a6'),
    down: get('--down', '#ff5470'),
    accent: get('--accent', '#5b8cff'),
    line: get('--line', '#1c2533'),
    muted: get('--muted', '#7b8798'),
  };
}

/** Production factory: TradingView Lightweight Charts v5. */
export const lightweightChartFactory: ChartFactory = (el, colors) => {
  const chart: IChartApi = createChart(el, {
    autoSize: true,
    layout: {
      background: {type: ColorType.Solid, color: 'transparent'},
      textColor: colors.muted,
      fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
      fontSize: 11,
      attributionLogo: false,
    },
    grid: {vertLines: {color: colors.line}, horzLines: {color: colors.line}},
    rightPriceScale: {borderColor: colors.line},
    timeScale: {
      borderColor: colors.line,
      timeVisible: true,
      secondsVisible: true,
      barSpacing: 9,
      maxBarSpacing: 14,
      rightOffset: 4,
    },
    crosshair: {mode: CrosshairMode.Normal},
  });
  let kind: ChartKind | null = null;
  let series: ISeriesApi<'Candlestick'> | ISeriesApi<'Area'> | null = null;
  let current = colors;

  const build = (next: ChartKind): void => {
    if (series) {
      chart.removeSeries(series);
    }
    series =
      next === 'candles'
        ? chart.addSeries(CandlestickSeries, {
            upColor: current.up,
            downColor: current.down,
            wickUpColor: current.up,
            wickDownColor: current.down,
            borderVisible: false,
          })
        : chart.addSeries(AreaSeries, {
            lineColor: current.accent,
            topColor: current.accent + '55',
            bottomColor: 'transparent',
            lineWidth: 2,
          });
    kind = next;
  };

  return {
    setData(candles, next) {
      if (kind !== next) {
        build(next);
      }
      if (next === 'candles') {
        (series as ISeriesApi<'Candlestick'>).setData(
          candles.map(c => ({...c, time: c.time as UTCTimestamp}))
        );
      } else {
        (series as ISeriesApi<'Area'>).setData(
          candles.map(c => ({time: c.time as UTCTimestamp, value: c.close}))
        );
      }
    },
    applyTheme(next) {
      current = next;
      chart.applyOptions({
        layout: {textColor: next.muted},
        grid: {vertLines: {color: next.line}, horzLines: {color: next.line}},
        rightPriceScale: {borderColor: next.line},
        timeScale: {borderColor: next.line},
      });
      // Series colours are series options: drop the series, the next setData rebuilds it.
      if (series) {
        chart.removeSeries(series);
        series = null;
      }
      kind = null;
    },
    follow() {
      chart.timeScale().scrollToRealTime();
    },
    destroy() {
      chart.remove();
    },
  };
};

/** Injection seam: tests swap in a fake that records calls. */
export const CHART_FACTORY = new InjectionToken<ChartFactory>('CHART_FACTORY', {
  providedIn: 'root',
  factory: () => lightweightChartFactory,
});
