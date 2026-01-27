import urllib.request
import re

headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; Trident/7.0; rv:11.0) like Gecko'}
url = 'https://fonts.googleapis.com/css2?family=Rubik:wght@400&subset=hebrew'

try:
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req) as response:
        css = response.read().decode('utf-8')
        match = re.search(r'url\((https://fonts.gstatic.com/[^)]+)\)', css)
        if match:
            tgt = match.group(1)
            print(tgt)
            with open('font_url.txt', 'w') as f:
                f.write(tgt)
        else:
            print("No URL found")
except Exception as e:
    print(f"Error: {e}")
