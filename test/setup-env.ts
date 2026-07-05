// Provide the minimum env the config loader requires so importing modules that
// read `config` at load time works under test. These are dummy values — the
// flow-engine tests inject fake dependencies and never hit the network or DB.
process.env.NODE_ENV = 'development';
process.env.IG_APP_ID = '1002939419247195';
process.env.IG_APP_SECRET = '1f1215b284df84747180f4b1ba17dd06';
process.env.IG_ACCESS_TOKEN = 'IGAAOQKwfQwltBZAGI4MDNBaHNHci1naVZAGenNWZAUtRQUk2Wlhmd25zc2hOdnlteGxTMWIzN3J3ZAU95QnRhdVJhcjlKNHV1VUdOYUJTODk4TkxBNTZAlU0tTZAE5NVW5hRFRmbE9XVVp2ZAFNQZAElwR21kV2laelBsZAnB6QjRkRlZAhMAZDZD';
process.env.IG_BUSINESS_ACCOUNT_ID = '17841415258246985';
process.env.IG_PAGE_HANDLE = 'theautomation.hub';
process.env.IG_VERIFY_TOKEN = 'the-automation-hub-verify-token';
process.env.API_KEY = 'my-secret-api-key';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017';
process.env.MONGODB_DB = 'insta_agent_test';
process.env.LOG_LEVEL = 'silent';
