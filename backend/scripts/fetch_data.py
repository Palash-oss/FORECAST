"""
Data ingestion script for Elexon BMRS API.
Fetches:
1. Actuals: FUELHH stream (fuelType == 'WIND') for 2026-01-01 to 2026-02-02
2. Forecasts: WINDFOR stream for publish dates 2025-12-30 to 2026-02-01

Saves clean, validated snapshots to backend/data/ directory.
"""

import argparse
import logging
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import httpx
import pandas as pd

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("fetch_data")

BASE_URL = "https://data.elexon.co.uk/bmrs/api/v1"
DATA_DIR = Path(__file__).resolve().parent.parent / "data"

MAX_RETRIES = 4
BASE_BACKOFF = 1.5  # seconds
TIMEOUT_SECS = 45.0


def fetch_with_retry(
    client: httpx.Client, url: str, params: dict[str, Any]
) -> list[dict[str, Any]]:
    """Fetch URL with exponential backoff and retry."""
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            logger.debug(f"Request attempt {attempt} for {url} with params {params}")
            resp = client.get(url, params=params, timeout=TIMEOUT_SECS)
            if resp.status_code == 200:
                data = resp.json()
                if isinstance(data, list):
                    return data
                elif isinstance(data, dict) and "data" in data:
                    return data["data"]
                return []
            elif resp.status_code in (429, 500, 502, 503, 504):
                sleep_time = BASE_BACKOFF * (2 ** (attempt - 1))
                logger.warning(
                    f"HTTP {resp.status_code} received. Retrying in {sleep_time:.1f}s (attempt {attempt}/{MAX_RETRIES})"
                )
                time.sleep(sleep_time)
            else:
                resp.raise_for_status()
        except (httpx.RequestError, httpx.HTTPStatusError) as exc:
            if attempt == MAX_RETRIES:
                logger.error(f"Failed to fetch {url} after {MAX_RETRIES} attempts: {exc}")
                raise
            sleep_time = BASE_BACKOFF * (2 ** (attempt - 1))
            logger.warning(f"Error {exc}. Retrying in {sleep_time:.1f}s...")
            time.sleep(sleep_time)
    return []


def fetch_actuals_chunked(
    start_date: str = "2026-01-01", end_date: str = "2026-02-02", chunk_days: int = 7
) -> pd.DataFrame:
    """
    Fetch FUELHH wind actuals in chunks of settlement dates.
    """
    logger.info(f"Fetching FUELHH wind actuals from {start_date} to {end_date}...")
    url = f"{BASE_URL}/datasets/FUELHH/stream"

    start_dt = datetime.strptime(start_date, "%Y-%m-%d").date()
    end_dt = datetime.strptime(end_date, "%Y-%m-%d").date()

    all_rows: list[dict[str, Any]] = []
    current_dt = start_dt

    with httpx.Client(
        headers={"User-Agent": "WindTrader-Fetch/1.0", "Accept": "application/json"}
    ) as client:
        while current_dt <= end_dt:
            chunk_end = min(current_dt + timedelta(days=chunk_days - 1), end_dt)
            params = {
                "settlementDateFrom": current_dt.strftime("%Y-%m-%d"),
                "settlementDateTo": chunk_end.strftime("%Y-%m-%d"),
                "fuelType": "WIND",
            }
            logger.info(
                f"Fetching FUELHH chunk: {params['settlementDateFrom']} -> {params['settlementDateTo']}"
            )
            rows = fetch_with_retry(client, url, params)
            logger.info(f"Retrieved {len(rows)} rows for chunk.")
            all_rows.extend(rows)
            current_dt = chunk_end + timedelta(days=1)
            time.sleep(0.2)  # courteous delay

    if not all_rows:
        raise ValueError("No FUELHH actuals data retrieved!")

    df = pd.DataFrame(all_rows)
    logger.info(f"Total raw FUELHH rows: {len(df)}")

    # Clean, validate, normalize
    # Filter fuelType == WIND
    df = df[df["fuelType"].str.upper() == "WIND"].copy()

    # Normalize startTime to UTC ISO string
    df["startTime"] = pd.to_datetime(df["startTime"], utc=True)
    df["publishTime"] = pd.to_datetime(df["publishTime"], utc=True)
    df["generation"] = pd.to_numeric(df["generation"], errors="coerce").fillna(0).astype(float)

    # Deduplicate on startTime (keep latest publishTime if duplicate)
    df = df.sort_values(["startTime", "publishTime"]).drop_duplicates(
        subset=["startTime"], keep="last"
    )
    df = df.sort_values("startTime").reset_index(drop=True)

    # Format timestamp strings
    df["startTime_str"] = df["startTime"].dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    df["publishTime_str"] = df["publishTime"].dt.strftime("%Y-%m-%dT%H:%M:%SZ")

    logger.info(
        f"Cleaned FUELHH: {len(df)} records from {df['startTime'].min()} to {df['startTime'].max()}"
    )
    return df


