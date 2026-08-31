declare module 'peerjs' {
  interface PeerJSOption {
    host?: string;
    port?: number;
    path?: string;
    key?: string;
    token?: string;
    secure?: boolean;
    config?: any;
    debug?: number;
  }

  interface DataConnection {
    open: boolean;
    on(event: string, callback: (...args: any[]) => void): void;
    send(data: any): void;
    close(): void;
  }

  class PeerClass {
    constructor(id?: string, options?: PeerJSOption);
    on(event: string, callback: (...args: any[]) => void): void;
    connect(id: string, options?: any): DataConnection;
    destroy(): void;
  }

  export default PeerClass;
  export { PeerClass as Peer };
}
