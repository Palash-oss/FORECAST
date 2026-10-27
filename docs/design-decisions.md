# Architectural & Design Decisions

This document details the engineering and trading design decisions made while developing the **WindTrader UK** platform.

---

## 1. Information Cutoff & Anti-Lookahead Protection
- **Decision**: Strictly prohibit any forecast vintage published after $(D-1)$ at the cutoff time (default: 09:00 UK Time / GMT).
- **Rationale**: In the UK Day-Ahead power market (EPEX SPOT and Nord Pool auctions), market participants submit binding orders mid-morning on delivery day $D-1$ (typically by 09:00–11:00 GMT for the 11:00/12:00 gate closure). Using forecasts published after this cutoff would introduce forward-looking bias (lookahead leakage) and invalidate the quantitative evaluation.
- **Implementation**: In `services/forecast_selection.py`, candidate records are filtered using `publishTime <= cutoff_datetime`. If no eligible vintage exists prior to cutoff for a target period, `has_forecast` is explicitly flagged as `False` and `forecast_mw` as `None` rather than imputing future data.

---

## 2. Temporal Resolution Alignment (Hourly Forecasts to Half-Hour Settlement)
- **Empirical Observation**: The Elexon `WINDFOR` stream publishes forecasts at 60-minute resolution (`minute == 0`), whereas the UK balancing mechanism and `FUELHH` generation outturns operate on 30-minute settlement periods (48 periods per day).
- **Decision**: Map each 30-minute settlement target period $T$ to the prevailing hourly forecast for its parent hour: $H = T.\text{floor}(\text{"1h"})$.
- **Rationale**: In wholesale electricity trading, an hourly day-ahead forecast represents the expected average generation capacity across that clock hour, which directly governs the physical power delivery across the two constituent half-hours (e.g. 14:00 and 14:30).

---

## 3. Error Sign Convention
- **Decision**: $\text{Error} = \text{Forecast} - \text{Actual}$.
- **Rationale**:
  - $\text{Error} > 0$ (**Over-forecast**): Wind generated less electricity than predicted. This creates a generation **shortfall**, forcing the utility to procure expensive prompt thermal power or face penal imbalance settlement cashout prices.
  - $\text{Error} < 0$ (**Under-forecast**): Wind produced more electricity than predicted (**surplus wind**).

---

## 4. Empirical Reserve Buffer Methodology
- **Decision**: Compute the empirical reserve buffer $B_\alpha$ as the $\alpha$-quantile of observed historical shortfall errors ($E > 0$).
- **Rationale**: Wind generation errors are asymmetric, bounded below by zero, and non-Gaussian. Classical parametric buffers ($\mu + k\sigma$) under-represent extreme tail risk and distort asymmetry. An empirical quantile (e.g. P90 or P95 of positive shortfall errors) provides a direct, distribution-free probabilistic guarantee: holding $B_\alpha$ ensures that $(100 \times \alpha)\%$ of historical shortfalls are covered without excessive thermal over-hedging.

---

## 5. Deterministic Plain-Language Insights (No LLM in Production Loop)
- **Decision**: Generate all operational takeaway text deterministically using structured templates and computed metrics.
- **Rationale**: Production trading environments require 100% determinism, zero hallucination, sub-millisecond response latency, and zero external API dependencies. Templates dynamically format computed MAE, bias, peak MW, shortfall frequency, and buffer values.

---

## 6. Offline Data Snapshotting & Sub-Millisecond Serving
- **Decision**: Ingest and validate data using `backend/scripts/fetch_data.py`, persisting CSV/Parquet snapshots in `backend/data/`. The FastAPI backend preloads these snapshots into memory during startup.
- **Rationale**: Protects the trading desk from external Elexon API rate limits, network outages, and slow streaming latency. Provides instant page loads and seamless local offline development.

---

## 7. Energy Trading Terminal Aesthetics
- **Decision**: Implement a sleek "dark default" financial terminal aesthetic inspired by Bloomberg and modern power exchange platforms (EPEX SPOT / Nord Pool).
- **Color Palette**:
  - Deep Slate background (`#090D16` / `#0F172A`) with soft glass cards (`glass-panel`).
  - Electric Teal / Cyan (`#06B6D4`): Wind Forecast.
  - Warm Amber (`#F59E0B`): Actual Outturn.
  - Coral / Rose (`#F43F5E`): Shortfall Imbalance Risk.
  - Violet (`#8B5CF6`): Reserve Buffer & Thermal Hedge.
- **Typography**: Inter with monospace tabular figures (`font-mono`) to prevent visual jitter in animated trading numbers.
