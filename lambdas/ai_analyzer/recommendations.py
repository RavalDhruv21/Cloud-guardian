"""
Turns an enriched metric dict (see collector/handler.py and
ai_analyzer/handler.py's get_live_metrics) into actionable infrastructure
suggestions, independent of whatever anomaly diagnosis was reached. Pure
pattern-matching over thresholds — no AI call, no state — so it's cheap to
run on every diagnosed metric and deterministic to test.

These are suggestions, not the anomaly diagnosis itself: a metric can trip
zero, one, or several of these at once (e.g. a single instance under load
might get both the Auto Scaling and Load Balancer suggestions).
"""

# Same sustained-high-CPU bar the deterministic anomaly check uses.
SUSTAINED_CPU_THRESHOLD = 80.0
SUSTAINED_MINUTES_THRESHOLD = 15

# Bytes/5-min average above which network traffic is considered "high" —
# roughly 50 Mbps sustained (typical single small/medium instance ceiling
# before it becomes the bottleneck).
HIGH_NETWORK_BYTES = 50 * 1024 * 1024

# EBS ops/5-min average above which disk I/O is considered "high" for a
# general-purpose (gp2/gp3) volume baseline.
HIGH_EBS_OPS = 3000

MEM_HIGH_THRESHOLD = 80.0


def derive_recommendations(metric):
    """Returns a list of human-readable suggestion strings for this metric.
    Empty list means nothing actionable stood out."""
    suggestions = []

    cpu_avg = metric.get('cpu_avg', 0.0)
    sustained_high_minutes = metric.get('sustained_high_minutes', 0)
    network_in = metric.get('network_in_avg', 0.0)
    network_out = metric.get('network_out_avg', 0.0)
    ebs_read_ops = metric.get('ebs_read_ops_avg', 0.0)
    ebs_write_ops = metric.get('ebs_write_ops_avg', 0.0)
    high_network = network_in > HIGH_NETWORK_BYTES or network_out > HIGH_NETWORK_BYTES
    sustained_high_cpu = cpu_avg > SUSTAINED_CPU_THRESHOLD and sustained_high_minutes >= SUSTAINED_MINUTES_THRESHOLD

    if sustained_high_cpu and high_network:
        suggestions.append(
            'Sustained high CPU with high network throughput suggests this instance is '
            'saturated by real traffic — consider an Auto Scaling Group to scale out '
            'horizontally instead of vertically resizing.'
        )
    elif high_network:
        suggestions.append(
            'This instance is carrying high, sustained network traffic on its own — '
            'consider placing it behind an Application Load Balancer so traffic can be '
            'distributed across multiple instances.'
        )

    if ebs_read_ops > HIGH_EBS_OPS or ebs_write_ops > HIGH_EBS_OPS:
        suggestions.append(
            'EBS read/write ops are running high relative to a typical gp2/gp3 baseline — '
            'review the volume type and provisioned IOPS (e.g. upgrade to gp3 or io2) to '
            'avoid I/O-bound performance issues.'
        )

    if metric.get('status_check_failed'):
        suggestions.append(
            'Instance is failing its AWS status check — investigate reachability first; '
            'if it recurs, consider replacing the instance.'
        )

    mem_used_percent = metric.get('mem_used_percent')
    if mem_used_percent is not None and mem_used_percent > MEM_HIGH_THRESHOLD:
        suggestions.append(
            'Memory usage is consistently high — right-size to a memory-optimized instance '
            'type or investigate a possible memory leak in the running application.'
        )

    return suggestions
