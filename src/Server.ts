import EventEmitter from "events";
import * as cheerio from "cheerio";
import { Client } from "./Client";
import { WebsocketClient } from "./WebSocket/WebsocketClient";
import { Page } from "puppeteer";
import Stream from "stream";
import { config } from "process";
import { console } from "inspector";

export class Server extends EventEmitter {
  #client: Client;

  #websocketClient;

  #cache = new Map<string, { data: any; expires: number }>();
  #cacheTTL = {
    get: 60 * 1000, // 1 minute
    getLogs: 10 * 1000, // 10 seconds
  };

  id;

  name;

  setCacheTTL(method: "get" | "getLogs", ttl: number) {
    if (this.#cacheTTL[method]) {
      this.#cacheTTL[method] = ttl;
    }
    return this;
  }

  clearCache() {
    this.#cache.clear();
    return this;
  }

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
    const cacheKey = "get";
    const cached = this.#cache.get(cacheKey);

    if (cached && cached.expires > Date.now()) {
      this.setFromObject(cached.data);
      return this;
    }

    let response = await this.#client.request(`/server/`, {
      cookies: {
        ATERNOS_SERVER: `${this.id}`,
      },
    });

    const data = await response.text();
    const $ = cheerio.load(data);
    const serverData: any = {};

    let rawName = $(".navigation-server-name").text();

    let cleanedName = rawName
      .split("\n") // separa linhas
      .map((s) => s.trim()) // remove espaços ao redor
      .filter(Boolean); // remove linhas vazias

    // Garante que não haja nomes duplicados
    cleanedName = [...new Set(cleanedName)];

    serverData.name = cleanedName.join(" ");
    serverData.software = $("#software").text().trim();
    serverData.version = $("#version").text().trim();
    serverData.ip = $(".server-ip")
      .clone()
      .children()
      .remove()
      .end()
      .text()
      .trim();

    serverData.players =
      parseInt($(".js-players").text().trim().split("/")[0]) || 0;
    serverData.slots =
      parseInt($(".js-players").text().trim().split("/")[1]) || 0;
    serverData.status = $(".statuslabel-label").text().trim();

    let iconResponse = await this.#client.request(
      `/panel/img/server-icon.php`,
      {
        cookies: {
          ATERNOS_SERVER: `${this.id}`,
        },
        responseType: "arraybuffer",
      },
    );
    const arrayBuffer = await new Response(iconResponse.body).arrayBuffer();
    serverData.icon = Buffer.from(arrayBuffer).toString("base64");

    this.setFromObject(serverData);

    this.#cache.set(cacheKey, {
      data: serverData,
      expires: Date.now() + this.#cacheTTL.get,
    });

    return this;
  }

  async getLogs() {
    const cacheKey = "getLogs";
    const cached = this.#cache.get(cacheKey);

    if (cached && cached.expires > Date.now()) {
      return cached.data;
    }

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

    this.#cache.set(cacheKey, {
      data: logs,
      expires: Date.now() + this.#cacheTTL.getLogs,
    });

    return logs;
  }

  async start(onProgress?: (message: string) => void) {
    const cluster = await this.#client.getCluster();

    return new Promise((resolve, reject) => {
      cluster.queue(async ({ page }: { page: Page }) => {
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
            },
          );

          onProgress?.("Connecting to Aternos...");
          await page.goto(`https://aternos.org/server/`, {
            waitUntil: "networkidle2",
          });

          onProgress?.("Checking server status...");
          const status = await page.$eval(".statuslabel-label", (el) =>
            el.textContent?.trim(),
          );

          if (status === "Online" || status === "Starting...") {
            const msg = `Server is already ${status}`;
            onProgress?.(msg);
            return resolve(msg);
          }

          if (status !== "Offline") {
            const err = `Server is not in a state to be started. Current status: ${status}`;
            onProgress?.(err);
            return reject(new Error(err));
          }

          try {
            onProgress?.("Confirming adblock...");
            console.log("Tentando clicar no botão de adblock...");

            await page.evaluate(() => {
              const buttons = Array.from(
                document.querySelectorAll(".btn.btn-white"),
              );
              const target = buttons.find((b) =>
                b.textContent
                  ?.trim()
                  .includes("Continue with adblocker anyway"),
              );
              if (target && target instanceof HTMLElement) {
                target.click();
              }
            });
          } catch (error) {
            // No confirmation popup or timeout
            console.log("Sem ad ou erro ao clicar no botão de adblock:", error);
          }

          try {
            onProgress?.("Starting server...");
            await page.evaluate(() => {
              const buttons = Array.from(document.querySelectorAll("#start"));
              const target = buttons.find((b) =>
                b.textContent?.trim().includes("Start"),
              );
              if (target && target instanceof HTMLElement) {
                target.click();
              }
            });
          } catch (error) {
            // No confirmation popup or timeout
            console.log("Error on Start server:", error);
          }

          onProgress?.(
            "Waiting for server to start. This could take several minutes.",
          );

          const pollInterval = setInterval(async () => {
            try {
              const queuePosition = await page.$eval(
                ".queue-position",
                (el) => el.textContent,
              );
              const queueTime = await page.$eval(
                ".queue-time",
                (el) => el.textContent,
              );
              if (queuePosition && queueTime) {
                onProgress?.(
                  `In queue. Position: ${queuePosition}, Est. time: ${queueTime}`,
                );
              }
            } catch (e) {
              // not in queue or element not found, that's fine
            }
          }, 10000);

          try {
            await page.waitForSelector("#stop", {
              visible: true,
              timeout: 600000,
            }); // 10 minutes timeout
            const msg = "Server started!";
            onProgress?.(msg);
            resolve(msg);
          } finally {
            clearInterval(pollInterval);
          }
        } catch (error) {
          const err = error instanceof Error ? error.message : String(error);
          onProgress?.(`An error occurred: ${err}`);
          reject(error);
        }
      });
    });
  }

  async stop(onProgress?: (message: string) => void) {
    const cluster = await this.#client.getCluster();

    return new Promise((resolve, reject) => {
      cluster.queue(async ({ page }: { page: Page }) => {
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
            },
          );

          onProgress?.("Connecting to Aternos...");
          await page.goto(`https://aternos.org/server/`, {
            waitUntil: "networkidle2",
          });

          try {
            onProgress?.("Confirming adblock...");
            console.log("Tentando clicar no botão de adblock...");

            await page.evaluate(() => {
              const buttons = Array.from(
                document.querySelectorAll(".btn.btn-white"),
              );
              const target = buttons.find((b) =>
                b.textContent
                  ?.trim()
                  .includes("Continue with adblocker anyway"),
              );
              if (target && target instanceof HTMLElement) {
                target.click();
              }
            });
          } catch (error) {
            // No confirmation popup or timeout
            console.log("Sem ad ou erro ao clicar no botão de adblock:", error);
          }

          try {
            onProgress?.("Stopping server...");
            await page.evaluate(() => {
              const buttons = Array.from(document.querySelectorAll("#stop"));
              const target = buttons.find((b) =>
                b.textContent?.trim().includes("Stop"),
              );
              if (target && target instanceof HTMLElement) {
                target.click();
              }
            });
          } catch (error) {
            // No confirmation popup or timeout
            console.log("Error on Stop server:", error);
          }

          onProgress?.(
            "Waiting for server to stop. This could take several minutes.",
          );

          try {
            await page.waitForSelector("#start", {
              visible: true,
              timeout: 600000,
            }); // 10 minutes timeout
            const msg = "Server stopped!";
            onProgress?.(msg);
            resolve(msg);
          } finally {
          }
        } catch (error) {
          const err = error instanceof Error ? error.message : String(error);
          onProgress?.(`An error occurred: ${err}`);
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

  subscribe(streams: string[] | string) {
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
      console.log(`Subscribing to stream: ${stream}`);
      let websocketStream = websocketClient.getStream(stream);
      if (!websocketStream) {
        console.error(`Stream não encontrado: ${stream}`);
        return false;
      }
      websocketStream.start(stream);
    }
    return true;
  }

  async disconnect(): Promise<void> {
    if (this.#websocketClient) {
      this.#websocketClient.disconnect();
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
    this.name = data.name;
    this.ip = data.ip || this.ip;
    this.host = data.host || this.host;
    this.port = data.port || this.port;
    this.status = data.status ?? this.status;
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