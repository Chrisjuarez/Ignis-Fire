# scripts/fetch_topography.py
# This script was used to load topographic data into our db. 

import os, logging
from io import BytesIO

import numpy as np
import requests
from PIL import Image
from pymongo import MongoClient
from dotenv import load_dotenv

# ——— CONFIG —————————————————————————————————————————————
load_dotenv()
MONGO_URI    = os.getenv("MONGODB_URI")
MAPBOX_TOKEN = os.getenv("MAPBOX_ACCESS_TOKEN")
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
assert MONGO_URI and MAPBOX_TOKEN, "Set MONGOdb_URI & MAPBOX_ACCESS_TOKEN in .env"

# your fire–area bounding box
SOUTH, WEST, NORTH, EAST = 33.941651, -118.902969, 34.409176, -117.864761
STEP_DEG = 0.05   # grid spacing
Z = 14            # Terrain‑RGB zoom

# ——— SETUP —————————————————————————————————————————————
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
client = MongoClient(MONGO_URI)
topo = client.ignisdb.topographies

def lonlat_to_tile(lon, lat):
    xt = ((lon + 180)/360)*2**Z
    yt = ((1 - np.log(np.tan(np.radians(lat)) + 1/np.cos(np.radians(lat))) / np.pi)/2)*2**Z
    return int(xt), int(yt)

def decode_elev(r, g, b):
    return ((r*256*256 + g*256 + b)*0.1) - 10000

def compute_slope(img, cx, cy):
    grid = []
    for dy in (-1,0,1):
        row = []
        for dx in (-1,0,1):
            r, g, b, _ = img.getpixel((cx+dx, cy+dy))
            row.append(decode_elev(r, g, b))
        grid.append(row)
    dzdx = ((grid[0][2] + 2*grid[1][2] + grid[2][2]) -
            (grid[0][0] + 2*grid[1][0] + grid[2][0]))/(8*30)
    dzdy = ((grid[2][0] + 2*grid[2][1] + grid[2][2]) -
            (grid[0][0] + 2*grid[0][1] + grid[0][2]))/(8*30)
    return float(np.degrees(np.arctan(np.hypot(dzdx, dzdy))))

def fetch_landuse(lat, lon, radius=50):
    query = f"""
    [out:json][timeout:25];
    (
      way(around:{radius},{lat},{lon})["landuse"];
      relation(around:{radius},{lat},{lon})["landuse"];
    );
    out tags 1;
    """
    try:
        res = requests.post(OVERPASS_URL, data=query, headers={"Content-Type":"text/plain"}, timeout=30)
        res.raise_for_status()
        elems = res.json().get("elements", [])
        if elems:
            return elems[0].get("tags", {}).get("landuse", "Unknown")
    except Exception as e:
        logging.warning(f"Overpass failed @ {lat:.5f},{lon:.5f}: {e}")
    return "Unknown"

def main():
    lats = np.arange(SOUTH, NORTH+1e-9, STEP_DEG)
    lons = np.arange(WEST,  EAST+1e-9, STEP_DEG)
    total = len(lats)*len(lons)
    logging.info(f"Sampling {total} points…")
    idx = 0

    for lat in lats:
        for lon in lons:
            idx += 1
            x, y = lonlat_to_tile(lon, lat)
            tile_url = (
              f"https://api.mapbox.com/v4/mapbox.terrain-rgb/"
              f"{Z}/{x}/{y}@2x.pngraw?access_token={MAPBOX_TOKEN}"
            )

            try:
                resp = requests.get(tile_url, timeout=10)
                resp.raise_for_status()
            except Exception:
                logging.warning(f"{idx}/{total} Tile fetch failed @ {lat:.5f},{lon:.5f}")
                continue

            img = Image.open(BytesIO(resp.content)).convert("RGBA")
            cx, cy = img.width//2, img.height//2
            elev = decode_elev(*img.getpixel((cx, cy))[:3])

            # skip ocean/sea‑level points
            if elev <= 0:
                continue

            slope = compute_slope(img, cx, cy)
            veg   = fetch_landuse(lat, lon)

            geo = {
                "type":        "Point",
                "coordinates": [round(lon,6), round(lat,6)]
            }

            doc = {
                "location":       geo,
                "elevation":      round(elev,2),
                "slope":          round(slope,2),
                "vegetationType": veg
            }

            # upsert based on the GeoJSON location
            topo.update_one(
                { "location": geo },
                { "$set": doc },
                upsert=True
            )
            if idx % 100 == 0 or idx == total:
                logging.info(f"{idx}/{total} stored {doc}")

    logging.info("✅ Topography + landuse loading complete")

if __name__ == "__main__":
    main()