'use strict';

// Integration assertions sometimes include `await response.text()` as a failure
// message before the same response is parsed as JSON. Keep those diagnostics
// non-destructive by reading from a clone in the test process only.
const nativeText = Response.prototype.text;
Response.prototype.text = function integrationDiagnosticText() {
  return nativeText.call(this.clone());
};
