import os
from PIL import Image

src = r"C:\Users\BLOOM-X\.gemini\antigravity-ide\brain\49129d94-c438-4188-b8f5-cad6ae521bee\.user_uploaded\media_1788962264396.jpg"
img = Image.open(src)
w, h = img.size

out_dir = r"d:\antigravity\website audit full\crops"
os.makedirs(out_dir, exist_ok=True)

# 1. Top Header
crop_header = img.crop((180, 45, 1010, 110))
crop_header.save(os.path.join(out_dir, "01_top_header.png"))

# 2. Run Audit Button
crop_run_audit = img.crop((550, 48, 670, 95))
crop_run_audit.save(os.path.join(out_dir, "02_run_audit_button.png"))

# 3. Title & Slash
crop_title = img.crop((180, 95, 1010, 165))
crop_title.save(os.path.join(out_dir, "03_title_slash.png"))

# 4. Scroll Banner
crop_banner = img.crop((180, 160, 1010, 230))
crop_banner.save(os.path.join(out_dir, "04_scroll_banner.png"))

# 5. Filter Pills
crop_filters = img.crop((180, 225, 1010, 270))
crop_filters.save(os.path.join(out_dir, "05_filter_pills.png"))

# 6. Card 1: Google PageSpeed
crop_card1 = img.crop((185, 265, 595, 415))
crop_card1.save(os.path.join(out_dir, "06_card1_pagespeed.png"))

# 7. Card 2: OpenAI
crop_card2 = img.crop((605, 265, 1010, 415))
crop_card2.save(os.path.join(out_dir, "07_card2_openai.png"))

# 8. Card 3: Perplexity
crop_card3 = img.crop((185, 415, 595, 520))
crop_card3.save(os.path.join(out_dir, "08_card3_perplexity.png"))

# 9. Card 4: SerpAPI
crop_card4 = img.crop((605, 415, 1010, 520))
crop_card4.save(os.path.join(out_dir, "09_card4_serpapi.png"))

# 10. Sidebar Tab Dashboard
crop_tab_dash = img.crop((5, 80, 180, 140))
crop_tab_dash.save(os.path.join(out_dir, "10_tab_dashboard.png"))

# 11. Sidebar Bottom Pine Tree
crop_sidebar_bot = img.crop((0, 300, 180, 540))
crop_sidebar_bot.save(os.path.join(out_dir, "11_sidebar_pine_tree.png"))

print("Cropped all sections successfully!")
