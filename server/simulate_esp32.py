"""Stand-in for real ESP32 hardware: fires a POST /api/v1/calls like the firmware would,
or (with --heartbeat) a POST /api/v1/devices/heartbeat.

In the multi-tenant backend each device has its own per-device plaintext key
(returned once by POST /api/v1/devices) -- there is no global shared secret anymore.

Usage:
    python simulate_esp32.py --code 123456 --device floor2-esp32-01 --key dk_xxxxx [--base-url http://localhost:8000]
    python simulate_esp32.py --heartbeat --device floor2-esp32-01 --key dk_xxxxx
"""

import argparse

import requests


def main() -> None:
    parser = argparse.ArgumentParser(description="Simulate an ESP32 SOS button press or heartbeat")
    parser.add_argument("--code", type=int, help="ev1527_code from the RF button (required unless --heartbeat)")
    parser.add_argument("--device", type=str, required=True, help="device_id of the sending ESP32")
    parser.add_argument("--key", type=str, required=True, help="this device's own plaintext API key")
    parser.add_argument("--heartbeat", action="store_true", help="send a heartbeat instead of a button press")
    parser.add_argument("--base-url", type=str, default="http://localhost:8000")
    args = parser.parse_args()

    if args.heartbeat:
        url = f"{args.base_url}/api/v1/devices/heartbeat"
        payload = {"device_id": args.device}
    else:
        if args.code is None:
            parser.error("--code is required unless --heartbeat is given")
        url = f"{args.base_url}/api/v1/calls"
        payload = {"ev1527_code": args.code, "device_id": args.device}

    resp = requests.post(url, json=payload, headers={"X-Device-Key": args.key}, timeout=5)
    print(f"POST {url} -> {resp.status_code}")
    print(resp.text)


if __name__ == "__main__":
    main()
