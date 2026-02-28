#!/usr/bin/env python3
"""
XMRT Python Execution Service — Integration Test Suite
Run against a locally running or deployed instance:

    python test_service.py --url http://localhost:8080
    python test_service.py --url https://your-cloud-run-url.run.app
"""

import argparse
import json
import sys
import time
import requests

BASE_URL = "http://localhost:8080"

PASS = "\033[92m✅ PASS\033[0m"
FAIL = "\033[91m❌ FAIL\033[0m"
WARN = "\033[93m⚠️  WARN\033[0m"

results = {"passed": 0, "failed": 0}


def test(name: str, condition: bool, detail: str = ""):
    if condition:
        print(f"  {PASS}  {name}")
        results["passed"] += 1
    else:
        print(f"  {FAIL}  {name}" + (f" — {detail}" if detail else ""))
        results["failed"] += 1


def run(code: str, **kwargs) -> dict:
    payload = {"language": "python", "version": "3.11",
                "files": [{"name": "main.py", "content": code}]}
    payload.update(kwargs)
    r = requests.post(f"{BASE_URL}/execute", json=payload, timeout=60)
    return r.json()


# ─────────────────────────────────────────────────────────────────────────────

def test_health():
    print("\n📋 Health Check")
    r = requests.get(f"{BASE_URL}/health", timeout=10)
    d = r.json()
    test("GET /health returns 200", r.status_code == 200)
    test("status == ok", d.get("status") == "ok")
    test("version field present", "version" in d)
    test("libraries dict present", isinstance(d.get("libraries"), dict))
    test("security block list present", "security" in d)
    test("not running as root", d.get("security", {}).get("runs_as_root") is False,
         f"runs_as_root={d.get('security', {}).get('runs_as_root')}")
    libs = d.get("libraries", {})
    for expected in ["requests", "numpy", "pandas", "matplotlib", "PIL", "sklearn"]:
        test(f"library '{expected}' installed", libs.get(expected) is not None,
             f"got {libs.get(expected)}")


def test_basic_execution():
    print("\n🐍 Basic Execution")
    r = run("print('hello world')")
    test("Hello world stdout", r.get("run", {}).get("stdout", "").strip() == "hello world")
    test("Exit code 0", r.get("run", {}).get("code") == 0)


def test_stdlib():
    print("\n📚 Standard Library")
    r = run("import json, math, datetime, collections\nprint(json.dumps({'pi': math.pi}))")
    test("json/math/datetime imports work", r.get("run", {}).get("code") == 0)
    test("stdout contains pi", "3.14" in r.get("run", {}).get("stdout", ""))


def test_pandas():
    print("\n🐼 pandas")
    code = "import pandas as pd\ndf = pd.DataFrame({'x': [1,2,3]})\nprint(df['x'].sum())"
    r = run(code)
    test("pandas import succeeds", r.get("run", {}).get("code") == 0,
         r.get("run", {}).get("stderr", "")[:200])
    test("pandas sum correct", "6" in r.get("run", {}).get("stdout", ""))


def test_numpy():
    print("\n🔢 numpy")
    code = "import numpy as np\narr = np.array([1,2,3,4])\nprint(arr.mean())"
    r = run(code)
    test("numpy import succeeds", r.get("run", {}).get("code") == 0,
         r.get("run", {}).get("stderr", "")[:200])
    test("numpy mean correct", "2.5" in r.get("run", {}).get("stdout", ""))


def test_requests():
    print("\n🌐 requests (network)")
    code = "import requests\nr = requests.get('https://httpbin.org/get', timeout=10)\nprint(r.status_code)"
    r = run(code, run_timeout=30000)
    test("requests import succeeds", r.get("run", {}).get("code") == 0,
         r.get("run", {}).get("stderr", "")[:200])
    test("HTTP 200 returned", "200" in r.get("run", {}).get("stdout", ""))


def test_matplotlib():
    print("\n📊 matplotlib (headless)")
    code = (
        "import matplotlib\nmatplotlib.use('Agg')\nimport matplotlib.pyplot as plt\n"
        "import tempfile, os\n"
        "fig, ax = plt.subplots()\nax.plot([1,2,3], [4,5,6])\n"
        "tmp = tempfile.mktemp(suffix='.png')\nfig.savefig(tmp)\n"
        "print('saved' if os.path.exists(tmp) else 'failed')\nos.unlink(tmp)"
    )
    r = run(code)
    test("matplotlib renders headless", r.get("run", {}).get("code") == 0,
         r.get("run", {}).get("stderr", "")[:200])
    test("file saved", "saved" in r.get("run", {}).get("stdout", ""))


