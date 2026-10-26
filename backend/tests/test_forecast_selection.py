from datetime import UTC

import pandas as pd

from app.services.forecast_selection import parse_cutoff_datetime, select_asof_forecast


def test_parse_cutoff_datetime():
    delivery_date = "2026-01-15"
    cutoff_time = "09:00"
    decision_dt, cutoff_dt = parse_cutoff_datetime(delivery_date, cutoff_time)

    assert decision_dt.strftime("%Y-%m-%d") == "2026-01-14"
    assert cutoff_dt.strftime("%Y-%m-%d %H:%M:%S") == "2026-01-14 09:00:00"
    assert cutoff_dt.tzinfo == UTC


def test_asof_forecast_edge_cases():
    delivery_date = "2026-01-05"
    cutoff_time = "09:00"
    # D-1 is 2026-01-04. Cutoff is 2026-01-04 09:00:00Z.

    # 1. Vintage published exactly at cutoff: MUST BE INCLUDED
    # 2. Vintage published after cutoff: MUST BE EXCLUDED
    # 3. Earlier vintage for another hour
    # Target delivery day hours: 2026-01-05 00:00 to 23:30
    forecasts_data = [
        # Exactly at cutoff for 00:00 target
        {
            "publishTime": "2026-01-04T09:00:00Z",
            "startTime": "2026-01-05T00:00:00Z",
            "generation": 1000,
        },
        # Published 1 minute AFTER cutoff for 00:00 target - should be ignored!
        {
            "publishTime": "2026-01-04T09:01:00Z",
            "startTime": "2026-01-05T00:00:00Z",
            "generation": 9999,
        },
        # Published before cutoff for 01:00 target (early vintage)
        {
            "publishTime": "2026-01-04T06:00:00Z",
            "startTime": "2026-01-05T01:00:00Z",
            "generation": 1200,
        },
        # Published closer to cutoff for 01:00 target (latest eligible)
        {
            "publishTime": "2026-01-04T08:30:00Z",
            "startTime": "2026-01-05T01:00:00Z",
            "generation": 1350,
        },
        # For 02:00 target: only published AFTER cutoff - so target should have NO ELIGIBLE VINTAGE
        {
            "publishTime": "2026-01-04T10:00:00Z",
            "startTime": "2026-01-05T02:00:00Z",
            "generation": 1500,
        },
    ]

    df_fc = pd.DataFrame(forecasts_data)
    df_fc["publishTime"] = pd.to_datetime(df_fc["publishTime"], utc=True)
    df_fc["startTime"] = pd.to_datetime(df_fc["startTime"], utc=True)

    # Mock actuals: 2026-01-05 00:00:00 = 800 MW, 00:30:00 = 850 MW
    actuals_data = [
        {"startTime": "2026-01-05T00:00:00Z", "generation": 800, "settlementPeriod": 1},
        {"startTime": "2026-01-05T00:30:00Z", "generation": 850, "settlementPeriod": 2},
        {"startTime": "2026-01-05T01:00:00Z", "generation": 1300, "settlementPeriod": 3},
        {"startTime": "2026-01-05T01:30:00Z", "generation": 1400, "settlementPeriod": 4},
        {"startTime": "2026-01-05T02:00:00Z", "generation": 1500, "settlementPeriod": 5},
    ]
    df_act = pd.DataFrame(actuals_data)
    df_act["startTime"] = pd.to_datetime(df_act["startTime"], utc=True)

    result = select_asof_forecast(df_fc, df_act, delivery_date, cutoff_time)

    assert len(result) == 48

    # Period 1 (00:00:00): should select 1000 MW (from 09:00:00 vintage, NOT 9999 from 09:01:00)
    p1 = result[result["period"] == 1].iloc[0]
    assert bool(p1["has_forecast"]) is True
    assert p1["forecast_mw"] == 1000
    assert p1["actual_mw"] == 800
    # Error convention: forecast - actual = 1000 - 800 = +200 MW (over-forecast / shortfall)
    assert p1["error_mw"] == 200

    # Period 2 (00:30:00): parent hour 00:00, forecast 1000 MW, actual 850 MW
    p2 = result[result["period"] == 2].iloc[0]
    assert bool(p2["has_forecast"]) is True
    assert p2["forecast_mw"] == 1000
    assert p2["actual_mw"] == 850
    assert p2["error_mw"] == 150

    # Period 3 (01:00:00): should pick latest vintage before cutoff (1350 MW from 08:30, NOT 1200 from 06:00)
    p3 = result[result["period"] == 3].iloc[0]
    assert bool(p3["has_forecast"]) is True
    assert p3["forecast_mw"] == 1350
    assert p3["actual_mw"] == 1300
    assert p3["error_mw"] == 50

    # Period 5 (02:00:00): only had a forecast published AFTER cutoff (10:00:00).
    # Must report has_forecast = False and forecast_mw = None / NaN explicitly!
    p5 = result[result["period"] == 5].iloc[0]
    assert bool(p5["has_forecast"]) is False
    assert pd.isna(p5["forecast_mw"])
    assert pd.isna(p5["error_mw"])
    assert p5["actual_mw"] == 1500
