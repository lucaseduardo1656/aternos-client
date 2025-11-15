import { ConsoleStream } from './ConsoleStream';
import { WebsocketClient } from '../WebsocketClient';

jest.mock('../WebsocketClient', () => {
    return {
        WebsocketClient: jest.fn().mockImplementation(() => {
            return {
                send: jest.fn(),
                on: jest.fn(),
            };
        }),
    };
});

describe('ConsoleStream', () => {
    let client: WebsocketClient;
    let stream: ConsoleStream;

    beforeEach(() => {
        client = new WebsocketClient(null as any);
        stream = new ConsoleStream(client);
    });

    it('should be defined', () => {
        expect(ConsoleStream).toBeDefined();
    });

    it('should create a new console stream', () => {
        expect(stream).toBeInstanceOf(ConsoleStream);
    });

    it('should parse a line and remove ANSI codes', () => {
        const line = '[32m[12:34:56 INFO]: Test message[0m';
        const parsedLine = stream.parseLine(line);
        expect(parsedLine).toBe('[12:34:56 INFO]: Test message');
    });

    it('should send a command', () => {
        stream.sendCommand('test command');
        expect(client.send).toHaveBeenCalledWith('console', 'command', 'test command');
    });

    it('should handle a "line" data message', () => {
        const emitEvent = jest.spyOn(stream, 'emitEvent');
        const line = '[32m[12:34:56 INFO]: Test message[0m';
        stream.onDataMessage('line', { data: line });
        expect(emitEvent).toHaveBeenCalledWith('line', {
            rawLine: line,
            line: '[12:34:56 INFO]: Test message',
        });
    });
});
