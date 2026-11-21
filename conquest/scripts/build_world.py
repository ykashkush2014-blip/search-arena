#!/usr/bin/env python3
"""
Build the world map for CONQUEST — a pixel-art real-time conquest strategy game.

Rasterises Natural Earth country borders (via the `world-atlas` TopoJSON package,
which is derived from Natural Earth 1:50m Admin-0 country polygons) into a
pixel grid where every cell belongs to exactly one country or to the ocean.

Outputs:
  conquest/data/world-data.js   -> grid + country metadata consumed by the game
  /tmp/conquest-preview.png     -> visual sanity check of the rasterisation

Usage:
  python3 scripts/build_world.py                 # uses ./scripts/vendor/countries-50m.json
  python3 scripts/build_world.py --width 2160
"""

import argparse
import base64
import json
import math
import os
import struct
import sys
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
VENDOR = os.path.join(HERE, "vendor")

# ---------------------------------------------------------------- topojson ---


def read_topojson(path):
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def decode_arcs(topo):
    sx, sy = topo["transform"]["scale"]
    tx, ty = topo["transform"]["translate"]
    arcs = []
    for arc in topo["arcs"]:
        x = y = 0
        pts = []
        for dx, dy in arc:
            x += dx
            y += dy
            pts.append((x * sx + tx, y * sy + ty))
        arcs.append(pts)
    return arcs


def join_arcs(indexes, arcs):
    out = []
    for idx in indexes:
        if idx >= 0:
            pts = arcs[idx]
        else:
            pts = list(reversed(arcs[~idx]))
        if out and pts:
            # drop duplicated joint point
            pts = pts[1:] if len(pts) > 1 else pts
        out.extend(pts)
    return out


def geometry_polygons(geom, arcs):
    """Return a list of polygons, each a list of rings (lon/lat tuples)."""
    if geom["type"] == "Polygon":
        return [[join_arcs(ring, arcs) for ring in geom["arcs"]]]
    if geom["type"] == "MultiPolygon":
        return [[join_arcs(ring, arcs) for ring in poly] for poly in geom["arcs"]]
    return []


# ------------------------------------------------------------------ raster ---


def unwrap_ring(ring):
    """Make longitudes continuous so antimeridian-crossing rings fill correctly."""
    if not ring:
        return ring
    out = [ring[0]]
    for lon, lat in ring[1:]:
        prev_lon = out[-1][0]
        while lon - prev_lon > 180.0:
            lon -= 360.0
        while lon - prev_lon < -180.0:
            lon += 360.0
        out.append((lon, lat))
    return out


class Grid:
    def __init__(self, width, lat_top, lat_bottom):
        self.w = width
        self.dlon = 360.0 / width
        self.dlat = 360.0 / width  # square cells, in degrees
        self.lat_top = lat_top
        self.lat_bottom = lat_bottom
        self.h = int(round((lat_top - lat_bottom) / self.dlat))
        self.lon0 = -180.0
        self.owner = [-1] * (self.w * self.h)

    def row_lat(self, row):
        return self.lat_top - (row + 0.5) * self.dlat

    def row_of(self, lat):
        return int(math.floor((self.lat_top - lat) / self.dlat))

    def col_of(self, lon):
        c = int(math.floor((lon - self.lon0) / self.dlon))
        return c % self.w


def scanline_spans(rings, lat_top, lat_bottom, dlat):
    """Even-odd scanline fill of a polygon (list of rings) sampled at row centres."""
    edges = []
    for ring in rings:
        ring = unwrap_ring(ring)
        n = len(ring)
        for i in range(n - 1):
            x1, y1 = ring[i]
            x2, y2 = ring[i + 1]
            if y1 == y2:
                continue
            edges.append((x1, y1, x2, y2))

    if not edges:
        return []

    lo = max(min(min(e[1], e[3]) for e in edges), lat_bottom)
    hi = min(max(max(e[1], e[3]) for e in edges), lat_top)
    if hi <= lo:
        return []

    r0 = int(math.floor((lat_top - hi) / dlat))
    r1 = int(math.ceil((lat_top - lo) / dlat))
    out = []
    for row in range(r0, r1 + 1):
        y = lat_top - (row + 0.5) * dlat
        if y < lo or y > hi:
            continue
        xs = []
        for x1, y1, x2, y2 in edges:
            if (y1 <= y < y2) or (y2 <= y < y1):
                t = (y - y1) / (y2 - y1)
                xs.append(x1 + t * (x2 - x1))
        if len(xs) < 2:
            continue
        xs.sort()
        for i in range(0, len(xs) - 1, 2):
            a, b = xs[i], xs[i + 1]
            # split spans that wrap across the antimeridian range
            while a < -180.0:
                a += 360.0
                b += 360.0
            while a > 180.0:
                a -= 360.0
                b -= 360.0
            out.append((y, a, b))
    return out


