declare module 'netlify-identity-widget' {
  namespace netlifyIdentity {
    export interface User {
      id: string;
      email: string;
      user_metadata?: {
        full_name?: string;
        avatar_url?: string;
        [key: string]: any;
      };
      app_metadata?: {
        provider?: string;
        roles?: string[];
        [key: string]: any;
      };
      token?: {
        access_token: string;
        expires_at: number;
        refresh_token: string;
        token_type: string;
      };
    }

    export interface InitOptions {
      APIUrl?: string;
      container?: string;
      locale?: string;
      logo?: boolean;
    }

    function init(options?: InitOptions): void;
    function open(tabName?: 'login' | 'signup'): void;
    function close(): void;
    function currentUser(): User | null;
    function on(event: 'init' | 'login', callback: (user: User | null) => void): void;
    function on(event: 'logout' | 'open' | 'close', callback: () => void): void;
    function on(event: 'error', callback: (err: Error) => void): void;
    function off(event: string, callback?: (...args: any[]) => void): void;
    function logout(): Promise<void> | void;
    function refresh(force?: boolean): Promise<string>;
  }

  export default netlifyIdentity;
}
