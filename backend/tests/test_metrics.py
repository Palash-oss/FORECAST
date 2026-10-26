import numpy as np

from app.services.buffer import compute_empirical_buffer
from app.services.metrics import compute_metrics_series


def test_metrics_hand_computed_example():
    """
    Hand-computed test case:
    forecasts = [1100, 1000, 1000, 1000, 1000]
    actuals   = [1000, 1050,  800, 1000, 1100]
    errors = forecasts - actuals = [100, -50, 200, 0, -100]

    Absolute errors: [100, 50, 200, 0, 100] -> sum = 450 -> MAE = 90.0
    Squared errors:  [10000, 2500, 40000, 0, 10000] -> sum = 62500 -> mean = 12500 -> RMSE = sqrt(12500) ~= 111.80
    Mean Bias: (100 - 50 + 200 + 0 - 100) / 5 = 150 / 5 = 30.0
    Median AE: sorted [0, 50, 100, 100, 200] -> median = 100.0
    Shortfall rate: positive errors are [100, 200] -> 2 out of 5 = 40.0%
    Shortfall positive errors: [100, 200]
    Mean actual: (1000 + 1050 + 800 + 1000 + 1100) / 5 = 4950 / 5 = 990.0
    Normalised MAE: 90 / 990 * 100 = 9.09%
    """
    forecasts = np.array([1100.0, 1000.0, 1000.0, 1000.0, 1000.0])
    actuals = np.array([1000.0, 1050.0, 800.0, 1000.0, 1100.0])
    errors = forecasts - actuals

    m = compute_metrics_series(errors, actuals, forecasts)

    assert m["mae"] == 90.0
    assert m["rmse"] == round(np.sqrt(12500), 2)
    assert m["mean_bias"] == 30.0
    assert m["median_ae"] == 100.0
    assert m["shortfall_rate_pct"] == 40.0
    assert m["mean_actual_mw"] == 990.0
    assert m["normalised_mae_pct"] == round(90.0 / 990.0 * 100.0, 2)
    assert m["sample_count"] == 5


def test_empirical_buffer_calculation():
    import pandas as pd

    # Suppose errors are [-200, -50, 100, 200, 300, 400, 500, 600, 700, 800]
    # Positive errors (shortfalls): [100, 200, 300, 400, 500, 600, 700, 800] (8 items)
    # P90 of positive errors: 90th percentile of [100..800]
    series = pd.Series([-200, -50, 100, 200, 300, 400, 500, 600, 700, 800])
    buf_90, expl_90 = compute_empirical_buffer(series, confidence_level=0.90)

    assert buf_90 > 700.0
    assert "P90" in expl_90
    assert "historical half-hour wind shortfall events" in expl_90

    # Test edge case: no positive errors
    series_no_shortfall = pd.Series([-100, -200, -300])
    buf_0, expl_0 = compute_empirical_buffer(series_no_shortfall, confidence_level=0.90)
    assert buf_0 == 0.0
    assert "No historical wind shortfall" in expl_0
