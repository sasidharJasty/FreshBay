from __future__ import annotations

import copy
import logging
import math
import random
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Sequence, Tuple

import numpy as np
import pandas as pd
import torch
from sklearn.preprocessing import LabelEncoder, StandardScaler
from torch import nn
from torch.utils.data import DataLoader, Dataset

logger = logging.getLogger(__name__)


def _module_dir() -> Path:
    return Path(__file__).resolve().parent


def _default_device() -> str:
    return "cuda" if torch.cuda.is_available() else "cpu"


@dataclass(slots=True)
class ForecastConfig:
    csv_path: Path = Path("FeedingAmericaData.xlsx")
    dist_col: str = "ID"
    state_col: str = "State Name"
    year_col: str = "Year"
    target_col: str = "Overall Food Insecurity Rate"
    id_col: str = "District"
    history_len: int = 6
    horizon: int = 3
    batch_size: int = 64
    learning_rate: float = 1e-3
    epochs: int = 60
    encoder_hidden: int = 256
    decoder_hidden: int = 256
    dropout: float = 0.2
    teacher_forcing_prob: float = 0.5
    weight_target: float = 2.0
    seed: int = 42
    device: str = field(default_factory=_default_device)
    future_years: Tuple[int, ...] = (2021, 2022, 2023, 2024, 2025)
    output_path: Path | None = field(default_factory=lambda: _module_dir() / "predictions_per_district.csv")
    checkpoint_path: Path | None = field(default_factory=lambda: _module_dir() / "best_seq2seq_model.pth")
    reuse_output: bool = True
    reuse_model: bool = True
    force_refresh: bool = False


def set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def parse_percent(value: object) -> float | np.nan:
    if pd.isna(value):
        return np.nan
    if isinstance(value, str):
        value = value.strip().replace("%", "").replace(",", "")
    try:
        return float(value) / 100.0
    except (TypeError, ValueError):
        return np.nan


def parse_int(value: object) -> float | np.nan:
    if pd.isna(value):
        return np.nan
    if isinstance(value, str):
        value = value.strip().replace(",", "")
    try:
        return float(int(float(value)))
    except (TypeError, ValueError):
        return np.nan


def _safe_encode(encoder: LabelEncoder, series: pd.Series) -> np.ndarray:
    filled = series.fillna("Unknown").astype(str)
    return encoder.fit_transform(filled)


@dataclass(slots=True)
class DataArtifacts:
    df: pd.DataFrame
    numeric_features: List[str]
    categorical_features: List[str]
    all_features: List[str]


def load_and_prepare_dataframe(cfg: ForecastConfig) -> DataArtifacts:
    df = pd.read_excel(cfg.csv_path, engine="openpyxl")
    df.columns = [c.strip() for c in df.columns]

    rate_cols = [c for c in df.columns if "rate" in c.lower() and c != cfg.target_col]
    num_cols = [c for c in df.columns if "estimated" in c.lower()]
    pct_child_cols = [c for c in df.columns if "% of food insecure" in c.lower()]

    for col in rate_cols + [cfg.target_col] + pct_child_cols:
        if df[col].dtype == "object":
            df[col] = df[col].apply(parse_percent)
        else:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    for col in num_cols:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    df = df.dropna(subset=[cfg.year_col, cfg.dist_col])
    df[cfg.year_col] = df[cfg.year_col].astype(int)
    df = df.sort_values([cfg.dist_col, cfg.year_col])
    df = df.groupby(cfg.dist_col).apply(lambda frame: frame.ffill().bfill()).reset_index(drop=True)

    numeric_features = list(dict.fromkeys(rate_cols + num_cols + pct_child_cols))
    if cfg.target_col not in df.columns:
        raise ValueError(f"Target column '{cfg.target_col}' is missing from the dataset.")

    categorical_features: List[str] = []

    if cfg.state_col in df.columns:
        encoder = LabelEncoder()
        df["state_code"] = _safe_encode(encoder, df[cfg.state_col])
        categorical_features.append("state_code")

    if "Low Threshold Type" in df.columns:
        encoder = LabelEncoder()
        df["low_type_code"] = _safe_encode(encoder, df["Low Threshold Type"])
        categorical_features.append("low_type_code")

    if "High Threshold Type" in df.columns:
        encoder = LabelEncoder()
        df["high_type_code"] = _safe_encode(encoder, df["High Threshold Type"])
        categorical_features.append("high_type_code")

    all_features = [c for c in numeric_features + categorical_features if c in df.columns]

    if not all_features:
        raise ValueError("No usable feature columns were detected after preprocessing.")

    return DataArtifacts(df=df, numeric_features=numeric_features, categorical_features=categorical_features, all_features=all_features)


