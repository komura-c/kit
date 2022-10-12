/// <reference types="svelte" />
/// <reference types="vite/client" />

import './ambient.js';

import { CompileOptions } from 'svelte/types/compiler/interfaces';
import {
	AdapterEntry,
	CspDirectives,
	Logger,
	MaybePromise,
	Prerendered,
	PrerenderOnErrorValue,
	RequestOptions,
	RouteDefinition,
	TrailingSlash,
	UniqueInterface
} from './private.js';
import { SSRNodeLoader, SSRRoute, ValidatedConfig } from './internal.js';
import { HttpError, Redirect } from '../src/runtime/control.js';

export { PrerenderOption } from './private.js';

export interface Adapter {
	name: string;
	adapt(builder: Builder): MaybePromise<void>;
}

type AwaitedPropertiesUnion<input extends Record<string, any> | void> = input extends void
	? undefined // needs to be undefined, because void will break intellisense
	: input extends Record<string, any>
	? {
			[key in keyof input]: Awaited<input[key]>;
	  }
	: {} extends input // handles the any case
	? input
	: unknown;

export type AwaitedProperties<input extends Record<string, any> | void> =
	AwaitedPropertiesUnion<input> extends Record<string, any>
		? OptionalUnion<AwaitedPropertiesUnion<input>>
		: AwaitedPropertiesUnion<input>;

export type AwaitedActions<T extends Record<string, (...args: any) => any>> = {
	[Key in keyof T]: OptionalUnion<UnpackValidationError<Awaited<ReturnType<T[Key]>>>>;
}[keyof T];

// Takes a union type and returns a union type where each type also has all properties
// of all possible types (typed as undefined), making accessing them more ergonomic
type OptionalUnion<
	U extends Record<string, any>, // not unknown, else interfaces don't satisfy this constraint
	A extends keyof U = U extends U ? keyof U : never
> = U extends unknown ? { [P in Exclude<A, keyof U>]?: never } & U : never;

// Needs to be here, else ActionData will be resolved to unknown - probably because of "d.ts file imports .js file" in combination with allowJs
export interface ValidationError<T extends Record<string, unknown> | undefined = undefined>
	extends UniqueInterface {
	status: number;
	data: T;
}

type UnpackValidationError<T> = T extends ValidationError<infer X>
	? X
	: T extends void
	? undefined // needs to be undefined, because void will corrupt union type
	: T;

export interface Builder {
	log: Logger;
	rimraf(dir: string): void;
	mkdirp(dir: string): void;

	config: ValidatedConfig;
	prerendered: Prerendered;

	/**
	 * Create entry points that map to individual functions
	 * @param fn A function that groups a set of routes into an entry point
	 */
	createEntries(fn: (route: RouteDefinition) => AdapterEntry): Promise<void>;

	generateManifest: (opts: { relativePath: string; format?: 'esm' | 'cjs' }) => string;

	getBuildDirectory(name: string): string;
	getClientDirectory(): string;
	getServerDirectory(): string;
	getStaticDirectory(): string;

	/**
	 * @param dest the destination folder to which files should be copied
	 * @returns an array of paths corresponding to the files that have been created by the copy
	 */
	writeClient(dest: string): string[];
	/**
	 * @param dest
	 */
	writePrerendered(
		dest: string,
		opts?: {
			fallback?: string;
		}
	): string[];
	/**
	 * @param dest the destination folder to which files should be copied
	 * @returns an array of paths corresponding to the files that have been created by the copy
	 */
	writeServer(dest: string): string[];
	/**
	 * @param from the source file or folder
	 * @param to the destination file or folder
	 * @param opts.filter a function to determine whether a file or folder should be copied
	 * @param opts.replace a map of strings to replace
	 * @returns an array of paths corresponding to the files that have been created by the copy
	 */
	copy(
		from: string,
		to: string,
		opts?: {
			filter?: (basename: string) => boolean;
			replace?: Record<string, string>;
		}
	): string[];

	/**
	 * @param {string} directory Path to the directory containing the files to be compressed
	 */
	compress(directory: string): Promise<void>;
}

