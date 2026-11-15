import type { Db } from './driver';

const MIGRATIONS: string[] = [
  /* 1: initial schema */ `
  CREATE TABLE admins (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    disabled INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    last_login_at INTEGER
  ) STRICT;

  CREATE TABLE sessions (
    id_hash TEXT PRIMARY KEY,
    admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  ) STRICT;

  CREATE TABLE questions (
    id INTEGER PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('TEXT','HTML')),
    title TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL,
    image_url TEXT,
    time_limit_sec INTEGER,
    explanation TEXT,
    tags TEXT NOT NULL DEFAULT '[]',
    version INTEGER NOT NULL DEFAULT 1,
    created_by INTEGER REFERENCES admins(id) ON DELETE SET NULL,
    updated_by INTEGER REFERENCES admins(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
  ) STRICT;
  CREATE INDEX ix_questions_updated ON questions(updated_at DESC) WHERE deleted_at IS NULL;

  CREATE TABLE choices (
    id INTEGER PRIMARY KEY,
    question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    text TEXT NOT NULL,
    is_correct INTEGER NOT NULL DEFAULT 0,
    UNIQUE (question_id, position)
  ) STRICT;

  CREATE TABLE rooms (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    phase TEXT NOT NULL DEFAULT 'DRAFT',
    code TEXT,
    presenter_key TEXT,
    settings TEXT NOT NULL,
    draft_items TEXT NOT NULL DEFAULT '[]',
    current_index INTEGER NOT NULL DEFAULT -1,
    prizes_revealed INTEGER NOT NULL DEFAULT 0,
    state_version INTEGER NOT NULL DEFAULT 0,
    screen_view TEXT NOT NULL DEFAULT 'AUTO',
    base_url TEXT,
    created_by INTEGER REFERENCES admins(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    confirmed_at INTEGER,
    started_at INTEGER,
    finished_at INTEGER
  ) STRICT;
  CREATE UNIQUE INDEX ux_rooms_code_live ON rooms(code) WHERE code IS NOT NULL AND phase NOT IN ('DRAFT','ENDED');

  CREATE TABLE room_questions (
    id INTEGER PRIMARY KEY,
    room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    source_question_id INTEGER REFERENCES questions(id) ON DELETE SET NULL,
    source_version INTEGER,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    image_url TEXT,
    explanation TEXT,
    time_limit_ms INTEGER NOT NULL,
    points_multiplier REAL NOT NULL DEFAULT 1,
    started_at INTEGER,
    opens_at INTEGER,
    ends_at INTEGER,
    closed_at INTEGER,
    close_reason TEXT,
    UNIQUE (room_id, position)
  ) STRICT;

  CREATE TABLE room_question_choices (
    id INTEGER PRIMARY KEY,
    room_question_id INTEGER NOT NULL REFERENCES room_questions(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    text TEXT NOT NULL,
    is_correct INTEGER NOT NULL,
    UNIQUE (room_question_id, position)
  ) STRICT;

  CREATE TABLE participants (
    id INTEGER PRIMARY KEY,
    room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    nickname TEXT NOT NULL,
    nickname_key TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    joined_at INTEGER NOT NULL,
    last_seen_at INTEGER,
    kicked_at INTEGER,
    score INTEGER NOT NULL DEFAULT 0,
    correct_count INTEGER NOT NULL DEFAULT 0,
    correct_time_ms INTEGER NOT NULL DEFAULT 0,
    final_rank INTEGER
  ) STRICT;
  CREATE UNIQUE INDEX ux_participants_nick ON participants(room_id, nickname_key) WHERE kicked_at IS NULL;
  CREATE INDEX ix_participants_room ON participants(room_id);

  CREATE TABLE answers (
    id INTEGER PRIMARY KEY,
    room_question_id INTEGER NOT NULL REFERENCES room_questions(id) ON DELETE CASCADE,
    participant_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    choice_id INTEGER NOT NULL,
    seq INTEGER NOT NULL,
    received_at INTEGER NOT NULL,
    elapsed_ms INTEGER NOT NULL,
    is_correct INTEGER NOT NULL,
    correct_rank INTEGER,
    points INTEGER NOT NULL DEFAULT 0,
    UNIQUE (room_question_id, participant_id)
  ) STRICT;
  CREATE INDEX ix_answers_participant ON answers(participant_id);
  `,
  /* 2: roles, question visibility, owner indexes */ `
  ALTER TABLE admins ADD COLUMN role TEXT NOT NULL DEFAULT 'ADMIN' CHECK (role IN ('MAIN','ADMIN'));
  UPDATE admins SET role = 'MAIN' WHERE id = (SELECT MIN(id) FROM admins);

  ALTER TABLE questions ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0;
  UPDATE questions SET is_public = 1;
  CREATE INDEX ix_questions_owner ON questions(created_by);
  CREATE INDEX ix_rooms_owner ON rooms(created_by);
  `,
  /* 3: question groups (folder-like: a question belongs to at most one group of its own creator) */ `
  CREATE TABLE question_groups (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    created_by INTEGER REFERENCES admins(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  ) STRICT;
  CREATE UNIQUE INDEX ux_question_groups_name ON question_groups(created_by, name COLLATE NOCASE);

  ALTER TABLE questions ADD COLUMN group_id INTEGER REFERENCES question_groups(id) ON DELETE SET NULL;
  ALTER TABLE questions ADD COLUMN group_position INTEGER;
  CREATE INDEX ix_questions_group ON questions(group_id, group_position) WHERE group_id IS NOT NULL;
  `,
];

export function migrate(db: Db): void {
  const row = db.get<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  for (let i = current; i < MIGRATIONS.length; i++) {
    db.tx(() => {
      db.exec(MIGRATIONS[i]!);
      db.exec(`PRAGMA user_version = ${i + 1}`);
    });
  }
}
