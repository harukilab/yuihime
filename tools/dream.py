#!/usr/bin/env python3
import sys
import os
import json
import urllib.request
import urllib.error

def main():
    print("=== YuiHime Dream Engine Consolidation CLI ===")
    
    # Get port from environment or default to 3000
    port = os.environ.get("PORT", "3000")
    url = f"http://localhost:{port}/api/system/dream"
    
    print(f"Connecting to YuiHime instance on port {port}...")
    
    # Prepare request
    req = urllib.request.Request(url, method="POST")
    req.add_header("Content-Type", "application/json")
    
    # Optional bearer token from env for security authorization
    token = os.environ.get("YUIHIME_BEARER_TOKEN")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
        
    try:
        with urllib.request.urlopen(req) as response:
            status_code = response.getcode()
            body = response.read().decode("utf-8")
            data = json.loads(body)
            
            if status_code == 200 and data.get("success"):
                print("\n[SUCCESS] Dream cycle completed successfully!")
                print(f"Reflections: {data.get('reflections', 'No reflections returned.')}")
            else:
                print(f"\n[FAILED] System returned error: {data.get('error', 'Unknown error')}")
                sys.exit(1)
                
    except urllib.error.HTTPError as e:
        print(f"\n[ERROR] HTTP Connection failed: {e.code} - {e.reason}")
        try:
            err_body = e.read().decode("utf-8")
            err_data = json.loads(err_body)
            print(f"Details: {err_data.get('error', 'No detail')}")
        except:
            pass
        sys.exit(1)
    except urllib.error.URLError as e:
        print(f"\n[ERROR] Instance unreachable at {url}. Make sure the YuiHime server is running.")
        print(f"Reason: {e.reason}")
        sys.exit(1)

if __name__ == "__main__":
    main()
