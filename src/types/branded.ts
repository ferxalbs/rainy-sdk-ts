declare const __brand: unique symbol;
type Brand<T, B> = T & { readonly [__brand]: B };

export type TraceId   = Brand<string, 'TraceId'>;
export type SessionId = Brand<string, 'SessionId'>;
export type ClientId  = Brand<string, 'ClientId'>;

export const makeTraceId   = (s: string): TraceId   => s as TraceId;
export const makeSessionId = (s: string): SessionId => s as SessionId;
export const makeClientId  = (s: string): ClientId  => s as ClientId;
