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

  address;

  motd;

  status;

  host;

  port;

  software;

  players;

  ram;

  maxram;

  #streams: { [key: string]: Stream } = {};

  #availableStreams = {
    queue: "queue",
  };

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
    this.software = $("#software").text().trim();
    this.address = $(".server-ip")
      .clone()
      .children()
      .remove()
      .end()
      .text()
      .trim();

    this.players = {
      online: parseInt($(".js-players").text().trim().split("/")[0]) || 0,
      max: parseInt($(".js-players").text().trim().split("/")[1]) || 0,
    };
    this.status = $(".statuslabel-label").text().trim();

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
        this.status = server.status;
        this.emit("status", server);
      });

      this.#websocketClient.on("queue_update", (data) => {
        this.emit("queue_update", data);
      });

      this.#websocketClient.on("event", (data) => {
        this.emit(`${data.stream}:${data.type}`, data.data);
      });
    }

    return this.#websocketClient;
  }

  subscribe(streams?: string | string[]): boolean {
    const websocketClient = this.getWebsocketClient();

    if (!websocketClient.isConnected()) {
      websocketClient.connect();
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

  setFromObject(server: Server) {
    this.id = typeof server.id !== "undefined" ? server.id : null;
    this.name = typeof server.name !== "undefined" ? server.name : null;
    this.address =
      typeof server.address !== "undefined" ? server.address : null;
    this.motd = typeof server.motd !== "undefined" ? server.motd : null;
    this.status = typeof server.status !== "undefined" ? server.status : null;
    this.host = typeof server.host !== "undefined" ? server.host : null;
    this.port = typeof server.port !== "undefined" ? server.port : null;
    this.ram = server.ram ?? null;
    this.maxram = server.maxram ?? null;

    return this;
  }

  toJSON() {
    return {
      id: this.id,

      name: this.name,

      address: this.address,

      motd: this.motd,

      status: this.status,

      host: this.host,

      port: this.port,

      software: this.software,

      players: this.players,
    };
  }
}
