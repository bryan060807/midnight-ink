export class ApiError extends Error {
  constructor(public status:number, message:string) { super(message); }
}

/** Local development identity. There is deliberately no production bypass. */
export function requireWorkspace(request?:Request):string {
  if (process.env.NODE_ENV === 'production') throw new ApiError(503,'Production authentication is not configured. Local demo workspaces are disabled in production.');
  if (process.env.LOCAL_DEMO_ENABLED === 'false') throw new ApiError(403,'Local demo workspace is disabled.');
  if (request) {
    const url = new URL(request.url);
    const hostHeader = request.headers.get('host');
    let host = url.hostname;
    let authority = url.host;
    try {
      if (hostHeader) {
        const parsedHost=new URL(`${url.protocol}//${hostHeader}`);
        if(parsedHost.username||parsedHost.password||parsedHost.pathname!=='/'||parsedHost.search||parsedHost.hash)throw new Error('Invalid authority.');
        host=parsedHost.hostname;
        authority=parsedHost.host;
      }
    } catch { throw new ApiError(403,'Invalid host.'); }
    // This identity has no password; it is a loopback-only development workspace.
    if (!['localhost','127.0.0.1','[::1]','::1'].includes(host)) throw new ApiError(403,'The local demo workspace is available on localhost only.');
    if (!['GET','HEAD','OPTIONS'].includes(request.method)) {
      const origin = request.headers.get('origin');
      // Next.js can expose its internal bind address in request.url. The validated
      // Host header represents the browser's origin; forwarded headers are ignored.
      if (origin && origin !== `${url.protocol}//${authority}`) throw new ApiError(403,'Cross-origin changes are not allowed.');
      if (request.headers.get('sec-fetch-site') === 'cross-site') throw new ApiError(403,'Cross-site changes are not allowed.');
    }
  }
  return 'local-demo';
}