export interface Config {
	compilerOptions?: CompileOptions;
	extensions?: string[];
	kit?: KitConfig;
	package?: {
		source?: string;
		dir?: string;
		emitTypes?: boolean;
		exports?: (filepath: string) => boolean;
		files?: (filepath: string) => boolean;
	};
	preprocess?: any;
	[key: string]: any;
}

export interface Cookies {
	/**
	 * 事前に `cookies.set` で設定された cookie や、またはリクエストヘッダーから cookie を取得します。
	 */
	get(name: string, opts?: import('cookie').CookieParseOptions): string | undefined;

	/**
	 * cookie を設定します。これはレスポンスに `set-cookie` ヘッダーを追加し、また、現在のリクエスト中に `cookies.get` を通じてその cookie を利用可能にします。
	 *
	 * `httpOnly` と `secure` オプションはデフォルトで `true` となっており (http://localhost の場合は例外として `secure` は `false` です)、クライアントサイドの JavaScript で cookie を読み取ったり、HTTP 上で送信したりしたい場合は、明示的に無効にする必要があります。`sameSite` オプションのデフォルトは `lax` です。
	 *
	 * デフォルトでは、cookie の `path` は 現在のパス名の 'directory' です。ほとんどの場合、cookie をアプリ全体で利用可能にするには明示的に `path: '/'` を設定する必要があります。
	 */
	set(name: string, value: string, opts?: import('cookie').CookieSerializeOptions): void;

	/**
	 * 値に空文字列(empty string)を設定したり、有効期限(expiry date)を過去に設定することで、cookie を削除します。
	 */
	delete(name: string, opts?: import('cookie').CookieSerializeOptions): void;

	/**
	 * cookie の名前と値のペアを Set-Cookie ヘッダー文字列にシリアライズします。
	 *
	 * `httpOnly` と `secure` オプションはデフォルトで `true` となっており (http://localhost の場合は例外として `secure` は `false` です)、クライアントサイドの JavaScript で cookie を読み取ったり、HTTP 上で送信したりしたい場合は、明示的に無効にする必要があります。`sameSite` オプションのデフォルトは `lax` です。
	 *
	 * デフォルトでは、cookie の `path` は 現在のパス名です。ほとんどの場合、cookie をアプリ全体で利用可能にするには明示的に `path: '/'` を設定する必要があります。
	 *
	 * @param name the name for the cookie
	 * @param value value to set the cookie to
	 * @param options object containing serialization options
	 */
	serialize(name: string, value: string, opts?: import('cookie').CookieSerializeOptions): string;
}

export interface KitConfig {
	adapter?: Adapter;
	alias?: Record<string, string>;
	appDir?: string;
	csp?: {
		mode?: 'hash' | 'nonce' | 'auto';
		directives?: CspDirectives;
		reportOnly?: CspDirectives;
	};
	csrf?: {
		checkOrigin?: boolean;
	};
	env?: {
		dir?: string;
		publicPrefix?: string;
	};
	moduleExtensions?: string[];
	files?: {
		assets?: string;
		hooks?: {
			client?: string;
			server?: string;
		};
		lib?: string;
		params?: string;
		routes?: string;
		serviceWorker?: string;
		appTemplate?: string;
		errorTemplate?: string;
	};
	inlineStyleThreshold?: number;
	outDir?: string;
	paths?: {
		assets?: string;
		base?: string;
	};
	prerender?: {
		concurrency?: number;
		crawl?: boolean;
		default?: boolean;
		enabled?: boolean;
		entries?: Array<'*' | `/${string}`>;
		onError?: PrerenderOnErrorValue;
		origin?: string;
	};
	serviceWorker?: {
		register?: boolean;
		files?: (filepath: string) => boolean;
	};
	trailingSlash?: TrailingSlash;
	version?: {
		name?: string;
		pollInterval?: number;
	};
}

export interface Handle {
	(input: {
		event: RequestEvent;
		resolve(event: RequestEvent, opts?: ResolveOptions): MaybePromise<Response>;
	}): MaybePromise<Response>;
}

