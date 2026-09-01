'use strict';

// Backwards-compatible deployment entry point. All security, billing, webhook,
// and static-file handlers now live in one reviewed Express application.
const app = require('./server');
const port = Number(process.env.PORT || 8080);

app.listen(port, () => console.log(`Pamet v2.0.1 listening securely on ${port}`));
