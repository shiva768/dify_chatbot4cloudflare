// モックの設定
global.fetch = jest.fn();

describe('Slack Bot Tests', () => {
    let env;

    beforeEach(() => {
        // テスト用の環境変数を設定
        env = {
            SLACK_BOT_TOKEN: 'test-token',
            DIFY_API_KEY: 'test-key',
            DIFY_APP_ID: 'test-app-id',
            THREAD_LIFETIME_SEC: 86400,
            THREAD_MAP: {
                get: jest.fn(),
                put: jest.fn()
            }
        };

        // fetchのモックをリセット
        global.fetch.mockReset();
    });

    test('should ignore retry requests', async () => {
        const {default: worker} = require('./worker');
        const request = new Request('http://localhost', {
            headers: {
                'X-Slack-Retry-Num': '1'
            }
        });

        const response = await worker.fetch(request, env, {});
        expect(response.status).toBe(200);
        expect(await response.text()).toBe('Retry ignored');
    });

    test('should return default response for non-event requests', async () => {
        const {default: worker} = require('./worker');
        const request = new Request('http://localhost/');

        const response = await worker.fetch(request, env, {});
        expect(response.status).toBe(200);
        expect(await response.text()).toBe('Slack bot ready');
    });

    test('should handle event request', async () => {
        const {default: worker} = require('./worker');
        const ctx = {
            waitUntil: jest.fn()
        };

        const request = new Request('http://localhost/event', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                event: {
                    type: 'app_mention',
                    channel: 'C12345',
                    user: 'U12345',
                    text: '<@BOT_ID> こんにちは',
                    ts: '1234567890.123456'
                }
            })
        });

        const response = await worker.fetch(request, env, ctx);
        expect(response.status).toBe(200);
        expect(await response.text()).toBe('OK');
        expect(ctx.waitUntil).toHaveBeenCalled();
    });
});