class SeqDataset(Dataset):
    def __init__(
        self,
        seq_list: Sequence[Dict[str, np.ndarray]],
        scaler_x: StandardScaler,
        scaler_y_feat: StandardScaler,
        scaler_y_target: StandardScaler,
        all_features: Sequence[str],
        numeric_features: Sequence[str],
    ) -> None:
        self.seq_list = list(seq_list)
        self.scaler_x = scaler_x
        self.scaler_y_feat = scaler_y_feat
        self.scaler_y_target = scaler_y_target
        self._all_count = len(all_features)
        self._numeric_count = len(numeric_features)

    def __len__(self) -> int:
        return len(self.seq_list)

    def __getitem__(self, idx: int) -> Dict[str, np.ndarray]:
        sample = self.seq_list[idx]
        x = self.scaler_x.transform(sample["x"].reshape(-1, self._all_count)).astype(np.float32)
        y_feat = self.scaler_y_feat.transform(sample["y_features"].reshape(-1, self._numeric_count)).astype(np.float32)
        y_target = self.scaler_y_target.transform(sample["y_target"].reshape(-1, 1)).astype(np.float32)
        return {"x": x, "y_feat": y_feat, "y_target": y_target}


class Attention(nn.Module):
    def __init__(self, enc_hidden: int, dec_hidden: int) -> None:
        super().__init__()
        self.attn = nn.Linear(enc_hidden + dec_hidden, dec_hidden)
        self.context_vector = nn.Parameter(torch.rand(dec_hidden))

    def forward(self, hidden: torch.Tensor, encoder_outputs: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor]:
        batch_size, time_steps, _ = encoder_outputs.size()
        hidden_expanded = hidden.unsqueeze(1).repeat(1, time_steps, 1)
        energy = torch.tanh(self.attn(torch.cat([hidden_expanded, encoder_outputs], dim=2)))
        scores = energy @ self.context_vector
        attn_weights = torch.softmax(scores, dim=1)
        context = (attn_weights.unsqueeze(2) * encoder_outputs).sum(dim=1)
        return context, attn_weights


class Seq2SeqModel(nn.Module):
    def __init__(
        self,
        input_dim: int,
        numeric_dim: int,
        horizon: int,
        enc_hidden: int,
        dec_hidden: int,
        feat_out_dim: int,
        dropout: float,
    ) -> None:
        super().__init__()
        self.numeric_dim = numeric_dim
        self.cat_dim = input_dim - numeric_dim
        self.horizon = horizon
        self.encoder = nn.LSTM(input_dim, enc_hidden, batch_first=True)
        self.decoder_cell = nn.LSTMCell(input_dim, dec_hidden)
        self.attention = Attention(enc_hidden, dec_hidden)
        self.dropout = nn.Dropout(dropout)
        self.feat_head = nn.Sequential(
            nn.Linear(dec_hidden + enc_hidden, 128),
            nn.ReLU(),
            nn.Linear(128, feat_out_dim),
        )
        self.target_head = nn.Sequential(
            nn.Linear(dec_hidden + enc_hidden, 64),
            nn.ReLU(),
            nn.Linear(64, 1),
        )

    def forward(
        self,
        x: torch.Tensor,
        future_numeric: torch.Tensor | None = None,
        teacher_forcing_prob: float = 0.0,
    ) -> Tuple[torch.Tensor, torch.Tensor]:
        batch_size = x.size(0)
        enc_outputs, _ = self.encoder(x)
        h_dec = torch.zeros((batch_size, self.decoder_cell.hidden_size), device=x.device)
        c_dec = torch.zeros((batch_size, self.decoder_cell.hidden_size), device=x.device)
        previous_input = x[:, -1, :]
        feat_preds: List[torch.Tensor] = []
        target_preds: List[torch.Tensor] = []

        for step in range(self.horizon):
            h_dec, c_dec = self.decoder_cell(previous_input, (h_dec, c_dec))
            context, _ = self.attention(h_dec, enc_outputs)
            combined = self.dropout(torch.cat([h_dec, context], dim=1))
            feat_out = self.feat_head(combined)
            target_out = self.target_head(combined)
            feat_preds.append(feat_out.unsqueeze(1))
            target_preds.append(target_out.unsqueeze(1))

            use_teacher = future_numeric is not None and torch.rand(()) < teacher_forcing_prob
            numeric_part = future_numeric[:, step, :] if use_teacher else feat_out

            if self.cat_dim > 0:
                cat_codes = x[:, -1, self.numeric_dim : self.numeric_dim + self.cat_dim]
                previous_input = torch.cat([numeric_part, cat_codes], dim=1)
            else:
                previous_input = numeric_part

        return torch.cat(feat_preds, dim=1), torch.cat(target_preds, dim=1)


