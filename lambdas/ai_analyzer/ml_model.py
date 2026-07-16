"""
Dependency-free reimplementation of sklearn IsolationForest scoring, so
ai_analyzer can run anomaly inference without scikit-learn/numpy at runtime
(see ml/export_model.py for why). Scores the exported tree JSON using the
same math as sklearn's IsolationForest.score_samples/decision_function/
predict — validated against the real sklearn model in ml/validate_export.py.
"""
import json
import math
import os

_EULER_GAMMA = 0.5772156649015329
_MODEL_PATH = os.path.join(os.path.dirname(__file__), 'anomaly_model.json')

_model = None


def _load_model():
    global _model
    if _model is None:
        with open(_MODEL_PATH) as f:
            _model = json.load(f)
    return _model


def _average_path_length(n):
    """Expected path length of an unsuccessful BST search over n samples —
    sklearn's correction for leaves that terminated early with >1 sample."""
    if n <= 1:
        return 0.0
    if n == 2:
        return 1.0
    return 2.0 * (math.log(n - 1.0) + _EULER_GAMMA) - 2.0 * (n - 1.0) / n


def _path_length(tree, x):
    node = 0
    depth = 0
    children_left = tree['children_left']
    children_right = tree['children_right']
    feature = tree['feature']
    threshold = tree['threshold']
    while children_left[node] != -1:
        if x[feature[node]] <= threshold[node]:
            node = children_left[node]
        else:
            node = children_right[node]
        depth += 1
    return depth + _average_path_length(tree['n_node_samples'][node])


def anomaly_score(feature_vector):
    """
    feature_vector: list of floats in the same order as model['feature_columns'].
    Returns a raw isolation score in ~[0, 1] — higher means more anomalous
    (matches sklearn's internal _compute_score_samples, before the sign flip
    sklearn's public score_samples() applies).
    """
    model = _load_model()
    total_depth = sum(_path_length(tree, feature_vector) for tree in model['trees'])
    avg_depth = total_depth / model['n_estimators']
    denominator = _average_path_length(model['max_samples'])
    return 2.0 ** (-avg_depth / denominator)


def is_anomaly(feature_vector):
    """Mirrors sklearn's IsolationForest.predict() == -1 condition exactly:
    decision_function(x) = -anomaly_score(x) - offset_ < 0."""
    model = _load_model()
    return anomaly_score(feature_vector) > -model['offset']


def feature_columns():
    return _load_model()['feature_columns']
