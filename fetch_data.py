#!/usr/bin/env python3
"""
Fetch both hourly and daily data from Yahoo Finance using yfinance.
Saves data to CSV files in data/ directory for use by the static site.

Reads configuration from config.json to determine which symbols to fetch.

- Hourly data: data/{symbol}_hourly.csv (last 1 month, ~143 bars)
- Daily data: data/{symbol}.csv (max available history for long-term analysis)
"""

import yfinance as yf
import sys
import json
from pathlib import Path
from datetime import datetime, timezone

def load_config():
    """Load configuration from config.json"""
    config_path = Path('config.json')
    if not config_path.exists():
        print("ERROR: config.json not found", file=sys.stderr)
        sys.exit(1)

    with config_path.open('r') as f:
        return json.load(f)

def get_symbols_from_config(config):
    """Extract symbols and ticker mappings from config"""
    symbols = []
    ticker_map = {}

    for entry in config['symbols']:
        symbol = entry['symbol']
        ticker = entry.get('ticker', symbol)  # Default to symbol if ticker not specified

        symbols.append(symbol)
        if ticker != symbol:
            ticker_map[symbol] = ticker

    return symbols, ticker_map

def fetch_hourly(symbol, ticker_map, data_dir):
    """Fetch hourly data (last 1 month)"""
    ticker_symbol = ticker_map.get(symbol, symbol)
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

def fetch_daily(symbol, ticker_map, data_dir):
    """Fetch daily data (max available history)"""
    ticker_symbol = ticker_map.get(symbol, symbol)
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
    # Load configuration
    config = load_config()
    symbols, ticker_map = get_symbols_from_config(config)

    print(f"Loaded config: {len(symbols)} symbols, {len(config['pairs'])} pairs", file=sys.stderr)

    data_dir = Path('data')
    data_dir.mkdir(exist_ok=True)

    for symbol in symbols:
        try:
            print(f"Fetching {symbol}...", file=sys.stderr)

            # Fetch both hourly and daily
            fetch_hourly(symbol, ticker_map, data_dir)
            fetch_daily(symbol, ticker_map, data_dir)

        except Exception as e:
            print(f"ERROR fetching {symbol}: {e}", file=sys.stderr)
            sys.exit(1)

    print("✓ All data fetched successfully", file=sys.stderr)

    # Write timestamp file so browser knows when data was last updated
    timestamp_file = data_dir / 'last_updated.txt'
    with timestamp_file.open('w') as f:
        f.write(datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC'))

    print(f"✓ Updated timestamp: {timestamp_file}", file=sys.stderr)

if __name__ == '__main__':
    main()
