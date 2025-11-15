import { Stream } from './Stream';
import { WebsocketClient } from './WebsocketClient';

jest.mock('./WebsocketClient', () => {
    return {
        WebsocketClient: jest.fn().mockImplementation(() => {
            return {
                send: jest.fn(),
                isReady: jest.fn().mockReturnValue(true),
                removeStream: jest.fn(),
                on: jest.fn(),
            };
        }),
    };
});

describe('Stream', () => {
    let client: WebsocketClient;
    let stream: Stream;

    beforeEach(() => {
        client = new WebsocketClient(null as any);
        stream = new Stream(client);
        stream.name = 'test-stream';
    });

    it('should be defined', () => {
        expect(Stream).toBeDefined();
    });

    it('should create a new stream', () => {
        expect(stream).toBeInstanceOf(Stream);
    });

    it('should not be started initially', () => {
        expect(stream.isStarted()).toBe(false);
    });

    it('should start the stream', async () => {
        stream.start('test-data');
        await stream.tryToStart();
        expect(client.send).toHaveBeenCalledWith('test-stream', 'start', 'test-data');
    });

    it('should stop the stream', async () => {
        stream.start('test-data');
        await stream.tryToStart();
        stream.onMessage({ type: 'started' });
        stream.stop();
        await stream.tryToStop();
        expect(client.send).toHaveBeenCalledWith('test-stream', 'stop', null);
    });



    it('should handle the "started" message', () => {
        const emit = jest.spyOn(stream, 'emit');
        stream.onMessage({ type: 'started' });
        expect(stream.isStarted()).toBe(true);
        expect(emit).toHaveBeenCalledWith('started');
    });

    it('should handle the "stopped" message', () => {
        const emit = jest.spyOn(stream, 'emit');
        stream.onMessage({ type: 'stopped' });
        expect(stream.isStarted()).toBe(false);
        expect(emit).toHaveBeenCalledWith('stopped');
    });

    it('should handle data messages', () => {
        const emitEvent = jest.spyOn(stream, 'emitEvent');
        stream.onMessage({ type: 'data', data: 'test-data' });
        expect(emitEvent).toHaveBeenCalledWith('data', 'test-data');
    });
});
