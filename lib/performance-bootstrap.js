'use strict';

const { installMysqlActivityThrottle } = require('./mysql-performance');
const { installTelemetryTransport } = require('./telemetry-transport');

installMysqlActivityThrottle();
installTelemetryTransport();
