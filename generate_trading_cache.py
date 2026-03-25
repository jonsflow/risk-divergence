#!/usr/bin/env python3
"""
Generate trading signals cache for daily rule-based analysis.

Reads full daily + hourly OHLCV history, computes trading indicators once,
and writes only the latest values to a single JSON file.

Output: data/cache/trading_signals.json

Computes:
- ATR(14), RSI(14), MACD(12,26,9)
- Volume averages (20/50 day)
- Gap detection (today's open vs prev close)
- Outside day detection
- Day quality grade (A+/A/B/C/F)
- Market regime (Trending/Ranging/Choppy)
- Active pattern flags (ORB, gaps, engulfing, outside day)

Uses stdlib only — no new dependencies beyond what fetch_data.py requires.
"""

import csv
import json
import math
from datetime import datetime, timezone, timedelta
from pathlib import Path

DATA_DIR = Path("data")
CACHE_DIR = DATA_DIR / "cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

# Ticker overrides matching fetch_data.py
TICKER_MAP = {
    'BTC': 'BTC-USD',
    'ETH': 'ETH-USD',
    'VIX': '^VIX',
}

# Symbols for trading analysis
TRADING_SYMBOLS = ['SPY', 'QQQ', 'IWM', 'SMH', 'BTC', 'ETH', 'GLD', 'SLV', 'USO']

# Symbols used for regime detection (index equities only)
REGIME_SYMBOLS = ['SPY', 'QQQ', 'IWM']

# =============================================================================
# DATA LOADING
# =============================================================================

