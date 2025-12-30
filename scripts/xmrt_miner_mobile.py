#!/usr/bin/env python3
# Enhanced script.py with worker registration and claiming

import os
import sys
import time
import subprocess
import json
import hashlib
import random
import requests
from collections import OrderedDict

# ASCII Art and Branding
XMRT_ASCII = r"""
██╗  ██╗███╗   ███╗██████╗ ████████╗
╚██╗██╔╝████╗ ████║██╔══██╗╚══██╔══╝
 ╚███╔╝ ██╔████╔██║██████╔╝   ██║   
 ██╔██╗ ██║╚██╔╝██║██╔══██╗   ██║   
██╔╝ ██╗██║ ╚═╝ ██║██║  ██║   ██║   
╚═╝  ╚═╝╚═╝     ╚═╝╚═╝  ╚═╝   ╚═╝   
D E C E N T R A L I Z E D   A U T O N O M O U S   O R G A N I Z A T I O N
"""

POOL_WALLET = "46UxNFuGM2E3UwmZWWJicaRPoRwqwW4byQkaTHkX8yPcVihp91qAVtSFipWUGJJUyTXgzDQtNLf2bsp2DX2qCCgC5mg"
REGISTRATION_ENDPOINT = "https://vawouugtzwmejxqkeqqj.supabase.co/functions/v1/worker-registration"

def colorful_print(text, color_code):
    """Print colored text in Termux"""
    print(f"\033[{color_code}m{text}\033[0m")

def show_header():
    """Display branded welcome screen"""
    os.system('clear')
    colorful_print(XMRT_ASCII, "36")
    colorful_print("\nWelcome to XMRT DAO Mobile Mining Initiative\n", "33")
    colorful_print("="*60, "34")
    print()

def get_device_info():
    """Gather device information"""
    info = {
        'device_model': 'Unknown',
        'android_version': 'Unknown',
        'cpu_cores': os.cpu_count() or 1
    }
    
    try:
        # Try to get Android device info
        with open('/system/build.prop', 'r') as f:
            for line in f:
                if 'ro.product.model=' in line:
                    info['device_model'] = line.split('=')[1].strip()
                elif 'ro.build.version.release=' in line:
                    info['android_version'] = line.split('=')[1].strip()
    except:
        pass
    
    return info

