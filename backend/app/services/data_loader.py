import json
import logging
from typing import Optional

import pandas as pd

from app.config import settings

logger = logging.getLogger(__name__)


class DataLoader:
    _instance: Optional["DataLoader"] = None
    _actuals_df: pd.DataFrame | None = None
    _forecasts_df: pd.DataFrame | None = None
    _meta: dict | None = None

    @classmethod
    def get_instance(cls) -> "DataLoader":
        if cls._instance is None:
            cls._instance = DataLoader()
            cls._instance.load_data()
        return cls._instance

    def load_data(self, force_reload: bool = False):
        if not force_reload and self._actuals_df is not None and self._forecasts_df is not None:
            return

        logger.info(f"Loading data from {settings.actuals_path} and {settings.forecasts_path}")

        if not settings.actuals_path.exists() or not settings.forecasts_path.exists():
            raise FileNotFoundError(
                f"Data snapshots missing. Looked for {settings.actuals_path} and {settings.forecasts_path}. "
                f"Please run backend/scripts/fetch_data.py first."
            )

        # 1. Load actuals
        df_act = pd.read_csv(settings.actuals_path)
        df_act["startTime"] = pd.to_datetime(df_act["startTime"], utc=True)
        df_act["publishTime"] = pd.to_datetime(df_act["publishTime"], utc=True)
        df_act["generation"] = pd.to_numeric(df_act["generation"], errors="coerce").fillna(0.0)
        df_act = df_act.sort_values("startTime").reset_index(drop=True)
        self._actuals_df = df_act

        # 2. Load forecasts
        df_fc = pd.read_csv(settings.forecasts_path)
        df_fc["publishTime"] = pd.to_datetime(df_fc["publishTime"], utc=True)
        df_fc["startTime"] = pd.to_datetime(df_fc["startTime"], utc=True)
        df_fc["generation"] = pd.to_numeric(df_fc["generation"], errors="coerce").fillna(0.0)
        df_fc = df_fc.sort_values(["publishTime", "startTime"]).reset_index(drop=True)
        self._forecasts_df = df_fc

        # 3. Load metadata
        if settings.meta_path.exists():
            with open(settings.meta_path) as f:
                self._meta = json.load(f)
        else:
            self._meta = {}

        logger.info(
            f"Successfully loaded {len(self._actuals_df)} actuals and {len(self._forecasts_df)} forecasts into memory."
        )

    @property
    def actuals(self) -> pd.DataFrame:
        if self._actuals_df is None:
            self.load_data()
        return self._actuals_df

    @property
    def forecasts(self) -> pd.DataFrame:
        if self._forecasts_df is None:
            self.load_data()
        return self._forecasts_df

    @property
    def metadata(self) -> dict:
        return self._meta or {}


def get_data_loader() -> DataLoader:
    return DataLoader.get_instance()
