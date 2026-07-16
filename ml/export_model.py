"""
Exports the trained IsolationForest (ml/anomaly_model.joblib) to a portable
JSON tree representation, so ai_analyzer's Lambda can score anomalies without
scikit-learn/numpy/scipy at runtime (those alone are ~270MB unzipped — over
Lambda's 250MB combined unzipped limit even before adding a model or the
Lambda's other deps). The exported JSON is scored by a small dependency-free
Python reimplementation of sklearn's IsolationForest math (see
lambdas/ai_analyzer/ml_model.py) — validate_export.py checks the two agree
exactly before this is trusted.

Usage:
    python ml/export_model.py
"""
import json
import os

import joblib

MODEL_PATH = os.path.join(os.path.dirname(__file__), 'anomaly_model.joblib')
EXPORT_PATH = os.path.join(os.path.dirname(__file__), '..', 'lambdas', 'ai_analyzer', 'anomaly_model.json')


def export_tree(estimator, feature_indices):
    t = estimator.tree_
    return {
        'children_left': t.children_left.tolist(),
        'children_right': t.children_right.tolist(),
        'feature': [int(feature_indices[f]) if f >= 0 else -2 for f in t.feature],
        'threshold': t.threshold.tolist(),
        'n_node_samples': t.n_node_samples.tolist(),
    }


def main():
    bundle = joblib.load(MODEL_PATH)
    model = bundle['model']

    trees = [
        export_tree(est, model.estimators_features_[i])
        for i, est in enumerate(model.estimators_)
    ]

    export = {
        'feature_columns': bundle['feature_columns'],
        'offset': float(model.offset_),
        'max_samples': int(model.max_samples_),
        'n_estimators': len(trees),
        'trees': trees,
        'train_metrics': bundle['train_metrics'],
        'test_metrics': bundle['test_metrics'],
    }

    with open(EXPORT_PATH, 'w') as f:
        json.dump(export, f)

    size_kb = os.path.getsize(EXPORT_PATH) / 1024
    print(f"Exported {len(trees)} trees ({len(export['feature_columns'])} features) "
          f"to {EXPORT_PATH} ({size_kb:.0f} KB)")


if __name__ == '__main__':
    main()