# -------------------------------------------------------------------- png -----


def write_png(path, width, height, rgb_rows):
    raw = b"".join(b"\x00" + bytes(row) for row in rgb_rows)

    def chunk(tag, data):
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as fh:
        fh.write(png)


# --------------------------------------------------------------- metadata ----

ISO = {
    "Fiji": "FJ", "Tanzania": "TZ", "W. Sahara": "EH", "Canada": "CA",
    "United States of America": "US", "Kazakhstan": "KZ", "Uzbekistan": "UZ",
    "Papua New Guinea": "PG", "Indonesia": "ID", "Argentina": "AR", "Chile": "CL",
    "Dem. Rep. Congo": "CD", "Somalia": "SO", "Kenya": "KE", "Sudan": "SD",
    "Chad": "TD", "Haiti": "HT", "Dominican Rep.": "DO", "Russia": "RU",
    "Bahamas": "BS", "Falkland Is.": "FK", "Norway": "NO", "Greenland": "GL",
    "Fr. S. Antarctic Lands": "TF", "Timor-Leste": "TL", "South Africa": "ZA",
    "Lesotho": "LS", "Mexico": "MX", "Uruguay": "UY", "Brazil": "BR",
    "Bolivia": "BO", "Peru": "PE", "Colombia": "CO", "Panama": "PA",
    "Costa Rica": "CR", "Nicaragua": "NI", "Honduras": "HN", "El Salvador": "SV",
    "Guatemala": "GT", "Belize": "BZ", "Venezuela": "VE", "Guyana": "GY",
    "Suriname": "SR", "France": "FR", "Ecuador": "EC", "Puerto Rico": "PR",
    "Jamaica": "JM", "Cuba": "CU", "Zimbabwe": "ZW", "Botswana": "BW",
    "Namibia": "NA", "Senegal": "SN", "Mali": "ML", "Mauritania": "MR",
    "Morocco": "MA", "Algeria": "DZ", "Tunisia": "TN", "Libya": "LY",
    "Egypt": "EG", "Eritrea": "ER", "Djibouti": "DJ", "Ethiopia": "ET",
    "S. Sudan": "SS", "Central African Rep.": "CF", "Cameroon": "CM",
    "Nigeria": "NG", "Niger": "NE", "Gabon": "GA", "Eq. Guinea": "GQ",
    "Congo": "CG", "Angola": "AO", "Zambia": "ZM", "Malawi": "MW",
    "Mozambique": "MZ", "eSwatini": "SZ", "Madagascar": "MG", "Gambia": "GM",
    "Guinea-Bissau": "GW", "Guinea": "GN", "Sierra Leone": "SL",
    "Liberia": "LR", "Côte d'Ivoire": "CI", "Burkina Faso": "BF", "Ghana": "GH",
    "Togo": "TG", "Benin": "BJ", "Portugal": "PT", "Spain": "ES", "Ireland": "IE",
    "United Kingdom": "GB", "Iceland": "IS", "Netherlands": "NL", "Belgium": "BE",
    "Luxembourg": "LU", "Germany": "DE", "Denmark": "DK", "Sweden": "SE",
    "Poland": "PL", "Czechia": "CZ", "Slovakia": "SK", "Austria": "AT",
    "Hungary": "HU", "Slovenia": "SI", "Croatia": "HR", "Bosnia and Herz.": "BA",
    "Montenegro": "ME", "Albania": "AL", "Macedonia": "MK", "Serbia": "RS",
    "Bulgaria": "BG", "Romania": "RO", "Greece": "GR", "Turkey": "TR",
    "Cyprus": "CY", "Georgia": "GE", "Armenia": "AM", "Azerbaijan": "AZ",
    "Moldova": "MD", "Ukraine": "UA", "Belarus": "BY", "Lithuania": "LT",
    "Latvia": "LV", "Estonia": "EE", "Finland": "FI", "Turkmenistan": "TM",
    "Tajikistan": "TJ", "Kyrgyzstan": "KG", "Afghanistan": "AF", "Pakistan": "PK",
    "India": "IN", "Nepal": "NP", "Bhutan": "BT", "Bangladesh": "BD",
    "Myanmar": "MM", "Thailand": "TH", "Cambodia": "KH", "Vietnam": "VN",
    "Malaysia": "MY", "Brunei": "BN", "Philippines": "PH", "Taiwan": "TW",
    "China": "CN", "Mongolia": "MN", "North Korea": "KP", "South Korea": "KR",
    "Japan": "JP", "Sri Lanka": "LK", "Italy": "IT", "Switzerland": "CH",
    "Israel": "IL", "Palestine": "PS", "Jordan": "JO", "Lebanon": "LB",
    "Syria": "SY", "Iraq": "IQ", "Kuwait": "KW", "Saudi Arabia": "SA",
    "Yemen": "YE", "Oman": "OM", "United Arab Emirates": "AE", "Qatar": "QA",
    "Iran": "IR", "Australia": "AU", "New Zealand": "NZ", "New Caledonia": "NC",
    "Solomon Is.": "SB", "Vanuatu": "VU", "Antarctica": "AQ",
    "Trinidad and Tobago": "TT", "American Samoa": "AS", "Andorra": "AD",
    "Anguilla": "AI", "Antigua and Barb.": "AG", "Aruba": "AW",
    "Ashmore and Cartier Is.": "AU", "Bahrain": "BH", "Barbados": "BB",
    "Bermuda": "BM", "Br. Indian Ocean Ter.": "IO", "British Virgin Is.": "VG",
    "Burundi": "BI", "Cabo Verde": "CV", "Cayman Is.": "KY", "Comoros": "KM",
    "Cook Is.": "CK", "Curaçao": "CW", "Dominica": "DM", "Faeroe Is.": "FO",
    "Fr. Polynesia": "PF", "Grenada": "GD", "Guam": "GU", "Guernsey": "GG",
    "Heard I. and McDonald Is.": "HM", "Hong Kong": "HK", "Isle of Man": "IM",
    "Jersey": "JE", "Kiribati": "KI", "Laos": "LA", "Liechtenstein": "LI",
    "Macao": "MO", "Maldives": "MV", "Malta": "MT", "Marshall Is.": "MH",
    "Mauritius": "MU", "Micronesia": "FM", "Monaco": "MC", "Montserrat": "MS",
    "N. Mariana Is.": "MP", "Nauru": "NR", "Niue": "NU", "Norfolk Island": "NF",
    "Palau": "PW", "Paraguay": "PY", "Pitcairn Is.": "PN", "Rwanda": "RW",
    "S. Geo. and the Is.": "GS", "Saint Helena": "SH", "Saint Lucia": "LC",
    "Samoa": "WS", "San Marino": "SM", "Seychelles": "SC",
    "Sint Maarten": "SX", "St-Barthélemy": "BL", "St-Martin": "MF",
    "St. Kitts and Nevis": "KN", "St. Pierre and Miquelon": "PM",
    "St. Vin. and Gren.": "VC", "São Tomé and Principe": "ST", "Tonga": "TO",
    "Turks and Caicos Is.": "TC", "U.S. Virgin Is.": "VI", "Uganda": "UG",
    "Vatican": "VA", "Wallis and Futuna Is.": "WF", "Åland": "AX",
    "Kosovo": "XK", "Somaliland": "SO", "N. Cyprus": "CY",
    "Indian Ocean Ter.": "IO", "Siachen Glacier": "IN", "Singapore": "SG",
}

