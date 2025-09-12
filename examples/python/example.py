# Placeholder Python example for calling the API
# Replace with actual endpoints once implemented.

import requests

resp = requests.get("http://localhost:8080/health", timeout=5)
print(resp.status_code, resp.json())

