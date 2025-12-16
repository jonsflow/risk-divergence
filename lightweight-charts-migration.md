# Lightweight Charts Migration Plan

## Overview

Convert from raw SVG rendering to [Lightweight Charts](https://tradingview.github.io/lightweight-charts/) (by TradingView) to gain:
- Built-in crosshair with date/price display
- Synchronized crosshairs across all charts
- Better performance and interactivity
- Professional tooltips and hover states
- Built-in zoom and pan
- Responsive handling

## Current Implementation

**File:** `app.js` line 288-366

Current approach:
- Manual SVG string generation in `renderChart()`
- No interactivity (hover, zoom, pan)
- No crosshairs or tooltips
- Custom path calculation and scaling
- Swing high markers rendered as SVG circles and lines

## Migration Steps

### 1. Add Lightweight Charts Library

**Option A: CDN (simplest)**
```html
<!-- Add to index.html before app.js -->
<script src="https://unpkg.com/lightweight-charts/dist/lightweight-charts.standalone.production.js"></script>
```

**Option B: NPM (if using build system)**
```bash
npm install lightweight-charts
```

### 2. Update Chart Container Styling

**Current:** Chart containers have inline height (150px)

**New approach:** Add explicit sizing in `styles.css`
```css
.chart-container > div {
  position: relative;
  width: 100%;
  height: 150px;
}
```

### 3. Refactor renderChart() Function

**Current signature:**
```javascript
function renderChart(containerId, points, color, label, swingHighs)
```

**New implementation:**

```javascript
// Global chart instances for crosshair syncing
const chartInstances = {};

function renderChart(containerId, points, color = "#4a9eff", label = "", swingHighs = null) {
  const container = document.getElementById(containerId);
  if (!container) return;

  // Clear existing chart
  container.innerHTML = '';

  // Create chart
  const chart = LightweightCharts.createChart(container, {
    width: container.clientWidth,
    height: container.clientHeight,
    layout: {
      background: { color: '#0f0f10' },
      textColor: '#a7a7ad',
    },
    grid: {
      vertLines: { color: '#1e222d' },
      horzLines: { color: '#1e222d' },
    },
    crosshair: {
      mode: LightweightCharts.CrosshairMode.Normal,
    },
    timeScale: {
      borderColor: '#333',
      timeVisible: true,
    },
    rightPriceScale: {
      borderColor: '#333',
    },
  });

  // Add line series
  const lineSeries = chart.addLineSeries({
    color: color,
    lineWidth: 2,
  });

  // Convert data format: [timestamp, price] -> {time: seconds, value: price}
  const chartData = points.map(p => ({
    time: p[0], // Unix timestamp in seconds
    value: p[1]
  }));

  lineSeries.setData(chartData);

  // Add swing high markers
  if (swingHighs && swingHighs.length > 0) {
    const markers = swingHighs.map(high => ({
      time: high.time,
      position: 'aboveBar',
      color: '#ffd700',
      shape: 'circle',
      text: '', // Could add price here if desired
    }));
    lineSeries.setMarkers(markers);

    // Draw trend line between swing highs (if 2+ exist)
    if (swingHighs.length >= 2) {
      const trendLineSeries = chart.addLineSeries({
        color: '#ffd700',
        lineWidth: 2,
        lineStyle: LightweightCharts.LineStyle.Dashed,
        priceLineVisible: false,
        lastValueVisible: false,
      });

      const trendData = swingHighs.slice(-2).map(high => ({
        time: high.time,
        value: high.price
      }));

      trendLineSeries.setData(trendData);
    }
  }

  // Store chart instance for syncing
  chartInstances[containerId] = chart;

  // Handle resize
  const resizeObserver = new ResizeObserver(entries => {
    if (entries.length === 0 || entries[0].target !== container) return;
    const { width, height } = entries[0].contentRect;
    chart.applyOptions({ width, height });
  });
  resizeObserver.observe(container);

  return chart;
}
```

### 4. Implement Synced Crosshairs

Add this after all charts are rendered:

```javascript
function setupSyncedCrosshairs() {
  const chartIds = Object.keys(chartInstances);

  chartIds.forEach(chartId => {
    const chart = chartInstances[chartId];

    chart.subscribeCrosshairMove(param => {
      if (param === undefined || param.time === undefined) {
        // Mouse left the chart - clear all crosshairs
        chartIds.forEach(id => {
          if (id !== chartId) {
            chartInstances[id].clearCrosshairPosition();
          }
        });
        return;
      }

      // Sync crosshair to same timestamp on all other charts
      const targetTime = param.time;

      chartIds.forEach(id => {
        if (id !== chartId) {
          chartInstances[id].setCrosshairPosition(
            param.point?.y || 0,
            targetTime,
            chartInstances[id].series()[0] // First series
          );
        }
      });
    });
  });
}

// Call after analyzeAndRender() completes
function analyzeAndRender() {
  // ... existing code ...

  // Analyze each pair
  analyzePair("spy-hyg", "SPY", "HYG", "#4a9eff", "#ff6b6b");
  analyzePair("qqq-tlt", "QQQ", "TLT", "#10b981", "#f59e0b");
  analyzePair("spy-gld", "SPY", "GLD", "#4a9eff", "#fbbf24");
  analyzePair("spy-iwm", "SPY", "IWM", "#4a9eff", "#8b5cf6");

  // Setup synced crosshairs after all charts rendered
  setupSyncedCrosshairs();
}
```

### 5. Update analyzePair() Function

No major changes needed - `renderChart()` signature stays the same, but now returns a chart instance instead of rendering SVG.

### 6. Custom Tooltip (Optional Enhancement)

Lightweight Charts has built-in crosshair labels, but for custom tooltips:

```javascript
function createTooltip(chart, series, containerId) {
  const tooltip = document.createElement('div');
  tooltip.style.cssText = `
    position: absolute;
    display: none;
    padding: 8px;
    background: rgba(23, 24, 27, 0.95);
    color: #e9e9ea;
    border: 1px solid #333;
    border-radius: 4px;
    font-size: 12px;
    z-index: 1000;
    pointer-events: none;
  `;
  document.getElementById(containerId).appendChild(tooltip);

  chart.subscribeCrosshairMove(param => {
    if (!param || !param.time || !param.seriesData.get(series)) {
      tooltip.style.display = 'none';
      return;
    }

    const data = param.seriesData.get(series);
    const date = new Date(param.time * 1000).toISOString().slice(0, 10);
    const price = data.value.toFixed(2);

    tooltip.style.display = 'block';
    tooltip.innerHTML = `${date}<br>$${price}`;
    tooltip.style.left = param.point.x + 10 + 'px';
    tooltip.style.top = param.point.y - 30 + 'px';
  });
}
```

## Data Format Changes

**Current:** `[timestamp, price]` arrays
**Lightweight Charts:** Objects with `{time: number, value: number}`

Conversion is simple:
```javascript
const chartData = points.map(p => ({ time: p[0], value: p[1] }));
```

## Features Gained

✅ **Crosshair** - Built-in with date/price display
✅ **Synced crosshairs** - Across all 12 charts simultaneously
✅ **Zoom & Pan** - Mouse wheel zoom, drag to pan
✅ **Responsive** - Auto-resize handling
✅ **Performance** - Canvas-based rendering (faster than SVG)
✅ **Touch support** - Works on mobile
✅ **Professional styling** - Matches TradingView appearance
✅ **Markers** - Built-in support for swing high dots
✅ **Multiple series** - Easy to add trend lines, overlays

## Potential Issues

1. **Bundle size** - Adds ~50kb gzipped (acceptable for feature gain)
2. **Time format** - Lightweight Charts expects Unix timestamps (we already use these ✓)
3. **Breaking change** - Need to test all chart rendering thoroughly
4. **Legacy code** - Can keep old `renderChart()` commented out as backup

## Testing Plan

1. Convert one chart first (e.g., SPY chart in SPY-HYG pair)
2. Verify data displays correctly
3. Test swing high markers appear
4. Test trend line rendering
5. Add crosshair syncing for that pair only
6. Once working, migrate all charts
7. Test all 4 pairs × 3 charts = 12 total charts
8. Test all 3 pivot modes work correctly
9. Test responsive behavior (resize window)

## Rollback Plan

Keep current `renderChart()` function as `renderChartSVG()` before migration. If issues arise, can quickly revert by:
```javascript
// Rollback: rename back
const renderChart = renderChartSVG;
```

## Implementation Priority

**Phase 1:** Basic migration (1-2 hours)
- Add Lightweight Charts library
- Convert renderChart() to use library
- Verify all charts display correctly

**Phase 2:** Crosshair sync (30 min)
- Implement `setupSyncedCrosshairs()`
- Test syncing across all charts

**Phase 3:** Polish (30 min - optional)
- Custom tooltips
- Styling tweaks
- Mobile testing

**Total estimated time:** 2-3 hours

## Resources

- [Lightweight Charts Docs](https://tradingview.github.io/lightweight-charts/)
- [Line Series Guide](https://tradingview.github.io/lightweight-charts/docs/series-types#line)
- [Markers API](https://tradingview.github.io/lightweight-charts/docs/api/interfaces/ISeriesApi#setmarkers)
- [Crosshair API](https://tradingview.github.io/lightweight-charts/docs/api/interfaces/IChartApi#subscribecrosshair)
- [Examples](https://tradingview.github.io/lightweight-charts/tutorials/demos)
