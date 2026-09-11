import os
from PIL import Image

crops_dir = r"d:\antigravity\website audit full\crops"
public_dir = r"d:\antigravity\website audit full\frontend\public\naruto_assets"

# Let's create a pure, pristine pine tree illustration for the sidebar
# In crop 11, the tree is in the upper area (y: 0 to 140) and left area
img_pine = Image.open(os.path.join(crops_dir, "11_sidebar_pine_tree.png")).convert("RGBA")
w, h = img_pine.size

# Isolate the golden-brown pine needles and branches
# and remove all text/buttons in the lower half
clean_pine = Image.new("RGBA", (w, h), (0,0,0,0))
for x in range(w):
    for y in range(h):
        # Only take upper 65% of the crop to avoid the buttons completely
        if y < int(h * 0.60):
            r, g, b, a = img_pine.getpixel((x, y))
            # Golden/brown tree branches: r > 70 and g > 40 and r > b
            if r > 60 and g > 35 and (r > b + 15):
                alpha = min(255, int(255 * (r - 50) / 40))
                clean_pine.putpixel((x, y), (r, g, b, alpha))

clean_pine.save(os.path.join(public_dir, "sidebar_pine_clean.png"))
print("Saved sidebar_pine_clean.png without any buttons or text!")
