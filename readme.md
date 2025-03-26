# unofficial Aternos Client

An application to simplify the management of Aternos servers.

## Important Notice

This is an **unofficial project**. Using this application may violate Aternos' Terms of Service and result in your account being banned. Use it at your own risk.

## About

This project is based on the [Node.js exaroton API client](https://github.com/exaroton/node-exaroton-api), which operates in a similar manner.

## Usage

### Create a client object

```typescript
import { Client } from "aternos-client";

const client = new Client(token);
```

_Remember to keep your token secret and don't add it to any private or public code repositories._

### REST API

#### List servers

```typescript
const servers = await client.getServers();

for (const server of servers) {
  console.log(`${server.name}: ${server.id}`);
}
```

#### Create a server object by ID

```typescript
const server = client.server(id);
```

#### Get server information

```typescript
await server.get();
console.log(`${server.name}: ${server.id}`);
```

#### Start/stop/restart the server

```typescript
try {
  await server.start();
  await server.stop();
  await server.restart();
} catch (e: any) {
  console.error(e.message);
}
```

#### Execute a server command

```typescript
try {
  await server.executeCommand("say Hello world!");
} catch (e: any) {
  console.error(e.message);
}
```

#### Get the server logs

```typescript
try {
  const logs = await server.getLogs();
  console.log(logs);
} catch (e: any) {
  console.error(e.message);
}
```

#### Get the server RAM

```typescript
try {
  const ram = await server.getRAM();
  console.log(`This server has ${ram} GB RAM.`);
} catch (e: any) {
  console.error(e.message);
}
```

#### Get the server MOTD

```typescript
try {
  const motd = await server.getMOTD();
  console.log(motd);
} catch (e: any) {
  console.error(e.message);
}
```

#### Set the server MOTD

```typescript
try {
  await server.setMOTD("Hello world!");
} catch (e: any) {
  console.error(e.message);
}
```

#### Player lists

##### Get a player list object

```typescript
try {
  const lists = await server.getPlayerLists();
  console.log(lists);
} catch (e: any) {
  console.error(e.message);
}
```

##### Get all player list entries

```typescript
try {
  const list = server.getPlayerList("whitelist");
  const entries = await list.getEntries();
  console.log(entries);
} catch (e: any) {
  console.error(e.message);
}
```

##### Add player list entries

```typescript
try {
  const list = server.getPlayerList("whitelist");
  await list.addEntry("Steve");
  await list.addEntries(["Steve", "Alex"]);
  console.log(await list.getEntries());
} catch (e: any) {
  console.error(e.message);
}
```

##### Delete player list entries

```typescript
try {
  const list = server.getPlayerList("whitelist");
  await list.deleteEntry("Steve");
  await list.deleteEntries(["Steve", "Alex"]);
  console.log(await list.getEntries());
} catch (e: any) {
  console.error(e.message);
}
```

#### Files

##### Get a file object

```typescript
const file = server.getFile("server.properties");
```

##### Get file information

```typescript
try {
  await file.getInfo();
  console.log(file);
} catch (e: any) {
  console.error(e.message);
}
```

##### List files in a directory

```typescript
try {
  const children = await file.getChildren();
  console.log(children);

  for (const child of children) {
    console.log(child);
  }
} catch (e: any) {
  console.error(e.message);
}
```

##### Get the content of a file / download a file

```typescript
import { createWriteStream } from "fs";

try {
  const content = await file.getContent();
  console.log(content);

  await file.download("test.txt");

  const stream = await file.downloadToStream(createWriteStream("test.txt"));
} catch (e: any) {
  console.error(e.message);
}
```

##### Change the content of a file / upload a file

```typescript
import { createReadStream } from "fs";

try {
  await file.setContent("Hello world!");

  await file.upload("test.txt");

  await file.uploadFromStream(createReadStream("test.txt"));
} catch (e: any) {
  console.error(e.message);
}
```

##### Delete a file

```typescript
try {
  await file.delete();
} catch (e: any) {
  console.error(e.message);
}
```

##### Create a directory

```typescript
try {
  await file.createAsDirectory();
} catch (e: any) {
  console.error(e.message);
}
```

#### Config files

##### Get config file options

```typescript
const options = await config.getOptions();
for (const [key, option] of options) {
  console.log(key, option.getValue());
}
```

##### Update config file options

```typescript
const options = await config.getOptions();

options.get("max-players")?.setValue(26);
options.get("pvp")?.setValue(false);

await config.save();
```

#### Websocket

##### Server status events

```typescript
server.subscribe();
server.on("status", (server) => {
  console.log(server.status);
});
```

##### Console

```typescript
server.subscribe("console");
server.on("console:line", (data) => {
  console.log(data.line);
});
```

##### Tick times

```typescript
server.subscribe("tick");
server.on("tick:tick", (data) => {
  console.log(`Tick time: ${data.averageTickTime}ms`);
  console.log(`TPS: ${data.tps}`);
});
```

##### RAM usage

```typescript
server.subscribe(["stats", "heap"]);
server.on("stats:stats", (data) => {
  console.log(data.memory.usage);
});
server.on("heap:heap", (data) => {
  console.log(data.usage);
});
```

##### Unsubscribe

```typescript
server.unsubscribe("console");
server.unsubscribe(["tick", "heap"]);
server.unsubscribe();
```

## Install the package

To use the package globally, link it using the following commands:

```bash
npm link
```

Then, link the package in your project:

```bash
npm link aternos-client
```

## Contribution

Contributions are welcome! Follow the steps below:

1. Fork the repository.
2. Create a branch for your feature:
   ```bash
   git checkout -b my-feature
   ```
3. Commit your changes:
   ```bash
   git commit -m "Add my new feature"
   ```
4. Push to the remote repository:
   ```bash
   git push origin my-feature
   ```
5. Open a Pull Request.
