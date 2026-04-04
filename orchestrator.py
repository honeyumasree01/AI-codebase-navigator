from urllib.parse import urlparse


def normalize_repo_url(url: str) -> str:
    u = url.strip()
    if ".." in u or len(u) > 380:
        raise ValueError("invalid url")
    p = urlparse(u)
    if p.scheme != "https" or p.netloc.lower() != "github.com":
        raise ValueError("only https://github.com/ URLs allowed")
    return u
