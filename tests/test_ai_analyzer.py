import pytest
from unittest.mock import patch, MagicMock
import json
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from lambdas.ai_analyzer.handler import call_gemini, build_feature_vector, deterministic_check
from lambdas.ai_analyzer import recommendations

def test_call_gemini_returns_valid_structure():
    """Should return properly structured diagnosis"""

    mock_response = {
        "anomaly_detected": True,
        "severity": "high",
        "summary": "EC2 CPU at 94% for extended period",
        "likely_cause": "Runaway process or cryptominer",
        "recommended_action": "SSH into instance and check top/htop",
        "estimated_monthly_cost_impact": "$15 extra in compute costs"
    }

    with patch('lambdas.ai_analyzer.handler.requests.post') as mock_post:
        mock_post.return_value.json.return_value = {
            'candidates': [{
                'content': {
                    'parts': [{'text': json.dumps(mock_response)}]
                }
            }]
        }
        mock_post.return_value.raise_for_status = MagicMock()

        metrics = {"instance_id": "i-test", "cpu_avg": 94.5, "cpu_max": 98.2}
        result = call_gemini(metrics)

        assert result['anomaly_detected'] == True
        assert result['severity'] == 'high'
        assert 'recommended_action' in result
        assert 'likely_cause' in result


def test_build_feature_vector_length_and_order():
    """Feature vector must have 18 values: 9 CPU features + 2 each for
    network_in/network_out/ebs_read_ops/ebs_write_ops + status_check_failed,
    matching ml/train_anomaly_model.py's FEATURE_COLUMNS."""
    metric = {
        'cpu_avg': 40.0, 'cpu_max': 60.0, 'cpu_avg_24h': 35.0,
        'sustained_high_minutes': 0, 'rate_of_change': 1.0,
        'cpu_std_24h': 5.0, 'cpu_avg_1h': 38.0,
        'network_in_avg': 1_000_000, 'network_in_avg_24h': 900_000, 'network_in_std_24h': 50_000,
        'status_check_failed': 0,
        'timestamp': '2025-01-01T12:00:00',
    }
    features = build_feature_vector(metric)
    assert len(features) == 18
    assert features[0] == 40.0  # cpu_avg
    assert features[1] == 60.0  # cpu_max
    assert features[-1] == 0    # status_check_failed


def test_build_feature_vector_missing_extra_metrics_defaults_to_normal():
    """Instances without network/disk data (or old records) shouldn't crash —
    missing metrics should default to a 'looks normal' z-score of 0."""
    metric = {'cpu_avg': 10.0, 'cpu_max': 15.0, 'cpu_avg_24h': 10.0, 'timestamp': '2025-01-01T00:00:00'}
    features = build_feature_vector(metric)
    assert len(features) == 18
    # network_in_avg (index 9) defaults to 0.0, its z-score (index 10) to 0.0
    assert features[9] == 0.0
    assert features[10] == 0.0


def test_deterministic_check_status_check_failed_is_critical():
    diagnosis = deterministic_check({'cpu_avg': 5.0, 'status_check_failed': 1})
    assert diagnosis['anomaly_detected'] is True
    assert diagnosis['severity'] == 'critical'
    assert 'status check' in diagnosis['summary'].lower()


def test_deterministic_check_high_memory_flags_anomaly():
    diagnosis = deterministic_check({'cpu_avg': 20.0, 'mem_used_percent': 95.0})
    assert diagnosis['anomaly_detected'] is True
    assert diagnosis['severity'] == 'critical'


def test_deterministic_check_no_breach_returns_none():
    assert deterministic_check({'cpu_avg': 20.0, 'mem_used_percent': 40.0}) is None


def test_recommendations_sustained_cpu_and_network_suggests_auto_scaling():
    metric = {
        'cpu_avg': 85.0, 'sustained_high_minutes': 30,
        'network_in_avg': 80 * 1024 * 1024,
    }
    suggestions = recommendations.derive_recommendations(metric)
    assert any('Auto Scaling' in s for s in suggestions)


def test_recommendations_high_network_alone_suggests_load_balancer():
    metric = {'cpu_avg': 20.0, 'network_out_avg': 90 * 1024 * 1024}
    suggestions = recommendations.derive_recommendations(metric)
    assert any('Load Balancer' in s for s in suggestions)


def test_recommendations_high_disk_ops_suggests_ebs_review():
    metric = {'ebs_write_ops_avg': 5000}
    suggestions = recommendations.derive_recommendations(metric)
    assert any('IOPS' in s or 'EBS' in s for s in suggestions)


def test_recommendations_empty_when_nothing_stands_out():
    metric = {'cpu_avg': 20.0, 'network_in_avg': 1000, 'ebs_read_ops_avg': 50}
    assert recommendations.derive_recommendations(metric) == []