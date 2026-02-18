declare module "@lydell/node-pty" {
  export type IPtyOpenOptions = {
    name?: string;
    cols?: number;
    rows?: number;
    cwd?: string;
    env?: NodeJS.ProcessEnv;
  };

  export interface IDisposable {
    dispose(): void;
  }

  export interface IExitEvent {
    exitCode: number;
    signal?: number;
  }

  export interface IPty {
    pid: number;
    write(data: string): void;
    kill(signal?: string): void;
    onData(listener: (data: string) => void): IDisposable;
    onExit(listener: (event: IExitEvent) => void): IDisposable;
  }

  export function spawn(file: string, args?: string[] | string, options?: IPtyOpenOptions): IPty;
}
