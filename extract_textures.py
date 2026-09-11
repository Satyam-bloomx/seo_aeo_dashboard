import os
from PIL import Image, ImageOps, ImageEnhance

crops_dir = r"d:\antigravity\website audit full\crops"
public_dir = r"d:\antigravity\website audit full\frontend\public\naruto_assets"
os.makedirs(public_dir, exist_ok=True)

# 1. Process Run Audit button brush texture from crop 02
img_btn = Image.open(os.path.join(crops_dir, "02_run_audit_button.png")).convert("RGBA")
# Isolate the orange brush stroke
w, h = img_btn.size
# Create transparent image
btn_alpha = Image.new("RGBA", (w, h), (0,0,0,0))
for x in range(w):
    for y in range(h):
        r, g, b, a = img_btn.getpixel((x, y))
        # Orange detection: high R, medium G, low B
        if r > 120 and g > 50 and b < 80:
            btn_alpha.putpixel((x, y), (r, g, b, 255))
        elif r > 80 and g > 30 and b < 50:
            btn_alpha.putpixel((x, y), (r, g, b, int(255 * (r-80)/40)))
btn_alpha.save(os.path.join(public_dir, "run_audit_brush.png"))

# 2. Process Dashboard tab brush texture from crop 10
img_tab = Image.open(os.path.join(crops_dir, "10_tab_dashboard.png")).convert("RGBA")
w, h = img_tab.size
tab_alpha = Image.new("RGBA", (w, h), (0,0,0,0))
for x in range(w):
    for y in range(h):
        r, g, b, a = img_tab.getpixel((x, y))
        if r > 120 and g > 50 and b < 80:
            tab_alpha.putpixel((x, y), (r, g, b, 255))
        elif r > 80 and g > 30 and b < 50:
            tab_alpha.putpixel((x, y), (r, g, b, int(255 * (r-80)/40)))
tab_alpha.save(os.path.join(public_dir, "tab_dashboard_brush.png"))

# 3. Process 2 Engines Synchronized green banner from crop 04
img_banner = Image.open(os.path.join(crops_dir, "04_scroll_banner.png")).convert("RGBA")
# Crop just the green pill region (right side)
w, h = img_banner.size
green_crop = img_banner.crop((int(w * 0.72), 0, w - 10, h))
gw, gh = green_crop.size
green_alpha = Image.new("RGBA", (gw, gh), (0,0,0,0))
for x in range(gw):
    for y in range(gh):
        r, g, b, a = green_crop.getpixel((x, y))
        # Teal / emerald detection: G > R and G > B or dark teal
        if g > 70 and g > r and (g > b or b > 60) and r < 80:
            green_alpha.putpixel((x, y), (r, g, b, 255))
        elif g > 40 and g > r:
            green_alpha.putpixel((x, y), (r, g, b, int(255 * (g-40)/30)))
green_alpha.save(os.path.join(public_dir, "green_synchronized_brush.png"))

# 4. Process Sidebar Pine Tree from crop 11
img_pine = Image.open(os.path.join(crops_dir, "11_sidebar_pine_tree.png")).convert("RGBA")
img_pine.save(os.path.join(public_dir, "sidebar_pine_bg.png"))

# 5. Process the entire pristine background from media_1788962264396.jpg
bg_full = Image.open(r"C:\Users\BLOOM-X\.gemini\antigravity-ide\brain\49129d94-c438-4188-b8f5-cad6ae521bee\.user_uploaded\media_1788962264396.jpg")
bg_full.save(os.path.join(public_dir, "konoha_twilight_master.jpg"), quality=95)

print("Saved all reference alpha textures into naruto_assets/")
