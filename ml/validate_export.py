"""
Confirms the pure-Python export in lambdas/ai_analyzer/ml_model.py produces
identical predict() results to the real sklearn model, on both the training
data and the held-out test files. Run after every export_model.py run.

Usage:
    python ml/validate_export.py
"""
import os
import sys

import joblib

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from lambdas.ai_analyzer import ml_model
from train_anomaly_model import build_dataset  # noqa: E402  (needs sys.path above only for ai_analyzer import)

MODEL_PATH = os.path.join(os.path.dirname(__file__), 'anomaly_model.joblib')


def main():
    sys.path.insert(0, os.path.dirname(__file__))
    bundle = joblib.load(MODEL_PATH)
    sk_model = bundle['model']
    feature_columns = bundle['feature_columns']

    train, test, _ = build_dataset()

    mismatches = 0
    checked = 0
    for name, df in [('train', train), ('test', test)]:
        X = df[feature_columns].values
        sk_pred = sk_model.predict(X)  # -1 anomaly, 1 normal
        sk_scores = sk_model.score_samples(X)

        for i in range(len(df)):
            row = X[i].tolist()
            py_is_anom = ml_model.is_anomaly(row)
            sk_is_anom = sk_pred[i] == -1
            checked += 1
            if py_is_anom != sk_is_anom:
                mismatches += 1
                if mismatches <= 5:
                    print(f"MISMATCH [{name}] idx={i}: sklearn={sk_is_anom} python={py_is_anom} "
                          f"features={row}")

        # Spot-check the raw score formula matches too, not just the binary label
        py_score0 = ml_model.anomaly_score(X[0].tolist())
        sk_score0 = -sk_scores[0]  # sklearn's public score_samples negates the raw isolation score
        print(f"[{name}] raw score check: python={py_score0:.6f} sklearn={sk_score0:.6f} "
              f"diff={abs(py_score0 - sk_score0):.2e}")

    print(f"\nChecked {checked} points, {mismatches} mismatches "
          f"({'PASS' if mismatches == 0 else 'FAIL'})")
    return mismatches == 0


if __name__ == '__main__':
    ok = main()
    sys.exit(0 if ok else 1)
