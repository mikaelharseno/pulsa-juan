process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.TOKEN_SECRET = process.env.TOKEN_SECRET ?? 'test-secret';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/pulsa_juan_test';
process.env.DIRECT_URL = process.env.DATABASE_URL;
process.env.UPLOAD_DRIVER = 'local';
process.env.UPLOADS_DIR = require('path').join(__dirname, '..', 'uploads-test');
process.env.FULFILLMENT_STUB = '1';
process.env.OTP_DEBUG = '1';
