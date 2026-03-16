**FRED** stands for **Federal Reserve Economic Data**. It’s a free, comprehensive online database maintained by the Research Division of the **Federal Reserve Bank of St. Louis**.

FRED provides access to over 840,000 economic time series (as of recent counts) from more than 100 sources, including U.S. government agencies (like the Bureau of Economic Analysis, Bureau of Labor Statistics, and Census Bureau), international organizations, and private sources. It covers a wide range of topics such as:

- GDP and national accounts
- Inflation (CPI, PPI)
- Employment and unemployment
- Interest rates and Treasury yields
- Money supply and banking data
- Exchange rates
- International trade
- Regional U.S. data
- And much more, including the high-yield bond spread we discussed earlier (e.g., series ID **BAMLH0A0HYM2** for the ICE BofA US High Yield Index Option-Adjusted Spread)

Key features include:

- Easy searching and downloading of data (CSV, Excel, etc.)
- Built-in graphing and visualization tools (custom charts, overlays, maps)
- Historical data going back decades (some series to the early 1900s)
- Real-time updates as new data is released
- Related tools like **ALFRED** (for vintage/revised data history) and mobile apps

The official website is **https://fred.stlouisfed.org/** — it’s widely used by economists, analysts, journalists, students, and anyone tracking macro conditions or financial markets. In Python (as we touched on before), you can pull data directly using libraries like `pandas_datareader` or the `fredapi` package by searching for a series ID.

It’s one of the most trusted and user-friendly sources for economic indicators, especially for things not easily available on Yahoo Finance.

Our first task with FRED data will be using it to determine the spread between high quality and junk :

the high-yield (junk) bond spread—most commonly the ICE BofA US High Yield Index Option-Adjusted Spread (OAS) over US Treasuries. This measures the extra yield investors demand for holding below-investment-grade corporate bonds compared to “risk-free” Treasuries, serving as a strong signal of perceived credit risk, economic stress, or shifts in macro conditions. Wider spreads often indicate rising fear (e.g., recession risks, defaults), while tight spreads suggest confidence and risk-on sentiment.