def build_sequences(
    df: pd.DataFrame,
    cfg: ForecastConfig,
    all_features: Sequence[str],
    numeric_features: Sequence[str],
) -> List[Dict[str, np.ndarray]]:
    sequences: List[Dict[str, np.ndarray]] = []
    for dist, group in df.groupby(cfg.dist_col):
        ordered = group.sort_values(cfg.year_col).reset_index(drop=True)
        length = len(ordered)
        for start in range(0, length - cfg.history_len - cfg.horizon + 1):
            history = ordered.iloc[start : start + cfg.history_len]
            future = ordered.iloc[start + cfg.history_len : start + cfg.history_len + cfg.horizon]
            x = history[all_features].values.astype(float)
            y_feat = future[list(numeric_features)].values.astype(float)
            y_target = future[cfg.target_col].values.astype(float)
            sequences.append(
                {
                    "dist": dist,
                    "x": x,
                    "y_features": y_feat,
                    "y_target": y_target,
                }
            )
    return sequences


def split_sequences(
    sequences: Sequence[Dict[str, np.ndarray]],
    train_ids: set[str],
    val_ids: set[str],
) -> Tuple[List[Dict[str, np.ndarray]], List[Dict[str, np.ndarray]]]:
    train = [sample for sample in sequences if sample["dist"] in train_ids]
    val = [sample for sample in sequences if sample["dist"] in val_ids]
    return train, val


def fit_scalers(
    train_sequences: Sequence[Dict[str, np.ndarray]],
    all_features: Sequence[str],
    numeric_features: Sequence[str],
) -> Tuple[StandardScaler, StandardScaler, StandardScaler]:
    scaler_x = StandardScaler()
    scaler_y_feat = StandardScaler()
    scaler_y_target = StandardScaler()

    feature_count = len(all_features)
    numeric_count = len(numeric_features)

    x_flat = np.vstack([sample["x"].reshape(-1, feature_count) for sample in train_sequences])
    scaler_x.fit(x_flat)

    y_feat_flat = np.vstack([sample["y_features"].reshape(-1, numeric_count) for sample in train_sequences])
    scaler_y_feat.fit(y_feat_flat)

    y_target_flat = np.hstack([sample["y_target"].reshape(-1, 1) for sample in train_sequences])
    scaler_y_target.fit(y_target_flat.reshape(-1, 1))

    return scaler_x, scaler_y_feat, scaler_y_target


def _to_tensor(value: torch.Tensor | np.ndarray, device: torch.device) -> torch.Tensor:
    if isinstance(value, torch.Tensor):
        return value.to(device)
    return torch.as_tensor(value, dtype=torch.float32, device=device)


