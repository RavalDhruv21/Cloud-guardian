"""
Downloads the NAB (Numenta Anomaly Benchmark) realAWSCloudwatch EC2 CPU
utilization traces + labels used by train_anomaly_model.py. Not committed to
the repo (see .gitignore) since it's easily re-fetched and not ours to vendor.

Usage:
    python ml/download_nab_data.py
"""
import os
import urllib.request

RAW_BASE = "https://raw.githubusercontent.com/numenta/NAB/master"
DATA_DIR = os.path.join(os.path.dirname(__file__), 'data', 'nab')
CSV_DIR = os.path.join(DATA_DIR, 'realAWSCloudwatch')

CPU_FILES = [
    'ec2_cpu_utilization_24ae8d.csv',
    'ec2_cpu_utilization_53ea38.csv',
    'ec2_cpu_utilization_5f5533.csv',
    'ec2_cpu_utilization_77c1ca.csv',
    'ec2_cpu_utilization_825cc2.csv',
    'ec2_cpu_utilization_ac20cd.csv',
    'ec2_cpu_utilization_c6585a.csv',
    'ec2_cpu_utilization_fe7f93.csv',
]


def download(url, dest):
    print(f"Fetching {url} -> {dest}")
    urllib.request.urlretrieve(url, dest)


def main():
    os.makedirs(CSV_DIR, exist_ok=True)
    download(f"{RAW_BASE}/labels/combined_windows.json", os.path.join(DATA_DIR, 'combined_windows.json'))
    for fname in CPU_FILES:
        download(f"{RAW_BASE}/data/realAWSCloudwatch/{fname}", os.path.join(CSV_DIR, fname))
    print("Done.")


if __name__ == '__main__':
    main()
