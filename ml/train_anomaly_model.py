"""
Trains an Isolation Forest anomaly detector on NAB's realAWSCloudwatch EC2 CPU
utilization traces, using the same features the collector/ai_analyzer Lambdas
already compute in production (cpu_avg, cpu_max, cpu_avg_24h,
sustained_high_minutes) plus rate-of-change and time-of-day.

Data: ml/data/nab/realAWSCloudwatch/*.csv (5-min CPU% samples)
Labels: ml/data/nab/combined_windows.json (labeled anomaly time windows)

Usage:
    python ml/train_anomaly_model.py
"""
import json
import os

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.metrics import precision_score, recall_score, f1_score, confusion_matrix

DATA_DIR = os.path.join(os.path.dirname(__file__), 'data', 'nab')
CSV_DIR = os.path.join(DATA_DIR, 'realAWSCloudwatch')
LABELS_PATH = os.path.join(DATA_DIR, 'combined_windows.json')
MODEL_OUT_PATH = os.path.join(os.path.dirname(__file__), 'anomaly_model.joblib')

# Held out entirely from training so eval numbers reflect generalization, not
# memorization. c6585a has zero labeled anomalies (tests false-positive rate);
# fe7f93 has 3 windows (tests recall).
TEST_FILES = {'ec2_cpu_utilization_c6585a.csv', 'ec2_cpu_utilization_fe7f93.csv'}

# Mirrors sustained_high_minutes' 80% threshold in ai_analyzer/handler.py
SUSTAINED_HIGH_THRESHOLD = 80.0
ROLLING_WINDOW_POINTS = 288  # 24h at 5-min granularity, same as collector's window


def load_nab_file(filename):
    df = pd.read_csv(os.path.join(CSV_DIR, filename))
    df['timestamp'] = pd.to_datetime(df['timestamp'])
    df = df.sort_values('timestamp').reset_index(drop=True)
    df['source_file'] = filename
    return df


def label_anomalies(df, windows):
    df['is_anomaly'] = 0
    for start, end in windows:
        start_ts, end_ts = pd.Timestamp(start), pd.Timestamp(end)
        mask = (df['timestamp'] >= start_ts) & (df['timestamp'] <= end_ts)
        df.loc[mask, 'is_anomaly'] = 1
    return df


SHORT_WINDOW_POINTS = 12  # 1h at 5-min granularity — captures recent short-term level
EPS = 1e-6


def engineer_features(df):
    """
    Reproduces the same fields ai_analyzer/handler.py's metrics carry:
    cpu_avg (current snapshot), cpu_max / cpu_avg_24h / sustained_high_minutes
    (all trailing 24h) — plus z-score-style deviation features, since NAB's
    real anomalies are mostly sustained level-shifts (e.g. baseline creeping
    from 5% to 30% CPU) rather than single-point spikes, and raw magnitude
    features alone don't separate those from a instance that's just normally
    busier. All rolling windows are trailing-only (causal), matching what's
    actually available at inference time in production.
    """
    df = df.copy()
    df['cpu_avg'] = df['value']

    long_roll = df['value'].rolling(window=ROLLING_WINDOW_POINTS, min_periods=1)
    df['cpu_max'] = long_roll.max()
    df['cpu_avg_24h'] = long_roll.mean()
    long_std = long_roll.std().fillna(0.0)

    short_roll = df['value'].rolling(window=SHORT_WINDOW_POINTS, min_periods=1)
    short_mean = short_roll.mean()

    df['sustained_high_minutes'] = (
        df['value'].gt(SUSTAINED_HIGH_THRESHOLD)
        .rolling(window=ROLLING_WINDOW_POINTS, min_periods=1)
        .sum() * 5
    )
    df['rate_of_change'] = df['value'].diff().fillna(0.0)

    # How unusual the current point is vs. its own trailing 24h baseline.
    df['z_score_24h'] = (df['value'] - df['cpu_avg_24h']) / (long_std + EPS)
    # Whether the last hour's average has drifted from the 24h baseline —
    # catches sustained shifts that a single-point z-score misses.
    df['short_vs_long_shift'] = (short_mean - df['cpu_avg_24h']) / (long_std + EPS)

    hour_frac = df['timestamp'].dt.hour + df['timestamp'].dt.minute / 60.0
    df['hour_sin'] = np.sin(2 * np.pi * hour_frac / 24)
    df['hour_cos'] = np.cos(2 * np.pi * hour_frac / 24)
    return df


FEATURE_COLUMNS = [
    'cpu_avg', 'cpu_max', 'cpu_avg_24h', 'sustained_high_minutes',
    'rate_of_change', 'z_score_24h', 'short_vs_long_shift',
    'hour_sin', 'hour_cos',
]


