import os
import tempfile

from git import Repo

from utils.config import get_settings


def clone_to_temp(github_url: str) -> str:
    tok = get_settings().github_token
    tmp = tempfile.mkdtemp()
    url = github_url.strip()
    if url.startswith("https://github.com/") and "@" not in url[8:20]:
        insert = f"x-access-token:{tok}@"
        url = url.replace("https://", f"https://{insert}", 1)
    Repo.clone_from(url, tmp, depth=1, env={**os.environ, "GIT_TERMINAL_PROMPT": "0"})
    return tmp
