import { beforeAll } from 'vitest';
beforeAll(() => {
  process.env.SERVICENOW_INSTANCE_URL = 'https://test.service-now.com';
});
