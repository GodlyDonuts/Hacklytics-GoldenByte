const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function fetchCountries(year?: number) {
  const params = year ? `?year=${year}` : '';
  const res = await fetch(`${API_BASE}/api/countries${params}`);
  return res.json();
}

export async function fetchMismatch(year?: number) {
  const params = year ? `?year=${year}` : '';
  const res = await fetch(`${API_BASE}/api/mismatch${params}`);
  return res.json();
}

export async function fetchCompare(countryA: string, countryB: string) {
  const res = await fetch(`${API_BASE}/api/compare?a=${countryA}&b=${countryB}`);
  return res.json();
}

export async function fetchAsk(question: string) {
  const res = await fetch(`${API_BASE}/api/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  });
  return res.json();
}