def build_dataset():
    with open(LABELS_PATH) as f:
        all_windows = json.load(f)

    frames = []
    for fname in sorted(os.listdir(CSV_DIR)):
        df = load_nab_file(fname)
        windows = all_windows.get(f'realAWSCloudwatch/{fname}', [])
        df = label_anomalies(df, windows)
        df = engineer_features(df)
        frames.append(df)

    full = pd.concat(frames, ignore_index=True)
    train = full[~full['source_file'].isin(TEST_FILES)].reset_index(drop=True)
    test = full[full['source_file'].isin(TEST_FILES)].reset_index(drop=True)
    return train, test, all_windows


def evaluate(model, df, label):
    """
    Point-level precision/recall — informative but harsh here, since NAB
    labels a wide buffer window (hours) around each anomaly's onset and much
    of that window still looks normal. Kept for completeness alongside the
    window-level scoring below, which is what actually matters operationally.
    """
    X = df[FEATURE_COLUMNS]
    raw_pred = model.predict(X)  # -1 = anomaly, 1 = normal
    pred = (raw_pred == -1).astype(int)
    y_true = df['is_anomaly'].values

    precision = precision_score(y_true, pred, zero_division=0)
    recall = recall_score(y_true, pred, zero_division=0)
    f1 = f1_score(y_true, pred, zero_division=0)
    tn, fp, fn, tp = confusion_matrix(y_true, pred, labels=[0, 1]).ravel()

    print(f"\n[{label}] point-level: n={len(df)}  true_anomalies={y_true.sum()}  flagged={pred.sum()}")
    print(f"  precision={precision:.3f}  recall={recall:.3f}  f1={f1:.3f}")
    print(f"  tp={tp}  fp={fp}  fn={fn}  tn={tn}")
    return {'precision': precision, 'recall': recall, 'f1': f1, 'tp': int(tp), 'fp': int(fp), 'fn': int(fn), 'tn': int(tn)}, pred


def evaluate_windows(df, pred, all_windows, label):
    """
    Event-level scoring: a labeled anomaly window counts as detected if the
    model flags ANY point inside it (matches how ai_analyzer would actually
    be used — did we catch the incident while it was happening). False
    positive rate is flagged points that fall outside every window, as a
    fraction of all non-window points (i.e. how often it'd cry wolf during
    normal operation).
    """
    df = df.copy()
    df['pred'] = pred
    total_windows = 0
    detected_windows = 0

    for fname in df['source_file'].unique():
        file_df = df[df['source_file'] == fname]
        windows = all_windows.get(f'realAWSCloudwatch/{fname}', [])
        for start, end in windows:
            total_windows += 1
            start_ts, end_ts = pd.Timestamp(start), pd.Timestamp(end)
            in_window = file_df[(file_df['timestamp'] >= start_ts) & (file_df['timestamp'] <= end_ts)]
            if in_window['pred'].sum() > 0:
                detected_windows += 1

    normal_points = df[df['is_anomaly'] == 0]
    fp_rate = normal_points['pred'].mean() if len(normal_points) else 0.0
    detection_rate = detected_windows / total_windows if total_windows else 0.0

    print(f"[{label}] window-level: detected {detected_windows}/{total_windows} anomaly events "
          f"({detection_rate:.0%}), false-positive rate on normal points={fp_rate:.3f}")
    return {'detected_windows': detected_windows, 'total_windows': total_windows,
            'detection_rate': detection_rate, 'false_positive_rate': fp_rate}


def main():
    train, test, all_windows = build_dataset()

    contamination = train['is_anomaly'].mean()
    contamination = min(max(contamination, 0.01), 0.3)  # IsolationForest requires (0, 0.5]
    print(f"Training on {len(train)} points from {train['source_file'].nunique()} files "
          f"(estimated contamination={contamination:.3f})")
    print(f"Holding out {len(test)} points from {sorted(TEST_FILES)} for evaluation")

    model = IsolationForest(
        n_estimators=200,
        contamination=contamination,
        random_state=42,
        n_jobs=-1,
    )
    model.fit(train[FEATURE_COLUMNS])

    train_point_metrics, train_pred = evaluate(model, train, 'train (in-sample)')
    train_window_metrics = evaluate_windows(train, train_pred, all_windows, 'train (in-sample)')

    test_point_metrics, test_pred = evaluate(model, test, 'test (held-out files)')
    test_window_metrics = evaluate_windows(test, test_pred, all_windows, 'test (held-out files)')

    joblib.dump({
        'model': model,
        'feature_columns': FEATURE_COLUMNS,
        'contamination': contamination,
        'train_metrics': {**train_point_metrics, **train_window_metrics},
        'test_metrics': {**test_point_metrics, **test_window_metrics},
    }, MODEL_OUT_PATH)
    print(f"\nSaved model to {MODEL_OUT_PATH}")


if __name__ == '__main__':
    main()
