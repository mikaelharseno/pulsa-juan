// Static assets (public/) are served by Cloudflare before this script runs;
// it only sees requests with no matching file. /download/<name>.apk streams the
// Android app from the private R2 bucket (too big for a static asset: 25 MiB cap).
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/download\/([\w.-]+\.apk)$/);
    if (!match || !['GET', 'HEAD'].includes(request.method)) {
      return new Response('Not found', { status: 404 });
    }
    const object = request.method === 'HEAD' ? await env.DOWNLOADS.head(match[1]) : await env.DOWNLOADS.get(match[1]);
    if (!object) return new Response('Not found', { status: 404 });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('content-type', 'application/vnd.android.package-archive');
    headers.set('content-disposition', `attachment; filename="${match[1]}"`);
    headers.set('content-length', String(object.size));
    headers.set('etag', object.httpEtag);
    // re-uploads replace the same key, so keep caches short
    headers.set('cache-control', 'public, max-age=300');
    return new Response(request.method === 'HEAD' ? null : object.body, { headers });
  },
};