def train_model(
    model: Seq2SeqModel,
    cfg: ForecastConfig,
    train_loader: DataLoader,
    val_loader: DataLoader | None,
) -> Dict[str, float]:
    optimizer = torch.optim.Adam(model.parameters(), lr=cfg.learning_rate)
    criterion = nn.MSELoss()
    best_state = copy.deepcopy(model.state_dict())
    best_val = math.inf
    last_train = math.inf

    for epoch in range(1, cfg.epochs + 1):
        model.train()
        train_losses: List[float] = []
        for batch in train_loader:
            optimizer.zero_grad()
            x = _to_tensor(batch["x"], model.device)
            y_feat = _to_tensor(batch["y_feat"], model.device)
            y_target = _to_tensor(batch["y_target"], model.device)
            pred_feat, pred_target = model(x, future_numeric=y_feat, teacher_forcing_prob=cfg.teacher_forcing_prob)
            loss_feat = criterion(pred_feat, y_feat)
            loss_target = criterion(pred_target, y_target)
            loss = loss_feat + cfg.weight_target * loss_target
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 2.0)
            optimizer.step()
            train_losses.append(loss.item())

        last_train = float(np.mean(train_losses)) if train_losses else math.nan

        avg_val = math.nan
        if val_loader is not None:
            model.eval()
            val_losses: List[float] = []
            with torch.no_grad():
                for batch in val_loader:
                    x = _to_tensor(batch["x"], model.device)
                    y_feat = _to_tensor(batch["y_feat"], model.device)
                    y_target = _to_tensor(batch["y_target"], model.device)
                    pred_feat, pred_target = model(x)
                    loss_feat = criterion(pred_feat, y_feat)
                    loss_target = criterion(pred_target, y_target)
                    val_losses.append((loss_feat + cfg.weight_target * loss_target).item())
            if val_losses:
                avg_val = float(np.mean(val_losses))
                if avg_val < best_val:
                    best_val = avg_val
                    best_state = copy.deepcopy(model.state_dict())
                    if cfg.checkpoint_path:
                        torch.save(best_state, cfg.checkpoint_path)

        logger.info("Epoch %03d | Train %.6f | Val %.6f", epoch, last_train, avg_val)

    model.load_state_dict(best_state)
    return {"train_loss": last_train, "val_loss": best_val}


def build_model(cfg: ForecastConfig, numeric_dim: int, all_dim: int) -> Seq2SeqModel:
    model = Seq2SeqModel(
        input_dim=all_dim,
        numeric_dim=numeric_dim,
        horizon=cfg.horizon,
        enc_hidden=cfg.encoder_hidden,
        dec_hidden=cfg.decoder_hidden,
        feat_out_dim=numeric_dim,
        dropout=cfg.dropout,
    )
    device = torch.device(cfg.device)
    model.to(device)
    model.device = device  # type: ignore[attr-defined]
    return model


def dataloaders_from_sequences(
    train_sequences: Sequence[Dict[str, np.ndarray]],
    val_sequences: Sequence[Dict[str, np.ndarray]],
    cfg: ForecastConfig,
    scaler_x: StandardScaler,
    scaler_y_feat: StandardScaler,
    scaler_y_target: StandardScaler,
    all_features: Sequence[str],
    numeric_features: Sequence[str],
) -> Tuple[DataLoader, DataLoader | None]:
    train_dataset = SeqDataset(train_sequences, scaler_x, scaler_y_feat, scaler_y_target, all_features, numeric_features)
    val_dataset = SeqDataset(val_sequences, scaler_x, scaler_y_feat, scaler_y_target, all_features, numeric_features) if val_sequences else None

    train_loader = DataLoader(train_dataset, batch_size=cfg.batch_size, shuffle=True, drop_last=len(train_sequences) >= cfg.batch_size)
    val_loader = DataLoader(val_dataset, batch_size=cfg.batch_size, shuffle=False) if val_dataset is not None else None
    return train_loader, val_loader


