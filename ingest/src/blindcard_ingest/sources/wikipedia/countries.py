"""A fighter's country from the infobox of their Wikipedia page, as a lower-case ISO code.

The page opens with a short description ("Georgian-American mixed martial artist"): its first
nationality is the best signal. The infobox is written by hand and is the fallback:
`nationality` or `citizenship` may be empty or hold several ("Armenian <br> Russian",
`{{hlist|Latvia|Canada}}`), and `birth_place` usually ends in the country. Anything not
recognised gives None and the page shows a colour instead of a flag: never a guess.

Codes are ISO 3166-1 alpha-2, plus the four home nations (gb-eng, gb-sct, gb-wls, gb-nir).
"""

from __future__ import annotations

import re

from blindcard_ingest.sources.wikipedia.markup import clean_wikitext

#: Country names (lower case) -> code.
COUNTRIES: dict[str, str] = {
    "afghanistan": "af",
    "albania": "al",
    "algeria": "dz",
    "angola": "ao",
    "argentina": "ar",
    "armenia": "am",
    "australia": "au",
    "austria": "at",
    "azerbaijan": "az",
    "bahamas": "bs",
    "bahrain": "bh",
    "bangladesh": "bd",
    "barbados": "bb",
    "belarus": "by",
    "belgium": "be",
    "benin": "bj",
    "bolivia": "bo",
    "bosnia and herzegovina": "ba",
    "bosnia": "ba",
    "botswana": "bw",
    "brazil": "br",
    "bulgaria": "bg",
    "burkina faso": "bf",
    "burundi": "bi",
    "cambodia": "kh",
    "cameroon": "cm",
    "canada": "ca",
    "cape verde": "cv",
    "chad": "td",
    "chile": "cl",
    "china": "cn",
    "colombia": "co",
    "congo": "cg",
    "costa rica": "cr",
    "croatia": "hr",
    "cuba": "cu",
    "cyprus": "cy",
    "czech republic": "cz",
    "czechia": "cz",
    "democratic republic of the congo": "cd",
    "denmark": "dk",
    "dominican republic": "do",
    "ecuador": "ec",
    "egypt": "eg",
    "el salvador": "sv",
    "england": "gb-eng",
    "estonia": "ee",
    "ethiopia": "et",
    "fiji": "fj",
    "finland": "fi",
    "france": "fr",
    "gabon": "ga",
    "georgia": "ge",
    "germany": "de",
    "ghana": "gh",
    "greece": "gr",
    "guatemala": "gt",
    "guinea": "gn",
    "guyana": "gy",
    "haiti": "ht",
    "honduras": "hn",
    "hong kong": "hk",
    "hungary": "hu",
    "iceland": "is",
    "india": "in",
    "indonesia": "id",
    "iran": "ir",
    "iraq": "iq",
    "ireland": "ie",
    "republic of ireland": "ie",
    "israel": "il",
    "italy": "it",
    "ivory coast": "ci",
    "jamaica": "jm",
    "japan": "jp",
    "jordan": "jo",
    "kazakhstan": "kz",
    "kenya": "ke",
    "kosovo": "xk",
    "kuwait": "kw",
    "kyrgyzstan": "kg",
    "laos": "la",
    "latvia": "lv",
    "lebanon": "lb",
    "liberia": "lr",
    "libya": "ly",
    "lithuania": "lt",
    "luxembourg": "lu",
    "macau": "mo",
    "macedonia": "mk",
    "north macedonia": "mk",
    "madagascar": "mg",
    "malaysia": "my",
    "mali": "ml",
    "malta": "mt",
    "mexico": "mx",
    "moldova": "md",
    "mongolia": "mn",
    "montenegro": "me",
    "morocco": "ma",
    "mozambique": "mz",
    "myanmar": "mm",
    "namibia": "na",
    "nepal": "np",
    "netherlands": "nl",
    "new zealand": "nz",
    "nicaragua": "ni",
    "nigeria": "ng",
    "northern ireland": "gb-nir",
    "norway": "no",
    "pakistan": "pk",
    "palestine": "ps",
    "panama": "pa",
    "papua new guinea": "pg",
    "paraguay": "py",
    "peru": "pe",
    "philippines": "ph",
    "poland": "pl",
    "portugal": "pt",
    "puerto rico": "pr",
    "qatar": "qa",
    "romania": "ro",
    "russia": "ru",
    "rwanda": "rw",
    "samoa": "ws",
    "saudi arabia": "sa",
    "scotland": "gb-sct",
    "senegal": "sn",
    "serbia": "rs",
    "sierra leone": "sl",
    "singapore": "sg",
    "slovakia": "sk",
    "slovenia": "si",
    "somalia": "so",
    "south africa": "za",
    "south korea": "kr",
    "korea": "kr",
    "spain": "es",
    "sri lanka": "lk",
    "sudan": "sd",
    "suriname": "sr",
    "sweden": "se",
    "switzerland": "ch",
    "syria": "sy",
    "taiwan": "tw",
    "tajikistan": "tj",
    "tanzania": "tz",
    "thailand": "th",
    "tonga": "to",
    "trinidad and tobago": "tt",
    "tunisia": "tn",
    "turkey": "tr",
    "turkmenistan": "tm",
    "uganda": "ug",
    "ukraine": "ua",
    "united arab emirates": "ae",
    "uae": "ae",
    "united kingdom": "gb",
    "uk": "gb",
    "united states": "us",
    "u.s.": "us",
    "u.s": "us",
    "us": "us",
    "usa": "us",
    "u.s.a.": "us",
    "uruguay": "uy",
    "uzbekistan": "uz",
    "venezuela": "ve",
    "vietnam": "vn",
    "wales": "gb-wls",
    "yemen": "ye",
    "zambia": "zm",
    "zimbabwe": "zw",
}

