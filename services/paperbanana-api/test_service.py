import requests
import json
import base64

API_URL = "http://localhost:8000"

def test_health():
    try:
        response = requests.get(f"{API_URL}/health")
        print(f"Health Check: {response.status_code}")
        print(response.json())
        return response.status_code == 200
    except requests.exceptions.ConnectionError:
        print("X Could not connect to service. Is it running?")
        return False

def test_generate():
    payload = {
        "source_context": "The system consists of a retrieval agent that finds relevant documents and a generation agent that produces the answer.",
        "communicative_intent": "Show the data flow between retrieval and generation.",
        "diagram_type": "methodology",
        "caption": "Retrieval-Augmented Generation Flow"
    }
    
    try:
        print("\nTesting Generation...")
        response = requests.post(f"{API_URL}/generate", json=payload)
        print(f"Status: {response.status_code}")
        if response.status_code == 200:
            print("SUCCESS!")
            data = response.json()
            print(f"Image Path: {data.get('image_path')}")
        else:
            print(f"FAILED: {response.text}")
    except Exception as e:
        print(f"ERROR: {e}")

if __name__ == "__main__":
    if test_health():
        test_generate()
    else:
        print("\nPlease start the service using run_service.bat first!")
