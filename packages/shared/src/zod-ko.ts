import { z } from 'zod';

// Korean default validation messages for every schema (server and client). Imported by each schema
// module so it is only bundled where schemas are actually used (keeps zod out of the participant bundle).
z.config(z.locales.ko());