#: Words for a person from a country -> code.
DEMONYMS: dict[str, str] = {
    "afghan": "af",
    "albanian": "al",
    "algerian": "dz",
    "angolan": "ao",
    "argentine": "ar",
    "argentinian": "ar",
    "armenian": "am",
    "australian": "au",
    "austrian": "at",
    "azerbaijani": "az",
    "bahamian": "bs",
    "belarusian": "by",
    "belgian": "be",
    "bolivian": "bo",
    "bosnian": "ba",
    "brazilian": "br",
    "british": "gb",
    "bulgarian": "bg",
    "cambodian": "kh",
    "cameroonian": "cm",
    "canadian": "ca",
    "chilean": "cl",
    "chinese": "cn",
    "colombian": "co",
    "congolese": "cd",
    "costa rican": "cr",
    "croatian": "hr",
    "cuban": "cu",
    "cypriot": "cy",
    "czech": "cz",
    "danish": "dk",
    "dominican": "do",
    "dutch": "nl",
    "ecuadorian": "ec",
    "egyptian": "eg",
    "english": "gb-eng",
    "estonian": "ee",
    "ethiopian": "et",
    "fijian": "fj",
    "filipino": "ph",
    "finnish": "fi",
    "french": "fr",
    "georgian": "ge",
    "german": "de",
    "ghanaian": "gh",
    "greek": "gr",
    "guatemalan": "gt",
    "haitian": "ht",
    "honduran": "hn",
    "hungarian": "hu",
    "icelandic": "is",
    "indian": "in",
    "indonesian": "id",
    "iranian": "ir",
    "iraqi": "iq",
    "irish": "ie",
    "israeli": "il",
    "italian": "it",
    "ivorian": "ci",
    "jamaican": "jm",
    "japanese": "jp",
    "jordanian": "jo",
    "kazakh": "kz",
    "kazakhstani": "kz",
    "kenyan": "ke",
    "korean": "kr",
    "kosovan": "xk",
    "kuwaiti": "kw",
    "kyrgyz": "kg",
    "latvian": "lv",
    "lebanese": "lb",
    "liberian": "lr",
    "libyan": "ly",
    "lithuanian": "lt",
    "macedonian": "mk",
    "malaysian": "my",
    "mexican": "mx",
    "moldovan": "md",
    "mongolian": "mn",
    "montenegrin": "me",
    "moroccan": "ma",
    "namibian": "na",
    "nepalese": "np",
    "new zealander": "nz",
    "nicaraguan": "ni",
    "nigerian": "ng",
    "norwegian": "no",
    "pakistani": "pk",
    "palestinian": "ps",
    "panamanian": "pa",
    "paraguayan": "py",
    "peruvian": "pe",
    "polish": "pl",
    "portuguese": "pt",
    "puerto rican": "pr",
    "romanian": "ro",
    "russian": "ru",
    "samoan": "ws",
    "saudi": "sa",
    "scottish": "gb-sct",
    "senegalese": "sn",
    "serbian": "rs",
    "singaporean": "sg",
    "slovak": "sk",
    "slovenian": "si",
    "somali": "so",
    "south african": "za",
    "south korean": "kr",
    "spanish": "es",
    "sudanese": "sd",
    "swedish": "se",
    "swiss": "ch",
    "syrian": "sy",
    "taiwanese": "tw",
    "tajik": "tj",
    "thai": "th",
    "tongan": "to",
    "tunisian": "tn",
    "turkish": "tr",
    "turkmen": "tm",
    "ugandan": "ug",
    "ukrainian": "ua",
    "emirati": "ae",
    "american": "us",
    "uruguayan": "uy",
    "uzbek": "uz",
    "venezuelan": "ve",
    "vietnamese": "vn",
    "welsh": "gb-wls",
    "zambian": "zm",
    "zimbabwean": "zw",
}