NUMERIC = {}
_numeric_path = os.path.join(VENDOR, "iso-numeric.json")
if os.path.exists(_numeric_path):
    with open(_numeric_path, "r", encoding="utf-8") as _fh:
        NUMERIC = json.load(_fh)

# A few names that Natural Earth abbreviates, for nicer UI copy.
FULL_NAME = {
    "Dem. Rep. Congo": "DR Congo",
    "Central African Rep.": "Central African Republic",
    "Eq. Guinea": "Equatorial Guinea",
    "Bosnia and Herz.": "Bosnia and Herzegovina",
    "Dominican Rep.": "Dominican Republic",
    "S. Sudan": "South Sudan",
    "Solomon Is.": "Solomon Islands",
    "W. Sahara": "Western Sahara",
    "eSwatini": "Eswatini",
    "Czechia": "Czechia",
    "Fr. S. Antarctic Lands": "French Southern Lands",
}

# Region grouping is used for map presets ("Europe", "Africa", ...).
REGION = {
    # Africa
    "Algeria": "africa", "Angola": "africa", "Benin": "africa", "Botswana": "africa",
    "Burkina Faso": "africa", "Burundi": "africa", "Cameroon": "africa",
    "Central African Rep.": "africa", "Chad": "africa", "Congo": "africa",
    "Côte d'Ivoire": "africa", "Dem. Rep. Congo": "africa", "Djibouti": "africa",
    "Egypt": "africa", "Eq. Guinea": "africa", "Eritrea": "africa",
    "eSwatini": "africa", "Ethiopia": "africa", "Gabon": "africa",
    "Gambia": "africa", "Ghana": "africa", "Guinea": "africa",
    "Guinea-Bissau": "africa", "Kenya": "africa", "Lesotho": "africa",
    "Liberia": "africa", "Libya": "africa", "Madagascar": "africa",
    "Malawi": "africa", "Mali": "africa", "Mauritania": "africa",
    "Morocco": "africa", "Mozambique": "africa", "Namibia": "africa",
    "Niger": "africa", "Nigeria": "africa", "Rwanda": "africa",
    "S. Sudan": "africa", "Senegal": "africa", "Sierra Leone": "africa",
    "Somalia": "africa", "Somaliland": "africa", "South Africa": "africa",
    "Sudan": "africa", "Tanzania": "africa", "Togo": "africa",
    "Tunisia": "africa", "Uganda": "africa", "W. Sahara": "africa",
    "Zambia": "africa", "Zimbabwe": "africa",
    # Europe
    "Albania": "europe", "Austria": "europe", "Belarus": "europe",
    "Belgium": "europe", "Bosnia and Herz.": "europe", "Bulgaria": "europe",
    "Croatia": "europe", "Cyprus": "europe", "Czechia": "europe",
    "Denmark": "europe", "Estonia": "europe", "Finland": "europe",
    "France": "europe", "Germany": "europe", "Greece": "europe",
    "Hungary": "europe", "Iceland": "europe", "Ireland": "europe",
    "Italy": "europe", "Kosovo": "europe", "Latvia": "europe",
    "Lithuania": "europe", "Luxembourg": "europe", "Macedonia": "europe",
    "Moldova": "europe", "Montenegro": "europe", "N. Cyprus": "europe",
    "Netherlands": "europe", "Norway": "europe", "Poland": "europe",
    "Portugal": "europe", "Romania": "europe", "Russia": "europe",
    "Serbia": "europe", "Slovakia": "europe", "Slovenia": "europe",
    "Spain": "europe", "Sweden": "europe", "Switzerland": "europe",
    "Ukraine": "europe", "United Kingdom": "europe",
    # Asia
    "Afghanistan": "asia", "Armenia": "asia", "Azerbaijan": "asia",
    "Bahrain": "asia", "Bangladesh": "asia", "Bhutan": "asia",
    "Brunei": "asia", "Cambodia": "asia", "China": "asia", "Georgia": "asia",
    "India": "asia", "Indonesia": "asia", "Iran": "asia", "Iraq": "asia",
    "Israel": "asia", "Japan": "asia", "Jordan": "asia", "Kazakhstan": "asia",
    "Kuwait": "asia", "Kyrgyzstan": "asia", "Laos": "asia", "Lebanon": "asia",
    "Malaysia": "asia", "Mongolia": "asia", "Myanmar": "asia", "Nepal": "asia",
    "North Korea": "asia", "Oman": "asia", "Pakistan": "asia",
    "Palestine": "asia", "Philippines": "asia", "Qatar": "asia",
    "Saudi Arabia": "asia", "Singapore": "asia", "South Korea": "asia",
    "Sri Lanka": "asia", "Syria": "asia", "Taiwan": "asia",
    "Tajikistan": "asia", "Thailand": "asia", "Timor-Leste": "asia",
    "Turkey": "asia", "Turkmenistan": "asia", "United Arab Emirates": "asia",
    "Uzbekistan": "asia", "Vietnam": "asia", "Yemen": "asia",
    # Americas
    "Argentina": "americas", "Bahamas": "americas", "Belize": "americas",
    "Bolivia": "americas", "Brazil": "americas", "Canada": "americas",
    "Chile": "americas", "Colombia": "americas", "Costa Rica": "americas",
    "Cuba": "americas", "Dominican Rep.": "americas", "Ecuador": "americas",
    "El Salvador": "americas", "Falkland Is.": "americas", "Greenland": "americas",
    "Guatemala": "americas", "Guyana": "americas", "Haiti": "americas",
    "Honduras": "americas", "Jamaica": "americas", "Mexico": "americas",
    "Nicaragua": "americas", "Panama": "americas", "Paraguay": "americas",
    "Peru": "americas", "Puerto Rico": "americas", "Suriname": "americas",
    "Trinidad and Tobago": "americas", "United States of America": "americas",
    "Uruguay": "americas", "Venezuela": "americas",
    # Small states & islands
    "American Samoa": "oceania", "Andorra": "europe", "Anguilla": "americas",
    "Antigua and Barb.": "americas", "Aruba": "americas", "Barbados": "americas",
    "Bermuda": "americas", "Br. Indian Ocean Ter.": "asia",
    "British Virgin Is.": "americas", "Cabo Verde": "africa",
    "Cayman Is.": "americas", "Comoros": "africa", "Cook Is.": "oceania",
    "Curaçao": "americas", "Dominica": "americas", "Faeroe Is.": "europe",
    "Fr. Polynesia": "oceania", "Grenada": "americas", "Guam": "oceania",
    "Guernsey": "europe", "Hong Kong": "asia", "Indian Ocean Ter.": "asia",
    "Isle of Man": "europe", "Jersey": "europe", "Kiribati": "oceania",
    "Liechtenstein": "europe", "Macao": "asia", "Maldives": "asia",
    "Malta": "europe", "Marshall Is.": "oceania", "Mauritius": "africa",
    "Micronesia": "oceania", "Monaco": "europe", "Montserrat": "americas",
    "N. Mariana Is.": "oceania", "Nauru": "oceania", "Niue": "oceania",
    "Norfolk Island": "oceania", "Palau": "oceania", "Pitcairn Is.": "oceania",
    "S. Geo. and the Is.": "americas", "Saint Helena": "africa",
    "Saint Lucia": "americas", "Samoa": "oceania", "San Marino": "europe",
    "Seychelles": "africa", "Sint Maarten": "americas",
    "St-Barthélemy": "americas", "St-Martin": "americas",
    "St. Kitts and Nevis": "americas", "St. Pierre and Miquelon": "americas",
    "St. Vin. and Gren.": "americas", "São Tomé and Principe": "africa",
    "Tonga": "oceania", "Turks and Caicos Is.": "americas",
    "U.S. Virgin Is.": "americas", "Vatican": "europe",
    "Wallis and Futuna Is.": "oceania", "Åland": "europe",
    "Singapore": "asia", "Bahrain": "asia", "Siachen Glacier": "asia",
    "Antarctica": "oceania",
    # Oceania
    "Australia": "oceania", "Fiji": "oceania", "New Caledonia": "oceania",
    "New Zealand": "oceania", "Papua New Guinea": "oceania",
    "Solomon Is.": "oceania", "Vanuatu": "oceania",
}