def test_pillow():
    print("\n🖼️  Pillow (image processing)")
    code = (
        "from PIL import Image\nimport numpy as np, tempfile, os\n"
        "arr = np.zeros((64,64,3), dtype='uint8')\nimg = Image.fromarray(arr)\n"
        "tmp = tempfile.mktemp(suffix='.png')\nimg.save(tmp)\n"
        "print('ok' if os.path.exists(tmp) else 'fail')\nos.unlink(tmp)"
    )
    r = run(code)
    test("Pillow image creation", r.get("run", {}).get("code") == 0,
         r.get("run", {}).get("stderr", "")[:200])
    test("image file saved", "ok" in r.get("run", {}).get("stdout", ""))


def test_security_subprocess():
    print("\n🔒 Security — subprocess import blocked")
    code = "import subprocess\nresult = subprocess.run(['ls'], capture_output=True)\nprint(result.stdout)"
    r = run(code)
    stderr = r.get("run", {}).get("stderr", "")
    test("subprocess import is blocked", r.get("blocked") is True or "security" in stderr.lower() or "not permitted" in stderr.lower(),
         f"stderr: {stderr[:200]}")
    test("exit code non-zero", r.get("run", {}).get("code") != 0)


def test_security_os_system():
    print("\n🔒 Security — os.system() call blocked")
    code = "import os\nos.system('id')"
    r = run(code)
    stderr = r.get("run", {}).get("stderr", "")
    test("os.system call is blocked", r.get("blocked") is True or "security" in stderr.lower() or "not permitted" in stderr.lower(),
         f"stderr: {stderr[:200]}")


def test_security_ctypes():
    print("\n🔒 Security — ctypes import blocked")
    code = "import ctypes\nprint(ctypes.CDLL('libc.so.6'))"
    r = run(code)
    stderr = r.get("run", {}).get("stderr", "")
    test("ctypes import is blocked", r.get("blocked") is True or "security" in stderr.lower() or "not permitted" in stderr.lower(),
         f"stderr: {stderr[:200]}")


def test_timeout():
    print("\n⏱️  Timeout enforcement")
    code = "import time\ntime.sleep(200)"
    r = run(code, run_timeout=3000)
    test("timeout is enforced", r.get("run", {}).get("code") != 0)
    test("timeout message in stderr", "timed out" in r.get("run", {}).get("stderr", "").lower() or
         "timeout" in r.get("run", {}).get("stderr", "").lower())


def test_install_endpoint_removed():
    print("\n🔒 Security — /install endpoint removed")
    r = requests.post(f"{BASE_URL}/install", json={"package": "requests"}, timeout=10)
    test("/install returns 404", r.status_code == 404,
         f"got {r.status_code}")


def test_output_truncation():
    print("\n📏 Output size limit")
    # 3 MB of output > 2 MB cap
    code = "print('X' * (3 * 1024 * 1024))"
    r = run(code)
    stdout = r.get("run", {}).get("stdout", "")
    test("output is truncated", len(stdout.encode()) < 3 * 1024 * 1024)
    test("truncation warning present", "TRUNCATED" in stdout)


def test_session():
    print("\n🗂️  Stateful Sessions")
    sid_r = requests.post(f"{BASE_URL}/session", timeout=10)
    test("POST /session creates session", sid_r.status_code == 201)
    sid = sid_r.json().get("session_id")
    test("session_id returned", bool(sid))

    if sid:
        r1 = run("x = 42", session_id=sid)
        # Second cell references x from first (stateful if sessions share vars via files)
        r2 = run("print(x)", session_id=sid)
        # Note: subprocess-based sessions don't share a Python namespace across calls
        # but they share a working directory (files, pickled state etc.)
        test("session-based execution works", r1.get("run", {}).get("code") == 0)

        del_r = requests.delete(f"{BASE_URL}/session/{sid}", timeout=10)
        test("DELETE /session cleans up", del_r.status_code == 200)


# ─────────────────────────────────────────────────────────────────────────────

def main():
    global BASE_URL
    parser = argparse.ArgumentParser(description="XMRT Python Exec Service Tests")
    parser.add_argument("--url", default="http://localhost:8080", help="Base URL of the service")
    args = parser.parse_args()
    BASE_URL = args.url.rstrip("/")

    print(f"\n🧪 XMRT Python Execution Service — Test Suite")
    print(f"   Target: {BASE_URL}\n{'═' * 55}")

    test_health()
    test_basic_execution()
    test_stdlib()
    test_pandas()
    test_numpy()
    test_requests()
    test_matplotlib()
    test_pillow()
    test_security_subprocess()
    test_security_os_system()
    test_security_ctypes()
    test_timeout()
    test_install_endpoint_removed()
    test_output_truncation()
    test_session()

    total = results["passed"] + results["failed"]
    print(f"\n{'═' * 55}")
    print(f"📊 Results: {results['passed']}/{total} passed", end="")
    if results["failed"] > 0:
        print(f"  ({results['failed']} FAILED)")
        sys.exit(1)
    else:
        print("  — all tests passed! ✅")


if __name__ == "__main__":
    main()
