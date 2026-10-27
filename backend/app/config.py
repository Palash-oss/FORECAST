from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="APP_")

    app_name: str = "UK Wind Trading Decision Terminal"
    app_version: str = "1.0.0"
    debug: bool = False

    # Data paths
    actuals_path: Path = DATA_DIR / "actuals.csv"
    forecasts_path: Path = DATA_DIR / "forecasts.csv"
    meta_path: Path = DATA_DIR / "meta.json"

    # Defaults
    default_cutoff_time: str = "09:00"  # 09:00 UK time (GMT/UTC in Jan)
    default_buffer_confidence: float = 0.90
    default_demand_mw: float = 25000.0  # Typical UK winter system demand baseline

    # Date scope
    decision_start_date: str = "2026-01-01"
    decision_end_date: str = "2026-01-31"
    delivery_start_date: str = "2026-01-02"
    delivery_end_date: str = "2026-02-01"

    # CORS
    cors_origins: list[str] = ["*"]


settings = Settings()
