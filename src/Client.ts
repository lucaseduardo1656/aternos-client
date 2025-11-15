import axios, { ResponseType } from "axios";
import * as cheerio from "cheerio";
import { Server } from "./Server";
import { Cluster } from "puppeteer-cluster";
import puppeter from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import AdblockerPlugin from "puppeteer-extra-plugin-adblocker";

const puppeteer = puppeter
  .use(StealthPlugin())
  .use(AdblockerPlugin({ blockTrackers: true }));

interface CacheEntry<T> {
  data: T;
  expires: number;
}

export class Client {
  protocol = "https";

  host = "aternos.org";

  #token: string | null = null;

  #userAgent =
    "Mozilla/5.0 (X11; Linux x86_64; rv:134.0) Gecko/20100101 Firefox/134.0";

  #cache = new Map<string, CacheEntry<any>>();
  #cacheTTL: number = 5 * 60 * 1000; // 5 minutes

  #cluster: Cluster | null = null;

  get baseURL() {
    return this.protocol + "://" + this.host;
  }

  constructor(token: string) {
    this.setClientToken(token);
  }

  setCacheTTL(ttl: number) {
    this.#cacheTTL = ttl;
    return this;
  }

  clearCache() {
    this.#cache.clear();
    return this;
  }

  setClientToken(token: string) {
    if (typeof token !== "string") {
      throw new TypeError(
        "Invalid API token, expected string, but got " + typeof token,
      );
    }

    this.#token = token;

    return this;
  }

  getClientToken() {
    return this.#token;
  }

  async getServers() {
    const cacheKey = "getServers";
    const cached = this.#cache.get(cacheKey);

    if (cached && cached.expires > Date.now()) {
      return cached.data;
    }

    const response = await this.request("/servers/");
    const data = await response.text();
    const $ = cheerio.load(data);

    const servers: Array<{
      name: string;
      id: string;
      version: string;
      players: {
        count: number;
        max: number;
      };
    }> = [];

    $(".servercard").each((_, element) => {
      const name = $(element).find(".server-name").text().trim();
      const id = $(element).find(".server-id").text().trim().replace("#", "");
      const version = $(element).find(".server-software-name").text().trim();
      const playersText = $(element).find(".statusplayerbadge").text().trim();
      const [countStr, maxStr] = playersText.split("/");
      const players = {
        count: parseInt(countStr) || 0,
        max: parseInt(maxStr) || 0,
      };

      servers.push({ name, id, version, players });
    });

    this.#cache.set(cacheKey, {
      data: servers,
      expires: Date.now() + this.#cacheTTL,
    });

    return servers;
  }

  async request(
    request: string | Request,
    options: {
      headers?: Record<string, string>;
      cookies?: Record<string, string>;
      responseType?: ResponseType;
    } = {},
  ) {
    let url =
      typeof request === "string" ? this.baseURL + request : request.url;

    const defaultCookies = {
      ATERNOS_LANGUAGE: "en",
      ATERNOS_SESSION: this.#token,
    };

    const finalCookies = { ...defaultCookies, ...(options.cookies || {}) };

    const cookiesString = Object.entries(finalCookies)
      .map(([key, value]) => `${key}=${value}`)
      .join("; ");

    // Headers padrão
    const defaultHeaders = {
      "User-Agent": this.#userAgent,
    };

    const finalHeaders = {
      ...defaultHeaders,
      Cookie: cookiesString,
      ...(options.headers || {}),
    };

    const { data } = await axios.get(url, {
      headers: finalHeaders,
      responseType: options.responseType ?? null,
    });

    return new Response(data);
  }

  server(id: string) {
    return new Server(this, id);
  }

  async getCluster() {
    if (!this.#cluster) {
      this.#cluster = await Cluster.launch({
        concurrency: Cluster.CONCURRENCY_CONTEXT,
        maxConcurrency: 3,
        puppeteer: puppeteer,
        puppeteerOptions: {
          headless: false,
          args: ["--no-sandbox", "--disable-setuid-sandbox"],
        },
      });
    }
    return this.#cluster;
  }

  async disconnect() {
    if (this.#cluster) {
      await this.#cluster.idle();
      await this.#cluster.close();
      this.#cluster = null;
    }
  }
}