EXCLUDE = {"Antarctica", "Fr. S. Antarctic Lands", "Siachen Glacier",
           "Ashmore and Cartier Is.", "Heard I. and McDonald Is."}

# Manual Arabic names for entities without an ISO code in the dataset.
AR_OVERRIDE = {
    "Somaliland": "صوماليلاند",
    "N. Cyprus": "قبرص الشمالية",
    "Kosovo": "كوسوفو",
    "W. Sahara": "الصحراء الغربية",
    "Fr. S. Antarctic Lands": "الأراضي الفرنسية الجنوبية",
}


def arabic_names():
    path = os.path.join(VENDOR, "ar.json")
    if not os.path.exists(path):
        return {}
    with open(path, "r", encoding="utf-8") as fh:
        data = json.load(fh)
    return data.get("countries", {})


# ------------------------------------------------------------------- main ----


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--width", type=int, default=2160)
    ap.add_argument("--topo", default=os.path.join(VENDOR, "countries-50m.json"))
    ap.add_argument("--preview", default="/tmp/conquest-preview.png")
    args = ap.parse_args()

    topo = read_topojson(args.topo)
    arcs = decode_arcs(topo)
    geoms = topo["objects"]["countries"]["geometries"]

    lat_top, lat_bottom = 84.0, -56.0
    grid = Grid(args.width, lat_top, lat_bottom)
    print(f"grid {grid.w} x {grid.h}  ({grid.w * grid.h / 1e6:.2f}M cells, "
          f"cell={grid.dlon:.4f}deg)")

    def cell_area_km2(lat):
        return (grid.dlon * 111.32 * math.cos(math.radians(lat))) * (grid.dlat * 111.32)

    grid.cell_area_km2 = cell_area_km2

    countries = []
    for geom in geoms:
        name = geom["properties"]["name"]
        if name in EXCLUDE:
            continue
        iso = ISO.get(name, "")
        if not iso:
            iso = NUMERIC.get(str(geom.get("id", "")).zfill(3), "")
        countries.append({"name": name, "iso": iso, "geom": geom})

    cid_of = {}
    for i, c in enumerate(countries):
        c["id"] = i
        cid_of[c["name"]] = i
        c["cells"] = 0
        c["area"] = 0.0
        c["bbox"] = [1e9, 1e9, -1e9, -1e9]
        c["anchor"] = None

    # First pass: rasterise polygons.
    polys_by_cid = {}
    for c in countries:
        polys = geometry_polygons(c["geom"], arcs)
        polys_by_cid[c["id"]] = polys
        # unwrapped copy for bbox/anchors
        for poly in polys:
            spans = scanline_spans(poly, lat_top, lat_bottom, grid.dlat)
            for lat, a, b in spans:
                if b > 180.0:
                    pass
                bb = c["bbox"]
                bb[0] = min(bb[0], a)
                bb[1] = min(bb[1], lat)
                bb[2] = max(bb[2], b)
                bb[3] = max(bb[3], lat)
            for lat, a, b in spans:
                row = grid.row_of(lat)
                if row < 0 or row >= grid.h:
                    continue
                ca = int(math.ceil((a - grid.lon0) / grid.dlon - 0.5 - 1e-9))
                cb = int(math.floor((b - grid.lon0) / grid.dlon - 0.5 + 1e-9))
                if cb < ca:
                    continue
                if cb - ca >= grid.w:
                    ca, cb = 0, grid.w - 1
                for col_idx in range(ca, cb + 1):
                    col = col_idx % grid.w
                    idx = row * grid.w + col
                    prev = grid.owner[idx]
                    if prev == -1:
                        grid.owner[idx] = c["id"]
                        c["cells"] += 1
                        c["area"] += cell_area_km2(lat)
                    elif prev != c["id"]:
                        # Overlap (disputed border / raster conflict). Give the
                        # cell to the country with the smaller claimed area, so
                        # tiny nations keep a foothold on the world map.
                        pc = countries[prev]
                        if c["cells"] < pc["cells"]:
                            grid.owner[idx] = c["id"]
                            c["cells"] += 1
                            c["area"] += cell_area_km2(lat)
                            pc["cells"] -= 1
                        # else keep previous owner

    owned = sum(1 for v in grid.owner if v >= 0)
    print(f"land cells: {owned}")

    # Second pass: seed countries that lost the raster battle (tiny states).
    unowned_needed = [c for c in countries if c["cells"] == 0]
    for c in unowned_needed:
        polys = polys_by_cid[c["id"]]
        placed = False
        for poly in polys:
            for ring in poly:
                if not ring:
                    continue
                lon = sum(p[0] for p in ring) / len(ring)
                lat = sum(p[1] for p in ring) / len(ring)
                if lat < lat_bottom or lat > lat_top:
                    continue
                row = grid.row_of(lat)
                col = grid.col_of(lon)
                for dr in range(0, 4):
                    for dc in range(-3, 4):
                        r = min(max(row + dr, 0), grid.h - 1)
                        cc = (col + dc) % grid.w
                        idx = r * grid.w + cc
                        prev = grid.owner[idx]
                        if prev >= 0 and countries[prev]["cells"] > 6:
                            countries[prev]["cells"] -= 1
                        grid.owner[idx] = c["id"]
                        c["cells"] += 1
                        c["area"] += cell_area_km2(grid.row_lat(r))
                        placed = True
                        break
                    if placed:
                        break
                if placed:
                    break
            if placed:
                break
        if not placed:
            print("  !! could not place", c["name"])

    # Third pass: connectivity + real centroids from rasterised cells.
    n = grid.w * grid.h
    sums = [[0.0, 0.0, 0] for _ in countries]
    for idx, owner in enumerate(grid.owner):
        if owner < 0:
            continue
        row, col = divmod(idx, grid.w)
        s = sums[owner]
        s[0] += col + 0.5
        s[1] += row + 0.5
        s[2] += 1

    for c in countries:
        s = sums[c["id"]]
        if s[2]:
            c["cx"] = s[0] / s[2]
            c["cy"] = s[1] / s[2]
        else:
            c["cx"] = c["cy"] = 0.0

    # adjacency via 4-neighbour cell edges
    adj = [set() for _ in countries]
    w, h = grid.w, grid.h
    owner = grid.owner
    for row in range(h):
        base = row * w
        for col in range(w):
            a = owner[base + col]
            if a < 0:
                continue
            if col + 1 < w:
                b = owner[base + col + 1]
                if b >= 0 and b != a:
                    adj[a].add(b)
                    adj[b].add(a)
            if row + 1 < h:
                b = owner[base + w + col]
                if b >= 0 and b != a:
                    adj[a].add(b)
                    adj[b].add(a)

    # naval adjacency: nearest few countries that share no land border
    centroids = [(c["cx"], c["cy"]) for c in countries]
    for c in countries:
        if not c["cells"]:
            continue
        cand = []
        for d in countries:
            if d["id"] == c["id"] or not d["cells"] or d["id"] in adj[c["id"]]:
                continue
            dx = centroids[d["id"]][0] - c["cx"]
            dy = centroids[d["id"]][1] - c["cy"]
            dist = math.hypot(dx, dy)
            cand.append((dist, d["id"]))
        cand.sort()
        c["sea"] = [d for dist, d in cand[:3] if dist < 260]

    # difficulty: 1 (easy) .. 5 (hard) from relative power of neighbourhood
    for c in countries:
        if not c["cells"]:
            c["difficulty"] = 3
            continue
        neigh_area = sum(countries[d]["area"] for d in adj[c["id"]])
        ratio = neigh_area / max(c["area"], 1.0)
        if ratio < 1.5:
            d = 1
        elif ratio < 4:
            d = 2
        elif ratio < 9:
            d = 3
        elif ratio < 20:
            d = 4
        else:
            d = 5
        c["difficulty"] = d

    ar = arabic_names()

    out_countries = []
    for c in countries:
        if not c["cells"]:
            continue
        name = c["name"]
        iso = c["iso"]
        out_countries.append({
            "id": len(out_countries),
            "name": FULL_NAME.get(name, name),
            "iso": iso,
            "ar": AR_OVERRIDE.get(name) or ar.get(iso) or FULL_NAME.get(name, name),
            "x": round(c["cx"], 2),
            "y": round(c["cy"], 2),
            "cells": c["cells"],
            "area": int(c["area"]),
            "region": REGION.get(name, "asia"),
            "difficulty": c["difficulty"],
            "neighbors": [],   # filled below (ids are remapped)
            "sea": [],
        })

    # remap adjacency to the filtered id space
    old_to_new = {}
    kept = [c for c in countries if c["cells"]]
    for new_id, c in enumerate(kept):
        old_to_new[c["id"]] = new_id
    for c in out_countries:
        old = kept[c["id"]]
        c["neighbors"] = sorted(old_to_new[d] for d in adj[old["id"]] if d in old_to_new)
        c["sea"] = sorted(old_to_new[d] for d in old["sea"] if d in old_to_new)

    # owner grid remap + RLE
    remap = {old: new for old, new in old_to_new.items()}
    rle = []
    prev = -2
    run = 0
    for idx in range(n):
        o = owner[idx]
        o = remap.get(o, -1) if o >= 0 else -1
        if o == prev:
            run += 1
        else:
            if prev != -2:
                rle.append(prev)
                rle.append(run)
            prev = o
            run = 1
    rle.append(prev)
    rle.append(run)

    # encode RLE as base64 of little-endian int32 pairs
    buf = bytearray()
    for v in rle:
        buf += struct.pack("<i", v)
    packed = base64.b64encode(bytes(buf)).decode("ascii")

    data = {
        "meta": {
            "w": grid.w,
            "h": grid.h,
            "latTop": lat_top,
            "latBottom": lat_bottom,
            "dlon": grid.dlon,
            "dlat": grid.dlat,
            "lon0": -180.0,
            "landCells": sum(1 for v in owner if v >= 0),
            "source": "Natural Earth 1:50m Admin-0 (world-atlas 2.0.2)",
        },
        "countries": out_countries,
        "rle": packed,
    }

    out_dir = os.path.join(ROOT, "data")
    os.makedirs(out_dir, exist_ok=True)
    # Plain JSON is what the Node online server loads (js/core.js).
    json_path = os.path.join(out_dir, "world.json")
    with open(json_path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, separators=(",", ":"))
    print("wrote", json_path, f"{os.path.getsize(json_path) / 1024:.0f} KB")
    js_path = os.path.join(out_dir, "world-data.js")
    with open(js_path, "w", encoding="utf-8") as fh:
        fh.write("// Generated by scripts/build_world.py — do not edit by hand.\n")
        fh.write("export const WORLD = ")
        json.dump(data, fh, ensure_ascii=False, separators=(",", ":"))
        fh.write(";\n\nexport default WORLD;\n")
    print("wrote", js_path, f"{os.path.getsize(js_path) / 1024:.0f} KB")

    # ------------------------------------------------------------- preview ---
    palette = []
    for i in range(len(out_countries)):
        rnd = (i * 2654435761) & 0xFFFFFFFF
        r = 60 + (rnd & 0x7F)
        g = 70 + ((rnd >> 8) & 0x6F)
        b = 60 + ((rnd >> 16) & 0x5F)
        palette.append((int(r), int(g), int(b)))

    rows = []
    scale = max(1, grid.w // 1400)
    if scale > 1:
        for y in range(0, grid.h, scale):
            row = []
            for x in range(0, grid.w, scale):
                o = grid.owner[y * grid.w + x]
                if o < 0:
                    row += [16, 26, 40]
                else:
                    new = remap.get(o, 0)
                    cr, cg, cb = palette[new] if new < len(palette) else (120, 120, 120)
                    row += [cr, cg, cb]
            rows.append(row)
        write_png(args.preview, grid.w // scale, grid.h // scale, rows)
    else:
        for y in range(grid.h):
            row = []
            for x in range(grid.w):
                o = grid.owner[y * grid.w + x]
                if o < 0:
                    row += [16, 26, 40]
                else:
                    new = remap.get(o, 0)
                    cr, cg, cb = palette[new] if new < len(palette) else (120, 120, 120)
                    row += [cr, cg, cb]
            rows.append(row)
        write_png(args.preview, grid.w, grid.h, rows)
    print("preview ->", args.preview)

    # ------------------------------------------------------------- report ----
    top = sorted(out_countries, key=lambda c: -c["cells"])[:8]
    small = sorted(out_countries, key=lambda c: c["cells"])[:8]
    print("countries:", len(out_countries))
    print("largest:", ", ".join(f"{c['name']}={c['cells']}" for c in top))
    print("smallest:", ", ".join(f"{c['name']}={c['cells']}" for c in small))
    lonely = [c["name"] for c in out_countries if not c["neighbors"]]
    print("no land neighbours:", lonely)


if __name__ == "__main__":
    main()
