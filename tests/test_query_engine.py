import pytest

pytest.importorskip("pytest_asyncio")


@pytest.mark.asyncio
async def test_find_location_mocked(monkeypatch):
    from query import engine as eng_mod

    monkeypatch.setattr(
        eng_mod,
        "query_ns",
        lambda ns, v, k, f: [
            {
                "id": "1",
                "score": 0.9,
                "metadata": {
                    "file_path": "a.py",
                    "start_line": 1,
                    "end_line": 2,
                    "function_name": "foo",
                    "language": "python",
                },
            }
        ],
    )
    monkeypatch.setattr(eng_mod, "embed_text", lambda q: [0.01] * 1536)

    def fake_claude(messages, **kwargs):
        return {
            "answer": "in foo",
            "references": [{"file": "a.py", "line": 1, "snippet": "def foo"}],
        }

    monkeypatch.setattr(eng_mod, "invoke_claude", fake_claude)

    class Dummy:
        async def close(self):
            pass

    monkeypatch.setattr(eng_mod, "Neo4jClient", lambda *a, **k: Dummy())

    e = eng_mod.QueryEngine("rid")
    try:
        out = await e.find_location("where is foo")
    finally:
        await e.close()
    assert out["answer"] == "in foo"