export interface HandleServerError {
	(input: { error: unknown; event: RequestEvent }): void | App.Error;
}

export interface HandleClientError {
	(input: { error: unknown; event: NavigationEvent }): void | App.Error;
}

export interface HandleFetch {
	(input: { event: RequestEvent; request: Request; fetch: typeof fetch }): MaybePromise<Response>;
}

/**
 * `PageLoad` と `LayoutLoad` のジェネリックなフォームです。`Load` を直接使用するのではなく、`./$types` ([generated types](https://kit.svelte.jp/docs/types#generated-types) 参照) から
 * インポートしてください。
 */
export interface Load<
	Params extends Partial<Record<string, string>> = Partial<Record<string, string>>,
	InputData extends Record<string, unknown> | null = Record<string, any> | null,
	ParentData extends Record<string, unknown> = Record<string, any>,
	OutputData extends Record<string, unknown> | void = Record<string, any> | void
> {
	(event: LoadEvent<Params, InputData, ParentData>): MaybePromise<OutputData>;
}

export interface LoadEvent<
	Params extends Partial<Record<string, string>> = Partial<Record<string, string>>,
	Data extends Record<string, unknown> | null = Record<string, any> | null,
	ParentData extends Record<string, unknown> = Record<string, any>
> extends NavigationEvent<Params> {
	fetch: typeof fetch;
	data: Data;
	setHeaders: (headers: Record<string, string>) => void;
	parent: () => Promise<ParentData>;
	depends: (...deps: string[]) => void;
}

export interface NavigationEvent<
	Params extends Partial<Record<string, string>> = Partial<Record<string, string>>
> {
	params: Params;
	routeId: string | null;
	url: URL;
}

export interface NavigationTarget {
	params: Record<string, string> | null;
	routeId: string | null;
	url: URL;
}

export type NavigationType = 'load' | 'unload' | 'link' | 'goto' | 'popstate';

export interface Navigation {
	from: NavigationTarget | null;
	to: NavigationTarget | null;
	type: NavigationType;
	delta?: number;
}

/**
 * The shape of the `$page` store
 */
export interface Page<Params extends Record<string, string> = Record<string, string>> {
	/**
	 * The URL of the current page
	 */
	url: URL;
	/**
	 * The parameters of the current page - e.g. for a route like `/blog/[slug]`, the `slug` parameter
	 */
	params: Params;
	/**
	 * The route ID of the current page - e.g. for `src/routes/blog/[slug]`, it would be `blog/[slug]`
	 */
	routeId: string | null;
	/**
	 * Http status code of the current page
	 */
	status: number;
	/**
	 * The error object of the current page, if any. Filled from the `handleError` hooks.
	 */
	error: App.Error | null;
	/**
	 * The merged result of all data from all `load` functions on the current page. You can type a common denominator through `App.PageData`.
	 */
	data: App.PageData & Record<string, any>;
	/**
	 * Filled only after a form submission. See [form actions](https://kit.svelte.dev/docs/form-actions) for more info.
	 */
	form: any;
}

export interface ParamMatcher {
	(param: string): boolean;
}

export interface RequestEvent<
	Params extends Partial<Record<string, string>> = Partial<Record<string, string>>
> {
	cookies: Cookies;
	fetch: typeof fetch;
	getClientAddress: () => string;
	locals: App.Locals;
	params: Params;
	platform: Readonly<App.Platform>;
	request: Request;
	routeId: string | null;
	setHeaders: (headers: Record<string, string>) => void;
	url: URL;
}

/**
 * `(event: RequestEvent) => Response` という関数で、`+server.js` ファイルからエクスポートされます。HTTP verb (`GET`, `PUT`, `PATCH`, etc) に対応しており、それぞれの HTTP メソッドのリクエストを処理します。
 *
 * 1つめのジェネリックな引数(first generic argument)として `Params` を受け取りますが、代わりに [generated types](https://kit.svelte.jp/docs/types#generated-types) を使うことでこれをスキップすることができます。
 */
export interface RequestHandler<
	Params extends Partial<Record<string, string>> = Partial<Record<string, string>>