def fetch_forecasts_chunked(
    start_publish: str = "2025-12-30T00:00:00Z",
    end_publish: str = "2026-02-01T23:59:59Z",
    chunk_days: int = 5,
) -> pd.DataFrame:
    """
    Fetch WINDFOR wind forecasts in chunks of publish datetime.
    """
    logger.info(f"Fetching WINDFOR forecasts published from {start_publish} to {end_publish}...")
    url = f"{BASE_URL}/datasets/WINDFOR/stream"

    start_dt = datetime.strptime(start_publish, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=UTC)
    end_dt = datetime.strptime(end_publish, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=UTC)

    all_rows: list[dict[str, Any]] = []
    current_dt = start_dt

    with httpx.Client(
        headers={"User-Agent": "WindTrader-Fetch/1.0", "Accept": "application/json"}
    ) as client:
        while current_dt < end_dt:
            chunk_end = min(current_dt + timedelta(days=chunk_days), end_dt)
            params = {
                "publishDateTimeFrom": current_dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "publishDateTimeTo": chunk_end.strftime("%Y-%m-%dT%H:%M:%SZ"),
            }
            logger.info(
                f"Fetching WINDFOR chunk: {params['publishDateTimeFrom']} -> {params['publishDateTimeTo']}"
            )
            rows = fetch_with_retry(client, url, params)
            logger.info(f"Retrieved {len(rows)} rows for chunk.")
            all_rows.extend(rows)
            current_dt = chunk_end
            time.sleep(0.2)

    if not all_rows:
        raise ValueError("No WINDFOR forecast data retrieved!")

    df = pd.DataFrame(all_rows)
    logger.info(f"Total raw WINDFOR rows: {len(df)}")

    # Clean, validate, normalize
    df["publishTime"] = pd.to_datetime(df["publishTime"], utc=True)
    df["startTime"] = pd.to_datetime(df["startTime"], utc=True)
    df["generation"] = pd.to_numeric(df["generation"], errors="coerce").fillna(0).astype(float)

    # Deduplicate on (publishTime, startTime)
    df = (
        df.drop_duplicates(subset=["publishTime", "startTime"])
        .sort_values(["publishTime", "startTime"])
        .reset_index(drop=True)
    )

    df["startTime_str"] = df["startTime"].dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    df["publishTime_str"] = df["publishTime"].dt.strftime("%Y-%m-%dT%H:%M:%SZ")

    logger.info(
        f"Cleaned WINDFOR: {len(df)} records. Publishes: {df['publishTime'].min()} to {df['publishTime'].max()}, Targets: {df['startTime'].min()} to {df['startTime'].max()}"
    )
    return df


def save_snapshots(actuals_df: pd.DataFrame, forecasts_df: pd.DataFrame):
    """Save cleaned datasets to CSV and Parquet in backend/data/."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    actuals_csv = DATA_DIR / "actuals.csv"
    save_act = actuals_df.rename(
        columns={"startTime_str": "startTime", "publishTime_str": "publishTime"}
    )
    save_act[
        ["startTime", "publishTime", "settlementDate", "settlementPeriod", "fuelType", "generation"]
    ].to_csv(actuals_csv, index=False)
    logger.info(f"Saved actuals snapshot: {actuals_csv} ({len(save_act)} rows)")

    forecasts_csv = DATA_DIR / "forecasts.csv"
    save_fc = forecasts_df.rename(
        columns={"startTime_str": "startTime", "publishTime_str": "publishTime"}
    )
    save_fc[["dataset", "publishTime", "startTime", "generation"]].to_csv(
        forecasts_csv, index=False
    )
    logger.info(f"Saved forecasts snapshot: {forecasts_csv} ({len(save_fc)} rows)")

    # Save summary metadata json
    meta_json = DATA_DIR / "meta.json"
    meta = {
        "actuals": {
            "count": len(save_act),
            "start": str(actuals_df["startTime"].min()),
            "end": str(actuals_df["startTime"].max()),
            "source": "Elexon BMRS FUELHH stream (fuelType == WIND)",
        },
        "forecasts": {
            "count": len(save_fc),
            "publish_start": str(forecasts_df["publishTime"].min()),
            "publish_end": str(forecasts_df["publishTime"].max()),
            "target_start": str(forecasts_df["startTime"].min()),
            "target_end": str(forecasts_df["startTime"].max()),
            "source": "Elexon BMRS WINDFOR stream",
        },
        "updated_at": datetime.now(UTC).isoformat(),
    }
    import json

    with open(meta_json, "w") as f:
        json.dump(meta, f, indent=2)
    logger.info(f"Saved metadata: {meta_json}")


def main():
    parser = argparse.ArgumentParser(
        description="Fetch and snapshot Elexon BMRS wind actuals and forecasts."
    )
    parser.add_argument("--refresh", action="store_true", help="Force refresh even if data exists")
    args = parser.parse_args()

    act_path = DATA_DIR / "actuals.csv"
    fc_path = DATA_DIR / "forecasts.csv"

    if not args.refresh and act_path.exists() and fc_path.exists():
        logger.info(f"Snapshots already exist in {DATA_DIR}. Use --refresh to re-download.")
        return

    logger.info("Starting ingestion workflow...")
    actuals = fetch_actuals_chunked()
    forecasts = fetch_forecasts_chunked()
    save_snapshots(actuals, forecasts)
    logger.info("Ingestion completed successfully.")


if __name__ == "__main__":
    main()
