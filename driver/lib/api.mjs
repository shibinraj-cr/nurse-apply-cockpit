// Thin client for the cockpit's driver endpoints. Authenticates with the shared
// DRIVER_TOKEN (x-driver-token header) so it doesn't need an operator browser session.

export function makeApi({ cockpitUrl, driverToken }) {
  async function call(pathname, method, body) {
    const res = await fetch(cockpitUrl + pathname, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-driver-token': driverToken },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }
    if (!res.ok) {
      throw new Error(`${method} ${pathname} → ${res.status}: ${json.error || text.slice(0, 200)}`);
    }
    return json;
  }

  return {
    listCandidates: () => call('/api/driver/candidates', 'GET'),
    resolveSession: (candidateId, email) =>
      call('/api/driver/session/resolve', 'POST', { candidateId, email }),
    ingestJobs: (candidateId, jobs) =>
      call('/api/driver/jobs/ingest', 'POST', { candidateId, jobs }),
    fieldmap: (candidateId, fields) => call('/api/ai/fieldmap', 'POST', { candidateId, fields }),
  };
}