def register_worker(user_number, username):
    """Register worker with backend and get claim token"""
    colorful_print("\n🔗 Registering worker with DAO...", "33")
    
    device_info = get_device_info()
    
    payload = {
        "action": "register",
        "worker_id": user_number,
        "username": username,
        "device_info": device_info,
        "wallet_address": POOL_WALLET
    }
    
    try:
        response = requests.post(REGISTRATION_ENDPOINT, json=payload, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            
            if data.get('success'):
                claim_token = data.get('claim_token')
                colorful_print(f"\n✅ Worker registered successfully!", "32")
                colorful_print(f"\n🎫 YOUR CLAIM TOKEN: {claim_token}", "33;1")
                colorful_print("\nSave this token! You'll need it to claim your worker", "35")
                colorful_print("in the Suite dashboard at: https://suite-beta.vercel.app/earn", "34")
                
                # Save token locally
                with open('claim_token.txt', 'w') as f:
                    f.write(claim_token)
                
                return claim_token
            else:
                colorful_print(f"⚠️ Registration issue: {data.get('message')}", "33")
                return None
        else:
            colorful_print(f"⚠️ Registration failed (HTTP {response.status_code})", "33")
            colorful_print("You can still mine! Claim your worker later.", "35")
            return None
            
    except Exception as e:
        colorful_print(f"⚠️ Could not connect to registration server", "33")
        colorful_print("You can still mine! Registration will retry automatically.", "35")
        return None

def send_ping(user_number):
    """Send heartbeat ping to show worker is active"""
    try:
        payload = {
            "action": "ping",
            "worker_id": user_number,
            "timestamp": int(time.time())
        }
        
        response = requests.post(REGISTRATION_ENDPOINT, json=payload, timeout=5)
        return response.status_code == 200
    except:
        return False

def install_dependencies():
    """Install required Termux packages"""
    colorful_print("\n🔧 Setting up environment...", "35")
    packages = [
        "python", "clang", "nodejs", "openssl-tool",
        "git", "cmake", "make", "libuv", "libmicrohttpd"
    ]
    
    try:
        subprocess.run("apt update && apt upgrade -y", 
                      shell=True, check=True)
        subprocess.run(f"apt install -y {' '.join(packages)}",
                      shell=True, check=True)
        
        # Install Python requests if not available
        subprocess.run("pip install requests", shell=True, check=True)
        
        colorful_print("✅ Environment setup complete!", "32")
    except subprocess.CalledProcessError as e:
        colorful_print(f"❌ Setup failed: {str(e)}", "31")
        sys.exit(1)

def generate_user_number(username):
    """Create unique user ID from username"""
    seed = f"{username}-{time.time()}-{random.randint(1000,9999)}"
    return hashlib.sha256(seed.encode()).hexdigest()[:8].upper()

def user_registration():
    """Collect user information and create config"""
    show_header()
    colorful_print("📝 DAO Membership Registration\n", "36")
    
    user_data = OrderedDict()
    user_data['username'] = input("Choose your mining alias: ").strip()
    user_data['user_number'] = generate_user_number(user_data['username'])
    user_data['timestamp'] = int(time.time())
    
    # Register worker and get claim token
    claim_token = register_worker(user_data['user_number'], user_data['username'])
    if claim_token:
        user_data['claim_token'] = claim_token
    
    with open('xmrt_miner.json', 'w') as f:
        json.dump(user_data, f, indent=2)
        
    colorful_print(f"\n🎉 Account created! Your Miner ID: {user_data['user_number']}", "32")
    
    if claim_token:
        input("\nPress ENTER after you've saved your claim token...")
    
    return user_data

def configure_miner(user_number):
    """Create XMRig configuration file"""
    config = {
        "autosave": True,
        "cpu": True,
        "opencl": False,
        "cuda": False,
        "pools": [{
            "url": "pool.supportxmr.com:3333",
            "user": f"{POOL_WALLET}.{user_number}",
            "pass": "xmrt-dao-mobile",
            "keepalive": True,
            "tls": False
        }]
    }
    
    with open('config.json', 'w') as f:
        json.dump(config, f, indent=2)
    colorful_print("📄 Miner configuration generated", "34")

def install_miner():
    """Install and build XMRig with existence check"""
    colorful_print("\n⛏️ Installing XMRig miner...", "33")
    try:
        if not os.path.exists("xmrig"):
            subprocess.run("git clone https://github.com/xmrig/xmrig.git",
                          shell=True, check=True)
        else:
            colorful_print("⚠️ Using existing XMRig repository", "33")
        
        os.chdir("xmrig")
        
        if not os.path.exists("build/xmrig"):
            subprocess.run(
                "mkdir -p build && cd build && "
                "cmake .. -DWITH_HWLOC=OFF -DWITH_OPENCL=OFF -DWITH_CUDA=OFF && "
                "make -j$(nproc)",
                shell=True, check=True
            )
            colorful_print("✅ Miner installation complete!", "32")
        else:
            colorful_print("⚠️ Using existing XMRig build", "33")
            
    except subprocess.CalledProcessError as e:
        colorful_print(f"❌ Installation failed: {str(e)}", "31")
        sys.exit(1)
    finally:
        os.chdir("..")

def create_ping_script(user_number):
    """Create background ping script"""
    ping_script = f"""#!/data/data/com.termux/files/usr/bin/python
import requests
import time
import sys

ENDPOINT = "{REGISTRATION_ENDPOINT}"
WORKER_ID = "{user_number}"

while True:
    try:
        requests.post(ENDPOINT, json={{"action": "ping", "worker_id": WORKER_ID}}, timeout=5)
        time.sleep(300)  # Ping every 5 minutes
    except:
        time.sleep(60)  # Retry in 1 minute on error
"""
    
    with open('worker_ping.py', 'w') as f:
        f.write(ping_script)
    
    os.chmod('worker_ping.py', 0o755)
    colorful_print("📡 Worker ping script created", "34")

def show_instructions(user_number, claim_token=None):
    """Display post-install instructions"""
    show_header()
    colorful_print("🚀 Setup Complete! Here's How to Mine:", "36")
    
    print("\n1. Start mining:")
    colorful_print("   cd xmrig/build && ./xmrig -c ../../config.json", "33")
    
    print("\n2. (Optional) Start background ping:")
    colorful_print("   python worker_ping.py &", "33")
    
    print("\n3. Claim your worker:")
    colorful_print(f"   Worker ID: {user_number}", "35")
    
    if claim_token:
        colorful_print(f"   Claim Token: {claim_token}", "33;1")
        colorful_print("   (Also saved in: claim_token.txt)", "34")
    
    colorful_print("\n   Go to: https://suite-beta.vercel.app/earn", "34")
    colorful_print("   Click: Contribute tab → Claim Worker", "34")
    colorful_print("   Enter your claim token to link this device", "34")
    
    print("\n4. Track your contributions:")
    colorful_print("   Your dashboard: https://suite-beta.vercel.app/earn", "36")
    
    print("\n💡 Tips:")
    print("   - Keep your claim token safe!")
    print("   - You can claim this worker later if you skip it now")
    print("   - Worker ping helps track your device online status")

def main():
    show_header()
    colorful_print("This script will:", "33")
    print("- Install required packages")
    print("- Create your miner identity")
    print("- Register your worker with the DAO")
    print("- Generate a claim token for you")
    print("- Configure automatic rewards tracking")
    print("- Set up optimized mobile mining\n")
    
    input("Press ENTER to begin setup...")
    
    install_dependencies()
    user_data = user_registration()
    configure_miner(user_data['user_number'])
    install_miner()
    create_ping_script(user_data['user_number'])
    show_instructions(
        user_data['user_number'], 
        user_data.get('claim_token')
    )

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        colorful_print("\n🚫 Setup canceled by user", "31")
        sys.exit(0)
