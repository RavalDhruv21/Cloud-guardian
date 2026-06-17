import pytest
from unittest.mock import patch, MagicMock
import json
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from lambdas.ai_analyzer.handler import call_gemini

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