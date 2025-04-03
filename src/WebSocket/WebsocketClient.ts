import EventEmitter from "events";
import WebSocket from "ws";
import { Client } from "../Client";
import { Server } from "../Server";
import { ConsoleStream } from "./streams/ConsoleStream";
import { Stream } from "./Stream";

export class WebsocketClient extends EventEmitter {
  protocol = "wss";
  #client: Client;
  #server: Server;
  #ws: WebSocket;
  #url: string;
  autoReconnect = true;
  reconnectTimeout = 3000;
  #reconnectInterval: NodeJS.Timeout | null = null;
  streamRetryInterval: NodeJS.Timeout | null = null;
  #connected = false;
  #shouldConnect = false;
  #ready = false;

  #streams: { [key: string]: Stream } = {};

  #availableStreams: { [key: string]: typeof Stream } = {
    console: ConsoleStream,
  };

  constructor(server: Server) {
    super();
    this.#server = server;
    this.#client = server.getClient();
    this.protocol = this.#client.protocol === "https" ? "wss" : "ws";
    this.#url = `${this.protocol}://${this.#client.host}/hermes/${
      this.#server.id
    }`;
  }

  isConnected() {
    return this.#connected;
  }

  isReady() {
    return this.#ready;
  }

  getServer() {
    return this.#server;
  }

  tryToStartStreams() {
    for (const stream of Object.keys(this.#streams)) {
      this.#streams[stream].tryToStart();
    }
  }

  connect() {
    this.#shouldConnect = true;

    const headers = {
      Host: "aternos.org",
      "User-Agent":
        "Mozilla/5.0 (X11; Linux x86_64; rv:134.0) Gecko/20100101 Firefox/134.0",
      Accept: "*/*",
      "Accept-Language": "pt-BR,pt;q=0.8,en-US;q=0.5,en;q=0.3",
      Origin: "https://aternos.org",
      "Sec-WebSocket-Version": "13",
      Cookie: `ATERNOS_SESSION=${this.#client.getClientToken()}; ATERNOS_SERVER=${
        this.#server.id
      }`,
    };

    this.#ws = new WebSocket(this.#url, {
      headers: headers,
    });

    this.#ws.on("open", this.onOpen.bind(this));
    this.#ws.on("close", this.onClose.bind(this));
    this.#ws.on("error", this.onError.bind(this));
    this.#ws.on("message", this.onMessage.bind(this));
    if (!this.streamRetryInterval) {
      this.streamRetryInterval = setInterval(
        this.tryToStartStreams.bind(this),
        15000
      );
    }
  }

  onOpen() {
    this.#connected = true;
    clearInterval(this.#reconnectInterval);
    this.emit("open");
  }

  onClose() {
    this.emit("close");
    this.#ready = false;
    if (this.autoReconnect && this.#shouldConnect) {
      this.#reconnectInterval = setInterval(
        this.connect.bind(this),
        this.reconnectTimeout
      );
    } else {
      this.#connected = false;
    }
  }

  onError(error: Error) {
    console.error("WebSocket error:", error);
    this.emit("error", error);
  }

  getStream(stream) {
    if (!this.#availableStreams[stream]) {
      return false;
    }

    if (this.#streams[stream]) {
      return this.#streams[stream];
    }

    this.#streams[stream] = new this.#availableStreams[stream](this);
    this.#streams[stream].on("event", (data) => this.emit("event", data));
    return this.#streams[stream];
  }

  onMessage(rawMessage: string) {
    try {
      const message = JSON.parse(rawMessage);

      switch (message.type) {
        case "keep-alive":
          break;
        case "ready":
          this.#ready = true;
          this.emit("ready");
          break;
        case "connected":
          this.emit("connected");
          break;
        case "disconnected":
          this.emit("disconnected");
          this.disconnect();
          break;
        case "status":
          this.#server.setFromObject(JSON.parse(message.message));
          this.emit("status", this.#server);
          break;
        case "queue_reduced":
          this.emit("queue_reduced", JSON.parse(message.message));
          break;
        default:
          if (message.stream && this.#streams[message.stream]) {
            this.#streams[message.stream].onMessage(message);
          } else {
            console.warn("Stream not found for the message:", message);
          }
      }
    } catch (e) {
      console.error("Error processing message:", e);
    }
  }

  disconnect() {
    this.#shouldConnect = false;
    if (this.#ws) {
      this.#ws.close();
    }
    this.#streams = {};
    clearInterval(this.#reconnectInterval);
    clearInterval(this.streamRetryInterval);
    this.streamRetryInterval = null;
  }

  removeStream(stream) {
    delete this.#streams[stream];
  }

  send(stream, type, data) {
    if (this.#ws.readyState !== 1 || !this.isReady()) {
      return false;
    }

    let message = { stream: stream, type: type, data };
    if (typeof data !== "undefined") {
      message.data = data;
    }
    this.#ws.send(JSON.stringify(message));
  }
}
