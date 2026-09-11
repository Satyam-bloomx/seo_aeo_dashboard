import os
from PIL import Image, ImageDraw, ImageFilter

# Let's inspect the original inspiration image resolution and regions
src_img_path = r"C:\Users\BLOOM-X\.gemini\antigravity-ide\brain\49129d94-c438-4188-b8f5-cad6ae521bee\.user_uploaded\media_1788962264396.jpg"
if os.path.exists(src_img_path):
    img = Image.open(src_img_path)
    print("Inspiration image size:", img.size, img.format)
    # Save a pristine copy to frontend/public/naruto_backdrop.jpg
    img.save(r"d:\antigravity\website audit full\frontend\public\naruto_backdrop.jpg", quality=95)
    print("Saved naruto_backdrop.jpg")

    # Let's also crop the background backdrop (header & scenery)
    # The image width is around 1000-2000px.
    w, h = img.size
    print(f"Dimensions: {w}x{h}")
