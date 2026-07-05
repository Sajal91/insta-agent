// Provide the minimum env the config loader requires so importing modules that
// read `config` at load time works under test. These are dummy values — the
// flow-engine tests inject fake dependencies and never hit the network or DB.
process.env.NODE_ENV = 'test';
process.env.IG_APP_ID = 'test-app-id';
process.env.IG_APP_SECRET = 'test-app-secret';
process.env.IG_ACCESS_TOKEN = 'test-access-token';
process.env.IG_BUSINESS_ACCOUNT_ID = 'bot-account-id';
process.env.IG_PAGE_HANDLE = 'testpage';
process.env.IG_VERIFY_TOKEN = 'test-verify-token';
process.env.API_KEY = 'test-api-key';
process.env.DEFAULT_CONFIRMATION_KEYWORD = 'DONE';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017';
process.env.MONGODB_DB = 'insta_agent_test';
process.env.LOG_LEVEL = 'silent';