def forecast_for_district(
    model: Seq2SeqModel,
    cfg: ForecastConfig,
    scalers: Tuple[StandardScaler, StandardScaler, StandardScaler],
    all_features: Sequence[str],
    numeric_features: Sequence[str],
    district_frame: pd.DataFrame,
    last_cat_values: np.ndarray,
    years_to_forecast: int,
) -> List[Dict[str, float]]:
    scaler_x, scaler_y_feat, scaler_y_target = scalers
    predictions: List[Dict[str, float]] = []
    history = district_frame.tail(cfg.history_len).reset_index(drop=True)
    if len(history) < cfg.history_len:
        return predictions

    remaining = years_to_forecast
    current_hist = history.copy()
    while remaining > 0:
        hist_values = current_hist[all_features].values.astype(float)
        hist_scaled = scaler_x.transform(hist_values).astype(np.float32)
        tensor_input = torch.as_tensor(hist_scaled, dtype=torch.float32, device=model.device).unsqueeze(0)
        with torch.no_grad():
            pred_feat_scaled, pred_target_scaled = model(tensor_input)
        pred_feat = scaler_y_feat.inverse_transform(pred_feat_scaled.squeeze(0).cpu().numpy())
        pred_target = scaler_y_target.inverse_transform(pred_target_scaled.squeeze(0).cpu().numpy())

        steps = min(cfg.horizon, remaining)
        for step in range(steps):
            next_year = int(current_hist[cfg.year_col].iloc[-1]) + 1
            row: Dict[str, float] = {cfg.year_col: float(next_year)}
            for idx, feature in enumerate(numeric_features):
                row[feature] = float(pred_feat[step, idx])
            row[cfg.target_col] = float(pred_target[step])
            row[cfg.dist_col] = current_hist[cfg.dist_col].iloc[-1]
            if cfg.state_col in current_hist.columns:
                row[cfg.state_col] = current_hist[cfg.state_col].iloc[-1]
            predictions.append(row)

            numeric_raw = pred_feat[step, :].tolist()
            combined_raw = np.array(numeric_raw + last_cat_values.tolist(), dtype=float).reshape(1, -1)
            combined_scaled = scaler_x.transform(combined_raw)
            combined_tensor = torch.as_tensor(combined_scaled, dtype=torch.float32, device=model.device)
            updated = torch.cat([
                torch.as_tensor(hist_scaled, dtype=torch.float32, device=model.device)[1:],
                combined_tensor,
            ], dim=0)
            hist_scaled = updated.cpu().numpy()
            next_row = pd.DataFrame([numeric_raw + last_cat_values.tolist()], columns=all_features)
            next_row[cfg.year_col] = next_year
            next_row[cfg.dist_col] = current_hist[cfg.dist_col].iloc[-1]
            if cfg.state_col in current_hist.columns:
                next_row[cfg.state_col] = current_hist[cfg.state_col].iloc[-1]
            current_hist = pd.concat([current_hist.iloc[1:], next_row], ignore_index=True)
            remaining -= 1
            if remaining <= 0:
                break

    return predictions


