import EventEmitter from "events";
import * as cheerio from "cheerio";
import { Client } from "./Client";
import { WebsocketClient } from "./WebSocket/WebsocketClient";
import { Cluster } from "puppeteer-cluster";
import { Page } from "puppeteer";
import puppeter from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import Stream from "stream";

const puppeteer = puppeter.use(StealthPlugin());

export class Server extends EventEmitter {
  #client: Client;

  #cluster: Cluster | null;

  #websocketClient;

  id;

  name;

  ip;

  host;

  port;

  status: string = "";

  motd;

  software = {
    name: "",
    version: "",
  };

  players = {
    online: 0,
    max: 20,
    playerlist: [],
  };

  ram;

  maxram;

  icon;

  constructor(client, id) {
    super();
    this.#client = client;
    this.id = id;
  }

  getClient() {
    return this.#client;
  }

  async get() {
    let response = await this.#client.request(`/server/`, {
      cookies: {
        ATERNOS_SERVER: `${this.id}`,
      },
    });

    const data = await response.text();
    const $ = cheerio.load(data);
    this.name = $(".navigation-server-name").text().trim();
    this.software.name = $("#software").text().trim();
    this.software.version = $("#version").text().trim();
    this.ip = $(".server-ip").clone().children().remove().end().text().trim();

    this.players = {
      online: parseInt($(".js-players").text().trim().split("/")[0]) || 0,
      max: parseInt($(".js-players").text().trim().split("/")[1]) || 0,
      playerlist: [],
    };

    this.status = $(".statuslabel-label").text().trim();

    let iconResponse = await this.#client.request(
      `/panel/img/server-icon.php`,
      {
        cookies: {
          ATERNOS_SERVER: `${this.id}`,
        },
        responseType: "arraybuffer",
      }
    );
    const arrayBuffer = await new Response(iconResponse.body).arrayBuffer();
    this.icon = Buffer.from(arrayBuffer).toString("base64");

    return this;
  }

  async getLogs() {
    let response = await this.#client.request(`/log/`, {
      cookies: {
        ATERNOS_SERVER: `${this.id}`,
      },
    });
    const data = await response.text();
    const $ = cheerio.load(data);

    const logs: string[] = [];

    $(".log tr").each((i, row) => {
      const logEntry = $(row).find("td:nth-child(2) span.level").text().trim();
      if (logEntry) {
        logs.push(logEntry);
      }
    });

    return logs;
  }

  async #initCluster() {
    if (!this.#cluster) {
      this.#cluster = await Cluster.launch({
        concurrency: Cluster.CONCURRENCY_CONTEXT,
        maxConcurrency: 3,
        puppeteer: puppeteer,
        puppeteerOptions: {
          headless: true,
          args: ["--no-sandbox", "--disable-setuid-sandbox"],
        },
      });
    }
  }

  async start() {
    await this.#initCluster();

    return new Promise((resolve, reject) => {
      this.#cluster?.queue(async ({ page }: { page: Page }) => {
        try {
          const browser = page.browserContext();
          await browser.setCookie(
            {
              name: "ATERNOS_LANGUAGE",
              value: "en",
              domain: "aternos.org",
              path: "/",
            },
            {
              name: "ATERNOS_SESSION",
              value: this.#client.getClientToken() || "",
              domain: "aternos.org",
              path: "/",
            },
            {
              name: "ATERNOS_SERVER",
              value: this.id,
              domain: "aternos.org",
              path: "/",
            }
          );

          await page.goto(`https://aternos.org/server/`, {
            waitUntil: "domcontentloaded",
          });

          await page.click("#start");
          await page.waitForSelector(".statuslabel", { timeout: 60000 });
          resolve("Server started!");
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  async stop() {
    await this.#initCluster();
    if (!this.#cluster) {
    }
    return new Promise((resolve, reject) => {
      this.#cluster?.queue(async ({ page }: { page: Page }) => {
        try {
          const browser = page.browserContext();
          await browser.setCookie(
            {
              name: "ATERNOS_LANGUAGE",
              value: "en",
              domain: "aternos.org",
              path: "/",
            },
            {
              name: "ATERNOS_SESSION",
              value: this.#client.getClientToken() || "",
              domain: "aternos.org",
              path: "/",
            },
            {
              name: "ATERNOS_SERVER",
              value: this.id,
              domain: "aternos.org",
              path: "/",
            }
          );

          await page.goto(`https://aternos.org/server/`, {
            waitUntil: "domcontentloaded",
          });

          await page.click("#stop");
          await page.waitForSelector(".statuslabel", { timeout: 60000 });
          resolve("Server started!");
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  getWebsocketClient(): WebsocketClient {
    if (!this.#websocketClient) {
      this.#websocketClient = new WebsocketClient(this);

      this.#websocketClient.on("status", (server) => {
        this.emit("status", server);
      });
      this.#websocketClient.on("event", (data) => {
        this.emit(`${data.stream}:${data.type}`, data.data);
      });
    }

    return this.#websocketClient;
  }

  async executeCommand(command) {
    if (this.#websocketClient && this.#websocketClient.hasStream("console")) {
      /** @type {ConsoleStream} stream **/
      let stream = this.#websocketClient.getStream("console");
      if (stream.isStarted()) {
        stream.sendCommand(command);
        return true;
      }
    }
    console.log(this.id, command);
  }

  subscribe(streams) {
    let websocketClient = this.getWebsocketClient();
    if (!websocketClient.isConnected()) {
      websocketClient.connect();
    }
    if (!streams) {
      return;
    }

    if (typeof streams === "string") {
      streams = [streams];
    }

    for (let stream of streams) {
      let websocketStream = websocketClient.getStream(stream);
      if (!websocketStream) {
        return false;
      }
      websocketStream.start();
    }
    return true;
  }

  async disconnect(): Promise<void> {
    if (this.#websocketClient) {
      this.#websocketClient.disconnect();
    }
    if (this.#cluster) {
      await this.#cluster.idle();
      await this.#cluster.close();
      this.#cluster = null;
    }
  }

  unsubscribe(streams) {
    let websocketClient = this.getWebsocketClient();
    if (!streams) {
      websocketClient.disconnect();
      return;
    }

    if (typeof streams === "string") {
      streams = [streams];
    }

    for (let stream of streams) {
      let websocketStream = websocketClient.getStream(stream);
      if (websocketStream) {
        websocketStream.stop();
      }
    }
    return true;
  }

  setFromObject(data: any) {
    this.id = data.id || this.id;
    this.name = data.name || this.name;
    this.ip = data.ip || this.ip;
    this.host = data.host || this.host;
    this.port = data.port || this.port;
    this.status = data.class ?? this.status;
    this.motd = data.motd || this.motd;
    this.software = {
      name: data.software || this.software.name,
      version: data.version || this.software.version,
    };
    this.players = {
      online: data.players || (this.players ? this.players.online : 0),
      max: data.slots || (this.players ? this.players.max : 0),
      playerlist: data.playerlist || [],
    };

    this.ram = data.ram || this.ram;

    return this;
  }

  toJSON() {
    return {
      id: this.id,

      name: this.name,

      ip: this.ip,

      motd: this.motd,

      status: this.status,

      host: this.host,

      port: this.port,

      software: this.software,

      players: this.players,

      icon: this.icon,
    };
  }
}
