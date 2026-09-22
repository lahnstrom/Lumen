import io
import ipaddress
import socket
from pathlib import Path
from urllib.parse import urljoin, urlsplit
import httpx
from bs4 import BeautifulSoup
from PIL import Image, ImageDraw, ImageFont, ImageOps
from .models import Picture, Project, Region, uid
from .storage import media_dir

MAX_BYTES = 12 * 1024 * 1024
Image.MAX_IMAGE_PIXELS = 25_000_000


def public_url(url):
    parsed = urlsplit(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("Enter a public http(s) URL without embedded credentials.")
    if parsed.port not in (None, 80, 443):
        raise ValueError("Only standard HTTP and HTTPS ports are supported.")
    addresses = socket.getaddrinfo(parsed.hostname, parsed.port or (443 if parsed.scheme == "https" else 80), type=socket.SOCK_STREAM)
    if not addresses or any(not ipaddress.ip_address(a[4][0]).is_global for a in addresses):
        raise ValueError("Local/private network URLs are not supported. Paste text or upload images instead.")


def fetch(url):
    with httpx.Client(timeout=20, follow_redirects=False, trust_env=False, headers={"User-Agent": "FlashcardStudio/0.1"}) as client:
        for _ in range(6):
            public_url(url)
            with client.stream("GET", url) as response:
                if response.is_redirect:
                    url = urljoin(url, response.headers["location"])
                    continue
                response.raise_for_status()
                data = bytearray()
                for chunk in response.iter_bytes():
                    data.extend(chunk)
                    if len(data) > MAX_BYTES:
                        raise ValueError("Remote file exceeds 12 MB.")
                return bytes(data), str(response.url), response.headers.get("content-type", "")
    raise ValueError("Too many redirects.")


def add_image(data, caption="", source=""):
    if len(data) > MAX_BYTES:
        raise ValueError("Each image must be under 12 MB.")
    try:
        image = Image.open(io.BytesIO(data))
        if image.width * image.height > Image.MAX_IMAGE_PIXELS:
            raise ValueError("Image exceeds 25 megapixels.")
        image = ImageOps.exif_transpose(image)
        image.load()
        image.thumbnail((1600, 1600))
        rgba = image.convert("RGBA")
        white = Image.new("RGBA", rgba.size, "white")
        white.alpha_composite(rgba)
        image = white.convert("RGB")
    except (OSError, ValueError, Image.DecompressionBombError) as exc:
        raise ValueError("Unsupported image. Use PNG, JPEG or WebP (up to 25 megapixels).") from exc
    filename = uid() + ".png"
    image.save(media_dir() / filename)
    return Picture(filename=filename, width=image.width, height=image.height, caption=caption[:2000], source=source[:4000])


def extract_html(html, url):
    soup = BeautifulSoup(html, "html.parser")
    title = soup.title.get_text(" ", strip=True) if soup.title else "Imported page"
    for tag in soup.select("script,style,nav,header,footer,aside,noscript,form,svg"):
        tag.decompose()
    root = soup.find("article") or soup.find("main") or soup.body or soup
    images, seen = [], set()
    for tag in root.find_all("img"):
        src = tag.get("data-src") or tag.get("src")
        if not src or src.startswith("data:"):
            continue
        src = urljoin(url, src)
        if src in seen:
            continue
        seen.add(src)
        figure = tag.find_parent("figure")
        caption = figure.find("figcaption") if figure else None
        images.append((src, caption.get_text(" ", strip=True) if caption else tag.get("alt", "")))
    text = root.get_text("\n", strip=True)
    return title[:200], text, images


def from_url(url):
    data, final_url, content_type = fetch(url)
    if "html" not in content_type:
        raise ValueError("URL must be an HTML webpage. Upload images separately.")
    title, text, candidates = extract_html(data, final_url)
    project = Project(title=title or "Imported page", source=final_url, text=text[:60000])
    if len(text) > 60000:
        project.warnings.append("Text truncated to the first 60,000 characters; split long articles into separate projects.")
    for image_url, caption in candidates[:16]:
        if len(project.images) == 8:
            break
        try:
            raw, _, _ = fetch(image_url)
            picture = add_image(raw, caption, image_url)
            if picture.width >= 160 and picture.height >= 100:
                project.images.append(picture)
        except (ValueError, httpx.HTTPError, OSError):
            project.warnings.append(f"Could not import image: {image_url[:160]}")
    if len(candidates) > len(project.images):
        project.warnings.append("Some images were omitted (maximum 8). You can upload a missing diagram.")
    if not text.strip():
        project.warnings.append("No readable text found. This site may require JavaScript or login; paste its text and upload screenshots.")
    return project


def demo():
    project = Project(title="The water cycle", source="Built-in example", text="Evaporation is the conversion of liquid water into water vapour.\nCondensation is the conversion of water vapour into liquid droplets.\nPrecipitation is water falling from clouds as rain, snow, sleet, or hail.\nSolar energy drives evaporation in the water cycle.")
    canvas = Image.new("RGB", (1000, 560), "#edf7fb")
    draw = ImageDraw.Draw(canvas)
    font = ImageFont.load_default(size=28)
    draw.rectangle((0, 430, 1000, 560), fill="#a7dae2")
    draw.ellipse((395, 80, 710, 210), fill="white", outline="#9db9c4", width=3)
    draw.ellipse((55, 55, 140, 140), fill="#f2c76d")
    for a, b in [((250, 405), (250, 215)), ((700, 220), (700, 405))]:
        draw.line((a, b), fill="#398397", width=8)
        direction = 1 if b[1] > a[1] else -1
        draw.polygon([b, (b[0]-12, b[1]-20*direction), (b[0]+12,b[1]-20*direction)], fill="#398397")
    labels = [(80, 290, 215, 45, "Evaporation"), (390, 105, 245, 45, "Condensation"), (650, 300, 245, 45, "Precipitation")]
    for x, y, w, h, label in labels:
        draw.rounded_rectangle((x,y,x+w,y+h), radius=8, fill="white")
        draw.text((x+8,y+6), label, fill="#173d49", font=font)
    draw.text((350, 477), "Lakes and oceans", fill="#173d49", font=font)
    out = io.BytesIO()
    canvas.save(out, format="PNG")
    pic = add_image(out.getvalue(), "Identify the highlighted process in the water cycle.", project.source)
    pic.regions = [Region(x=x/1000,y=y/560,width=w/1000,height=h/560,label=label) for x,y,w,h,label in labels]
    project.images = [pic]
    return project


def generated_demo():
    project = demo()
    project.title = "The water cycle · generated illustration"
    project.source = "Text-to-image experiment: examples/water-cycle-prompt.md"
    path = Path(__file__).parent.parent / "examples" / "water-cycle-generated.png"
    picture = add_image(path.read_bytes(), "Generated illustration; identify the highlighted process.", project.source)
    # Measured on the generated 1536 × 1024 asset. Masks cover entire answer plaques.
    picture.regions = [Region(x=x/1536, y=y/1024, width=w/1536, height=h/1024, label=label) for x,y,w,h,label in [
        (39,365,381,93,"Evaporation"), (524,20,447,98,"Condensation"), (1145,368,370,95,"Precipitation")]]
    project.images = [picture]
    return project
