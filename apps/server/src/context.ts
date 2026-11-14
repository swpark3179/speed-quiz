import type { Config } from './config';
import type { Db } from './db/driver';
import type { SessionStore } from './auth/sessions';
import type { RoomRegistry } from './game/registry';
import type { QuestionService } from './services/question-service';
import type { RoomService } from './services/room-service';
import type { ResultsService } from './services/results-service';

export interface AppContext {
  config: Config;
  db: Db;
  sessions: SessionStore;
  registry: RoomRegistry;
  questions: QuestionService;
  rooms: RoomService;
  results: ResultsService;
  backup: (reason: string) => void;
}
