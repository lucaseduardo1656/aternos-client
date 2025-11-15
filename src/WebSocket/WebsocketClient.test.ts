import { WebsocketClient } from './WebsocketClient';
import { Server } from '../Server';
import { Client } from '../Client';
import { ConsoleStream } from './streams/ConsoleStream';

jest.mock('ws');
jest.mock('../Server', () => {
    return {
        Server: jest.fn().mockImplementation((client, id) => {
            return {
                getClient: () => client,
                id: id,
            };
        }),
    };
});
jest.mock('../Client', () => {
    return {
        Client: jest.fn().mockImplementation(() => {
            return {
                protocol: 'https',
                host: 'aternos.org',
                getClientToken: jest.fn().mockReturnValue('test-token'),
            };
        }),
    };
});
jest.mock('./streams/ConsoleStream');

describe('WebsocketClient', () => {
    let client: Client;
    let server: Server;
    let websocketClient: WebsocketClient;

    beforeEach(() => {
        client = new Client('test-token');
        server = new Server(client, 'test-server-id');
        websocketClient = new WebsocketClient(server);
    });

    it('should be defined', () => {
        expect(WebsocketClient).toBeDefined();
    });

    it('should create a new websocket client', () => {
        expect(websocketClient).toBeInstanceOf(WebsocketClient);
    });

    it('should not be connected or ready initially', () => {
        expect(websocketClient.isConnected()).toBe(false);
        expect(websocketClient.isReady()).toBe(false);
    });

    it('should get the server', () => {
        expect(websocketClient.getServer()).toBe(server);
    });

    it('should get a stream', () => {
        const stream = websocketClient.getStream('console');
        expect(stream).toBeInstanceOf(ConsoleStream);
    });

    it('should cache the stream', () => {
        const stream1 = websocketClient.getStream('console');
        const stream2 = websocketClient.getStream('console');
        expect(stream1).toBe(stream2);
    });

    it('should return false for an unknown stream', () => {
        const stream = websocketClient.getStream('unknown');
        expect(stream).toBe(false);
    });
});
