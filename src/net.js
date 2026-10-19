// Honour HTTPS_PROXY / HTTP_PROXY / NO_PROXY for Node's built-in fetch (common with Clash/V2Ray-style local proxies).
import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";
const e = process.env;
if (e.HTTPS_PROXY || e.https_proxy || e.HTTP_PROXY || e.http_proxy || e.ALL_PROXY || e.all_proxy) setGlobalDispatcher(new EnvHttpProxyAgent());
