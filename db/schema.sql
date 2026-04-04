CREATE TABLE repos (
    id UUID PRIMARY KEY,
    github_url TEXT NOT NULL,
    name TEXT,
    status TEXT DEFAULT 'pending',
    error_message TEXT,
    file_count INTEGER,
    chunk_count INTEGER,
    file_tree JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE repo_files (
    repo_id UUID REFERENCES repos(id) ON DELETE CASCADE,
    path TEXT NOT NULL,
    content TEXT NOT NULL,
    PRIMARY KEY (repo_id, path)
);

CREATE TABLE query_history (
    id UUID PRIMARY KEY,
    repo_id UUID REFERENCES repos(id) ON DELETE CASCADE,
    query_type TEXT,
    question TEXT,
    answer JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);