def run_food_insecurity_forecast(config: ForecastConfig | None = None) -> pd.DataFrame:
    cfg = config or ForecastConfig()
    module_dir = _module_dir()

    cfg.csv_path = Path(cfg.csv_path)
    if not cfg.csv_path.is_absolute():
        cfg.csv_path = module_dir / cfg.csv_path
    cfg.output_path = Path(cfg.output_path) if cfg.output_path else None
    if cfg.output_path and not cfg.output_path.is_absolute():
        cfg.output_path = module_dir / cfg.output_path
    cfg.checkpoint_path = Path(cfg.checkpoint_path) if cfg.checkpoint_path else None
    if cfg.checkpoint_path and not cfg.checkpoint_path.is_absolute():
        cfg.checkpoint_path = module_dir / cfg.checkpoint_path

    if cfg.output_path:
        cfg.output_path.parent.mkdir(parents=True, exist_ok=True)
    if cfg.checkpoint_path:
        cfg.checkpoint_path.parent.mkdir(parents=True, exist_ok=True)

    if (
        cfg.reuse_output
        and not cfg.force_refresh
        and cfg.output_path
        and cfg.output_path.exists()
    ):
        try:
            cached_df = pd.read_csv(cfg.output_path)
            cached_df.attrs["from_cache"] = True
            return cached_df
        except Exception as exc:  # pragma: no cover - cache fallback
            logger.warning("Failed to load cached predictions from %s: %s", cfg.output_path, exc)

    if not cfg.csv_path.exists():
        raise FileNotFoundError(f"CSV or Excel file not found at {cfg.csv_path!s}")

    set_seed(cfg.seed)
    artifacts = load_and_prepare_dataframe(cfg)
    sequences = build_sequences(artifacts.df, cfg, artifacts.all_features, artifacts.numeric_features)
    if not sequences:
        raise ValueError("No sequences could be constructed; check history length and horizon.")

    districts = list(artifacts.df[cfg.dist_col].dropna().astype(str).unique())
    random.shuffle(districts)
    cutoff = int(0.8 * len(districts))
    train_ids = set(districts[:cutoff])
    val_ids = set(districts[cutoff:])

    train_sequences, val_sequences = split_sequences(sequences, train_ids, val_ids)
    if not train_sequences:
        raise ValueError("Training split is empty; adjust configuration or dataset.")

    scaler_x, scaler_y_feat, scaler_y_target = fit_scalers(train_sequences, artifacts.all_features, artifacts.numeric_features)
    train_loader, val_loader = dataloaders_from_sequences(
        train_sequences,
        val_sequences,
        cfg,
        scaler_x,
        scaler_y_feat,
        scaler_y_target,
        artifacts.all_features,
        artifacts.numeric_features,
    )

    model = build_model(cfg, len(artifacts.numeric_features), len(artifacts.all_features))
    model_loaded = False
    if (
        cfg.reuse_model
        and not cfg.force_refresh
        and cfg.checkpoint_path
        and cfg.checkpoint_path.exists()
    ):
        try:
            map_location = torch.device(cfg.device) if cfg.device else torch.device("cpu")
            state_dict = torch.load(cfg.checkpoint_path, map_location=map_location)
            model.load_state_dict(state_dict)
            model_loaded = True
            logger.info("Loaded cached seq2seq weights from %s", cfg.checkpoint_path)
        except Exception as exc:  # pragma: no cover - checkpoint fallback
            logger.warning("Failed to load checkpoint at %s: %s", cfg.checkpoint_path, exc)

    if not model_loaded:
        train_model(model, cfg, train_loader, val_loader)

    predictions: List[Dict[str, float]] = []
    scaler_tuple = (scaler_x, scaler_y_feat, scaler_y_target)

    for dist, group in artifacts.df.groupby(cfg.dist_col):
        group = group.sort_values(cfg.year_col)
        if len(group) < cfg.history_len:
            continue
        if artifacts.categorical_features:
            last_cat_values = group[artifacts.categorical_features].iloc[-1].values.astype(float)
        else:
            last_cat_values = np.array([], dtype=float)
        preds = forecast_for_district(
            model,
            cfg,
            scaler_tuple,
            artifacts.all_features,
            artifacts.numeric_features,
            group,
            last_cat_values,
            years_to_forecast=len(cfg.future_years),
        )
        for idx, forecast_row in enumerate(preds):
            if idx < len(cfg.future_years):
                forecast_row[cfg.year_col] = cfg.future_years[idx]
                forecast_row[cfg.dist_col] = dist
        predictions.extend(preds)

    predictions_df = pd.DataFrame(predictions)
    if not predictions_df.empty:
        predictions_df = predictions_df.sort_values([cfg.dist_col, cfg.year_col])
        if cfg.output_path:
            cfg.output_path.parent.mkdir(parents=True, exist_ok=True)
            predictions_df.to_csv(cfg.output_path, index=False)
            logger.info("Saved predictions to %s", cfg.output_path)
        predictions_df.attrs["from_cache"] = False
    else:
        logger.warning("No predictions were generated; check dataset coverage.")
        predictions_df.attrs["from_cache"] = False

    return predictions_df

def _to_python_scalar(value: object) -> Any | None:
    if value is None:
        return None
    if isinstance(value, (float, int, str, bool)):
        if isinstance(value, float) and math.isnan(value):
            return None
        return value
    if isinstance(value, (np.floating, np.integer, np.bool_)):
        return _to_python_scalar(value.item())
    if isinstance(value, np.ndarray):
        return [_to_python_scalar(entry) for entry in value.tolist()]
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    if pd.isna(value):
        return None
    return value


def dataframe_to_forecast_rows(predictions: pd.DataFrame, cfg: ForecastConfig) -> List[Dict[str, Any]]:
    records: List[Dict[str, Any]] = []
    if predictions.empty:
        return records

    exclude_keys = {cfg.dist_col, cfg.year_col, cfg.target_col}
    if cfg.state_col:
        exclude_keys.add(cfg.state_col)

    for row in predictions.to_dict(orient="records"):
        district_raw = row.get(cfg.dist_col)
        if district_raw in {None, ""}:
            continue
        year_raw = row.get(cfg.year_col)
        try:
            year = int(float(year_raw)) if year_raw is not None else None
        except (TypeError, ValueError):
            year = None
        if year is None:
            continue
        payload: Dict[str, Any] = {}
        for key, value in row.items():
            if key in exclude_keys:
                continue
            cleaned = _to_python_scalar(value)
            if cleaned is None:
                continue
            payload[key] = cleaned

        record = {
            "district": str(district_raw),
            "state": row.get(cfg.state_col) if cfg.state_col in row else None,
            "year": year,
            "overall_rate": _to_python_scalar(row.get(cfg.target_col)),
            "payload": payload,
        }
        records.append(record)

    return records
