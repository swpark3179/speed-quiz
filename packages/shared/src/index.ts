export * from './errors';
export * from './nickname';
export * from './ceremony';
export * from './sanitize-policy';
export * from './scoring';
export * from './phases';
export * from './events';
export * from './schemas/question';
export * from './schemas/settings';
export * from './schemas/room';
export * from './schemas/auth';

import { z } from 'zod';
// Korean default validation messages for every schema (server and client share this module).
z.config(z.locales.ko());
