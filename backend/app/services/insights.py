"""
Deterministic plain-language insights service.
Constructs crisp, operational insights for energy traders directly from computed numbers
using structured string templates. No generative AI or external LLM APIs are used.
"""

from typing import Any


def generate_summary_insights(metrics: dict[str, Any]) -> list[str]:
    """Generate high-level accuracy insights from summary metrics."""
    cutoff = metrics.get("cutoff_time", "09:00")
    mean_bias = metrics.get("mean_bias", 0.0)
    mae = metrics.get("mae", 0.0)
    nmae = metrics.get("normalised_mae_pct", 0.0)
    shortfall_rate = metrics.get("shortfall_rate_pct", 0.0)
    shortfall_p90 = metrics.get("shortfall_p90_mw", 0.0)
    p90_ae = metrics.get("p90_ae", 0.0)
    mean_actual = metrics.get("mean_actual_mw", 0.0)

    bias_desc = "over-predicted" if mean_bias > 0 else "under-predicted"
    abs_bias = abs(mean_bias)

    insights = [
        (
            f"At the {cutoff} D-1 cutoff, the national wind forecast {bias_desc} generation by "
            f"{abs_bias:.1f} MW on average across January 2026, with an MAE of {mae:.1f} MW "
            f"({nmae:.1f}% of mean actual generation {mean_actual:.0f} MW)."
        ),
        (
            f"Shortfall Risk Exposure: Wind generation fell below the as-of forecast in {shortfall_rate:.1f}% "
            f"of evaluated half-hours. When shortfalls occurred, 10% exceeded {shortfall_p90:.0f} MW, "
            f"representing substantial imbalance penalty exposure if unhedged."
        ),
        (
            f"Tail Dispersion: In 90% of all half-hours, the absolute forecast deviation remained below "
            f"{p90_ae:.0f} MW, setting the operational threshold for extreme volumetric reserve sizing."
        ),
    ]
    return insights


def generate_decision_insights(
    delivery_date: str,
    cutoff_time: str,
    day_summary: dict[str, Any],
    buffer_mw: float,
    buffer_conf: float,
) -> list[str]:
    """Generate daily decision-time trading insights."""
    mae = day_summary.get("mae", 0.0)
    bias = day_summary.get("mean_bias", 0.0)
    shortfall_count = day_summary.get("shortfall_periods", 0)
    peak_fc = day_summary.get("peak_forecast_mw", 0.0)
    peak_act = day_summary.get("peak_actual_mw", 0.0)
    total_periods = day_summary.get("total_periods", 48)

    bias_word = "over-forecast" if bias > 0 else "under-forecast"
    shortfall_pct = (shortfall_count / total_periods * 100.0) if total_periods > 0 else 0.0

    insights = [
        (
            f"Trading Decision for {delivery_date} (D-1 {cutoff_time} Cutoff): "
            f"Forecast anticipated peak wind of {peak_fc:.0f} MW (actual peak: {peak_act:.0f} MW). "
            f"Overall day bias was {bias:+.1f} MW ({bias_word}) with an MAE of {mae:.1f} MW."
        ),
        (
            f"Intraday Shortfall Frequency: Wind generation failed to meet the forecast in "
            f"{shortfall_count} of {total_periods} half-hours ({shortfall_pct:.1f}% shortfall frequency)."
        ),
        (
            f"Reserve Buffer Recommendation: Applying a {buffer_conf * 100:.0f}% confidence reserve buffer "
            f"of {buffer_mw:.0f} MW derates nominal wind capacity, safeguarding against typical forecast shortfalls "
            f"without incurring unnecessary thermal over-hedging."
        ),
    ]
    return insights


def generate_whatif_insights(
    delivery_date: str,
    cutoff_time: str,
    metrics: dict[str, Any],
    buffer_mw: float,
    confidence_level: float,
) -> list[str]:
    """Generate plain-language takeaways for What-If demand and residual thermal scenario."""
    demand_mwh = metrics.get("total_energy_demand_mwh", 0.0)
    wind_mwh = metrics.get("wind_forecast_mwh", 0.0)
    thermal_with_buf = metrics.get("residual_thermal_with_buffer_mwh", 0.0)
    thermal_without_buf = metrics.get("residual_thermal_without_buffer_mwh", 0.0)
    buf_mwh = metrics.get("buffer_protection_mwh", 0.0)
    peak_thermal = metrics.get("peak_residual_with_buffer_mw", 0.0)

    wind_coverage_pct = (wind_mwh / demand_mwh * 100.0) if demand_mwh > 0 else 0.0

    insights = [
        (
            f"Gross Energy Balance for {delivery_date}: Total day demand of {demand_mwh:,.0f} MWh "
            f"is 50% served by expected wind ({wind_mwh:,.0f} MWh forecast, covering {wind_coverage_pct:.1f}% of total demand)."
        ),
        (
            f"Buffer Commitment: Holding a {confidence_level * 100:.0f}% confidence buffer ({buffer_mw:.0f} MW) "
            f"increases total day-ahead thermal purchase from {thermal_without_buf:,.0f} MWh to {thermal_with_buf:,.0f} MWh "
            f"(+{buf_mwh:,.0f} MWh thermal reserve hedge)."
        ),
        (
            f"Peak Thermal Requirement: Peak half-hour residual thermal requirement reaches {peak_thermal:,.0f} MW "
            f"with buffer protection, ensuring the utility avoids costly spot balancing mechanism (BM) cashout penalties."
        ),
    ]
    return insights
