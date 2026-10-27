# Elexon BMRS API Discovery & Data Analysis Notes

## 1. Executive Summary & Verification
This document records the empirical findings from probing the Elexon Insights API (`https://data.elexon.co.uk/bmrs/api/v1`) and OpenAPI specification (`https://data.elexon.co.uk/swagger/v1/swagger.json`). All findings are derived from real responses fetched from the live public endpoints without API keys.

---

## 2. API Endpoints & Query Parameters

### 2.1 Actual Generation Outturn: `FUELHH` Stream
- **URL**: `https://data.elexon.co.uk/bmrs/api/v1/datasets/FUELHH/stream`
- **Specification**: `Insights.Api.Models.Responses.Generation.DatasetRows.AugmentedOutturnData`
- **Supported Parameters**:
  - `settlementDateFrom` (date `YYYY-MM-DD`): e.g. `2026-01-01`
  - `settlementDateTo` (date `YYYY-MM-DD`): e.g. `2026-02-02`
  - `fuelType` (string array): filter for `fuelType=WIND` directly in query.
  - `publishDateTimeFrom` / `publishDateTimeTo` (mutually exclusive with settlementDate).
- **Tested Window Sizes**:
  - 1 day (48 rows), 7 days (384 rows), 14 days (720 rows), 31 days (1,536 rows), 35 days (1,728 rows).
  - All return status `200 OK` in a single request.
- **Fields in Response**:
  - `dataset` (`string`): `"FUELHH"`
  - `publishTime` (`string`, ISO 8601 UTC `YYYY-MM-DDTHH:MM:SSZ`): Outturn publication timestamp
  - `startTime` (`string`, ISO 8601 UTC `YYYY-MM-DDTHH:MM:SSZ`): Start of the 30-minute settlement period
  - `settlementDate` (`string`, `YYYY-MM-DD`): Elexon settlement date
  - `settlementPeriod` (`int32`): Settlement period number (1 to 48)
  - `fuelType` (`string`): `"WIND"`
  - `generation` (`int64`): Average wind generation in Megawatts (MW) over the 30-minute period

### 2.2 Wind Generation Forecast: `WINDFOR` Stream
- **URL**: `https://data.elexon.co.uk/bmrs/api/v1/datasets/WINDFOR/stream`
- **Specification**: `Insights.Api.Models.Responses.Generation.DatasetRows.WindGenerationForecast`
- **Supported Parameters**:
  - `publishDateTimeFrom` (`string`, ISO 8601 date-time UTC `YYYY-MM-DDTHH:MM:SSZ`)
  - `publishDateTimeTo` (`string`, ISO 8601 date-time UTC `YYYY-MM-DDTHH:MM:SSZ`)
- **Tested Window Sizes**:
  - 1 day (584 rows), 3 days (1,752 rows), 7 days (4,088 rows), 14 days (8,176 rows), 31 days (18,104 rows).
  - All return status `200 OK`.
- **Fields in Response**:
  - `dataset` (`string`): `"WINDFOR"`
  - `publishTime` (`string`, ISO 8601 UTC `YYYY-MM-DDTHH:MM:SSZ`): Forecast publication timestamp
  - `startTime` (`string`, ISO 8601 UTC `YYYY-MM-DDTHH:MM:SSZ`): Target forecast time (at hourly resolution)
  - `generation` (`int64`): Predicted national wind generation in Megawatts (MW)

---

## 3. Data Characteristics & Statistical Profiling

| Metric | FUELHH (Actuals) | WINDFOR (Forecasts) |
|---|---|---|
| **Temporal Granularity** | 30 minutes (half-hourly) | 60 minutes (hourly, `minute == 0`) |
| **Rows per Day** | Exactly 48 rows/day | Typically 580–600 rows/day (~8–12 batches/day × 73 pts) |
| **Duplicates** | 0 duplicates on `startTime` | 0 duplicates on `(publishTime, startTime)` |
| **Missing Gaps (2026-01-01 to 2026-02-02)** | 0 gaps (1,584 consecutive 30-min intervals) | None detected in publication schedule |
| **Timezone** | UTC (`Z` offset). UK in January is GMT (UTC+0). | UTC (`Z` offset). UK in January is GMT (UTC+0). |
| **Forecast Batch Size** | N/A | 73 points per batch (spanning 72 hours ahead) |
| **Publication Cadence** | Every 30 minutes | Every 2 to 4 hours (e.g. 02:30, 04:30, 07:30, 09:30, 11:30...) |
| **Forecast Horizon (startTime − publishTime)** | N/A | Min: -25.5h (recent backcast), Max: +66.5h, Mean: ~21.5h |
| **Vintages per Target Hour** | 1 outturn per half-hour | 8 to 16 vintages per target hour |

---

## 4. Key Architectural Adaptations

1. **Resolution Alignment (Half-Hourly Settlement Mapping)**:
   - Since Elexon WINDFOR forecasts are published at hourly resolution (`HH:00`), whereas FUELHH outturns and UK settlement periods are half-hourly (`HH:00` and `HH:30`), each half-hour settlement period on delivery day $D$ is matched to the prevailing hourly forecast for that hour (`startTime.floor("1h")`).
   - If an exact half-hourly match is requested, only `:00` targets would match; by mapping to the parent hour, all 48 half-hour settlement periods receive a coherent forecast representation while preserving the actual outturn resolution.
2. **As-Of Information Cutoff (D-1 09:00 UK Time)**:
   - For delivery day $D$, trading decisions on the UK Day-Ahead Auction are submitted mid-morning on $D-1$ (default cutoff: 09:00 UK time).
   - In `select_asof_forecast()`, we select the vintage with the latest `publishTime <= cutoff`.
   - Any half-hour target where no forecast was published prior to the cutoff is explicitly flagged and reported as unforecasted rather than guessing or looking into the future.
3. **Sign Convention**:
   - $\text{error} = \text{forecast} - \text{actual}$
   - Positive error ($> 0$ MW) indicates an **over-forecast**, meaning wind produced less than expected, requiring the utility to procure expensive thermal power to cover the shortfall.
   - Negative error ($< 0$ MW) indicates an **under-forecast** (surplus wind).
4. **Resilience & Offline Performance**:
   - Fetching script downloads all actuals (2026-01-01 to 2026-02-02) and forecasts (2025-12-30 to 2026-01-31) in chunked requests, validates timestamps and data types, and persists them into `backend/data/` as Parquet/CSV snapshots.
   - The FastAPI backend serves instantly from this local snapshot without external latency or Elexon rate limits.