def load_daily_csv(symbol: str) -> list:
    """
    Read data/{symbol}.csv, return [(timestamp_secs, ohlcv_dict), ...]

    Returns list of tuples: (timestamp, {'open': float, 'high': float, 'low': float, 'close': float, 'volume': int})
    """
    path = DATA_DIR / f"{symbol.lower()}.csv"
    if not path.exists():
        return []

    points = []
    with open(path, newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            date   = row.get('Date', '').strip()
            open_  = row.get('Open', '').strip()
            high   = row.get('High', '').strip()
            low    = row.get('Low', '').strip()
            close  = row.get('Close', '').strip()
            volume = row.get('Volume', '').strip()

            if not date or not close:
                continue

            try:
                t = int(datetime.strptime(date, '%Y-%m-%d')
                        .replace(tzinfo=timezone.utc).timestamp())
                ohlcv = {
                    'open': float(open_) if open_ else 0.0,
                    'high': float(high) if high else 0.0,
                    'low': float(low) if low else 0.0,
                    'close': float(close),
                    'volume': int(float(volume)) if volume else 0
                }
                points.append((t, ohlcv))
            except (ValueError, KeyError):
                continue

    points.sort(key=lambda x: x[0])
    return points

def load_hourly_csv(symbol: str) -> list:
    """
    Read data/{symbol}_hourly.csv for intraday analysis.
    Returns list of tuples: (timestamp, ohlcv_dict)
    """
    path = DATA_DIR / f"{symbol.lower()}_hourly.csv"
    if not path.exists():
        return []

    points = []
    with open(path, newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            date_str = row.get('Date', '').strip()
            time_str = row.get('Time', '').strip()
            open_   = row.get('Open', '').strip()
            high    = row.get('High', '').strip()
            low     = row.get('Low', '').strip()
            close   = row.get('Close', '').strip()
            volume  = row.get('Volume', '').strip()

            if not date_str or not time_str or not close:
                continue

            try:
                dt_str = f"{date_str} {time_str}"
                t = int(datetime.strptime(dt_str, '%Y-%m-%d %H:%M:%S')
                        .replace(tzinfo=timezone.utc).timestamp())
                ohlcv = {
                    'open': float(open_) if open_ else 0.0,
                    'high': float(high) if high else 0.0,
                    'low': float(low) if low else 0.0,
                    'close': float(close),
                    'volume': int(float(volume)) if volume else 0
                }
                points.append((t, ohlcv))
            except (ValueError, KeyError):
                continue

    points.sort(key=lambda x: x[0])
    return points

# =============================================================================
# TECHNICAL INDICATORS
# =============================================================================

def calculate_atr(points: list, period: int = 14) -> list:
    """
    Calculate Average True Range.
    Returns [(timestamp, atr_value), ...]
    """
    if len(points) < period:
        return []

    atr_values = []
    true_ranges = []

    for i in range(len(points)):
        if i == 0:
            tr = points[i][1]['high'] - points[i][1]['low']
        else:
            prev_close = points[i-1][1]['close']
            h = points[i][1]['high']
            l = points[i][1]['low']
            tr = max(h - l, abs(h - prev_close), abs(l - prev_close))

        true_ranges.append(tr)

        # Calculate ATR once we have enough TR values
        if len(true_ranges) >= period:
            atr = sum(true_ranges[-period:]) / period
            atr_values.append((points[i][0], atr))

    return atr_values

def calculate_rsi(points: list, period: int = 14) -> list:
    """
    Calculate Relative Strength Index.
    Returns [(timestamp, rsi_value), ...]
    """
    if len(points) < period + 1:
        return []

    closes = [p[1]['close'] for p in points]
    rsi_values = []

    gains = []
    losses = []

    for i in range(1, len(closes)):
        change = closes[i] - closes[i-1]
        if change > 0:
            gains.append(change)
            losses.append(0)
        else:
            gains.append(0)
            losses.append(abs(change))

    # Need enough data for EMA calculation
    if len(gains) < period:
        return []

    # Calculate initial averages
    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period

    # Calculate RSI with EMA
    for i in range(period, len(gains)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period

        rs = avg_gain / avg_loss if avg_loss != 0 else 0
        rsi = 100 - (100 / (1 + rs)) if rs >= 0 else 0

        rsi_values.append((points[i + 1][0], rsi))

    return rsi_values

def calculate_macd(points: list, fast: int = 12, slow: int = 26, signal: int = 9) -> dict:
    """
    Calculate MACD.
    Returns {'line': [(ts, value), ...], 'signal': [...], 'histogram': [...]}
    """
    if len(points) < slow + signal:
        return {'line': [], 'signal': [], 'histogram': []}

    closes = [p[1]['close'] for p in points]

    # Calculate EMAs
    ema_fast = _calculate_ema(closes, fast)
    ema_slow = _calculate_ema(closes, slow)

    # MACD line = fast EMA - slow EMA
    macd_line = []
    for i in range(len(ema_slow)):
        if i < len(ema_fast):
            macd_line.append(ema_fast[i] - ema_slow[i])

    # Signal line = EMA of MACD line
    signal_line = _calculate_ema(macd_line, signal) if len(macd_line) >= signal else []

    # Histogram = MACD - Signal
    histogram = []
    for i in range(len(signal_line)):
        if i < len(macd_line):
            histogram.append(macd_line[i] - signal_line[i])

    # Align timestamps
    result = {'line': [], 'signal': [], 'histogram': []}
    offset = len(points) - len(macd_line)
    for i, val in enumerate(macd_line):
        if i + offset < len(points):
            result['line'].append((points[i + offset][0], val))

    offset = len(points) - len(signal_line)
    for i, val in enumerate(signal_line):
        if i + offset < len(points):
            result['signal'].append((points[i + offset][0], val))

    offset = len(points) - len(histogram)
    for i, val in enumerate(histogram):
        if i + offset < len(points):
            result['histogram'].append((points[i + offset][0], val))

    return result

def _calculate_ema(values: list, period: int) -> list:
    """Helper: calculate EMA of a value series"""
    if len(values) < period:
        return []

    ema_values = []
    multiplier = 2 / (period + 1)

    # Initialize with simple average
    ema = sum(values[:period]) / period
    ema_values.append(ema)

    # Calculate EMA
    for i in range(period, len(values)):
        ema = (values[i] * multiplier) + (ema * (1 - multiplier))
        ema_values.append(ema)

    return ema_values

def calculate_moving_average(points: list, period: int) -> list:
    """Simple moving average. Returns [(timestamp, ma_value), ...]"""
    if len(points) < period:
        return []

    ma_values = []
    for i in range(period - 1, len(points)):
        total = sum(points[j][1]['close'] for j in range(i - period + 1, i + 1))
        ma_values.append((points[i][0], total / period))

    return ma_values

# =============================================================================
# PATTERN DETECTION
# =============================================================================

def detect_gap(points: list) -> dict:
    """
    Detect if today has a significant gap from yesterday.
    Returns {
        'gap_pct': float (-5.2 to +5.2 etc),
        'gap_type': 'up' | 'down' | 'none',
        'gap_significant': bool (> 1%),
        'gap_strong': bool (> 2%)
    }
    """
    if len(points) < 2:
        return {'gap_pct': 0, 'gap_type': 'none', 'gap_significant': False, 'gap_strong': False}

    prev_close = points[-2][1]['close']
    today_open = points[-1][1]['open']

    gap_pct = ((today_open - prev_close) / prev_close) * 100 if prev_close != 0 else 0

    if abs(gap_pct) < 0.1:
        gap_type = 'none'
    elif gap_pct > 0:
        gap_type = 'up'
    else:
        gap_type = 'down'

    return {
        'gap_pct': round(gap_pct, 2),
        'gap_type': gap_type,
        'gap_significant': abs(gap_pct) > 1.0,
        'gap_strong': abs(gap_pct) > 2.0
    }

def detect_outside_day(points: list) -> bool:
    """
    Detect if today is an outside day (high > prev high AND low < prev low)
    """
    if len(points) < 2:
        return False

    today = points[-1][1]
    prev = points[-2][1]

    return today['high'] > prev['high'] and today['low'] < prev['low']

def detect_orb_qualified(atr_current: float, atr_20day_avg: float, opening_range_size: float) -> bool:
    """
    Detect if today's opening range is qualified for ORB trading.
    Qualified = opening range > 0.75 * average daily range
    """
    if atr_20day_avg == 0:
        return False

    avg_daily_range = atr_20day_avg
    return opening_range_size > (0.75 * avg_daily_range)

def calculate_opening_range(hourly_points: list) -> float:
    """
    Calculate opening range from first 2 hourly bars (first 2 hours, 9:30-11:30 AM EST).
    Returns high - low of that range.
    """
    if len(hourly_points) < 2:
        return 0.0

    # Take first 2 hourly bars
    high = max(hourly_points[0][1]['high'], hourly_points[1][1]['high'])
    low = min(hourly_points[0][1]['low'], hourly_points[1][1]['low'])

    return high - low

# =============================================================================
# DAY QUALITY GRADING
# =============================================================================

def grade_day_quality(points: list, atr_current: float, atr_20day_avg: float,
                      volume_20day_avg: float, volume_50day_avg: float) -> str:
    """
    Grade today's trading day quality: A+, A, B, C, or F

    Rules (from trading-rules.md):
    F  → prior day move > 10%
    C  → ATR below 20-day avg AND volume below 50-day avg
    B  → mixed signals (ATR ok but volume low, or vice versa)
    A  → ATR above avg AND volume above avg AND prior move < 3%
    A+ → all A conditions + price above rising MA(20)
    """
    if len(points) < 2:
        return 'B'

    today = points[-1][1]
    prev = points[-2][1]

    prior_move_pct = abs((today['close'] - prev['close']) / prev['close']) * 100 if prev['close'] != 0 else 0

    if prior_move_pct > 10.0:
        return 'F'

    atr_above = atr_current > atr_20day_avg
    volume_above_20 = today['volume'] > volume_20day_avg if volume_20day_avg > 0 else False
    volume_above_50 = today['volume'] > volume_50day_avg if volume_50day_avg > 0 else False

    if not atr_above and not volume_above_20:
        return 'C'

    if atr_above and volume_above_20 and prior_move_pct < 3.0:
        # A+: additionally require price above a rising 20-day MA
        ma20_values = calculate_moving_average(points, 20)
        if len(ma20_values) >= 10:
            ma20_now = ma20_values[-1][1]
            ma20_ten_ago = ma20_values[-10][1]
            if today['close'] > ma20_now and ma20_now > ma20_ten_ago:
                return 'A+'
        return 'A'

    if atr_above and volume_above_20:
        return 'A'

    return 'B'

def apply_weekday_modifier(grade: str, timestamp: int) -> str:
    """
    Apply weekday modifier to grade: Mon/Fri grade down 1 level
    """
    dt = datetime.fromtimestamp(timestamp, tz=timezone.utc)
    weekday = dt.weekday()  # 0=Mon, 4=Fri

    if weekday == 0 or weekday == 4:  # Monday or Friday
        grade_order = ['F', 'C', 'B', 'A', 'A+']
        try:
            idx = grade_order.index(grade)
            if idx > 0:
                return grade_order[idx - 1]
        except ValueError:
            pass

    return grade

# =============================================================================
# REGIME DETECTION
# =============================================================================

def detect_regime(symbols: list, daily_data: dict, hourly_data: dict) -> dict:
    """
    Detect market regime: Trending / Ranging / Choppy

    - Choppy:   indices not aligned (hourly direction disagrees)
    - Trending: SPY price above/below rising/falling MA(20)
    - Ranging:  MA(20) flat or price near MA
    """
    # Check index alignment using today's hourly direction
    aligned = True
    first_dir = None
    for sym in symbols:
        if sym in hourly_data and len(hourly_data[sym]) > 0:
            pts = hourly_data[sym]
            change = (pts[-1][1]['close'] - pts[0][1]['close']) / pts[0][1]['close']
            curr_dir = 'up' if change > 0.005 else 'down' if change < -0.005 else 'flat'
            if first_dir is None:
                first_dir = curr_dir
            elif curr_dir != first_dir and curr_dir != 'flat' and first_dir != 'flat':
                aligned = False
                break

    if not aligned:
        return {'label': 'Choppy', 'direction': 'mixed', 'atr_trend': 'unknown', 'index_alignment': 'diverging'}

    # Use SPY daily data to classify Trending vs Ranging
    label = 'Ranging'
    direction = 'sideways'

    spy_points = daily_data.get('SPY', [])
    if len(spy_points) >= 20:
        ma20 = calculate_moving_average(spy_points, 20)
        if len(ma20) >= 10:
            ma20_now = ma20[-1][1]
            ma20_ten_ago = ma20[-10][1]
            close = spy_points[-1][1]['close']
            ma_rising = ma20_now > ma20_ten_ago
            ma_falling = ma20_now < ma20_ten_ago
            price_above = close > ma20_now
            price_below = close < ma20_now

            if price_above and ma_rising:
                label, direction = 'Trending', 'up'
            elif price_below and ma_falling:
                label, direction = 'Trending', 'down'
            # else: Ranging (flat MA or price crossing MA)

    # ATR trend: compare current ATR to 20-day avg
    atr_trend = 'normal'
    spy_pts = daily_data.get('SPY', [])
    if spy_pts:
        atr_vals = calculate_atr(spy_pts, 14)
        if len(atr_vals) >= 20:
            atr_now = atr_vals[-1][1]
            atr_avg = sum(a[1] for a in atr_vals[-20:]) / 20
            if atr_now > atr_avg * 1.1:
                atr_trend = 'expanding'
            elif atr_now < atr_avg * 0.9:
                atr_trend = 'contracting'

    return {
        'label': label,
        'direction': direction,
        'atr_trend': atr_trend,
        'index_alignment': 'aligned'
    }

# =============================================================================
# MAIN GENERATION
# =============================================================================

def generate_trading_signals():
    """Generate trading signals cache file"""
    symbols = TRADING_SYMBOLS
    if not symbols:
        print("ERROR: No trading symbols defined")
        return False

    print(f"Generating trading signals for {len(symbols)} symbols: {', '.join(symbols)}...")

    output = {
        'generated': datetime.now(timezone.utc).isoformat(),
        'day_quality': {},
        'regime': {},
        'symbols': {},
        'active_patterns': []
    }

    # Load all daily data first
    daily_data = {}
    hourly_data = {}
    for symbol in symbols:
        daily_data[symbol] = load_daily_csv(symbol)
        hourly_data[symbol] = load_hourly_csv(symbol)

    # Process each symbol
    for symbol in symbols:
        if not daily_data[symbol]:
            continue

        points = daily_data[symbol]
        if len(points) < 2:
            continue

        today = points[-1]
        today_ts = today[0]
        today_ohlcv = today[1]

        # Calculate indicators
        atr_values = calculate_atr(points, 14)
        atr_current = atr_values[-1][1] if atr_values else 0.0
        atr_20day_avg = sum(a[1] for a in atr_values[-20:]) / min(20, len(atr_values)) if atr_values else 0.0

        rsi_values = calculate_rsi(points, 14)
        rsi_current = rsi_values[-1][1] if rsi_values else 50.0

        macd = calculate_macd(points, 12, 26, 9)
        macd_line_val = macd['line'][-1][1] if macd['line'] else 0.0
        macd_signal_val = macd['signal'][-1][1] if macd['signal'] else 0.0

        ma20_values = calculate_moving_average(points, 20)
        ma20_current = ma20_values[-1][1] if ma20_values else today_ohlcv['close']

        # Volume averages
        volumes = [p[1]['volume'] for p in points[-50:]]
        volume_20day_avg = sum(volumes[-20:]) / 20 if len(volumes) >= 20 else 0
        volume_50day_avg = sum(volumes[-50:]) / 50 if len(volumes) >= 50 else 0

        # Pattern detection
        gap = detect_gap(points)
        outside_day = detect_outside_day(points)
        opening_range = calculate_opening_range(hourly_data[symbol]) if hourly_data[symbol] else 0.0
        orb_qualified = detect_orb_qualified(atr_current, atr_20day_avg, opening_range)

        # Day quality (first symbol sets day grade)
        if symbol == 'SPY':
            day_grade = grade_day_quality(points, atr_current, atr_20day_avg, volume_20day_avg, volume_50day_avg)
            day_grade = apply_weekday_modifier(day_grade, today_ts)
            output['day_quality']['grade'] = day_grade
            output['day_quality']['modifiers'] = {
                'atr_above_avg': atr_current > atr_20day_avg,
                'volume_above_20d': today_ohlcv['volume'] > volume_20day_avg,
                'volume_above_50d': today_ohlcv['volume'] > volume_50day_avg,
                'prior_day_move_pct': gap['gap_pct']
            }

        # Store symbol data
        output['symbols'][symbol] = {
            'date': datetime.fromtimestamp(today_ts, tz=timezone.utc).strftime('%Y-%m-%d'),
            'open': round(today_ohlcv['open'], 2),
            'high': round(today_ohlcv['high'], 2),
            'low': round(today_ohlcv['low'], 2),
            'close': round(today_ohlcv['close'], 2),
            'volume': today_ohlcv['volume'],
            'atr_14': round(atr_current, 2),
            'atr_20d_avg': round(atr_20day_avg, 2),
            'atr_above_avg': atr_current > atr_20day_avg,
            'rsi_14': round(rsi_current, 1),
            'macd_line': round(macd_line_val, 4),
            'macd_signal': round(macd_signal_val, 4),
            'macd_histogram': round(macd_line_val - macd_signal_val, 4),
            'ma_20': round(ma20_current, 2),
            'above_ma_20': today_ohlcv['close'] > ma20_current,
            'gap_pct': gap['gap_pct'],
            'gap_type': gap['gap_type'],
            'gap_significant': gap['gap_significant'],
            'gap_strong': gap['gap_strong'],
            'outside_day': outside_day,
            'patterns': {
                'orb_qualified': orb_qualified,
                'gap_fill_candidate': gap['gap_significant'] and gap['gap_type'] == 'up',
                'gap_continuation_candidate': gap['gap_strong'] and gap['gap_type'] in ['up', 'down'],
                'outside_day': outside_day
            }
        }

        # Track active patterns
        if orb_qualified:
            output['active_patterns'].append({
                'symbol': symbol,
                'pattern': 'ORB',
                'direction': 'watch',
                'notes': f"ATR {atr_current:.2f} > avg {atr_20day_avg:.2f}, range {opening_range:.2f}"
            })

        if gap['gap_significant']:
            output['active_patterns'].append({
                'symbol': symbol,
                'pattern': 'Gap',
                'direction': gap['gap_type'],
                'notes': f"Gap {gap['gap_pct']:.2f}%"
            })

        if outside_day:
            output['active_patterns'].append({
                'symbol': symbol,
                'pattern': 'Outside Day',
                'direction': 'watch',
                'notes': f"High {today_ohlcv['high']:.2f}, Low {today_ohlcv['low']:.2f}"
            })

    output['regime'] = detect_regime(REGIME_SYMBOLS, daily_data, hourly_data)

    # Write cache file
    cache_path = CACHE_DIR / 'trading_signals.json'
    with cache_path.open('w') as f:
        json.dump(output, f, indent=2)

    print(f"✓ Generated {len(output['symbols'])} symbols, {len(output['active_patterns'])} patterns")
    print(f"✓ Saved to {cache_path}")

    return True

if __name__ == '__main__':
    success = generate_trading_signals()
    exit(0 if success else 1)
