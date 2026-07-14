// _env.mjs — test env defaults; MUST be the first import (module init order) so config.mjs sees them.
process.env.ADMIN_TOKEN = process.env.ADMIN_TOKEN || "ADMIN";
