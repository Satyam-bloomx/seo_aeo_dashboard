import urllib.request

try:
    req = urllib.request.Request(
        'https://vedicvastuliving.com/',
        headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
    )
    with urllib.request.urlopen(req) as response:
        print(f"Status: {response.status}")
        print(response.headers)
except Exception as e:
    print(f"Error: {e}")
