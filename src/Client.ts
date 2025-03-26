import axios from "axios";
import * as cheerio from "cheerio";
import { Server } from "./Server";

export class Client {
  protocol = "https";

  host = "aternos.org";

  #token: string | null = null;

  #userAgent =
    "Mozilla/5.0 (X11; Linux x86_64; rv:134.0) Gecko/20100101 Firefox/134.0";

  get baseURL() {
    return this.protocol + "://" + this.host;
  }

  constructor(token: string) {
    this.setClientToken(token);
  }

  setClientToken(token: string) {
    if (typeof token !== "string") {
      throw new TypeError(
        "Invalid API token, expected string, but got " + typeof token
      );
    }

    this.#token = token;

    return this;
  }

  getClientToken() {
    return this.#token;
  }

  async getServers() {
    const response = await this.request("/servers/");
    const data = await response.text();
    const $ = cheerio.load(data);

    const servers: Array<{
      name: string;
      serverId: string;
      version: string;
      players: {
        count: number;
        max: number;
      };
    }> = [];

    $(".servercard").each((_, element) => {
      const name = $(element).find(".server-name").text().trim();
      const serverId = $(element)
        .find(".server-id")
        .text()
        .trim()
        .replace("#", "");
      const version = $(element).find(".server-software-name").text().trim();
      const playersText = $(element).find(".statusplayerbadge").text().trim();
      const [countStr, maxStr] = playersText.split("/");
      const players = {
        count: parseInt(countStr) || 0,
        max: parseInt(maxStr) || 0,
      };

      servers.push({ name, serverId, version, players });
    });

    return servers;
  }

  async request(
    request: string | Request,
    options: {
      headers?: Record<string, string>;
      cookies?: Record<string, string>;
    } = {}
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
    });

    return new Response(data);
  }

  server(id) {
    return new Server(this, id);
  }
}
