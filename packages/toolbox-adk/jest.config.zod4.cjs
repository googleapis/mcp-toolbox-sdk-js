const base = require('./jest.config.json');

// Runs the unit suite against zod v4, installed alongside v3 under the `zod4`
// alias. Coverage is enforced by the default zod v3 run only.
module.exports = {
  ...base,
  moduleNameMapper: {
    ...base.moduleNameMapper,
    '^zod$': 'zod4',
  },
  collectCoverage: false,
};
