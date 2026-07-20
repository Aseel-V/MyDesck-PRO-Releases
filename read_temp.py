import os

file_path = r"c:\Users\user\OneDrive - Kinneret Academic College\שולחן העבודה\MyDesck PRO\temp_admin_dashboard.txt"

try:
    with open(file_path, 'r', encoding='utf-16') as f:
        lines = f.readlines()
        for i, line in enumerate(lines):
            print(f"{i}: {line.strip()}")
except Exception as e:
    print(f"Error reading utf-16: {e}")