#: US states (and DC): a birth place that ends in one of them is in the United States.
US_STATES = frozenset(
    {
        "alabama",
        "alaska",
        "arizona",
        "arkansas",
        "california",
        "colorado",
        "connecticut",
        "delaware",
        "florida",
        "hawaii",
        "idaho",
        "illinois",
        "indiana",
        "iowa",
        "kansas",
        "kentucky",
        "louisiana",
        "maine",
        "maryland",
        "massachusetts",
        "michigan",
        "minnesota",
        "mississippi",
        "missouri",
        "montana",
        "nebraska",
        "nevada",
        "new hampshire",
        "new jersey",
        "new mexico",
        "new york",
        "north carolina",
        "north dakota",
        "ohio",
        "oklahoma",
        "oregon",
        "pennsylvania",
        "rhode island",
        "south carolina",
        "south dakota",
        "tennessee",
        "texas",
        "utah",
        "vermont",
        "virginia",
        "washington",
        "west virginia",
        "wisconsin",
        "wyoming",
        "district of columbia",
    }
)


def _field(infobox: str, name: str) -> str:
    match = re.search(rf"(?im)^\|\s*{name}\s*=\s*(.*?)(?=\n\s*\||\n\}}\}}|\Z)", infobox, re.S)
    return match.group(1) if match else ""


def _infobox(wikitext: str) -> str:
    start = re.search(r"\{\{\s*Infobox\s+(?:martial artist|mixed martial arts)", wikitext, re.I)
    if not start:
        return ""
    return wikitext[start.start() : start.start() + 4000]


def country_from_phrase(phrase: str) -> str | None:
    """ "Georgian-American mixed martial artist (born 1988)" -> the first nationality, ge."""
    words = phrase.replace("-", " ").lower().split()
    for length in (2, 1):  # "south korean", "puerto rican", "new zealander" before "south"
        head = " ".join(words[:length])
        if len(words) >= length and head in DEMONYMS:
            return DEMONYMS[head]
    return None


def _from_short_description(wikitext: str) -> str | None:
    match = re.search(r"\{\{\s*short description\s*\|\s*([^}|]+)", wikitext, re.I)
    return country_from_phrase(match.group(1)) if match else None


def _flatten_lists(text: str) -> str:
    """`{{hlist|Latvia|Canada}}` / `{{ubl|a|b}}` -> "Latvia, Canada"."""
    return re.sub(
        r"\{\{\s*(?:hlist|ubl|plainlist|flatlist|unbulleted list)\s*\|([^{}]*)\}\}",
        lambda m: ", ".join(part.split("=")[-1] for part in m.group(1).split("|")),
        text,
        flags=re.I,
    )


def _from_nationality(text: str) -> str | None:
    cleaned = clean_wikitext(re.sub(r"(?i)<br\s*/?>", ", ", _flatten_lists(text))).lower()
    for part in re.split(r"[,/;&]|\band\b", cleaned):
        word = part.strip(" .")
        if word in DEMONYMS:
            return DEMONYMS[word]
        if word in COUNTRIES:
            return COUNTRIES[word]
    return None


def _from_birth_place(text: str) -> str | None:
    cleaned = clean_wikitext(re.sub(r"(?i)<br\s*/?>", ", ", text)).lower()
    parts = [p.strip(" .") for p in cleaned.split(",") if p.strip(" .")]
    if not parts:
        return None
    last = parts[-1]
    if last in COUNTRIES:
        return COUNTRIES[last]
    if last in US_STATES:
        return "us"
    return None


def country_code(wikitext: str) -> str | None:
    """The fighter's country (see the module docstring), or None when it is not clear."""
    infobox = _infobox(wikitext)
    return (
        _from_short_description(wikitext)
        or (infobox and _from_nationality(_field(infobox, "nationality")))
        or (infobox and _from_nationality(_field(infobox, "citizenship")))
        or (infobox and _from_birth_place(_field(infobox, "birth_place")))
        or None
    )
