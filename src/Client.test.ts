import { Client } from './Client';

describe('Client', () => {
    it('should be defined', () => {
        expect(Client).toBeDefined();
    });

    it('should create a new client', () => {
        const client = new Client('test-token');
        expect(client).toBeInstanceOf(Client);
    });

    it('should set the client token', () => {
        const client = new Client('test-token');
        expect(client.getClientToken()).toBe('test-token');
    });

    it('should throw an error if the token is not a string', () => {
        // @ts-expect-error
        expect(() => new Client(123)).toThrow(TypeError);
    });

    describe('getServers', () => {
        let client: Client;

        beforeEach(() => {
            client = new Client('test-token');
        });

        it('should return an empty array if no servers are found', async () => {
            jest.spyOn(client, 'request').mockResolvedValue(new Response('<html><body></body></html>'));
            const servers = await client.getServers();
            expect(servers).toEqual([]);
        });

        it('should return a list of servers', async () => {
            const mockHtml = `
                <html>
                <body>
                    <div class="servercard">
                        <div class="server-name">Server 1</div>
                        <div class="server-id">#12345</div>
                        <div class="server-software-name">Vanilla</div>
                        <div class="statusplayerbadge">5/20</div>
                    </div>
                    <div class="servercard">
                        <div class="server-name">Server 2</div>
                        <div class="server-id">#67890</div>
                        <div class="server-software-name">Spigot</div>
                        <div class="statusplayerbadge">10/30</div>
                    </div>
                </body>
                </html>
            `;
            jest.spyOn(client, 'request').mockResolvedValue(new Response(mockHtml));

            const servers = await client.getServers();

            expect(servers).toEqual([
                {
                    name: 'Server 1',
                    id: '12345',
                    version: 'Vanilla',
                    players: {
                        count: 5,
                        max: 20,
                    },
                },
                {
                    name: 'Server 2',
                    id: '67890',
                    version: 'Spigot',
                    players: {
                        count: 10,
                        max: 30,
                    },
                },
            ]);
        });

        it('should handle malformed player count gracefully', async () => {
            const mockHtml = `
                <html>
                <body>
                    <div class="servercard">
                        <div class="server-name">Server 3</div>
                        <div class="server-id">#11111</div>
                        <div class="server-software-name">Forge</div>
                        <div class="statusplayerbadge">abc/def</div>
                    </div>
                </body>
                </html>
            `;
            jest.spyOn(client, 'request').mockResolvedValue(new Response(mockHtml));

            const servers = await client.getServers();

            expect(servers).toEqual([
                {
                    name: 'Server 3',
                    id: '11111',
                    version: 'Forge',
                    players: {
                        count: 0,
                        max: 0,
                    },
                },
            ]);
        });
    });
});
