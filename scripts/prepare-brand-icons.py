"""Prepare launcher/favicon sizes from the supplied logo, without redrawing it."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import hashlib, json, math, shutil, sys

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'docs/brand/daily-history-source.png'
if len(sys.argv) > 1:
    SOURCE.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(Path(sys.argv[1]), SOURCE)

source = Image.open(SOURCE).convert('RGBA')
logo = source.crop(source.getchannel('A').getbbox())
master = Image.new('RGBA', (512, 512))
logo.thumbnail((512, 512), Image.Resampling.LANCZOS)
master.alpha_composite(logo, ((512-logo.width)//2, (512-logo.height)//2))

def save(image, path):
    path = ROOT / path
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, optimize=True)

def square(size, fraction, background=(255,255,255,255)):
    image = Image.new('RGBA', (size,size), background)
    art = master.resize((round(size*fraction),)*2, Image.Resampling.LANCZOS)
    image.alpha_composite(art, ((size-art.width)//2, (size-art.height)//2))
    return image

save(master, 'public/branding/daily-history.png')
save(master, 'android/app/src/main/res/drawable-nodpi/brand_mark.png')

# Keep the complete newspaper silhouette inside the Android 66dp safe circle.
# Work on the asset's alpha bounds; only size and padding change.
alpha = master.getchannel('A')
max_radius = max(math.hypot(x-255.5,y-255.5) for y in range(512) for x in range(512) if alpha.getpixel((x,y)) > 8)
art_size = math.floor(512 * (32*4) / max_radius)
adaptive = Image.new('RGBA', (432,432))
art = master.resize((art_size,art_size), Image.Resampling.LANCZOS)
adaptive.alpha_composite(art, ((432-art_size)//2, (432-art_size)//2))
save(adaptive, 'android/app/src/main/res/drawable-nodpi/ic_launcher_foreground.png')

for density,size in [('mdpi',48),('hdpi',72),('xhdpi',96),('xxhdpi',144),('xxxhdpi',192)]:
    image = square(size, art_size/288)
    save(image, f'android/app/src/main/res/mipmap-{density}/ic_launcher.png')
    mask=Image.new('L',(size,size));ImageDraw.Draw(mask).ellipse((0,0,size-1,size-1),fill=255)
    image.putalpha(mask)
    save(image, f'android/app/src/main/res/mipmap-{density}/ic_launcher_round.png')

web_icon = square(512,.82)
save(web_icon, 'src/app/icon.png')
save(square(180,.78), 'src/app/apple-icon.png')
web_icon.save(ROOT/'src/app/favicon.ico',sizes=[(16,16),(32,32),(48,48),(64,64)])

# Technical previews of the real asset under launcher masks, not generated artwork.
out=ROOT/'output/logo-20261121';out.mkdir(parents=True,exist_ok=True)
sheet=Image.new('RGB',(960,370),'#eee9e0');draw=ImageDraw.Draw(sheet)
font=ImageFont.truetype(r'C:\Windows\Fonts\msyh.ttc',20)
preview=square(240,art_size/288)
for idx,(name,rounding) in enumerate([('桌面 · 圆角',48),('桌面 · 圆形',120),('浏览器图标',0)]):
    im=preview.copy() if idx<2 else web_icon.resize((240,240),Image.Resampling.LANCZOS)
    if rounding:
        mask=Image.new('L',(240,240));ImageDraw.Draw(mask).rounded_rectangle((0,0,239,239),rounding,fill=255);im.putalpha(mask)
    x=40+idx*320;sheet.paste(im,(x,36),im)
    draw.text((x,300),name,font=font,fill='#272b25')
sheet.save(out/'icon-preview.png')

assert master.getchannel('A').getbbox() is not None
(out/'asset-generation.json').write_text(json.dumps({'source':str(SOURCE),'source_sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'original_alpha_bounds':source.getchannel('A').getbbox(),'adaptive_canvas':432,'adaptive_art_size':art_size,'changes':'alpha-bound crop, proportional resize, canvas padding and format conversion only'},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'adaptive_art_pixels':art_size,'preview':str(out/'icon-preview.png')},ensure_ascii=False))
