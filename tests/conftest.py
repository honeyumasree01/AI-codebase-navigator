import os
import sys
import types

fake_openai = types.ModuleType("openai")


class _OpenAI:
    def __init__(self, *a, **k):
        pass


fake_openai.OpenAI = _OpenAI
sys.modules.setdefault("openai", fake_openai)

fake_anthropic = types.ModuleType("anthropic")


class _Anthropic:
    def __init__(self, *a, **k):
        pass


fake_anthropic.Anthropic = _Anthropic
sys.modules.setdefault("anthropic", fake_anthropic)

os.environ.setdefault("GITHUB_TOKEN", "x")
os.environ.setdefault("ANTHROPIC_API_KEY", "x")
os.environ.setdefault("OPENAI_API_KEY", "x")
os.environ.setdefault("PINECONE_API_KEY", "x")
os.environ.setdefault("PINECONE_INDEX", "x")
os.environ.setdefault("NEO4J_URI", "bolt://localhost:7687")
os.environ.setdefault("NEO4J_USER", "neo4j")
os.environ.setdefault("NEO4J_PASSWORD", "x")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault(
    "DATABASE_URL", "postgresql+asyncpg://navigator:navigator@localhost:5432/navigator"
)
os.environ.setdefault("API_TOKEN", "test")
