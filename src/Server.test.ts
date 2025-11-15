import { Server } from './Server';
import { Client } from './Client';

// Mock the Client class
jest.mock('./Client', () => {
    return {
        Client: jest.fn().mockImplementation(() => {
            return {
                request: jest.fn(),
                getClientToken: jest.fn().mockReturnValue('test-token'),
            };
        }),
    };
});

describe('Server', () => {
    let client: Client;
    let server: Server;

    beforeEach(() => {
        client = new Client('test-token');
        server = new Server(client, 'test-server-id');
    });

    it('should be defined', () => {
        expect(Server).toBeDefined();
    });

    it('should create a new server', () => {
        expect(server).toBeInstanceOf(Server);
    });

    it('should get the client', () => {
        expect(server.getClient()).toBe(client);
    });

    it('should set server properties from an object', () => {
        const data = {
            id: 'new-id',
            name: 'new-name',
            ip: 'new-ip',
            host: 'new-host',
            port: 12345,
            status: 'online',
            motd: 'new-motd',
            software: 'new-software',
            version: '1.0.0',
            players: 10,
            slots: 20,
            playerlist: ['player1', 'player2'],
            ram: 1024,
        };
        server.setFromObject(data);

        expect(server.id).toBe('new-id');
        expect(server.name).toBe('new-name');
        expect(server.ip).toBe('new-ip');
        expect(server.host).toBe('new-host');
        expect(server.port).toBe(12345);
        expect(server.status).toBe('online');
        expect(server.motd).toBe('new-motd');
        expect(server.software.name).toBe('new-software');
        expect(server.software.version).toBe('1.0.0');
        expect(server.players.online).toBe(10);
        expect(server.players.max).toBe(20);
        expect(server.players.playerlist).toEqual(['player1', 'player2']);
        expect(server.ram).toBe(1024);
    });

    it('should return a JSON representation of the server', () => {
        const json = server.toJSON();
        expect(json).toEqual({
            id: 'test-server-id',
            name: undefined,
            ip: undefined,
            motd: undefined,
            status: '',
            host: undefined,
            port: undefined,
            software: { name: '', version: '' },
            players: { online: 0, max: 20, playerlist: [] },
            icon: undefined,
        });
    });
});
