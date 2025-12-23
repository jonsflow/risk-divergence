#!/usr/bin/env python3
"""
Fetch both hourly and daily data from Yahoo Finance using yfinance.
Saves data to CSV files in data/ directory for use by the static site.

- Hourly data: data/{symbol}_hourly.csv (last 1 month, ~143 bars)
- Daily data: data/{symbol}.csv (max available history for long-term analysis)
"""

import yfinance as yf
import sys
from pathlib import Path

# Symbols to fetch
SYMBOLS = ['SPY', 'HYG', 'QQQ', 'TLT', 'GLD', 'IWM', 'BTC']

# Map symbol to Yahoo Finance ticker (for special cases like crypto)
TICKER_MAP = {
    'BTC': 'BTC-USD'
}

def fetch_hourly(symbol, data_dir):
    """Fetch hourly data (last 1 month)"""
    ticker_symbol = TICKER_MAP.get(symbol, symbol)
    ticker = yf.Ticker(ticker_symbol)
    df = ticker.history(period='1mo', interval='1h')

    if df.empty:
        print(f"WARNING: No hourly data returned for {symbol}", file=sys.stderr)
        return

    # Reset index to get Datetime as a column
    df = df.reset_index()

    # Convert datetime to separate Date and Time columns
    df['Date'] = df['Datetime'].dt.strftime('%Y-%m-%d')
    df['Time'] = df['Datetime'].dt.strftime('%H:%M:%S')

    # Format: Date,Time,Open,High,Low,Close,Volume
    output_df = df[['Date', 'Time', 'Open', 'High', 'Low', 'Close', 'Volume']]

    # Save to *_hourly.csv
    csv_path = data_dir / f'{symbol.lower()}_hourly.csv'
    output_df.to_csv(csv_path, index=False)

    print(f"✓ {symbol} hourly: {len(output_df)} bars → {csv_path}", file=sys.stderr)

def fetch_daily(symbol, data_dir):
    """Fetch daily data (max available history)"""
    ticker_symbol = TICKER_MAP.get(symbol, symbol)
    ticker = yf.Ticker(ticker_symbol)
    df = ticker.history(period='max', interval='1d')

    if df.empty:
        print(f"WARNING: No daily data returned for {symbol}", file=sys.stderr)
        return

    # Reset index to get Date as a column
    df = df.reset_index()

    # Format date as YYYY-MM-DD
    df['Date'] = df['Date'].dt.strftime('%Y-%m-%d')

    # Format: Date,Open,High,Low,Close,Volume (no Time column for daily)
    output_df = df[['Date', 'Open', 'High', 'Low', 'Close', 'Volume']]

    # Save to {symbol}.csv (same as before)
    csv_path = data_dir / f'{symbol.lower()}.csv'
    output_df.to_csv(csv_path, index=False)

    print(f"✓ {symbol} daily: {len(output_df)} bars → {csv_path}", file=sys.stderr)

def main():
    data_dir = Path('data')
    data_dir.mkdir(exist_ok=True)

    for symbol in SYMBOLS:
        try:
            print(f"Fetching {symbol}...", file=sys.stderr)

            # Fetch both hourly and daily
            fetch_hourly(symbol, data_dir)
            fetch_daily(symbol, data_dir)

        except Exception as e:
            print(f"ERROR fetching {symbol}: {e}", file=sys.stderr)
            sys.exit(1)

    print("✓ All data fetched successfully", file=sys.stderr)

if __name__ == '__main__':
    main()