> {
	(event: RequestEvent<Params>): MaybePromise<Response>;
}

export interface ResolveOptions {
	transformPageChunk?: (input: { html: string; done: boolean }) => MaybePromise<string | undefined>;
	filterSerializedResponseHeaders?: (name: string, value: string) => boolean;
}

export class Server {
	constructor(manifest: SSRManifest);
	init(options: ServerInitOptions): Promise<void>;
	respond(request: Request, options: RequestOptions): Promise<Response>;
}

export interface ServerInitOptions {
	env: Record<string, string>;
}

export interface SSRManifest {
	appDir: string;
	assets: Set<string>;
	mimeTypes: Record<string, string>;

	/** private fields */
	_: {
		entry: {
			file: string;
			imports: string[];
			stylesheets: string[];
		};
		nodes: SSRNodeLoader[];
		routes: SSRRoute[];
		matchers: () => Promise<Record<string, ParamMatcher>>;
	};
}

/**
 * `PageServerLoad` と `LayoutServerLoad` のジェネリックなフォームです。`ServerLoad` を直接使用するのではなく、`./$types` ([generated types](https://kit.svelte.jp/docs/types#generated-types) を参照) から
 * インポートしてください。
 */
export interface ServerLoad<
	Params extends Partial<Record<string, string>> = Partial<Record<string, string>>,
	ParentData extends Record<string, any> = Record<string, any>,
	OutputData extends Record<string, any> | void = Record<string, any> | void
> {
	(event: ServerLoadEvent<Params, ParentData>): MaybePromise<OutputData>;
}

export interface ServerLoadEvent<
	Params extends Partial<Record<string, string>> = Partial<Record<string, string>>,
	ParentData extends Record<string, any> = Record<string, any>
> extends RequestEvent<Params> {
	parent: () => Promise<ParentData>;
	depends: (...deps: string[]) => void;
}

export interface Action<
	Params extends Partial<Record<string, string>> = Partial<Record<string, string>>,
	OutputData extends Record<string, any> | void = Record<string, any> | void
> {
	(event: RequestEvent<Params>): MaybePromise<OutputData>;
}

export type Actions<
	Params extends Partial<Record<string, string>> = Partial<Record<string, string>>,
	OutputData extends Record<string, any> | void = Record<string, any> | void
> = Record<string, Action<Params, OutputData>>;

/**
 * fetch を通じて form action を呼び出したとき、そのレスポンスはこれらの形となります。
 */
export type ActionResult<
	Success extends Record<string, unknown> | undefined = Record<string, any>,
	Invalid extends Record<string, unknown> | undefined = Record<string, any>
> =
	| { type: 'success'; status: number; data?: Success }
	| { type: 'invalid'; status: number; data?: Invalid }
	| { type: 'redirect'; status: number; location: string }
	| { type: 'error'; error: any };

/**
 * HTTP ステータスコードとオプションのメッセージで `HttpError` オブジェクトを作成します。
 * リクエストの処理中にこのオブジェクトがスローされると、SvelteKit は
 * `handleError` を呼ばずにエラーレスポンス(error response)を返します。
 * @param status The HTTP status code
 * @param body An object that conforms to the App.Error type. If a string is passed, it will be used as the message property.
 */
export function error(status: number, body: App.Error): HttpError;
export function error(
	status: number,
	// this overload ensures you can omit the argument or pass in a string if App.Error is of type { message: string }
	body?: { message: string } extends App.Error ? App.Error | string | undefined : never
): HttpError;

/**
 * `Redirect` オブジェクトを作成します。リクエストの処理中にスローされると、SvelteKit は
 * リダイレクトレスポンス(redirect response)を返します。
 */
export function redirect(status: number, location: string): Redirect;

/**
 * 与えられた data から JSON `Response` オブジェクトを生成します。
 */
export function json(data: any, init?: ResponseInit): Response;

/**
 * `ValidationError` オブジェクトを生成します。
 */
export function invalid<T extends Record<string, unknown> | undefined>(
	status: number,
	data?: T
): ValidationError<T>;
